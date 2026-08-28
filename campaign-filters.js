export function parseMediaMixRows(rows = []) {
  const numberValue = value => Number(String(value ?? '').replace(/[,\s%]/g, '')) || 0;
  const headerRowIndex = rows.findIndex(row => row.some(value => String(value ?? '').trim() === '캠페인'));
  if (headerRowIndex < 0) return { filterRows: [], campaigns: [], mediaAdTypes: [] };

  const header = rows[headerRowIndex].map(value => String(value ?? '').trim());
  const columnIndex = label => header.indexOf(label);
  const cell = (row, label) => {
    const index = columnIndex(label);
    return index < 0 ? '' : row[index];
  };
  const businessColumnIndex = columnIndex('사업부');
  const campaignColumnIndex = header.indexOf('캠페인');
  const kpiColumnIndex = columnIndex('KPI');
  const mediaAdTypeColumnIndex = columnIndex('Media - AD Type');
  if ([businessColumnIndex, campaignColumnIndex, kpiColumnIndex, mediaAdTypeColumnIndex].some(index => index < 0)) {
    return { filterRows: [], campaigns: [], mediaAdTypes: [] };
  }
  const filterRows = rows.slice(headerRowIndex + 1).map(row => ({
    business: String(row[businessColumnIndex] ?? '').trim(),
    campaign: String(row[campaignColumnIndex] ?? '').trim(),
    kpi: String(row[kpiColumnIndex] ?? '').trim(),
    mediaAdType: String(row[mediaAdTypeColumnIndex] ?? '').trim(),
    operationStart: String(cell(row, '시작 일') ?? '').trim(),
    operationEnd: String(cell(row, '종료 일') ?? '').trim(),
    target: {
      cost: numberValue(cell(row, 'Budget')),
      impressions: numberValue(cell(row, 'Imps')),
      clicks: numberValue(cell(row, 'Click')),
      views: numberValue(cell(row, 'View')),
      purchases: numberValue(cell(row, '구매')),
      revenue: numberValue(cell(row, '매출액')),
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

export function parseHistoryRows(rows = []) {
  const clean = value => String(value ?? '').trim();
  const headerRowIndex = rows.findIndex(row => {
    const cells = row.map(clean);
    return ['캠페인', 'Media - AD Type', '일자'].every(label => cells.includes(label));
  });
  if (headerRowIndex < 0) return [];

  const header = rows[headerRowIndex].map(clean);
  const columnIndex = label => header.indexOf(label);
  const campaignIndex = columnIndex('캠페인');
  const mediaIndex = columnIndex('Media - AD Type');
  const dateIndex = columnIndex('일자');
  const historyIndex = ['히스토리', '내용', '이력', '비고'].map(columnIndex).find(index => index >= 0)
    ?? header.findIndex(label => label.includes('히스토리'));
  if (historyIndex === undefined || historyIndex < 0) return [];

  const normalizeDate = value => {
    const text = clean(value);
    const parts = text.match(/\d+/g) ?? [];
    if (parts.length < 2 || parts.length > 3) return '';
    const currentYear = new Date().getFullYear();
    const [yearText, monthText, dayText] = parts.length === 3 ? parts : [String(currentYear), ...parts];
    const year = yearText.length === 2 ? 2000 + Number(yearText) : Number(yearText);
    return `${year}-${String(Number(monthText)).padStart(2, '0')}-${String(Number(dayText)).padStart(2, '0')}`;
  };

  return rows.slice(headerRowIndex + 1).map(row => ({
    campaign: clean(row[campaignIndex]),
    mediaAdType: clean(row[mediaIndex]),
    date: normalizeDate(row[dateIndex]),
    history: clean(row[historyIndex]),
  })).filter(row => row.campaign && row.mediaAdType && row.date && row.history);
}

export function parseMediaMixTable(rows = []) {
  const clean = value => String(value ?? '').trim();
  const headerRowIndex = rows.findIndex(row => row.some(value => clean(value) === '캠페인'));
  if (headerRowIndex < 0) return { headers: [], rows: [] };
  const headers = rows[headerRowIndex].map(clean);
  const campaignIndex = headers.indexOf('캠페인');
  if (campaignIndex < 0) return { headers: [], rows: [] };
  return {
    headers,
    rows: rows.slice(headerRowIndex + 1).map(row => ({
      campaign: clean(row[campaignIndex]),
      values: headers.map((_, index) => clean(row[index])),
    })).filter(row => row.campaign),
  };
}

export function selectMediaMixColumns(table, desiredHeaders = []) {
  const indices = desiredHeaders.map(header => table.headers.indexOf(header));
  const available = desiredHeaders.map((header, index) => ({ header, sourceIndex: indices[index] })).filter(item => item.sourceIndex >= 0);
  return {
    headers: available.map(item => item.header),
    rows: table.rows.map(row => ({
      campaign: row.campaign,
      values: available.map(item => row.values[item.sourceIndex] ?? ''),
    })),
  };
}
