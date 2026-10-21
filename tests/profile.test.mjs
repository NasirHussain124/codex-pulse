import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import profile from '../electron/profile.cjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'quota-profile-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, destination: path.join(root, '.quota-management'), appData: path.join(root, 'Roaming'), localAppData: path.join(root, 'Local') };
}
function write(root, filename, data) {
  fs.mkdirSync(path.dirname(path.join(root, filename)), { recursive: true });
  fs.writeFileSync(path.join(root, filename), typeof data === 'string' ? data : JSON.stringify(data));
}
function saved(root, count = 4) {
  const accounts = {};
  for (let i = 1; i <= count; i++) {
    accounts[i] = { email: `saved-${i}@example.test`, accountId: 'workspace' };
    write(root, `vault/codex/credentials/account-${i}.json`, { pulseVault: 1, data: Buffer.from(`synthetic-encrypted-${i}`).toString('base64') });
  }
  write(root, 'vault/codex/sequence.json', { accounts });
  write(root, 'settings.json', { privacy: true, closeToTray: true });
  write(root, 'mobile-vault.json', '"synthetic-encrypted-pairing"');
  write(root, 'Local State', { os_crypt: { encrypted_key: 'synthetic-protected-key' } });
}

test('profile location is outside AppData and independent of launch host', () => {
  assert.equal(profile.profilePath('user'), path.join('user', '.quota-management'));
});

test('standalone startup recovers four accounts from the MSIX host instead of its empty profile', t => {
  const f = fixture(t), normal = path.join(f.appData, 'Codex Pulse');
  const host = path.join(f.localAppData, 'Packages', 'OpenAI.Codex_testfamily', 'LocalCache', 'Roaming', 'Codex Pulse');
  saved(normal, 0); saved(host);
  // Transient login state and browser cache must not be imported.
  write(host, 'vault/pending-logins/session/auth.json', 'not-to-be-copied');
  write(host, 'Cache/cache.data', 'not-to-be-copied');
  const result = profile.prepareProfile({ destination: f.destination, sources: profile.legacyProfiles(f) });
  assert.equal(result.accounts, 4); assert.equal(result.migrated, true);
  assert.equal(Object.keys(JSON.parse(fs.readFileSync(path.join(f.destination, 'vault/codex/sequence.json'))).accounts).length, 4);
  for (const file of ['settings.json', 'mobile-vault.json', 'Local State', 'vault/codex/credentials/account-1.json']) {
    assert.deepEqual(fs.readFileSync(path.join(f.destination, file)), fs.readFileSync(path.join(host, file)));
  }
  assert.equal(fs.existsSync(path.join(f.destination, 'vault/pending-logins')), false);
  assert.equal(fs.existsSync(path.join(f.destination, 'Cache')), false);
  assert.equal(fs.existsSync(path.join(host, 'vault/codex/credentials/account-1.json')), true);
  assert.ok(!fs.readdirSync(f.root).some(name => name.startsWith('.quota-migration-')));
});

test('duplicate views of the same host data are not treated as conflicting accounts', t => {
  const f = fixture(t), first = path.join(f.root, 'first'), second = path.join(f.root, 'second');
  saved(first); fs.cpSync(first, second, { recursive: true });
  assert.equal(profile.prepareProfile({ destination: f.destination, sources: [first, second] }).accounts, 4);
});

test('conflicting nonempty profiles fail without replacing either one', t => {
  const f = fixture(t), first = path.join(f.root, 'first'), second = path.join(f.root, 'second');
  saved(first); saved(second, 2);
  assert.throws(() => profile.prepareProfile({ destination: f.destination, sources: [first, second] }), /More than one/);
  assert.equal(fs.existsSync(f.destination), false);
  assert.equal(fs.existsSync(path.join(first, 'vault/codex/sequence.json')), true);
});

test('removing all accounts from the independent profile never resurrects legacy logins', t => {
  const f = fixture(t), old = path.join(f.root, 'old'); saved(old);
  profile.prepareProfile({ destination: f.destination, sources: [old] });
  fs.rmSync(path.join(f.destination, 'vault'), { recursive: true });
  write(f.destination, 'vault/codex/sequence.json', { accounts: {} });
  assert.equal(profile.prepareProfile({ destination: f.destination, sources: [old] }).migrated, false);
  assert.equal(Object.keys(JSON.parse(fs.readFileSync(path.join(f.destination, 'vault/codex/sequence.json'))).accounts).length, 0);
});

