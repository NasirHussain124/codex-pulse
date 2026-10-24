import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { generateKeyPairSync } from 'node:crypto';
import common from '../electron/providers/common.cjs';
import copilot from '../electron/providers/copilot.cjs';
import claude from '../electron/providers/claude.cjs';
import cursor from '../electron/providers/cursor.cjs';
import gemini from '../electron/providers/gemini.cjs';
import validation from '../electron/providers/validation.cjs';
import projection from '../electron/providers/public.cjs';
import manager from '../electron/providers/manager.cjs';

const now = Date.parse('2026-10-24T12:00:00Z'), iso = value => new Date(value).toISOString();
const secret = `gho_${'synthetic'.repeat(4)}`, input = (provider = 'copilot') => ({ provider, label: 'Test workspace', secret: provider === 'copilot' ? secret : provider === 'claude' ? `sk-ant-admin01-${'synthetic'.repeat(4)}` : `key_${'synthetic'.repeat(4)}` });
const response = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers });
const nativeReport = (subjectKey = 'github:123') => ({ subjectKey, scope: 'account', subject: 'synthetic-user', complete: true, quotas: [], metrics: [], members: [], notes: [] });
function fixture(options = {}) {
  let vault = null, reports = null, clock = now, updates = 0, calls = 0;
  let collector = async () => nativeReport();
  const instance = new manager.ProviderManager({ readVault: () => vault, readReports: () => reports,
    writeVault: value => { vault = structuredClone(value); }, writeReports: value => { reports = structuredClone(value); },
    clock: () => clock, changed: () => updates++, collect: async (...args) => { calls++; return collector(...args); }, ...options });
  return { instance, get vault() { return vault; }, get reports() { return reports; }, get calls() { return calls; }, get updates() { return updates; },
    advance: ms => { clock += ms; }, collect: value => { collector = value; } };
}

