import { calculateMetrics } from './metrics.js';
import { getAvailableBusinesses, getAvailableMedia } from './campaign-filters.js';
import { getComparisonDateRange } from './date-ranges.js';

const datasets = {
  30: [
    { business: 'MKT', channel: 'Google Ads', color: '#ff5578', impressions: 482000, views: 226000, clicks: 14520, cost: 18400000, conversions: 612, revenue: 53700000 },
    { business: 'MKT', channel: 'Meta', color: '#48d9ff', impressions: 391000, views: 148000, clicks: 11230, cost: 13900000, conversions: 487, revenue: 39600000 },
    { business: 'PERF', channel: 'Naver', color: '#a898ff', impressions: 276000, views: 0, clicks: 9380, cost: 12100000, conversions: 429, revenue: 35800000 },
  ],
  7: [
    { business: 'MKT', channel: 'Google Ads', color: '#ff5578', impressions: 121000, views: 68500, clicks: 3810, cost: 4720000, conversions: 163, revenue: 14100000 },
    { business: 'MKT', channel: 'Meta', color: '#48d9ff', impressions: 98000, views: 34500, clicks: 2860, cost: 3510000, conversions: 128, revenue: 10500000 },
    { business: 'PERF', channel: 'Naver', color: '#a898ff', impressions: 69000, views: 0, clicks: 2410, cost: 3060000, conversions: 110, revenue: 9200000 },
  ],
};

const trends = {
  30: { labels: ['8/01', '8/06', '8/11', '8/16', '8/21', '8/26', '8/30'], revenue: [13.8, 17.2, 15.9, 20.4, 18.8, 23.6, 26.1], cost: [6.1, 6.5, 6.2, 7.1, 6.8, 7.5, 7.8] },
  7: { labels: ['월', '화', '수', '목', '금', '토', '일'], revenue: [3.6, 4.2, 4.8, 4.3, 5.7, 6.9, 8.3], cost: [1.4, 1.6, 1.5, 1.7, 1.9, 2.1, 2.0] },
};

const won = new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW', maximumFractionDigits: 0 });
const compactWon = new Intl.NumberFormat('ko-KR', { notation: 'compact', maximumFractionDigits: 1 });
const number = new Intl.NumberFormat('ko-KR');
const targetRoas = 300;
let activeChannel = 'all';
let activeOverviewBusiness = 'all';
let overviewMetricRequestId = 0;
let activeMediaProductBusiness = 'all';
let activeMediaProductMedia = 'all';
let mediaProductRequestId = 0;
let activeGaBusiness = 'all';
let gaReportRequestId = 0;
let selectedGaTrendMetrics = ['sessions', 'revenue'];
let creativeLabelHistory = [];
let currentCampaignCreatives = [];

const campaignRows = [
  { campaign: 'SUMMIT 2026', key: 'summit', business: 'outdoor', businessLabel: '아웃도어', channel: 'Google Ads', status: '운영중', cost: 8600000, impressions: 236000, views: 118000, clicks: 7840, conversions: 322, revenue: 28400000 },
  { campaign: 'SUMMIT 2026', key: 'summit', business: 'sports', businessLabel: '스포츠', channel: 'Meta', status: '운영중', cost: 6900000, impressions: 214000, views: 96400, clicks: 6360, conversions: 248, revenue: 21100000 },
  { campaign: 'TRAIL RUNNING', key: 'trail', business: 'sports', businessLabel: '스포츠', channel: 'Naver', status: '운영중', cost: 5700000, impressions: 148000, views: 72100, clicks: 4910, conversions: 191, revenue: 16800000 },
  { campaign: 'SEASON OFF', key: 'season', business: 'outdoor', businessLabel: '아웃도어', channel: 'Meta', status: '종료', cost: 4200000, impressions: 173000, views: 88700, clicks: 4120, conversions: 156, revenue: 12700000 },
];
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const readJsonResponse = async response => {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) return response.json();
  const message = [404, 405].includes(response.status)
    ? '새 데이터 API를 적용하려면 Launcher 미리보기를 다시 실행해주세요.'
    : `데이터 응답 형식이 올바르지 않습니다. (${response.status})`;
  return { error: message };
};
const campaignKpiDefinitions = [
  { key: 'impressions', label: '노출수', goal: 92, yoy: 108 }, { key: 'clicks', label: '클릭수', goal: 86, yoy: 104 }, { key: 'views', label: '조회수', goal: 78, yoy: 112 },
  { key: 'cost', label: '비용', goal: 81, yoy: 96 }, { key: 'conversions', label: '구매(GA)', goal: 88, yoy: 109 }, { key: 'revenue', label: '매출액(GA)', goal: 95, yoy: 118 }, { key: 'sessions', label: '세션수', comparison: false },
  { key: 'cpm', label: 'CPM', goal: 84, yoy: 103 }, { key: 'ctr', label: 'CTR', goal: 91, yoy: 106 }, { key: 'cpv', label: 'CPV', goal: 76, yoy: 98 },
  { key: 'purchaseRate', label: '구매전환율(GA)', goal: 87, yoy: 111 }, { key: 'cpo', label: 'CPO', goal: 82, yoy: 94 }, { key: 'roas', label: 'ROAS', goal: 97, yoy: 121 }, { key: 'users', label: '총 사용자수', comparison: false },
];
const campaignKpiComparison = definition => definition.comparison === false
  ? ''
  : `<small class="${definition.goal >= 100 ? 'positive' : 'negative'}"><b>${definition.goal >= 100 ? '▲' : '▼'} ${definition.goal}%</b> 목표 대비</small><small class="${definition.yoy >= 100 ? 'positive' : 'negative'}"><b>${definition.yoy >= 100 ? '▲' : '▼'} ${definition.yoy}%</b> YoY 대비</small>`;
const trendColors = ['#48d9ff', '#ff8ca2', '#a99eff'];
let selectedTrendMetrics = ['cost', 'revenue'];
let trendTimeUnit = 'daily';
let campaignMediaOptions = [];
let legacyCampaignMediaOptions = [];
let campaignFilterRows = [];
let selectedCampaignMedia = new Set();
let campaignMetricRequestId = 0;
let campaignMediaTableRequestId = 0;
let campaignMixRequestId = 0;
let weeklyGaViewMode = 'combined';
let latestWeeklyGaRows = [];
let weeklyMediaViewMode = 'combined';
let latestWeeklyMediaRows = [];
let latestWeeklyMediaTotal = {};
let latestWeeklyMediaBusinessProgress = [];
let latestMediaDetailRows = [];
let latestMediaDailyRows = [];
let latestMediaCreativeRows = [];
let latestMediaHistoryRows = [];
let dialogCreativeRows = [];
let creativeSort = { key: 'cost', direction: 'desc' };

function makeTrendChart(period) {
  const { labels, revenue, cost } = trends[period];
  const width = 720;
  const height = 245;
  const padding = { x: 18, top: 20, bottom: 34 };
  const max = Math.max(...revenue) * 1.12;
  const point = (value, index) => ({
    x: padding.x + index * ((width - padding.x * 2) / (labels.length - 1)),
    y: padding.top + (height - padding.top - padding.bottom) * (1 - value / max),
  });
  const path = values => values.map((value, index) => `${index ? 'L' : 'M'} ${point(value, index).x} ${point(value, index).y}`).join(' ');
  const revenuePath = path(revenue);
  const costPath = path(cost);
  const areaPath = `${revenuePath} L ${point(revenue.at(-1), revenue.length - 1).x} ${height - padding.bottom} L ${padding.x} ${height - padding.bottom} Z`;

  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="기간별 매출과 광고비 추이">
    <defs><linearGradient id="area-red" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7c6cff" stop-opacity=".3"/><stop offset="1" stop-color="#48d9ff" stop-opacity="0"/></linearGradient></defs>
    ${[0, 1, 2, 3].map(i => `<line class="grid-line" x1="${padding.x}" y1="${padding.top + i * 52}" x2="${width - padding.x}" y2="${padding.top + i * 52}"/>`).join('')}
    <path class="area" d="${areaPath}"/><path class="cost-line" pathLength="1" d="${costPath}"/><path class="revenue-line" pathLength="1" d="${revenuePath}"/>
    ${revenue.map((value, index) => `<circle class="chart-point" cx="${point(value, index).x}" cy="${point(value, index).y}" r="4"/>`).join('')}
    ${labels.map((label, index) => `<rect class="chart-hit-area" x="${Math.max(0, point(0, index).x - 38)}" y="0" width="76" height="${height - padding.bottom}" tabindex="0" data-label="${label}" data-revenue="${revenue[index]}" data-cost="${cost[index]}" aria-label="${label}, 매출 ${revenue[index]}백만원, 광고비 ${cost[index]}백만원"/>`).join('')}
    ${labels.map((label, index) => `<text class="axis-label" x="${point(0, index).x}" y="${height - 8}" text-anchor="middle">${label}</text>`).join('')}
  </svg>`;
}

async function render() {
  const requestId = ++overviewMetricRequestId;
  const overview = document.querySelector('#overview');
  overview.innerHTML = '<p class="empty-state">실제 성과 데이터를 불러오는 중…</p>';
  const query = (start, end) => new URLSearchParams({ business: activeOverviewBusiness, start, end });
  try {
    const [currentResponse, comparisonResponse] = await Promise.all([
      fetch(`/api/overview-metrics?${query(startDate.value, endDate.value)}`, { headers: { Accept: 'application/json' } }),
      fetch(`/api/overview-metrics?${query(comparisonStartDate.value, comparisonEndDate.value)}`, { headers: { Accept: 'application/json' } }),
    ]);
    const [currentData, comparisonData] = await Promise.all([currentResponse.json(), comparisonResponse.json()]);
    if (!currentResponse.ok) throw new Error(currentData.error || '현재 기간 데이터를 불러오지 못했습니다.');
    if (!comparisonResponse.ok) throw new Error(comparisonData.error || '비교 기간 데이터를 불러오지 못했습니다.');
    if (requestId !== overviewMetricRequestId) return;
    const values = currentData.metrics;
    const comparisonValues = comparisonData.metrics;
  const definitions = campaignKpiDefinitions.filter(item => !['sessions', 'users'].includes(item.key));
  const format = (key, value) => ['ctr', 'purchaseRate', 'roas'].includes(key) ? `${Number(value || 0).toFixed(key === 'roas' ? 0 : 2)}%` : number.format(Math.round(Number(value) || 0));
  const comparisonGap = key => {
    const current = Number(values[key]) || 0;
    const comparison = Number(comparisonValues[key]) || 0;
    if (!comparison) return '<small class="actual-data"><b>–</b> 비교 기간 대비</small>';
    const gap = (current - comparison) / comparison * 100;
    const positive = gap >= 0;
    return `<small class="${positive ? 'positive' : 'negative'}"><b>${positive ? '▲' : '▼'} ${Math.abs(gap).toFixed(1)}%</b> 비교 기간 대비</small>`;
  };
    overview.innerHTML = definitions.map(definition => `<article class="campaign-kpi ${definition.label === 'ROAS' ? 'accent' : ''}"><span>${definition.label}</span><strong>${format(definition.key, values[definition.key])}</strong><div class="kpi-progress">${comparisonGap(definition.key)}</div></article>`).join('');
    renderMediaOverview(currentData.channels, values.cost);
    renderDailyTrend(currentData.trend);
  } catch (error) {
    if (requestId !== overviewMetricRequestId) return;
    overview.innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>`;
    document.querySelector('#media-overview').innerHTML = '<p class="empty-state">실제 데이터를 불러오지 못했습니다.</p>';
    document.querySelector('#daily-trend').innerHTML = '<p class="empty-state">실제 데이터를 불러오지 못했습니다.</p>';
  }
}

function renderMediaOverview(rows, totalCost) {
  const colors = ['#48d9ff', '#7c6cff', '#ff7a93', '#62e2c2'];
  const parts = rows.map((row, index) => ({ ...row, color: colors[index % colors.length], share: totalCost ? row.cost / totalCost * 100 : 0 }));
  let offset = 0;
  const stops = parts.map(item => {
    const start = offset;
    offset += item.share;
    return `${item.color} ${start}% ${offset}%`;
  }).join(', ');
  document.querySelector('#media-overview').innerHTML = rows.length ? `
    <div class="donut" style="background:conic-gradient(${stops})"><div><small>광고비</small><strong>${number.format(totalCost)}</strong></div></div>
    <div class="media-list">${parts.map(item => `<div><span><i style="background:${item.color}"></i>${escapeHtml(item.channel)}</span><strong>${number.format(item.cost)} <em>${item.share.toFixed(1)}%</em></strong></div>`).join('')}</div>` : '<p class="empty-state">해당 매체 데이터가 없습니다.</p>';
}

