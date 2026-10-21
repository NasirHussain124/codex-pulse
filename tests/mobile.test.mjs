import test from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
const require = createRequire(import.meta.url);
const { MobileBridge, publicSnapshot, privateAddress } = require('../electron/mobile.cjs');
const sample = { settings: { accounts: {} }, snapshot: { generatedAt: new Date().toISOString(), accounts: [
  { id: '1', identity: 'secret-identity', email: 'secret@example.test', status: 'ready', selected: true, access_token: 'NEVER-SHARE', windows: [{ id: 'weekly', label: '7-day', durationMinutes: 10080, remainingPercent: 75, resetsAt: null, secret: 'NEVER-SHARE' }], fetchedAt: null },
] } };
function request(bridge, path, { method = 'GET', body, token, headers = {}, pin = bridge.fingerprint } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request({ host: '127.0.0.1', port: bridge.status().port, path, method,
      ca: bridge.vault.tls.cert, checkServerIdentity: (_host, cert) => cert.fingerprint256.replaceAll(':', '').toLowerCase() === pin ? undefined : new Error('Certificate pin mismatch'),
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers } }, res => {
        let data = ''; res.on('data', chunk => data += chunk); res.on('end', () => resolve({ code: res.statusCode, headers: res.headers, body: JSON.parse(data) }));
      });
    req.on('error', reject); req.end(body ? JSON.stringify(body) : undefined);
  });
}
async function withBridge(t, options = {}) {
  let encryptedStore = null;
  const bridge = new MobileBridge({ readSecret: () => encryptedStore, writeSecret: value => { encryptedStore = structuredClone(value); }, getState: () => sample, port: 0, allowLoopback: true, ...options });
  await bridge.start('127.0.0.1'); t.after(() => bridge.stop()); return bridge;
}
test('mobile snapshot is an explicit metadata allowlist, never a credential transport', () => {
  const data = publicSnapshot(sample), serialized = JSON.stringify(data);
  assert.equal(data.accounts[0].label, 'secret'); assert.equal(data.accounts[0].windows[0].remainingPercent, 75);
  for (const secret of ['secret-identity', 'secret@example.test', 'NEVER-SHARE', 'access_token']) assert.equal(serialized.includes(secret), false);
});
test('untrusted/public bind addresses are rejected', async () => {
  const bridge = new MobileBridge({ readSecret: () => null, writeSecret: () => {}, getState: () => sample });
  for (const ip of ['0.0.0.0', '8.8.8.8', '127.0.0.1', 'example.test']) await assert.rejects(bridge.start(ip), /private/);
  assert.equal(privateAddress('172.16.2.2'), true); assert.equal(privateAddress('172.32.2.2'), false);
});

test('phone gets real account names, custom labels and privacy-controlled emails', () => {
  const settings = { accounts: {}, privacy: false };
  const account = publicSnapshot({ ...sample, settings }).accounts[0];
  assert.equal(account.label, 'secret'); assert.equal(account.email, 'secret@example.test');
  const named = publicSnapshot({ ...sample, settings: { ...settings, accounts: { 'secret-identity': { label: 'Personal' } } } }).accounts[0];
  assert.equal(named.label, 'Personal'); assert.equal(named.email, 'secret@example.test');
  const privateAccount = publicSnapshot({ ...sample, settings: { ...settings, privacy: true } }).accounts[0];
  assert.equal('email' in privateAccount, false);
  assert.equal(JSON.stringify(account).includes('NEVER-SHARE'), false);
});
test('TLS pin mismatch fails closed', async t => {
  const bridge = await withBridge(t); await assert.rejects(request(bridge, '/v1/snapshot', { pin: '00'.repeat(32) }), /pin mismatch/);
});
test('QR pairing is single-use, tokens are hashed, and usage is read-only', async t => {
  const bridge = await withBridge(t), qr = bridge.pair();
  assert.equal(qr.fingerprint.length, 64); assert.equal(qr.code.length, 43);
  assert.equal((await request(bridge, '/v1/snapshot')).code, 401);
  assert.equal((await request(bridge, '/v1/pair', { method: 'POST', body: { code: 'wrong' } })).code, 401);
  const paired = await request(bridge, '/v1/pair', { method: 'POST', body: { code: qr.code, name: 'Test phone' } });
  assert.equal(paired.code, 200); const token = paired.body.token;
  assert.equal(bridge.vault.devices[0].hash, createHash('sha256').update(token).digest('hex'));
  assert.equal(JSON.stringify(bridge.status()).includes(token), false); assert.equal(JSON.stringify(bridge.vault.devices).includes(token), false);
  assert.equal((await request(bridge, '/v1/pair', { method: 'POST', body: { code: qr.code } })).code, 401);
  const usage = await request(bridge, '/v1/snapshot', { token }); assert.equal(usage.code, 200); assert.equal(usage.body.accounts.length, 1); assert.equal(usage.headers['cache-control'], 'no-store');
  assert.equal((await request(bridge, '/v1/switch', { method: 'POST', token, body: { id: '1' } })).code, 404);
  assert.equal((await request(bridge, '/v1/snapshot', { method: 'POST', token })).code, 404);
});
test('expired, replaced and canceled pairing codes cannot connect', async t => {
  let now = Date.now(); const bridge = await withBridge(t, { clock: () => now });
  const first = bridge.pair(); now += 120001;
  const pair = code => request(bridge, '/v1/pair', { method: 'POST', body: { code } });
  assert.equal((await pair(first.code)).code, 401);
  const second = bridge.pair(); bridge.pair(); assert.equal((await pair(second.code)).code, 401);
  const third = bridge.pair(); bridge.cancelPair(); assert.equal((await pair(third.code)).code, 401);
});
test('revocation immediately removes read access and survives persistence', async t => {
  const bridge = await withBridge(t), qr = bridge.pair();
  const paired = await request(bridge, '/v1/pair', { method: 'POST', body: { code: qr.code } });
  assert.equal((await request(bridge, '/v1/snapshot', { token: paired.body.token })).code, 200);
  bridge.revoke(paired.body.id);
  assert.equal((await request(bridge, '/v1/snapshot', { token: paired.body.token })).code, 401);
  assert.equal(bridge.status().devices.length, 0);
});
test('browser origins and DNS rebinding hosts are rejected', async t => {
  const bridge = await withBridge(t);
  for (const headers of [{ Origin: 'https://evil.test' }, { Origin: 'null' }, { Host: 'evil.test' }]) assert.equal((await request(bridge, '/v1/snapshot', { headers })).code, 403);
});
test('request bursts are rate-limited', async t => {
  const bridge = await withBridge(t); let response;
  for (let i = 0; i < 61; i++) response = await request(bridge, '/v1/snapshot');
  assert.equal(response.code, 429);
});
test('stopping pairing closes the listener and invalidates outstanding QR codes', async t => {
  const bridge = await withBridge(t); bridge.pair(); await bridge.stop();
  assert.equal(bridge.status().enabled, false); assert.equal(bridge.pairing, null); assert.throws(() => bridge.pair(), /Enable/);
});
test('concurrent enable/disable requests cannot orphan a listener', async t => {
  const bridge = await withBridge(t);
  await Promise.all([bridge.start('127.0.0.1'), bridge.start('127.0.0.1'), bridge.stop()]);
  assert.equal(bridge.status().enabled, false); assert.equal(bridge.server, null);
});
