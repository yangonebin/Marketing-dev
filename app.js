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
  const rows = datasets[period];
  const metrics = calculateMetrics(rows);
  const cards = [
    ['총 광고비', metrics.cost, 'compact', `CPC ${won.format(metrics.cpc)}`, 'SPEND'],
    ['총 전환', metrics.conversions, 'count', `CVR ${metrics.cvr.toFixed(2)}%`, 'CONVERSION'],
    ['총 매출', metrics.revenue, 'compact', `CTR ${metrics.ctr.toFixed(2)}%`, 'REVENUE'],
    ['통합 ROAS', metrics.roas, 'percent', `CPA ${won.format(metrics.cpa)}`, 'ROAS'],
  ];

  document.querySelector('#overview').innerHTML = cards.map(([label, value, format, detail, code], index) => `
    <article class="metric-card ${index === 3 ? 'accent' : ''}">
      <div class="metric-top"><span>${String(index + 1).padStart(2, '0')}</span><small>${code}</small></div>
      <p class="metric-label">${label}</p><p class="metric-value" data-target="${value}" data-format="${format}">0</p>
      <p class="metric-detail"><i>↗</i> ${detail}</p>
    </article>`).join('');

  document.querySelector('#trend-chart').innerHTML = `${makeTrendChart(period)}<div class="chart-tooltip" role="status" aria-live="polite"></div>`;
  bindChartTooltip();

  const achievement = Math.min(metrics.roas / targetRoas * 100, 100);
  document.querySelector('#roas-gauge').innerHTML = `
    <div class="semi-gauge">
      <svg viewBox="0 0 220 125" role="img" aria-label="목표 ROAS 달성률 ${achievement.toFixed(0)}퍼센트">
        <path class="gauge-track" pathLength="100" d="M20 108 A90 90 0 0 1 200 108" />
        <path class="gauge-progress" pathLength="100" stroke-dasharray="${achievement} 100" d="M20 108 A90 90 0 0 1 200 108" />
      </svg>
      <div><strong><b data-target="${achievement}" data-format="gauge">0</b><small>%</small></strong><span>목표 ${targetRoas}%</span></div>
    </div>
    <div class="gauge-copy"><span>현재 ROAS</span><strong>${metrics.roas.toFixed(1)}%</strong><p>${achievement >= 100 ? '목표를 달성했습니다.' : `목표까지 ${(targetRoas - metrics.roas).toFixed(1)}%p 남았습니다.`}</p></div>`;

  const funnelSteps = [
    { label: '노출', value: metrics.impressions, rate: 100, className: 'impressions' },
    { label: '클릭', value: metrics.clicks, rate: metrics.ctr, className: 'clicks' },
    { label: '전환', value: metrics.conversions, rate: metrics.cvr, className: 'conversions' },
  ];
  document.querySelector('#conversion-funnel').innerHTML = `
    <div class="funnel-shape" aria-hidden="true">
      <svg viewBox="0 0 180 106">
        <defs><linearGradient id="funnel-gradient" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7c6cff"/><stop offset="1" stop-color="#48d9ff"/></linearGradient></defs>
        <polygon class="funnel-bar impressions" points="4,4 176,4 151,32 29,32"/>
        <polygon class="funnel-bar clicks" points="33,39 147,39 132,67 48,67"/>
        <polygon class="funnel-bar conversions" points="61,74 119,74 110,102 70,102"/>
      </svg>
    </div>
    <div class="funnel-list">${funnelSteps.map((step, index) => `<div>
      <span><i class="${step.className}"></i>${step.label}</span><strong>${compactWon.format(step.value)}</strong>
      <small>${index === 0 ? '전체 도달' : `${index === 1 ? 'CTR' : 'CVR'} ${step.rate.toFixed(2)}%`}</small>
    </div>`).join('')}</div>`;

  document.querySelector('#channel-rows').innerHTML = rows.map(row => {
    const item = calculateMetrics([row]);
    return `<tr><td><span class="channel"><i class="channel-dot" style="background:${row.color}"></i>${row.channel}</span></td>
      <td>${number.format(row.impressions)}</td><td>${number.format(row.clicks)}</td><td>${compactWon.format(row.cost)}</td>
      <td>${number.format(row.conversions)}</td><td>${compactWon.format(row.revenue)}</td><td>${item.ctr.toFixed(2)}%</td><td><strong>${item.roas.toFixed(1)}%</strong></td></tr>`;
  }).join('');

  runEntranceAnimations();
}

const formatAnimatedValue = (value, format) => {
  if (format === 'compact') return compactWon.format(Math.round(value));
  if (format === 'count') return `${number.format(Math.round(value))}건`;
  if (format === 'percent') return `${value.toFixed(1)}%`;
  return Math.round(value).toString();
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

document.querySelector('#updated-at').textContent = `${new Date().toLocaleDateString('ko-KR')} 기준`;

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

setDateRange('yesterday');
applyPeriod();