function renderDailyTrend(rows) {
  const labels = rows.map(row => `${Number(row.date.slice(5, 7))}/${Number(row.date.slice(8, 10))}`);
  const costs = rows.map(row => row.cost);
  const revenues = rows.map(row => row.revenue);
  const width = 850, height = 250, left = 34, bottom = 34, top = 22;
  const maxCost = Math.max(...costs, 1) * 1.15;
  const maxRevenue = Math.max(...revenues, 1) * 1.2;
  if (!rows.length) {
    document.querySelector('#daily-trend').innerHTML = '<p class="empty-state">선택한 기간의 데이터가 없습니다.</p>';
    return;
  }
  const step = (width - left * 2) / rows.length;
  const line = revenues.map((value, index) => `${index ? 'L' : 'M'} ${left + step * index + step / 2} ${top + (height - top - bottom) * (1 - value / maxRevenue)}`).join(' ');
  document.querySelector('#daily-trend').innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="광고비 막대와 매출 선 그래프">
    ${[0,1,2,3].map(i => `<line class="daily-grid" x1="${left}" y1="${top + i * 55}" x2="${width-left}" y2="${top + i * 55}"/>`).join('')}
    ${costs.map((value, index) => `<rect class="daily-bar" x="${left + step * index + step * .2}" y="${top + (height-top-bottom)*(1-value/maxCost)}" width="${step*.6}" height="${(height-top-bottom)*value/maxCost}" rx="4"/>`).join('')}
    <path class="daily-line" d="${line}"/>
    ${revenues.map((value, index) => `<circle class="daily-point" cx="${left + step * index + step/2}" cy="${top+(height-top-bottom)*(1-value/maxRevenue)}" r="3"><title>${rows[index].date} · 매출 ${won.format(value)}</title></circle>`).join('')}
    ${labels.map((label,index) => `<text class="daily-label" x="${left+step*index+step/2}" y="${height-8}" text-anchor="middle">${label}</text>`).join('')}
  </svg>`;
}

const formatAnimatedValue = (value, format) => {
  if (format === 'number') return number.format(Math.round(value));
  if (format === 'currency') return number.format(Math.round(value));
  if (format === 'integer-percent') return `${Math.round(value)}%`;
  if (format === 'percent') return `${value.toFixed(1)}%`;
  return number.format(Math.round(value));
};

function animateCounter(element, duration = 1100) {
  const target = Number(element.dataset.target);
  const format = element.dataset.format;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    element.textContent = formatAnimatedValue(target, format);
    return;
  }
  const start = performance.now();
  const tick = now => {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    element.textContent = formatAnimatedValue(target * eased, format);
    if (progress < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function runEntranceAnimations() {
  document.querySelectorAll('[data-target]').forEach((element, index) => {
    window.setTimeout(() => animateCounter(element), 130 + index * 85);
  });
}

function renderCampaignReport() {
  const campaign = document.querySelector('#campaign-select').value;
  const business = document.querySelector('#campaign-business').value;
  const periodFactor = getPeriodDayCount() / 30;
  const rows = campaignRows.filter(row => (campaign === 'all' || row.key === campaign) && (business === 'all' || row.business === business) && selectedCampaignMedia.has(row.channel)).map(row => ({ ...row, impressions: Math.round(row.impressions * periodFactor), views: Math.round(row.views * periodFactor), clicks: Math.round(row.clicks * periodFactor), cost: Math.round(row.cost * periodFactor), conversions: Math.round(row.conversions * periodFactor), revenue: Math.round(row.revenue * periodFactor) }));
  const metrics = calculateMetrics(rows);
  const views = rows.reduce((sum, row) => sum + row.views, 0);
  const cpm = metrics.impressions ? metrics.cost / metrics.impressions * 1000 : 0;
  const cpv = views ? metrics.cost / views : 0;
  const purchaseRate = metrics.clicks ? metrics.conversions / metrics.clicks * 100 : 0;
  const cpo = metrics.conversions ? metrics.cost / metrics.conversions : 0;
  const kpiValues = { impressions: metrics.impressions, clicks: metrics.clicks, views, cost: metrics.cost, conversions: metrics.conversions, revenue: metrics.revenue, sessions: 0, cpm, ctr: metrics.ctr, cpv, purchaseRate, cpo, roas: metrics.roas, users: 0 };
  const formatKpi = (key, value) => ['ctr', 'purchaseRate', 'roas'].includes(key) ? `${value.toFixed(key === 'roas' ? 0 : 2)}%` : number.format(Math.round(value));
  document.querySelector('#campaign-kpis').innerHTML = campaignKpiDefinitions.map(definition => `<article class="campaign-kpi ${definition.label === 'ROAS' ? 'accent' : ''} ${selectedTrendMetrics.includes(definition.key) ? 'selected' : ''}" role="button" tabindex="0" data-kpi-key="${definition.key}" aria-pressed="${selectedTrendMetrics.includes(definition.key)}"><span>${definition.label}</span><strong>${formatKpi(definition.key, kpiValues[definition.key])}</strong><div class="kpi-progress">${campaignKpiComparison(definition)}</div></article>`).join('');
  renderCampaignTrend(rows, kpiValues);

  document.querySelector('#campaign-table-body').innerHTML = '<tr><td colspan="12" class="empty-state">GA 데이터 불러오는 중…</td></tr>';
  loadCampaignMediaMetrics();
}

async function loadCampaignMediaMetrics() {
  const campaign = document.querySelector('#campaign-select').value;
  const business = document.querySelector('#campaign-business').value;
  const requestId = ++campaignMetricRequestId;
  const mediaKeys = ['impressions', 'clicks', 'views', 'cost', 'cpm', 'ctr', 'cpv', 'conversions', 'revenue', 'purchaseRate', 'cpo', 'roas', 'sessions', 'users'];
  mediaKeys.forEach(key => document.querySelector(`[data-kpi-key="${key}"]`)?.classList.add('loading'));
  try {
    const params = new URLSearchParams({ campaign, business, media: [...selectedCampaignMedia].join(','), start: startDate.value, end: endDate.value });
    const response = await fetch(`/api/campaign-media-metrics?${params}`, { headers: { Accept: 'application/json' } });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '매체 데이터를 불러오지 못했습니다.');
    if (requestId !== campaignMetricRequestId) return;
    const format = (key, value) => ['ctr', 'purchaseRate', 'roas'].includes(key) ? `${value.toFixed(key === 'roas' ? 0 : 2)}%` : number.format(Math.round(value));
    mediaKeys.forEach(key => {
      const card = document.querySelector(`[data-kpi-key="${key}"]`);
      if (!card) return;
      card.classList.remove('loading', 'load-error');
      card.querySelector('strong').textContent = format(key, result.metrics[key]);
      const definition = campaignKpiDefinitions.find(item => item.key === key);
      card.querySelector('.kpi-progress').innerHTML = campaignKpiComparison(definition);
    });
    renderCampaignTrend(result.trend);
    latestWeeklyGaRows = result.weeklyGa;
    renderWeeklyGaTable(latestWeeklyGaRows);
  } catch (error) {
    if (requestId !== campaignMetricRequestId) return;
    mediaKeys.forEach(key => {
      const card = document.querySelector(`[data-kpi-key="${key}"]`);
      if (!card) return;
      card.classList.remove('loading');
      card.classList.add('load-error');
      card.querySelector('strong').textContent = '조회 실패';
      card.querySelector('.kpi-progress').innerHTML = `<small class="actual-data">${error.message}</small>`;
    });
    document.querySelector('#campaign-table-body').innerHTML = `<tr><td colspan="12" class="empty-state">${error.message}</td></tr>`;
  }
}

async function loadCampaignMediaTable() {
  const tableBody = document.querySelector('#campaign-media-detail-body');
  const campaign = document.querySelector('#campaign-select').value;
  const requestId = ++campaignMediaTableRequestId;
  tableBody.innerHTML = '<tr><td colspan="19" class="empty-state">매체 데이터를 불러오는 중…</td></tr>';
  try {
    const today = new Date();
    const yesterday = addDays(today, -1);
    const operationDates = campaignFilterRows
      .filter(row => campaign === 'all' || row.campaign === campaign)
      .map(row => String(row.operationStart ?? '').match(/(\d{1,2})월\s*(\d{1,2})일/))
      .filter(Boolean)
      .map(match => new Date(today.getFullYear(), Number(match[1]) - 1, Number(match[2])));
    const cumulativeStart = operationDates.length ? new Date(Math.min(...operationDates)) : new Date(today.getFullYear(), 0, 1);
    const params = new URLSearchParams({ campaign, start: toInputDate(cumulativeStart), end: toInputDate(yesterday) });
    const response = await fetch(`/api/campaign-media-table?${params}`, { headers: { Accept: 'application/json' } });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '매체 데이터를 불러오지 못했습니다.');
    if (requestId !== campaignMediaTableRequestId) return;
    renderBusinessProgress(result.businessProgress ?? [], result.rows);
    renderGoalKpiGaps(result.rows);
    latestWeeklyMediaRows = result.weeklyMedia ?? [];
    latestWeeklyMediaTotal = result.weeklyTotal ?? {};
    latestWeeklyMediaBusinessProgress = result.businessProgress ?? [];
    latestMediaDetailRows = result.rows ?? [];
    latestMediaDailyRows = result.mediaDaily ?? [];
    latestMediaCreativeRows = result.mediaCreative ?? [];
    latestMediaHistoryRows = result.mediaHistory ?? [];
    renderWeeklyMediaTable();
    renderDailyMediaPerformance(result.dailyMedia ?? []);
    if (!result.rows.length) {
      tableBody.innerHTML = '<tr><td colspan="19" class="empty-state">선택한 캠페인의 미디어믹스 데이터가 없습니다.</td></tr>';
      return;
    }
    const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
    const integer = value => number.format(Math.round(value));
    const percent = (value, digits = 2) => `${Number(value).toFixed(digits)}%`;
    const operationDate = value => {
      const match = String(value ?? '').match(/(\d{1,2})월\s*(\d{1,2})일/);
      return match ? `${Number(match[1])}/${Number(match[2])}` : String(value || '-');
    };
    const kpiClasses = { '도달': 'reach', '조회': 'view', '트래픽': 'traffic', '전환': 'conversion' };
    const achievementGap = (actual, target) => {
      if (!target) return '';
      const rate = actual / target * 100;
      const state = rate >= 100 ? 'progress-high' : 'progress-low';
      return `<small class="media-inline-gap ${state}">${rate.toFixed(0)}%</small>`;
    };
    const differenceGap = (key, actual, target) => {
      if (!target) return '';
      const gap = actual - target;
      const lowerIsBetter = ['cpm', 'cpc', 'cpv', 'cpo'].includes(key);
      const positive = lowerIsBetter ? gap <= 0 : gap >= 0;
      const state = Math.abs(gap) < .005 ? 'progress-neutral' : positive ? 'progress-high' : 'progress-low';
      const sign = gap > 0 ? '+' : gap < 0 ? '−' : '';
      const formatted = ['ctr', 'vtr', 'cvr', 'roas'].includes(key)
        ? `${sign}${Math.abs(gap).toFixed(key === 'roas' ? 0 : 2)}%p`
        : `${sign}${integer(Math.abs(gap))}`;
      return `<small class="media-inline-gap ${state}">${formatted}</small>`;
    };
    const metricCell = (value, gap = '') => `<td><div class="media-value-with-gap"><strong>${value}</strong>${gap}</div></td>`;
    const calculateRowMetrics = values => ({
      ...values,
      cpm: values.impressions ? values.cost / values.impressions * 1000 : 0,
      cpc: values.clicks ? values.cost / values.clicks : 0,
      cpv: values.views ? values.cost / values.views : 0,
      ctr: values.impressions ? values.clicks / values.impressions * 100 : 0,
      vtr: values.impressions ? values.views / values.impressions * 100 : 0,
      cpo: values.purchases ? values.cost / values.purchases : 0,
      cvr: values.clicks ? values.purchases / values.clicks * 100 : 0,
      roas: values.cost ? values.revenue / values.cost * 100 : 0,
    });
    const aggregateBusiness = business => {
      const businessRows = result.rows.filter(row => row.business === business);
      const sum = source => businessRows.reduce((total, row) => {
        ['cost', 'impressions', 'clicks', 'views', 'purchases', 'revenue'].forEach(key => { total[key] += source(row)[key]; });
        return total;
      }, { cost: 0, impressions: 0, clicks: 0, views: 0, purchases: 0, revenue: 0 });
      const dateValue = value => {
        const match = String(value ?? '').match(/(\d{1,2})월\s*(\d{1,2})일/);
        return match ? Number(match[1]) * 100 + Number(match[2]) : 9999;
      };
      const starts = businessRows.map(row => row.operationStart).sort((a, b) => dateValue(a) - dateValue(b));
      const ends = businessRows.map(row => row.operationEnd).sort((a, b) => dateValue(b) - dateValue(a));
      const actual = sum(row => row);
      const serverTotal = result.businessProgress?.find(item => item.business === business);
      if (serverTotal) {
        actual.purchases = serverTotal.actual.purchases;
        actual.revenue = serverTotal.actual.revenue;
      }
      return { business, operationStart: starts[0] ?? '', operationEnd: ends[0] ?? '', ...calculateRowMetrics(actual), target: calculateRowMetrics(sum(row => row.target)) };
    };
    const renderTotalRow = row => {
      const inactive = row.impressions === 0;
      const gap = (builder, ...args) => inactive ? '' : builder(...args);
      const period = `${operationDate(row.operationStart)}–${operationDate(row.operationEnd)}`;
      return `<tr class="media-result-row media-total-row ${inactive ? 'media-inactive-row' : ''}" data-business="${row.business}" data-kpi="TOTAL"><td><span class="media-attribute-badge business-${row.business.toLowerCase()}">${row.business}</span></td><td><span class="media-attribute-badge kpi-total">TOTAL</span></td><td><strong>전체</strong></td><td><strong class="media-total-label">전체 매체 합계</strong></td><td>${period}</td>${metricCell(integer(row.cost), gap(achievementGap, row.cost, row.target.cost))}${metricCell(integer(row.impressions), gap(achievementGap, row.impressions, row.target.impressions))}${metricCell(integer(row.clicks), gap(achievementGap, row.clicks, row.target.clicks))}${metricCell(integer(row.views), gap(achievementGap, row.views, row.target.views))}${metricCell(integer(row.cpm), gap(differenceGap, 'cpm', row.cpm, row.target.cpm))}${metricCell(integer(row.cpc), gap(differenceGap, 'cpc', row.cpc, row.target.cpc))}${metricCell(integer(row.cpv), gap(differenceGap, 'cpv', row.cpv, row.target.cpv))}${metricCell(percent(row.ctr), gap(differenceGap, 'ctr', row.ctr, row.target.ctr))}${metricCell(percent(row.vtr), gap(differenceGap, 'vtr', row.vtr, row.target.vtr))}${metricCell(integer(row.purchases), gap(achievementGap, row.purchases, row.target.purchases))}${metricCell(integer(row.revenue), gap(achievementGap, row.revenue, row.target.revenue))}${metricCell(integer(row.cpo), gap(differenceGap, 'cpo', row.cpo, row.target.cpo))}${metricCell(percent(row.cvr), gap(differenceGap, 'cvr', row.cvr, row.target.cvr))}${metricCell(percent(row.roas, 0), gap(differenceGap, 'roas', row.roas, row.target.roas))}</tr>`;
    };
    const totalRows = ['MKT', 'PERF'].map(aggregateBusiness).map(renderTotalRow).join('');
    const detailRows = result.rows.map((row, index) => {
      const previous = result.rows[index - 1];
      const groupStart = !previous || previous.business !== row.business || previous.kpi !== row.kpi;
      const inactive = row.impressions === 0;
      const period = `${operationDate(row.operationStart)}–${operationDate(row.operationEnd)}`;
      const gap = (builder, ...args) => inactive ? '' : builder(...args);
      return `<tr class="media-result-row media-drilldown-row ${groupStart ? 'attribute-group-start' : ''} ${inactive ? 'media-inactive-row' : ''}" data-business="${escapeHtml(row.business)}" data-kpi="${escapeHtml(row.kpi)}" data-media-ad-type="${escapeHtml(row.mediaAdType)}" tabindex="0" aria-label="${escapeHtml(row.media)} 일자별 상세 보기"><td><span class="media-attribute-badge business-${row.business.toLowerCase()}">${escapeHtml(row.business)}</span></td><td><span class="media-attribute-badge kpi-${kpiClasses[row.kpi] ?? 'other'}">${escapeHtml(row.kpi || '-')}</span></td><td>${escapeHtml(row.platform)}</td><td><strong>${escapeHtml(row.media)}</strong></td><td>${escapeHtml(period)}</td>${metricCell(integer(row.cost), gap(achievementGap, row.cost, row.target.cost))}${metricCell(integer(row.impressions), gap(achievementGap, row.impressions, row.target.impressions))}${metricCell(integer(row.clicks), gap(achievementGap, row.clicks, row.target.clicks))}${metricCell(integer(row.views), gap(achievementGap, row.views, row.target.views))}${metricCell(integer(row.cpm), gap(differenceGap, 'cpm', row.cpm, row.target.cpm))}${metricCell(integer(row.cpc), gap(differenceGap, 'cpc', row.cpc, row.target.cpc))}${metricCell(integer(row.cpv), gap(differenceGap, 'cpv', row.cpv, row.target.cpv))}${metricCell(percent(row.ctr), gap(differenceGap, 'ctr', row.ctr, row.target.ctr))}${metricCell(percent(row.vtr), gap(differenceGap, 'vtr', row.vtr, row.target.vtr))}${metricCell(integer(row.purchases), gap(achievementGap, row.purchases, row.target.purchases))}${metricCell(integer(row.revenue), gap(achievementGap, row.revenue, row.target.revenue))}${metricCell(integer(row.cpo), gap(differenceGap, 'cpo', row.cpo, row.target.cpo))}${metricCell(percent(row.cvr), gap(differenceGap, 'cvr', row.cvr, row.target.cvr))}${metricCell(percent(row.roas, 0), gap(differenceGap, 'roas', row.roas, row.target.roas))}</tr>`;
    }).join('');
    tableBody.innerHTML = totalRows + detailRows;
  } catch (error) {
    if (requestId !== campaignMediaTableRequestId) return;
    tableBody.innerHTML = `<tr><td colspan="19" class="empty-state">${error.message}</td></tr>`;
  }
}

function renderWeeklyMediaTable() {
  const body = document.querySelector('#campaign-media-weekly-body');
  const businessMode = weeklyMediaViewMode === 'business';
  document.querySelector('.media-weekly-table').classList.toggle('business-mode', businessMode);
  document.querySelector('#weekly-media-business-header').hidden = !businessMode;
  const columnCount = businessMode ? 9 : 8;
  const integer = value => number.format(Math.round(Number(value) || 0));
  const percent = (value, digits = 2) => `${Number(value || 0).toFixed(digits)}%`;
  const calculate = values => ({ ...values, ctr: values.impressions ? values.clicks / values.impressions * 100 : 0, roas: values.cost ? values.revenue / values.cost * 100 : 0 });
  const sum = rows => calculate(rows.reduce((total, row) => {
    ['cost', 'impressions', 'clicks', 'purchases', 'revenue'].forEach(key => { total[key] += Number(row[key]) || 0; });
    return total;
  }, { cost: 0, impressions: 0, clicks: 0, purchases: 0, revenue: 0 }));
  const groups = new Map();
  latestWeeklyMediaRows.forEach(row => {
    const key = businessMode ? `${row.weekStart}\u0000${row.business}` : row.weekStart;
    if (!groups.has(key)) groups.set(key, { weekStart: row.weekStart, business: businessMode ? row.business : '', rows: [] });
    groups.get(key).rows.push(row);
  });
  const displayRows = [...groups.values()].map(group => ({ ...group, ...sum(group.rows) })).sort((a, b) => b.weekStart.localeCompare(a.weekStart) || a.business.localeCompare(b.business));
  const totals = businessMode
    ? latestWeeklyMediaBusinessProgress.filter(item => ['MKT', 'PERF'].includes(item.business)).map(item => ({ business: item.business, ...calculate(item.actual) }))
    : [{ business: '', ...latestWeeklyMediaTotal }];
  const totalRows = totals.map(total => `<tr class="media-weekly-total"><td><strong>TOTAL</strong></td>${businessMode ? `<td><span class="media-attribute-badge business-${total.business.toLowerCase()}">${total.business}</span></td>` : ''}<td>${integer(total.cost)}</td><td>${integer(total.impressions)}</td><td>${integer(total.clicks)}</td><td>${percent(total.ctr)}</td><td>${integer(total.purchases)}</td><td>${integer(total.revenue)}</td><td>${percent(total.roas, 0)}</td></tr>`).join('');
  const delta = (current, previous) => {
    if (previous === undefined || previous === null || previous === 0) return '<small class="ga-delta neutral">기준 주차</small>';
    const change = (current - previous) / previous * 100;
    return `<small class="ga-delta ${change >= 0 ? 'up' : 'down'}">${change >= 0 ? '▲' : '▼'} ${Math.abs(change).toFixed(1)}%</small>`;
  };
  const cell = (value, previous, formatted) => `<td><div class="ga-cell"><strong>${formatted}</strong>${delta(value, previous)}</div></td>`;
  const weeklyRows = displayRows.map((row, rowIndex) => {
    const week = String(row.weekStart ?? '').slice(2);
    const previous = displayRows.slice(rowIndex + 1).find(item => !businessMode || item.business === row.business);
    return `<tr><td><strong>${week} 주차</strong></td>${businessMode ? `<td><span class="media-attribute-badge business-${row.business.toLowerCase()}">${row.business}</span></td>` : ''}${cell(row.cost, previous?.cost, integer(row.cost))}${cell(row.impressions, previous?.impressions, integer(row.impressions))}${cell(row.clicks, previous?.clicks, integer(row.clicks))}${cell(row.ctr, previous?.ctr, percent(row.ctr))}${cell(row.purchases, previous?.purchases, integer(row.purchases))}${cell(row.revenue, previous?.revenue, integer(row.revenue))}${cell(row.roas, previous?.roas, percent(row.roas, 0))}</tr>`;
  }).join('');
  body.innerHTML = totalRows + (weeklyRows || `<tr><td colspan="${columnCount}" class="empty-state">조회된 주차별 데이터가 없습니다.</td></tr>`);
}

function renderDailyMediaPerformance(sourceRows = []) {
  const chart = document.querySelector('#campaign-media-daily-chart');
  const body = document.querySelector('#campaign-media-daily-body');
  const dailyMap = new Map();
  sourceRows.forEach(row => {
    if (!dailyMap.has(row.metricDate)) dailyMap.set(row.metricDate, { metricDate: row.metricDate, cost: 0, impressions: 0, clicks: 0, views: 0, purchases: 0, revenue: 0 });
    const daily = dailyMap.get(row.metricDate);
    ['cost', 'impressions', 'clicks', 'views', 'purchases', 'revenue'].forEach(key => { daily[key] += Number(row[key]) || 0; });
  });
  const calculate = row => ({
    ...row,
    cpm: row.impressions ? row.cost / row.impressions * 1000 : 0,
    cpc: row.clicks ? row.cost / row.clicks : 0,
    cpv: row.views ? row.cost / row.views : 0,
    ctr: row.impressions ? row.clicks / row.impressions * 100 : 0,
    vtr: row.impressions ? row.views / row.impressions * 100 : 0,
    cpo: row.purchases ? row.cost / row.purchases : 0,
    cvr: row.clicks ? row.purchases / row.clicks * 100 : 0,
    roas: row.cost ? row.revenue / row.cost * 100 : 0,
  });
  const rows = [...dailyMap.values()].map(calculate).sort((a, b) => a.metricDate.localeCompare(b.metricDate));
  if (!rows.length) {
    chart.innerHTML = '<p class="empty-state">조회된 일자별 그래프 데이터가 없습니다.</p>';
    body.innerHTML = '<tr><td colspan="15" class="empty-state">조회된 일자별 데이터가 없습니다.</td></tr>';
    return;
  }
  const points = rows.slice(-31);
  const width = 1080, height = 175, left = 38, right = 24, top = 16, bottom = 28;
  const plotHeight = height - top - bottom;
  const step = (width - left - right) / points.length;
  const maxCost = Math.max(...points.map(row => row.cost), 1) * 1.12;
  const maxRevenue = Math.max(...points.map(row => row.revenue), 1) * 1.12;
  const x = index => left + step * index + step / 2;
  const revenueY = value => top + plotHeight * (1 - value / maxRevenue);
  const revenuePath = points.map((row, index) => `${index ? 'L' : 'M'} ${x(index)} ${revenueY(row.revenue)}`).join(' ');
  const labelInterval = Math.max(1, Math.ceil(points.length / 10));
  chart.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="최근 ${points.length}일 광고비와 매출 추이">${[0,1,2,3,4].map(index => `<line class="daily-grid" x1="${left}" y1="${top + plotHeight * index / 4}" x2="${width-right}" y2="${top + plotHeight * index / 4}"/>`).join('')}${points.map((row, index) => { const barHeight = plotHeight * row.cost / maxCost; return `<rect class="daily-media-cost-bar" x="${left + step * index + step * .2}" y="${top + plotHeight - barHeight}" width="${step * .6}" height="${barHeight}" rx="3"/>`; }).join('')}<path class="daily-media-revenue-line" d="${revenuePath}"/>${points.map((row,index) => `<circle class="daily-media-revenue-point" cx="${x(index)}" cy="${revenueY(row.revenue)}" r="3"/>`).join('')}${points.map((row,index) => index % labelInterval === 0 || index === points.length - 1 ? `<text class="daily-label" x="${x(index)}" y="${height-8}" text-anchor="middle">${Number(row.metricDate.slice(5,7))}/${Number(row.metricDate.slice(8,10))}</text>` : '').join('')}</svg>`;
  const integer = value => number.format(Math.round(value));
  const percent = (value, digits = 2) => `${Number(value).toFixed(digits)}%`;
  body.innerHTML = rows.map(row => `<tr class="media-result-row"><td><strong>${row.metricDate.slice(2).replaceAll('-', '/')}</strong></td><td>${integer(row.cost)}</td><td>${integer(row.impressions)}</td><td>${integer(row.clicks)}</td><td>${integer(row.views)}</td><td>${integer(row.cpm)}</td><td>${integer(row.cpc)}</td><td>${integer(row.cpv)}</td><td>${percent(row.ctr)}</td><td>${percent(row.vtr)}</td><td>${integer(row.purchases)}</td><td>${integer(row.revenue)}</td><td>${integer(row.cpo)}</td><td>${percent(row.cvr)}</td><td>${percent(row.roas, 0)}</td></tr>`).join('');
}

