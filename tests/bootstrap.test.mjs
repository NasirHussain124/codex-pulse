import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { loadLocalAccounts } = createRequire(import.meta.url)('../electron/bootstrap.cjs');
const snapshot = count => ({ schemaVersion: 1, accounts: Array.from({ length: count }, (_, i) => ({ id: String(i), identity: `identity-${i}`, windows: [] })) });
test('startup reads durable local accounts without a quota request or cache', async () => {
  const calls = [];
  const result = await loadLocalAccounts({ cached: null, empty: snapshot(0), engine: { request: async (...args) => { calls.push(args); return snapshot(4); } } });
  assert.equal(result.snapshot.accounts.length, 4); assert.equal(result.initialized, true); assert.equal(result.source, 'vault');
  assert.deepEqual(calls, [['snapshot', { refresh: false }]]);
});
test('invalid cache is replaced by the saved roster, not an empty setup', async () => {
  const result = await loadLocalAccounts({ cached: { broken: true }, empty: snapshot(0), engine: { request: async () => snapshot(4) } });
  assert.equal(result.snapshot.accounts.length, 4); assert.equal(result.error, null);
});
test('engine failure preserves last accounts with a visible error', async () => {
  const result = await loadLocalAccounts({ cached: snapshot(4), empty: snapshot(0), engine: { request: async () => { throw new Error('offline'); } } });
  assert.equal(result.snapshot.accounts.length, 4); assert.ok(result.error); assert.equal(result.source, 'cache');
});
test('no readable roster is an error, not permission to re-add lost accounts', async () => {
  const result = await loadLocalAccounts({ cached: null, empty: snapshot(0), engine: { request: async () => { throw new Error('locked'); } } });
  assert.equal(result.initialized, false); assert.match(result.error, /not been deleted/);
});
test('a genuine empty saved roster takes precedence over stale cache', async () => {
  const result = await loadLocalAccounts({ cached: snapshot(4), empty: snapshot(0), engine: { request: async () => snapshot(0) } });
  assert.equal(result.snapshot.accounts.length, 0); assert.equal(result.initialized, true);
});
