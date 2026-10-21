const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

// MSIX hosts can redirect AppData for child processes. Outside AppData, the
// profile has the same physical location when launched from a host or Explorer.
const profilePath = home => path.join(home, '.quota-management');
const files = ['settings.json', 'snapshot.json', 'history.json', 'events.json',
  'mobile-vault.json', 'Local State', 'vault/readings.json'];

function legacyProfiles({ appData, localAppData }) {
  const roots = [path.join(appData, 'Codex Pulse')];
  const packages = path.join(localAppData, 'Packages');
  try {
    for (const entry of fs.readdirSync(packages, { withFileTypes: true })) {
      if (entry.isDirectory() && /^OpenAI\.(?:Codex|ChatGPT(?:-Desktop)?)_[\w]+$/.test(entry.name)) {
        roots.push(path.join(packages, entry.name, 'LocalCache', 'Roaming', 'Codex Pulse'));
      }
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  return roots;
}

function readFile(root, relative, required = false) {
  // Only a fixed allowlist and numeric credential names reach this helper.
  const parts = relative.split('/');
  for (let i = 1; i <= parts.length; i++) {
    const filename = path.join(root, ...parts.slice(0, i));
    let stat;
    try { stat = fs.lstatSync(filename); }
    catch (error) { if (!required && error.code === 'ENOENT') return null; throw error; }
    if (stat.isSymbolicLink() || (i < parts.length ? !stat.isDirectory() : !stat.isFile())) {
      throw new Error('A saved profile contains an unsupported link or file. Its original data was not changed.');
    }
    if (i === parts.length && stat.size > 32 * 1024 * 1024) throw new Error('A saved profile file is too large to migrate safely.');
  }
  return fs.readFileSync(path.join(root, relative));
}

function inspectProfile(root) {
  if (!fs.existsSync(root)) return null;
  if (!fs.lstatSync(root).isDirectory() || fs.lstatSync(root).isSymbolicLink()) throw new Error('The saved profile location is not a regular directory.');
  const rosterBytes = readFile(root, 'vault/codex/sequence.json');
  const credentials = path.join(root, 'vault', 'codex', 'credentials');
  const entries = fs.existsSync(credentials) ? fs.readdirSync(credentials) : [];
  let roster = { accounts: {} };
  if (rosterBytes) {
    try { roster = JSON.parse(rosterBytes); } catch { throw new Error('The saved account roster is unreadable. Original files were preserved.'); }
    if (!roster || !roster.accounts || typeof roster.accounts !== 'object' || Array.isArray(roster.accounts)) throw new Error('The saved account roster is invalid.');
  }
  const ids = Object.keys(roster.accounts);
  if (ids.length > 200 || ids.some(id => !/^\d{1,9}$/.test(id) || !roster.accounts[id] || typeof roster.accounts[id] !== 'object')) throw new Error('The saved account roster is invalid.');
  if (!ids.length && entries.some(name => /^account-\d+\.json$/.test(name))) throw new Error('Saved logins exist but their account roster is missing or empty. No accounts were overwritten.');
  const copy = new Map();
  if (rosterBytes) copy.set('vault/codex/sequence.json', rosterBytes);
  for (const id of ids) {
    const filename = `vault/codex/credentials/account-${id}.json`;
    const bytes = readFile(root, filename, true);
    let record;
    try { record = JSON.parse(bytes); } catch { throw new Error('A saved encrypted login is unreadable. Original files were preserved.'); }
    if (record?.pulseVault !== 1 || typeof record.data !== 'string' || !record.data.length) throw new Error('Only encrypted Quota management logins can be migrated.');
    copy.set(filename, bytes);
  }
  for (const filename of files) {
    const bytes = readFile(root, filename);
    if (bytes) copy.set(filename, bytes);
  }
  if (!copy.size) return null;
  const hash = createHash('sha256');
  for (const [filename, bytes] of [...copy].sort(([a], [b]) => a.localeCompare(b))) hash.update(filename).update('\0').update(bytes);
  return { root, count: ids.length, copy, fingerprint: hash.digest('hex') };
}

function prepareProfile({ destination, sources }) {
  // Initialized profiles remain authoritative even after removal of all accounts.
  // Never resurrect an older login from the untouched legacy backup.
  if (fs.existsSync(destination)) {
    const stat = fs.lstatSync(destination);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('The independent profile must be a regular directory, not a link.');
    return { migrated: false, source: 'independent' };
  }
  const candidates = sources.map(inspectProfile).filter(Boolean);
  const populated = [...new Map(candidates.filter(item => item.count > 0).map(item => [item.fingerprint, item])).values()];
  if (populated.length > 1) throw new Error('More than one different saved account profile was found. Nothing was overwritten. Please recover the intended profile before continuing.');
  const chosen = populated[0] || candidates[0];
  const parent = path.dirname(destination);
  fs.mkdirSync(parent, { recursive: true });
  const stage = fs.mkdtempSync(path.join(parent, '.quota-migration-'));
  try {
    for (const [relative, bytes] of chosen?.copy || []) {
      const target = path.join(stage, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, bytes, { flag: 'wx', mode: 0o600 });
      if (!fs.readFileSync(target).equals(bytes)) throw new Error('The saved profile could not be verified. Original files were preserved.');
    }
    // Detect a concurrent token rotation or account edit before committing.
    if (chosen && inspectProfile(chosen.root)?.fingerprint !== chosen.fingerprint) throw new Error('Your saved profile changed during recovery. Close other Quota management copies and try again.');
    fs.writeFileSync(path.join(stage, 'profile-migration.json'), JSON.stringify({ schemaVersion: 1,
      migratedAt: new Date().toISOString(), accounts: chosen?.count || 0,
      source: chosen ? chosen.root : null, originalsPreserved: true }), { mode: 0o600 });
    try { fs.renameSync(stage, destination); }
    catch (error) {
      // A simultaneous first launch may already have committed a full profile.
      if (!fs.existsSync(path.join(destination, 'profile-migration.json'))) throw error;
    }
    return { migrated: Boolean(chosen), source: chosen ? 'recovered' : 'new', accounts: chosen?.count || 0 };
  } finally {
    // Only this own mkdtemp staging directory is removed. Legacy data stays.
    if (fs.existsSync(stage)) fs.rmSync(stage, { recursive: true });
  }
}

module.exports = { profilePath, legacyProfiles, prepareProfile };
