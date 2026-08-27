import { calculateMetrics } from './metrics.js';
import { getAvailableBusinesses, getAvailableMedia } from './campaign-filters.js';

const datasets = {
  30: [
    { channel: 'Google Ads', color: '#ff5578', impressions: 482000, clicks: 14520, cost: 18400000, conversions: 612, revenue: 53700000 },
    { channel: 'Meta', color: '#48d9ff', impressions: 391000, clicks: 11230, cost: 13900000, conversions: 487, revenue: 39600000 },
    { channel: 'Naver', color: '#a898ff', impressions: 276000, clicks: 9380, cost: 12100000, conversions: 429, revenue: 35800000 },
  ],
  7: [
    { channel: 'Google Ads', color: '#ff5578', impressions: 121000, clicks: 3810, cost: 4720000, conversions: 163, revenue: 14100000 },
    { channel: 'Meta', color: '#48d9ff', impressions: 98000, clicks: 2860, cost: 3510000, conversions: 128, revenue: 10500000 },
    { channel: 'Naver', color: '#a898ff', impressions: 69000, clicks: 2410, cost: 3060000, conversions: 110, revenue: 9200000 },
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

const campaignRows = [
  { campaign: 'SUMMIT 2026', key: 'summit', business: 'outdoor', businessLabel: '아웃도어', channel: 'Google Ads', status: '운영중', cost: 8600000, impressions: 236000, views: 118000, clicks: 7840, conversions: 322, revenue: 28400000 },
  { campaign: 'SUMMIT 2026', key: 'summit', business: 'sports', businessLabel: '스포츠', channel: 'Meta', status: '운영중', cost: 6900000, impressions: 214000, views: 96400, clicks: 6360, conversions: 248, revenue: 21100000 },
  { campaign: 'TRAIL RUNNING', key: 'trail', business: 'sports', businessLabel: '스포츠', channel: 'Naver', status: '운영중', cost: 5700000, impressions: 148000, views: 72100, clicks: 4910, conversions: 191, revenue: 16800000 },
  { campaign: 'SEASON OFF', key: 'season', business: 'outdoor', businessLabel: '아웃도어', channel: 'Meta', status: '종료', cost: 4200000, impressions: 173000, views: 88700, clicks: 4120, conversions: 156, revenue: 12700000 },
];
const campaignKpiDefinitions = [
  { key: 'impressions', label: '노출수', goal: 92, yoy: 108 }, { key: 'clicks', label: '클릭수', goal: 86, yoy: 104 }, { key: 'views', label: '조회수', goal: 78, yoy: 112 },
  { key: 'cost', label: '비용', goal: 81, yoy: 96 }, { key: 'conversions', label: '구매(GA)', goal: 88, yoy: 109 }, { key: 'revenue', label: '매출액(GA)', goal: 95, yoy: 118 },
  { key: 'cpm', label: 'CPM', goal: 84, yoy: 103 }, { key: 'ctr', label: 'CTR', goal: 91, yoy: 106 }, { key: 'cpv', label: 'CPV', goal: 76, yoy: 98 },
  { key: 'purchaseRate', label: '구매전환율(GA)', goal: 87, yoy: 111 }, { key: 'cpo', label: 'CPO', goal: 82, yoy: 94 }, { key: 'roas', label: 'ROAS', goal: 97, yoy: 121 },
];
const trendColors = ['#48d9ff', '#ff8ca2', '#a99eff'];
let selectedTrendMetrics = ['cost', 'revenue'];
let trendTimeUnit = 'daily';
let campaignMediaOptions = [];
let legacyCampaignMediaOptions = [];
let campaignFilterRows = [];
let selectedCampaignMedia = new Set();
let campaignMetricRequestId = 0;
let campaignMediaTableRequestId = 0;
let weeklyGaViewMode = 'combined';
let latestWeeklyGaRows = [];

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

function render(period) {
  const sourceRows = datasets[period];
  const rows = activeChannel === 'all'
    ? sourceRows
    : activeChannel === 'other'
      ? sourceRows.filter(row => !['Google Ads', 'Meta', 'Naver'].includes(row.channel))
      : sourceRows.filter(row => row.channel === activeChannel);
  const metrics = calculateMetrics(rows);
  const cards = [
    ['노출수', metrics.impressions, 'number'],
    ['클릭수', metrics.clicks, 'number'],
    ['광고비', metrics.cost, 'currency'],
    ['구매', metrics.conversions, 'number'],
    ['매출', metrics.revenue, 'currency'],
    ['CTR', metrics.ctr, 'percent'],
    ['CPC', metrics.cpc, 'currency'],
    ['CVR', metrics.cvr, 'percent'],
    ['CPA', metrics.cpa, 'currency'],
    ['ROAS', metrics.roas, 'percent'],
  ];

  document.querySelector('#overview').innerHTML = cards.map(([label, value, format]) => `
    <article class="metric-card ${label === 'ROAS' ? 'accent' : ''}">
      <p class="metric-label">${label}</p>
      <p class="metric-value" data-target="${value}" data-format="${format}">0</p>
    </article>`).join('');
  renderMediaOverview(rows, metrics.cost);
  renderDailyTrend(period);
  runEntranceAnimations();
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
    <div class="media-list">${parts.map(item => `<div><span><i style="background:${item.color}"></i>${item.channel}</span><strong>${number.format(item.cost)} <em>${item.share.toFixed(1)}%</em></strong></div>`).join('')}</div>` : '<p class="empty-state">해당 매체 데이터가 없습니다.</p>';
}

function renderDailyTrend(period) {
  const trend = trends[period];
  const scale = activeChannel === 'all' ? 1 : activeChannel === 'other' ? 0 : activeChannel === 'Google Ads' ? .42 : activeChannel === 'Meta' ? .31 : .27;
  const costs = trend.cost.map(value => value * scale);
  const ctrs = trend.revenue.map((value, index) => costs[index] ? value / costs[index] * .45 : 0);
  const width = 850, height = 250, left = 34, bottom = 34, top = 22;
  const maxCost = Math.max(...costs, 1) * 1.15;
  const maxCtr = Math.max(...ctrs, 1) * 1.2;
  const step = (width - left * 2) / trend.labels.length;
  const line = ctrs.map((value, index) => `${index ? 'L' : 'M'} ${left + step * index + step / 2} ${top + (height - top - bottom) * (1 - value / maxCtr)}`).join(' ');
  document.querySelector('#daily-trend').innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="광고비 막대와 CTR 선 그래프">
    ${[0,1,2,3].map(i => `<line class="daily-grid" x1="${left}" y1="${top + i * 55}" x2="${width-left}" y2="${top + i * 55}"/>`).join('')}
    ${costs.map((value, index) => `<rect class="daily-bar" x="${left + step * index + step * .2}" y="${top + (height-top-bottom)*(1-value/maxCost)}" width="${step*.6}" height="${(height-top-bottom)*value/maxCost}" rx="4"/>`).join('')}
    <path class="daily-line" d="${line}"/>
    ${ctrs.map((value, index) => `<circle class="daily-point" cx="${left + step * index + step/2}" cy="${top+(height-top-bottom)*(1-value/maxCtr)}" r="3"/>`).join('')}
    ${trend.labels.map((label,index) => `<text class="daily-label" x="${left+step*index+step/2}" y="${height-8}" text-anchor="middle">${label}</text>`).join('')}
  </svg>`;
}

const formatAnimatedValue = (value, format) => {
  if (format === 'number') return number.format(Math.round(value));
  if (format === 'currency') return number.format(Math.round(value));
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
  const kpiValues = { impressions: metrics.impressions, clicks: metrics.clicks, views, cost: metrics.cost, conversions: metrics.conversions, revenue: metrics.revenue, cpm, ctr: metrics.ctr, cpv, purchaseRate, cpo, roas: metrics.roas };
  const formatKpi = (key, value) => ['ctr', 'purchaseRate', 'roas'].includes(key) ? `${value.toFixed(key === 'roas' ? 1 : 2)}%` : number.format(Math.round(value));
  document.querySelector('#campaign-kpis').innerHTML = campaignKpiDefinitions.map(({ key, label, goal, yoy }) => `<article class="campaign-kpi ${label === 'ROAS' ? 'accent' : ''} ${selectedTrendMetrics.includes(key) ? 'selected' : ''}" role="button" tabindex="0" data-kpi-key="${key}" aria-pressed="${selectedTrendMetrics.includes(key)}"><span>${label}</span><strong>${formatKpi(key, kpiValues[key])}</strong><div class="kpi-progress"><small class="${goal >= 100 ? 'positive' : 'negative'}"><b>${goal >= 100 ? '▲' : '▼'} ${goal}%</b> 목표 대비</small><small class="${yoy >= 100 ? 'positive' : 'negative'}"><b>${yoy >= 100 ? '▲' : '▼'} ${yoy}%</b> YoY 대비</small></div></article>`).join('');
  renderCampaignTrend(rows, kpiValues);

  document.querySelector('#campaign-table-body').innerHTML = '<tr><td colspan="12" class="empty-state">GA 데이터 불러오는 중…</td></tr>';
  loadCampaignMediaMetrics();
}

async function loadCampaignMediaMetrics() {
  const campaign = document.querySelector('#campaign-select').value;
  const business = document.querySelector('#campaign-business').value;
  const requestId = ++campaignMetricRequestId;
  const mediaKeys = ['impressions', 'clicks', 'views', 'cost', 'cpm', 'ctr', 'cpv', 'conversions', 'revenue', 'purchaseRate', 'cpo', 'roas'];
  mediaKeys.forEach(key => document.querySelector(`[data-kpi-key="${key}"]`)?.classList.add('loading'));
  try {
    const params = new URLSearchParams({ campaign, business, media: [...selectedCampaignMedia].join(','), start: startDate.value, end: endDate.value });
    const response = await fetch(`/api/campaign-media-metrics?${params}`, { headers: { Accept: 'application/json' } });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '매체 데이터를 불러오지 못했습니다.');
    if (requestId !== campaignMetricRequestId) return;
    const format = (key, value) => ['ctr', 'purchaseRate', 'roas'].includes(key) ? `${value.toFixed(key === 'roas' ? 1 : 2)}%` : number.format(Math.round(value));
    mediaKeys.forEach(key => {
      const card = document.querySelector(`[data-kpi-key="${key}"]`);
      if (!card) return;
      card.classList.remove('loading', 'load-error');
      card.querySelector('strong').textContent = format(key, result.metrics[key]);
      card.querySelector('.kpi-progress').innerHTML = `<small class="actual-data">BigQuery · ${result.startDate}–${result.endDate}</small>`;
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
        ? `${sign}${Math.abs(gap).toFixed(key === 'roas' ? 1 : 2)}%p`
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
      return `<tr class="media-result-row media-total-row ${inactive ? 'media-inactive-row' : ''}" data-business="${row.business}" data-kpi="TTL"><td><span class="media-attribute-badge business-${row.business.toLowerCase()}">${row.business}</span></td><td><span class="media-attribute-badge kpi-total">TTL</span></td><td>전체</td><td><strong>전체 매체</strong></td><td>${period}</td>${metricCell(integer(row.cost), gap(achievementGap, row.cost, row.target.cost))}${metricCell(integer(row.impressions), gap(achievementGap, row.impressions, row.target.impressions))}${metricCell(integer(row.clicks), gap(achievementGap, row.clicks, row.target.clicks))}${metricCell(integer(row.views), gap(achievementGap, row.views, row.target.views))}${metricCell(integer(row.cpm), gap(differenceGap, 'cpm', row.cpm, row.target.cpm))}${metricCell(integer(row.cpc), gap(differenceGap, 'cpc', row.cpc, row.target.cpc))}${metricCell(integer(row.cpv), gap(differenceGap, 'cpv', row.cpv, row.target.cpv))}${metricCell(percent(row.ctr), gap(differenceGap, 'ctr', row.ctr, row.target.ctr))}${metricCell(percent(row.vtr), gap(differenceGap, 'vtr', row.vtr, row.target.vtr))}${metricCell(integer(row.purchases), gap(achievementGap, row.purchases, row.target.purchases))}${metricCell(integer(row.revenue), gap(achievementGap, row.revenue, row.target.revenue))}${metricCell(integer(row.cpo), gap(differenceGap, 'cpo', row.cpo, row.target.cpo))}${metricCell(percent(row.cvr), gap(differenceGap, 'cvr', row.cvr, row.target.cvr))}${metricCell(percent(row.roas, 1), gap(differenceGap, 'roas', row.roas, row.target.roas))}</tr>`;
    };
    const totalRows = ['MKT', 'PERF'].map(aggregateBusiness).map(renderTotalRow).join('');
    const detailRows = result.rows.map((row, index) => {
      const previous = result.rows[index - 1];
      const groupStart = !previous || previous.business !== row.business || previous.kpi !== row.kpi;
      const inactive = row.impressions === 0;
      const period = `${operationDate(row.operationStart)}–${operationDate(row.operationEnd)}`;
      const gap = (builder, ...args) => inactive ? '' : builder(...args);
      return `<tr class="media-result-row ${groupStart ? 'attribute-group-start' : ''} ${inactive ? 'media-inactive-row' : ''}" data-business="${escapeHtml(row.business)}" data-kpi="${escapeHtml(row.kpi)}"><td><span class="media-attribute-badge business-${row.business.toLowerCase()}">${escapeHtml(row.business)}</span></td><td><span class="media-attribute-badge kpi-${kpiClasses[row.kpi] ?? 'other'}">${escapeHtml(row.kpi || '-')}</span></td><td>${escapeHtml(row.platform)}</td><td><strong>${escapeHtml(row.media)}</strong></td><td>${escapeHtml(period)}</td>${metricCell(integer(row.cost), gap(achievementGap, row.cost, row.target.cost))}${metricCell(integer(row.impressions), gap(achievementGap, row.impressions, row.target.impressions))}${metricCell(integer(row.clicks), gap(achievementGap, row.clicks, row.target.clicks))}${metricCell(integer(row.views), gap(achievementGap, row.views, row.target.views))}${metricCell(integer(row.cpm), gap(differenceGap, 'cpm', row.cpm, row.target.cpm))}${metricCell(integer(row.cpc), gap(differenceGap, 'cpc', row.cpc, row.target.cpc))}${metricCell(integer(row.cpv), gap(differenceGap, 'cpv', row.cpv, row.target.cpv))}${metricCell(percent(row.ctr), gap(differenceGap, 'ctr', row.ctr, row.target.ctr))}${metricCell(percent(row.vtr), gap(differenceGap, 'vtr', row.vtr, row.target.vtr))}${metricCell(integer(row.purchases), gap(achievementGap, row.purchases, row.target.purchases))}${metricCell(integer(row.revenue), gap(achievementGap, row.revenue, row.target.revenue))}${metricCell(integer(row.cpo), gap(differenceGap, 'cpo', row.cpo, row.target.cpo))}${metricCell(percent(row.cvr), gap(differenceGap, 'cvr', row.cvr, row.target.cvr))}${metricCell(percent(row.roas, 1), gap(differenceGap, 'roas', row.roas, row.target.roas))}</tr>`;
    }).join('');
    tableBody.innerHTML = totalRows + detailRows;
  } catch (error) {
    if (requestId !== campaignMediaTableRequestId) return;
    tableBody.innerHTML = `<tr><td colspan="19" class="empty-state">${error.message}</td></tr>`;
  }
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
  const format = (value, definition) => definition.unit === 'currency' ? `${number.format(Math.round(value))}원` : `${value.toFixed(definition.metric === 'roas' ? 1 : 2)}%`;
  container.innerHTML = definitions.map(definition => {
    const values = aggregate(rows.filter(row => row.kpi === definition.kpi));
    const target = metricValue(definition.metric, values.target);
    const actual = metricValue(definition.metric, values.actual);
    const gap = actual - target;
    const sign = gap > 0 ? '+' : gap < 0 ? '−' : '';
    const gapValue = definition.unit === 'currency' ? `${sign}${number.format(Math.round(Math.abs(gap)))}원` : `${sign}${Math.abs(gap).toFixed(definition.metric === 'roas' ? 1 : 2)}%p`;
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
  const width = 780, height = 250, left = 34, right = 24, top = 18, bottom = 34;
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
  if (['ctr', 'purchaseRate', 'roas'].includes(key)) return `${value.toFixed(2)}%`;
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

function showReportView(hash = window.location.hash) {
  const campaignMode = hash === '#campaign-report';
  const mediaTabActive = document.querySelector('[data-report-tab="media"]')?.classList.contains('active');
  document.querySelector('#overview-view').hidden = campaignMode;
  document.querySelector('#campaign-report').hidden = !campaignMode;
  const pageHeader = document.querySelector('.page-header');
  pageHeader.querySelector(':scope > div:first-child').hidden = campaignMode;
  document.querySelector('#campaign-global-filter').hidden = !campaignMode;
  document.querySelector('.period-control').hidden = campaignMode && mediaTabActive;
  pageHeader.classList.toggle('campaign-period-header', campaignMode);
  document.querySelectorAll('.sidebar nav a').forEach(link => link.classList.toggle('active', campaignMode ? link.hash === '#campaign-report' : link.hash === (hash || '#overview')));
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

function showCampaignTab(tab) {
  const labels = { creative: ['03', '소재'], mix: ['04', '미디어믹스'] };
  const summary = tab === 'summary';
  const media = tab === 'media';
  document.querySelector('#campaign-summary-tab').hidden = !summary;
  document.querySelector('#campaign-media-tab').hidden = !media;
  document.querySelector('#campaign-tab-placeholder').hidden = summary || media;
  document.querySelector('.period-control').hidden = media;
  document.querySelectorAll('[data-report-tab]').forEach(button => {
    const active = button.dataset.reportTab === tab;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  const selectedCampaign = document.querySelector('#campaign-select').value;
  document.querySelectorAll('.campaign-tab-panel').forEach(panel => {
    panel.dataset.campaign = selectedCampaign;
  });
  if (!summary && !media) {
    document.querySelector('#campaign-tab-index').textContent = labels[tab][0];
    document.querySelector('#campaign-tab-title').textContent = labels[tab][1];
  }
  if (media) {
    applyMediaProgressColors();
    loadCampaignMediaTable();
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
    updateCampaignDrilldown('campaign');
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
let selectedPreset = 'yesterday';

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

function applyPeriod() {
  const labels = { yesterday: '어제', 7: '지난 7일', 30: '지난 30일', 90: '지난 90일', 'this-month': '이번 달', 'last-month': '지난 달', custom: '선택 기간' };
  periodSummary.textContent = labels[selectedPreset];
  periodDates.textContent = `${formatDate(startDate.value)} – ${formatDate(endDate.value)}`;
  document.querySelectorAll('.period-presets button').forEach(button => button.classList.toggle('active', button.dataset.period === selectedPreset));
  render(['yesterday', '7'].includes(selectedPreset) ? '7' : '30');
  renderCampaignReport();
  closePeriodPicker();
}

function getPeriodDayCount() {
  if (!startDate?.value || !endDate?.value) return 30;
  const start = new Date(`${startDate.value}T00:00:00`);
  const end = new Date(`${endDate.value}T00:00:00`);
  return Math.max(1, Math.round((end - start) / 86400000) + 1);
}

periodTrigger.addEventListener('click', () => {
  periodPicker.hidden = !periodPicker.hidden;
  periodTrigger.setAttribute('aria-expanded', String(!periodPicker.hidden));
});
document.querySelectorAll('.period-presets button').forEach(button => button.addEventListener('click', () => {
  selectedPreset = button.dataset.period;
  if (selectedPreset !== 'custom') setDateRange(selectedPreset);
  document.querySelectorAll('.period-presets button').forEach(item => item.classList.toggle('active', item === button));
}));
[startDate, endDate].forEach(input => input.addEventListener('change', () => { selectedPreset = 'custom'; }));
document.querySelector('#period-apply').addEventListener('click', applyPeriod);
document.querySelector('#period-cancel').addEventListener('click', closePeriodPicker);
document.addEventListener('click', event => { if (!event.target.closest('.period-control')) closePeriodPicker(); });
document.querySelectorAll('.media-filter button').forEach(button => button.addEventListener('click', () => {
  activeChannel = button.dataset.channel;
  document.querySelectorAll('.media-filter button').forEach(item => item.classList.toggle('active', item === button));
  render(['yesterday', '7'].includes(selectedPreset) ? '7' : '30');
}));
document.querySelectorAll('.sidebar nav a').forEach(link => link.addEventListener('click', () => window.setTimeout(() => showReportView(link.hash), 0)));
document.querySelector('#campaign-select').addEventListener('change', () => {
  updateCampaignDrilldown('campaign');
  const activeTab = document.querySelector('[data-report-tab].active')?.dataset.reportTab || 'summary';
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
window.addEventListener('hashchange', () => showReportView());
window.addEventListener('resize', updateCampaignStickyOffsets);

setDateRange('yesterday');
applyPeriod();
updateCampaignDrilldown();
showReportView();
loadCampaignOptions();
