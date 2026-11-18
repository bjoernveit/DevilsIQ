import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeAnalyticsParams } from './analyticsUtils';

test('sanitizeAnalyticsParams cleans keys, drops null/undefined, encodes booleans, and truncates strings', () => {
  const result = sanitizeAnalyticsParams({
    passed: true,
    timed_out: false,
    emptyVal: undefined,
    nullVal: null,
    total_time: 12.3456,
    'bad-key!': 'ok',
    longText: 'x'.repeat(150)
  });

  assert.equal(result.passed, 1);
  assert.equal(result.timed_out, 0);
  assert.equal('emptyVal' in result, false);
  assert.equal('nullVal' in result, false);
  assert.equal(result.total_time, 12.35);
  assert.equal(result.bad_key_, 'ok');
  assert.equal(String(result.longText).length, 100);
});
