const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, randomBytes, createCipheriv, createDecipheriv } = require('node:crypto');
const { inspectProfile, profileFiles } = require('./profile.cjs');
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const MAX = 64 * 1024 * 1024;
const allowed = relative => profileFiles.includes(relative) || relative === 'vault/codex/sequence.json' || /^vault\/codex\/credentials\/account-\d{1,9}\.json$/.test(relative);

function keyBytes(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(value)) throw new Error('A Windows backup key is unavailable. Nothing was changed.');
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length !== 32) throw new Error('Invalid backup encryption key.');
  return bytes;
}
function header(value) {
  return { format: value.format, schema: value.schema, version: value.version, createdAt: value.createdAt, encryption: value.encryption, wrappedKey: value.wrappedKey };
}
function backupEnvelope(bytes) {
  if (bytes.length > MAX * 2) throw new Error('The selected backup is too large.');
  let value;
  try {
    value = JSON.parse(bytes);
    if (value.format !== 'quota-management-backup' || value.schema !== 1 || value.encryption !== 'windows-dpapi+a256gcm' || typeof value.version !== 'string' || value.version.length > 32 || typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))) throw new Error();
    for (const field of ['payload', 'wrappedKey', 'iv', 'tag']) if (typeof value[field] !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(value[field])) throw new Error();
    if (value.wrappedKey.length > 4096 || Buffer.from(value.iv, 'base64').length !== 12 || Buffer.from(value.tag, 'base64').length !== 16) throw new Error();
  } catch { throw new Error('This file is not a valid encrypted Quota management backup. Your current data was not changed.'); }
  return value;
}
function createBackup(root, keyBundle, version) {
  const key = keyBytes(keyBundle.key);
  if (typeof keyBundle.wrappedKey !== 'string' || keyBundle.wrappedKey.length > 4096) throw new Error('Invalid Windows backup key.');
  const profile = inspectProfile(root);
  const files = Object.fromEntries([...(profile?.copy || [])].map(([name, bytes]) => [name, bytes.toString('base64')]));
  const plain = JSON.stringify({ schema: 1, files });
  if (Buffer.byteLength(plain) > MAX) throw new Error('This profile is too large for a single safe backup. Export usage history separately.');
  if (profile && inspectProfile(root)?.fingerprint !== profile.fingerprint) throw new Error('Saved data changed while backing up. Try again once the current refresh finishes.');
  const meta = { format: 'quota-management-backup', schema: 1, version, createdAt: new Date().toISOString(), encryption: 'windows-dpapi+a256gcm', wrappedKey: keyBundle.wrappedKey };
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(JSON.stringify(header(meta))));
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]); key.fill(0);
  return { ...meta, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), payload: encrypted.toString('base64') };
}
function readBackup(bytes, encodedKey) {
  const envelope = backupEnvelope(bytes), key = keyBytes(encodedKey);
  let data;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
    decipher.setAAD(Buffer.from(JSON.stringify(header(envelope)))); decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
    const plain = Buffer.concat([decipher.update(Buffer.from(envelope.payload, 'base64')), decipher.final()]);
    if (plain.length > MAX) throw new Error();
    data = JSON.parse(plain.toString('utf8')); plain.fill(0);
    if (data.schema !== 1 || !data.files || typeof data.files !== 'object' || Array.isArray(data.files) || Object.keys(data.files).length > 220) throw new Error();
  } catch { throw new Error('This backup is damaged or belongs to another Windows account. Your current data was not changed.'); }
  finally { key.fill(0); }
  const files = new Map(); let size = 0;
  for (const [name, value] of Object.entries(data.files)) {
    if (!allowed(name) || typeof value !== 'string' || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new Error('The backup contains an unsupported file. Nothing was restored.');
    const content = Buffer.from(value, 'base64'); size += content.length;
    if (size > MAX) throw new Error('The backup exceeds the safe restore size.');
    files.set(name, content);
  }
  return { files, createdAt: Number.isFinite(Date.parse(envelope.createdAt)) ? envelope.createdAt : null, version: String(envelope.version || 'unknown').slice(0, 32) };
}
function locations(root, id) {
  if (!UUID.test(id) || path.basename(root) !== '.quota-management') throw new Error('Invalid restore target.');
  const parent = path.dirname(path.resolve(root));
  return { parent, stage: path.join(parent, `.quota-restore-${id}`), previous: path.join(parent, `.quota-management-before-restore-${id}`), marker: path.join(parent, '.quota-management.pending-restore.json') };
}
function stageRestore(root, backup) {
  const id = randomUUID(), paths = locations(root, id);
  if (fs.existsSync(paths.marker)) throw new Error('A restore is already waiting for restart. Restart Quota management before starting another.');
  fs.mkdirSync(paths.stage, { mode: 0o700 });
  let committed = false;
  try {
    for (const [name, bytes] of backup.files) {
      if (!allowed(name)) throw new Error('Unsupported restore file.');
      let content = bytes;
      if (name === 'settings.json') {
        const settings = JSON.parse(bytes);
        // Older pairing remains valid, but restoring a backup cannot silently
        // start a network listener or advertise discovery on a new network.
        content = Buffer.from(JSON.stringify({ ...settings, mobileResume: false, mobileDiscovery: false }));
      }
      const target = path.join(paths.stage, name);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content, { flag: 'wx', mode: 0o600 });
    }
    const verified = inspectProfile(paths.stage);
    if (!verified) throw new Error('This backup has no recoverable profile files.');
    fs.writeFileSync(paths.marker, JSON.stringify({ schema: 1, id, fingerprint: verified.fingerprint }), { flag: 'wx', mode: 0o600 });
    committed = true;
    return { id, accounts: verified.count, previous: paths.previous };
  } finally {
    // Exact own UUID-named stage only; never remove the active profile/backup.
    if (!committed && fs.existsSync(paths.stage)) fs.rmSync(paths.stage, { recursive: true });
  }
}
function applyRestore(root, id) {
  const paths = locations(root, id);
  const markerStat = fs.lstatSync(paths.marker);
  if (!markerStat.isFile() || markerStat.isSymbolicLink() || markerStat.size > 4096) throw new Error('Invalid pending restore record.');
  const marker = JSON.parse(fs.readFileSync(paths.marker, 'utf8'));
  const stage = inspectProfile(paths.stage);
  if (marker.schema !== 1 || marker.id !== id || !stage || stage.fingerprint !== marker.fingerprint) throw new Error('Restore verification failed. Your current profile was not replaced.');
  if (fs.existsSync(paths.previous)) throw new Error('The pre-restore backup already exists. Nothing was replaced.');
  const exists = fs.existsSync(root);
  if (exists) {
    const stat = fs.lstatSync(root);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('The current profile is not a regular directory. Nothing was replaced.');
    // A damaged roster is a reason to restore. Preserve the entire old folder
    // without traversing its children instead of rejecting recovery.
  }
  if (exists) fs.renameSync(root, paths.previous);
  try { fs.renameSync(paths.stage, root); }
  catch (error) { if (exists) fs.renameSync(paths.previous, root); throw error; }
  fs.unlinkSync(paths.marker);
  return { accounts: stage.count, previous: exists ? paths.previous : null };
}
module.exports = { createBackup, readBackup, stageRestore, applyRestore, locations, backupEnvelope };