function openMediaDetailDialog(mediaAdType) {
  const dialog = document.querySelector('#media-detail-dialog');
  const groupRows = latestMediaDetailRows.filter(row => row.mediaAdType === mediaAdType);
  const dailySource = latestMediaDailyRows.filter(row => row.mediaAdType === mediaAdType);
  const creativeSource = latestMediaCreativeRows.filter(row => row.mediaAdType === mediaAdType);
  const historyByDate = new Map();
  latestMediaHistoryRows.filter(row => row.mediaAdType === mediaAdType).forEach(row => {
    if (!historyByDate.has(row.date)) historyByDate.set(row.date, []);
    historyByDate.get(row.date).push(row.history);
  });
  if (!groupRows.length) return;
  const integer = value => number.format(Math.round(Number(value) || 0));
  const percent = (value, digits = 2) => `${Number(value || 0).toFixed(digits)}%`;
  const calculate = row => ({ ...row, cpm: row.impressions ? row.cost / row.impressions * 1000 : 0, cpc: row.clicks ? row.cost / row.clicks : 0, cpv: row.views ? row.cost / row.views : 0, ctr: row.impressions ? row.clicks / row.impressions * 100 : 0, vtr: row.impressions ? row.views / row.impressions * 100 : 0, cpo: row.purchases ? row.cost / row.purchases : 0, cvr: row.clicks ? row.purchases / row.clicks * 100 : 0, roas: row.cost ? row.revenue / row.cost * 100 : 0 });
  const dailyMap = new Map();
  dailySource.forEach(row => {
    if (!dailyMap.has(row.metricDate)) dailyMap.set(row.metricDate, { metricDate: row.metricDate, cost: 0, impressions: 0, clicks: 0, views: 0, purchases: 0, revenue: 0 });
    const daily = dailyMap.get(row.metricDate);
    ['cost', 'impressions', 'clicks', 'views', 'purchases', 'revenue'].forEach(key => { daily[key] += Number(row[key]) || 0; });
  });
  const dailyRows = [...dailyMap.values()].map(calculate).sort((a, b) => a.metricDate.localeCompare(b.metricDate));
  const first = groupRows[0];
  document.querySelector('#media-detail-dialog-title').textContent = `${first.platform} · ${first.media}`;
  document.querySelector('#media-detail-dialog-subtitle').textContent = `${mediaAdType} · 전일까지 누적 및 일자별 실적`;
  document.querySelector('#media-dialog-daily-body').innerHTML = dailyRows.length ? dailyRows.map(row => {
    const histories = historyByDate.get(row.metricDate) ?? [];
    const historyRow = histories.length ? `<tr class="media-history-row"><td colspan="15"><span>히스토리</span>${histories.map(history => `<p>${escapeHtml(history)}</p>`).join('')}</td></tr>` : '';
    return `<tr><td><strong>${row.metricDate.slice(2).replaceAll('-', '/')}</strong></td><td>${integer(row.cost)}</td><td>${integer(row.impressions)}</td><td>${integer(row.clicks)}</td><td>${integer(row.views)}</td><td>${integer(row.cpm)}</td><td>${integer(row.cpc)}</td><td>${integer(row.cpv)}</td><td>${percent(row.ctr)}</td><td>${percent(row.vtr)}</td><td>${integer(row.purchases)}</td><td>${integer(row.revenue)}</td><td>${integer(row.cpo)}</td><td>${percent(row.cvr)}</td><td>${percent(row.roas, 0)}</td></tr>${historyRow}`;
  }).join('') : '<tr><td colspan="15" class="empty-state">해당 매체의 일자별 데이터가 없습니다.</td></tr>';
  const creativeMap = new Map();
  creativeSource.forEach(row => {
    if (!creativeMap.has(row.adName)) creativeMap.set(row.adName, { adName: row.adName, cost: 0, impressions: 0, clicks: 0, views: 0, purchases: 0, revenue: 0 });
    const creative = creativeMap.get(row.adName);
    ['cost', 'impressions', 'clicks', 'views', 'purchases', 'revenue'].forEach(key => { creative[key] += Number(row[key]) || 0; });
  });
  const creativeRows = [...creativeMap.values()].map(calculate);
  dialogCreativeRows = creativeRows;
  creativeSort = { key: 'cost', direction: 'desc' };
  renderDialogCreativeTable();
  const totalKeys = [['cost', '광고비'], ['impressions', '노출'], ['clicks', '클릭'], ['views', '조회'], ['purchases', '구매수'], ['revenue', '총수익']];
  const sumRows = rows => rows.reduce((total, row) => {
    totalKeys.forEach(([key]) => { total[key] += Number(row[key]) || 0; });
    return total;
  }, Object.fromEntries(totalKeys.map(([key]) => [key, 0])));
  const cumulativeTotal = sumRows(groupRows);
  const compare = rows => {
    const total = sumRows(rows);
    return totalKeys.filter(([key]) => Math.round(total[key]) !== Math.round(cumulativeTotal[key])).map(([, label]) => label);
  };
  const dailyMismatch = compare(dailyRows);
  const creativeMismatch = compare(creativeRows);
  const totalCheck = document.querySelector('#media-detail-total-check');
  totalCheck.classList.toggle('mismatch', dailyMismatch.length > 0 || creativeMismatch.length > 0);
  totalCheck.textContent = `TOTAL 검증 · 누적↔일자 ${dailyMismatch.length ? `불일치(${dailyMismatch.join(', ')})` : '일치'} · 누적↔소재 ${creativeMismatch.length ? `불일치(${creativeMismatch.join(', ')})` : '일치'}`;
  dialog.showModal();
}

function renderDialogCreativeTable() {
  const integer = value => number.format(Math.round(Number(value) || 0));
  const percent = (value, digits = 2) => `${Number(value || 0).toFixed(digits)}%`;
  const direction = creativeSort.direction === 'asc' ? 1 : -1;
  const rows = [...dialogCreativeRows].sort((a, b) => {
    const comparison = creativeSort.key === 'adName'
      ? String(a.adName).localeCompare(String(b.adName), 'ko', { numeric: true })
      : (Number(a[creativeSort.key]) || 0) - (Number(b[creativeSort.key]) || 0);
    return comparison * direction || a.adName.localeCompare(b.adName, 'ko', { numeric: true });
  });
  document.querySelectorAll('#media-dialog-creative-table th[data-sort-key]').forEach(header => {
    const active = header.dataset.sortKey === creativeSort.key;
    header.setAttribute('aria-sort', active ? (creativeSort.direction === 'asc' ? 'ascending' : 'descending') : 'none');
  });
  document.querySelector('#media-dialog-creative-body').innerHTML = rows.length ? rows.map(row => `<tr><td><strong>${escapeHtml(row.adName)}</strong></td><td>${integer(row.cost)}</td><td>${integer(row.impressions)}</td><td>${integer(row.clicks)}</td><td>${integer(row.views)}</td><td>${integer(row.cpm)}</td><td>${integer(row.cpc)}</td><td class="metric-highlight">${integer(row.cpv)}</td><td class="metric-highlight">${percent(row.ctr)}</td><td>${percent(row.vtr)}</td><td>${integer(row.purchases)}</td><td>${integer(row.revenue)}</td><td>${integer(row.cpo)}</td><td>${percent(row.cvr)}</td><td class="metric-highlight">${percent(row.roas, 0)}</td></tr>`).join('') : '<tr><td colspan="15" class="empty-state">해당 매체의 광고소재 데이터가 없습니다.</td></tr>';
}

function renderBusinessProgress(progress = [], rows = []) {
  const container = document.querySelector('#business-progress-cards');
  const fallback = ['MKT', 'PERF'].map(business => {
    const businessRows = rows.filter(row => row.business === business);
    const actual = businessRows.reduce((sum, row) => ({ cost: sum.cost + row.cost, impressions: sum.impressions + row.impressions, clicks: sum.clicks + row.clicks, views: sum.views + row.views, revenue: sum.revenue + row.revenue }), { cost: 0, impressions: 0, clicks: 0, views: 0, revenue: 0 });
    const target = businessRows.reduce((sum, row) => ({ cost: sum.cost + row.target.cost, impressions: sum.impressions + row.target.impressions, clicks: sum.clicks + row.target.clicks, views: sum.views + row.target.views, revenue: sum.revenue + row.target.revenue }), { cost: 0, impressions: 0, clicks: 0, views: 0, revenue: 0 });
    return { business, dateProgress: null, actual, target, rates: Object.fromEntries(Object.keys(actual).map(key => [key, target[key] ? actual[key] / target[key] * 100 : 0])) };
  });
  const values = progress.length ? progress : fallback;
  const definitions = [
    ['cost', '광고비'], ['impressions', '노출'], ['clicks', '클릭'], ['views', '조회'], ['revenue', '총수익'],
  ];
  const formatValue = value => number.format(Math.round(value));
  container.innerHTML = values.map(item => {
    const dateLabel = item.dateProgress === null ? '재시작 후 계산' : `${Math.round(item.dateProgress)}%`;
    const color = item.business === 'MKT' ? '#48d9ff' : '#ff8ca2';
    const metrics = definitions.map(([key, label]) => {
      const rate = item.rates[key] ?? 0;
      const width = Math.min(100, Math.max(0, rate));
      return `<div title="실적 ${formatValue(item.actual[key])} / 목표 ${formatValue(item.target[key])}"><span>${label} <b>${rate.toFixed(0)}%</b></span><i><em style="--progress:${width}%"></em></i></div>`;
    }).join('');
    return `<article class="business-progress-card"><div class="business-card-head"><span><i style="background:${color}"></i>${item.business}</span><strong>날짜 진척률 ${dateLabel}</strong></div><div class="business-metrics"><div class="date-progress-metric"><span>날짜 진척률 <b>${dateLabel}</b></span><i><em style="--progress:${item.dateProgress === null ? 0 : item.dateProgress}%"></em></i></div>${metrics}</div></article>`;
  }).join('');
}

function renderGoalKpiGaps(rows = []) {
  const container = document.querySelector('#goal-kpi-grid');
  const definitions = [
    { kpi: '도달', label: 'REACH', metric: 'cpm', metricLabel: 'CPM', color: '#48d9ff', unit: 'currency' },
    { kpi: '조회', label: 'VIEW', metric: 'cpv', metricLabel: 'CPV', color: '#a99eff', unit: 'currency' },
    { kpi: '트래픽', label: 'TRAFFIC', metric: 'ctr', metricLabel: 'CTR', color: '#ff8ca2', unit: 'percent' },
    { kpi: '전환', label: 'CONVERSION', metric: 'roas', metricLabel: 'ROAS', color: '#62e2c2', unit: 'percent' },
  ];
  const aggregate = goalRows => goalRows.reduce((sum, row) => {
    ['cost', 'impressions', 'clicks', 'views', 'revenue'].forEach(key => { sum.actual[key] += row[key]; sum.target[key] += row.target[key]; });
    return sum;
  }, { actual: { cost: 0, impressions: 0, clicks: 0, views: 0, revenue: 0 }, target: { cost: 0, impressions: 0, clicks: 0, views: 0, revenue: 0 } });
  const metricValue = (metric, values) => ({
    cpm: values.impressions ? values.cost / values.impressions * 1000 : 0,
    cpv: values.views ? values.cost / values.views : 0,
    ctr: values.impressions ? values.clicks / values.impressions * 100 : 0,
    roas: values.cost ? values.revenue / values.cost * 100 : 0,
  })[metric];
  const format = (value, definition) => definition.unit === 'currency' ? `${number.format(Math.round(value))}원` : `${value.toFixed(definition.metric === 'roas' ? 0 : 2)}%`;
  container.innerHTML = definitions.map(definition => {
    const values = aggregate(rows.filter(row => row.kpi === definition.kpi));
    const target = metricValue(definition.metric, values.target);
    const actual = metricValue(definition.metric, values.actual);
    const gap = actual - target;
    const sign = gap > 0 ? '+' : gap < 0 ? '−' : '';
    const gapValue = definition.unit === 'currency' ? `${sign}${number.format(Math.round(Math.abs(gap)))}원` : `${sign}${Math.abs(gap).toFixed(definition.metric === 'roas' ? 0 : 2)}%p`;
    return `<article style="--goal-color:${definition.color}"><div class="goal-kpi-top"><span>${definition.label} · ${definition.metricLabel}</span></div><div class="goal-kpi-value"><strong>${gapValue}</strong></div><div class="goal-kpi-meta"><span>목표 <b>${format(target, definition)}</b></span><span>달성 <b>${format(actual, definition)}</b></span></div></article>`;
  }).join('');
}

