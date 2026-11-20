const winterKidsStartDate = '2026-09-01';
const sheetsScope = 'https://www.googleapis.com/auth/spreadsheets.readonly';
const unclassified = '미분류';
const dimensions = ['campaign', 'business', 'kpi', 'mediaAdType'];
const excludedMedia = new Map([
  ['INVISIBLEWHITE', ['카카오 - 미분류', '메타 - 미분류']],
  ['SKYWEB', ['메타 - 미분류']],
]);
const winterKidsPerfMedia = new Map([
  ['네이버BSA', 'NV - 브랜드검색'],
  ['네이버SA', 'NV - SA'],
  ['구글SA', 'YT - SA'],
  ['모비온', 'MB - 모비온'],
  ['메타', 'MT - 전환'],
  ['크리테오', '크리테오'],
]);
const salesPerfMedia = new Map([
  ['네이버 쇼핑검색', 'NV - 쇼핑검색'],
  ['네이버BSA', 'NV - 브랜드검색'],
  ['네이버SA', 'NV - SA'],
  ['모비온', '모비온'],
  ['크리테오', '크리테오'],
  ['RTB하우스', 'RTB'],
  ['토스', '토스페이'],
  ['메타', 'MT - 전환'],
  ['구글SA', 'YT - SA'],
]);
const columns = {
  cost: '소진금액(수수료포함)', reach: '도달', impressions: '노출', clicks: '링크클릭', views: '조회',
  purchases: '구매전환', revenue: '구매전환매출액', sessions: '세션', gaPurchases: '전환', gaRevenue: '매출액',
};
const metricKeys = Object.keys(columns);
const emptyMetrics = Object.fromEntries(metricKeys.map(key => [key, null]));
const kpis = { CPM: '도달', CPV: '조회', CPC: '트래픽', CPLC: '트래픽', ROAS: '전환' };
const clean = value => String(value ?? '').trim();
const normalize = value => clean(value).toUpperCase().replace(/[^\p{L}\p{N}]/gu, '');
const keyOf = (row, keys = dimensions) => JSON.stringify(keys.map(key => row[key]));
const operationDay = value => {
  const match = value?.match(/(\d{1,2})월\s*(\d{1,2})일/);
  return match ? `${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}` : null;
};

function numberValue(value) {
  const text = clean(value).replace(/[,\s]/g, '');
  if (!text || !Number.isFinite(Number(text))) return null;
  return Number(text);
}

function isoDate(value) {
  if (typeof value === 'number' && value > 0 && value < 2_958_466) {
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000).toISOString().slice(0, 10);
  }
  return clean(value).match(/^\d{4}-\d{2}-\d{2}(?=$|[T\s])/)?.[0];
}

function columnName(index) {
  let letters = '';
  for (let column = index + 1; column > 0; column = Math.floor((column - 1) / 26)) {
    letters = String.fromCharCode(65 + (column - 1) % 26) + letters;
  }
  return letters;
}

