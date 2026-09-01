import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { getAvailableMedia, parseHistoryRows, parseMediaMixRows, parseMediaMixTable, selectMediaMixColumns } from './campaign-filters.js';
import { extname, join, normalize } from 'node:path';
import { randomUUID, sign } from 'node:crypto';

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

function getHost(args = process.argv.slice(2)) {
  const hostArgument = args.find(argument => argument.startsWith('--host='));
  return hostArgument ? hostArgument.slice('--host='.length) : '0.0.0.0';
}

const port = getPort();
const host = getHost();
const root = process.cwd();
const creativeDataRoot = process.env.DASHBOARD_UPLOAD_DIR || join(root, '.dashboard-data');
const creativeImageRoot = join(creativeDataRoot, 'creatives');
const creativeMetadataPath = join(creativeDataRoot, 'creatives.json');
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

function readCreativeMetadata() {
  if (!existsSync(creativeMetadataPath)) return [];
  try { return JSON.parse(readFileSync(creativeMetadataPath, 'utf8')); }
  catch { return []; }
}

function saveCreativeMetadata(items) {
  mkdirSync(creativeDataRoot, { recursive: true });
  writeFileSync(creativeMetadataPath, JSON.stringify(items, null, 2), 'utf8');
}

function readJsonBody(request, maxBytes = 12 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let rejected = false;
    const chunks = [];
    request.on('data', chunk => {
      size += chunk.length;
      if (size > maxBytes) {
        if (!rejected) reject(new Error('업로드 파일이 너무 큽니다.'));
        rejected = true;
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      if (rejected) return;
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new Error('업로드 요청 형식이 올바르지 않습니다.')); }
    });
    request.on('error', reject);
  });
}

const campaignSheet = {
  spreadsheetId: '1IP9rWvILocygHodSTiDxc5TDKB7LNnLJJNVJFTGlXN4',
  ranges: ["'미디어믹스'!A:AA", "'UTM 누적(26FW~)'!F3:V26", "'UTM 누적(26FW~)'!F46:AE1018", "'히스토리'!A:Z"],
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

  const [mediaMixRows = [], utmIndexRows = [], utmRows = [], rawHistoryRows = []] = (sheetResult.valueRanges ?? []).map(item => item.values ?? []);
  const { campaigns, mediaAdTypes, filterRows } = parseMediaMixRows(mediaMixRows);
  const mediaMixTable = parseMediaMixTable(mediaMixRows);
  const historyRows = parseHistoryRows(rawHistoryRows);
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
  const values = { campaigns, mediaAdTypes, filterRows, mediaFilters, historyRows, mediaMixTable };
  campaignCache = { expiresAt: Date.now() + 5 * 60 * 1000, values };
  return values;
}

