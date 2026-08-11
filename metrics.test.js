import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateMetrics } from './metrics.js';

test('통합 지표를 합계 기준으로 계산한다', () => {
  const result = calculateMetrics([
    { impressions: 1000, clicks: 100, cost: 50000, conversions: 10, revenue: 150000 },
    { impressions: 500, clicks: 50, cost: 30000, conversions: 5, revenue: 60000 },
  ]);

  assert.equal(result.ctr, 10);
  assert.equal(result.cpc, 80000 / 150);
  assert.equal(result.cvr, 10);
  assert.equal(result.cpa, 80000 / 15);
  assert.equal(result.roas, 210000 / 80000 * 100);
});

test('분모가 0이면 계산 지표는 0이다', () => {
  const result = calculateMetrics([{ impressions: 0, clicks: 0, cost: 0, conversions: 0, revenue: 0 }]);
  assert.equal(result.ctr, 0);
  assert.equal(result.cpc, 0);
  assert.equal(result.cvr, 0);
  assert.equal(result.cpa, 0);
  assert.equal(result.roas, 0);
});
