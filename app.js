import { calculateMetrics } from './metrics.js';

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
  { key: 'ctm', label: 'CTM', goal: 84, yoy: 103 }, { key: 'ctr', label: 'CTR', goal: 91, yoy: 106 }, { key: 'cpv', label: 'CPV', goal: 76, yoy: 98 },
  { key: 'purchaseRate', label: '구매전환율(GA)', goal: 87, yoy: 111 }, { key: 'cpo', label: 'CPO', goal: 82, yoy: 94 }, { key: 'roas', label: 'ROAS', goal: 97, yoy: 121 },
];
const weeklyGaRows = [
  { weekStart: '26-07-27 주차', weekRange: '7/27–8/2', sessions: 184520, duration: 172, scrolls: 96240, users: 142860, newUsers: 101430, carts: 6840, purchases: 2940, revenue: 148200000 },
  { weekStart: '26-08-03 주차', weekRange: '8/3–8/9', sessions: 196840, duration: 181, scrolls: 105720, users: 151230, newUsers: 106590, carts: 7290, purchases: 3180, revenue: 161700000 },
  { weekStart: '26-08-10 주차', weekRange: '8/10–8/16', sessions: 191360, duration: 176, scrolls: 101880, users: 147640, newUsers: 102780, carts: 7060, purchases: 3070, revenue: 156400000 },
  { weekStart: '26-08-17 주차', weekRange: '8/17–8/23', sessions: 207920, duration: 188, scrolls: 114360, users: 159810, newUsers: 113720, carts: 7820, purchases: 3460, revenue: 179800000 },
];
const trendColors = ['#48d9ff', '#ff8ca2', '#a99eff'];
let selectedTrendMetrics = ['cost', 'revenue'];
let trendTimeUnit = 'daily';
let selectedCampaignMedia = new Set(['Google Ads', 'Meta', 'Naver']);

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
  const ctm = metrics.impressions ? metrics.cost / metrics.impressions * 1000 : 0;
  const cpv = views ? metrics.cost / views : 0;
  const purchaseRate = metrics.clicks ? metrics.conversions / metrics.clicks * 100 : 0;
  const cpo = metrics.conversions ? metrics.cost / metrics.conversions : 0;
  const kpiValues = { impressions: metrics.impressions, clicks: metrics.clicks, views, cost: metrics.cost, conversions: metrics.conversions, revenue: metrics.revenue, ctm, ctr: metrics.ctr, cpv, purchaseRate, cpo, roas: metrics.roas };
  const formatKpi = (key, value) => ['ctr', 'purchaseRate', 'roas'].includes(key) ? `${value.toFixed(key === 'roas' ? 1 : 2)}%` : number.format(Math.round(value));
  document.querySelector('#campaign-kpis').innerHTML = campaignKpiDefinitions.map(({ key, label, goal, yoy }) => `<article class="campaign-kpi ${label === 'ROAS' ? 'accent' : ''} ${selectedTrendMetrics.includes(key) ? 'selected' : ''}" role="button" tabindex="0" data-kpi-key="${key}" aria-pressed="${selectedTrendMetrics.includes(key)}"><span>${label}</span><strong>${formatKpi(key, kpiValues[key])}</strong><div class="kpi-progress"><small class="${goal >= 100 ? 'positive' : 'negative'}"><b>${goal >= 100 ? '▲' : '▼'} ${goal}%</b> 목표 대비</small><small class="${yoy >= 100 ? 'positive' : 'negative'}"><b>${yoy >= 100 ? '▲' : '▼'} ${yoy}%</b> YoY 대비</small></div></article>`).join('');
  renderCampaignTrend(rows, kpiValues);

  const active = rows.filter(row => row.status === '운영중').length;
  document.querySelector('#campaign-status').innerHTML = `<div class="status-ring" style="--progress:${rows.length ? active / rows.length * 100 : 0}%"><div><strong>${active}</strong><small>운영중</small></div></div><dl><div><dt>전체</dt><dd>${rows.length}개</dd></div><div><dt>운영중</dt><dd>${active}개</dd></div><div><dt>종료</dt><dd>${rows.length-active}개</dd></div></dl>`;
  renderWeeklyGaTable(getPeriodDayCount());
}