test('missing roster with encrypted logins cannot become a new empty setup', t => {
  const f = fixture(t), old = path.join(f.root, 'old'); saved(old);
  fs.unlinkSync(path.join(old, 'vault/codex/sequence.json'));
  assert.throws(() => profile.prepareProfile({ destination: f.destination, sources: [old] }), /roster is missing/);
  assert.equal(fs.existsSync(f.destination), false);
});

test('corrupt metadata and missing credentials fail closed without partial migration', t => {
  const f = fixture(t), old = path.join(f.root, 'old'); saved(old);
  write(old, 'vault/codex/sequence.json', 'broken-json');
  assert.throws(() => profile.prepareProfile({ destination: f.destination, sources: [old] }), /unreadable/);
  saved(old); fs.unlinkSync(path.join(old, 'vault/codex/credentials/account-1.json'));
  assert.throws(() => profile.prepareProfile({ destination: f.destination, sources: [old] }));
  assert.equal(fs.existsSync(f.destination), false);
});

test('fresh installation initializes once and does not inspect unrelated packages', t => {
  const f = fixture(t), other = path.join(f.localAppData, 'Packages', 'Other.App_family', 'LocalCache', 'Roaming', 'Codex Pulse');
  saved(other);
  const sources = profile.legacyProfiles(f);
  assert.equal(sources.includes(other), false);
  assert.equal(profile.prepareProfile({ destination: f.destination, sources }).accounts, 0);
  assert.equal(fs.existsSync(path.join(f.destination, 'profile-migration.json')), true);
});

test('path traversal identifiers and unencrypted credentials are never migrated', t => {
  const f = fixture(t), old = path.join(f.root, 'old'); saved(old);
  write(old, 'vault/codex/sequence.json', { accounts: { '../../elsewhere': {} } });
  assert.throws(() => profile.prepareProfile({ destination: f.destination, sources: [old] }), /invalid/);
  saved(old); write(old, 'vault/codex/credentials/account-1.json', { tokens: { access_token: 'synthetic' } });
  assert.throws(() => profile.prepareProfile({ destination: f.destination, sources: [old] }), /Only encrypted/);
  assert.equal(fs.existsSync(f.destination), false);
});

test('failed atomic commit leaves the original profile and no partial replacement', t => {
  const f = fixture(t), old = path.join(f.root, 'old'); saved(old);
  const rename = fs.renameSync;
  fs.renameSync = () => { throw Object.assign(new Error('synthetic write failure'), { code: 'EACCES' }); };
  try { assert.throws(() => profile.prepareProfile({ destination: f.destination, sources: [old] }), /synthetic write failure/); }
  finally { fs.renameSync = rename; }
  assert.equal(fs.existsSync(f.destination), false);
  assert.equal(fs.existsSync(path.join(old, 'vault/codex/credentials/account-1.json')), true);
  assert.ok(!fs.readdirSync(f.root).some(name => name.startsWith('.quota-migration-')));
});

test('a source edit during staging aborts instead of committing mixed files', t => {
  const f = fixture(t), old = path.join(f.root, 'old'); saved(old);
  const original = fs.writeFileSync; let changed = false;
  fs.writeFileSync = (filename, ...args) => {
    original(filename, ...args);
    if (!changed && String(filename).includes('.quota-migration-')) {
      changed = true;
      original(path.join(old, 'settings.json'), '{"privacy":false}');
    }
  };
  try { assert.throws(() => profile.prepareProfile({ destination: f.destination, sources: [old] }), /changed during recovery/); }
  finally { fs.writeFileSync = original; }
  assert.equal(fs.existsSync(f.destination), false);
  assert.ok(!fs.readdirSync(f.root).some(name => name.startsWith('.quota-migration-')));
});

test('linked credential directories cannot redirect migration outside the profile', t => {
  const f = fixture(t), old = path.join(f.root, 'old'); saved(old);
  const credentials = path.join(old, 'vault/codex/credentials'), moved = path.join(f.root, 'linked-credentials');
  fs.renameSync(credentials, moved);
  fs.symlinkSync(moved, credentials, 'junction');
  assert.throws(() => profile.prepareProfile({ destination: f.destination, sources: [old] }), /unsupported link/);
  assert.equal(fs.existsSync(f.destination), false);
});
