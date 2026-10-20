const https = require('node:https');
const os = require('node:os');
const { randomBytes, randomUUID, createHash, timingSafeEqual, X509Certificate } = require('node:crypto');
const digest = value => createHash('sha256').update(value).digest('hex');
const privateAddress = value => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(value);
function addresses() {
  return [...new Set(Object.values(os.networkInterfaces()).flat().filter(item => item && item.family === 'IPv4' && !item.internal && privateAddress(item.address)).map(item => item.address))];
}
function publicSnapshot(state) {
  return { schemaVersion: 1, generatedAt: state.snapshot.generatedAt, servedAt: new Date().toISOString(),
    refreshing: Boolean(state.refreshing), accounts: state.snapshot.accounts.map(account => ({
      id: account.id, label: state.settings.accounts[account.identity]?.label || `Account ${account.id}`,
      selected: Boolean(account.selected), status: account.status, fetchedAt: account.fetchedAt,
      windows: account.status === 'reconnect' ? [] : account.windows.map(window => ({
        id: window.id, label: window.label, durationMinutes: window.durationMinutes,
        remainingPercent: window.remainingPercent, resetsAt: window.resetsAt,
      })),
    })) };
}
class MobileBridge {
  constructor({ readSecret, writeSecret, getState, port = 47831, allowLoopback = false, clock = Date.now }) {
    Object.assign(this, { readSecret, writeSecret, getState, port, allowLoopback, clock });
    this.server = null; this.address = null; this.pairing = null; this.rate = new Map(); this.error = null;
    this.queue = Promise.resolve();
    this.vault = readSecret() || { devices: [] };
    if (!Array.isArray(this.vault.devices)) throw new Error('Mobile pairing data is damaged. Disable pairing and contact support.');
  }
  save() { this.writeSecret(this.vault); }
  status() { return { enabled: Boolean(this.server?.listening), address: this.address,
    port: this.server?.address()?.port || this.port, addresses: addresses(), error: this.error,
    devices: this.vault.devices.map(({ id, name, createdAt, lastSeenAt }) => ({ id, name, createdAt, lastSeenAt })) }; }
  start(address) {
    const task = this.queue.then(() => this.startInternal(address));
    this.queue = task.catch(() => {}); return task;
  }
  async startInternal(address) {
    if (!(addresses().includes(address) || this.allowLoopback && address === '127.0.0.1')) throw new Error('Choose a private Wi-Fi/Ethernet address from this PC.');
    if (this.server?.listening && this.address === address) return this.status();
    await this.stopInternal();
    if (!this.vault.tls) {
      const selfsigned = require('selfsigned');
      const result = await selfsigned.generate([{ name: 'commonName', value: 'Codex Pulse companion' }], {
        keyType: 'ec', curve: 'P-256', algorithm: 'sha256',
        notAfterDate: new Date(this.clock() + 5 * 365 * 86400000),
        // The self-signed installation identity is also its sole trust anchor.
        // Phones pin this exact leaf, never other certificates it could issue.
        extensions: [{ name: 'basicConstraints', cA: true, pathLenConstraint: 0 }, { name: 'keyUsage', digitalSignature: true, keyCertSign: true }, { name: 'extKeyUsage', serverAuth: true }],
      });
      this.vault.tls = { cert: result.cert, key: result.private }; this.save();
    }
    this.fingerprint = new X509Certificate(this.vault.tls.cert).fingerprint256.replaceAll(':', '').toLowerCase();
    const server = https.createServer({ ...this.vault.tls, minVersion: 'TLSv1.2', requestTimeout: 10000, headersTimeout: 10000 }, (req, res) => void this.route(req, res));
    server.maxConnections = 40; server.maxHeadersCount = 30; server.setTimeout(10000);
    this.server = server; this.address = address;
    try {
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(this.port, address, resolve); });
      server.on('error', () => { this.error = 'Phone connection stopped. Disable and enable it again.'; });
      this.error = null; return this.status();
    } catch { this.server = null; this.address = null; throw new Error('Could not open the private phone connection. Choose another interface or check port 47831.'); }
  }
  stop() {
    const task = this.queue.then(() => this.stopInternal());
    this.queue = task.catch(() => {}); return task;
  }
  async stopInternal() {
    this.pairing = null; const server = this.server; this.server = null; this.address = null;
    if (server) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    return this.status();
  }
  pair() {
    if (!this.server?.listening) throw new Error('Enable the local phone connection first.');
    if (this.vault.devices.length >= 10) throw new Error('Remove a paired device before adding another.');
    const code = randomBytes(32).toString('base64url'), expiresAt = this.clock() + 120000;
    this.pairing = { hash: digest(code), expiresAt };
    return { version: 1, endpoint: `https://${this.address}:${this.server.address().port}`, fingerprint: this.fingerprint, code, expiresAt };
  }
  cancelPair() { this.pairing = null; }
  revoke(id) {
    if (typeof id !== 'string') throw new Error('Invalid device.');
    this.vault.devices = this.vault.devices.filter(device => device.id !== id); this.save(); return this.status();
  }
  reply(res, code, body) {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(body));
  }
  async body(req) {
    if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) throw new Error('JSON required.');
    let text = ''; for await (const chunk of req) { text += chunk; if (Buffer.byteLength(text) > 4096) throw new Error('Request too large.'); }
    return JSON.parse(text);
  }
  async route(req, res) {
    try {
      // This is a native-app transport, never a browser/CORS endpoint.
      if (req.headers.origin !== undefined || req.headers.host !== `${this.address}:${this.server?.address()?.port}`) return this.reply(res, 403, { error: 'Forbidden' });
      const ip = req.socket.remoteAddress || '';
      const now = this.clock();
      for (const [key, value] of this.rate) if (value.until <= now) this.rate.delete(key);
      if (!this.rate.has(ip)) { if (this.rate.size > 500) return this.reply(res, 429, { error: 'Try later' }); this.rate.set(ip, { count: 0, until: now + 60000 }); }
      if (++this.rate.get(ip).count > 60) return this.reply(res, 429, { error: 'Try later' });
      if (req.url === '/v1/pair' && req.method === 'POST') {
        const body = await this.body(req);
        if (typeof body.code !== 'string' || body.code.length > 100 || !this.pairing || this.pairing.expiresAt <= now || digest(body.code) !== this.pairing.hash) return this.reply(res, 401, { error: 'Pairing expired or invalid. Generate a new QR code on your PC.' });
        this.pairing = null; // Single use, consumed before any asynchronous work.
        const token = randomBytes(32).toString('base64url'), id = randomUUID();
        this.vault.devices.push({ id, name: typeof body.name === 'string' ? body.name.replace(/[\x00-\x1f]/g, '').slice(0, 48) || 'Android phone' : 'Android phone', hash: digest(token), createdAt: new Date(now).toISOString(), lastSeenAt: null });
        this.save(); return this.reply(res, 200, { id, token });
      }
      if (req.url !== '/v1/snapshot' || req.method !== 'GET') return this.reply(res, 404, { error: 'Read-only endpoint not found' });
      const auth = req.headers.authorization || '';
      if (!/^Bearer [\w-]{43}$/.test(auth)) return this.reply(res, 401, { error: 'Pair this phone again on your PC.' });
      const hash = Buffer.from(digest(auth.slice(7)), 'hex');
      const device = this.vault.devices.find(device => typeof device.hash === 'string' && /^[a-f0-9]{64}$/.test(device.hash) && timingSafeEqual(Buffer.from(device.hash, 'hex'), hash));
      if (!device) return this.reply(res, 401, { error: 'This phone is no longer paired.' });
      if (!device.lastSeenAt || now - Date.parse(device.lastSeenAt) > 300000) { device.lastSeenAt = new Date(now).toISOString(); this.save(); }
      return this.reply(res, 200, publicSnapshot(this.getState()));
    } catch { if (!res.headersSent) this.reply(res, 400, { error: 'Invalid request' }); else res.destroy(); }
  }
}
module.exports = { MobileBridge, publicSnapshot, privateAddress };