test('fixed HTTPS destinations, redirects and malformed/oversized JSON fail closed', async () => {
  let requested = 0;
  for (const url of ['http://api.github.com/user', 'https://api.github.com.evil.test/user', 'https://secret@api.github.com/user', 'https://api.github.com:8443/user', 'https://localhost/user']) {
    await assert.rejects(common.json(url, {}, async () => { requested++; }), { code: 'destination' });
  }
  assert.equal(requested, 0);
  assert.deepEqual(await common.json('https://api.github.com/user', {}, async (_url, opts) => { assert.equal(opts.redirect, 'error'); return response({ id: 1 }); }), { id: 1 });
  await assert.rejects(common.json('https://api.github.com/user', {}, async () => response([])), { code: 'schema' });
  await assert.rejects(common.json('https://api.github.com/user', {}, async () => response({}, 200, { 'content-length': '2097153' })), { code: 'size' });
  await assert.rejects(common.json('https://api.github.com/user', {}, async () => response({ data: 'x'.repeat(2097153) })), { code: 'size' });
});
test('upstream bodies and thrown credential text never become public errors', async () => {
  for (const [status, code] of [[401, 'auth'], [403, 'permission'], [429, 'rate'], [500, 'service']]) {
    await assert.rejects(common.json('https://api.github.com/user', {}, async () => response({ error: secret }, status, { 'retry-after': '999999' })), error => {
      assert.equal(error.code, code); assert.equal(error.retryAfter, 86400); assert.ok(!common.publicError(error).includes(secret)); return true;
    });
  }
  assert.ok(!common.publicError(new Error(secret)).includes(secret));
});
test('decimal cent costs are summed precisely and rounded once; unknown counts stay unknown', () => {
  assert.equal(common.usdFromCents(['0.25', '0.25']), '0.01');
  assert.equal(common.usdFromCents(['2450.125487', '1875.500123']), '43.26');
  for (const values of [[], [null], [-1], ['NaN'], ['1e7']]) assert.equal(common.usdFromCents(values), null);
  assert.equal(common.sumCounts([]), null); assert.equal(common.sumCounts([0, 3]), 3); assert.equal(common.sumCounts([1, null]), null);
});
test('connection validation rejects personal Claude tokens, classic GitHub PATs and arbitrary credential types', () => {
  assert.equal(validation.configuration(input()).secret, secret);
  assert.throws(() => validation.configuration({ ...input(), secret: 'ghp_' + 'a'.repeat(40) }), /Classic/);
  assert.throws(() => validation.configuration({ ...input('claude'), secret: 'sk-ant-oat01-' + 'a'.repeat(40) }), /Admin API/);
  assert.throws(() => validation.configuration({ ...input('gemini'), secret: JSON.stringify({ type: 'external_account', credential_source: { executable: { command: 'unsafe' } } }) }), /service account/);
  assert.throws(() => validation.configuration({ ...input(), provider: '../../unsafe' }), /supported/);
  assert.throws(() => validation.configuration({ ...input(), label: ' ' }), /short name/);
});
test('Google credentials are RSA-validated and reconstructed from a safe field allowlist', () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  const config = validation.configuration({ provider: 'gemini', label: 'My project', secret: JSON.stringify({ type: 'service_account', project_id: 'synthetic-project', client_email: 'reader@synthetic-project.iam.gserviceaccount.com', private_key: privateKey, token_uri: 'https://evil.test', impersonation_url: 'unsafe', private_key_id: 'test-id' }) });
  assert.equal(config.projectId, 'synthetic-project'); assert.equal(config.serviceAccount.private_key, privateKey);
  assert.deepEqual(Object.keys(config.serviceAccount).sort(), ['client_email', 'private_key', 'private_key_id']);
  assert.equal(JSON.stringify(config).includes('evil.test'), false);
});
test('Copilot preserves native quota, zero, unknown and unlimited without inventing 5h/7d', () => {
  assert.equal(copilot.unpackedPath('C:\\app\\resources\\app.asar\\node_modules\\runtime.exe'), 'C:\\app\\resources\\app.asar.unpacked\\node_modules\\runtime.exe');
  const rows = copilot.normalize({ quotaSnapshots: { premium_interactions: { entitlementRequests: 300, usedRequests: 300, remainingPercentage: 0, resetDate: '2026-11-01T00:00:00Z', overage: 4, overageAllowedWithExhaustedQuota: true }, completions: { entitlementRequests: -1, remainingPercentage: 100 }, chat: { remainingPercentage: 101, resetDate: 'unknown' } } });
  assert.equal(rows[0].remainingPercent, 0); assert.equal(rows[0].overage, 4); assert.equal(rows[0].overageAllowed, true);
  assert.equal(rows[1].unlimited, true); assert.equal(rows[1].remainingPercent, null); assert.equal(rows[1].limit, null);
  assert.equal(rows[2].remainingPercent, null); assert.equal(rows[2].resetsAt, null); assert.equal(rows[2].used, null);
  assert.ok(rows.every(row => row.period === 'Provider entitlement')); assert.throws(() => copilot.normalize({}), { code: 'schema' });
});
test('Copilot only starts an isolated quota RPC and user identity lookup, then stops and cleans its own profile', async () => {
  const calls = []; let profile;
  class Client {
    constructor(opts) { calls.push('construct'); profile = opts.baseDirectory; assert.ok(fs.existsSync(profile)); assert.equal(opts.mode, 'empty'); assert.equal(opts.useLoggedInUser, false); assert.equal(opts.gitHubToken, secret); assert.equal(opts.logLevel, 'none'); this.rpc = { account: { getQuota: async value => { calls.push('quota'); assert.equal(value.gitHubToken, secret); return { quotaSnapshots: {} }; } } }; }
    async start() { calls.push('start'); } async stop() { calls.push('stop'); } async forceStop() { calls.push('force'); }
  }
  const result = await copilot.collect({ secret }, { sdk: () => ({ CopilotClient: Client, RuntimeConnection: { forStdio: () => ({}) } }), fetcher: async (url, opts) => { assert.equal(url, 'https://api.github.com/user'); assert.equal(opts.headers.Authorization, `Bearer ${secret}`); return response({ id: 123, login: 'synthetic' }); } });
  assert.equal(result.subjectKey, 'github:123'); assert.deepEqual(calls, ['construct', 'start', 'quota', 'stop']); assert.equal(fs.existsSync(profile), false);
  const old = process.env.GITHUB_TOKEN, node = process.env.NODE_OPTIONS;
  process.env.GITHUB_TOKEN = 'ambient'; process.env.NODE_OPTIONS = '--require=unsafe';
  try { const env = copilot.runtimeEnvironment('isolated'); assert.equal(env.GITHUB_TOKEN, undefined); assert.equal(env.NODE_OPTIONS, undefined); assert.equal(env.COPILOT_HOME, 'isolated'); }
  finally { if (old === undefined) delete process.env.GITHUB_TOKEN; else process.env.GITHUB_TOKEN = old; if (node === undefined) delete process.env.NODE_OPTIONS; else process.env.NODE_OPTIONS = node; }
});
test('Copilot runtime failures are sanitized and cleanup runs after start failure', async () => {
  let profile, stopped = false;
  class Client { constructor(opts) { profile = opts.baseDirectory; } async start() { throw new Error(secret); } async stop() { stopped = true; } }
  await assert.rejects(copilot.collect({ secret }, { sdk: () => ({ CopilotClient: Client, RuntimeConnection: { forStdio: () => ({}) } }) }), { code: 'runtime' });
  assert.equal(stopped, true); assert.equal(fs.existsSync(profile), false);
});

