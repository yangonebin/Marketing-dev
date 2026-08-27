export function parseMediaMixRows(rows = []) {
  const numberValue = value => Number(String(value ?? '').replace(/[,\s%]/g, '')) || 0;
  const filterRows = rows.map(row => ({
    business: String(row[0] ?? '').trim(),
    campaign: String(row[1] ?? '').trim(),
    kpi: String(row[2] ?? '').trim(),
    mediaAdType: String(row[3] ?? '').trim(),
    operationStart: String(row[7] ?? '').trim(),
    operationEnd: String(row[8] ?? '').trim(),
    target: {
      cost: numberValue(row[9]),
      impressions: numberValue(row[17]),
      clicks: numberValue(row[18]),
      views: numberValue(row[19]),
      purchases: numberValue(row[22]),
      revenue: numberValue(row[23]),
    },
  })).filter(row => row.business && row.business !== '사업부'
    && row.campaign && row.campaign !== '캠페인'
    && row.mediaAdType && row.mediaAdType !== 'Media - AD Type');

  return {
    filterRows,
    campaigns: [...new Set(filterRows.map(row => row.campaign))],
    mediaAdTypes: [...new Set(filterRows.map(row => row.mediaAdType))],
  };
}

export function getAvailableMedia(filterRows, campaign = 'all', business = 'all') {
  return [...new Set(filterRows
    .filter(row => (campaign === 'all' || row.campaign === campaign)
      && (business === 'all' || row.business === business))
    .map(row => row.mediaAdType))];
}

export function getAvailableBusinesses(filterRows, campaign = 'all') {
  return [...new Set(filterRows
    .filter(row => campaign === 'all' || row.campaign === campaign)
    .map(row => row.business))];
}
