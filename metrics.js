export function calculateMetrics(rows) {
  const total = rows.reduce((sum, row) => ({
    impressions: sum.impressions + row.impressions,
    clicks: sum.clicks + row.clicks,
    cost: sum.cost + row.cost,
    conversions: sum.conversions + row.conversions,
    revenue: sum.revenue + row.revenue,
  }), { impressions: 0, clicks: 0, cost: 0, conversions: 0, revenue: 0 });

  return {
    ...total,
    ctr: total.impressions ? total.clicks / total.impressions * 100 : 0,
    cpc: total.clicks ? total.cost / total.clicks : 0,
    cvr: total.clicks ? total.conversions / total.clicks * 100 : 0,
    cpa: total.conversions ? total.cost / total.conversions : 0,
    roas: total.cost ? total.revenue / total.cost * 100 : 0,
  };
}