function updateCampaignDrilldown(level = 'campaign') {
  const businessSelect = document.querySelector('#campaign-business');
  const previousBusiness = businessSelect.value;
  const campaign = document.querySelector('#campaign-select').value;
  if (level === 'campaign' && campaignFilterRows.length) {
    const businesses = getAvailableBusinesses(campaignFilterRows, campaign);
    businessSelect.innerHTML = businesses.map(business => {
      const option = document.createElement('option');
      option.value = business;
      option.textContent = business;
      return option.outerHTML;
    }).join('');
    businessSelect.value = businesses.includes(previousBusiness) ? previousBusiness : businesses[0] ?? '';
    businessSelect.disabled = businesses.length === 0;
  }
  const business = businessSelect.value;
  campaignMediaOptions = campaignFilterRows.length
    ? getAvailableMedia(campaignFilterRows, campaign, business)
    : legacyCampaignMediaOptions;
  selectedCampaignMedia = new Set(campaignMediaOptions);
  renderCampaignMediaOptions(campaignMediaOptions);
  renderCampaignReport();
}

function renderCampaignMediaOptions(media) {
  const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  const options = document.querySelector('#campaign-media-options');
  options.innerHTML = `<label class="select-all"><input type="checkbox" value="all" ${media.length && selectedCampaignMedia.size === media.length ? 'checked' : ''}><span>전체 매체</span></label>${media.map(channel => `<label><input type="checkbox" value="${escapeHtml(channel)}" ${selectedCampaignMedia.has(channel) ? 'checked' : ''}><span>${escapeHtml(channel)}</span></label>`).join('')}`;
  const summary = document.querySelector('#campaign-media-summary');
  summary.textContent = selectedCampaignMedia.size === media.length ? '전체 매체' : selectedCampaignMedia.size === 1 ? [...selectedCampaignMedia][0] : `${selectedCampaignMedia.size}개 매체`;
}

function handleCampaignMediaChange(input) {
  const mediaInputs = [...document.querySelectorAll('#campaign-media-options input:not([value="all"])')];
  if (input.value === 'all') selectedCampaignMedia = input.checked ? new Set(mediaInputs.map(item => item.value)) : new Set();
  else input.checked ? selectedCampaignMedia.add(input.value) : selectedCampaignMedia.delete(input.value);
  mediaInputs.forEach(item => { item.checked = selectedCampaignMedia.has(item.value); });
  const allInput = document.querySelector('#campaign-media-options input[value="all"]');
  allInput.checked = mediaInputs.length > 0 && selectedCampaignMedia.size === mediaInputs.length;
  document.querySelector('#campaign-media-summary').textContent = allInput.checked ? '전체 매체' : selectedCampaignMedia.size === 1 ? [...selectedCampaignMedia][0] : selectedCampaignMedia.size ? `${selectedCampaignMedia.size}개 매체` : '매체 선택';
  renderCampaignReport();
}

function renderWeeklyGaTable(rows = []) {
  const tableBody = document.querySelector('#campaign-table-body');
  const businessMode = weeklyGaViewMode === 'business';
  document.querySelector('#weekly-business-header').hidden = !businessMode;
  const columnCount = businessMode ? 13 : 12;
  if (!rows.length) {
    tableBody.innerHTML = `<tr><td colspan="${columnCount}" class="empty-state">선택한 조건의 GA 주차 데이터가 없습니다.</td></tr>`;
    return;
  }
  const delta = (current, previous, invert = false) => {
    if (previous === undefined || previous === null || previous === 0) return '<small class="ga-delta neutral">기준 주차</small>';
    const change = (current - previous) / previous * 100;
    const positive = invert ? change <= 0 : change >= 0;
    return `<small class="ga-delta ${positive ? 'up' : 'down'}">${change >= 0 ? '▲' : '▼'} ${Math.abs(change).toFixed(1)}%</small>`;
  };
  const duration = seconds => `${Math.floor(seconds / 60)}분 ${String(seconds % 60).padStart(2, '0')}초`;
  const cell = (value, comparison, formatted = number.format(value), invert = false) => `<td><div class="ga-cell"><strong>${formatted}</strong>${delta(value, comparison, invert)}</div></td>`;
  const modeRows = rows.filter(row => (row.viewMode ?? 'combined') === weeklyGaViewMode
    && (!businessMode || ['MKT', 'PERF'].includes(row.business)));
  const selectedStart = new Date(`${startDate.value}T00:00:00`);
  const selectedEnd = new Date(`${endDate.value}T00:00:00`);
  const visibleRows = modeRows.filter(row => {
    const monday = new Date(`${row.weekStart}T00:00:00`);
    return monday <= selectedEnd && addDays(monday, 6) >= selectedStart;
  }).slice(-13);
  if (!visibleRows.length) {
    tableBody.innerHTML = `<tr><td colspan="${columnCount}" class="empty-state">선택한 기간의 GA 주차 데이터가 없습니다.</td></tr>`;
    return;
  }
  tableBody.innerHTML = visibleRows.map((row, rowIndex) => {
    const originalIndex = modeRows.indexOf(row);
    const previous = [...modeRows.slice(0, originalIndex)].reverse().find(item => !businessMode || item.business === row.business);
    const newUserShare = row.users ? row.newUsers / row.users * 100 : 0;
    const previousNewUserShare = previous?.users ? previous.newUsers / previous.users * 100 : undefined;
    const conversionRate = row.sessions ? row.purchases / row.sessions * 100 : 0;
    const previousConversionRate = previous?.sessions ? previous.purchases / previous.sessions * 100 : undefined;
    const cartRate = row.sessions ? row.carts / row.sessions * 100 : 0;
    const previousCartRate = previous?.sessions ? previous.carts / previous.sessions * 100 : undefined;
    const monday = new Date(`${row.weekStart}T00:00:00`);
    const sunday = addDays(monday, 6);
    const rangeStart = monday < selectedStart ? selectedStart : monday;
    const rangeEnd = sunday > selectedEnd ? selectedEnd : sunday;
    const weekStart = `${String(monday.getFullYear()).slice(-2)}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')} 주차`;
    const weekRange = `${rangeStart.getMonth() + 1}/${rangeStart.getDate()}–${rangeEnd.getMonth() + 1}/${rangeEnd.getDate()}`;
    const showWeek = !businessMode || visibleRows[rowIndex - 1]?.weekStart !== row.weekStart;
    const weekRowspan = businessMode ? visibleRows.filter(item => item.weekStart === row.weekStart).length : 1;
    const weekCell = showWeek ? `<td class="week-column" rowspan="${weekRowspan}"><strong>${weekStart}</strong><small class="week-basis">${weekRange}</small></td>` : '';
    return `<tr>${weekCell}${businessMode ? `<td class="business-column"><strong>${row.business}</strong></td>` : ''}${cell(row.sessions, previous?.sessions)}${cell(row.duration, previous?.duration, duration(row.duration))}${cell(row.scrolls, previous?.scrolls)}${cell(row.users, previous?.users)}${cell(row.newUsers, previous?.newUsers)}${cell(newUserShare, previousNewUserShare, `${newUserShare.toFixed(1)}%`)}${cell(row.carts, previous?.carts)}${cell(row.purchases, previous?.purchases)}${cell(row.revenue, previous?.revenue)}${cell(conversionRate, previousConversionRate, `${conversionRate.toFixed(2)}%`)}${cell(cartRate, previousCartRate, `${cartRate.toFixed(2)}%`)}</tr>`;
  }).join('');
}

function renderCampaignTrend(rows) {
  const chart = document.querySelector('#campaign-trend-chart');
  if (!rows.length || !selectedTrendMetrics.length) {
    chart.innerHTML = `<p class="empty-state">${rows.length ? '표시할 지표 카드를 선택하세요.' : '선택한 조건의 추이 데이터가 없습니다.'}</p>`;
    document.querySelector('#trend-series-legend').innerHTML = '';
    return;
  }
  const sumKeys = ['impressions', 'clicks', 'views', 'cost', 'conversions', 'revenue'];
  const calculateDerived = item => ({
    ...item,
    cpm: item.impressions ? item.cost / item.impressions * 1000 : 0,
    ctr: item.impressions ? item.clicks / item.impressions * 100 : 0,
    cpv: item.views ? item.cost / item.views : 0,
    purchaseRate: item.clicks ? item.conversions / item.clicks * 100 : 0,
    cpo: item.conversions ? item.cost / item.conversions : 0,
    roas: item.cost ? item.revenue / item.cost * 100 : 0,
  });
  let points;
  if (trendTimeUnit === 'daily') {
    points = rows.slice(-31);
  } else {
    const weeks = new Map();
    rows.forEach(row => {
      const date = new Date(`${row.date}T00:00:00`);
      const monday = addDays(date, -(date.getDay() === 0 ? 6 : date.getDay() - 1));
      const key = toInputDate(monday);
      if (!weeks.has(key)) weeks.set(key, { date: key, impressions: 0, clicks: 0, views: 0, cost: 0, conversions: 0, revenue: 0 });
      const week = weeks.get(key);
      sumKeys.forEach(metric => { week[metric] += row[metric]; });
    });
    points = [...weeks.values()].slice(-13).map(calculateDerived);
  }
  const labels = points.map(point => {
    const date = new Date(`${point.date}T00:00:00`);
    const short = value => `${value.getMonth() + 1}/${value.getDate()}`;
    return trendTimeUnit === 'daily' ? short(date) : `${short(date)}–${short(addDays(date, 6))}`;
  });
  const width = 780, height = 125, left = 34, right = 24, top = 10, bottom = 20;
  const step = points.length > 1 ? (width - left - right) / (points.length - 1) : 0;
  const plotStartX = points.length > 1 ? left : (left + width - right) / 2;
  const series = selectedTrendMetrics.map((key, seriesIndex) => {
    const definition = campaignKpiDefinitions.find(item => item.key === key);
    const values = points.map(point => point[key]);
    const max = Math.max(...values) * 1.08 || 1;
    return { ...definition, values, max, color: trendColors[seriesIndex] };
  });
  const displayRatios = separateTrendLines(series);
  series.forEach((item, seriesIndex) => {
    item.displayRatios = displayRatios[seriesIndex];
    item.path = item.displayRatios.map((ratio, index) => `${index ? 'L' : 'M'} ${plotStartX + index * step} ${top + (height-top-bottom) * (1-ratio)}`).join(' ');
  });
  document.querySelector('#trend-series-legend').innerHTML = series.map(item => `<span style="--series-color:${item.color}"><i></i><b>${item.label}</b></span>`).join('');
  const ariaValue = (item, index) => `${item.label} ${formatTrendValue(item.key, item.values[index])}`;
  const hitWidth = points.length > 1 ? step : width - left - right;
  const labelInterval = Math.max(1, Math.ceil(labels.length / 7));
  const axisLabels = labels.map((label, index) => index % labelInterval === 0 || index === labels.length - 1 ? `<text class="daily-label" x="${plotStartX+index*step}" y="${height-7}" text-anchor="middle">${label}</text>` : '').join('');
  chart.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${series.map(item => item.label).join(', ')} 추이">${[0,1,2,3,4].map(i => `<line class="daily-grid" x1="${left}" y1="${top+i*(height-top-bottom)/4}" x2="${width-right}" y2="${top+i*(height-top-bottom)/4}"/>`).join('')}<line class="campaign-hover-line" x1="0" y1="${top}" x2="0" y2="${height-bottom}"/>${series.map(item => `<path class="campaign-series-line" style="--series-color:${item.color}" d="${item.path}"/>${item.values.map((value,index) => `<circle class="campaign-series-point" style="--series-color:${item.color}" cx="${plotStartX+index*step}" cy="${top+(height-top-bottom)*(1-item.displayRatios[index])}" r="3"/>`).join('')}`).join('')}${axisLabels}${labels.map((label,index) => `<rect class="campaign-chart-hit" x="${points.length === 1 ? left : Math.max(0, plotStartX+index*step-step/2)}" y="${top}" width="${points.length === 1 ? hitWidth : index === 0 || index === labels.length-1 ? step/2+18 : step}" height="${height-top-bottom}" tabindex="0" data-index="${index}" aria-label="${label}, ${series.map(item => ariaValue(item,index)).join(', ')}"/>`).join('')}</svg><div class="campaign-chart-tooltip" role="status"></div>`;
  bindCampaignTrendTooltip(series, labels, { width, left: plotStartX, step });
}

function makeTrendDateLabels(unit, count) {
  const selectedEnd = endDate?.value ? new Date(`${endDate.value}T00:00:00`) : new Date();
  const shortDate = date => `${date.getMonth() + 1}/${date.getDate()}`;
  if (unit === 'daily') return Array.from({ length: count }, (_, index) => shortDate(addDays(selectedEnd, index - count + 1)));
  const day = selectedEnd.getDay();
  const lastMonday = addDays(selectedEnd, -(day === 0 ? 6 : day - 1));
  return Array.from({ length: count }, (_, index) => {
    const monday = addDays(lastMonday, (index - count + 1) * 7);
    return `${shortDate(monday)}–${shortDate(addDays(monday, 6))}`;
  });
}

function separateTrendLines(series) {
  if (series.length < 2) return series.map(item => item.values.map(value => value / item.max));
  const pointCount = series[0].values.length;
  const output = series.map(() => Array(pointCount).fill(0));
  const minimumGap = .075;
  for (let pointIndex = 0; pointIndex < pointCount; pointIndex += 1) {
    const ranked = series.map((item, seriesIndex) => ({ seriesIndex, ratio: item.values[pointIndex] / item.max })).sort((a, b) => a.ratio - b.ratio || a.seriesIndex - b.seriesIndex);
    for (let index = 1; index < ranked.length; index += 1) ranked[index].ratio = Math.max(ranked[index].ratio, ranked[index - 1].ratio + minimumGap);
    const upperOverflow = Math.max(0, ranked.at(-1).ratio - .94);
    ranked.forEach(item => { item.ratio -= upperOverflow; });
    const lowerOverflow = Math.max(0, .06 - ranked[0].ratio);
    ranked.forEach(item => { item.ratio += lowerOverflow; output[item.seriesIndex][pointIndex] = item.ratio; });
  }
  return output;
}

function formatTrendValue(key, value) {
  if (['ctr', 'purchaseRate', 'roas'].includes(key)) return `${value.toFixed(key === 'roas' ? 0 : 2)}%`;
  return number.format(Math.round(value));
}

function bindCampaignTrendTooltip(series, labels, dimensions) {
  const chart = document.querySelector('#campaign-trend-chart');
  const tooltip = chart.querySelector('.campaign-chart-tooltip');
  const hoverLine = chart.querySelector('.campaign-hover-line');
  const show = target => {
    const index = Number(target.dataset.index);
    tooltip.innerHTML = `<strong>${trendTimeUnit === 'weekly' ? `${labels[index]} · 월–일` : labels[index]}</strong>${series.map(item => `<span><i style="background:${item.color};box-shadow:0 0 7px ${item.color}"></i><em>${item.label}</em><b>${formatTrendValue(item.key, item.values[index])}</b></span>`).join('')}`;
    const x = dimensions.left + index * dimensions.step;
    hoverLine.setAttribute('x1', x);
    hoverLine.setAttribute('x2', x);
    hoverLine.classList.add('visible');
    const ratio = x / dimensions.width;
    tooltip.style.left = `${Math.min(Math.max(ratio * chart.clientWidth, 90), chart.clientWidth - 90)}px`;
    tooltip.classList.add('visible');
  };
  const hide = () => { tooltip.classList.remove('visible'); hoverLine.classList.remove('visible'); };
  chart.querySelectorAll('.campaign-chart-hit').forEach(area => {
    area.addEventListener('mouseenter', () => show(area));
    area.addEventListener('mouseleave', hide);
    area.addEventListener('focus', () => show(area));
    area.addEventListener('blur', hide);
  });
}

