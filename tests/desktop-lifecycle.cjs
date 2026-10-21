const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Engine } = require('../electron/engine.cjs');
const project = path.resolve(__dirname, '..');
const session = randomUUID(), root = path.join(os.tmpdir(), `pulse-lifecycle-${session}`);
const home = path.join(root, 'test-codex');
const profile = path.join(root, 'independent');
const host = path.join(root, 'Local', 'Packages', 'OpenAI.Codex_testfamily', 'LocalCache', 'Roaming', 'Codex Pulse');
fs.mkdirSync(home, { recursive: true });
const engine = new Engine({ packaged: false, appPath: project, dataDir: path.join(host, 'vault'), codexHome: home });
// Packaged Electron must receive an absolute executable path on Windows;
// relative paths can fail before the application code is reached.
const executable = process.argv[2] ? path.resolve(process.argv[2]) : require('electron');
const packaged = Boolean(process.argv[2]);
const run = () => new Promise((resolve, reject) => {
  const child = spawn(executable, [...(packaged ? [] : [project]), `--lifecycle-test=${session}`, '--recovery-test'], { windowsHide: true, stdio: 'ignore', env: process.env });
  // Frozen sidecar cold starts can be slow while Windows scans a fresh package.
  const timer = setTimeout(() => { child.kill(); reject(new Error('Lifecycle test timed out.')); }, 90000);
  child.once('error', error => { clearTimeout(timer); reject(error); });
  child.once('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`Lifecycle process exited ${code}`)); });
});
(async () => {
  for (let i = 1; i <= 4; i++) {
    const claims = Buffer.from(JSON.stringify({ email: `lifecycle-${i}@example.test`, 'https://api.openai.com/auth': { chatgpt_plan_type: 'pro' } })).toString('base64url');
    fs.writeFileSync(path.join(home, 'auth.json'), JSON.stringify({ auth_mode: 'chatgpt', tokens: { id_token: `header.${claims}.signature`, access_token: `synthetic-${i}`, refresh_token: `synthetic-refresh-${i}`, account_id: 'synthetic-workspace' } }));
    await engine.request('addCurrent');
  }
  engine.stop();
  // Simulate Explorer's empty profile alongside the host's redirected data.
  const normal = path.join(root, 'Roaming', 'Codex Pulse', 'vault', 'codex');
  fs.mkdirSync(normal, { recursive: true });
  fs.writeFileSync(path.join(normal, 'sequence.json'), JSON.stringify({ accounts: {} }));
  fs.unlinkSync(path.join(home, 'auth.json'));
  // No cache, no live ChatGPT login: migrate durable accounts and start offline.
  await run();
  const first = JSON.parse(fs.readFileSync(path.join(profile, 'lifecycle-result.json'), 'utf8'));
  assert.equal(first.accountsAfterReopen, 4);
  assert.equal(JSON.parse(fs.readFileSync(path.join(profile, 'profile-migration.json'))).accounts, 4);
  assert.equal(fs.readdirSync(path.join(host, 'vault', 'codex', 'credentials')).length, 4);
  // Simulate an unusable/disposable renderer cache on the next cold start.
  fs.writeFileSync(path.join(profile, 'snapshot.json'), 'broken-cache');
  await run();
  const second = JSON.parse(fs.readFileSync(path.join(profile, 'lifecycle-result.json'), 'utf8'));
  assert.equal(second.initialAccounts, 4); assert.equal(second.noEmptySetup, true);
  assert.equal(first.mobileEncryptedPairing, true); assert.equal(second.mobileEncryptedPairing, true);
  console.log('Desktop lifecycle passed: MSIX-to-independent migration, four accounts without live auth, cold/tray/reload recovery and encrypted mobile QR pairing, read-only sync, revocation.');
})().catch(error => { console.error(error.message); try { console.error(fs.readFileSync(path.join(profile, 'lifecycle-result.json'), 'utf8')); } catch {} process.exitCode = 1; }).finally(() => engine.stop());