async function readReportSpreadsheet(spreadsheetId, getToken) {
  if (!/^[\w-]+$/.test(spreadsheetId ?? '')) throw new Error(`05 원본 Google Sheets ID를 설정해 주세요.`);
  const token = await getToken(sheetsScope);
  const root = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`;
  const read = async (suffix, params) => {
    const response = await fetch(`${root}${suffix}?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      const reason = error.error?.details?.find(item => typeof item.reason === 'string')?.reason ?? error.error?.status;
      const detail = typeof reason === 'string' && /^[A-Z_]+$/.test(reason) ? ` · ${reason}` : '';
      throw new Error(`05 Google Sheets 조회 실패 (HTTP ${response.status}${detail})`);
    }
    return response.json();
  };
  const metadata = await read('', new URLSearchParams({ fields: 'sheets(properties(title,sheetType))' }));
  const tabs = (metadata.sheets ?? []).map(sheet => sheet.properties)
    .filter(sheet => sheet?.sheetType === 'GRID' && /_(?:BY|BK)$/.test(sheet.title) && !/^MIX_(?:BY|BK)$/.test(sheet.title))
    .map(sheet => sheet.title);
  if (!tabs.some(tab => tab.endsWith('_BY')) || !tabs.some(tab => tab.endsWith('_BK'))) throw new Error(`05 원본에서 매체 성과 탭을 찾을 수 없습니다.`);
  const batch = async ranges => {
    const params = new URLSearchParams({
      majorDimension: 'ROWS', valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'SERIAL_NUMBER',
    });
    for (const range of ranges) params.append('ranges', range);
    const { valueRanges } = await read('/values:batchGet', params);
    if (valueRanges?.length !== ranges.length) throw new Error(`05 원본의 일부 조회 범위가 누락됐습니다.`);
    return valueRanges.map(range => range.values ?? []);
  };
  const sheetRange = title => `'${title.replaceAll("'", "''")}'!`;
  const headers = await batch(tabs.map(title => `${sheetRange(title)}1:1`));
  const skippedTabs = [];
  const mediaTabs = tabs.flatMap((tab, index) => {
    const header = (headers[index][0] ?? []).map(clean);
    const find = name => header.indexOf(name);
    const dateColumn = find('날짜');
    const campaignColumn = find('광고캠페인이름');
    const indices = Object.entries(columns).map(([key, name]) => [key, find(name)]);
    if (dateColumn < 0 || campaignColumn < 0 || find(columns.cost) < 0) {
      skippedTabs.push(tab);
      return [];
    }
    const adColumn = find('광고이름');
    const groupColumn = find('광고그룹세트이름');
    const kpiColumn = find('KPI');
    const lastColumn = Math.max(dateColumn, campaignColumn, adColumn, groupColumn, kpiColumn, ...indices.map(([, col]) => col));
    return [{ tab, dateColumn, campaignColumn, adColumn, groupColumn, kpiColumn, indices,
      range: `${sheetRange(tab)}A2:${columnName(lastColumn)}` }];
  });
  if (!mediaTabs.some(sheet => sheet.tab.endsWith('_BY')) || !mediaTabs.some(sheet => sheet.tab.endsWith('_BK'))) throw new Error(`05 원본에서 매체 성과 탭을 찾을 수 없습니다.`);

  const records = { BY: [], BK: [], skippedTabs };
  for (let offset = 0; offset < mediaTabs.length; offset += 3) {
    const sheets = mediaTabs.slice(offset, offset + 3);
    const values = await batch(sheets.map(sheet => sheet.range));
    sheets.forEach(({ tab, dateColumn, campaignColumn, adColumn, groupColumn, kpiColumn, indices }, index) => {
      for (const cells of values[index]) {
        const date = isoDate(cells[dateColumn]);
        const campaignName = clean(cells[campaignColumn]);
        if (!date || !campaignName) continue;
        records[tab.slice(-2)].push({
          date, campaignName, tab: tab.slice(0, -3), adName: clean(cells[adColumn]), adGroup: clean(cells[groupColumn]),
          kpi: kpis[clean(cells[kpiColumn]).toUpperCase()] ?? unclassified,
          ...Object.fromEntries(indices.map(([key, col]) => [key, numberValue(cells[col])])),
        });
      }
    });
  }
  return records;
}

export function createReportSource(getToken, spreadsheetId) {
  let cache;
  let loading;
  return async () => {
    if (cache?.expiresAt > Date.now()) return cache.records;
    loading ??= (async () => {
      const records = await readReportSpreadsheet(spreadsheetId, getToken);
      cache = { records, expiresAt: Date.now() + 5 * 60_000 };
      return records;
    })().finally(() => { loading = undefined; });
    return loading;
  };
}

