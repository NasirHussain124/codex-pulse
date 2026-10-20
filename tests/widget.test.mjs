import test from 'node:test';
import assert from 'node:assert/strict';
import { widgetReading } from '../src/widgetModel.ts';

const now = Date.now();
const account = { id: '1', identity: 'one', email: 'person@example.test', status: 'ready', fetchedAt: new Date(now).toISOString(), windows: [{ durationMinutes: 10080, remainingPercent: 76, resetsAt: new Date(now + 3600000).toISOString() }] };
const settings = { widgetWindow: 'weekly', privacy: true, accounts: {} };
test('widget uses exactly the selected quota and preserves genuine zero', () => {
  assert.equal(widgetReading(account, settings, now).percent, 76);
  assert.equal(widgetReading(account, { ...settings, widgetWindow: 'five_hour' }, now).percent, null);
  assert.equal(widgetReading({ ...account, windows: [{ ...account.windows[0], remainingPercent: 0 }] }, settings, now).percent, 0);
});
test('unknown, invalid and expired credentials never become fake quota values', () => {
  for (const remainingPercent of [-1, 101, NaN, Infinity]) assert.equal(widgetReading({ ...account, windows: [{ ...account.windows[0], remainingPercent }] }, settings, now).percent, null);
  const expired = widgetReading({ ...account, status: 'reconnect' }, settings, now);
  assert.equal(expired.percent, null); assert.equal(expired.detail, 'Reconnect on your PC');
});
test('saved readings and passed reset times are explicit', () => {
  const result = widgetReading({ ...account, fetchedAt: 'invalid', windows: [{ ...account.windows[0], resetsAt: new Date(now - 1000).toISOString() }] }, settings, now);
  assert.equal(result.stale, true); assert.equal(result.detail, 'Saved · Reset due · awaiting refresh');
});
test('widget respects email privacy and custom account labels', () => {
  assert.equal(widgetReading(account, settings, now).name, 'person');
  assert.equal(widgetReading(account, { ...settings, privacy: false }, now).name, account.email);
  assert.equal(widgetReading(account, { ...settings, accounts: { one: { label: 'Personal' } } }, now).name, 'Personal');
});
