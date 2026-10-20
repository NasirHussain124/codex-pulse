const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const files = execFileSync('git', ['ls-files', '-z', '--cached'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
if (!files.length) throw new Error('No tracked/staged project source to inspect.');
const patterns = [ /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, /gh[pousr]_[A-Za-z0-9]{30,}/, /sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{40,}/,
  /eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}/ ];
const issues = [];
for (const file of files) {
  if (/(?:^|\/)(?:auth\.json|sequence\.json|mobile-vault\.json|snapshot\.json|history\.json|health\.json|\.env(?:\..*)?)$/.test(file) && !file.endsWith('.env.example') || /(?:^|\/)(?:vault|pending-logins|backups|node_modules|release)\//.test(file) || /\.(?:exe|apk|jks|keystore|pfx|p12|key)$/i.test(file)) { issues.push(file); continue; }
  const content = fs.readFileSync(path.join(root, file));
  if (content.length > 2 * 1024 * 1024 || patterns.some(pattern => pattern.test(content.toString('utf8')))) issues.push(file);
}
if (issues.length) { console.error('Potential private/generated material detected in these paths (content withheld):\n' + issues.join('\n')); process.exitCode = 1; }
else console.log(`Source hygiene passed: ${files.length} tracked files; no known secret patterns, runtime vaults or generated installers.`);