const bucket = results => ({ starting_at: '2026-10-24T00:00:00Z', ending_at: '2026-10-25T00:00:00Z', results });
const tokenRow = { uncached_input_tokens: 10, cache_read_input_tokens: 20, cache_creation: { ephemeral_1h_input_tokens: 2, ephemeral_5m_input_tokens: 3 }, output_tokens: 7, model: 'synthetic-model' };
test('Claude follows reporting cursors, sums cache tokens and converts USD cents without a personal-quota claim', async () => {
  const calls = [];
  const report = await claude.collect({ secret: 'synthetic', label: 'Organization' }, { now, fetcher: async (raw, opts) => {
    const url = new URL(raw); calls.push(url); assert.equal(opts.headers['anthropic-version'], '2023-06-01'); assert.equal(url.searchParams.get('bucket_width'), '1d');
    if (url.pathname.endsWith('cost_report')) return response({ data: [bucket([{ amount: '123.78912', currency: 'USD' }])], has_more: false });
    return response({ data: [bucket([tokenRow])], has_more: !url.searchParams.has('page'), next_page: 'second' });
  } });
  assert.equal(calls.length, 3); assert.equal(report.complete, true); assert.equal(report.scope, 'organization'); assert.deepEqual(report.quotas, []);
  assert.equal(report.metrics.find(row => row.id === 'input').value, 70); assert.equal(report.metrics.find(row => row.id === 'output').value, 14); assert.equal(report.metrics.find(row => row.id === 'cost').value, '1.24');
  assert.ok(report.notes.some(note => note.includes('not exposed')));
});
test('Claude cost permission failure keeps token usage but does not fabricate cost', async () => {
  const report = await claude.collect({ secret: 'synthetic', label: 'Organization' }, { now, fetcher: async raw => raw.includes('/cost_report?') ? response({ error: secret }, 403) : response({ data: [bucket([tokenRow])], has_more: false }) });
  assert.equal(report.metrics.find(row => row.id === 'output').value, 7); assert.equal(report.metrics.find(row => row.id === 'cost').value, null); assert.ok(report.notes.some(row => row.includes('unavailable')));
});
test('Claude repeated pagination is rejected and capped incomplete usage withholds totals', async () => {
  await assert.rejects(claude.pages('usage_report/messages', {}, { secret: 'synthetic' }, { fetcher: async () => response({ data: [], has_more: true, next_page: 'loop' }) }), { code: 'schema' });
  let page = 0;
  const report = await claude.collect({ secret: 'synthetic', label: 'Organization' }, { now, fetcher: async raw => raw.includes('/cost_report?') ? response({ data: [], has_more: false }) : response({ data: [bucket([tokenRow])], has_more: true, next_page: `page-${page++}` }) });
  assert.equal(page, 20); assert.equal(report.complete, false); assert.equal(report.metrics.find(row => row.id === 'output').value, null);
});
const member = (id, cost, requests) => ({ userId: id, name: id, email: `${id}@example.test`, spendCents: cost, overallSpendCents: cost + 100, fastPremiumRequests: requests });
test('Cursor uses only the read-only spend route, authenticates Basic and validates all member pages', async () => {
  const report = await cursor.collect({ secret: 'synthetic', label: 'Team' }, { fetcher: async (url, opts) => {
    assert.equal(url, 'https://api.cursor.com/teams/spend'); assert.equal(opts.method, 'POST'); assert.equal(opts.headers.Authorization, 'Basic ' + Buffer.from('synthetic:').toString('base64'));
    const { page, pageSize } = JSON.parse(opts.body); assert.equal(pageSize, 100);
    return response({ teamMemberSpend: [member(`member${page}`, 150.25, 5)], totalPages: 2, totalMembers: 2, subscriptionCycleStart: now - 86400000 });
  } });
  assert.equal(report.scope, 'team'); assert.equal(report.complete, true); assert.deepEqual(report.quotas, []); assert.equal(report.members.length, 2);
  assert.equal(report.metrics.find(row => row.id === 'cost').value, '3.01'); assert.equal(report.metrics.find(row => row.id === 'requests').value, 10);
});
test('Cursor changing cycles fails closed; duplicate or missing members withhold team totals', async () => {
  await assert.rejects(cursor.collect({ secret: 'synthetic', label: 'Team' }, { fetcher: async (_url, opts) => response({ teamMemberSpend: [member('one', 100, 1)], totalPages: 2, totalMembers: 2, subscriptionCycleStart: now + JSON.parse(opts.body).page }) }), { code: 'schema' });
  const report = await cursor.collect({ secret: 'synthetic', label: 'Team' }, { fetcher: async () => response({ teamMemberSpend: [member('same', 100, 1)], totalPages: 2, totalMembers: 2, subscriptionCycleStart: now }) });
  assert.equal(report.complete, false); assert.equal(report.metrics.find(row => row.id === 'cost').value, null); assert.equal(report.members.length, 1);
});

