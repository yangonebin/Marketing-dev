import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { sign } from 'node:crypto';

function getPort(args = process.argv.slice(2), environment = process.env) {
  const portFlagIndex = args.findIndex(argument =>
    argument === '-p' || argument === '--port' || argument.startsWith('--port='),
  );
  const portArgument = portFlagIndex >= 0 ? args[portFlagIndex] : '';
  const flagPort = Number(
    portArgument.startsWith('--port=')
      ? portArgument.slice('--port='.length)
      : args[portFlagIndex + 1],
  );
  const environmentPort = Number(environment.PORT);

  if (Number.isInteger(flagPort) && flagPort > 0 && flagPort <= 65535) return flagPort;
  if (Number.isInteger(environmentPort) && environmentPort > 0 && environmentPort <= 65535) return environmentPort;
  return 5173;
}

const port = getPort();
const root = process.cwd();
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const campaignSheet = {
  spreadsheetId: '1IP9rWvILocygHodSTiDxc5TDKB7LNnLJJNVJFTGlXN4',
  ranges: ["'미디어믹스'!B37:D1009", "'UTM 누적(26FW~)'!F3:V26", "'UTM 누적(26FW~)'!F46:AE1018"],
};
let campaignCache = { expiresAt: 0, values: null };

const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');

async function getGoogleAccessToken(scope = 'https://www.googleapis.com/auth/spreadsheets.readonly') {
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credentialsPath) throw new Error('GOOGLE_APPLICATION_CREDENTIALS 환경변수가 설정되지 않았습니다.');

  const credentials = JSON.parse(readFileSync(credentialsPath, 'utf8'));
  const issuedAt = Math.floor(Date.now() / 1000);
  const unsignedToken = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({
    iss: credentials.client_email,
    scope,
    aud: 'https://oauth2.googleapis.com/token',
    iat: issuedAt,
    exp: issuedAt + 3600,
  })}`;
  const signature = sign('RSA-SHA256', Buffer.from(unsignedToken), credentials.private_key).toString('base64url');
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsignedToken}.${signature}`,
    }),
  });
  const tokenResult = await tokenResponse.json();
  if (!tokenResponse.ok) throw new Error(`Google OAuth 인증 실패 (${tokenResponse.status})`);
  return tokenResult.access_token;
}

async function getCampaignFilters() {
  if (campaignCache.expiresAt > Date.now()) return campaignCache.values;

  const accessToken = await getGoogleAccessToken();
  const rangeParams = campaignSheet.ranges.map(range => `ranges=${encodeURIComponent(range)}`).join('&');
  const sheetResponse = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${campaignSheet.spreadsheetId}/values:batchGet?${rangeParams}&majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const sheetResult = await sheetResponse.json();
  if (!sheetResponse.ok) throw new Error(`Google Sheets 조회 실패 (${sheetResponse.status})`);

  const [mediaMixRows = [], utmIndexRows = [], utmRows = []] = (sheetResult.valueRanges ?? []).map(item => item.values ?? []);
  const campaigns = [...new Set(mediaMixRows
    .map(row => String(row[0] ?? '').trim())
    .filter(value => value && value !== '캠페인'))];
  const mediaAdTypes = [...new Set(mediaMixRows
    .map(row => String(row[2] ?? '').trim())
    .filter(value => value && value !== 'Media - AD Type'))];
  const mapping = new Map(mediaAdTypes.map(label => [label, new Set()]));
  utmIndexRows.forEach(row => {
    const label = String(row[0] ?? '').trim();
    const mediaCode = String(row[15] ?? '').trim();
    const productCode = String(row[16] ?? '').trim();
    if (mapping.has(label) && mediaCode && productCode) mapping.get(label).add(`_${mediaCode}_${productCode}`.toUpperCase());
  });
  utmRows.forEach(row => {
    const label = String(row[0] ?? '').trim();
    const utmCampaign = String(row[25] ?? '').trim();
    const segments = utmCampaign.split('_');
    if (mapping.has(label) && segments.length >= 2) mapping.get(label).add(`_${segments.at(-2)}_${segments.at(-1)}`.toUpperCase());
  });
  const mediaFilters = Object.fromEntries([...mapping].map(([label, needles]) => [label, [...needles]]));
  const values = { campaigns, mediaAdTypes, mediaFilters };
  campaignCache = { expiresAt: Date.now() + 5 * 60 * 1000, values };
  return values;
}

