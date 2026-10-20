// Exercise the actual frozen Python executable using only a disposable,
// synthetic Codex profile. Never reads the operator's .codex directory.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const readline = require('node:readline');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-engine-integration-'));
const home = path.join(root, 'codex'); fs.mkdirSync(home);
const executable = process.argv[2] || path.join(__dirname, '..', 'engine-dist', 'pulse-engine.exe');
const child = spawn(executable, ['--data-dir', path.join(root, 'vault'), '--codex-home', home], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
const pending = new Map(); let sequence = 0, lastMethod = 'startup';
readline.createInterface({ input: child.stdout }).on('line', line => { const result = JSON.parse(line); const waiter = pending.get(result.id); if (waiter) { pending.delete(result.id); result.ok ? waiter.resolve(result.result) : waiter.reject(new Error(result.error)); } });
child.stderr.on('data', () => {});
child.on('error', () => { for (const waiter of pending.values()) waiter.reject(new Error('Frozen engine could not be started.')); pending.clear(); });
const request = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence; lastMethod = method; pending.set(id, { resolve, reject }); child.stdin.write(JSON.stringify({ id, method, params }) + '\n'); });
function auth(email) { const claims = Buffer.from(JSON.stringify({ email, 'https://api.openai.com/auth': { chatgpt_plan_type: 'pro' } })).toString('base64url'); return { auth_mode: 'chatgpt', tokens: { id_token: `header.${claims}.signature`, access_token: `private-access-${email}`, refresh_token: `private-refresh-${email}`, account_id: 'shared-workspace' } }; }
const timer = setTimeout(() => { child.kill(); process.exitCode = 1; console.error(`Packaged engine test timed out during ${lastMethod}.`); }, 60000);
(async () => {
  assert.equal((await request('current')).available, false);
  fs.writeFileSync(path.join(home, 'auth.json'), JSON.stringify(auth('one@example.com')));
  await request('addCurrent');
  fs.writeFileSync(path.join(home, 'auth.json'), JSON.stringify(auth('two@example.com')));
  const result = await request('addCurrent');
  assert.equal(result.accounts.length, 2);
  assert.ok(!JSON.stringify(result).includes('private-access'));
  const protectedFile = fs.readFileSync(path.join(root, 'vault', 'codex', 'credentials', 'account-1.json'), 'utf8');
  assert.ok(!protectedFile.includes('private-access'));
  assert.equal(JSON.parse(protectedFile).pulseVault, 1);
  await request('switch', { id: '1' });
  assert.equal(JSON.parse(fs.readFileSync(path.join(home, 'auth.json'), 'utf8')).tokens.access_token, 'private-access-one@example.com');
  const before = fs.readFileSync(path.join(home, 'auth.json'), 'utf8');
  await request('remove', { id: '1' });
  assert.equal(fs.readFileSync(path.join(home, 'auth.json'), 'utf8'), before);
  const sessionId = randomUUID();
  const pendingProfile = path.join(root, 'vault', 'pending-logins', sessionId);
  fs.mkdirSync(pendingProfile, { recursive: true });
  fs.writeFileSync(path.join(pendingProfile, 'auth.json'), JSON.stringify(auth('three@example.com')));
  const added = await request('importLogin', { sessionId });
  assert.equal(added.accounts.length, 2);
  assert.ok(added.accounts.some(account => account.email === 'three@example.com'));
  assert.equal(fs.readFileSync(path.join(home, 'auth.json'), 'utf8'), before);
  await assert.rejects(request('importLogin', { sessionId, expectedIdentity: 'wrong-account' }), /different account/);
  await assert.rejects(request('importLogin', { sessionId: '../../outside' }), /Invalid sign-in session/);
  console.log('Packaged engine: multi-account vault, credential isolation, switching/removal, isolated login import and wrong-account reconnect rejection passed.');
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => { clearTimeout(timer); child.stdin.end(); child.kill(); });
