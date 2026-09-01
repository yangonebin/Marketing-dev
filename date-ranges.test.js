import test from 'node:test';
import assert from 'node:assert/strict';
import { getComparisonDateRange } from './date-ranges.js';

test('전주 동요일은 기준 기간을 7일 전으로 이동한다', () => {
  assert.deepEqual(getComparisonDateRange('2026-08-24', '2026-08-26', 'previous-weekday'), {
    start: '2026-08-17',
    end: '2026-08-19',
  });
});

test('전월 동요일은 요일을 유지하며 기준 기간을 4주 전으로 이동한다', () => {
  assert.deepEqual(getComparisonDateRange('2026-08-24', '2026-08-26', 'previous-month-weekday'), {
    start: '2026-07-27',
    end: '2026-07-29',
  });
});
