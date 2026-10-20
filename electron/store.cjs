const fs = require('node:fs');
const path = require('node:path');

const defaults = Object.freeze({ theme: 'dark', interval: 120, privacy: false,
  notifications: true, threshold: 20, startAtLogin: false, closeToTray: true,
  widgetWindow: 'weekly', widgetTop: true, compact: false, accounts: {} });

function validateSettings(input, previous = defaults) {
  const out = { ...previous };
  if (['light', 'dark', 'system'].includes(input.theme)) out.theme = input.theme;
  if ([120, 300, 600].includes(input.interval)) out.interval = input.interval;
  if ([10, 20, 30].includes(input.threshold)) out.threshold = input.threshold;
  if (['weekly', 'five_hour'].includes(input.widgetWindow)) out.widgetWindow = input.widgetWindow;
  for (const key of ['privacy', 'notifications', 'startAtLogin', 'closeToTray', 'widgetTop', 'compact']) {
    if (typeof input[key] === 'boolean') out[key] = input[key];
  }
  if (input.accounts && typeof input.accounts === 'object' && !Array.isArray(input.accounts)) {
    out.accounts = Object.fromEntries(Object.entries(input.accounts).filter(([id]) => /^[a-f0-9]{16}$/.test(id)).slice(0, 200)
      .map(([id, value]) => [id, { label: typeof value?.label === 'string' ? value.label.trim().slice(0, 48) : '', pinned: Boolean(value?.pinned) }]));
  }
  return out;
}

function atomicWrite(filename, value) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const temp = `${filename}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value), { mode: 0o600 });
  try { fs.renameSync(temp, filename); }
  finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
}

function readJSON(filename, fallback) {
  try { return JSON.parse(fs.readFileSync(filename, 'utf8')); } catch { return fallback; }
}

function createStore(directory) {
  const settingsFile = path.join(directory, 'settings.json');
  const stored = readJSON(settingsFile, {});
  let settings = validateSettings(stored && typeof stored === 'object' ? stored : {});
  return {
    get settings() { return settings; },
    update(input) { settings = validateSettings(input, settings); atomicWrite(settingsFile, settings); return settings; },
    load(name, fallback) { return readJSON(path.join(directory, `${name}.json`), fallback); },
    save(name, value) { atomicWrite(path.join(directory, `${name}.json`), value); },
  };
}
module.exports = { defaults, validateSettings, atomicWrite, createStore };
