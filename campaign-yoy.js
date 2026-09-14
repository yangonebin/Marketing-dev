export function getCampaignYoy(rows = [], campaign) {
  const headerIndex = rows.findIndex(row => row.some(value => String(value).trim() === '캠페인'));
  if (headerIndex < 0 || !campaign || campaign === 'all') return null;
  const headers = rows[headerIndex].map(value => String(value).trim());
  const campaignIndex = headers.indexOf('캠페인');
  const matches = rows.slice(headerIndex + 1).filter(row => String(row[campaignIndex] ?? '').trim() === campaign);
  if (!matches.length) return null;
  const number = value => {
    if (value == null || String(value).trim() === '') return null;
    const parsed = Number(String(value).replace(/,/g, '').trim());
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  };
  const metrics = {};
  for (const [key, label] of Object.entries({ cost: '광고비', impressions: '노출', clicks: '클릭', views: '조회' })) {
    const values = matches.map(row => number(row[headers.indexOf(label)]));
    metrics[key] = values.every(value => value !== null) ? values.reduce((sum, value) => sum + value, 0) : null;
  }
  const ratio = (numerator, denominator, scale = 1) => numerator !== null && denominator > 0 ? numerator / denominator * scale : null;
  metrics.cpm = ratio(metrics.cost, metrics.impressions, 1000);
  metrics.ctr = ratio(metrics.clicks, metrics.impressions, 100);
  metrics.cpv = ratio(metrics.cost, metrics.views);
  return { metrics };
}