export function classifyReport(records, filters, { winterKidsSource = false } = {}) {
  const plans = new Map();
  for (const row of filters.filterRows) {
    const key = keyOf(row);
    const prior = plans.get(key);
    if (!prior) {
      plans.set(key, { ...row, target: { ...row.target } });
      continue;
    }
    const start = operationDay(row.operationStart);
    const end = operationDay(row.operationEnd);
    if (start && start < (operationDay(prior.operationStart) ?? '99')) prior.operationStart = row.operationStart;
    if (end && end > (operationDay(prior.operationEnd) ?? '')) prior.operationEnd = row.operationEnd;
    for (const key of Object.keys(prior.target)) prior.target[key] += row.target[key] ?? 0;
  }
  const campaignKeys = filters.campaigns.map(value => [value, normalize(value)]).filter(([, key]) => key)
    .sort((a, b) => b[1].length - a[1].length);
  const campaignsByKey = new Map(campaignKeys.map(([campaign, key]) => [key, campaign]));
  const winterKids = campaignsByKey.get('WINTERKIDS') ?? 'WinterKids';
  const sales = campaignsByKey.get('SALES') ?? 'SALES';
  const salesStarts = [...plans.values()].filter(plan => plan.campaign === sales)
    .map(plan => operationDay(plan.operationStart)).filter(Boolean).sort();
  const salesYear = new Date(Date.now() + 9 * 3600000).getUTCFullYear();
  const nonSalesCampaignKeys = campaignKeys.filter(([, key]) => key !== 'SALES');
  const mappingCache = new Map();
  const mapped = records.map(record => {
    const sourceKey = JSON.stringify([record.tab, record.campaignName, record.kpi]);
    let match = mappingCache.get(sourceKey);
    if (!match) {
      const name = record.campaignName.toUpperCase();
      const normalizedName = normalize(name);
      const [, , dateCode, campaignCode] = name.split('_');
      const namedCampaign = /^\d{6}$/.test(dateCode ?? '') ? campaignsByKey.get(normalize(campaignCode)) : undefined;
      const campaign = winterKidsSource ? winterKids : (namedCampaign !== sales ? namedCampaign : undefined)
        ?? nonSalesCampaignKeys.find(([, key]) => normalizedName.includes(key))?.[0] ?? sales;
      const salesMedia = !winterKidsSource && campaign === sales ? salesPerfMedia.get(record.tab) : undefined;
      const unit = salesMedia ? 'PERF' : winterKidsSource
        ? (normalize(campaignCode) === 'WINTERKIDS' ? 'MKT' : 'PERF')
        : name.match(/(?:^|_)(MKT|PERF)(?:_|$)/)?.[1];
      const candidates = [...plans.values()].filter(row =>
        (campaign === unclassified || row.campaign === campaign) && (!unit || row.business === unit)
        && (filters.mediaFilters[row.mediaAdType] ?? []).some(needle => name.includes(needle)));
      const exact = candidates.filter(row => row.kpi === record.kpi);
      const plan = salesMedia ? plans.get(keyOf({ campaign, business: unit, kpi: '전환', mediaAdType: salesMedia }))
        : campaign !== unclassified ? (exact.length === 1 ? exact[0] : candidates.length === 1 ? candidates[0] : null) : null;
      const perfMedia = !plan && winterKidsSource && unit === 'PERF' ? winterKidsPerfMedia.get(record.tab) : undefined;
      match = {
        campaign, business: unit ?? plan?.business ?? unclassified,
        kpi: plan?.kpi ?? (salesMedia || perfMedia ? '전환' : record.kpi),
        mediaAdType: plan?.mediaAdType ?? salesMedia ?? perfMedia ?? `${record.tab} - ${unclassified}`,
      };
      mappingCache.set(sourceKey, match);
    }
    return { ...record, ...match };
  });
  const recordsForReport = mapped.filter(row => {
    if (excludedMedia.get(normalize(row.campaign))?.includes(row.mediaAdType)) return false;
    if (row.campaign !== sales) return true;
    const start = operationDay(plans.get(keyOf(row))?.operationStart) ?? salesStarts[0];
    return !start || row.date >= `${salesYear}-${start}`;
  });
  return { plans, records: recordsForReport };
}

export function classifyReportSources(records, winterKidsRecords, filters) {
  const main = classifyReport(records, filters);
  const inCampaignPeriod = winterKidsRecords.filter(row => row.date >= winterKidsStartDate);
  const winterKids = classifyReport(inCampaignPeriod, filters, { winterKidsSource: true });
  return {
    plans: main.plans,
    records: [...main.records.filter(row => normalize(row.campaign) !== 'WINTERKIDS'), ...winterKids.records],
  };
}