async function getCampaignMediaTable({ campaign }) {
  const filters = await getCampaignFilters();
  const mediaHistory = (filters.historyRows ?? []).filter(row => campaign === 'all' || row.campaign === campaign);
  const dateOrder = value => {
    const match = String(value).match(/(\d{1,2})월\s*(\d{1,2})일/);
    return match ? Number(match[1]) * 100 + Number(match[2]) : Number.MAX_SAFE_INTEGER;
  };
  const attributeMap = new Map();
  filters.filterRows.filter(row => campaign === 'all' || row.campaign === campaign).forEach(row => {
    const key = `${row.business}\u0000${row.campaign}\u0000${row.kpi}\u0000${row.mediaAdType}`;
    const existing = attributeMap.get(key);
    if (!existing) attributeMap.set(key, { ...row, target: { ...row.target } });
    else {
      if (dateOrder(row.operationStart) < dateOrder(existing.operationStart)) existing.operationStart = row.operationStart;
      if (dateOrder(row.operationEnd) > dateOrder(existing.operationEnd)) existing.operationEnd = row.operationEnd;
      Object.keys(existing.target).forEach(metric => { existing.target[metric] += row.target[metric]; });
    }
  });
  const attributes = [...attributeMap.values()];
  const kstParts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  const todayUtc = new Date(Date.UTC(Number(kstParts.year), Number(kstParts.month) - 1, Number(kstParts.day)));
  const yesterdayUtc = new Date(todayUtc.getTime() - 86400000);
  const isoDate = date => date.toISOString().slice(0, 10);
  const endDate = isoDate(yesterdayUtc);
  const operationIso = value => {
    const match = String(value).match(/(\d{1,2})월\s*(\d{1,2})일/);
    if (!match) return endDate;
    return `${kstParts.year}-${String(match[1]).padStart(2, '0')}-${String(match[2]).padStart(2, '0')}`;
  };
  const earliestOperationStart = attributes.map(row => operationIso(row.operationStart)).sort()[0] ?? endDate;
  const startDate = earliestOperationStart > endDate ? endDate : earliestOperationStart;
  const accessToken = await getGoogleAccessToken('https://www.googleapis.com/auth/bigquery.readonly');
  const queryParameters = [
    { name: 'campaign', parameterType: { type: 'STRING' }, parameterValue: { value: campaign } },
    { name: 'start_date', parameterType: { type: 'DATE' }, parameterValue: { value: startDate } },
    { name: 'end_date', parameterType: { type: 'DATE' }, parameterValue: { value: endDate } },
  ];
  const execute = async query => {
    const response = await fetch('https://bigquery.googleapis.com/bigquery/v2/projects/planar-method-169102/queries', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, useLegacySql: false, location: 'asia-northeast3', timeoutMs: 30000, parameterMode: 'NAMED', queryParameters }),
    });
    const result = await response.json();
    if (!response.ok || result.errors?.length) throw new Error(`BigQuery 조회 실패 (${response.status}): ${result.errors?.[0]?.message ?? result.error?.message ?? '알 수 없는 오류'}`);
    if (!result.jobComplete) throw new Error('BigQuery 조회 시간이 초과되었습니다.');
    return result.rows ?? [];
  };
  const mediaQuery = `SELECT
    CAST(datestamp AS STRING) AS metric_date,
    COALESCE(campaign_name, '') AS campaign_name,
    COALESCE(SUM(cost), 0) AS cost,
    COALESCE(SUM(impression), 0) AS impressions,
    COALESCE(SUM(click), 0) AS clicks,
    COALESCE(SUM(CASE WHEN media = '메타' THEN video_3s_view ELSE view_count END), 0) AS views,
    COALESCE(ad_creative_name, '') AS ad_name
  FROM \`planar-method-169102.61217_blackyak.blackyak_media_data_view\`
  WHERE datestamp BETWEEN @start_date AND @end_date
    AND (@campaign = 'all' OR STRPOS(LOWER(COALESCE(campaign_name, '')), LOWER(@campaign)) > 0)
  GROUP BY metric_date, campaign_name, ad_creative_name`;
  const gaQuery = `WITH session_events AS (
    SELECT
      PARSE_DATE('%Y%m%d', _TABLE_SUFFIX) AS metric_date,
      user_pseudo_id,
      (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS ga_session_id,
      session_traffic_source_last_click.cross_channel_campaign.campaign_name AS event_campaign_name,
      COALESCE(session_traffic_source_last_click.manual_campaign.term, collected_traffic_source.manual_term) AS event_term,
      event_name,
      ecommerce.purchase_revenue AS purchase_revenue
    FROM \`planar-method-169102.analytics_496808362.events_*\`
    WHERE _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', @start_date) AND FORMAT_DATE('%Y%m%d', @end_date)
  ), attributed AS (
    SELECT
      *,
      COALESCE(event_campaign_name, MAX(event_campaign_name) OVER (PARTITION BY user_pseudo_id, ga_session_id)) AS campaign_name,
      COALESCE(event_term, MAX(event_term) OVER (PARTITION BY user_pseudo_id, ga_session_id)) AS utm_term
    FROM session_events
  )
  SELECT
    CAST(metric_date AS STRING) AS metric_date,
    COALESCE(campaign_name, '') AS campaign_name,
    COALESCE(utm_term, '') AS utm_term,
    COUNTIF(event_name = 'purchase') AS purchases,
    COALESCE(SUM(IF(event_name = 'purchase', purchase_revenue, 0)), 0) AS revenue
  FROM attributed
  WHERE @campaign = 'all' OR STRPOS(COALESCE(campaign_name, ''), @campaign) > 0
  GROUP BY metric_date, campaign_name, utm_term`;
  const [mediaResult, gaResult] = await Promise.all([execute(mediaQuery), execute(gaQuery)]);
  const mediaRows = mediaResult.map(row => ({ metricDate: row.f[0]?.v, campaignName: row.f[1]?.v ?? '', cost: Number(row.f[2]?.v ?? 0), impressions: Number(row.f[3]?.v ?? 0), clicks: Number(row.f[4]?.v ?? 0), views: Number(row.f[5]?.v ?? 0), adName: row.f[6]?.v ?? '' }));
  const gaRows = gaResult.map(row => ({ metricDate: row.f[0]?.v, campaignName: row.f[1]?.v ?? '', utmTerm: row.f[2]?.v ?? '', purchases: Number(row.f[3]?.v ?? 0), revenue: Number(row.f[4]?.v ?? 0) }));
  const platformNames = { YT: 'YouTube', MT: 'Meta', NV: 'Naver', GG: 'Google', TT: 'TikTok', TV: 'TV', TS: 'Toss' };
  const matches = (label, campaignName) => (filters.mediaFilters[label] ?? []).some(needle => campaignName.toUpperCase().includes(needle));
  const rows = attributes.map(attribute => {
    const [platformCode, ...adTypeParts] = attribute.mediaAdType.split(' - ');
    const rowStartDate = operationIso(attribute.operationStart);
    const inCumulativePeriod = row => row.metricDate >= rowStartDate && row.metricDate <= endDate;
    const media = mediaRows.filter(row => inCumulativePeriod(row) && matches(attribute.mediaAdType, row.campaignName)).reduce((sum, row) => ({ cost: sum.cost + row.cost, impressions: sum.impressions + row.impressions, clicks: sum.clicks + row.clicks, views: sum.views + row.views }), { cost: 0, impressions: 0, clicks: 0, views: 0 });
    const ga = gaRows.filter(row => inCumulativePeriod(row) && matches(attribute.mediaAdType, row.campaignName)).reduce((sum, row) => ({ purchases: sum.purchases + row.purchases, revenue: sum.revenue + row.revenue }), { purchases: 0, revenue: 0 });
    const target = {
      ...attribute.target,
      cpm: attribute.target.impressions ? attribute.target.cost / attribute.target.impressions * 1000 : 0,
      cpc: attribute.target.clicks ? attribute.target.cost / attribute.target.clicks : 0,
      cpv: attribute.target.views ? attribute.target.cost / attribute.target.views : 0,
      ctr: attribute.target.impressions ? attribute.target.clicks / attribute.target.impressions * 100 : 0,
      vtr: attribute.target.impressions ? attribute.target.views / attribute.target.impressions * 100 : 0,
      cpo: attribute.target.purchases ? attribute.target.cost / attribute.target.purchases : 0,
      cvr: attribute.target.clicks ? attribute.target.purchases / attribute.target.clicks * 100 : 0,
      roas: attribute.target.cost ? attribute.target.revenue / attribute.target.cost * 100 : 0,
    };
    return {
      business: attribute.business,
      kpi: attribute.kpi,
      platform: platformNames[platformCode] ?? platformCode,
      media: adTypeParts.join(' - ') || attribute.mediaAdType,
      mediaAdType: attribute.mediaAdType,
      operationStart: attribute.operationStart,
      operationEnd: attribute.operationEnd,
      target,
      ...media,
      ...ga,
      cpm: media.impressions ? media.cost / media.impressions * 1000 : 0,
      cpc: media.clicks ? media.cost / media.clicks : 0,
      cpv: media.views ? media.cost / media.views : 0,
      ctr: media.impressions ? media.clicks / media.impressions * 100 : 0,
      vtr: media.impressions ? media.views / media.impressions * 100 : 0,
      cpo: ga.purchases ? media.cost / ga.purchases : 0,
      cvr: media.clicks ? ga.purchases / media.clicks * 100 : 0,
      roas: media.cost ? ga.revenue / media.cost * 100 : 0,
    };
  });
  const priorities = {
    business: { MKT: 0, PERF: 1 },
    kpi: { '도달': 0, '조회': 1, '트래픽': 2, '전환': 3 },
    platform: { YouTube: 0, Meta: 1, Naver: 2 },
  };
  rows.sort((a, b) => (priorities.business[a.business] ?? 99) - (priorities.business[b.business] ?? 99)
    || (priorities.kpi[a.kpi] ?? 99) - (priorities.kpi[b.kpi] ?? 99)
    || (priorities.platform[a.platform] ?? 99) - (priorities.platform[b.platform] ?? 99)
    || dateOrder(a.operationStart) - dateOrder(b.operationStart)
    || a.media.localeCompare(b.media, 'ko'));
  const inclusiveDays = (start, end) => Math.max(0, Math.floor((new Date(`${end}T00:00:00Z`) - new Date(`${start}T00:00:00Z`)) / 86400000) + 1);
  const businessProgress = ['MKT', 'PERF'].map(business => {
    const businessAttributes = attributes.filter(row => row.business === business);
    const businessRows = rows.filter(row => row.business === business);
    const operationStarts = businessAttributes.map(row => operationIso(row.operationStart)).sort();
    const operationEnds = businessAttributes.map(row => operationIso(row.operationEnd)).sort();
    const overallStart = operationStarts[0] ?? endDate;
    const overallEnd = operationEnds.at(-1) ?? endDate;
    const firstLiveDate = mediaRows
      .filter(mediaRow => mediaRow.impressions > 0 && businessAttributes.some(attribute => mediaRow.metricDate >= operationIso(attribute.operationStart) && matches(attribute.mediaAdType, mediaRow.campaignName)))
      .map(row => row.metricDate).sort()[0] ?? null;
    const elapsedEnd = endDate < overallEnd ? endDate : overallEnd;
    const totalDays = inclusiveDays(overallStart, overallEnd);
    const elapsedDays = firstLiveDate ? inclusiveDays(firstLiveDate > overallStart ? firstLiveDate : overallStart, elapsedEnd) : 0;
    const gaBusiness = gaRows.filter(row => row.metricDate >= overallStart && row.metricDate <= endDate && row.campaignName.toUpperCase().includes(business)).reduce((sum, row) => ({ purchases: sum.purchases + row.purchases, revenue: sum.revenue + row.revenue }), { purchases: 0, revenue: 0 });
    const actual = businessRows.reduce((sum, row) => ({ cost: sum.cost + row.cost, impressions: sum.impressions + row.impressions, clicks: sum.clicks + row.clicks, views: sum.views + row.views, purchases: gaBusiness.purchases, revenue: gaBusiness.revenue }), { cost: 0, impressions: 0, clicks: 0, views: 0, purchases: 0, revenue: 0 });
    const target = businessRows.reduce((sum, row) => ({ cost: sum.cost + row.target.cost, impressions: sum.impressions + row.target.impressions, clicks: sum.clicks + row.target.clicks, views: sum.views + row.target.views, purchases: sum.purchases + row.target.purchases, revenue: sum.revenue + row.target.revenue }), { cost: 0, impressions: 0, clicks: 0, views: 0, purchases: 0, revenue: 0 });
    const rates = Object.fromEntries(Object.keys(actual).map(metric => [metric, target[metric] ? actual[metric] / target[metric] * 100 : 0]));
    return { business, overallStart, overallEnd, firstLiveDate, dateProgress: totalDays ? Math.min(100, elapsedDays / totalDays * 100) : 0, actual, target, rates };
  });
  const mondayOf = value => {
    const date = new Date(`${value}T00:00:00Z`);
    const day = date.getUTCDay();
    date.setUTCDate(date.getUTCDate() - (day === 0 ? 6 : day - 1));
    return isoDate(date);
  };
  const dailyMap = new Map();
  const mediaDailyMap = new Map();
  const mediaCreativeMap = new Map();
  const dailyRow = (metricDate, business) => {
    const key = `${metricDate}\u0000${business}`;
    if (!dailyMap.has(key)) dailyMap.set(key, { metricDate, business, cost: 0, impressions: 0, clicks: 0, views: 0, purchases: 0, revenue: 0 });
    return dailyMap.get(key);
  };
  attributes.forEach(attribute => {
    const rowStartDate = operationIso(attribute.operationStart);
    const [platformCode, ...adTypeParts] = attribute.mediaAdType.split(' - ');
    const mediaDailyRow = metricDate => {
      const key = `${metricDate}\u0000${attribute.business}\u0000${attribute.kpi}\u0000${attribute.mediaAdType}`;
      if (!mediaDailyMap.has(key)) mediaDailyMap.set(key, { metricDate, business: attribute.business, kpi: attribute.kpi, platform: platformNames[platformCode] ?? platformCode, media: adTypeParts.join(' - ') || attribute.mediaAdType, mediaAdType: attribute.mediaAdType, cost: 0, impressions: 0, clicks: 0, views: 0, purchases: 0, revenue: 0 });
      return mediaDailyMap.get(key);
    };
    mediaRows.filter(row => row.metricDate >= rowStartDate && row.metricDate <= endDate && matches(attribute.mediaAdType, row.campaignName)).forEach(row => {
      const daily = dailyRow(row.metricDate, attribute.business);
      daily.cost += row.cost;
      daily.impressions += row.impressions;
      daily.clicks += row.clicks;
      daily.views += row.views;
      const mediaDaily = mediaDailyRow(row.metricDate);
      mediaDaily.cost += row.cost;
      mediaDaily.impressions += row.impressions;
      mediaDaily.clicks += row.clicks;
      mediaDaily.views += row.views;
      const creativeKey = `${attribute.business}\u0000${attribute.kpi}\u0000${attribute.mediaAdType}\u0000${row.adName || '미분류 소재'}`;
      if (!mediaCreativeMap.has(creativeKey)) mediaCreativeMap.set(creativeKey, { business: attribute.business, kpi: attribute.kpi, mediaAdType: attribute.mediaAdType, operationStart: attribute.operationStart, adName: row.adName || '미분류 소재', cost: 0, impressions: 0, clicks: 0, views: 0, purchases: 0, revenue: 0 });
      const creative = mediaCreativeMap.get(creativeKey);
      creative.cost += row.cost;
      creative.impressions += row.impressions;
      creative.clicks += row.clicks;
      creative.views += row.views;
    });
    gaRows.filter(row => row.metricDate >= rowStartDate && row.metricDate <= endDate && matches(attribute.mediaAdType, row.campaignName)).forEach(row => {
      const mediaDaily = mediaDailyRow(row.metricDate);
      mediaDaily.purchases += row.purchases;
      mediaDaily.revenue += row.revenue;
    });
  });
  businessProgress.forEach(item => {
    gaRows.filter(row => row.metricDate >= item.overallStart && row.metricDate <= endDate && row.campaignName.toUpperCase().includes(item.business)).forEach(row => {
      const daily = dailyRow(row.metricDate, item.business);
      daily.purchases += row.purchases;
      daily.revenue += row.revenue;
    });
  });
  mediaCreativeMap.forEach(creative => {
    const matchingTerm = creative.adName.split('(')[0].trim();
    if (!matchingTerm || creative.adName === '미분류 소재') return;
    gaRows.filter(row => row.metricDate >= operationIso(creative.operationStart) && row.metricDate <= endDate && matches(creative.mediaAdType, row.campaignName) && row.utmTerm.trim() === matchingTerm).forEach(row => {
      creative.purchases += row.purchases;
      creative.revenue += row.revenue;
    });
  });
  const dailyMedia = [...dailyMap.values()].filter(row => row.cost || row.impressions || row.clicks || row.views || row.purchases || row.revenue).map(row => ({
    ...row,
    cpm: row.impressions ? row.cost / row.impressions * 1000 : 0,
    cpc: row.clicks ? row.cost / row.clicks : 0,
    cpv: row.views ? row.cost / row.views : 0,
    ctr: row.impressions ? row.clicks / row.impressions * 100 : 0,
    vtr: row.impressions ? row.views / row.impressions * 100 : 0,
    cpo: row.purchases ? row.cost / row.purchases : 0,
    cvr: row.clicks ? row.purchases / row.clicks * 100 : 0,
    roas: row.cost ? row.revenue / row.cost * 100 : 0,
  })).sort((a, b) => a.metricDate.localeCompare(b.metricDate) || a.business.localeCompare(b.business));
  const mediaDaily = [...mediaDailyMap.values()].filter(row => row.cost || row.impressions || row.clicks || row.views || row.purchases || row.revenue).sort((a, b) => a.metricDate.localeCompare(b.metricDate) || a.mediaAdType.localeCompare(b.mediaAdType, 'ko'));
  const mediaCreative = [...mediaCreativeMap.values()].filter(row => row.cost || row.impressions || row.clicks || row.views).sort((a, b) => b.cost - a.cost || a.adName.localeCompare(b.adName, 'ko'));
  const weeklyMap = new Map();
  dailyMedia.forEach(row => {
    const weekStart = mondayOf(row.metricDate);
    const key = `${weekStart}\u0000${row.business}`;
    if (!weeklyMap.has(key)) weeklyMap.set(key, { weekStart, business: row.business, cost: 0, impressions: 0, clicks: 0, purchases: 0, revenue: 0 });
    const weekly = weeklyMap.get(key);
    ['cost', 'impressions', 'clicks', 'purchases', 'revenue'].forEach(metric => { weekly[metric] += row[metric]; });
  });
  const weeklyMedia = [...weeklyMap.values()].map(row => ({ ...row, ctr: row.impressions ? row.clicks / row.impressions * 100 : 0, roas: row.cost ? row.revenue / row.cost * 100 : 0 })).sort((a, b) => b.weekStart.localeCompare(a.weekStart) || a.business.localeCompare(b.business));
  const weeklyTotal = businessProgress.reduce((total, item) => {
    Object.keys(total).forEach(metric => { total[metric] += item.actual[metric]; });
    return total;
  }, { cost: 0, impressions: 0, clicks: 0, purchases: 0, revenue: 0 });
  weeklyTotal.ctr = weeklyTotal.impressions ? weeklyTotal.clicks / weeklyTotal.impressions * 100 : 0;
  weeklyTotal.roas = weeklyTotal.cost ? weeklyTotal.revenue / weeklyTotal.cost * 100 : 0;
  return { campaign, startDate, endDate, rows, businessProgress, weeklyMedia, weeklyTotal, dailyMedia, mediaDaily, mediaCreative, mediaHistory };
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
      COUNT(DISTINCT IF(
        (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') IS NULL,
        NULL,
        CONCAT(user_pseudo_id, '-', CAST((SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS STRING))
      )) AS sessions,
      COUNT(DISTINCT user_pseudo_id) AS users,
      COUNTIF(event_name = 'purchase') AS purchases,
      COALESCE(SUM(IF(event_name = 'purchase', ecommerce.purchase_revenue, 0)), 0) AS revenue
    FROM \`planar-method-169102.analytics_496808362.events_*\`
    WHERE _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', @start_date) AND FORMAT_DATE('%Y%m%d', @end_date)
      AND (@campaign = 'all' OR STRPOS(COALESCE(session_traffic_source_last_click.cross_channel_campaign.campaign_name, ''), @campaign) > 0)
      AND (@business = 'all' OR STRPOS(UPPER(COALESCE(session_traffic_source_last_click.cross_channel_campaign.campaign_name, '')), @business) > 0)
      AND EXISTS (
        SELECT 1 FROM UNNEST(@media_needles) AS media_needle
        WHERE STRPOS(UPPER(COALESCE(session_traffic_source_last_click.cross_channel_campaign.campaign_name, '')), media_needle) > 0
      )
    GROUP BY metric_date
  ), ga_totals AS (
    SELECT
      COUNT(DISTINCT IF(
        (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') IS NULL,
        NULL,
        CONCAT(user_pseudo_id, '-', CAST((SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS STRING))
      )) AS sessions,
      COUNT(DISTINCT user_pseudo_id) AS users
    FROM \`planar-method-169102.analytics_496808362.events_*\`
    WHERE _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', @start_date) AND FORMAT_DATE('%Y%m%d', @end_date)
      AND (@campaign = 'all' OR STRPOS(COALESCE(session_traffic_source_last_click.cross_channel_campaign.campaign_name, ''), @campaign) > 0)
      AND (@business = 'all' OR STRPOS(UPPER(COALESCE(session_traffic_source_last_click.cross_channel_campaign.campaign_name, '')), @business) > 0)
      AND EXISTS (
        SELECT 1 FROM UNNEST(@media_needles) AS media_needle
        WHERE STRPOS(UPPER(COALESCE(session_traffic_source_last_click.cross_channel_campaign.campaign_name, '')), media_needle) > 0
      )
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
    COALESCE(revenue, 0) AS revenue,
    COALESCE(ga_daily.sessions, 0) AS sessions,
    COALESCE(ga_daily.users, 0) AS users,
    COALESCE(ga_totals.sessions, 0) AS total_sessions,
    COALESCE(ga_totals.users, 0) AS total_users
  FROM dates
  LEFT JOIN media_daily USING (metric_date)
  LEFT JOIN ga_daily USING (metric_date)
  CROSS JOIN ga_totals
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
      sessions: Number(values[7]?.v ?? 0),
      users: Number(values[8]?.v ?? 0),
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
    sessions: Number(queryResult.rows?.[0]?.f?.[9]?.v ?? 0),
    users: Number(queryResult.rows?.[0]?.f?.[10]?.v ?? 0),
    cpm: totals.impressions ? totals.cost / totals.impressions * 1000 : 0,
    ctr: totals.impressions ? totals.clicks / totals.impressions * 100 : 0,
    cpv: totals.views ? totals.cost / totals.views : 0,
    purchaseRate: totals.clicks ? totals.conversions / totals.clicks * 100 : 0,
    cpo: totals.conversions ? totals.cost / totals.conversions : 0,
    roas: totals.cost ? totals.revenue / totals.cost * 100 : 0,
  };
  const weeklyQuery = `WITH filtered AS (
    SELECT
      DATE_TRUNC(PARSE_DATE('%Y%m%d', _TABLE_SUFFIX), WEEK(MONDAY)) AS week_start,
      CASE
        WHEN STRPOS(UPPER(COALESCE(session_traffic_source_last_click.cross_channel_campaign.campaign_name, '')), 'MKT') > 0 THEN 'MKT'
        WHEN STRPOS(UPPER(COALESCE(session_traffic_source_last_click.cross_channel_campaign.campaign_name, '')), 'PERF') > 0 THEN 'PERF'
        ELSE '기타'
      END AS business_unit,
      user_pseudo_id,
      (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS ga_session_id,
      event_timestamp,
      event_name,
      ecommerce.purchase_revenue AS purchase_revenue
    FROM \`planar-method-169102.analytics_496808362.events_*\`
    WHERE _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(DATE_TRUNC(@start_date, WEEK(MONDAY)), INTERVAL 7 DAY)) AND FORMAT_DATE('%Y%m%d', @end_date)
      AND (@campaign = 'all' OR STRPOS(COALESCE(session_traffic_source_last_click.cross_channel_campaign.campaign_name, ''), @campaign) > 0)
      AND (
        PARSE_DATE('%Y%m%d', _TABLE_SUFFIX) < DATE_TRUNC(@start_date, WEEK(MONDAY))
        OR PARSE_DATE('%Y%m%d', _TABLE_SUFFIX) >= @start_date
      )
  ), sessions AS (
    SELECT
      week_start,
      business_unit,
      user_pseudo_id,
      ga_session_id,
      SAFE_DIVIDE(MAX(event_timestamp) - MIN(event_timestamp), 1000000) AS session_duration,
      COUNTIF(event_name = 'scroll') AS scrolls,
      LOGICAL_OR(event_name IN ('first_visit', 'first_open')) AS is_new_user,
      COUNTIF(event_name = 'add_to_cart') AS carts,
      COUNTIF(event_name = 'purchase') AS purchases,
      COALESCE(SUM(IF(event_name = 'purchase', purchase_revenue, 0)), 0) AS revenue
    FROM filtered
    GROUP BY week_start, business_unit, user_pseudo_id, ga_session_id
  ), weekly AS (
    SELECT
      IF(GROUPING(business_unit) = 1, 'combined', 'business') AS view_mode,
      IF(GROUPING(business_unit) = 1, '', business_unit) AS business,
      week_start,
      COUNTIF(ga_session_id IS NOT NULL) AS sessions,
      AVG(IF(ga_session_id IS NULL, NULL, session_duration)) AS avg_duration,
      SUM(scrolls) AS scrolls,
      COUNT(DISTINCT user_pseudo_id) AS users,
      COUNT(DISTINCT IF(is_new_user, user_pseudo_id, NULL)) AS new_users,
      SUM(carts) AS carts,
      SUM(purchases) AS purchases,
      SUM(revenue) AS revenue
    FROM sessions
    GROUP BY GROUPING SETS ((week_start), (week_start, business_unit))
  )
  SELECT view_mode, business, CAST(week_start AS STRING), sessions, COALESCE(avg_duration, 0), scrolls, users, new_users, carts, purchases, revenue
  FROM weekly
  ORDER BY week_start, view_mode, business`;
  const weeklyResult = await executeQuery(weeklyQuery);
  const weeklyGa = (weeklyResult.rows ?? []).map(row => ({
    viewMode: row.f[0]?.v,
    business: row.f[1]?.v,
    weekStart: row.f[2]?.v,
    sessions: Number(row.f[3]?.v ?? 0),
    duration: Math.round(Number(row.f[4]?.v ?? 0)),
    scrolls: Number(row.f[5]?.v ?? 0),
    users: Number(row.f[6]?.v ?? 0),
    newUsers: Number(row.f[7]?.v ?? 0),
    carts: Number(row.f[8]?.v ?? 0),
    purchases: Number(row.f[9]?.v ?? 0),
    revenue: Number(row.f[10]?.v ?? 0),
  }));
  return { metrics, trend, weeklyGa };
}

async function getOverviewMetrics({ business, startDate, endDate }) {
  const accessToken = await getGoogleAccessToken('https://www.googleapis.com/auth/bigquery.readonly');
  const queryParameters = [
    { name: 'business', parameterType: { type: 'STRING' }, parameterValue: { value: business } },
    { name: 'start_date', parameterType: { type: 'DATE' }, parameterValue: { value: startDate } },
    { name: 'end_date', parameterType: { type: 'DATE' }, parameterValue: { value: endDate } },
  ];
  const execute = async query => {
    const queryResponse = await fetch('https://bigquery.googleapis.com/bigquery/v2/projects/planar-method-169102/queries', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, useLegacySql: false, location: 'asia-northeast3', timeoutMs: 30000, parameterMode: 'NAMED', queryParameters }),
    });
    const result = await queryResponse.json();
    if (!queryResponse.ok || result.errors?.length) throw new Error(`BigQuery 조회 실패 (${queryResponse.status}): ${result.errors?.[0]?.message ?? result.error?.message ?? '알 수 없는 오류'}`);
    if (!result.jobComplete) throw new Error('BigQuery 조회 시간이 초과되었습니다.');
    return result.rows ?? [];
  };
  const dailyQuery = `WITH media_daily AS (
    SELECT
      datestamp AS metric_date,
      COALESCE(SUM(impression), 0) AS impressions,
      COALESCE(SUM(click), 0) AS clicks,
      COALESCE(SUM(CASE WHEN media = '메타' THEN video_3s_view ELSE view_count END), 0) AS views,
      COALESCE(SUM(cost), 0) AS cost
    FROM \`planar-method-169102.61217_blackyak.blackyak_media_data_view\`
    WHERE datestamp BETWEEN @start_date AND @end_date
      AND (@business = 'all' OR IF(STRPOS(UPPER(COALESCE(campaign_name, '')), 'MKT') > 0, 'MKT', 'PERF') = @business)
    GROUP BY metric_date
  ), ga_events AS (
    SELECT
      PARSE_DATE('%Y%m%d', _TABLE_SUFFIX) AS metric_date,
      CASE
        WHEN STRPOS(UPPER(COALESCE(session_traffic_source_last_click.cross_channel_campaign.campaign_name, '')), 'MKT') > 0 THEN 'MKT'
        WHEN STRPOS(UPPER(COALESCE(session_traffic_source_last_click.cross_channel_campaign.campaign_name, '')), '_EC_') > 0
          OR STRPOS(UPPER(COALESCE(session_traffic_source_last_click.cross_channel_campaign.campaign_name, '')), 'PERF') > 0 THEN 'PERF'
        ELSE NULL
      END AS business_unit,
      user_pseudo_id,
      (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS ga_session_id,
      event_timestamp,
      event_name,
      ecommerce.purchase_revenue AS purchase_revenue
    FROM \`planar-method-169102.analytics_496808362.events_*\`
    WHERE _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', @start_date) AND FORMAT_DATE('%Y%m%d', @end_date)
  ), ga_sessions AS (
    SELECT
      metric_date,
      business_unit,
      user_pseudo_id,
      ga_session_id,
      SAFE_DIVIDE(MAX(event_timestamp) - MIN(event_timestamp), 1000000) AS session_duration,
      LOGICAL_OR(event_name IN ('first_visit', 'first_open')) AS is_new_user,
      COUNTIF(event_name = 'add_to_cart') AS carts,
      COUNTIF(event_name = 'purchase') AS purchases,
      COALESCE(SUM(IF(event_name = 'purchase', purchase_revenue, 0)), 0) AS revenue
    FROM ga_events
    WHERE business_unit IS NOT NULL AND (@business = 'all' OR business_unit = @business)
    GROUP BY metric_date, business_unit, user_pseudo_id, ga_session_id
  ), ga_daily AS (
    SELECT
      metric_date,
      COUNTIF(ga_session_id IS NOT NULL) AS sessions,
      COUNT(DISTINCT user_pseudo_id) AS users,
      COUNT(DISTINCT IF(is_new_user, user_pseudo_id, NULL)) AS new_users,
      AVG(IF(ga_session_id IS NULL, NULL, session_duration)) AS avg_duration,
      SUM(carts) AS carts,
      SUM(purchases) AS purchases,
      SUM(revenue) AS revenue
    FROM ga_sessions
    GROUP BY metric_date
  ), dates AS (
    SELECT metric_date FROM UNNEST(GENERATE_DATE_ARRAY(@start_date, @end_date)) AS metric_date
  )
  SELECT CAST(dates.metric_date AS STRING), COALESCE(impressions, 0), COALESCE(clicks, 0), COALESCE(views, 0), COALESCE(cost, 0),
    COALESCE(purchases, 0), COALESCE(revenue, 0), COALESCE(sessions, 0), COALESCE(users, 0), COALESCE(carts, 0), COALESCE(avg_duration, 0), COALESCE(new_users, 0)
  FROM dates LEFT JOIN media_daily USING (metric_date) LEFT JOIN ga_daily USING (metric_date)
  ORDER BY metric_date`;
  const channelQuery = `SELECT COALESCE(media, '미분류') AS media, COALESCE(SUM(cost), 0) AS cost
    FROM \`planar-method-169102.61217_blackyak.blackyak_media_data_view\`
    WHERE datestamp BETWEEN @start_date AND @end_date
      AND (@business = 'all' OR IF(STRPOS(UPPER(COALESCE(campaign_name, '')), 'MKT') > 0, 'MKT', 'PERF') = @business)
    GROUP BY media ORDER BY cost DESC`;
  const [dailyRows, channelRows] = await Promise.all([execute(dailyQuery), execute(channelQuery)]);
  const trend = dailyRows.map(row => ({
    date: row.f[0]?.v,
    impressions: Number(row.f[1]?.v ?? 0), clicks: Number(row.f[2]?.v ?? 0), views: Number(row.f[3]?.v ?? 0), cost: Number(row.f[4]?.v ?? 0),
    conversions: Number(row.f[5]?.v ?? 0), revenue: Number(row.f[6]?.v ?? 0), sessions: Number(row.f[7]?.v ?? 0), users: Number(row.f[8]?.v ?? 0), carts: Number(row.f[9]?.v ?? 0), avgDuration: Number(row.f[10]?.v ?? 0), newUsers: Number(row.f[11]?.v ?? 0),
  }));
  const totals = trend.reduce((sum, row) => {
    ['impressions', 'clicks', 'views', 'cost', 'conversions', 'revenue', 'sessions', 'users', 'carts', 'newUsers'].forEach(key => { sum[key] += row[key]; });
    return sum;
  }, { impressions: 0, clicks: 0, views: 0, cost: 0, conversions: 0, revenue: 0, sessions: 0, users: 0, carts: 0, newUsers: 0 });
  const metrics = {
    ...totals,
    cpm: totals.impressions ? totals.cost / totals.impressions * 1000 : 0,
    ctr: totals.impressions ? totals.clicks / totals.impressions * 100 : 0,
    cpv: totals.views ? totals.cost / totals.views : 0,
    purchaseRate: totals.clicks ? totals.conversions / totals.clicks * 100 : 0,
    cartRate: totals.sessions ? totals.carts / totals.sessions * 100 : 0,
    avgDuration: totals.sessions ? trend.reduce((sum, row) => sum + row.avgDuration * row.sessions, 0) / totals.sessions : 0,
    newUserShare: totals.users ? totals.newUsers / totals.users * 100 : 0,
    cpo: totals.conversions ? totals.cost / totals.conversions : 0,
    roas: totals.cost ? totals.revenue / totals.cost * 100 : 0,
  };
  const channels = channelRows.map(row => ({ channel: row.f[0]?.v ?? '미분류', cost: Number(row.f[1]?.v ?? 0) }));
  return { metrics, trend, channels };
}

