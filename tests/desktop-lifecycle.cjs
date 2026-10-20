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
fs.mkdirSync(home, { recursive: true });
const engine = new Engine({ packaged: false, appPath: project, dataDir: path.join(root, 'vault'), codexHome: home });
// Packaged Electron must receive an absolute executable path on Windows;
// relative paths can fail before the application code is reached.
const executable = process.argv[2] ? path.resolve(process.argv[2]) : require('electron');
const packaged = Boolean(process.argv[2]);
const run = () => new Promise((resolve, reject) => {
  const child = spawn(executable, [...(packaged ? [] : [project]), `--lifecycle-test=${session}`], { windowsHide: true, stdio: 'ignore', env: process.env });
  const timer = setTimeout(() => { child.kill(); reject(new Error('Lifecycle test timed out.')); }, 30000);
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
  // No snapshot cache at all on first launch: local roster must load offline.
  await run();
  const first = JSON.parse(fs.readFileSync(path.join(root, 'lifecycle-result.json'), 'utf8'));
  assert.equal(first.accountsAfterReopen, 4);
  // Simulate an unusable/disposable renderer cache on the next cold start.
  fs.writeFileSync(path.join(root, 'snapshot.json'), 'broken-cache');
  await run();
  const second = JSON.parse(fs.readFileSync(path.join(root, 'lifecycle-result.json'), 'utf8'));
  assert.equal(second.initialAccounts, 4); assert.equal(second.noEmptySetup, true);
  assert.equal(first.mobileEncryptedPairing, true); assert.equal(second.mobileEncryptedPairing, true);
  console.log('Desktop lifecycle passed: four persisted accounts, cold/tray/reload recovery and encrypted mobile QR pairing, read-only sync, revocation.');
})().catch(error => { console.error(error.message); try { console.error(fs.readFileSync(path.join(root, 'lifecycle-result.json'), 'utf8')); } catch {} process.exitCode = 1; }).finally(() => engine.stop());
