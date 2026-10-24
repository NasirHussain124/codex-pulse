import test from 'node:test';
import assert from 'node:assert/strict';
import alerts from '../electron/alerts.cjs';
const now = Date.parse('2026-10-24T12:00:00Z');
const settings = { notifications: true, recommendationAlerts: true, privacy: true, accounts: {} };
const account = patch => ({ id: '1', identity: 'a'.repeat(16), email: 'private@example.test', status: 'ready', fetchedAt: new Date(now).toISOString(), disabled: false,
  windows: [{ durationMinutes: 300, remainingPercent: 0 }, { durationMinutes: 10080, remainingPercent: 50 }], resetCredits: { available: 2, earliestExpiresAt: new Date(now + 18000000).toISOString() }, ...patch });
const get = (row, old, config = settings) => alerts.actionableAlerts({ accounts: [row] }, old ? { accounts: [old] } : null, config, now);
test('expiry alerts use reported count/expiry and preserve privacy, without spending or switching', () => {
  const items = get(account()); assert.equal(items.length, 1);
  assert.match(items[0].key, /6h$/); assert.match(items[0].message, /Account 1/);
  assert.equal(JSON.stringify(items).includes('private@example.test'), false);
  assert.match(items[0].message, /Nothing is redeemed automatically/);
});
test('unknown, expired, stale, excluded or disabled notifications cannot create urgency', () => {
  for (const row of [account({ resetCredits: { available: 2, earliestExpiresAt: null } }), account({ resetCredits: { available: 0, earliestExpiresAt: new Date(now + 3600000).toISOString() } }), account({ resetCredits: { available: 2, earliestExpiresAt: new Date(now - 1).toISOString() } }), account({ fetchedAt: new Date(now - 400000).toISOString() }), account({ disabled: true }), account({ status: 'reconnect' })]) assert.deepEqual(get(row), []);
  assert.deepEqual(get(account(), null, { ...settings, notifications: false }), []);
  assert.deepEqual(get(account(), null, { ...settings, recommendationAlerts: false }), []);
  assert.deepEqual(get(account(), null, { ...settings, accounts: { ['a'.repeat(16)]: { group: 'reserved' } } }), []);
});
test('quota recovery needs a new actual reading and usable room in both windows', () => {
  const before = account({ fetchedAt: new Date(now - 120000).toISOString(), resetCredits: null });
  const after = account({ resetCredits: null, windows: [{ durationMinutes: 300, remainingPercent: 100 }, { durationMinutes: 10080, remainingPercent: 40 }] });
  assert.equal(get(after, before)[0].title, 'Your quota has room again');
  assert.deepEqual(get({ ...after, fetchedAt: before.fetchedAt }, before), []);
  assert.deepEqual(get({ ...after, windows: [{ durationMinutes: 300, remainingPercent: 100 }, { durationMinutes: 10080, remainingPercent: 0 }] }, before), []);
});