async function getMediaProductReport({ business, startDate, endDate }) {
  const accessToken = await getGoogleAccessToken('https://www.googleapis.com/auth/bigquery.readonly');
  const detailQuery = `SELECT
      IF(STRPOS(UPPER(COALESCE(campaign_name, '')), 'MKT') > 0, 'MKT', 'PERF') AS business,
      COALESCE(media, '미분류') AS media,
      COALESCE(NULLIF(campaign_type, ''), '기타') AS product,
      COALESCE(SUM(source.cost), 0) AS cost,
      COALESCE(SUM(source.impression), 0) AS impressions,
      COALESCE(SUM(source.click), 0) AS clicks,
      COALESCE(SUM(CASE WHEN source.media = '메타' THEN source.video_3s_view ELSE source.view_count END), 0) AS views
    FROM \`planar-method-169102.61217_blackyak.blackyak_media_data_view\` AS source
    WHERE datestamp BETWEEN @start_date AND @end_date
      AND (@business = 'all' OR IF(STRPOS(UPPER(COALESCE(campaign_name, '')), 'MKT') > 0, 'MKT', 'PERF') = @business)
    GROUP BY business, media, product
    HAVING SUM(COALESCE(source.impression, 0)) > 0 OR SUM(COALESCE(source.click, 0)) > 0 OR SUM(COALESCE(source.cost, 0)) > 0
    ORDER BY cost DESC`;
  const dailyQuery = `SELECT
      CAST(datestamp AS STRING) AS metric_date,
      COALESCE(media, '미분류') AS media,
      COALESCE(SUM(source.cost), 0) AS cost,
      COALESCE(SUM(source.impression), 0) AS impressions,
      COALESCE(SUM(source.click), 0) AS clicks,
      COALESCE(SUM(CASE WHEN source.media = '메타' THEN source.video_3s_view ELSE source.view_count END), 0) AS views
    FROM \`planar-method-169102.61217_blackyak.blackyak_media_data_view\` AS source
    WHERE datestamp BETWEEN @start_date AND @end_date
      AND (@business = 'all' OR IF(STRPOS(UPPER(COALESCE(campaign_name, '')), 'MKT') > 0, 'MKT', 'PERF') = @business)
    GROUP BY metric_date, media
    ORDER BY metric_date, media`;
  const gaDailyQuery = `WITH ga_events AS (
    SELECT
      PARSE_DATE('%Y%m%d', _TABLE_SUFFIX) AS metric_date,
      LOWER(COALESCE(session_traffic_source_last_click.cross_channel_campaign.source, '')) AS session_source,
      COALESCE(session_traffic_source_last_click.cross_channel_campaign.campaign_name, '') AS campaign_name,
      event_name,
      ecommerce.purchase_revenue AS purchase_revenue
    FROM \`planar-method-169102.analytics_496808362.events_*\`
    WHERE _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', @start_date) AND FORMAT_DATE('%Y%m%d', @end_date)
  ), classified AS (
    SELECT
      metric_date,
      CASE
        WHEN STRPOS(session_source, 'navergfa') > 0 THEN '네이버 GFA'
        WHEN STRPOS(session_source, 'naver') > 0 THEN '네이버 SA'
        WHEN STRPOS(session_source, 'google') > 0 OR STRPOS(session_source, 'youtube') > 0 THEN '구글'
        WHEN STRPOS(session_source, 'meta') > 0 THEN '메타'
        WHEN STRPOS(session_source, 'criteo') > 0 THEN '크리테오'
        ELSE NULL
      END AS media,
      IF(STRPOS(UPPER(campaign_name), 'MKT') > 0, 'MKT', 'PERF') AS business,
      event_name,
      purchase_revenue
    FROM ga_events
  )
  SELECT
    CAST(metric_date AS STRING) AS metric_date,
    media,
    COUNTIF(event_name = 'purchase') AS purchases,
    COALESCE(SUM(IF(event_name = 'purchase', purchase_revenue, 0)), 0) AS revenue
  FROM classified
  WHERE media IS NOT NULL AND (@business = 'all' OR business = @business)
  GROUP BY metric_date, media
  ORDER BY metric_date, media`;
  const queryParameters = [
    { name: 'business', parameterType: { type: 'STRING' }, parameterValue: { value: business } },
    { name: 'start_date', parameterType: { type: 'DATE' }, parameterValue: { value: startDate } },
    { name: 'end_date', parameterType: { type: 'DATE' }, parameterValue: { value: endDate } },
  ];
  const execute = async query => {
    const queryResponse = await fetch('https://bigquery.googleapis.com/bigquery/v2/projects/planar-method-169102/queries', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, useLegacySql: false, location: 'asia-northeast3', timeoutMs: 30000, parameterMode: 'NAMED', queryParameters }),
    });
    const result = await queryResponse.json();
    if (!queryResponse.ok || result.errors?.length) throw new Error(`BigQuery 조회 실패 (${queryResponse.status}): ${result.errors?.[0]?.message ?? result.error?.message ?? '알 수 없는 오류'}`);
    if (!result.jobComplete) throw new Error('BigQuery 조회 시간이 초과되었습니다.');
    return result.rows ?? [];
  };
  const [detailRows, dailyRows, gaDailyRows] = await Promise.all([execute(detailQuery), execute(dailyQuery), execute(gaDailyQuery)]);
  const rows = detailRows.map(row => ({
    business: row.f[0]?.v ?? 'PERF', media: row.f[1]?.v ?? '미분류', product: row.f[2]?.v ?? '기타',
    cost: Number(row.f[3]?.v ?? 0), impressions: Number(row.f[4]?.v ?? 0), clicks: Number(row.f[5]?.v ?? 0), views: Number(row.f[6]?.v ?? 0),
  }));
  const daily = dailyRows.map(row => ({
    date: row.f[0]?.v, media: row.f[1]?.v ?? '미분류', cost: Number(row.f[2]?.v ?? 0), impressions: Number(row.f[3]?.v ?? 0), clicks: Number(row.f[4]?.v ?? 0), views: Number(row.f[5]?.v ?? 0),
  }));
  const gaDaily = gaDailyRows.map(row => ({
    date: row.f[0]?.v, media: row.f[1]?.v, purchases: Number(row.f[2]?.v ?? 0), revenue: Number(row.f[3]?.v ?? 0),
  }));
  return { rows, daily, gaDaily };
}