function group(rows, keys) {
  const groups = new Map();
  for (const row of rows) {
    const id = keyOf(row, keys);
    if (!groups.has(id)) groups.set(id, { ...emptyMetrics, ...Object.fromEntries(keys.map(key => [key, row[key]])) });
    const total = groups.get(id);
    for (const key of metricKeys) if (row[key] != null) total[key] = (total[key] ?? 0) + row[key];
  }
  return groups;
}

const sum = rows => group(rows, []).values().next().value ?? { ...emptyMetrics };
const ratio = (numerator, denominator, factor = 1) =>
  numerator == null || denominator == null ? null : denominator ? numerator / denominator * factor : 0;

function rates(row) {
  return {
    ...row, cpm: ratio(row.cost, row.impressions, 1000), cpc: ratio(row.cost, row.clicks), cpv: ratio(row.cost, row.views),
    ctr: ratio(row.clicks, row.impressions, 100), vtr: ratio(row.views, row.impressions, 100),
    cpo: ratio(row.cost, row.purchases), cvr: ratio(row.purchases, row.clicks, 100), roas: ratio(row.revenue, row.cost, 100),
    gaCpo: ratio(row.cost, row.gaPurchases), gaCvr: ratio(row.gaPurchases, row.clicks, 100), gaRoas: ratio(row.gaRevenue, row.cost, 100),
  };
}

export function reportOptions({ plans, records }) {
  const filterRows = new Map(plans);
  for (const row of records) {
    const id = keyOf(row);
    if (!filterRows.has(id)) filterRows.set(id, Object.fromEntries(dimensions.map(key => [key, row[key]])));
  }
  const rows = [...filterRows.values()];
  return { filterRows: rows, campaigns: [...new Set(rows.map(row => row.campaign))], mediaAdTypes: [...new Set(rows.map(row => row.mediaAdType))] };
}

export function reportSummary({ plans, records }, { campaign, business, mediaAdTypes, startDate, endDate }) {
  const selected = row => (campaign === 'all' || row.campaign === campaign)
    && (business === 'all' || row.business === business) && mediaAdTypes.includes(row.mediaAdType);
  const selectedPlans = [...plans.values()].filter(selected);
  const filtered = records.filter(row => selected(row) && row.date >= startDate && row.date <= endDate);
  const goal = rates(sum(selectedPlans.map(row => row.target)));
  const summary = total => {
    const row = rates(total);
    return {
      ...row, mediaRevenue: row.revenue, mediaRoas: row.roas, conversions: row.gaPurchases,
      revenue: row.gaRevenue, purchaseRate: row.gaCvr, cpo: row.gaCpo, roas: row.gaRoas, users: null,
    };
  };
  return {
    metrics: summary(sum(filtered)),
    target: { ...goal, mediaRevenue: goal.revenue, mediaRoas: goal.roas },
    trend: [...group(filtered, ['date']).values()].sort((a, b) => a.date.localeCompare(b.date)).map(summary),
    weeklyGa: [],
  };
}

function monday(date) {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() - (day.getUTCDay() + 6) % 7);
  return day.toISOString().slice(0, 10);
}

const businessOrder = { MKT: 0, PERF: 1 };
const mktKpiOrder = new Map([['도달', 0], ['조회', 1], ['트래픽', 2]]);

function mediaOrder(row) {
  const platform = normalize(row.platform);
  const label = normalize(row.mediaAdType);
  const google = /^(구글|GOOGLE|유튜브|YOUTUBE|GG|YT)/.test(platform);
  const meta = /^(메타|META|MT)/.test(platform);
  const naver = /^(네이버|NAVER|NV|신제품검색)/.test(platform);
  if (row.business === 'PERF') {
    const matches = pattern => [platform, label].some(value => pattern.test(value));
    if (naver && matches(/BSA|브랜드검색/)) return 0;
    if (naver && matches(/쇼핑검색|SHOPPINGSEARCH/)) return 1;
    if (naver && matches(/^(?:네이버|NAVER|NV)SA$|파워링크/)) return 2;
    if (google && matches(/^(?:구글|GOOGLE|GG)SA$/)) return 3;
  }
  if (google) return 4;
  if (meta) return 5;
  if (naver) return 6;
  return 7;
}