const series = (type, value, at = now, labels = {}) => ({ metric: { type: `serviceruntime.googleapis.com/${type}`, labels: { quota_metric: 'requests', limit_name: 'RequestsPerMinute', window_size: '1m', ...labels } }, resource: { type: 'consumer_quota', labels: { project_id: 'synthetic-project', service: 'generativelanguage.googleapis.com', location: 'global' } }, points: [{ interval: { endTime: iso(at) }, value: { int64Value: String(value) } }] });
test('Gemini only calculates an exact, fresh quota pair; unknown/old/ambiguous series are not percentages', () => {
  const limit = series('quota/ratev2/limit', 100), usage = series('quota/ratev2/net_usage', 40);
  assert.equal(gemini.quotas([limit], [usage], now)[0].remainingPercent, 60);
  for (const usages of [[], [usage, usage], [series('quota/ratev2/net_usage', 40, now - 16 * 60000)], [series('quota/ratev2/net_usage', 40, now + 120000)], [series('quota/ratev2/net_usage', 40, now, { window_size: '1d' })]]) {
    const row = gemini.quotas([limit], usages, now)[0]; assert.equal(row.used, null); assert.equal(row.remainingPercent, null); assert.equal(row.resetsAt, null);
  }
  assert.equal(gemini.quotas([series('quota/ratev2/limit', 100, now - 31 * 3600000)], [usage], now).length, 0);
  assert.equal(gemini.quotas([series('quota/ratev2/limit', 0)], [usage], now)[0].remainingPercent, null);
});
test('Gemini monitoring requests are project/service-scoped; missing metrics remain unknown', async () => {
  const calls = [];
  const report = await gemini.collect({ projectId: 'synthetic-project' }, { now, getGoogleToken: async () => 'synthetic-access-token', fetcher: async (raw, opts) => {
    const url = new URL(raw); calls.push(url); assert.equal(url.pathname, '/v3/projects/synthetic-project/timeSeries'); assert.equal(opts.headers.Authorization, 'Bearer synthetic-access-token'); assert.match(url.searchParams.get('filter'), /generativelanguage.googleapis.com/); return response({});
  } });
  assert.equal(calls.length, 3); assert.deepEqual(report.quotas, []); assert.equal(report.metrics[0].value, null); assert.equal(report.scope, 'project');
  await assert.rejects(gemini.series({ projectId: 'synthetic-project' }, 'token', 'serviceruntime.googleapis.com/quota/ratev2/limit', { now, fetcher: async () => { const row = series('quota/ratev2/limit', 10); row.resource.labels.project_id = 'another-project'; return response({ timeSeries: [row] }); } }), { code: 'schema' });
});
test('public report projection strips credentials, raw responses and emails in privacy mode', () => {
  const result = projection.report({ ...nativeReport(), secret, raw: { token: secret }, members: [{ id: 'one', label: 'Member', email: 'private@example.test', secret, metrics: [] }], source: 'https://evil.test', quotas: [{ id: 'unknown', remainingPercent: Infinity, used: -1, limit: null }], metrics: [{ id: 'unknown', value: NaN }] }, 'copilot', true);
  assert.equal(JSON.stringify(result).includes(secret), false); assert.equal(JSON.stringify(result).includes('private@example.test'), false); assert.equal(result.source, projection.SOURCES.copilot);
  assert.equal(result.quotas[0].remainingPercent, null); assert.equal(result.quotas[0].used, null); assert.equal(result.metrics[0].value, null);
});