async function getGaPurchaseCampaigns({ business, startDate, endDate }) {
  const accessToken = await getGoogleAccessToken('https://www.googleapis.com/auth/bigquery.readonly');
  const query = `WITH purchase_events AS (
    SELECT
      COALESCE(session_traffic_source_last_click.cross_channel_campaign.campaign_name, '') AS campaign_name,
      IF(STRPOS(UPPER(COALESCE(session_traffic_source_last_click.cross_channel_campaign.campaign_name, '')), 'MKT') > 0, 'MKT', 'PERF') AS business,
      ecommerce.purchase_revenue AS purchase_revenue
    FROM \`planar-method-169102.analytics_496808362.events_*\`
    WHERE _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', @start_date) AND FORMAT_DATE('%Y%m%d', @end_date)
      AND event_name = 'purchase'
  )
  SELECT campaign_name, COUNT(*) AS purchases, COALESCE(SUM(purchase_revenue), 0) AS revenue
  FROM purchase_events
  WHERE campaign_name != ''
    AND LOWER(TRIM(campaign_name)) NOT IN (
      '(direct)', 'direct', '(referral)', 'referral', '(not set)', 'not set',
      '(organic)', 'organic', '(none)', 'none', '(unassigned)', 'unassigned'
    )
    AND (@business = 'all' OR business = @business)
  GROUP BY campaign_name
  ORDER BY purchases DESC, revenue DESC
  LIMIT 10`;
  const queryResponse = await fetch('https://bigquery.googleapis.com/bigquery/v2/projects/planar-method-169102/queries', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query, useLegacySql: false, location: 'asia-northeast3', timeoutMs: 30000, parameterMode: 'NAMED',
      queryParameters: [
        { name: 'business', parameterType: { type: 'STRING' }, parameterValue: { value: business } },
        { name: 'start_date', parameterType: { type: 'DATE' }, parameterValue: { value: startDate } },
        { name: 'end_date', parameterType: { type: 'DATE' }, parameterValue: { value: endDate } },
      ],
    }),
  });
  const result = await queryResponse.json();
  if (!queryResponse.ok || result.errors?.length) throw new Error(`BigQuery 조회 실패 (${queryResponse.status}): ${result.errors?.[0]?.message ?? result.error?.message ?? '알 수 없는 오류'}`);
  if (!result.jobComplete) throw new Error('BigQuery 조회 시간이 초과되었습니다.');
  return (result.rows ?? []).map(row => ({ campaign: row.f[0]?.v, purchases: Number(row.f[1]?.v ?? 0), revenue: Number(row.f[2]?.v ?? 0) }));
}

