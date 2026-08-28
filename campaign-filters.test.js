import test from 'node:test';
import assert from 'node:assert/strict';
import { getAvailableBusinesses, getAvailableMedia, parseHistoryRows, parseMediaMixRows, parseMediaMixTable, selectMediaMixColumns } from './campaign-filters.js';

test('미디어믹스에서 사업부, 캠페인, Media - AD Type만 정리한다', () => {
  const result = parseMediaMixRows([
    [],
    ['URL 시트 매핑용', '부킹 매체 여부', '사업부', '캠페인', 'KPI', 'Media - AD Type', '비고', '소재', 'Type', '시작 일', '종료 일', 'Budget', '성/연령', 'Targeting', 'CPM', 'CTR', 'VTR', 'CVR', '객단가', 'Imps', 'Click', 'View', 'CPC', 'CPV', '구매', '매출액', 'ROAS'],
    ['', '', 'MKT', 'Stonemaster', '도달', 'YT - VRC(non-skip)', '', '영상', 'VA', '09월 17일', '10월 28일', '28,000,000', '', '', '', '', '', '', '', '7,000,000', '700', '7,000,000', '', '', '2', '14,000'],
    ['', '', 'MKT', 'Stonemaster', '도달', 'YT - VRC(non-skip)'],
    ['', '', 'PERF', '26FW', '전환', 'NV - SA'],
    ['', '', '', 'Stonemaster', '조회', 'YT - VVC'],
  ]);

  assert.deepEqual(result.campaigns, ['Stonemaster', '26FW']);
  assert.deepEqual(result.mediaAdTypes, ['YT - VRC(non-skip)', 'NV - SA']);
  assert.equal(result.filterRows.length, 3);
  assert.equal(result.filterRows[0].kpi, '도달');
  assert.equal(result.filterRows[0].operationStart, '09월 17일');
  assert.equal(result.filterRows[0].operationEnd, '10월 28일');
  assert.deepEqual(result.filterRows[0].target, { cost: 28000000, impressions: 7000000, clicks: 700, views: 7000000, purchases: 2, revenue: 14000 });
});

test('캠페인 열이 이동해도 캠페인 헤더를 기준으로 값을 읽는다', () => {
  const result = parseMediaMixRows([
    ['부킹 매체 여부', '사업부', '비고', '캠페인', 'KPI', 'Media - AD Type'],
    ['Y', 'MKT', '', 'Stonemaster', '도달', 'YT - VRC(non-skip)'],
    ['N', 'PERF', '', '26FW', '전환', 'NV - SA'],
  ]);

  assert.deepEqual(result.campaigns, ['Stonemaster', '26FW']);
  assert.deepEqual(result.mediaAdTypes, ['YT - VRC(non-skip)', 'NV - SA']);
  assert.equal(result.filterRows[0].campaign, 'Stonemaster');
  assert.notEqual(result.filterRows[0].campaign, 'Y');
});

test('캠페인 헤더가 없으면 다른 열을 캠페인으로 추측하지 않는다', () => {
  const result = parseMediaMixRows([
    ['사업부', '부킹 매체 여부', 'Media - AD Type'],
    ['MKT', 'Y', 'YT - VRC(non-skip)'],
  ]);

  assert.deepEqual(result, { filterRows: [], campaigns: [], mediaAdTypes: [] });
});

test('선택된 캠페인과 사업부에 해당하는 매체만 중복 없이 반환한다', () => {
  const rows = [
    { business: 'MKT', campaign: 'Stonemaster', mediaAdType: 'YT - VRC(non-skip)' },
    { business: 'MKT', campaign: 'Stonemaster', mediaAdType: 'YT - VRC(non-skip)' },
    { business: 'MKT', campaign: 'Stonemaster', mediaAdType: 'MT - 도달' },
    { business: 'PERF', campaign: 'Stonemaster', mediaAdType: 'NV - SA' },
    { business: 'MKT', campaign: '26FW', mediaAdType: 'YT - VVC' },
  ];

  assert.deepEqual(getAvailableMedia(rows, 'Stonemaster', 'MKT'), ['YT - VRC(non-skip)', 'MT - 도달']);
  assert.deepEqual(getAvailableMedia(rows, 'Stonemaster', 'PERF'), ['NV - SA']);
  assert.deepEqual(getAvailableBusinesses(rows, '26FW'), ['MKT']);
  assert.deepEqual(getAvailableBusinesses(rows, 'Stonemaster'), ['MKT', 'PERF']);
});

test('히스토리 시트의 열 위치가 바뀌어도 헤더명으로 일자별 이력을 읽는다', () => {
  const rows = [
    ['담당자', 'Media - AD Type', '히스토리', '일자', '캠페인'],
    ['김담당', 'MT - 트래픽', '소재 A 운영 시작', '2026. 8. 12.', 'Stonemaster'],
    ['김담당', 'NV - SA', '', '26/8/13', 'Stonemaster'],
  ];

  assert.deepEqual(parseHistoryRows(rows), [{
    campaign: 'Stonemaster',
    mediaAdType: 'MT - 트래픽',
    date: '2026-08-12',
    history: '소재 A 운영 시작',
  }]);
});

test('필수 히스토리 헤더가 없으면 다른 열을 추측하지 않는다', () => {
  assert.deepEqual(parseHistoryRows([
    ['캠페인', '매체', '일자', '히스토리'],
    ['Stonemaster', 'MT - 트래픽', '2026-08-12', '운영 시작'],
  ]), []);
});

test('미디어믹스 원본 표도 캠페인 헤더 위치를 기준으로 읽는다', () => {
  const result = parseMediaMixTable([
    ['설명'],
    ['사업부', 'Budget', '캠페인', 'Media - AD Type', 'ROAS'],
    ['MKT', '10,000,000', 'Stonemaster', 'MT - 도달', '20%'],
  ]);
  assert.deepEqual(result.headers, ['사업부', 'Budget', '캠페인', 'Media - AD Type', 'ROAS']);
  assert.deepEqual(result.rows, [{ campaign: 'Stonemaster', values: ['MKT', '10,000,000', 'Stonemaster', 'MT - 도달', '20%'] }]);
});

test('미디어믹스 표시 열을 헤더명 기준으로 제외하고 재배치한다', () => {
  const selected = selectMediaMixColumns({
    headers: ['URL 시트 매핑용', '캠페인', 'Budget', '사업부', 'KPI'],
    rows: [{ campaign: 'Stonemaster', values: ['internal', 'Stonemaster', '10,000', 'MKT', '도달'] }],
  }, ['사업부', 'KPI', 'Budget']);
  assert.deepEqual(selected, {
    headers: ['사업부', 'KPI', 'Budget'],
    rows: [{ campaign: 'Stonemaster', values: ['MKT', '도달', '10,000'] }],
  });
});
