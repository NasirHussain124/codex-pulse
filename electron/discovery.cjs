const { lanAddress } = require('./network.cjs');

function announce({ address, port, fingerprint, onError = () => {}, makeBonjour }) {
  if (!lanAddress(address) || !Number.isInteger(port) || port < 1 || port > 65535 || !/^[a-f0-9]{64}$/.test(fingerprint || '')) throw new Error('Invalid private discovery descriptor.');
  const create = makeBonjour || ((options, error) => new (require('bonjour-service').Bonjour)(options, error));
  // The opaque certificate identity is public, not a pairing secret. Discovery
  // is only a locator; the phone must verify the original pinned TLS leaf.
  const bonjour = create({ interface: address }, onError);
  const service = bonjour.publish({ name: `Quota-${fingerprint.slice(0, 12)}`, host: `quota-${fingerprint.slice(0, 12)}.local`, type: 'quotamgmt', protocol: 'tcp', port,
    disableIPv6: true, txt: { v: '1', pin: fingerprint, address } });
  // bonjour-service 1.4.4 includes every adapter in A records even when its
  // multicast socket is bound to one interface. Filter before its async probe
  // announces: VPN/public/other adapter addresses must not leak on the LAN.
  if (typeof service.records === 'function') {
    const records = service.records.bind(service);
    service.records = () => records().filter(row => row.type !== 'AAAA' && (row.type !== 'A' || row.data === address));
  }
  service.on('error', onError);
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    let destroyed = false;
    const destroy = () => { if (destroyed) return; destroyed = true; clearTimeout(timer); try { bonjour.destroy(); } catch {} };
    const timer = setTimeout(destroy, 1000); timer.unref?.();
    try { service.stop(destroy); } catch { destroy(); }
  };
}
module.exports = { announce };
