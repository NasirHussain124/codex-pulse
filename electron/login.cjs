// Official Codex CLI owns OAuth. Renderer receives status/device code only,
// never process output, auth files, access tokens, or arbitrary launch paths.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');
const SESSION = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const DEVICE_URL = 'https://auth.openai.com/codex/device';

function findCodex(env = process.env) {
  const local = env.LOCALAPPDATA || '';
  const candidates = [
    path.join(local, 'Programs', 'OpenAI', 'Codex', 'bin', 'codex.exe'),
    ...(env.PATH || env.Path || '').split(path.delimiter).filter(Boolean).map(dir => path.join(dir.replace(/^"|"$/g, ''), 'codex.exe')),
  ];
  // npm's shim is a .cmd, which we deliberately don't execute via a shell.
  for (const base of [env.APPDATA && path.join(env.APPDATA, 'npm', 'node_modules', '@openai'), local && path.join(local, 'Programs', 'Codex')].filter(Boolean)) {
    for (const pkg of ['codex', 'codex-win32-x64', 'codex-win32-arm64']) for (const arch of ['x86_64', 'aarch64']) {
      candidates.push(path.join(base, pkg, 'vendor', `${arch}-pc-windows-msvc`, 'codex', 'codex.exe'));
      candidates.push(path.join(base, 'codex', 'node_modules', '@openai', pkg, 'vendor', `${arch}-pc-windows-msvc`, 'codex', 'codex.exe'));
    }
  }
  return candidates.find(file => { try { return fs.statSync(file).isFile(); } catch { return false; } }) || null;
}

function removeSession(root, sessionId) {
  if (!SESSION.test(sessionId)) throw new Error('Invalid sign-in session.');
  const parent = path.resolve(root, 'pending-logins');
  const target = path.resolve(parent, sessionId);
  if (path.dirname(target) !== parent) throw new Error('Invalid sign-in directory.');
  if (!fs.existsSync(target)) return;
  if (fs.lstatSync(target).isSymbolicLink()) throw new Error('Unsafe sign-in directory.');
  fs.rmSync(target, { recursive: true, force: true });
}

function deviceCode(output) {
  // The CLI can print ANSI colors and split messages across stream chunks.
  const clean = output.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '');
  if (!clean.includes(DEVICE_URL)) return null;
  return clean.match(/(?:^|\n)\s*([A-Z0-9]{4,6}-[A-Z0-9]{4,6})\s*(?:\r?\n|$)/)?.[1] || null;
}

class LoginManager {
  constructor({ root, importLogin, changed = () => {}, launch = spawn, resolveCLI = findCodex, timeoutMs = 900000 }) {
    Object.assign(this, { root, importLogin, changed, launch, resolveCLI, timeoutMs });
    this.active = null; this.status = { phase: 'idle' };
    // Crash leftovers are only this app's UUID-named temporary profiles.
    const pending = path.join(root, 'pending-logins');
    if (fs.existsSync(pending)) for (const entry of fs.readdirSync(pending)) if (SESSION.test(entry)) removeSession(root, entry);
  }
  set(status) { this.status = status; this.changed(); return this.status; }
  start(mode = 'browser', expectedIdentity = null) {
    if (!['browser', 'device'].includes(mode)) throw new Error('Choose browser or device-code sign-in.');
    if (expectedIdentity !== null && !/^[a-f0-9]{16}$/.test(expectedIdentity)) throw new Error('Invalid reconnect account.');
    if (this.active) throw new Error('A sign-in is already in progress. Cancel it before starting another.');
    const executable = this.resolveCLI();
    if (!executable) return this.set({ phase: 'error', message: 'Codex CLI was not found. Install the official Codex app or CLI, restart Quota management, and try again. You can also save an existing login below.' });
    const sessionId = randomUUID(), directory = path.join(this.root, 'pending-logins', sessionId);
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    const args = ['login', '-c', 'cli_auth_credentials_store="file"', '-c', 'forced_login_method="chatgpt"'];
    if (mode === 'device') args.push('--device-auth');
    const record = { sessionId, directory, mode, expectedIdentity, child: null, output: '', timer: null };
    this.active = record;
    this.set({ phase: mode === 'device' ? 'starting' : 'waiting', mode, message: mode === 'device' ? 'Requesting a one-time sign-in code…' : 'Complete sign-in in your browser. Your current Codex account stays unchanged.' });
    try {
      // This child-only CODEX_HOME is an official isolated profile setting.
      // It does not modify the user's environment or default Codex directory.
      record.child = this.launch(executable, args, { windowsHide: true, shell: false,
        cwd: directory, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, CODEX_HOME: directory, NO_COLOR: '1' } });
      const consume = chunk => {
        if (this.active !== record) return;
        record.output = (record.output + chunk.toString()).slice(-16384);
        const code = mode === 'device' && deviceCode(record.output);
        if (code) this.set({ phase: 'waiting', mode, code, message: 'Open the verification page and enter this one-time code. Only approve your own sign-in.' });
      };
      record.child.stdout.on('data', consume); record.child.stderr.on('data', consume);
      record.child.on('error', () => this.fail(record, 'Codex sign-in could not start. Check that the official Codex CLI is installed.'));
      record.child.on('close', code => {
        if (this.active === record) void this.complete(record, code);
        else { try { removeSession(this.root, record.sessionId); } catch { /* Retry at startup. */ } }
      });
      record.timer = setTimeout(() => this.fail(record, 'Sign-in timed out. Start again to get a fresh browser session or device code.'), this.timeoutMs);
      record.timer.unref?.();
    } catch { this.fail(record, 'Codex sign-in could not start. Check the Codex installation and try again.'); }
    return this.status;
  }
  async complete(record, code) {
    if (this.active !== record) return;
    clearTimeout(record.timer);
    if (code !== 0) {
      const message = /1455|address already in use/i.test(record.output) ? 'The browser callback port is busy. Try the device-code option instead.' : record.mode === 'device' ? 'Device sign-in did not finish. Enable device-code login in ChatGPT security/workspace settings, or try browser sign-in.' : 'Browser sign-in did not finish. Try again, or choose device-code sign-in.';
      this.fail(record, message); return;
    }
    this.set({ phase: 'saving', mode: record.mode, message: 'Securing the login in your Windows vault…' });
    try {
      await this.importLogin(record.sessionId, record.expectedIdentity);
      try { removeSession(this.root, record.sessionId); } catch { /* Retry cleanup at startup. */ }
      this.active = null;
      this.set({ phase: 'success', message: 'Account saved securely. You can add another account or return to the dashboard.' });
    } catch (error) {
      // Engine errors are sanitized; raw CLI output is never shown or logged.
      this.fail(record, error.message || 'Could not save the account. Try signing in again.');
    }
  }
  fail(record, message) {
    if (this.active !== record) return;
    this.active = null; clearTimeout(record.timer); record.child?.kill();
    try { removeSession(this.root, record.sessionId); } catch { /* Retry cleanup on next app start. */ }
    this.set({ phase: 'error', message });
  }
  cancel() {
    if (this.status.phase === 'saving') throw new Error('The login is being secured. Please wait.');
    const record = this.active;
    if (record) this.fail(record, '');
    return this.set({ phase: 'idle' });
  }
  stop() {
    if (this.active) this.fail(this.active, 'Sign-in stopped because Quota management is closing.');
  }
}
module.exports = { LoginManager, findCodex, deviceCode, removeSession, DEVICE_URL };
