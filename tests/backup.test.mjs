import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes, createCipheriv } from 'node:crypto';
import backup from '../electron/backup.cjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'quota-backup-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const profile = path.join(root, '.quota-management');
  fs.mkdirSync(path.join(profile, 'vault/codex/credentials'), { recursive: true });
  fs.writeFileSync(path.join(profile, 'vault/codex/sequence.json'), JSON.stringify({ accounts: { 1: { email: 'private@example.test', accountId: 'workspace' } } }));
  fs.writeFileSync(path.join(profile, 'vault/codex/credentials/account-1.json'), JSON.stringify({ pulseVault: 1, data: 'encrypted-synthetic-login' }));
  fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({ privacy: true, mobileResume: true, mobileDiscovery: true, accounts: {} }));
  fs.writeFileSync(path.join(profile, 'mobile-vault.json'), JSON.stringify('encrypted-synthetic-pairing'));
  fs.writeFileSync(path.join(profile, 'Local State'), JSON.stringify({ os_crypt: { encrypted_key: 'encrypted-synthetic-chromium-key' } }));
  const key = randomBytes(32).toString('base64'), bundle = { key, wrappedKey: Buffer.from('dpapi-synthetic-wrapped-key').toString('base64') };
  return { root, profile, key, bundle };
}
test('encrypted backup contains no plaintext account or pairing metadata and authenticates its header', t => {
  const f = fixture(t), envelope = backup.createBackup(f.profile, f.bundle, '0.6.0');
  const serialized = JSON.stringify(envelope);
  for (const text of ['private@example.test', 'workspace', 'encrypted-synthetic-login', 'encrypted-synthetic-pairing', 'encrypted-synthetic-chromium-key']) assert.equal(serialized.includes(text), false);
  const restored = backup.readBackup(Buffer.from(serialized), f.key);
  assert.equal(restored.files.size, 5);
  assert.match(restored.files.get('vault/codex/sequence.json').toString(), /private@example.test/);
  assert.throws(() => backup.readBackup(Buffer.from(JSON.stringify({ ...envelope, version: 'forged' })), f.key), /damaged/);
  assert.throws(() => backup.readBackup(Buffer.from(serialized), randomBytes(32).toString('base64')), /damaged/);
  assert.throws(() => backup.readBackup(Buffer.from(JSON.stringify({ ...envelope, payload: envelope.payload.slice(8) })), f.key), /damaged/);
});
test('restore preserves the old profile, encrypted keys and pairing, while pausing network sharing', t => {
  const f = fixture(t), envelope = backup.createBackup(f.profile, f.bundle, '0.6.0');
  fs.writeFileSync(path.join(f.profile, 'settings.json'), '{"changed":true}');
  const staged = backup.stageRestore(f.profile, backup.readBackup(Buffer.from(JSON.stringify(envelope)), f.key));
  assert.equal(staged.accounts, 1);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.profile, 'settings.json'))), { changed: true });
  const applied = backup.applyRestore(f.profile, staged.id);
  assert.equal(applied.accounts, 1);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(applied.previous, 'settings.json'))), { changed: true });
  const settings = JSON.parse(fs.readFileSync(path.join(f.profile, 'settings.json')));
  assert.equal(settings.mobileResume, false); assert.equal(settings.mobileDiscovery, false); assert.equal(settings.privacy, true);
  assert.match(fs.readFileSync(path.join(f.profile, 'Local State'), 'utf8'), /encrypted-synthetic-chromium-key/);
  assert.match(fs.readFileSync(path.join(f.profile, 'mobile-vault.json'), 'utf8'), /encrypted-synthetic-pairing/);
  assert.equal(fs.existsSync(path.join(f.root, '.quota-management.pending-restore.json')), false);
});