function orderMediaRows(rows) {
  return rows.map(row => ({
    row, business: businessOrder[row.business] ?? 2,
    kpi: row.business === 'MKT' ? (mktKpiOrder.get(row.kpi) ?? 3) : 0,
    media: mediaOrder(row),
    platform: normalize(row.platform), tie: Math.random(),
  })).sort((a, b) => a.business - b.business || a.kpi - b.kpi || a.media - b.media
    || a.platform.localeCompare(b.platform, 'ko') || a.tie - b.tie)
    .map(item => item.row);
}

export function reportMediaTable({ plans, records }, { campaign, endDate, mediaHistory }) {
  const selected = row => campaign === 'all' || row.campaign === campaign;
  const actual = records.filter(row => selected(row) && row.date <= endDate).map(row => ({ ...row, metricDate: row.date, weekStart: monday(row.date) }));
  const actualByPlan = group(actual.map(row => ({
    ...row,
    platform: normalize(row.campaign) === 'WINTERKIDS'
      && row.business === 'MKT' && row.mediaAdType === 'YT - 디맨드젠(트래픽)'
      ? '유튜브' : row.tab,
  })), [...dimensions, 'platform']);
  const rows = [...actualByPlan.values()].map(row => {
    const plan = plans.get(keyOf(row));
    return rates({
      ...row, media: row.mediaAdType.split(' - ').slice(1).join(' - ') || row.mediaAdType,
      operationStart: plan?.operationStart ?? '', operationEnd: plan?.operationEnd ?? '',
      target: rates(plan?.target ?? {}),
    });
  });
  const represented = new Set(rows.map(row => keyOf(row)));
  for (const plan of plans.values()) {
    if (!selected(plan) || represented.has(keyOf(plan))) continue;
    const [platform, ...media] = plan.mediaAdType.split(' - ');
    rows.push(rates({ ...emptyMetrics, ...plan, platform, media: media.join(' - '), target: rates(plan.target) }));
  }
  const sortedRows = orderMediaRows(rows);
  const businessProgress = [...new Set(sortedRows.map(row => row.business))].map(business => {
    const businessPlans = [...plans.values()].filter(row => selected(row) && row.business === business);
    const targets = sum(businessPlans.map(row => row.target));
    const businessRows = actual.filter(row => row.business === business);
    const totals = sum(businessRows);
    const isoOperation = text => {
      const day = operationDay(text);
      return day ? `${endDate.slice(0, 4)}-${day}` : null;
    };
    const overallStart = businessPlans.map(row => isoOperation(row.operationStart)).filter(Boolean).sort()[0] ?? null;
    const overallEnd = businessPlans.map(row => isoOperation(row.operationEnd)).filter(Boolean).sort().at(-1) ?? null;
    const firstLiveDate = businessRows.filter(row => row.impressions > 0).map(row => row.date).sort()[0] ?? null;
    const days = (start, end) => Math.max(0, (Date.parse(end) - Date.parse(start)) / 86400000 + 1);
    const dateProgress = overallStart && overallEnd && firstLiveDate
      ? ratio(days(firstLiveDate > overallStart ? firstLiveDate : overallStart, endDate < overallEnd ? endDate : overallEnd), days(overallStart, overallEnd), 100)
      : null;
    return { business, actual: totals, target: targets, overallStart, overallEnd, firstLiveDate, dateProgress,
      rates: Object.fromEntries(metricKeys.map(key => [key, ratio(totals[key], targets[key], 100)])) };
  });
  const grouped = keys => [...group(actual, keys).values()].map(rates);
  const dailyMedia = grouped(['metricDate', 'business']);
  const startDate = [...businessProgress.map(row => row.overallStart), ...dailyMedia.map(row => row.metricDate)]
    .filter(date => date && date <= endDate).sort()[0] ?? null;
  return {
    startDate, rows: sortedRows, businessProgress, mediaHistory: mediaHistory.filter(selected),
    weeklyTotal: rates(sum(actual)), weeklyMedia: grouped(['weekStart', 'business']),
    dailyMedia,
    mediaDaily: grouped(['metricDate', 'business', 'kpi', 'mediaAdType']),
    mediaCreative: grouped(['business', 'kpi', 'mediaAdType', 'adName', 'adGroup']),
  };
}
