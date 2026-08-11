import { calculateMetrics } from './metrics.js';

const datasets = {
  30: [
    { channel: 'Google Ads', color: '#4285f4', impressions: 482000, clicks: 14520, cost: 18400000, conversions: 612, revenue: 53700000 },
    { channel: 'Meta', color: '#7656f6', impressions: 391000, clicks: 11230, cost: 13900000, conversions: 487, revenue: 39600000 },
    { channel: 'Naver', color: '#03c75a', impressions: 276000, clicks: 9380, cost: 12100000, conversions: 429, revenue: 35800000 },
  ],
  7: [
    { channel: 'Google Ads', color: '#4285f4', impressions: 121000, clicks: 3810, cost: 4720000, conversions: 163, revenue: 14100000 },
    { channel: 'Meta', color: '#7656f6', impressions: 98000, clicks: 2860, cost: 3510000, conversions: 128, revenue: 10500000 },
    { channel: 'Naver', color: '#03c75a', impressions: 69000, clicks: 2410, cost: 3060000, conversions: 110, revenue: 9200000 },
  ],
};

const won = new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW', maximumFractionDigits: 0 });
const number = new Intl.NumberFormat('ko-KR');

function render(period) {
  const rows = datasets[period];
  const metrics = calculateMetrics(rows);
  const cards = [
    ['총 광고비', won.format(metrics.cost), `CPC ${won.format(metrics.cpc)}`],
    ['총 전환', `${number.format(metrics.conversions)}건`, `CVR ${metrics.cvr.toFixed(2)}%`],
    ['총 매출', won.format(metrics.revenue), `CTR ${metrics.ctr.toFixed(2)}%`],
    ['통합 ROAS', `${metrics.roas.toFixed(1)}%`, `CPA ${won.format(metrics.cpa)}`],
  ];

  document.querySelector('#overview').innerHTML = cards.map(([label, value, detail], index) => `
    <article class="metric-card ${index === 3 ? 'accent' : ''}">
      <p class="metric-label">${label}</p><p class="metric-value">${value}</p><p class="metric-detail">${detail}</p>
    </article>`).join('');

  document.querySelector('#channel-rows').innerHTML = rows.map(row => {
    const item = calculateMetrics([row]);
    return `<tr><td><span class="channel"><i class="channel-dot" style="background:${row.color}"></i>${row.channel}</span></td>
      <td>${number.format(row.impressions)}</td><td>${number.format(row.clicks)}</td><td>${won.format(row.cost)}</td>
      <td>${number.format(row.conversions)}</td><td>${won.format(row.revenue)}</td><td>${item.ctr.toFixed(2)}%</td><td>${item.roas.toFixed(1)}%</td></tr>`;
  }).join('');
}

document.querySelector('#period').addEventListener('change', event => render(event.target.value));
document.querySelector('#updated-at').textContent = `업데이트 ${new Date().toLocaleDateString('ko-KR')}`;
render('30');
