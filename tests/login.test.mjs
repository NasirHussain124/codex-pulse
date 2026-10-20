import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { LoginManager, deviceCode, removeSession } from '../electron/login.cjs';

const root = () => fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-login-test-'));
const flush = () => new Promise(resolve => setImmediate(resolve));
function setup(options = {}) {
  const child = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter(), killed: false, kill() { this.killed = true; } });
  let args, imported;
  const manager = new LoginManager({ root: root(), resolveCLI: () => 'C:\\official\\codex.exe',
    launch: (...values) => { args = values; return child; },
    importLogin: async (...values) => { imported = values; }, ...options });
  return { manager, child, args: () => args, imported: () => imported };
}
test('new login uses isolated official CLI profile and no shell', async () => {
  const test = setup();
  assert.equal(test.manager.start('browser').phase, 'waiting');
  const [exe, args, options] = test.args();
  assert.equal(exe, 'C:\\official\\codex.exe');
  assert.deepEqual(args, ['login', '-c', 'cli_auth_credentials_store="file"', '-c', 'forced_login_method="chatgpt"']);
  assert.equal(options.shell, false);
  assert.equal(options.windowsHide, true);
  assert.equal(options.env.CODEX_HOME, options.cwd);
  assert.equal(path.dirname(options.cwd), path.join(test.manager.root, 'pending-logins'));
  test.child.emit('close', 0); await flush();
  assert.equal(test.manager.status.phase, 'success');
  assert.equal(test.imported()[0], path.basename(options.cwd));
  assert.equal(fs.existsSync(options.cwd), false);
});
test('device code extraction ignores arbitrary URLs and tokens', () => {
  assert.equal(deviceCode('https://evil.test\nABCD-EFGHI\n'), null);
  assert.equal(deviceCode('https://auth.openai.com/codex/device\n\x1b[32m  ABCD-EFGHI\x1b[0m\n'), 'ABCD-EFGHI');
  assert.equal(deviceCode('https://auth.openai.com/codex/device\naccess_token=secret\n'), null);
});
test('device sign-in publishes one-time code only, never stdout secrets', async () => {
  const test = setup(); test.manager.start('device');
  test.child.stdout.emit('data', 'private-access-token\nhttps://auth.openai.com/codex/device\nABCD-');
  test.child.stdout.emit('data', 'EFGHI\n');
  assert.equal(test.manager.status.code, 'ABCD-EFGHI');
  assert.equal(JSON.stringify(test.manager.status).includes('private-access-token'), false);
  assert.ok(test.args()[1].includes('--device-auth'));
  test.manager.cancel(); assert.equal(test.child.killed, true);
  test.child.emit('close', 0); await flush(); assert.equal(test.imported(), undefined);
});
test('missing CLI produces actionable error without spawning', () => {
  const test = setup({ resolveCLI: () => null });
  assert.equal(test.manager.start().phase, 'error'); assert.equal(test.args(), undefined);
});
test('rejects arbitrary modes, reconnect identities, duplicate sign-ins', () => {
  const test = setup();
  assert.throws(() => test.manager.start('shell')); assert.throws(() => test.manager.start('browser', '../path'));
  test.manager.start(); assert.throws(() => test.manager.start()); test.manager.cancel();
});
test('reconnect passes exact identity to the engine and preserves engine error', async () => {
  let expected;
  const test = setup({ importLogin: async (_session, identity) => { expected = identity; throw new Error('Different account or workspace.'); } });
  test.manager.start('browser', '0123456789abcdef'); test.child.emit('close', 0); await flush();
  assert.equal(expected, '0123456789abcdef'); assert.equal(test.manager.status.phase, 'error');
  assert.equal(test.manager.status.message, 'Different account or workspace.');
});
test('failure, timeout and cancellation clean temporary sign-in data', async () => {
  const test = setup({ timeoutMs: 5 }); test.manager.start();
  const directory = test.args()[2].cwd;
  fs.writeFileSync(path.join(directory, 'auth.json'), 'transient-secret');
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(test.manager.status.phase, 'error'); assert.equal(fs.existsSync(directory), false);
  assert.equal(test.child.killed, true);
});
test('profile cleanup cannot target arbitrary directories', () => {
  assert.throws(() => removeSession(root(), '../../other'));
  assert.throws(() => removeSession(root(), ''));
});
test('browser port conflict gives device-code fallback without raw CLI error', () => {
  const test = setup(); test.manager.start();
  test.child.stderr.emit('data', 'private-token address already in use 1455'); test.child.emit('close', 1);
  assert.match(test.manager.status.message, /device-code/);
  assert.equal(test.manager.status.message.includes('private-token'), false);
});
