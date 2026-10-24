const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ProviderError, json, finite, count, instant, text, metric } = require('./common.cjs');

function normalize(result) {
  const rows = result?.quotaSnapshots;
  if (!rows || typeof rows !== 'object' || Array.isArray(rows)) throw new ProviderError('schema');
  return Object.entries(rows).slice(0, 30).flatMap(([id, row]) => {
    if (!row || typeof row !== 'object') return [];
    const unlimited = row.isUnlimitedEntitlement === true || row.entitlementRequests === -1;
    const remaining = finite(row.remainingPercentage) && row.remainingPercentage >= 0 && row.remainingPercentage <= 100 ? row.remainingPercentage : null;
    return [{ id: text(id, 80), label: ({ premium_interactions: 'Premium interactions', chat: 'Chat', completions: 'Completions' })[id] || text(id.replaceAll('_', ' '), 80),
      period: 'Provider entitlement', unit: 'requests', remainingPercent: unlimited ? null : remaining,
      used: count(row.usedRequests), limit: unlimited ? null : count(row.entitlementRequests), unlimited,
      resetsAt: instant(row.resetDate), observedAt: null,
      overage: count(row.overage), overageAllowed: row.overageAllowedWithExhaustedQuota === true }];
  });
}
function runtimeEnvironment(directory) {
  // An explicit token must not accidentally fall back to another user's gh,
  // Copilot, custom runtime, external telemetry or model-provider credentials.
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (/^(?:COPILOT|GH_|GITHUB_|OPENAI_|ANTHROPIC_|GOOGLE_|GEMINI_|AZURE_|OTEL_|NODE_DEBUG|NODE_OPTIONS)/i.test(key)) delete env[key];
  return { ...env, COPILOT_HOME: directory, COPILOT_TELEMETRY_ENABLED: 'false', DO_NOT_TRACK: '1' };
}
function unpackedPath(value) { return value.replace(/\.asar([\\/])/, '.asar.unpacked$1'); }
function connection(RuntimeConnection) {
  if (!process.versions.electron) return RuntimeConnection.forStdio();
  // Electron can read ASAR files but Windows cannot spawn an EXE inside one.
  // The complete official platform bundle is unpacked, with its adjacent assets.
  const platform = `${process.platform}-${process.arch}`;
  const root = path.dirname(require.resolve(`@github/copilot-sdk-${platform}/package.json`));
  const executable = unpackedPath(path.join(root, 'prebuilds', platform, process.platform === 'win32' ? 'copilot-runtime.exe' : 'copilot-runtime'));
  if (!fs.existsSync(executable)) throw new ProviderError('runtime');
  return RuntimeConnection.forStdio({ path: executable });
}
async function collect(config, { signal, fetcher = fetch, sdk = () => require('@github/copilot-sdk') } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'quota-copilot-'));
  let client, timer;
  try {
    const { CopilotClient, RuntimeConnection } = sdk();
    client = new CopilotClient({ connection: connection(RuntimeConnection), mode: 'empty', workingDirectory: directory, baseDirectory: directory,
      gitHubToken: config.secret, useLoggedInUser: false, logLevel: 'none', env: runtimeEnvironment(directory),
      clientInfo: { applicationName: 'Quota management', applicationVersion: '0.6.0' } });
    const cancel = () => { void client.forceStop().catch(() => {}); };
    signal?.addEventListener('abort', cancel, { once: true });
    try {
      if (signal?.aborted) throw new ProviderError('canceled');
      await client.start();
      // No session, prompt, model turn, tool approval or login/store RPC is used.
      const [raw, user] = await Promise.all([
        client.rpc.account.getQuota({ gitHubToken: config.secret }),
        json('https://api.github.com/user', { headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${config.secret}`, 'X-GitHub-Api-Version': '2022-11-28' }, signal }, fetcher),
      ]);
      if (count(user.id) === null || !text(user.login)) throw new ProviderError('schema');
      return { subjectKey: `github:${user.id}`, subject: text(user.login), scope: 'account', periodStart: null, periodEnd: null, complete: true,
        source: 'https://docs.github.com/en/copilot/how-tos/copilot-sdk/features/usage-and-billing',
        quotas: normalize(raw), metrics: [metric('account', 'GitHub account', text(user.login), 'text')], members: [],
        notes: ['Reported Copilot account entitlement, not Codex limits.', 'Unlimited entitlement is not unlimited capacity. Overage may incur charges and is never enabled by this app.'] };
    } finally { signal?.removeEventListener('abort', cancel); }
  } catch (error) { throw error instanceof ProviderError ? error : new ProviderError(signal?.aborted ? 'canceled' : 'runtime'); }
  finally {
    if (client) {
      try { await Promise.race([client.stop().catch(() => {}), new Promise(resolve => { timer = setTimeout(() => { void client.forceStop().catch(() => {}); resolve(); }, 3000); })]); }
      finally { clearTimeout(timer); }
    }
    // Only this own mkdtemp profile is removed. The user's Copilot home stays.
    // Antivirus/child-exit file locks must not replace the sanitized outcome.
    try { fs.rmSync(directory, { recursive: true, force: true }); } catch {}
  }
}
module.exports = { normalize, collect, runtimeEnvironment, connection, unpackedPath };