async function getCampaignMediaMetrics({ campaign, business, mediaAdTypes, mediaNeedles, startDate, endDate }) {
  const accessToken = await getGoogleAccessToken('https://www.googleapis.com/auth/bigquery.readonly');
  const queryParameters = [
    { name: 'campaign', parameterType: { type: 'STRING' }, parameterValue: { value: campaign } },
    { name: 'business', parameterType: { type: 'STRING' }, parameterValue: { value: business } },
    { name: 'media_needles', parameterType: { type: 'ARRAY', arrayType: { type: 'STRING' } }, parameterValue: { arrayValues: mediaNeedles.map(value => ({ value })) } },
    { name: 'start_date', parameterType: { type: 'DATE' }, parameterValue: { value: startDate } },
    { name: 'end_date', parameterType: { type: 'DATE' }, parameterValue: { value: endDate } },
  ];
  const executeQuery = async queryText => {
    const queryResponse = await fetch('https://bigquery.googleapis.com/bigquery/v2/projects/planar-method-169102/queries', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: queryText,
        useLegacySql: false,
        location: 'asia-northeast3',
        timeoutMs: 30000,
        parameterMode: 'NAMED',
        queryParameters,
      }),
    });
    const queryResult = await queryResponse.json();
    if (!queryResponse.ok || queryResult.errors?.length) {
      throw new Error(`BigQuery 조회 실패 (${queryResponse.status}): ${queryResult.errors?.[0]?.message ?? queryResult.error?.message ?? '알 수 없는 오류'}`);
    }
    if (!queryResult.jobComplete) throw new Error('BigQuery 조회 시간이 초과되었습니다.');
    return queryResult;
  };
  const query = `WITH media_daily AS (
    SELECT
      datestamp AS metric_date,
      COALESCE(SUM(impression), 0) AS impressions,
      COALESCE(SUM(click), 0) AS clicks,
      COALESCE(SUM(CASE WHEN media = '메타' THEN video_3s_view ELSE view_count END), 0) AS views,
      COALESCE(SUM(cost), 0) AS cost
    FROM \`planar-method-169102.61217_blackyak.blackyak_media_data_view\`
    WHERE datestamp BETWEEN @start_date AND @end_date
      AND (@campaign = 'all' OR STRPOS(LOWER(campaign_name), LOWER(@campaign)) > 0)
      AND (@business = 'all' OR STRPOS(UPPER(campaign_name), @business) > 0)
      AND EXISTS (
        SELECT 1 FROM UNNEST(@media_needles) AS media_needle
        WHERE STRPOS(UPPER(COALESCE(campaign_name, '')), media_needle) > 0
      )
    GROUP BY metric_date
  ), ga_daily AS (
    SELECT
      PARSE_DATE('%Y%m%d', _TABLE_SUFFIX) AS metric_date,
      COUNTIF(event_name = 'purchase') AS purchases,
      COALESCE(SUM(IF(event_name = 'purchase', ecommerce.purchase_revenue, 0)), 0) AS revenue
    FROM \`planar-method-169102.analytics_496808362.events_*\`
    WHERE _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', @start_date) AND FORMAT_DATE('%Y%m%d', @end_date)
      AND (@campaign = 'all' OR STRPOS(LOWER(COALESCE(session_traffic_source_last_click.cross_channel_campaign.campaign_name, '')), LOWER(@campaign)) > 0)
      AND (@business = 'all' OR STRPOS(UPPER(COALESCE(session_traffic_source_last_click.cross_channel_campaign.campaign_name, '')), @business) > 0)
      AND EXISTS (
        SELECT 1 FROM UNNEST(@media_needles) AS media_needle
        WHERE STRPOS(UPPER(COALESCE(session_traffic_source_last_click.cross_channel_campaign.campaign_name, '')), media_needle) > 0
      )
    GROUP BY metric_date
  ), dates AS (
    SELECT metric_date FROM UNNEST(GENERATE_DATE_ARRAY(@start_date, @end_date)) AS metric_date
  )
  SELECT
    CAST(dates.metric_date AS STRING) AS metric_date,
    COALESCE(impressions, 0) AS impressions,
    COALESCE(clicks, 0) AS clicks,
    COALESCE(views, 0) AS views,
    COALESCE(cost, 0) AS cost,
    COALESCE(purchases, 0) AS purchases,
    COALESCE(revenue, 0) AS revenue
  FROM dates
  LEFT JOIN media_daily USING (metric_date)
  LEFT JOIN ga_daily USING (metric_date)
  ORDER BY metric_date`;
  const queryResult = await executeQuery(query);

  const trend = (queryResult.rows ?? []).map(row => {
    const values = row.f;
    const item = {
      date: values[0]?.v,
      impressions: Number(values[1]?.v ?? 0),
      clicks: Number(values[2]?.v ?? 0),
      views: Number(values[3]?.v ?? 0),
      cost: Number(values[4]?.v ?? 0),
      conversions: Number(values[5]?.v ?? 0),
      revenue: Number(values[6]?.v ?? 0),
    };
    return {
      ...item,
      cpm: item.impressions ? item.cost / item.impressions * 1000 : 0,
      ctr: item.impressions ? item.clicks / item.impressions * 100 : 0,
      cpv: item.views ? item.cost / item.views : 0,
      purchaseRate: item.clicks ? item.conversions / item.clicks * 100 : 0,
      cpo: item.conversions ? item.cost / item.conversions : 0,
      roas: item.cost ? item.revenue / item.cost * 100 : 0,
    };
  });
  const totals = trend.reduce((sum, item) => {
    ['impressions', 'clicks', 'views', 'cost', 'conversions', 'revenue'].forEach(key => { sum[key] += item[key]; });
    return sum;
  }, { impressions: 0, clicks: 0, views: 0, cost: 0, conversions: 0, revenue: 0 });
  const metrics = {
    ...totals,
    cpm: totals.impressions ? totals.cost / totals.impressions * 1000 : 0,
    ctr: totals.impressions ? totals.clicks / totals.impressions * 100 : 0,
    cpv: totals.views ? totals.cost / totals.views : 0,
    purchaseRate: totals.clicks ? totals.conversions / totals.clicks * 100 : 0,
    cpo: totals.conversions ? totals.cost / totals.conversions : 0,
    roas: totals.cost ? totals.revenue / totals.cost * 100 : 0,
  };
  const weeklyQuery = `WITH filtered AS (
    SELECT
      PARSE_DATE('%Y%m%d', _TABLE_SUFFIX) AS event_date_value,
      user_pseudo_id,
      (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS ga_session_id,
      COALESCE((SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'engagement_time_msec'), 0) AS engagement_ms,
      event_name,
      ecommerce.purchase_revenue AS purchase_revenue
    FROM \`planar-method-169102.analytics_496808362.events_*\`
    WHERE _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(@start_date, INTERVAL 7 DAY)) AND FORMAT_DATE('%Y%m%d', @end_date)
      AND (@campaign = 'all' OR STRPOS(LOWER(COALESCE(session_traffic_source_last_click.cross_channel_campaign.campaign_name, '')), LOWER(@campaign)) > 0)
      AND (@business = 'all' OR STRPOS(UPPER(COALESCE(session_traffic_source_last_click.cross_channel_campaign.campaign_name, '')), @business) > 0)
      AND EXISTS (
        SELECT 1 FROM UNNEST(@media_needles) AS media_needle
        WHERE STRPOS(UPPER(COALESCE(session_traffic_source_last_click.cross_channel_campaign.campaign_name, '')), media_needle) > 0
      )
  ), weekly AS (
    SELECT
      DATE_TRUNC(event_date_value, WEEK(MONDAY)) AS week_start,
      COUNT(DISTINCT IF(ga_session_id IS NULL, NULL, CONCAT(COALESCE(user_pseudo_id, ''), '-', CAST(ga_session_id AS STRING)))) AS sessions,
      SAFE_DIVIDE(SUM(engagement_ms), COUNT(DISTINCT IF(ga_session_id IS NULL, NULL, CONCAT(COALESCE(user_pseudo_id, ''), '-', CAST(ga_session_id AS STRING))))) / 1000 AS avg_duration,
      COUNTIF(event_name = 'scroll') AS scrolls,
      COUNT(DISTINCT user_pseudo_id) AS users,
      COUNT(DISTINCT IF(event_name IN ('first_visit', 'first_open'), user_pseudo_id, NULL)) AS new_users,
      COUNTIF(event_name = 'add_to_cart') AS carts,
      COUNTIF(event_name = 'purchase') AS purchases,
      COALESCE(SUM(IF(event_name = 'purchase', purchase_revenue, 0)), 0) AS revenue
    FROM filtered
    GROUP BY week_start
  )
  SELECT CAST(week_start AS STRING), sessions, COALESCE(avg_duration, 0), scrolls, users, new_users, carts, purchases, revenue
  FROM weekly
  ORDER BY week_start`;
  const weeklyResult = await executeQuery(weeklyQuery);
  const weeklyGa = (weeklyResult.rows ?? []).map(row => ({
    weekStart: row.f[0]?.v,
    sessions: Number(row.f[1]?.v ?? 0),
    duration: Math.round(Number(row.f[2]?.v ?? 0)),
    scrolls: Number(row.f[3]?.v ?? 0),
    users: Number(row.f[4]?.v ?? 0),
    newUsers: Number(row.f[5]?.v ?? 0),
    carts: Number(row.f[6]?.v ?? 0),
    purchases: Number(row.f[7]?.v ?? 0),
    revenue: Number(row.f[8]?.v ?? 0),
  }));
  return { metrics, trend, weeklyGa };
}

