const { randomUUID } = require('node:crypto');
const { configuration, KINDS } = require('./validation.cjs');
const { report, SOURCES } = require('./public.cjs');
const { identity, text, instant, publicError, ProviderError } = require('./common.cjs');
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const INTERVAL = { copilot: 300000, claude: 300000, gemini: 300000, cursor: 3600000 };
const MANUAL = { copilot: 60000, claude: 60000, gemini: 60000, cursor: 3600000 };
const cacheKey = record => identity(`${record.provider}:${record.id}:${record.subjectKey}`);
class ProviderManager {
  constructor({ readVault, writeVault, readReports, writeReports, changed = () => {}, collect, clock = Date.now }) {
    Object.assign(this, { writeVault, writeReports, changed, clock });
    this.collect = collect || ((config, context) => require(`./${config.provider}.cjs`).collect(config, context));
    this.vault = { schema: 1, connections: [] }; this.cache = {}; this.inflight = new Map(); this.locked = null; this.closed = false; this.connecting = false;
    try {
      const saved = readVault();
      const cached = readReports();
      if (cached?.schema === 1 && cached.records && typeof cached.records === 'object' && !Array.isArray(cached.records)) this.cache = cached.records;
      if (saved === null && Object.keys(this.cache).length) throw new Error('orphaned saved reports');
      if (saved !== null) {
        if (saved.schema !== 1 || !Array.isArray(saved.connections) || saved.connections.length > 20) throw new Error('invalid vault');
        const seen = new Set();
        for (const item of saved.connections) {
          if (!UUID.test(item?.id || '') || seen.has(item.id) || !KINDS.includes(item.provider) || item.config?.provider !== item.provider || typeof item.config?.label !== 'string' || typeof item.enabled !== 'boolean' || typeof item.subjectKey !== 'string' || JSON.stringify(item).length > 50000) throw new Error('invalid connection');
          seen.add(item.id);
        }
        this.vault = saved;
      }
    } catch {
      this.locked = 'Saved provider connections could not be unlocked. Their encrypted files are preserved. Restore a backup or repair Windows encryption before adding them again.';
    }
  }
  public(privacy = false) {
    const now = this.clock();
    const records = this.locked ? Object.entries(this.cache).slice(0, 20).map(([id, cached]) => ({ id, provider: cached.provider, config: { label: cached.label }, subjectKey: null, enabled: false, createdAt: cached.createdAt })) : this.vault.connections;
    return { error: this.locked, connections: records.filter(row => UUID.test(row.id) && KINDS.includes(row.provider)).map(row => {
      const cached = this.cache[row.id], verified = this.locked || cached?.key === cacheKey(row);
      const value = verified ? report(cached?.report, row.provider, privacy) : null;
      const at = verified ? instant(cached?.fetchedAt) : null, age = at ? now - Date.parse(at) : Infinity;
      const error = this.locked || (verified ? cached?.error : null) || null;
      return { id: row.id, provider: row.provider, label: text(row.config.label, 48), createdAt: instant(row.createdAt), enabled: row.enabled !== false,
        status: this.locked ? 'stale' : row.enabled === false ? 'paused' : value ? error || age > INTERVAL[row.provider] * 2 || age < -60000 ? 'stale' : 'ready' : error ? 'error' : 'unavailable',
        refreshing: this.inflight.has(row.id), fetchedAt: at, nextUpdateAt: instant(cached?.allowedAt), error: typeof error === 'string' ? text(error, 350) : null,
        report: value, source: SOURCES[row.provider] };
    }) };
  }
  persist(next) { this.writeVault(next); this.vault = next; }
  saveReports() { this.writeReports({ schema: 1, records: this.cache }); }
  assertOpen() { if (this.closed) throw new Error('Provider monitoring is closing.'); if (this.locked) throw new Error(this.locked); }
  async connect(input) {
    this.assertOpen();
    if (this.connecting) throw new Error('A provider connection is already being checked.');
    const config = configuration(input), existing = input.id ? this.vault.connections.find(row => row.id === input.id) : null;
    if (input.id && (!existing || existing.provider !== config.provider)) throw new Error('This connection changed. Reopen its setup.');
    if (!existing && this.vault.connections.length >= 20) throw new Error('This workspace supports up to 20 reporting connections.');
    this.connecting = true;
    const controller = new AbortController(); this.connectController = controller;
    try {
      let result;
      try { result = await this.collect(config, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]), now: this.clock() }); }
      catch (error) { throw error instanceof ProviderError ? error : new ProviderError('service'); }
      this.assertOpen();
      if (controller.signal.aborted) throw new ProviderError('canceled');
      if (!result || typeof result.subjectKey !== 'string' || !report(result, config.provider, false)) throw new ProviderError('schema');
      if (existing && this.vault.connections.find(row => row.id === existing.id) !== existing) throw new Error('This connection was changed or removed while checking it. Try again.');
      if (existing && ['copilot', 'gemini'].includes(config.provider) && existing.subjectKey !== result.subjectKey) throw new Error('That is a different account or project. Add it as a new connection instead.');
      if (this.vault.connections.some(row => row.id !== existing?.id && row.provider === config.provider && row.subjectKey === result.subjectKey)) throw new Error('This account or reporting credential is already connected.');
      const now = this.clock(), record = { id: existing?.id || randomUUID(), provider: config.provider, config, subjectKey: result.subjectKey, enabled: true, createdAt: existing?.createdAt || new Date(now).toISOString() };
      const next = { schema: 1, connections: existing ? this.vault.connections.map(row => row.id === existing.id ? record : row) : [...this.vault.connections, record] };
      this.persist(next);
      this.inflight.get(record.id)?.controller.abort();
      this.cache[record.id] = this.cached(record, result, now);
      this.saveReports(); this.changed(); return { connectionId: record.id, state: this.public() };
    } catch (error) { throw error instanceof ProviderError ? new Error(publicError(error)) : error; }
    finally { this.connecting = false; this.connectController = null; }
  }
  cancelConnect() { this.connectController?.abort(); }
  rename(id, label) {
    this.assertOpen();
    const clean = text(label, 48).trim(), previous = this.vault.connections.find(row => row.id === id);
    if (!previous || !clean) throw new Error('Choose a saved connection and a short name.');
    this.persist({ ...this.vault, connections: this.vault.connections.map(row => row.id === id ? { ...row, config: { ...row.config, label: clean } } : row) });
    if (this.cache[id]) { this.cache[id].label = clean; this.saveReports(); }
    this.changed(); return this.public();
  }
  cached(record, result, now) {
    return { key: cacheKey(record), provider: record.provider, label: record.config.label, createdAt: record.createdAt,
      report: report(result, record.provider, false), fetchedAt: new Date(now).toISOString(), error: null, failures: 0,
      allowedAt: new Date(now + MANUAL[record.provider]).toISOString(), scheduledAt: new Date(now + INTERVAL[record.provider]).toISOString() };
  }
  remove(id) {
    this.assertOpen();
    if (!UUID.test(id || '') || !this.vault.connections.some(row => row.id === id)) throw new Error('Unknown provider connection.');
    this.persist({ ...this.vault, connections: this.vault.connections.filter(row => row.id !== id) });
    this.inflight.get(id)?.controller.abort(); delete this.cache[id]; this.saveReports(); this.changed(); return this.public();
  }
  setEnabled(id, enabled) {
    this.assertOpen();
    if (typeof enabled !== 'boolean' || !this.vault.connections.some(row => row.id === id)) throw new Error('Unknown provider connection.');
    this.persist({ ...this.vault, connections: this.vault.connections.map(row => row.id === id ? { ...row, enabled } : row) });
    if (!enabled) this.inflight.get(id)?.controller.abort();
    this.changed(); return this.public();
  }
  async refresh(id, manual = false) {
    this.assertOpen();
    const record = this.vault.connections.find(row => row.id === id);
    if (!record || !record.enabled) return this.public();
    if (this.inflight.has(id)) return this.inflight.get(id).promise;
    const cached = this.cache[id], next = Date.parse((manual ? cached?.allowedAt : cached?.scheduledAt) || '');
    if (Number.isFinite(next) && next <= this.clock() + 86400000 && this.clock() < next) return this.public();
    const controller = new AbortController();
    const task = Promise.resolve().then(async () => {
      try {
        const result = await this.collect(record.config, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]), now: this.clock() });
        if (this.closed || this.vault.connections.find(row => row.id === id) !== record || controller.signal.aborted) return this.public();
        if (!result || result.subjectKey !== record.subjectKey) throw new ProviderError('auth');
        if (!report(result, record.provider, false)) throw new ProviderError('schema');
        this.cache[id] = this.cached(record, result, this.clock()); this.saveReports();
      } catch (error) {
        if (!this.closed && this.vault.connections.find(row => row.id === id) === record && !controller.signal.aborted) {
          const before = this.cache[id] || {}, failures = Math.min((before.failures || 0) + 1, 8), wait = Math.max(MANUAL[record.provider], Math.min(3600000, 120000 * 2 ** (failures - 1)), (error.retryAfter || 0) * 1000);
          this.cache[id] = { ...before, key: cacheKey(record), provider: record.provider, label: record.config.label, createdAt: record.createdAt,
            error: publicError(error), failures, allowedAt: new Date(this.clock() + wait).toISOString(), scheduledAt: new Date(this.clock() + wait).toISOString() };
          try { this.saveReports(); } catch { /* Saved credentials/last disk report remain authoritative. */ }
        }
      } finally { if (this.inflight.get(id)?.controller === controller) this.inflight.delete(id); this.changed(); }
      return this.public();
    });
    this.inflight.set(id, { controller, promise: task }); this.changed(); return task;
  }
  async tick() {
    if (this.closed || this.locked || this.ticking) return;
    this.ticking = true;
    try {
      const eligible = this.vault.connections.filter(row => row.enabled);
      for (let start = 0; start < eligible.length && !this.closed; start += 2) await Promise.all(eligible.slice(start, start + 2).map(row => this.refresh(row.id).catch(() => {})));
    } finally { this.ticking = false; }
  }
  start() { this.timer = setInterval(() => void this.tick(), 30000); this.timer.unref?.(); return this.tick(); }
  stop() { this.closed = true; clearInterval(this.timer); this.cancelConnect(); for (const pending of this.inflight.values()) pending.controller.abort(); }
}
module.exports = { ProviderManager, INTERVAL, MANUAL, cacheKey };