test('a new Chromium key must be on disk before exporting encrypted phone/provider vaults', t => {
  const f = fixture(t); fs.writeFileSync(path.join(f.profile, 'Local State'), '{}');
  assert.throws(() => backup.createBackup(f.profile, f.bundle, '0.6.0'), /Quit and reopen/);
  assert.equal(fs.existsSync(path.join(f.profile, 'mobile-vault.json')), true);
});
test('a damaged current roster can be recovered without deleting its original folder', t => {
  const f = fixture(t), envelope = backup.createBackup(f.profile, f.bundle, '0.6.0');
  fs.writeFileSync(path.join(f.profile, 'vault/codex/sequence.json'), 'damaged-current-roster');
  const staged = backup.stageRestore(f.profile, backup.readBackup(Buffer.from(JSON.stringify(envelope)), f.key));
  const result = backup.applyRestore(f.profile, staged.id);
  assert.equal(fs.readFileSync(path.join(result.previous, 'vault/codex/sequence.json'), 'utf8'), 'damaged-current-roster');
});
test('tampered staging fails closed without replacing the active profile', t => {
  const f = fixture(t), envelope = backup.createBackup(f.profile, f.bundle, '0.6.0');
  const staged = backup.stageRestore(f.profile, backup.readBackup(Buffer.from(JSON.stringify(envelope)), f.key));
  const paths = backup.locations(f.profile, staged.id);
  fs.writeFileSync(path.join(paths.stage, 'settings.json'), '{}');
  assert.throws(() => backup.applyRestore(f.profile, staged.id), /verification/);
  assert.equal(fs.existsSync(f.profile), true); assert.equal(fs.existsSync(paths.previous), false);
  assert.throws(() => backup.stageRestore(f.profile, backup.readBackup(Buffer.from(JSON.stringify(envelope)), f.key)), /already waiting/);
  assert.throws(() => backup.applyRestore(f.profile, '../../outside'), /Invalid/);
});
test('a failed restore commit puts the original directory back', t => {
  const f = fixture(t), envelope = backup.createBackup(f.profile, f.bundle, '0.6.0');
  const staged = backup.stageRestore(f.profile, backup.readBackup(Buffer.from(JSON.stringify(envelope)), f.key));
  const paths = backup.locations(f.profile, staged.id), rename = fs.renameSync;
  fs.renameSync = (from, to) => { if (from === paths.stage) throw new Error('simulated commit failure'); return rename(from, to); };
  try { assert.throws(() => backup.applyRestore(f.profile, staged.id), /simulated/); }
  finally { fs.renameSync = rename; }
  assert.match(fs.readFileSync(path.join(f.profile, 'vault/codex/sequence.json'), 'utf8'), /private@example.test/);
  assert.equal(fs.existsSync(paths.previous), false);
});
test('path traversal and unsupported plaintext credentials are rejected even in an authenticated backup', t => {
  const f = fixture(t), meta = { format: 'quota-management-backup', schema: 1, version: '0.6.0', createdAt: new Date().toISOString(), encryption: 'windows-dpapi+a256gcm', wrappedKey: f.bundle.wrappedKey };
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', Buffer.from(f.key, 'base64'), iv);
  cipher.setAAD(Buffer.from(JSON.stringify(meta)));
  const payload = Buffer.concat([cipher.update(JSON.stringify({ schema: 1, files: { '../outside': 'eA==' } })), cipher.final()]);
  const envelope = { ...meta, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), payload: payload.toString('base64') };
  assert.throws(() => backup.readBackup(Buffer.from(JSON.stringify(envelope)), f.key), /unsupported/);
  const plain = backup.readBackup(Buffer.from(JSON.stringify(backup.createBackup(f.profile, f.bundle, '0.6.0'))), f.key);
  plain.files.set('vault/codex/credentials/account-1.json', Buffer.from('{"tokens":{"access_token":"plaintext"}}'));
  assert.throws(() => backup.stageRestore(f.profile, plain), /encrypted/);
  assert.equal(fs.existsSync(path.join(f.root, '.quota-management.pending-restore.json')), false);
});
