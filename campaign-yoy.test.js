import test from 'node:test';
import assert from 'node:assert/strict';
import { getCampaignYoy } from './campaign-yoy.js';

test('YoY는 위치와 관계없이 캠페인 헤더로 정확히 매칭한다', () => {
  const rows = [['안내'], [], ['비교 캠페인', '클릭', '캠페인', '광고비', '조회', '노출'],
    ['과거', '100', 'Hima', '2,000', '500', '10,000'],
    ['Hima', '999', 'Other', '999', '999', '999']];
  assert.deepEqual(getCampaignYoy(rows, 'Hima').metrics, {
    cost: 2000, impressions: 10000, clicks: 100, views: 500, cpm: 200, ctr: 1, cpv: 4,
  });
  assert.equal(getCampaignYoy(rows, 'all'), null);
  assert.equal(getCampaignYoy(rows, 'hima'), null);
});

test('YoY 빈칸과 0인 분모는 비교 기준으로 계산하지 않는다', () => {
  const rows = [['캠페인', '광고비', '노출', '클릭', '조회'], ['WinterKids'], ['Hima', '100', '0', '0', '0']];
  assert.equal(getCampaignYoy(rows, 'WinterKids').metrics.cost, null);
  assert.equal(getCampaignYoy(rows, 'Hima').metrics.cpm, null);
  assert.equal(getCampaignYoy([['비교 캠페인'], ['Hima']], 'Hima'), null);
});

test('중복 캠페인의 비율 지표는 합계 기준으로 계산한다', () => {
  const rows = [['캠페인', '광고비', '노출', '클릭', '조회'], ['Hima', 100, 1000, 10, 100], ['Hima', 900, 3000, 90, 200]];
  assert.equal(getCampaignYoy(rows, 'Hima').metrics.cpm, 250);
  assert.equal(getCampaignYoy(rows, 'Hima').metrics.ctr, 2.5);
});
