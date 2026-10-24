import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateDrain, project, readingsFor, readingSegments } from '../src/forecast.ts';

test('drain requires spaced observations and never forecasts across a reset', () => {
  assert.equal(estimateDrain([{ at: 0, remaining: 70 }]), null);
  assert.equal(estimateDrain([{ at: 0, remaining: 70 }, { at: 60000, remaining: 69 }]), null);
  assert.equal(estimateDrain([{ at: 0, remaining: 10 }, { at: 3600000, remaining: 100 }]), null);
  assert.equal(estimateDrain([{ at: 0, remaining: 80 }, { at: 1800000, remaining: 70 }]), 20);
  assert.equal(estimateDrain([{ at: 0, remaining: 80 }, { at: 7200000, remaining: 70 }]), null);
});

test('history is sorted and deduplicated before analysis, invalid values remain gaps', () => {
  const account = { identity: 'a' }, row = (time, remaining) => ({ at: new Date(time).toISOString(), accounts: [{ identity: 'a', windows: [{ id: 'weekly', durationMinutes: 10080, remainingPercent: remaining }] }] });
  assert.deepEqual(readingsFor([row(2000, 20), row(1000, 50), row(2000, 30), row(3000, NaN)], account, 'weekly'), [{ at: 1000, remaining: 50 }, { at: 2000, remaining: 30 }]);
  assert.deepEqual(readingSegments([{ at: 0, remaining: 90 }, { at: 1000, remaining: 80 }, { at: 4000000, remaining: 30 }]).map(s => s.length), [2, 1]);
});
test('projections clamp at zero and reset only at the reported boundary', () => {
  const window = { remainingPercent: 5, durationMinutes: 300, resetsAt: new Date(7200000).toISOString() };
  const points = project(window, 10, 0, 10800000);
  assert.ok(points.every(p => p.remaining >= 0 && p.remaining <= 100));
  assert.ok(points.some(p => p.remaining === 0));
  assert.equal(points.find(p => p.remaining === 100).at, 7200001);
  assert.deepEqual(project(window, null, 0, 100), []);
  assert.deepEqual(project(window, 1, 8000000, 10000000), []);
});