function toggleTrendMetric(key) {
  if (selectedTrendMetrics.includes(key)) selectedTrendMetrics = selectedTrendMetrics.filter(item => item !== key);
  else selectedTrendMetrics = [...selectedTrendMetrics.slice(-2), key];
  renderCampaignReport();
}

function updatePeriodStackVisibility() {
  const stack = document.querySelector('.overview-period-stack');
  stack.hidden = [...stack.querySelectorAll('.period-control')].every(control => control.hidden);
}

function showReportView(hash = window.location.hash) {
  const campaignMode = hash === '#campaign-report';
  const mediaProductMode = hash === '#media-product-report';
  const gaReportMode = hash === '#ga-report';
  const mediaTabActive = document.querySelector('[data-report-tab="media"]')?.classList.contains('active');
  const mixTabActive = document.querySelector('[data-report-tab="mix"]')?.classList.contains('active');
  document.querySelector('#overview-view').hidden = campaignMode || mediaProductMode || gaReportMode;
  document.querySelector('#media-product-report').hidden = !mediaProductMode;
  document.querySelector('#ga-report').hidden = !gaReportMode;
  document.querySelector('#campaign-report').hidden = !campaignMode;
  const pageHeader = document.querySelector('.page-header');
  pageHeader.querySelector(':scope > div:first-child').hidden = true;
  document.querySelector('#campaign-global-filter').hidden = !campaignMode;
  document.querySelector('#primary-period-control').hidden = campaignMode && (mediaTabActive || mixTabActive);
  document.querySelector('#comparison-period-control').hidden = campaignMode;
  document.querySelector('#campaign-fixed-period').hidden = !campaignMode || !mediaTabActive;
  document.querySelector('#campaign-unavailable-period').hidden = !campaignMode || !mixTabActive;
  updatePeriodStackVisibility();
  pageHeader.classList.toggle('campaign-period-header', campaignMode);
  document.querySelectorAll('.sidebar nav a').forEach(link => link.classList.toggle('active', campaignMode ? link.hash === '#campaign-report' : mediaProductMode ? link.hash === '#media-product-report' : gaReportMode ? link.hash === '#ga-report' : link.hash === (hash || '#overview')));
  if (mediaProductMode) renderMediaProductReport();
  if (gaReportMode) renderGaReport();
  if (campaignMode) {
    renderCampaignReport();
    window.requestAnimationFrame(updateCampaignStickyOffsets);
  }
}

function updateCampaignStickyOffsets() {
  const header = document.querySelector('.page-header.campaign-period-header');
  const tabs = document.querySelector('#campaign-report > .report-tabs');
  if (!header || !tabs) return;
  document.documentElement.style.setProperty('--campaign-header-height', `${header.offsetHeight}px`);
  document.documentElement.style.setProperty('--campaign-tabs-height', `${tabs.offsetHeight}px`);
}