test('Gemini rolling request totals never include partial or day-aligned edge buckets', async () => {
  const clock = now + 45123, interval = gemini.requestInterval(clock);
  assert.equal(interval.start, now - 86400000 + 60000); assert.equal(interval.end, now);
  const report = await gemini.collect({ projectId: 'synthetic-project' }, { now: clock, getGoogleToken: async () => 'synthetic', fetcher: async raw => {
    const url = new URL(raw); if (!url.searchParams.get('filter').includes('/api/request_count')) return response({});
    assert.equal(url.searchParams.get('aggregation.alignmentPeriod'), '60s');
    assert.equal(url.searchParams.get('interval.startTime'), iso(interval.start));
    const row = series('api/request_count', 3); row.resource.type = 'consumed_api';
    row.points = [
      { interval: { startTime: iso(interval.end - 60000), endTime: iso(interval.end) }, value: { int64Value: '3' } },
      { interval: { startTime: iso(interval.start - 86400000), endTime: iso(interval.start + 60000) }, value: { int64Value: '1000' } },
      { interval: { startTime: iso(interval.end), endTime: iso(interval.end + 60000) }, value: { int64Value: '1000' } },
    ]; return response({ timeSeries: [row] });
  } });
  assert.equal(report.metrics[0].value, 3); assert.equal(report.periodStart, iso(interval.start)); assert.equal(report.periodEnd, iso(interval.end));
});

