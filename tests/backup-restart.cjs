const { spawn } = require('node:child_process');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const id = randomUUID();
const run = phase => new Promise((resolve, reject) => {
  const child = spawn(require('electron'), [path.join(__dirname, 'backup-bootstrap.cjs'), `--backup-test=${id}`, ...(phase ? [phase] : [])], { windowsHide: true, stdio: 'inherit' });
  const timer = setTimeout(() => { child.kill(); reject(new Error('Isolated backup restart timed out')); }, 30000);
  child.once('error', error => { clearTimeout(timer); reject(error); });
  child.once('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`Backup restart exited ${code}`)); });
});
(async () => { await run('--seed'); await run(null); await run('--restore'); })().catch(error => { console.error(error.message); process.exitCode = 1; });