function showCampaignTab(tab, { load = true, persist = true } = {}) {
  if (!['summary', 'media', 'creative', 'mix'].includes(tab)) tab = 'summary';
  const campaignMode = window.location.hash === '#campaign-report';
  const summary = tab === 'summary';
  const media = tab === 'media';
  const creative = tab === 'creative';
  const mix = tab === 'mix';
  document.querySelector('#campaign-summary-tab').hidden = !summary;
  document.querySelector('#campaign-media-tab').hidden = !media;
  document.querySelector('#campaign-creative-tab').hidden = !creative;
  document.querySelector('#campaign-mix-tab').hidden = !mix;
  document.querySelector('#primary-period-control').hidden = campaignMode && (media || mix);
  document.querySelector('#comparison-period-control').hidden = campaignMode;
  document.querySelector('#campaign-fixed-period').hidden = !campaignMode || !media;
  document.querySelector('#campaign-unavailable-period').hidden = !campaignMode || !mix;
  updatePeriodStackVisibility();
  document.querySelectorAll('[data-report-tab]').forEach(button => {
    const active = button.dataset.reportTab === tab;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  const selectedCampaign = document.querySelector('#campaign-select').value;
  document.querySelectorAll('.campaign-tab-panel').forEach(panel => {
    panel.dataset.campaign = selectedCampaign;
  });
  if (media && load) {
    applyMediaProgressColors();
    loadCampaignMediaTable();
  }
  if (creative && load) loadCampaignCreatives();
  if (mix && load) loadCampaignMediaMix();
  if (persist) saveCampaignReportState({ tab });
}

function updateCreativeUploadState() {
  const campaign = document.querySelector('#campaign-select').value;
  const mediaSelect = document.querySelector('#creative-media');
  const previousMedia = mediaSelect.value;
  const mediaOptions = campaign && campaign !== 'all' ? getAvailableMedia(campaignFilterRows, campaign, 'all') : [];
  mediaSelect.replaceChildren();
  if (mediaOptions.length) {
    mediaOptions.forEach(media => {
      const option = document.createElement('option');
      option.value = media;
      option.textContent = media;
      mediaSelect.append(option);
    });
    mediaSelect.value = mediaOptions.includes(previousMedia) ? previousMedia : mediaOptions[0];
  } else {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = campaign && campaign !== 'all' ? '등록 가능한 매체가 없습니다' : '캠페인을 먼저 선택해 주세요';
    mediaSelect.append(option);
  }
  const enabled = Boolean(campaign && campaign !== 'all' && mediaOptions.length);
  const form = document.querySelector('#creative-upload-form');
  const guide = document.querySelector('#creative-campaign-guide');
  document.querySelector('#creative-upload-open').disabled = !enabled;
  form.querySelectorAll('input, select, button').forEach(control => { control.disabled = !enabled; });
  guide.textContent = enabled ? `‘${campaign}’ 캠페인의 실제 운영 매체 중 선택해 등록합니다.` : campaign && campaign !== 'all' ? '선택한 캠페인에 등록 가능한 매체가 없습니다.' : '상단에서 캠페인을 선택해야 업로드할 수 있습니다.';
  form.classList.toggle('disabled', !enabled);
  return enabled;
}

function renderCreativeLabelSuggestions(query = '') {
  const suggestions = document.querySelector('#creative-label-suggestions');
  const needle = query.trim().toLocaleLowerCase('ko-KR');
  const labels = creativeLabelHistory.filter(label => !needle || label.toLocaleLowerCase('ko-KR').includes(needle));
  suggestions.innerHTML = labels.length
    ? labels.map(label => `<button type="button" role="option" data-creative-label="${escapeHtml(label)}">${escapeHtml(label)}</button>`).join('')
    : '<p>등록 이력이 있는 라벨이 없습니다.</p>';
  suggestions.hidden = false;
}

async function loadCampaignCreatives() {
  const campaign = document.querySelector('#campaign-select').value;
  const library = document.querySelector('#creative-library');
  const count = document.querySelector('#creative-count');
  document.querySelector('#creative-upload-message').textContent = '';
  if (!updateCreativeUploadState()) {
    creativeLabelHistory = [];
    currentCampaignCreatives = [];
    count.textContent = '0개 소재';
    library.innerHTML = '<p class="empty-state">상단 필터에서 캠페인을 선택해 주세요.</p>';
    return;
  }
  creativeLabelHistory = [];
  library.innerHTML = '<p class="empty-state">등록 소재를 불러오는 중…</p>';
  try {
    const response = await fetch(`/api/campaign-creatives?${new URLSearchParams({ campaign })}`, { headers: { Accept: 'application/json' } });
    const result = await readJsonResponse(response);
    if (!response.ok) throw new Error(result.error || '등록 소재를 불러오지 못했습니다.');
    if (document.querySelector('#campaign-select').value !== campaign) return;
    const creatives = result.creatives ?? [];
    currentCampaignCreatives = creatives;
    creativeLabelHistory = [...new Set(creatives.map(creative => creative.label).filter(Boolean))].sort((left, right) => left.localeCompare(right, 'ko-KR'));
    const groupMap = new Map();
    creatives.forEach(creative => {
      const creativeType = creative.creativeType || '미분류';
      const key = `${creative.media}\u0000${creative.label}\u0000${creativeType}`;
      if (!groupMap.has(key)) groupMap.set(key, { media: creative.media, label: creative.label, creativeType, items: [] });
      groupMap.get(key).items.push(creative);
    });
    const groups = [...groupMap.values()].sort((left, right) => left.media.localeCompare(right.media, 'ko-KR') || left.label.localeCompare(right.label, 'ko-KR') || left.creativeType.localeCompare(right.creativeType, 'ko-KR'));
    const mediaGroups = [...new Set(groups.map(group => group.media))];
    count.textContent = `${groups.length}개 소재 그룹 · ${creatives.length}개 이미지`;
    library.innerHTML = groups.length ? mediaGroups.map(media => {
      const mediaItems = groups.filter(group => group.media === media);
      const imageCount = mediaItems.reduce((sum, group) => sum + group.items.length, 0);
      const cards = mediaItems.map(group => {
        const cover = group.items[0];
        return `<button type="button" class="creative-card creative-label-card" data-creative-media="${escapeHtml(group.media)}" data-creative-label="${escapeHtml(group.label)}" data-creative-type="${escapeHtml(group.creativeType)}"><div class="creative-image"><img src="${escapeHtml(cover.imageUrl)}" alt="${escapeHtml(group.creativeType)} ${escapeHtml(group.label)}" loading="lazy"><b>${group.items.length}장</b></div><div class="creative-card-body"><h3>${escapeHtml(group.creativeType)} ${escapeHtml(group.label)}</h3><p>클릭하여 등록 소재 보기</p></div></button>`;
      }).join('');
      return `<section class="creative-media-group"><header><h3>${escapeHtml(media)}</h3><span>${mediaItems.length}개 그룹 · ${imageCount}개 이미지</span></header><div class="creative-media-grid">${cards}</div></section>`;
    }).join('') : '<p class="empty-state">이 캠페인에 등록된 소재가 없습니다.</p>';
  } catch (error) {
    currentCampaignCreatives = [];
    count.textContent = '조회 실패';
    library.innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>`;
  }
}

function renderCreativeGallery(media, label, creativeType) {
  const items = currentCampaignCreatives.filter(creative => creative.media === media && creative.label === label && (creative.creativeType || '미분류') === creativeType);
  document.querySelector('#creative-gallery-title').textContent = `${creativeType} ${label}`;
  document.querySelector('#creative-gallery-subtitle').textContent = `${media} · ${items.length}개 이미지 · 원하는 소재를 개별 삭제할 수 있습니다.`;
  document.querySelector('#creative-gallery-message').textContent = '';
  document.querySelector('#creative-gallery').innerHTML = items.map(creative => `<article class="creative-gallery-card" role="button" tabindex="0" data-edit-creative="${escapeHtml(creative.id)}" aria-label="${escapeHtml(creative.label)} 소재 정보 수정"><div><img src="${escapeHtml(creative.imageUrl)}" alt="${escapeHtml(creative.label)}" loading="lazy"></div><footer><span>${escapeHtml(creative.media)} · ${escapeHtml(creative.creativeType || '미분류')}</span><small>클릭하여 수정 · ${escapeHtml(new Date(creative.uploadedAt).toLocaleString('ko-KR'))}</small><button type="button" data-delete-creative="${escapeHtml(creative.id)}">삭제</button></footer></article>`).join('');
  return items.length;
}

function openCreativeGallery(media, label, creativeType) {
  if (!renderCreativeGallery(media, label, creativeType)) return;
  const dialog = document.querySelector('#creative-gallery-dialog');
  dialog.dataset.media = media;
  dialog.dataset.label = label;
  dialog.dataset.creativeType = creativeType;
  dialog.showModal();
}

async function deleteCampaignCreative(id) {
  const creative = currentCampaignCreatives.find(item => item.id === id);
  if (!creative || !window.confirm(`‘${creative.label}’ 소재 이미지 1개를 삭제하시겠습니까?`)) return;
  const message = document.querySelector('#creative-gallery-message');
  const button = document.querySelector(`[data-delete-creative="${CSS.escape(id)}"]`);
  if (button) { button.disabled = true; button.textContent = '삭제 중…'; }
  message.textContent = '';
  try {
    const response = await fetch(`/api/campaign-creatives?${new URLSearchParams({ campaign: creative.campaign, id })}`, { method: 'DELETE', headers: { Accept: 'application/json' } });
    const result = await readJsonResponse(response);
    if (!response.ok) throw new Error(result.error || '소재를 삭제하지 못했습니다.');
    const label = creative.label;
    const creativeType = creative.creativeType || '미분류';
    const media = creative.media;
    await loadCampaignCreatives();
    if (renderCreativeGallery(media, label, creativeType)) {
      document.querySelector('#creative-gallery-dialog').dataset.media = media;
      document.querySelector('#creative-gallery-dialog').dataset.label = label;
      document.querySelector('#creative-gallery-dialog').dataset.creativeType = creativeType;
    }
    else document.querySelector('#creative-gallery-dialog').close();
  } catch (error) {
    message.textContent = error.message;
    if (button) { button.disabled = false; button.textContent = '삭제'; }
  }
}

function openCreativeEditor(id) {
  const creative = currentCampaignCreatives.find(item => item.id === id);
  if (!creative) return;
  const mediaSelect = document.querySelector('#creative-edit-media');
  const mediaOptions = getAvailableMedia(campaignFilterRows, creative.campaign, 'all');
  mediaSelect.replaceChildren(...mediaOptions.map(media => {
    const option = document.createElement('option');
    option.value = media;
    option.textContent = media;
    return option;
  }));
  if (!mediaOptions.includes(creative.media)) {
    const option = document.createElement('option');
    option.value = creative.media;
    option.textContent = creative.media;
    mediaSelect.prepend(option);
  }
  mediaSelect.value = creative.media;
  document.querySelector('#creative-edit-id').value = creative.id;
  document.querySelector('#creative-edit-label').value = creative.label;
  document.querySelector('#creative-edit-image').src = creative.imageUrl;
  document.querySelectorAll('input[name="edit-creative-type"]').forEach(input => { input.checked = input.value === creative.creativeType; });
  document.querySelector('#creative-edit-message').textContent = creative.creativeType ? '' : '기존 소재 유형이 미분류입니다. 영상 또는 배너를 선택해 주세요.';
  document.querySelector('#creative-edit-dialog').showModal();
}

async function saveCreativeEdit(event) {
  event.preventDefault();
  const id = document.querySelector('#creative-edit-id').value;
  const creative = currentCampaignCreatives.find(item => item.id === id);
  if (!creative) return;
  const media = document.querySelector('#creative-edit-media').value;
  const label = document.querySelector('#creative-edit-label').value.trim();
  const creativeType = document.querySelector('input[name="edit-creative-type"]:checked')?.value || '';
  const message = document.querySelector('#creative-edit-message');
  const submit = document.querySelector('#creative-edit-submit');
  if (!media || !label || !creativeType) { message.textContent = '매체, 소재 라벨, 소재 유형을 모두 입력해 주세요.'; return; }
  submit.disabled = true;
  submit.textContent = '저장 중…';
  message.textContent = '';
  const previousMedia = creative.media;
  const previousLabel = creative.label;
  const previousType = creative.creativeType || '미분류';
  try {
    const response = await fetch('/api/campaign-creatives', { method: 'PATCH', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ id, campaign: creative.campaign, media, label, creativeType }) });
    const result = await readJsonResponse(response);
    if (!response.ok) throw new Error(result.error || '소재 정보를 수정하지 못했습니다.');
    document.querySelector('#creative-edit-dialog').close();
    await loadCampaignCreatives();
    if (renderCreativeGallery(previousMedia, previousLabel, previousType)) {
      document.querySelector('#creative-gallery-dialog').dataset.media = previousMedia;
      document.querySelector('#creative-gallery-dialog').dataset.label = previousLabel;
      document.querySelector('#creative-gallery-dialog').dataset.creativeType = previousType;
    } else document.querySelector('#creative-gallery-dialog').close();
  } catch (error) {
    message.textContent = error.message;
  } finally {
    submit.disabled = false;
    submit.textContent = '수정 내용 저장';
  }
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('이미지 파일을 읽지 못했습니다.'));
    reader.readAsDataURL(file);
  });
}

async function uploadCampaignCreative(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const campaign = document.querySelector('#campaign-select').value;
  const media = document.querySelector('#creative-media').value.trim();
  const label = document.querySelector('#creative-label').value.trim();
  const creativeType = document.querySelector('input[name="creative-type"]:checked')?.value || '';
  const files = [...document.querySelector('#creative-file').files];
  const message = document.querySelector('#creative-upload-message');
  const submit = document.querySelector('#creative-upload-submit');
  if (!campaign || campaign === 'all') { message.textContent = '상단에서 캠페인을 먼저 선택해 주세요.'; return; }
  if (!media || !label || !creativeType || !files.length) { message.textContent = '매체, 소재 라벨, 소재 유형, 이미지를 모두 입력해 주세요.'; return; }
  const oversizedFile = files.find(file => file.size > 8 * 1024 * 1024);
  if (oversizedFile) { message.textContent = `‘${oversizedFile.name}’ 파일이 8MB를 초과합니다.`; return; }
  submit.disabled = true;
  submit.textContent = `0/${files.length} 업로드 중…`;
  message.textContent = '';
  let uploadedCount = 0;
  try {
    for (const file of files) {
      const imageData = await fileToDataUrl(file);
      const response = await fetch('/api/campaign-creatives', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ campaign, media, label, creativeType, imageData }) });
      const result = await readJsonResponse(response);
      if (!response.ok) throw new Error(result.error || `‘${file.name}’ 파일을 업로드하지 못했습니다.`);
      uploadedCount += 1;
      submit.textContent = `${uploadedCount}/${files.length} 업로드 중…`;
    }
    form.reset();
    document.querySelector('#creative-file-name').textContent = '이미지 선택 또는 Ctrl+V로 붙여넣기';
    await loadCampaignCreatives();
    document.querySelector('#creative-upload-dialog').close();
  } catch (error) {
    if (uploadedCount) await loadCampaignCreatives();
    message.textContent = uploadedCount ? `${uploadedCount}개 등록 후 오류가 발생했습니다. ${error.message}` : error.message;
  } finally {
    submit.disabled = false;
    submit.textContent = '소재 일괄 업로드';
  }
}

async function loadCampaignMediaMix() {
  const campaign = document.querySelector('#campaign-select').value;
  const head = document.querySelector('#campaign-mix-head');
  const body = document.querySelector('#campaign-mix-body');
  const requestId = ++campaignMixRequestId;
  head.innerHTML = '';
  body.innerHTML = '<tr><td class="empty-state">미디어믹스를 불러오는 중…</td></tr>';
  try {
    const response = await fetch(`/api/campaign-media-mix?${new URLSearchParams({ campaign })}`, { headers: { Accept: 'application/json' } });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '미디어믹스를 불러오지 못했습니다.');
    if (requestId !== campaignMixRequestId) return;
    const headers = result.headers ?? [];
    const rows = result.rows ?? [];
    const kpiIndex = headers.indexOf('KPI');
    const kpiClass = value => ({ '도달': 'reach', '조회': 'view', '트래픽': 'traffic', '전환': 'conversion' })[value] ?? 'other';
    const mergeHeaders = ['사업부', 'KPI', 'Media - AD Type', '소재', 'Type'];
    const mergeIndices = mergeHeaders.map(header => headers.indexOf(header)).filter(index => index >= 0);
    const mergedCells = new Map();
    mergeIndices.forEach((columnIndex, level) => {
      const sameGroup = (left, right) => mergeIndices.slice(0, level + 1).every(index => (rows[left]?.[index] ?? '') === (rows[right]?.[index] ?? ''));
      for (let rowIndex = 0; rowIndex < rows.length;) {
        let endIndex = rowIndex + 1;
        while (endIndex < rows.length && sameGroup(rowIndex, endIndex)) endIndex += 1;
        mergedCells.set(`${rowIndex}:${columnIndex}`, endIndex - rowIndex);
        for (let hiddenIndex = rowIndex + 1; hiddenIndex < endIndex; hiddenIndex += 1) mergedCells.set(`${hiddenIndex}:${columnIndex}`, 0);
        rowIndex = endIndex;
      }
    });
    head.innerHTML = `<tr>${headers.map(header => `<th>${escapeHtml(header || '-')}</th>`).join('')}</tr>`;
    body.innerHTML = rows.length
      ? rows.map((row, rowIndex) => {
        const startsKpi = rowIndex === 0 || row[kpiIndex] !== rows[rowIndex - 1]?.[kpiIndex];
        return `<tr class="mix-kpi-${kpiClass(row[kpiIndex])}${startsKpi ? ' mix-kpi-start' : ''}">${headers.map((_, columnIndex) => {
        const rowspan = mergedCells.get(`${rowIndex}:${columnIndex}`);
        if (rowspan === 0) return '';
        const merged = rowspan > 1;
        return `<td class="mix-column-${columnIndex + 1}${merged ? ' mix-merged-cell' : ''}"${merged ? ` rowspan="${rowspan}"` : ''}>${escapeHtml(row[columnIndex] || '-')}</td>`;
      }).join('')}</tr>`;
      }).join('')
      : `<tr><td colspan="${Math.max(headers.length, 1)}" class="empty-state">선택한 캠페인의 미디어믹스 데이터가 없습니다.</td></tr>`;
  } catch (error) {
    if (requestId !== campaignMixRequestId) return;
    body.innerHTML = `<tr><td class="empty-state">${escapeHtml(error.message)}</td></tr>`;
  }
}

async function loadCampaignOptions() {
  const select = document.querySelector('#campaign-select');
  try {
    const response = await fetch('/api/campaigns', { headers: { Accept: 'application/json' } });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '캠페인 목록을 불러오지 못했습니다.');
    select.innerHTML = [
      '<option value="all">전체 캠페인</option>',
      ...result.campaigns.map(campaign => {
        const option = document.createElement('option');
        option.value = campaign;
        option.textContent = campaign;
        return option.outerHTML;
      }),
    ].join('');
    select.disabled = false;
    campaignFilterRows = result.filterRows ?? [];
    legacyCampaignMediaOptions = result.mediaAdTypes ?? [];
    const savedCampaign = savedCampaignReportState.campaign;
    select.value = [...select.options].some(option => option.value === savedCampaign) ? savedCampaign : 'all';
    updateCampaignDrilldown('campaign');
    showCampaignTab(savedCampaignReportState.tab || 'summary');
  } catch (error) {
    select.innerHTML = '<option value="all">캠페인 조회 실패</option>';
    select.disabled = true;
    select.title = error.message;
  }
}

function applyMediaProgressColors() {
  const gapMetrics = {
    4: { unit: 'number', factor: 120 }, 5: { unit: 'number', factor: 10 }, 6: { unit: 'number', factor: 1 },
    7: { unit: 'point', factor: .03 }, 8: { unit: 'point', factor: .12 }, 11: { unit: 'number', factor: 250 },
    12: { unit: 'point', factor: .025 }, 13: { unit: 'point', factor: 1.8 },
  };
  document.querySelectorAll('.media-progress-row').forEach(row => {
    const rowLabel = row.querySelector('td:first-child span');
    if (rowLabel) rowLabel.textContent = '진척률 / GAP';
    const cells = [...row.querySelectorAll('td')].slice(1);
    cells.forEach(cell => { if (!cell.dataset.progress) cell.dataset.progress = cell.textContent.match(/[\d.]+/)?.[0] || '0'; });
    const costProgress = Number(cells[0]?.dataset.progress);
    cells.forEach((cell, index) => {
      cell.classList.remove('progress-high', 'progress-low', 'progress-neutral');
      const progress = Number(cell.dataset.progress);
      const gap = progress - costProgress;
      const state = index === 0 || Math.abs(gap) <= 5 ? 'progress-neutral' : gap > 5 ? 'progress-high' : 'progress-low';
      cell.classList.add(state);
      cell.title = index === 0 ? '광고비 진척률 기준' : `광고비 진척률 대비 ${gap >= 0 ? '+' : ''}${gap.toFixed(1)}%p`;
      if (gapMetrics[index]) {
        const targetGap = (progress - 100) * gapMetrics[index].factor;
        const sign = targetGap > 0 ? '+' : targetGap < 0 ? '−' : '';
        const value = gapMetrics[index].unit === 'point' ? `${Math.abs(targetGap).toFixed(2)}%p` : number.format(Math.round(Math.abs(targetGap)));
        cell.textContent = `${sign}${value}`;
        cell.setAttribute('aria-label', `목표 대비 차이 ${sign}${value}`);
      }
    });
  });
}

function bindChartTooltip() {
  const chart = document.querySelector('#trend-chart');
  const tooltip = chart.querySelector('.chart-tooltip');
  const show = target => {
    const revenue = Number(target.dataset.revenue);
    const cost = Number(target.dataset.cost);
    const chartRect = chart.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    tooltip.innerHTML = `<strong>${target.dataset.label}</strong><span><i class="revenue"></i>매출 <b>${won.format(revenue * 1000000)}</b></span><span><i class="cost"></i>광고비 <b>${won.format(cost * 1000000)}</b></span>`;
    const center = targetRect.left - chartRect.left + targetRect.width / 2;
    tooltip.style.left = `${Math.min(Math.max(center, 92), chartRect.width - 92)}px`;
    tooltip.classList.add('visible');
  };
  const hide = () => tooltip.classList.remove('visible');
  chart.querySelectorAll('.chart-hit-area').forEach(area => {
    area.addEventListener('mouseenter', () => show(area));
    area.addEventListener('mouseleave', hide);
    area.addEventListener('focus', () => show(area));
    area.addEventListener('blur', hide);
  });
}

const periodTrigger = document.querySelector('#period-trigger');
const periodPicker = document.querySelector('#period-picker');
const startDate = document.querySelector('#start-date');
const endDate = document.querySelector('#end-date');
const periodSummary = document.querySelector('#period-summary');
const periodDates = document.querySelector('#period-dates');
const comparisonPeriodTrigger = document.querySelector('#comparison-period-trigger');
const comparisonPeriodPicker = document.querySelector('#comparison-period-picker');
const comparisonStartDate = document.querySelector('#comparison-start-date');
const comparisonEndDate = document.querySelector('#comparison-end-date');
const comparisonPeriodSummary = document.querySelector('#comparison-period-summary');
const comparisonPeriodDates = document.querySelector('#comparison-period-dates');
const campaignReportStateKey = 'marketing-dashboard:campaign-report-state';
const readCampaignReportState = () => {
  try { return JSON.parse(window.localStorage.getItem(campaignReportStateKey)) ?? {}; }
  catch { return {}; }
};
const savedCampaignReportState = readCampaignReportState();
const saveCampaignReportState = overrides => {
  const campaignSelect = document.querySelector('#campaign-select');
  const state = {
    campaign: campaignSelect && !campaignSelect.disabled ? campaignSelect.value : savedCampaignReportState.campaign || 'all',
    startDate: startDate?.value || savedCampaignReportState.startDate || '',
    endDate: endDate?.value || savedCampaignReportState.endDate || '',
    preset: selectedPreset,
    tab: document.querySelector('[data-report-tab].active')?.dataset.reportTab || savedCampaignReportState.tab || 'summary',
    ...overrides,
  };
  try { window.localStorage.setItem(campaignReportStateKey, JSON.stringify(state)); } catch {}
  Object.assign(savedCampaignReportState, state);
};
let selectedPreset = ['yesterday', '7', '30', '90', 'this-month', 'last-month', 'custom'].includes(savedCampaignReportState.preset) ? savedCampaignReportState.preset : 'yesterday';
let selectedComparisonPreset = 'previous';

const toInputDate = date => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};
const addDays = (date, amount) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);
const formatDate = value => new Intl.DateTimeFormat('ko-KR', { month: '2-digit', day: '2-digit' }).format(new Date(`${value}T00:00:00`));

function setDateRange(preset) {
  const today = new Date();
  const yesterday = addDays(today, -1);
  let start = yesterday;
  let end = yesterday;
  if (['7', '30', '90'].includes(preset)) start = addDays(today, -Number(preset));
  if (preset === 'this-month') { start = new Date(today.getFullYear(), today.getMonth(), 1); end = yesterday; }
  if (preset === 'last-month') { start = new Date(today.getFullYear(), today.getMonth() - 1, 1); end = new Date(today.getFullYear(), today.getMonth(), 0); }
  startDate.value = toInputDate(start);
  endDate.value = toInputDate(end);
}

function closePeriodPicker() {
  periodPicker.hidden = true;
  periodTrigger.setAttribute('aria-expanded', 'false');
}

function closeComparisonPeriodPicker() {
  comparisonPeriodPicker.hidden = true;
  comparisonPeriodTrigger.setAttribute('aria-expanded', 'false');
}

function setComparisonDateRange(preset = selectedComparisonPreset) {
  if (!startDate.value || !endDate.value || preset === 'custom') return;
  const range = getComparisonDateRange(startDate.value, endDate.value, preset);
  comparisonStartDate.value = range.start;
  comparisonEndDate.value = range.end;
}

const calculateMediaProductMetrics = row => ({
  ...row,
  cpm: row.impressions ? row.cost / row.impressions * 1000 : 0,
  cpc: row.clicks ? row.cost / row.clicks : 0,
  cpv: row.views ? row.cost / row.views : 0,
  ctr: row.impressions ? row.clicks / row.impressions * 100 : 0,
  cpo: row.purchases ? row.cost / row.purchases : 0,
  cvr: row.clicks ? row.purchases / row.clicks * 100 : 0,
  roas: row.cost ? row.revenue / row.cost * 100 : 0,
});

async function renderMediaProductReport() {
  const requestId = ++mediaProductRequestId;
  const kpis = document.querySelector('#media-product-kpis');
  const ranking = document.querySelector('#media-product-ranking');
  const tableBody = document.querySelector('#media-product-table-body');
  kpis.innerHTML = '<p class="empty-state">성과 데이터를 불러오는 중…</p>';
  ranking.innerHTML = '<p class="empty-state">데이터를 불러오는 중…</p>';
  tableBody.innerHTML = '<tr><td colspan="15" class="empty-state">데이터를 불러오는 중…</td></tr>';
  const query = (start, end) => new URLSearchParams({ business: activeMediaProductBusiness, start, end });
  try {
    const [currentResponse, comparisonResponse] = await Promise.all([
      fetch(`/api/media-product-report?${query(startDate.value, endDate.value)}`, { headers: { Accept: 'application/json' } }),
      fetch(`/api/media-product-report?${query(comparisonStartDate.value, comparisonEndDate.value)}`, { headers: { Accept: 'application/json' } }),
    ]);
    const [currentData, comparisonData] = await Promise.all([readJsonResponse(currentResponse), readJsonResponse(comparisonResponse)]);
    if (!currentResponse.ok) throw new Error(currentData.error || '현재 기간 데이터를 불러오지 못했습니다.');
    if (!comparisonResponse.ok) throw new Error(comparisonData.error || '비교 기간 데이터를 불러오지 못했습니다.');
    if (requestId !== mediaProductRequestId) return;
    const mediaMatches = media => activeMediaProductMedia === 'all'
      || (activeMediaProductMedia === 'naver-sa' && media === '네이버 SA')
      || (activeMediaProductMedia === 'naver-gfa' && media === '네이버 GFA')
      || (activeMediaProductMedia === 'meta' && media === '메타')
      || (activeMediaProductMedia === 'google' && media === '구글')
      || (activeMediaProductMedia === 'criteo' && media === '크리테오');
    const rows = currentData.rows.filter(row => mediaMatches(row.media)).map(calculateMediaProductMetrics);
    const totals = rows.reduce((sum, row) => {
      ['cost', 'impressions', 'clicks', 'views'].forEach(key => { sum[key] += row[key]; });
      return sum;
    }, { cost: 0, impressions: 0, clicks: 0, views: 0, purchases: 0, revenue: 0 });
    currentData.gaDaily.filter(row => mediaMatches(row.media)).forEach(row => { totals.purchases += row.purchases; totals.revenue += row.revenue; });
    const totalMetrics = calculateMediaProductMetrics(totals);
    const comparisonRows = comparisonData.rows.filter(row => mediaMatches(row.media));
    const comparisonTotals = comparisonRows.reduce((sum, row) => {
      ['cost', 'impressions', 'clicks', 'views'].forEach(key => { sum[key] += row[key]; });
      return sum;
    }, { cost: 0, impressions: 0, clicks: 0, views: 0, purchases: 0, revenue: 0 });
    comparisonData.gaDaily.filter(row => mediaMatches(row.media)).forEach(row => { comparisonTotals.purchases += row.purchases; comparisonTotals.revenue += row.revenue; });
    const comparisonMetrics = calculateMediaProductMetrics(comparisonTotals);
    const kpiDefinitions = [
      ['impressions', '노출수'], ['clicks', '클릭수'], ['views', '조회수'], ['cost', '비용'],
      ['purchases', '구매(GA)'], ['revenue', '매출액(GA)'], ['cpm', 'CPM'], ['ctr', 'CTR'],
      ['cpv', 'CPV'], ['cvr', '구매전환율(GA)'], ['cpo', 'CPO'], ['roas', 'ROAS'],
    ];
    const formatKpi = (key, value) => ['ctr', 'cvr', 'roas'].includes(key)
      ? `${Number(value || 0).toFixed(key === 'roas' ? 0 : 2)}%`
      : number.format(Math.round(Number(value) || 0));
    const comparisonGap = key => {
      const current = Number(totalMetrics[key]) || 0;
      const comparison = Number(comparisonMetrics[key]) || 0;
      if (!comparison) return '<small class="actual-data"><b>–</b> 비교 기간 대비</small>';
      const rate = (current - comparison) / comparison * 100;
      const positive = rate >= 0;
      return `<small class="${positive ? 'positive' : 'negative'}"><b>${positive ? '▲' : '▼'} ${Math.abs(rate).toFixed(1)}%</b> 비교 기간 대비</small>`;
    };
    kpis.innerHTML = kpiDefinitions.map(([key, label]) => `<article class="campaign-kpi ${key === 'roas' ? 'accent' : ''}"><span>${label}</span><strong>${formatKpi(key, totalMetrics[key])}</strong><div class="kpi-progress">${comparisonGap(key)}</div></article>`).join('');

    const dailyMap = new Map();
    currentData.daily.filter(row => mediaMatches(row.media)).forEach(row => {
      if (!dailyMap.has(row.date)) dailyMap.set(row.date, { date: row.date, cost: 0, impressions: 0, clicks: 0, views: 0, purchases: 0, revenue: 0 });
      const daily = dailyMap.get(row.date);
      ['cost', 'impressions', 'clicks', 'views'].forEach(key => { daily[key] += row[key]; });
    });
    currentData.gaDaily.filter(row => mediaMatches(row.media)).forEach(row => {
      if (!dailyMap.has(row.date)) dailyMap.set(row.date, { date: row.date, cost: 0, impressions: 0, clicks: 0, views: 0, purchases: 0, revenue: 0 });
      const daily = dailyMap.get(row.date);
      daily.purchases += row.purchases;
      daily.revenue += row.revenue;
    });
    const dailyRows = [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date));
    if (!dailyRows.length) ranking.innerHTML = '<p class="empty-state">선택 기간의 데이터가 없습니다.</p>';
    else {
      const width = 980, height = 175, left = 42, right = 24, top = 18, bottom = 28;
      const step = (width - left - right) / dailyRows.length;
      const maxCost = Math.max(...dailyRows.map(row => row.cost), 1) * 1.12;
      const maxRevenue = Math.max(...dailyRows.map(row => row.revenue), 1) * 1.18;
      const revenueLine = dailyRows.map((row, index) => `${index ? 'L' : 'M'} ${left + step * index + step / 2} ${top + (height - top - bottom) * (1 - row.revenue / maxRevenue)}`).join(' ');
      const labelEvery = Math.max(1, Math.ceil(dailyRows.length / 10));
      ranking.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="일자별 광고비와 매출 추이">
        ${[0,1,2,3].map(index => `<line class="daily-grid" x1="${left}" y1="${top + index * ((height - top - bottom) / 3)}" x2="${width-right}" y2="${top + index * ((height - top - bottom) / 3)}"/>`).join('')}
        ${dailyRows.map((row, index) => `<rect class="daily-bar" x="${left + step * index + step * .2}" y="${top + (height-top-bottom)*(1-row.cost/maxCost)}" width="${Math.max(3, step*.6)}" height="${(height-top-bottom)*row.cost/maxCost}" rx="3"><title>${row.date} · 광고비 ${won.format(row.cost)}</title></rect>`).join('')}
        <path class="daily-line" d="${revenueLine}"/>
        ${dailyRows.map((row,index) => `<circle class="daily-point" cx="${left+step*index+step/2}" cy="${top+(height-top-bottom)*(1-row.revenue/maxRevenue)}" r="3"><title>${row.date} · 매출 ${won.format(row.revenue)}</title></circle>`).join('')}
        ${dailyRows.map((row,index) => index % labelEvery === 0 || index === dailyRows.length - 1 ? `<text class="daily-label" x="${left+step*index+step/2}" y="${height-8}" text-anchor="middle">${Number(row.date.slice(5,7))}/${Number(row.date.slice(8,10))}</text>` : '').join('')}
      </svg>`;
    }

    const comparisonDailyMap = new Map();
    comparisonData.daily.filter(row => mediaMatches(row.media)).forEach(row => {
      if (!comparisonDailyMap.has(row.date)) comparisonDailyMap.set(row.date, { date: row.date, cost: 0 });
      comparisonDailyMap.get(row.date).cost += row.cost;
    });
    const comparisonDailyRows = [...comparisonDailyMap.values()].sort((a, b) => a.date.localeCompare(b.date));
    const gap = (row, index) => {
      const previous = comparisonDailyRows[index]?.cost ?? 0;
      if (!previous) return '<span class="report-gap neutral">–</span>';
      const rate = (row.cost - previous) / previous * 100;
      return `<span class="report-gap ${rate >= 0 ? 'up' : 'down'}">${rate >= 0 ? '▲' : '▼'} ${Math.abs(rate).toFixed(1)}%</span>`;
    };
    tableBody.innerHTML = dailyRows.length ? dailyRows.map((daily, index) => {
      const row = calculateMediaProductMetrics(daily);
      return `<tr><td><strong>${escapeHtml(row.date)}</strong></td><td>${number.format(Math.round(row.cost))}</td><td>${number.format(Math.round(row.impressions))}</td><td>${number.format(Math.round(row.clicks))}</td><td>${number.format(Math.round(row.views))}</td><td>${number.format(Math.round(row.cpm))}</td><td>${number.format(Math.round(row.cpc))}</td><td>${number.format(Math.round(row.cpv))}</td><td>${row.ctr.toFixed(2)}%</td><td>${number.format(Math.round(row.purchases))}</td><td>${number.format(Math.round(row.revenue))}</td><td>${number.format(Math.round(row.cpo))}</td><td>${row.cvr.toFixed(2)}%</td><td>${row.roas.toFixed(0)}%</td><td>${gap(row, index)}</td></tr>`;
    }).join('') : '<tr><td colspan="15" class="empty-state">선택 기간의 데이터가 없습니다.</td></tr>';
  } catch (error) {
    if (requestId !== mediaProductRequestId) return;
    const message = escapeHtml(error.message);
    kpis.innerHTML = `<p class="empty-state">${message}</p>`;
    ranking.innerHTML = '<p class="empty-state">실제 데이터를 불러오지 못했습니다.</p>';
    tableBody.innerHTML = '<tr><td colspan="15" class="empty-state">실제 데이터를 불러오지 못했습니다.</td></tr>';
  }
}

async function renderGaReport() {
  const requestId = ++gaReportRequestId;
  const kpis = document.querySelector('#ga-kpis');
  const chart = document.querySelector('#ga-daily-chart');
  const campaignRanking = document.querySelector('#ga-purchase-campaigns');
  const tableBody = document.querySelector('#ga-daily-table-body');
  kpis.innerHTML = chart.innerHTML = campaignRanking.innerHTML = '<p class="empty-state">GA 데이터를 불러오는 중…</p>';
  tableBody.innerHTML = '<tr><td colspan="9" class="empty-state">데이터를 불러오는 중…</td></tr>';
  const query = (start, end) => new URLSearchParams({ business: activeGaBusiness, start, end });
  try {
    const [currentResponse, comparisonResponse, campaignResponse] = await Promise.all([
      fetch(`/api/overview-metrics?${query(startDate.value, endDate.value)}`, { headers: { Accept: 'application/json' } }),
      fetch(`/api/overview-metrics?${query(comparisonStartDate.value, comparisonEndDate.value)}`, { headers: { Accept: 'application/json' } }),
      fetch(`/api/ga-purchase-campaigns?${query(startDate.value, endDate.value)}`, { headers: { Accept: 'application/json' } }),
    ]);
    const [currentData, comparisonData, campaignData] = await Promise.all([readJsonResponse(currentResponse), readJsonResponse(comparisonResponse), readJsonResponse(campaignResponse)]);
    if (!currentResponse.ok) throw new Error(currentData.error || '현재 기간 GA 데이터를 불러오지 못했습니다.');
    if (!comparisonResponse.ok) throw new Error(comparisonData.error || '비교 기간 GA 데이터를 불러오지 못했습니다.');
    if (!campaignResponse.ok) throw new Error(campaignData.error || '세션 캠페인 데이터를 불러오지 못했습니다.');
    if (requestId !== gaReportRequestId) return;
    const metrics = {
      sessions: currentData.metrics.sessions, users: currentData.metrics.users, carts: currentData.metrics.carts, purchases: currentData.metrics.conversions, revenue: currentData.metrics.revenue,
      cartRate: currentData.metrics.sessions ? currentData.metrics.carts / currentData.metrics.sessions * 100 : 0,
      conversionRate: currentData.metrics.sessions ? currentData.metrics.conversions / currentData.metrics.sessions * 100 : 0,
      avgDuration: currentData.metrics.avgDuration, newUserShare: currentData.metrics.newUserShare,
      averageOrderValue: currentData.metrics.conversions ? currentData.metrics.revenue / currentData.metrics.conversions : 0,
    };
    const previous = {
      sessions: comparisonData.metrics.sessions, users: comparisonData.metrics.users, carts: comparisonData.metrics.carts, purchases: comparisonData.metrics.conversions, revenue: comparisonData.metrics.revenue,
      cartRate: comparisonData.metrics.sessions ? comparisonData.metrics.carts / comparisonData.metrics.sessions * 100 : 0,
      conversionRate: comparisonData.metrics.sessions ? comparisonData.metrics.conversions / comparisonData.metrics.sessions * 100 : 0,
      avgDuration: comparisonData.metrics.avgDuration, newUserShare: comparisonData.metrics.newUserShare,
      averageOrderValue: comparisonData.metrics.conversions ? comparisonData.metrics.revenue / comparisonData.metrics.conversions : 0,
    };
    const definitions = [
      ['sessions','세션 수'],['users','총 사용자'],['purchases','구매 수'],['carts','장바구니 추가'],['revenue','총수익'],
      ['avgDuration','평균 세션 시간'],['newUserShare','새 사용자 비중'],['conversionRate','구매 전환율'],['cartRate','장바구니 전환율'],['averageOrderValue','객단가'],
    ];
    const format = (key, value) => {
      if (['cartRate', 'conversionRate', 'newUserShare'].includes(key)) return `${value.toFixed(2)}%`;
      if (key === 'avgDuration') { const seconds = Math.round(value); return `${Math.floor(seconds / 60)}분 ${String(seconds % 60).padStart(2, '0')}초`; }
      return number.format(Math.round(value));
    };
    const gap = key => {
      if (!previous[key]) return '<small class="actual-data"><b>–</b> 비교 기간 대비</small>';
      const rate = (metrics[key] - previous[key]) / previous[key] * 100;
      return `<small class="${rate >= 0 ? 'positive' : 'negative'}"><b>${rate >= 0 ? '▲' : '▼'} ${Math.abs(rate).toFixed(1)}%</b> 비교 기간 대비</small>`;
    };
    kpis.innerHTML = definitions.map(([key,label]) => `<button type="button" class="campaign-kpi ga-kpi-select${selectedGaTrendMetrics.includes(key) ? ' selected' : ''}" data-ga-metric="${key}" aria-pressed="${selectedGaTrendMetrics.includes(key)}"><span>${label}</span><strong>${format(key, metrics[key])}</strong><div class="kpi-progress">${gap(key)}</div></button>`).join('');

    const rows = currentData.trend;
    const dailyValue = (row, key) => {
      if (key === 'purchases') return row.conversions;
      if (key === 'cartRate') return row.sessions ? row.carts / row.sessions * 100 : 0;
      if (key === 'conversionRate') return row.sessions ? row.conversions / row.sessions * 100 : 0;
      if (key === 'newUserShare') return row.users ? row.newUsers / row.users * 100 : 0;
      if (key === 'averageOrderValue') return row.conversions ? row.revenue / row.conversions : 0;
      return row[key] ?? 0;
    };
    const renderTrend = () => {
      const selectedDefinitions = definitions.filter(([key]) => selectedGaTrendMetrics.includes(key));
      const trendTitle = document.querySelector('#ga-trend-title');
      const trendDescription = document.querySelector('#ga-trend-description');
      const trendLegend = document.querySelector('#ga-trend-legend');
      const labels = selectedDefinitions.map(([, label]) => label);
      trendTitle.textContent = labels.length ? `일자별 ${labels.join('·')}` : '일자별 GA 성과';
      trendDescription.textContent = '상단 스코어보드에서 최대 3개 지표를 선택할 수 있습니다.';
      trendLegend.innerHTML = selectedDefinitions.map(([key, label], index) => `<span><i class="ga-series-${index + 1}"></i>${label}</span>`).join('');
      if (!rows.length) { chart.innerHTML = '<p class="empty-state">선택 기간의 데이터가 없습니다.</p>'; return; }
      if (!selectedDefinitions.length) { chart.innerHTML = '<p class="empty-state">상단 스코어보드에서 지표를 선택해 주세요.</p>'; return; }
      const width = 760, height = 220, left = 35, right = 20, top = 18, bottom = 32;
      const step = (width-left-right)/rows.length;
      const labelEvery = Math.max(1, Math.ceil(rows.length/8));
      const series = selectedDefinitions.map(([key, label], seriesIndex) => {
        const max = Math.max(...rows.map(row => dailyValue(row, key)), 1) * 1.15;
        const points = rows.map((row, index) => ({ x: left + step * index + step / 2, y: top + (height-top-bottom) * (1-dailyValue(row,key)/max), row }));
        const path = points.map((point,index)=>`${index?'L':'M'} ${point.x} ${point.y}`).join(' ');
        return `<path class="ga-trend-line ga-series-${seriesIndex+1}" d="${path}"/>${points.map(point=>`<circle class="ga-trend-point ga-series-${seriesIndex+1}" cx="${point.x}" cy="${point.y}" r="3"><title>${point.row.date} · ${label} ${format(key,dailyValue(point.row,key))}</title></circle>`).join('')}`;
      }).join('');
      chart.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(labels.join(', '))} 일자별 추이">${[0,1,2,3].map(index=>`<line class="daily-grid" x1="${left}" y1="${top+index*((height-top-bottom)/3)}" x2="${width-right}" y2="${top+index*((height-top-bottom)/3)}"/>`).join('')}${series}${rows.map((row,index)=>index%labelEvery===0||index===rows.length-1?`<text class="daily-label" x="${left+step*index+step/2}" y="${height-8}" text-anchor="middle">${Number(row.date.slice(5,7))}/${Number(row.date.slice(8,10))}</text>`:'').join('')}</svg>`;
    };
    kpis.querySelectorAll('[data-ga-metric]').forEach(button => button.addEventListener('click', () => {
      const key = button.dataset.gaMetric;
      if (selectedGaTrendMetrics.includes(key)) selectedGaTrendMetrics = selectedGaTrendMetrics.filter(item => item !== key);
      else if (selectedGaTrendMetrics.length < 3) selectedGaTrendMetrics = [...selectedGaTrendMetrics, key];
      else return;
      kpis.querySelectorAll('[data-ga-metric]').forEach(item => {
        const selected = selectedGaTrendMetrics.includes(item.dataset.gaMetric);
        item.classList.toggle('selected', selected);
        item.setAttribute('aria-pressed', String(selected));
      });
      renderTrend();
    }));
    renderTrend();
    const maxPurchases = Math.max(...campaignData.campaigns.map(row => row.purchases), 1);
    campaignRanking.innerHTML = campaignData.campaigns.length ? campaignData.campaigns.map((row,index)=>`<div class="ga-purchase-campaign-row"><span>${String(index+1).padStart(2,'0')}</span><div><strong title="${escapeHtml(row.campaign)}">${escapeHtml(row.campaign)}</strong><i><b style="width:${row.purchases/maxPurchases*100}%"></b></i></div><b>${number.format(row.purchases)}건</b></div>`).join('') : '<p class="empty-state">선택 기간의 구매 캠페인이 없습니다.</p>';
    tableBody.innerHTML = rows.length ? rows.map(row => {
      const conversionRate = row.sessions ? row.conversions / row.sessions * 100 : 0;
      const cartRate = row.sessions ? row.carts / row.sessions * 100 : 0;
      const revenuePerSession = row.sessions ? row.revenue / row.sessions : 0;
      return `<tr><td><strong>${escapeHtml(row.date)}</strong></td><td>${number.format(row.sessions)}</td><td>${number.format(row.users)}</td><td>${number.format(row.carts)}</td><td>${cartRate.toFixed(2)}%</td><td>${number.format(row.conversions)}</td><td>${number.format(Math.round(row.revenue))}</td><td>${conversionRate.toFixed(2)}%</td><td>${number.format(Math.round(revenuePerSession))}</td></tr>`;
    }).join('') : '<tr><td colspan="9" class="empty-state">선택 기간의 데이터가 없습니다.</td></tr>';
  } catch (error) {
    if (requestId !== gaReportRequestId) return;
    kpis.innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>`;
    chart.innerHTML = campaignRanking.innerHTML = '<p class="empty-state">실제 GA 데이터를 불러오지 못했습니다.</p>';
    tableBody.innerHTML = '<tr><td colspan="9" class="empty-state">실제 GA 데이터를 불러오지 못했습니다.</td></tr>';
  }
}

function updateComparisonPeriodLabel() {
  const labels = { previous: '직전 동일 기간', 'previous-weekday': '전주 동요일', 'previous-month-weekday': '전월 동요일', 'last-year': '전년 동일 기간', custom: '선택 기간' };
  comparisonPeriodSummary.textContent = labels[selectedComparisonPreset];
  comparisonPeriodDates.textContent = `${formatDate(comparisonStartDate.value)} – ${formatDate(comparisonEndDate.value)}`;
  document.querySelectorAll('[data-comparison-period]').forEach(button => button.classList.toggle('active', button.dataset.comparisonPeriod === selectedComparisonPreset));
}

function applyPeriod() {
  const labels = { yesterday: '어제', 7: '지난 7일', 30: '지난 30일', 90: '지난 90일', 'this-month': '이번 달', 'last-month': '지난 달', custom: '선택 기간' };
  periodSummary.textContent = labels[selectedPreset];
  periodDates.textContent = `${formatDate(startDate.value)} – ${formatDate(endDate.value)}`;
  document.querySelectorAll('[data-period]').forEach(button => button.classList.toggle('active', button.dataset.period === selectedPreset));
  if (selectedComparisonPreset !== 'custom') setComparisonDateRange();
  updateComparisonPeriodLabel();
  if (window.location.hash === '#media-product-report') renderMediaProductReport();
  else if (window.location.hash === '#ga-report') renderGaReport();
  else render(['yesterday', '7'].includes(selectedPreset) ? '7' : '30');
  renderCampaignReport();
  closePeriodPicker();
  if (window.location.hash === '#campaign-report') saveCampaignReportState();
}

function getDateRangeDayCount(startInput = startDate, endInput = endDate) {
  if (!startInput?.value || !endInput?.value) return 30;
  const start = new Date(`${startInput.value}T00:00:00`);
  const end = new Date(`${endInput.value}T00:00:00`);
  return Math.max(1, Math.round((end - start) / 86400000) + 1);
}

function getPeriodDayCount() { return getDateRangeDayCount(); }

periodTrigger.addEventListener('click', () => {
  closeComparisonPeriodPicker();
  periodPicker.hidden = !periodPicker.hidden;
  periodTrigger.setAttribute('aria-expanded', String(!periodPicker.hidden));
});
document.querySelectorAll('[data-period]').forEach(button => button.addEventListener('click', () => {
  selectedPreset = button.dataset.period;
  if (selectedPreset !== 'custom') setDateRange(selectedPreset);
  document.querySelectorAll('[data-period]').forEach(item => item.classList.toggle('active', item === button));
}));
[startDate, endDate].forEach(input => input.addEventListener('change', () => { selectedPreset = 'custom'; }));
document.querySelector('#period-apply').addEventListener('click', applyPeriod);
document.querySelector('#period-cancel').addEventListener('click', closePeriodPicker);
comparisonPeriodTrigger.addEventListener('click', () => {
  closePeriodPicker();
  comparisonPeriodPicker.hidden = !comparisonPeriodPicker.hidden;
  comparisonPeriodTrigger.setAttribute('aria-expanded', String(!comparisonPeriodPicker.hidden));
});
document.querySelectorAll('[data-comparison-period]').forEach(button => button.addEventListener('click', () => {
  selectedComparisonPreset = button.dataset.comparisonPeriod;
  if (selectedComparisonPreset !== 'custom') setComparisonDateRange();
  document.querySelectorAll('[data-comparison-period]').forEach(item => item.classList.toggle('active', item === button));
}));
[comparisonStartDate, comparisonEndDate].forEach(input => input.addEventListener('change', () => { selectedComparisonPreset = 'custom'; }));
document.querySelector('#comparison-period-apply').addEventListener('click', () => {
  updateComparisonPeriodLabel();
  if (window.location.hash === '#media-product-report') renderMediaProductReport();
  else if (window.location.hash === '#ga-report') renderGaReport();
  else render(['yesterday', '7'].includes(selectedPreset) ? '7' : '30');
  closeComparisonPeriodPicker();
});
document.querySelector('#comparison-period-cancel').addEventListener('click', closeComparisonPeriodPicker);
document.addEventListener('click', event => {
  if (!event.target.closest('#primary-period-control')) closePeriodPicker();
  if (!event.target.closest('#comparison-period-control')) closeComparisonPeriodPicker();
});
document.querySelectorAll('.media-filter button').forEach(button => button.addEventListener('click', () => {
  activeChannel = button.dataset.channel;
  document.querySelectorAll('.media-filter button').forEach(item => item.classList.toggle('active', item === button));
  render(['yesterday', '7'].includes(selectedPreset) ? '7' : '30');
}));
document.querySelectorAll('.sidebar nav a').forEach(link => link.addEventListener('click', () => window.setTimeout(() => showReportView(link.hash), 0)));
document.querySelector('#campaign-select').addEventListener('change', () => {
  updateCampaignDrilldown('campaign');
  const activeTab = document.querySelector('[data-report-tab].active')?.dataset.reportTab || 'summary';
  saveCampaignReportState({ campaign: document.querySelector('#campaign-select').value });
  showCampaignTab(activeTab);
});
document.querySelector('#campaign-business').addEventListener('change', () => updateCampaignDrilldown('business'));
document.querySelector('#campaign-media-trigger').addEventListener('click', () => {
  const options = document.querySelector('#campaign-media-options');
  options.hidden = !options.hidden;
  document.querySelector('#campaign-media-trigger').setAttribute('aria-expanded', String(!options.hidden));
});
document.querySelector('#campaign-media-options').addEventListener('change', event => handleCampaignMediaChange(event.target));
document.addEventListener('click', event => {
  if (!event.target.closest('.campaign-media-control')) {
    document.querySelector('#campaign-media-options').hidden = true;
    document.querySelector('#campaign-media-trigger').setAttribute('aria-expanded', 'false');
  }
});
document.querySelectorAll('[data-report-tab]').forEach(button => button.addEventListener('click', () => showCampaignTab(button.dataset.reportTab)));
document.querySelector('#creative-upload-form').addEventListener('submit', uploadCampaignCreative);
function updateCreativeFileSummary() {
  const files = [...document.querySelector('#creative-file').files];
  document.querySelector('#creative-file-name').textContent = files.length > 1 ? `${files.length}개 이미지 선택됨` : files[0]?.name || '이미지 선택 또는 Ctrl+V로 붙여넣기';
}
document.querySelector('#creative-file').addEventListener('change', updateCreativeFileSummary);
const creativeLabelInput = document.querySelector('#creative-label');
creativeLabelInput.addEventListener('focus', () => renderCreativeLabelSuggestions(creativeLabelInput.value));
creativeLabelInput.addEventListener('input', () => renderCreativeLabelSuggestions(creativeLabelInput.value));
document.querySelector('#creative-label-suggestions').addEventListener('click', event => {
  const option = event.target.closest('[data-creative-label]');
  if (!option) return;
  creativeLabelInput.value = option.dataset.creativeLabel;
  document.querySelector('#creative-label-suggestions').hidden = true;
  creativeLabelInput.focus();
});
const creativeUploadDialog = document.querySelector('#creative-upload-dialog');
const creativeGalleryDialog = document.querySelector('#creative-gallery-dialog');
const creativeEditDialog = document.querySelector('#creative-edit-dialog');
document.querySelector('#creative-library').addEventListener('click', event => {
  const group = event.target.closest('[data-creative-media][data-creative-label][data-creative-type]');
  if (group) openCreativeGallery(group.dataset.creativeMedia, group.dataset.creativeLabel, group.dataset.creativeType);
});
document.querySelector('#creative-gallery').addEventListener('click', event => {
  const deleteButton = event.target.closest('[data-delete-creative]');
  if (deleteButton) { deleteCampaignCreative(deleteButton.dataset.deleteCreative); return; }
  const card = event.target.closest('[data-edit-creative]');
  if (card) openCreativeEditor(card.dataset.editCreative);
});
document.querySelector('#creative-gallery').addEventListener('keydown', event => {
  const card = event.target.closest('[data-edit-creative]');
  if (card && ['Enter', ' '].includes(event.key)) { event.preventDefault(); openCreativeEditor(card.dataset.editCreative); }
});
document.querySelector('#creative-gallery-close').addEventListener('click', () => creativeGalleryDialog.close());
creativeGalleryDialog.addEventListener('click', event => { if (event.target === creativeGalleryDialog) creativeGalleryDialog.close(); });
document.querySelector('#creative-edit-form').addEventListener('submit', saveCreativeEdit);
document.querySelector('#creative-edit-close').addEventListener('click', () => creativeEditDialog.close());
creativeEditDialog.addEventListener('click', event => { if (event.target === creativeEditDialog) creativeEditDialog.close(); });
document.querySelector('#creative-upload-open').addEventListener('click', () => {
  if (!updateCreativeUploadState()) return;
  document.querySelector('#creative-upload-message').textContent = '';
  creativeUploadDialog.showModal();
  document.querySelector('#creative-media').focus();
});
document.querySelector('#creative-upload-close').addEventListener('click', () => creativeUploadDialog.close());
creativeUploadDialog.addEventListener('click', event => { if (event.target === creativeUploadDialog) creativeUploadDialog.close(); });
creativeUploadDialog.addEventListener('paste', async event => {
  let pastedImages = [...(event.clipboardData?.items ?? [])].filter(item => item.kind === 'file' && item.type.startsWith('image/')).map(item => item.getAsFile()).filter(Boolean);
  const html = event.clipboardData?.getData('text/html') ?? '';
  const imageSources = html ? [...new DOMParser().parseFromString(html, 'text/html').querySelectorAll('img')].map(image => image.src).filter(source => /^(data:image\/|https?:\/\/)/.test(source)) : [];
  if (!pastedImages.length && imageSources.length) {
    event.preventDefault();
    const loadedImages = await Promise.allSettled(imageSources.map(async source => {
      const response = await fetch(source, { credentials: 'include' });
      if (!response.ok) throw new Error(`이미지 가져오기 실패 (${response.status})`);
      return response.blob();
    }));
    pastedImages = loadedImages.filter(result => result.status === 'fulfilled' && result.value.type.startsWith('image/')).map(result => result.value);
  }
  if (!pastedImages.length) {
    if (imageSources.length || (!event.target.matches('input, textarea') && (html || event.clipboardData?.files?.length))) {
      document.querySelector('#creative-upload-message').textContent = 'Google Sheets 셀 복사에는 이미지 원본이 포함되지 않았습니다. 이미지 자체를 우클릭해 “이미지 복사”한 뒤 다시 붙여넣어 주세요.';
    }
    return;
  }
  event.preventDefault();
  const allowedTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
  const unsupported = pastedImages.find(file => !allowedTypes.has(file.type));
  const oversized = pastedImages.find(file => file.size > 8 * 1024 * 1024);
  const message = document.querySelector('#creative-upload-message');
  if (unsupported) { message.textContent = '클립보드 이미지는 PNG, JPG, WEBP, GIF 형식만 지원합니다.'; return; }
  if (oversized) { message.textContent = '클립보드 이미지가 8MB를 초과합니다.'; return; }
  const fileInput = document.querySelector('#creative-file');
  const transfer = new DataTransfer();
  [...fileInput.files].forEach(file => transfer.items.add(file));
  const timestamp = Date.now();
  const extensions = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
  pastedImages.forEach((file, index) => transfer.items.add(new File([file], `clipboard-${timestamp}-${index + 1}.${extensions[file.type]}`, { type: file.type, lastModified: timestamp })));
  fileInput.files = transfer.files;
  updateCreativeFileSummary();
  message.textContent = `클립보드 이미지 ${pastedImages.length}개가 추가되었습니다.`;
  document.querySelector('.creative-file-field > span').classList.add('paste-flash');
  window.setTimeout(() => document.querySelector('.creative-file-field > span').classList.remove('paste-flash'), 650);
});
creativeUploadDialog.addEventListener('close', () => {
  document.querySelector('#creative-upload-form').reset();
  document.querySelector('#creative-file-name').textContent = '이미지 선택 또는 Ctrl+V로 붙여넣기';
  document.querySelector('#creative-upload-message').textContent = '';
  document.querySelector('#creative-label-suggestions').hidden = true;
});
document.addEventListener('click', event => {
  if (!event.target.closest('.creative-label-field')) document.querySelector('#creative-label-suggestions').hidden = true;
});
document.querySelector('#campaign-kpis').addEventListener('click', event => {
  const card = event.target.closest('[data-kpi-key]');
  if (card) toggleTrendMetric(card.dataset.kpiKey);
});
document.querySelector('#campaign-kpis').addEventListener('keydown', event => {
  const card = event.target.closest('[data-kpi-key]');
  if (card && ['Enter', ' '].includes(event.key)) { event.preventDefault(); toggleTrendMetric(card.dataset.kpiKey); }
});
document.querySelectorAll('[data-time-unit]').forEach(button => button.addEventListener('click', () => {
  trendTimeUnit = button.dataset.timeUnit;
  document.querySelectorAll('[data-time-unit]').forEach(item => item.classList.toggle('active', item === button));
  renderCampaignReport();
}));
document.querySelectorAll('[data-weekly-ga-view]').forEach(button => button.addEventListener('click', () => {
  weeklyGaViewMode = button.dataset.weeklyGaView;
  document.querySelectorAll('[data-weekly-ga-view]').forEach(item => item.classList.toggle('active', item === button));
  renderWeeklyGaTable(latestWeeklyGaRows);
}));
document.querySelector('#overview-business').addEventListener('change', event => {
  activeOverviewBusiness = event.target.value;
  render(['yesterday', '7'].includes(selectedPreset) ? '7' : '30');
});
document.querySelectorAll('[data-media-product-business]').forEach(button => button.addEventListener('click', () => {
  activeMediaProductBusiness = button.dataset.mediaProductBusiness;
  document.querySelectorAll('[data-media-product-business]').forEach(item => item.classList.toggle('active', item === button));
  renderMediaProductReport();
}));
document.querySelectorAll('[data-media-product-media]').forEach(button => button.addEventListener('click', () => {
  activeMediaProductMedia = button.dataset.mediaProductMedia;
  document.querySelectorAll('[data-media-product-media]').forEach(item => item.classList.toggle('active', item === button));
  renderMediaProductReport();
}));
document.querySelectorAll('[data-ga-business]').forEach(button => button.addEventListener('click', () => {
  activeGaBusiness = button.dataset.gaBusiness;
  document.querySelectorAll('[data-ga-business]').forEach(item => item.classList.toggle('active', item === button));
  renderGaReport();
}));
document.querySelectorAll('[data-weekly-media-view]').forEach(button => button.addEventListener('click', () => {
  weeklyMediaViewMode = button.dataset.weeklyMediaView;
  document.querySelectorAll('[data-weekly-media-view]').forEach(item => item.classList.toggle('active', item === button));
  renderWeeklyMediaTable();
}));
document.querySelector('#campaign-media-detail-body').addEventListener('click', event => {
  const row = event.target.closest('.media-drilldown-row');
  if (row) openMediaDetailDialog(row.dataset.mediaAdType);
});
document.querySelector('#campaign-media-detail-body').addEventListener('keydown', event => {
  const row = event.target.closest('.media-drilldown-row');
  if (row && ['Enter', ' '].includes(event.key)) { event.preventDefault(); openMediaDetailDialog(row.dataset.mediaAdType); }
});
const mediaDetailDialog = document.querySelector('#media-detail-dialog');
document.querySelector('#media-detail-dialog-close').addEventListener('click', () => mediaDetailDialog.close());
document.querySelector('#media-dialog-creative-table thead').addEventListener('click', event => {
  const header = event.target.closest('th[data-sort-key]');
  if (!header) return;
  const key = header.dataset.sortKey;
  creativeSort = creativeSort.key === key
    ? { key, direction: creativeSort.direction === 'asc' ? 'desc' : 'asc' }
    : { key, direction: key === 'adName' ? 'asc' : 'desc' };
  renderDialogCreativeTable();
});
mediaDetailDialog.addEventListener('click', event => { if (event.target === mediaDetailDialog) mediaDetailDialog.close(); });
window.addEventListener('hashchange', () => showReportView());
window.addEventListener('resize', updateCampaignStickyOffsets);

const kstTodayParts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: 'numeric', day: 'numeric',
}).formatToParts(new Date()).filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
const kstYesterday = new Date(Date.UTC(kstTodayParts.year, kstTodayParts.month - 1, kstTodayParts.day - 1));
document.querySelector('#campaign-fixed-period-date').textContent = `~${String(kstYesterday.getUTCFullYear()).slice(-2)}/${kstYesterday.getUTCMonth() + 1}/${kstYesterday.getUTCDate()}`;

const validStoredDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value ?? '');
if (window.location.hash === '#campaign-report'
  && validStoredDate(savedCampaignReportState.startDate)
  && validStoredDate(savedCampaignReportState.endDate)
  && savedCampaignReportState.startDate <= savedCampaignReportState.endDate) {
  startDate.value = savedCampaignReportState.startDate;
  endDate.value = savedCampaignReportState.endDate;
} else {
  selectedPreset = 'yesterday';
  setDateRange('yesterday');
}
applyPeriod();
updateCampaignDrilldown();
showCampaignTab(savedCampaignReportState.tab || 'summary', { load: false, persist: false });
showReportView();
loadCampaignOptions();
