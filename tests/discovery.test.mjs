import test from 'node:test';
import assert from 'node:assert/strict';
import discovery from '../electron/discovery.cjs';

test('discovery advertises only a public opaque identity and the private endpoint', () => {
  let options, published, stops = 0, destroys = 0;
  const stop = discovery.announce({ address: '192.168.1.7', port: 47831, fingerprint: 'ab'.repeat(32),
    makeBonjour: args => { options = args; return { publish: payload => { published = payload; return { on: () => {}, stop: done => { stops++; done(); } }; }, destroy: () => { destroys++; } }; } });
  assert.deepEqual(options, { interface: '192.168.1.7' });
  assert.equal(published.type, 'quotamgmt'); assert.equal(published.protocol, 'tcp');
  assert.equal(published.txt.pin, 'ab'.repeat(32)); assert.equal(published.txt.address, '192.168.1.7');
  assert.equal(published.name, 'Quota-abababababab');
  assert.deepEqual(Object.keys(published.txt).sort(), ['address', 'pin', 'v']);
  stop(); stop(); assert.equal(stops, 1); assert.equal(destroys, 1);
});
test('discovery never publishes public/Tailscale addresses or malformed identities', () => {
  for (const address of ['0.0.0.0', '8.8.8.8', '100.90.1.2']) assert.throws(() => discovery.announce({ address, port: 47831, fingerprint: 'ab'.repeat(32) }), /Invalid/);
  for (const port of [0, -1, 65536, 1.5]) assert.throws(() => discovery.announce({ address: '192.168.1.2', port, fingerprint: 'ab'.repeat(32) }), /Invalid/);
  assert.throws(() => discovery.announce({ address: '192.168.1.2', port: 47831, fingerprint: 'bad' }), /Invalid/);
});

test('discovery filters unrelated A records even when the library enumerates all adapters', () => {
  const service = { on: () => {}, stop: done => done(), records: () => [
    { type: 'A', data: '192.168.1.7' }, { type: 'A', data: '8.8.8.8' }, { type: 'A', data: '100.80.0.2' }, { type: 'AAAA', data: '::1' }, { type: 'TXT', data: 'descriptor' },
  ] };
  const stop = discovery.announce({ address: '192.168.1.7', port: 47831, fingerprint: 'ab'.repeat(32), makeBonjour: () => ({ publish: () => service, destroy: () => {} }) });
  assert.deepEqual(service.records(), [{ type: 'A', data: '192.168.1.7' }, { type: 'TXT', data: 'descriptor' }]);
  stop();
});