test('manager persists credentials only in the vault contract and never in public/cached reports', async () => {
  const f = fixture(), connected = await f.instance.connect(input());
  assert.equal(f.vault.connections[0].config.secret, secret); assert.equal(connected.state.connections[0].status, 'ready');
  assert.equal(JSON.stringify(connected).includes(secret), false); assert.equal(JSON.stringify(f.reports).includes(secret), false);
  assert.equal(connected.state.connections[0].nextUpdateAt, iso(now + 60000));
});
test('manager respects manual/automatic intervals and preserves a saved reading on error', async () => {
  const f = fixture(), { connectionId: id } = await f.instance.connect(input());
  await f.instance.refresh(id, true); assert.equal(f.calls, 1);
  f.advance(60000); await f.instance.refresh(id); assert.equal(f.calls, 1);
  f.collect(async () => { throw new Error(secret); }); await f.instance.refresh(id, true);
  const state = f.instance.public().connections[0]; assert.equal(state.status, 'stale'); assert.ok(state.report); assert.equal(state.fetchedAt, iso(now)); assert.equal(JSON.stringify(state).includes(secret), false);
  assert.ok(Date.parse(state.nextUpdateAt) >= now + 180000);
});
test('Cursor manual refresh never bypasses the hourly provider limit', async () => {
  const f = fixture(), { connectionId: id } = await f.instance.connect(input('cursor'));
  f.advance(3599999); await f.instance.refresh(id, true); assert.equal(f.calls, 1); f.advance(1); await f.instance.refresh(id, true); assert.equal(f.calls, 2);
});
test('manager coalesces concurrent refreshes and discards late results after removal', async () => {
  const f = fixture(), { connectionId: id } = await f.instance.connect(input()); f.advance(60000);
  let finish, signal; f.collect((_config, context) => { signal = context.signal; return new Promise(resolve => { finish = resolve; }); });
  const first = f.instance.refresh(id, true), second = f.instance.refresh(id, true); await Promise.resolve();
  assert.equal(f.calls, 2); assert.equal(f.instance.public().connections[0].refreshing, true);
  f.instance.remove(id); assert.equal(signal.aborted, true); finish(nativeReport()); await Promise.all([first, second]);
  assert.equal(f.instance.public().connections.length, 0); assert.deepEqual(f.reports.records, {});
});
test('manager cancel/close prevents a checked credential from being saved', async () => {
  for (const action of ['cancelConnect', 'stop']) {
    const f = fixture(); let finish; f.collect(() => new Promise(resolve => { finish = resolve; }));
    const pending = f.instance.connect(input()); f.instance[action](); finish(nativeReport());
    await assert.rejects(pending, /canceled|closing/); assert.equal(f.vault, null); assert.equal(f.instance.connecting, false);
  }
});
test('manager never reconnects a saved Copilot identity to another account', async () => {
  const f = fixture(), { connectionId: id } = await f.instance.connect(input());
  f.collect(async () => nativeReport('github:456'));
  await assert.rejects(f.instance.connect({ ...input(), id }), /different account/);
  assert.equal(f.vault.connections[0].subjectKey, 'github:123');
  f.collect(async () => nativeReport()); await assert.rejects(f.instance.connect(input()), /already connected/);
});
test('manager rejects identity drift during refresh, preserving the previous report', async () => {
  const f = fixture(), { connectionId: id } = await f.instance.connect(input()); f.advance(60000); f.collect(async () => nativeReport('github:456'));
  await f.instance.refresh(id, true); const value = f.instance.public().connections[0]; assert.equal(value.status, 'stale'); assert.equal(value.report.subject, 'synthetic-user'); assert.match(value.error, /Reconnect/);
});
test('locked or orphaned provider vault preserves data and forbids overwriting it', async () => {
  let writes = 0;
  for (const readVault of [() => { throw new Error(secret); }, () => null, () => ({ schema: 9, connections: [] })]) {
    const f = fixture({ readVault, readReports: () => ({ schema: 1, records: { saved: { report: nativeReport() } } }), writeVault: () => writes++ });
    assert.ok(f.instance.public().error); await assert.rejects(f.instance.connect(input()), /could not be unlocked/); assert.equal(writes, 0);
  }
});
test('paused connections do not poll, resume uses the previous rate limit, and labels are bounded', async () => {
  const f = fixture(), { connectionId: id } = await f.instance.connect(input());
  f.instance.setEnabled(id, false); f.advance(3600000); await f.instance.tick(); assert.equal(f.calls, 1);
  assert.equal(f.instance.public().connections[0].status, 'paused'); f.instance.rename(id, 'x'.repeat(100)); assert.equal(f.instance.public().connections[0].label.length, 48);
  f.instance.setEnabled(id, true); await f.instance.tick(); assert.equal(f.calls, 2); f.instance.stop();
});
