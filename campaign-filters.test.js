import test from 'node:test';
import assert from 'node:assert/strict';
import { getAvailableBusinesses, getAvailableMedia, parseMediaMixRows } from './campaign-filters.js';

test('미디어믹스에서 사업부, 캠페인, Media - AD Type만 정리한다', () => {
  const result = parseMediaMixRows([
    ['사업부', '캠페인', 'KPI', 'Media - AD Type'],
    ['MKT', 'Stonemaster', '도달', 'YT - VRC(non-skip)', '', '', '', '09월 17일', '10월 28일', '28,000,000', '', '', '', '', '', '', '', '7,000,000', '700', '7,000,000', '', '', '2', '14,000'],
    ['MKT', 'Stonemaster', '도달', 'YT - VRC(non-skip)'],
    ['PERF', '26FW', '전환', 'NV - SA'],
    ['', 'Stonemaster', '조회', 'YT - VVC'],
  ]);

  assert.deepEqual(result.campaigns, ['Stonemaster', '26FW']);
  assert.deepEqual(result.mediaAdTypes, ['YT - VRC(non-skip)', 'NV - SA']);
  assert.equal(result.filterRows.length, 3);
  assert.equal(result.filterRows[0].kpi, '도달');
  assert.equal(result.filterRows[0].operationStart, '09월 17일');
  assert.equal(result.filterRows[0].operationEnd, '10월 28일');
  assert.deepEqual(result.filterRows[0].target, { cost: 28000000, impressions: 7000000, clicks: 700, views: 7000000, purchases: 2, revenue: 14000 });
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
