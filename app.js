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
  closePeriodPicker();
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

setDateRange('yesterday');
applyPeriod();
