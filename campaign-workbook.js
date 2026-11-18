const fileId = '1GCuqrC-poeuMnBUbBAnazif_bUQ_rY48';
const driveScope = 'https://www.googleapis.com/auth/drive.readonly';
const unclassified = '미분류';
const dimensions = ['campaign', 'business', 'kpi', 'mediaAdType'];
const columns = {
  cost: '소진금액(수수료포함)', reach: '도달', impressions: '노출', clicks: '링크클릭', views: '조회',
  purchases: '구매전환', revenue: '구매전환매출액', sessions: '세션', gaPurchases: '전환', gaRevenue: '매출액',
};
const metricKeys = Object.keys(columns);
const emptyMetrics = Object.fromEntries(metricKeys.map(key => [key, null]));
const kpis = { CPM: '도달', CPV: '조회', CPC: '트래픽', CPLC: '트래픽', ROAS: '전환' };
const clean = value => String(value?.result ?? value?.text ?? value ?? '').trim();
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
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return clean(value).match(/^\d{4}-\d{2}-\d{2}/)?.[0];
}

export async function parseReportWorkbook(bytes) {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes);
  const records = [];
  let mediaTabs = 0;
  for (const sheet of workbook.worksheets) {
    if (['읽는 규칙', 'MIX'].includes(sheet.name.trim())) continue;
    const header = sheet.getRow(1).values.map(clean);
    const dateColumn = header.indexOf('날짜');
    const campaignColumn = header.indexOf('광고캠페인이름');
    if (dateColumn < 0 || campaignColumn < 0) {
      if (sheet.actualRowCount > 1) throw new Error(`원본 '${sheet.name}' 탭의 날짜·캠페인 열을 확인해 주세요.`);
      continue;
    }
    mediaTabs++;
    const indices = Object.entries(columns).map(([key, label]) => [key, header.indexOf(label)]);
    const adColumn = header.indexOf('광고이름');
    const groupColumn = header.indexOf('광고그룹세트이름');
    const kpiColumn = header.indexOf('KPI');
    sheet.eachRow((row, index) => {
      if (index === 1) return;
      const cells = row.values;
      const date = isoDate(cells[dateColumn]);
      const campaignName = clean(cells[campaignColumn]);
      if (!date || !campaignName) return;
      records.push({
        date, campaignName, tab: sheet.name, adName: clean(cells[adColumn]), adGroup: clean(cells[groupColumn]),
        kpi: kpis[clean(cells[kpiColumn]).toUpperCase()] ?? unclassified,
        ...Object.fromEntries(indices.map(([key, col]) => [key, numberValue(cells[col])])),
      });
    });
  }
  if (!mediaTabs) throw new Error('원본 Excel에서 매체 성과 탭을 찾을 수 없습니다.');
  return records;
}

export function createReportSource(getToken) {
  let cache;
  let loading;
  return async () => {
    if (cache?.expiresAt > Date.now()) return cache.records;
    loading ??= (async () => {
      const token = await getToken(driveScope);
      const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) throw new Error(`05 원본 Excel 읽기 실패 (Drive HTTP ${response.status})`);
      const records = await parseReportWorkbook(await response.arrayBuffer());
      cache = { records, expiresAt: Date.now() + 5 * 60_000 };
      return records;
    })().finally(() => { loading = undefined; });
    return loading;
  };
}