function updateCampaignDrilldown(level = 'campaign') {
  const campaignSelect = document.querySelector('#campaign-select');
  const businessSelect = document.querySelector('#campaign-business');
  const campaign = campaignSelect.value;
  const previousBusiness = businessSelect.value;
  const campaignScope = campaignRows.filter(row => campaign === 'all' || row.key === campaign);
  const businesses = [...new Map(campaignScope.map(row => [row.business, row.businessLabel])).entries()];
  businessSelect.innerHTML = `<option value="all">전체 사업부</option>${businesses.map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}`;
  businessSelect.value = level === 'campaign' && businesses.length === 1 ? businesses[0][0] : businesses.some(([value]) => value === previousBusiness) ? previousBusiness : 'all';
  const business = businessSelect.value;
  const media = [...new Set(campaignScope.filter(row => business === 'all' || row.business === business).map(row => row.channel))];
  selectedCampaignMedia = new Set(media);
  renderCampaignMediaOptions(media);
  renderCampaignReport();
}

function renderCampaignMediaOptions(media) {
  const options = document.querySelector('#campaign-media-options');
  options.innerHTML = `<label class="select-all"><input type="checkbox" value="all" ${selectedCampaignMedia.size === media.length ? 'checked' : ''}><span>전체 매체</span></label>${media.map(channel => `<label><input type="checkbox" value="${channel}" ${selectedCampaignMedia.has(channel) ? 'checked' : ''}><span>${channel}</span></label>`).join('')}`;
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

function renderWeeklyGaTable(periodDays = 30) {
  const delta = (current, previous, invert = false) => {
    if (!previous) return '<small class="ga-delta neutral">기준 주차</small>';
    const change = (current - previous) / previous * 100;
    const positive = invert ? change <= 0 : change >= 0;
    return `<small class="ga-delta ${positive ? 'up' : 'down'}">${change >= 0 ? '▲' : '▼'} ${Math.abs(change).toFixed(1)}%</small>`;
  };
  const duration = seconds => `${Math.floor(seconds / 60)}분 ${String(seconds % 60).padStart(2, '0')}초`;
  const cell = (value, comparison, formatted = number.format(value), invert = false) => `<td><strong>${formatted}</strong>${delta(value, comparison, invert)}</td>`;
  const visibleRows = weeklyGaRows.slice(-Math.max(1, Math.min(weeklyGaRows.length, Math.ceil(periodDays / 7))));
  document.querySelector('#campaign-table-body').innerHTML = visibleRows.map((row, index) => {
    const originalIndex = weeklyGaRows.indexOf(row);
    const previous = weeklyGaRows[originalIndex - 1];
    const newUserShare = row.newUsers / row.users * 100;
    const previousNewUserShare = previous ? previous.newUsers / previous.users * 100 : 0;
    const conversionRate = row.purchases / row.sessions * 100;
    const previousConversionRate = previous ? previous.purchases / previous.sessions * 100 : 0;
    const cartRate = row.carts / row.sessions * 100;
    const previousCartRate = previous ? previous.carts / previous.sessions * 100 : 0;
    const end = endDate?.value ? new Date(`${endDate.value}T00:00:00`) : new Date();
    const endDay = end.getDay();
    const latestMonday = addDays(end, -(endDay === 0 ? 6 : endDay - 1));
    const monday = addDays(latestMonday, (index - visibleRows.length + 1) * 7);
    const sunday = addDays(monday, 6);
    const weekStart = `${String(monday.getFullYear()).slice(-2)}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')} 주차`;
    const weekRange = `${monday.getMonth() + 1}/${monday.getDate()}–${sunday.getMonth() + 1}/${sunday.getDate()}`;
    return `<tr><td><strong>${weekStart}</strong><small class="week-basis">${weekRange}</small></td>${cell(row.sessions, previous?.sessions)}${cell(row.duration, previous?.duration, duration(row.duration))}${cell(row.scrolls, previous?.scrolls)}${cell(row.users, previous?.users)}${cell(row.newUsers, previous?.newUsers)}${cell(newUserShare, previousNewUserShare, `${newUserShare.toFixed(1)}%`)}${cell(row.carts, previous?.carts)}${cell(row.purchases, previous?.purchases)}${cell(row.revenue, previous?.revenue)}${cell(conversionRate, previousConversionRate, `${conversionRate.toFixed(2)}%`)}${cell(cartRate, previousCartRate, `${cartRate.toFixed(2)}%`)}</tr>`;
  }).join('');
}

function renderCampaignTrend(rows, totals) {
  const chart = document.querySelector('#campaign-trend-chart');
  if (!rows.length || !selectedTrendMetrics.length) {
    chart.innerHTML = `<p class="empty-state">${rows.length ? '표시할 지표 카드를 선택하세요.' : '선택한 조건의 추이 데이터가 없습니다.'}</p>`;
    document.querySelector('#trend-series-legend').innerHTML = '';
    return;
  }
  const periodDays = getPeriodDayCount();
  const pointCount = trendTimeUnit === 'daily' ? Math.min(periodDays, 31) : Math.min(Math.ceil(periodDays / 7), 13);
  const shape = Array.from({ length: pointCount }, (_, index) => {
    if (pointCount === 1) return 1;
    const progress = index / (pointCount - 1);
    return .58 + progress * .34 + Math.sin(index * 1.65) * .08;
  });
  const labels = makeTrendDateLabels(trendTimeUnit, shape.length);
  const businessFactor = { all: 1, outdoor: .52, sports: .31, kids: .17 }[document.querySelector('#business-unit').value];
  const width = 780, height = 250, left = 34, right = 24, top = 18, bottom = 34;
  const step = shape.length > 1 ? (width - left - right) / (shape.length - 1) : 0;
  const plotStartX = shape.length > 1 ? left : (left + width - right) / 2;
  const series = selectedTrendMetrics.map((key, seriesIndex) => {
    const definition = campaignKpiDefinitions.find(item => item.key === key);
    const total = totals[key] * businessFactor;
    const values = shape.map((ratio, index) => total / pointCount * ratio * (1 + seriesIndex * .035 * (index % 2 ? 1 : -1)));
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
  const hitWidth = shape.length > 1 ? step : width - left - right;
  const labelInterval = Math.max(1, Math.ceil(labels.length / 7));
  const axisLabels = labels.map((label, index) => index % labelInterval === 0 || index === labels.length - 1 ? `<text class="daily-label" x="${plotStartX+index*step}" y="${height-7}" text-anchor="middle">${label}</text>` : '').join('');
  chart.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${series.map(item => item.label).join(', ')} 추이">${[0,1,2,3,4].map(i => `<line class="daily-grid" x1="${left}" y1="${top+i*(height-top-bottom)/4}" x2="${width-right}" y2="${top+i*(height-top-bottom)/4}"/>`).join('')}<line class="campaign-hover-line" x1="0" y1="${top}" x2="0" y2="${height-bottom}"/>${series.map(item => `<path class="campaign-series-line" style="--series-color:${item.color}" d="${item.path}"/>${item.values.map((value,index) => `<circle class="campaign-series-point" style="--series-color:${item.color}" cx="${plotStartX+index*step}" cy="${top+(height-top-bottom)*(1-item.displayRatios[index])}" r="3"/>`).join('')}`).join('')}${axisLabels}${labels.map((label,index) => `<rect class="campaign-chart-hit" x="${shape.length === 1 ? left : Math.max(0, plotStartX+index*step-step/2)}" y="${top}" width="${shape.length === 1 ? hitWidth : index === 0 || index === labels.length-1 ? step/2+18 : step}" height="${height-top-bottom}" tabindex="0" data-index="${index}" aria-label="${label}, ${series.map(item => ariaValue(item,index)).join(', ')}"/>`).join('')}</svg><div class="campaign-chart-tooltip" role="status"></div>`;
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
  document.querySelector('#overview-view').hidden = campaignMode;
  document.querySelector('#campaign-report').hidden = !campaignMode;
  const pageHeader = document.querySelector('.page-header');
  pageHeader.querySelector(':scope > div:first-child').hidden = campaignMode;
  pageHeader.classList.toggle('campaign-period-header', campaignMode);
  document.querySelectorAll('.sidebar nav a').forEach(link => link.classList.toggle('active', campaignMode ? link.hash === '#campaign-report' : link.hash === (hash || '#overview')));
  if (campaignMode) renderCampaignReport();
}

function showCampaignTab(tab) {
  const labels = { creative: ['03', '소재'], mix: ['04', '미디어믹스'] };
  const summary = tab === 'summary';
  const media = tab === 'media';
  document.querySelector('#campaign-summary-tab').hidden = !summary;
  document.querySelector('#campaign-media-tab').hidden = !media;
  document.querySelector('#campaign-tab-placeholder').hidden = summary || media;
  document.querySelectorAll('[data-report-tab]').forEach(button => {
    const active = button.dataset.reportTab === tab;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  if (!summary && !media) {
    document.querySelector('#campaign-tab-index').textContent = labels[tab][0];
    document.querySelector('#campaign-tab-title').textContent = labels[tab][1];
  }
  if (media) applyMediaProgressColors();
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
document.querySelector('#campaign-select').addEventListener('change', () => updateCampaignDrilldown('campaign'));
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
document.querySelector('#business-unit').addEventListener('change', renderCampaignReport);
window.addEventListener('hashchange', () => showReportView());

setDateRange('yesterday');
applyPeriod();
updateCampaignDrilldown();
showReportView();
