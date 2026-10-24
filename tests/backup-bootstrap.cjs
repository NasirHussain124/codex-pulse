// Isolated Electron restore integration. Never uses the installed app/profile.
const { app, safeStorage } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const assert = require('node:assert/strict');
const backup = require('../electron/backup.cjs');
const id = process.argv.find(arg => arg.startsWith('--backup-test='))?.split('=')[1];
if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id || '')) throw new Error('An isolated test ID is required');
const root = path.join(os.tmpdir(), `quota-backup-restart-${id}`), profile = path.join(root, '.quota-management'), control = path.join(root, 'control.json');
fs.mkdirSync(profile, { recursive: true });
const restored = process.argv.includes('--restore');
const seed = process.argv.includes('--seed');
if (restored) backup.applyRestore(profile, JSON.parse(fs.readFileSync(control)).id);
app.setPath('userData', profile);
const primary = app.requestSingleInstanceLock();
if (!primary) app.exit(4);
app.whenReady().then(() => {
  try {
    assert.equal(safeStorage.isEncryptionAvailable(), true);
    if (seed) {
      fs.mkdirSync(path.join(profile, 'vault/codex/credentials'), { recursive: true });
      fs.writeFileSync(path.join(profile, 'vault/codex/sequence.json'), JSON.stringify({ accounts: { 1: { email: 'synthetic@example.test', accountId: 'synthetic-workspace' } } }));
      fs.writeFileSync(path.join(profile, 'vault/codex/credentials/account-1.json'), '{"pulseVault":1,"data":"synthetic-DPAPI-ciphertext"}');
      for (const name of ['mobile-vault', 'providers-vault']) fs.writeFileSync(path.join(profile, name + '.json'), JSON.stringify(safeStorage.encryptString('synthetic-pairing-and-provider-data').toString('base64')));
      fs.writeFileSync(path.join(profile, 'settings.json'), '{"mobileResume":true,"mobileDiscovery":true}');
      // Normal quit persists Chromium's newly generated OS encryption key.
    } else if (!restored) {
      for (const name of ['mobile-vault', 'providers-vault']) assert.equal(safeStorage.decryptString(Buffer.from(JSON.parse(fs.readFileSync(path.join(profile, name + '.json'))), 'base64')), 'synthetic-pairing-and-provider-data');
      const key = randomBytes(32).toString('base64');
      const envelope = backup.createBackup(profile, { key, wrappedKey: Buffer.from('synthetic-test-wrap').toString('base64') }, '0.6.0');
      const staged = backup.stageRestore(profile, backup.readBackup(Buffer.from(JSON.stringify(envelope)), key));
      fs.writeFileSync(control, JSON.stringify(staged));
      if (process.platform === 'win32') {
        // A running instance prevents directory replacement even before a
        // second process requests its own single-instance lock.
        assert.throws(() => backup.applyRestore(profile, staged.id), error => ['EPERM', 'EACCES', 'EBUSY'].includes(error.code));
        assert.equal(fs.existsSync(staged.previous), false);
      }
      fs.writeFileSync(path.join(profile, 'settings.json'), '{"changedAfterBackup":true}');
    } else {
      const staged = JSON.parse(fs.readFileSync(control));
      assert.equal(JSON.parse(fs.readFileSync(path.join(staged.previous, 'settings.json'))).changedAfterBackup, true);
      assert.equal(JSON.parse(fs.readFileSync(path.join(profile, 'settings.json'))).mobileResume, false);
      for (const name of ['mobile-vault', 'providers-vault']) assert.equal(safeStorage.decryptString(Buffer.from(JSON.parse(fs.readFileSync(path.join(profile, name + '.json'))), 'base64')), 'synthetic-pairing-and-provider-data');
      assert.equal(Object.keys(JSON.parse(fs.readFileSync(path.join(profile, 'vault/codex/sequence.json'))).accounts).length, 1);
      console.log('Cold Electron restore passed: single-instance ownership, preserved old profile, original Chromium encryption key, phone/provider ciphertext and paused sharing.');
    }
    app.quit();
  } catch (error) { console.error(error.message); app.exit(1); }
});
