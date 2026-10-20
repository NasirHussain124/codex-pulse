const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const { safeStorage } = require('electron');
const { MobileBridge } = require('./mobile.cjs');
async function testMobile(root, state) {
  const file = path.join(root, 'test-mobile-encrypted.json');
  const readSecret = () => fs.existsSync(file) ? JSON.parse(safeStorage.decryptString(Buffer.from(JSON.parse(fs.readFileSync(file, 'utf8')), 'base64'))) : null;
  const writeSecret = value => fs.writeFileSync(file, JSON.stringify(safeStorage.encryptString(JSON.stringify(value)).toString('base64')));
  const bridge = new MobileBridge({ readSecret, writeSecret, getState: state, port: 0, allowLoopback: true });
  const request = (route, body, token) => new Promise((resolve, reject) => {
    const req = https.request({ host: '127.0.0.1', port: bridge.status().port, path: route, method: body ? 'POST' : 'GET',
      ca: bridge.vault.tls.cert, checkServerIdentity: (_host, cert) => cert.fingerprint256.replaceAll(':', '').toLowerCase() === bridge.fingerprint ? undefined : new Error('TLS pin mismatch'),
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}) } }, res => {
      let data = ''; res.on('data', bytes => data += bytes); res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(data) }));
    }); req.on('error', reject); req.end(body ? JSON.stringify(body) : undefined);
  });
  try {
    await bridge.start('127.0.0.1');
    const pairing = bridge.pair();
    const text = 'codexpulse://pair?data=' + Buffer.from(JSON.stringify(pairing)).toString('base64url');
    const qr = await require('qrcode').toDataURL(text);
    const paired = await request('/v1/pair', { code: pairing.code, name: 'Synthetic lifecycle phone' });
    if (paired.status !== 200 || !qr.startsWith('data:image/png;base64,')) throw new Error('Packaged QR pairing failed.');
    const snapshot = await request('/v1/snapshot', null, paired.data.token);
    if (snapshot.status !== 200 || snapshot.data.accounts.length !== 4 || snapshot.data.accounts.some(row => 'identity' in row || 'email' in row)) throw new Error('Packaged mobile projection failed.');
    const disk = fs.readFileSync(file, 'utf8');
    if (disk.includes('PRIVATE KEY') || disk.includes(paired.data.token) || readSecret().devices.length !== 1) throw new Error('Mobile encryption check failed.');
    bridge.revoke(paired.data.id);
    if ((await request('/v1/snapshot', null, paired.data.token)).status !== 401) throw new Error('Revocation failed.');
    return true;
  } finally { await bridge.stop(); }
}
module.exports = { testMobile };