const server = createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname);
  if (pathname === '/api/campaigns') {
    try {
      const { campaigns, mediaAdTypes } = await getCampaignFilters();
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ campaigns, mediaAdTypes }));
    } catch (error) {
      console.error(`Campaign sheet error: ${error.message}`);
      response.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ error: error.message }));
    }
    return;
  }
  if (pathname === '/api/campaign-media-metrics') {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const campaign = url.searchParams.get('campaign')?.trim() || 'all';
    const requestedBusiness = url.searchParams.get('business') || 'all';
    const business = ['all', 'MKT', 'PERF'].includes(requestedBusiness) ? requestedBusiness : 'all';
    const startDate = url.searchParams.get('start');
    const endDate = url.searchParams.get('end');
    const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value ?? '');
    if (!validDate(startDate) || !validDate(endDate)) {
      response.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ error: '조회 기간이 올바르지 않습니다.' }));
      return;
    }
    try {
      const filters = await getCampaignFilters();
      const mediaAdTypes = (url.searchParams.get('media') ?? '').split(',').filter(value => filters.mediaAdTypes.includes(value));
      const mediaNeedles = [...new Set(mediaAdTypes.flatMap(value => filters.mediaFilters[value] ?? []))];
      const { metrics, trend, weeklyGa } = await getCampaignMediaMetrics({ campaign, business, mediaAdTypes, mediaNeedles, startDate, endDate });
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ campaign, business, mediaAdTypes, startDate, endDate, metrics, trend, weeklyGa }));
    } catch (error) {
      console.error(`Campaign media metrics error: ${error.message}`);
      response.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ error: error.message }));
    }
    return;
  }
  const requestedPath = pathname === '/' ? 'index.html' : pathname.slice(1);
  const filePath = normalize(join(root, requestedPath));

  if (!filePath.startsWith(root) || !existsSync(filePath) || !statSync(filePath).isFile()) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }

  response.writeHead(200, {
    'Content-Type': contentTypes[extname(filePath)] ?? 'application/octet-stream',
    'Cache-Control': 'no-cache',
  });
  createReadStream(filePath).pipe(response);
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Marketing dashboard is running at http://localhost:${port}`);
});
