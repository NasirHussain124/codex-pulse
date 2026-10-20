import test from 'node:test';
import assert from 'node:assert/strict';
import { connectState } from '../src/stateSync.ts';

const makeState = (revision, count) => ({ revision, snapshot: { accounts: Array.from({ length: count }, (_, i) => ({ id: String(i) })) } });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture() {
  const requests = [], values = []; let listener, failures = 0, unsubscribed = false;
  const connection = connectState({ getState: () => { const request = deferred(); requests.push(request); return request.promise; },
    onState: callback => { listener = callback; return () => { unsubscribed = true; }; } },
  state => values.push(state), () => { failures++; });
  return { connection, requests, values, push: state => listener(state), failures: () => failures, unsubscribed: () => unsubscribed };
}
test('late empty startup reply cannot erase a newer pushed roster', async () => {
  const f = fixture(); f.push(makeState(2, 4)); f.requests[0].resolve(makeState(0, 0)); await tick();
  assert.deepEqual(f.values.map(state => state.snapshot.accounts.length), [4]); f.connection.dispose();
});
test('late startup failure never blanks accounts already received', async () => {
  const f = fixture(); f.push(makeState(2, 4)); f.requests[0].reject(new Error('IPC interrupted')); await tick();
  assert.equal(f.failures(), 0); assert.equal(f.values.at(-1).snapshot.accounts.length, 4); f.connection.dispose();
});
test('reopened window can pull current accounts without waiting for a quota poll', async () => {
  const f = fixture(); f.requests[0].resolve(makeState(1, 0)); await tick();
  const reopened = f.connection.sync(); f.requests[1].resolve(makeState(3, 4)); await reopened;
  assert.equal(f.values.at(-1).snapshot.accounts.length, 4); f.connection.dispose();
});
test('a confirmed removal is allowed to clear the roster', async () => {
  const f = fixture(); f.push(makeState(2, 4)); f.push(makeState(3, 0));
  assert.equal(f.values.at(-1).snapshot.accounts.length, 0); f.connection.dispose();
});
test('disposed connection ignores late replies and removes its listener', async () => {
  const f = fixture(); f.connection.dispose(); f.requests[0].resolve(makeState(1, 4)); await tick();
  assert.equal(f.values.length, 0); assert.equal(f.unsubscribed(), true);
});
