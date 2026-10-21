import test from 'node:test';
import assert from 'node:assert/strict';
import { ledgerQuota } from '../src/ledgerModel.ts';
const now = Date.now();
const account = { status: 'ready', fetchedAt: new Date(now).toISOString(), windows: [
  { durationMinutes: 300, remainingPercent: 44, resetsAt: new Date(now + 7200000).toISOString() },
  { durationMinutes: 10080, remainingPercent: 69, resetsAt: new Date(now + 5 * 86400000).toISOString() },
] };
test('ledger keeps 5h and 7-day readings separate with concise reset captions', () => {
  assert.equal(ledgerQuota(account, 300, now).percent, 44);
  assert.equal(ledgerQuota(account, 10080, now).percent, 69);
  assert.equal(ledgerQuota(account, 300, now).caption, 'Resets in 2h 0m');
  assert.equal(ledgerQuota(account, 10080, now).caption, 'Resets in 5d 0h');
});
test('ledger does not substitute missing, invalid or reconnected quota', () => {
  assert.equal(ledgerQuota({ ...account, windows: account.windows.slice(1) }, 300, now).percent, null);
  for (const remainingPercent of [-1, 101, NaN, Infinity]) assert.equal(ledgerQuota({ ...account, windows: [{ ...account.windows[0], remainingPercent }] }, 300, now).percent, null);
  assert.equal(ledgerQuota({ ...account, status: 'reconnect' }, 300, now).caption, 'Reconnect to see usage');
  assert.equal(ledgerQuota({ ...account, status: 'reconnect' }, 10080, now).percent, null);
});
test('ledger preserves real zero and clearly marks stale and due-reset readings', () => {
  const result = ledgerQuota({ ...account, fetchedAt: null, windows: [{ ...account.windows[0], remainingPercent: 0, resetsAt: new Date(now - 1).toISOString() }] }, 300, now);
  assert.equal(result.percent, 0); assert.equal(result.caption, 'Saved · Reset due · awaiting refresh');
  assert.equal(ledgerQuota({ ...account, windows: [{ ...account.windows[0], resetsAt: 'invalid' }] }, 300, now).caption, 'Reset not reported');
});