export function classifyReport(records, filters) {
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
  const mappingCache = new Map();
  const mapped = records.map(record => {
    const sourceKey = JSON.stringify([record.tab, record.campaignName, record.kpi]);
    let match = mappingCache.get(sourceKey);
    if (!match) {
      const name = record.campaignName.toUpperCase();
      const normalizedName = normalize(name);
      const campaign = campaignKeys.find(([, key]) => normalizedName.includes(key))?.[0] ?? unclassified;
      const unit = name.match(/(?:^|_)(MKT|PERF)(?:_|$)/)?.[1];
      const candidates = [...plans.values()].filter(row =>
        (campaign === unclassified || row.campaign === campaign) && (!unit || row.business === unit)
        && (filters.mediaFilters[row.mediaAdType] ?? []).some(needle => name.includes(needle)));
      const exact = candidates.filter(row => row.kpi === record.kpi);
      const plan = campaign !== unclassified ? (exact.length === 1 ? exact[0] : candidates.length === 1 ? candidates[0] : null) : null;
      match = {
        campaign, business: unit ?? plan?.business ?? unclassified, kpi: plan?.kpi ?? record.kpi,
        mediaAdType: plan?.mediaAdType ?? `${record.tab} - ${unclassified}`,
      };
      mappingCache.set(sourceKey, match);
    }
    return { ...record, ...match };
  });
  return { plans, records: mapped };
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

export function reportSummary(records, { campaign, business, mediaAdTypes, startDate, endDate }) {
  const filtered = records.filter(row => (campaign === 'all' || row.campaign === campaign)
    && (business === 'all' || row.business === business) && mediaAdTypes.includes(row.mediaAdType)
    && row.date >= startDate && row.date <= endDate);
  const summary = total => {
    const row = rates(total);
    return { ...row, conversions: row.gaPurchases, revenue: row.gaRevenue, purchaseRate: row.gaCvr, cpo: row.gaCpo, roas: row.gaRoas, users: null };
  };
  return {
    metrics: summary(sum(filtered)),
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

function mediaOrder(row) {
  const platform = normalize(row.platform);
  const label = normalize(row.mediaAdType);
  const google = /^(구글|GOOGLE|유튜브|YOUTUBE|GG|YT)/.test(platform);
  const meta = /^(메타|META|MT)/.test(platform);
  const naver = /^(네이버|NAVER|NV|신제품검색)/.test(platform);
  if (row.business === 'PERF') {
    const matches = pattern => [platform, label].some(value => pattern.test(value));
    if (naver && matches(/BSA|브랜드검색/)) return 3;
    if (naver && matches(/쇼핑검색|SHOPPINGSEARCH/)) return 4;
    if (naver && matches(/^(?:네이버|NAVER|NV)SA$|파워링크/)) return 5;
    if (google && matches(/^(?:구글|GOOGLE|GG)SA$/)) return 6;
  }
  if (google) return 0;
  if (meta) return 1;
  if (naver) return 2;
  return 7;
}

function orderMediaRows(rows) {
  return rows.map(row => ({
    row, business: businessOrder[row.business] ?? 2, media: mediaOrder(row),
    platform: normalize(row.platform), tie: Math.random(),
  })).sort((a, b) => a.business - b.business || a.media - b.media
    || a.platform.localeCompare(b.platform, 'ko') || a.tie - b.tie)
    .map(item => item.row);
}

export function reportMediaTable({ plans, records }, { campaign, endDate, mediaHistory }) {
  const selected = row => campaign === 'all' || row.campaign === campaign;
  const actual = records.filter(row => selected(row) && row.date <= endDate).map(row => ({ ...row, metricDate: row.date, weekStart: monday(row.date) }));
  const actualByPlan = group(actual, [...dimensions, 'tab']);
  const rows = [...actualByPlan.values()].map(row => {
    const plan = plans.get(keyOf(row));
    return rates({
      ...row, media: row.mediaAdType.split(' - ').slice(1).join(' - ') || row.mediaAdType,
      platform: row.tab, operationStart: plan?.operationStart ?? '', operationEnd: plan?.operationEnd ?? '',
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
  return {
    rows: sortedRows, businessProgress, mediaHistory: mediaHistory.filter(selected),
    weeklyTotal: rates(sum(actual)), weeklyMedia: grouped(['weekStart', 'business']),
    dailyMedia: grouped(['metricDate', 'business']),
    mediaDaily: grouped(['metricDate', 'business', 'kpi', 'mediaAdType']),
    mediaCreative: grouped(['business', 'kpi', 'mediaAdType', 'adName', 'adGroup']),
  };
}