const server = createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname);
  if (pathname === '/api/campaign-creatives') {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (request.method === 'GET') {
      const campaign = url.searchParams.get('campaign')?.trim();
      if (!campaign || campaign === 'all') {
        response.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({ error: '캠페인을 먼저 선택해 주세요.' }));
        return;
      }
      const creatives = readCreativeMetadata().filter(item => item.campaign === campaign);
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ campaign, creatives }));
      return;
    }
    if (request.method === 'PATCH') {
      try {
        const body = await readJsonBody(request, 64 * 1024);
        const id = String(body.id ?? '').trim();
        const campaign = String(body.campaign ?? '').trim();
        const media = String(body.media ?? '').trim();
        const label = String(body.label ?? '').trim();
        const creativeType = String(body.creativeType ?? '').trim();
        if (!/^[0-9a-f-]{36}$/.test(id) || !campaign || campaign === 'all') throw new Error('수정할 소재 정보가 올바르지 않습니다.');
        if (!media || !label || !['영상', '배너'].includes(creativeType)) throw new Error('매체, 소재 라벨, 소재 유형을 모두 입력해 주세요.');
        if (media.length > 80 || label.length > 120) throw new Error('입력한 텍스트가 너무 깁니다.');
        const filters = await getCampaignFilters();
        if (!getAvailableMedia(filters.filterRows, campaign, 'all').includes(media)) throw new Error('선택한 캠페인에 포함된 매체만 지정할 수 있습니다.');
        const creatives = readCreativeMetadata();
        const index = creatives.findIndex(item => item.id === id && item.campaign === campaign);
        if (index < 0) {
          response.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
          response.end(JSON.stringify({ error: '수정할 소재를 찾지 못했습니다.' }));
          return;
        }
        creatives[index] = { ...creatives[index], media, label, creativeType, updatedAt: new Date().toISOString() };
        saveCreativeMetadata(creatives);
        response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        response.end(JSON.stringify({ creative: creatives[index] }));
      } catch (error) {
        response.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        response.end(JSON.stringify({ error: error.message }));
      }
      return;
    }
    if (request.method === 'DELETE') {
      const campaign = url.searchParams.get('campaign')?.trim();
      const id = url.searchParams.get('id')?.trim();
      if (!campaign || campaign === 'all' || !/^[0-9a-f-]{36}$/.test(id ?? '')) {
        response.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({ error: '삭제할 소재 정보가 올바르지 않습니다.' }));
        return;
      }
      try {
        const creatives = readCreativeMetadata();
        const creative = creatives.find(item => item.id === id && item.campaign === campaign);
        if (!creative) {
          response.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
          response.end(JSON.stringify({ error: '삭제할 소재를 찾지 못했습니다.' }));
          return;
        }
        saveCreativeMetadata(creatives.filter(item => item.id !== id));
        const filename = creative.imageUrl.split('/').pop();
        if (/^[0-9a-f-]{36}\.(png|jpg|webp|gif)$/.test(filename ?? '')) {
          const imagePath = join(creativeImageRoot, filename);
          if (existsSync(imagePath)) unlinkSync(imagePath);
        }
        response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        response.end(JSON.stringify({ deletedId: id }));
      } catch (error) {
        response.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        response.end(JSON.stringify({ error: `소재 삭제 중 오류가 발생했습니다. ${error.message}` }));
      }
      return;
    }
    if (request.method === 'POST') {
      try {
        const body = await readJsonBody(request);
        const campaign = String(body.campaign ?? '').trim();
        const media = String(body.media ?? '').trim();
        const label = String(body.label ?? '').trim();
        const creativeType = String(body.creativeType ?? '').trim();
        const imageData = String(body.imageData ?? '');
        if (!campaign || campaign === 'all') throw new Error('캠페인을 먼저 선택해 주세요.');
        if (!media || !label || !['영상', '배너'].includes(creativeType)) throw new Error('매체, 소재 라벨, 소재 유형을 모두 입력해 주세요.');
        if (campaign.length > 200 || media.length > 80 || label.length > 120) throw new Error('입력한 텍스트가 너무 깁니다.');
        const filters = await getCampaignFilters();
        if (!getAvailableMedia(filters.filterRows, campaign, 'all').includes(media)) throw new Error('선택한 캠페인에 포함된 매체만 등록할 수 있습니다.');
        const match = imageData.match(/^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=]+)$/);
        if (!match) throw new Error('PNG, JPG, WEBP, GIF 이미지만 업로드할 수 있습니다.');
        const image = Buffer.from(match[2], 'base64');
        if (!image.length || image.length > 8 * 1024 * 1024) throw new Error('이미지는 최대 8MB까지 업로드할 수 있습니다.');
        const extension = match[1] === 'jpeg' ? 'jpg' : match[1];
        const id = randomUUID();
        const filename = `${id}.${extension}`;
        mkdirSync(creativeImageRoot, { recursive: true });
        writeFileSync(join(creativeImageRoot, filename), image);
        const creative = { id, campaign, media, label, creativeType, imageUrl: `/creative-assets/${filename}`, uploadedAt: new Date().toISOString() };
        const creatives = readCreativeMetadata();
        creatives.push(creative);
        saveCreativeMetadata(creatives);
        response.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        response.end(JSON.stringify({ creative }));
      } catch (error) {
        response.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        response.end(JSON.stringify({ error: error.message }));
      }
      return;
    }
    response.writeHead(405, { Allow: 'GET, POST, PATCH, DELETE' });
    response.end();
    return;
  }
  if (pathname.startsWith('/creative-assets/')) {
    const filename = pathname.slice('/creative-assets/'.length);
    const filePath = normalize(join(creativeImageRoot, filename));
    if (!/^[0-9a-f-]{36}\.(png|jpg|webp|gif)$/.test(filename) || !filePath.startsWith(creativeImageRoot) || !existsSync(filePath) || !statSync(filePath).isFile()) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }
    response.writeHead(200, { 'Content-Type': contentTypes[extname(filePath)] ?? 'application/octet-stream', 'Cache-Control': 'public, max-age=86400' });
    createReadStream(filePath).pipe(response);
    return;
  }
  if (pathname === '/api/overview-metrics') {
    const url = new URL(request.url, `http://${request.headers.host}`);
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
      const result = await getOverviewMetrics({ business, startDate, endDate });
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ business, startDate, endDate, ...result }));
    } catch (error) {
      console.error(`Overview metrics error: ${error.message}`);
      response.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ error: error.message }));
    }
    return;
  }
  if (pathname === '/api/media-product-report') {
    const url = new URL(request.url, `http://${request.headers.host}`);
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
      const result = await getMediaProductReport({ business, startDate, endDate });
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ business, startDate, endDate, ...result }));
    } catch (error) {
      console.error(`Media product report error: ${error.message}`);
      response.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ error: error.message }));
    }
    return;
  }
  if (pathname === '/api/ga-purchase-campaigns') {
    const url = new URL(request.url, `http://${request.headers.host}`);
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
      const campaigns = await getGaPurchaseCampaigns({ business, startDate, endDate });
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ business, startDate, endDate, campaigns }));
    } catch (error) {
      console.error(`GA purchase campaigns error: ${error.message}`);
      response.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ error: error.message }));
    }
    return;
  }
  if (pathname === '/api/campaigns') {
    try {
      const { campaigns, mediaAdTypes, filterRows } = await getCampaignFilters();
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ campaigns, mediaAdTypes, filterRows }));
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
      const availableMedia = getAvailableMedia(filters.filterRows, campaign, business);
      const mediaAdTypes = (url.searchParams.get('media') ?? '').split(',').filter(value => availableMedia.includes(value));
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
  if (pathname === '/api/campaign-media-mix') {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const campaign = url.searchParams.get('campaign')?.trim() || 'all';
    try {
      const filters = await getCampaignFilters();
      const table = selectMediaMixColumns(filters.mediaMixTable ?? { headers: [], rows: [] }, [
        '사업부', 'KPI', 'Media - AD Type', '비고', '소재', 'Type', '시작 일', '종료 일', 'Budget', '성/연령', 'Targeting',
        'Imps', 'Click', 'View', 'CPM', 'CPC', 'CPV', 'CTR', 'VTR', '구매', '매출액', 'CVR', 'ROAS',
      ]);
      const rows = table.rows.filter(row => campaign === 'all' || row.campaign === campaign).map(row => row.values);
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ campaign, headers: table.headers, rows }));
    } catch (error) {
      console.error(`Campaign media mix error: ${error.message}`);
      response.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ error: error.message }));
    }
    return;
  }
  if (pathname === '/api/campaign-media-table') {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const campaign = url.searchParams.get('campaign')?.trim() || 'all';
    try {
      const result = await getCampaignMediaTable({ campaign });
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify(result));
    } catch (error) {
      console.error(`Campaign media table error: ${error.message}`);
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
    'Cache-Control': 'no-store',
  });
  createReadStream(filePath).pipe(response);
});

server.listen(port, host, () => {
  console.log(`Marketing dashboard is running at http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
});
