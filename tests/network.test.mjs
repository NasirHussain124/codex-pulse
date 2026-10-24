import test from 'node:test';
import assert from 'node:assert/strict';
import network from '../electron/network.cjs';
const address = value => ({ address: value, family: 'IPv4', internal: false });

test('LAN and Tailscale address policies reject malformed/public ranges', () => {
  for (const ip of ['8.8.8.8', '192.168.999.4', '172.32.0.1', '100.64.0.1', '127.0.0.1', '0.0.0.0', '10.example']) assert.equal(network.lanAddress(ip), false);
  for (const ip of ['10.0.0.2', '172.16.0.1', '172.31.255.255', '192.168.1.2']) assert.equal(network.lanAddress(ip), true);
  assert.equal(network.tailscaleAddress('100.64.0.1'), true); assert.equal(network.tailscaleAddress('100.127.255.254'), true);
  assert.equal(network.tailscaleAddress('100.128.0.1'), false);
});
test('only named Tailscale adapters can supply CGNAT remote endpoints', () => {
  const entries = network.networkEntries({ Ethernet: [address('100.90.1.2'), address('192.168.1.2')], Tailscale: [address('100.90.1.3')], Public: [address('8.8.8.8')], 'Tailscale fake': [address('100.999.1.1')] });
  assert.deepEqual(entries.map(e => [e.address, e.kind]), [['192.168.1.2', 'lan'], ['100.90.1.3', 'tailscale']]);
});
test('Windows private-network lookup is read-only and fails closed', async () => {
  let call;
  const result = await network.trustedLanAddresses({ platform: 'win32', run: (...args) => { call = args; args.at(-1)(null, '["192.168.1.2","8.8.8.8"]'); } });
  assert.deepEqual(result, ['192.168.1.2']); assert.equal(call[2].shell, false); assert.equal(call[2].windowsHide, true);
  assert.ok(call[1].join(' ').includes('Private')); assert.ok(!call[1].join(' ').includes('Set-Net'));
  assert.deepEqual(await network.trustedLanAddresses({ platform: 'win32', run: (...args) => args.at(-1)(new Error('denied')) }), []);
});
function fixture(options = {}) {
  let settings = { mobileResume: true, mobileTransport: 'lan', mobileAddress: '192.168.1.2' }, active = false, bound = null;
  let entries = [{ address: '192.168.1.2', kind: 'lan' }], trusted = ['192.168.1.2']; const calls = [];
  const bridge = { status: () => ({ enabled: active, address: bound }), start: async ip => { calls.push(['start', ip]); active = true; bound = ip; }, stop: async () => { calls.push(['stop']); active = false; bound = null; } };
  const manager = new network.MobileRecovery({ getSettings: () => settings, bridge: () => bridge, enumerate: () => entries, trusted: async () => trusted, ...options });
  return { manager, calls, setSettings: patch => { settings = { ...settings, ...patch }; }, network: (next, allowed = []) => { entries = next; trusted = allowed; }, bridge };
}
test('opt-in connection resumes, follows private IP changes and keeps device trust', async () => {
  const f = fixture(); await f.manager.tick(); await f.manager.tick();
  assert.deepEqual(f.calls, [['start', '192.168.1.2']]);
  f.network([{ address: '192.168.1.8', kind: 'lan' }], ['192.168.1.8']); await f.manager.tick();
  assert.deepEqual(f.calls.at(-1), ['start', '192.168.1.8']);
});
test('public Wi-Fi never auto-enables the LAN listener, even with private IPs', async () => {
  const f = fixture(); await f.manager.tick(); f.network([{ address: '10.8.0.2', kind: 'lan' }]); await f.manager.tick();
  assert.deepEqual(f.calls.at(-1), ['stop']); assert.equal(f.bridge.status().enabled, false);
  assert.match(f.manager.message, /Public Wi-Fi/);
});
test('Tailscale resumes independently from LAN network classification', async () => {
  const f = fixture(); f.setSettings({ mobileTransport: 'tailscale', mobileAddress: '100.90.0.2' });
  f.network([{ address: '100.90.0.2', kind: 'tailscale' }]); await f.manager.tick();
  assert.deepEqual(f.calls, [['start', '100.90.0.2']]);
});
test('explicit disable and shutdown cannot be undone by a pending recovery check', async () => {
  let resolve; const wait = new Promise(r => { resolve = r; });
  const f = fixture({ trusted: () => wait }); const running = f.manager.tick();
  f.setSettings({ mobileResume: false }); resolve(['192.168.1.2']); await running;
  assert.deepEqual(f.calls, []);
  const g = fixture(); g.manager.stop(); await g.manager.tick(); assert.deepEqual(g.calls, []);
});
test('failed starts remain recoverable, and concurrent ticks share one attempt', async () => {
  let calls = 0; const f = fixture({ trusted: async () => { calls++; return ['192.168.1.2']; } });
  await Promise.all([f.manager.tick(), f.manager.tick()]); assert.equal(calls, 1);
  const g = fixture(); g.bridge.start = async () => { throw new Error('bind error'); }; g.network([{ address: '192.168.1.9', kind: 'lan' }], ['192.168.1.9']);
  await g.manager.tick(); assert.match(g.manager.message, /retry/);
});

test('a locked pairing vault is a visible recoverable state, never an unhandled rejection', async () => {
  const f = fixture({ bridge: () => { throw new Error('encrypted storage unavailable'); } });
  await f.manager.tick(); assert.match(f.manager.message, /pairing/);
});
