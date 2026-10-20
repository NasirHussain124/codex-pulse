const { spawn } = require('node:child_process');
const readline = require('node:readline');
const path = require('node:path');
const fs = require('node:fs');

class Engine {
  constructor({ packaged, resourcesPath, appPath, dataDir, codexHome }) {
    this.options = { packaged, resourcesPath, appPath, dataDir, codexHome };
    this.pending = new Map(); this.sequence = 0; this.child = null; this.queue = Promise.resolve(); this.restarts = 0;
  }
  start() {
    if (this.child) return;
    const { packaged, resourcesPath, appPath, dataDir, codexHome } = this.options;
    const exe = packaged ? path.join(resourcesPath, 'engine', 'pulse-engine.exe') : process.env.PULSE_PYTHON;
    if (!exe || !fs.existsSync(exe)) throw new Error('The bundled account engine is missing. Reinstall Codex Pulse. Development builds require PULSE_PYTHON.');
    const args = packaged ? ['--data-dir', dataDir] : [path.join(appPath, 'engine', 'pulse_bridge.py'), '--data-dir', dataDir];
    if (codexHome) args.push('--codex-home', codexHome);
    const child = spawn(exe, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, shell: false,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' } });
    this.child = child;
    const lines = readline.createInterface({ input: child.stdout });
    lines.on('line', (line) => {
      try {
        const response = JSON.parse(line);
        const pending = this.pending.get(response.id);
        if (!pending) return;
        clearTimeout(pending.timer); this.pending.delete(response.id);
        response.ok ? pending.resolve(response.result) : pending.reject(new Error(response.error || 'Account operation failed.'));
      } catch { /* Discard non-protocol output; never forward it to the renderer. */ }
    });
    child.stderr.on('data', () => {});
    child.on('error', () => this.fail('The account engine could not start. Reinstall Codex Pulse.'));
    child.on('exit', () => { if (this.child === child) { this.child = null; this.fail('The account engine stopped. Refresh to reconnect.'); } });
  }
  fail(message) {
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error(message)); }
    this.pending.clear();
  }
  request(method, params = {}) {
    // Exactly one request at a time: rotation, token refresh, and snapshots
    // cannot race each other in this process.
    const task = () => new Promise((resolve, reject) => {
      try { this.start(); } catch (error) { reject(error); return; }
      const id = ++this.sequence;
      const timer = setTimeout(() => {
        this.pending.delete(id); reject(new Error('The account engine timed out. Your last readings are preserved.'));
        this.child?.kill();
      }, 180000);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(JSON.stringify({ id, method, params }) + '\n', (error) => {
        if (error) { clearTimeout(timer); this.pending.delete(id); reject(new Error('The account engine connection was interrupted.')); }
      });
    });
    const result = this.queue.then(task, task);
    this.queue = result.catch(() => {});
    return result;
  }
  stop() { const child = this.child; this.child = null; this.fail('Application is closing.'); child?.kill(); }
}
module.exports = { Engine };
