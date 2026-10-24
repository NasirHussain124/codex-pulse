const { app, BrowserWindow, ipcMain, nativeImage, Tray, Menu, Notification,
  nativeTheme, dialog, shell, protocol, net, powerMonitor, session, screen, safeStorage, clipboard } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { Engine } = require('./engine.cjs');
const { createStore } = require('./store.cjs');
const { LoginManager, DEVICE_URL, findCodex } = require('./login.cjs');
const { randomUUID } = require('node:crypto');
const { loadLocalAccounts, validSnapshot } = require('./bootstrap.cjs');
const { MobileBridge } = require('./mobile.cjs');
const { copyPairingLink } = require('./pairing.cjs');
const { APP_NAME } = require('./branding.cjs');
const { profilePath, legacyProfiles, prepareProfile } = require('./profile.cjs');
const { popoverBounds } = require('./popover.cjs');
const { MobileRecovery, networkEntries } = require('./network.cjs');
const { createBackup, readBackup, stageRestore, applyRestore, backupEnvelope } = require('./backup.cjs');
const { actionableAlerts } = require('./alerts.cjs');
const { ProviderManager } = require('./providers/manager.cjs');
const { SOURCES: PROVIDER_SOURCES } = require('./providers/public.cjs');
const { androidDownload } = require('./downloads.cjs');

app.setAppUserModelId('com.codexpulse.desktop');
protocol.registerSchemesAsPrivileged([{ scheme: 'pulse', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
const smoke = process.argv.includes('--smoke');
const lifecycleId = process.argv.find(arg => arg.startsWith('--lifecycle-test='))?.split('=')[1];
const lifecycle = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(lifecycleId || '');
const recoveryTest = lifecycle && process.argv.includes('--recovery-test');
// Hosted Windows runners may not have a hardware-backed graphics surface.
// Only isolated QA profiles use software rendering; normal launches are unchanged.
if ((smoke || lifecycle) && process.env.CI === 'true') app.disableHardwareAcceleration();
const testRoot = lifecycle ? path.join(app.getPath('temp'), `pulse-lifecycle-${lifecycleId}`) : null;
const profileDirectory = smoke || lifecycle
  ? recoveryTest ? path.join(testRoot, 'independent') : lifecycle ? testRoot : path.join(app.getPath('temp'), `pulse-smoke-${process.pid}`)
  : profilePath(app.getPath('home'));
// Migrate before Electron initializes Local State: Windows safeStorage pairing
// keys must move together with the encrypted phone vault, not after ready.
try {
  const restoreId = process.argv.find(arg => arg.startsWith('--apply-quota-restore='))?.split('=')[1];
  if (restoreId && !smoke && !lifecycle) {
    // Windows holds an open directory handle after single-instance locking.
    // Restore must precede our own lock and Local State initialization. An
    // already-running Windows copy holds the same handle, so rename fails
    // before any profile is replaced. Do not port this assumption to POSIX.
    if (process.platform !== 'win32') throw new Error('Profile restore is currently supported only on Windows.');
    applyRestore(profileDirectory, restoreId);
  }
  if (recoveryTest) prepareProfile({ destination: profileDirectory, sources: legacyProfiles({
    appData: path.join(testRoot, 'Roaming'), localAppData: path.join(testRoot, 'Local') }) });
  else if (!smoke && !lifecycle) prepareProfile({ destination: profileDirectory,
    sources: legacyProfiles({ appData: app.getPath('appData'), localAppData: process.env.LOCALAPPDATA || path.join(app.getPath('home'), 'AppData', 'Local') }) });
} catch (error) {
  dialog.showErrorBox('Saved account recovery needs attention', `${error.message}\n\nYour original logins and phone pairing have not been deleted. Quota management will not open an empty replacement profile.`);
  app.exit(1);
}
app.setPath('userData', profileDirectory);
const demo = process.argv.includes('--demo') || smoke;
const primaryInstance = app.requestSingleInstanceLock();
if (!primaryInstance) app.quit();
let mainWindow, widgetWindow, tray, engine, store, login, pollTimer, refreshing = false, quitting = false;
let mobile, mobileRecovery, providerMonitor;
let quickWindow, quickReady = false, quickWanted = false, lastQuickBlur = 0;
let snapshot = { schemaVersion: 1, generatedAt: null, accounts: [], engine: { name: 'ccswap', version: '0.39.2', secureStorage: 'Windows DPAPI' } };
let engineError = null, history = [], events = [], initialized = false, revision = 0, startupSource = 'loading';
const startedAt = new Date().toISOString();
const thresholdNotices = new Set();

function state() { return { snapshot, settings: store.settings, history, events, refreshing, engineError, login: login?.status || { phase: 'idle' }, initialized, revision, desktop: true, demo, version: app.getVersion(), providers: providerMonitor?.public(store.settings.privacy) || { connections: [], error: null } }; }
function writeHealth(view = {}) {
  if (!store || demo) return;
  // Local counts only: no email, tokens, quota values, or analytics transport.
  try { store.save('health', { ...store.load('health', {}), ...view, version: app.getVersion(), processId: process.pid, startedAt,
    mainAccounts: snapshot.accounts.length, initialized, startupSource, revision,
    engineError: Boolean(engineError), updatedAt: new Date().toISOString() }); } catch { /* Diagnostics never block the app. */ }
}
function publish() {
  revision++;
  for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) win.webContents.send('pulse:changed', state());
  tray?.setToolTip(`${APP_NAME} · ${snapshot.accounts.length} saved accounts`);
  if (quickWindow?.isVisible()) positionQuickView();
  writeHealth();
}
function event(kind, title) {
  events.unshift({ id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, kind, title, at: new Date().toISOString() });
  events = events.slice(0, 60); store.save('events', events);
}
function notifyLow() {
  if (!store.settings.notifications || demo) return;
  for (const account of snapshot.accounts) {
    if (account.status !== 'ready') continue;
    for (const window of account.windows) {
      const key = `${account.identity}:${window.id}:${window.resetsAt}:${store.settings.threshold}`;
      if (window.remainingPercent <= store.settings.threshold && !thresholdNotices.has(key)) {
        thresholdNotices.add(key);
        if (Notification.isSupported()) new Notification({ title: 'A little headroom left',
          body: `${store.settings.accounts[account.identity]?.label || 'Account ' + account.id}: ${Math.round(window.remainingPercent)}% remaining in ${window.label.toLowerCase()}.`, silent: false }).show();
      }
    }
  }
}
function notifyActions(previous) {
  if (demo) return;
  let seen = store.load('alerts', {});
  if (!seen || typeof seen !== 'object' || Array.isArray(seen)) seen = {};
  const now = Date.now();
  seen = Object.fromEntries(Object.entries(seen).filter(([, at]) => typeof at === 'number' && now - at < 8 * 86400000));
  for (const item of actionableAlerts(snapshot, previous, store.settings, now)) {
    if (seen[item.key]) continue;
    seen[item.key] = now;
    if (Notification.isSupported()) {
      const note = new Notification({ title: item.title, body: item.message, silent: false });
      note.on('click', () => {
        showDashboard();
        const send = () => mainWindow?.webContents.send('pulse:open-account', item.identity);
        if (mainWindow?.webContents.isLoadingMainFrame()) mainWindow.webContents.once('did-finish-load', send);
        else send();
      });
      note.show();
    }
    event('advice', item.title);
  }
  store.save('alerts', Object.fromEntries(Object.entries(seen).slice(-1000)));
}
function accept(result, record = false) {
  if (!validSnapshot(result)) throw new Error('The local account engine returned an invalid roster. Your saved logins were not changed.');
  const previous = snapshot;
  snapshot = result; engineError = null; initialized = true;
  store.save('snapshot', snapshot);
  if (record && snapshot.accounts.some(a => a.fetchedAt)) {
    const points = snapshot.accounts.filter(a => a.fetchedAt).map(a => ({ identity: a.identity, fetchedAt: a.fetchedAt, windows: a.windows }));
    // Only one observation per actual account measurement, even after refresh clicks.
    const fingerprint = JSON.stringify(points);
    if (history.at(-1)?.fingerprint !== fingerprint) {
      history.push({ at: snapshot.generatedAt, accounts: points, fingerprint });
      history = history.slice(-2000); store.save('history', history);
    }
    notifyLow();
    notifyActions(previous);
  }
  publish(); return state();
}
async function refresh(accountId = null) {
  if (refreshing || demo) return state();
  refreshing = true; publish();
  try { accept(await engine.request('snapshot', { refresh: true, id: typeof accountId === 'string' ? accountId : null }), true); }
  catch (error) { engineError = error.message; }
  finally { refreshing = false; publish(); }
  return state();
}
async function bootstrap() {
  const result = await loadLocalAccounts({ engine, cached: snapshot, empty: {
    schemaVersion: 1, generatedAt: null, accounts: [], engine: { name: 'ccswap', version: '0.39.2', secureStorage: 'Windows DPAPI' } } });
  snapshot = result.snapshot; initialized = result.initialized; engineError = result.error; startupSource = result.source;
  if (result.source === 'vault') store.save('snapshot', snapshot);
  publish();
}
function schedule() { clearInterval(pollTimer); pollTimer = setInterval(refresh, store.settings.interval * 1000); pollTimer.unref(); }
function secureWindow(win) {
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.on('will-attach-webview', (event) => event.preventDefault());
}
function createWindow(widget = false) {
  const area = screen.getPrimaryDisplay().workAreaSize;
  const width = widget ? 420 : smoke || lifecycle ? 1500 : Math.min(1500, area.width - 28);
  const height = widget ? 420 : smoke || lifecycle ? 1000 : Math.min(1000, area.height - 28);
  const win = new BrowserWindow({ width, height,
    minWidth: widget ? 350 : Math.min(980, width), minHeight: widget ? 360 : Math.min(720, height), title: widget ? `${APP_NAME} · Widget` : APP_NAME,
    show: false, autoHideMenuBar: true, backgroundColor: widget ? '#252536' : '#141311',
    alwaysOnTop: widget && store.settings.widgetTop, icon: path.join(__dirname, '..', 'dist', 'pulse.ico'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, backgroundThrottling: !(smoke || lifecycle) } });
  secureWindow(win);
  win.on('show', () => { if (store) publish(); });
  win.on('focus', () => { if (store) publish(); });
  win.webContents.on('did-finish-load', () => { if (store) publish(); });
  const query = `?${widget ? 'widget=1&' : ''}${demo ? 'demo=1' : ''}`;
  if (!app.isPackaged && process.env.PULSE_DEV_URL === 'http://127.0.0.1:5184') win.loadURL(process.env.PULSE_DEV_URL + '/' + query);
  else win.loadURL('pulse://app/index.html' + query);
  win.once('ready-to-show', () => { if (!smoke && !lifecycle) win.show(); });
  if (!widget) win.on('close', (event) => {
    if (quitting) return;
    if (store.settings.closeToTray && tray) { event.preventDefault(); win.hide(); }
    else app.quit();
  });
  return win;
}
function showDashboard() {
  if (!store || !primaryInstance) return;
  hideQuickView();
  if (!mainWindow || mainWindow.isDestroyed()) mainWindow = createWindow();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show(); mainWindow.focus(); publish();
}
function positionQuickView(anchor) {
  if (!quickWindow || quickWindow.isDestroyed()) return;
  anchor ||= tray?.getBounds();
  if (!anchor?.width || !anchor?.height) { const point = screen.getCursorScreenPoint(); anchor = { ...point, width: 1, height: 1 }; }
  const display = screen.getDisplayMatching(anchor);
  quickWindow.setBounds(popoverBounds(anchor, display.workArea, demo ? 4 : snapshot.accounts.length), false);
}
function hideQuickView() { quickWanted = false; if (quickWindow && !quickWindow.isDestroyed()) quickWindow.hide(); }
function showQuickView(toggle = false, anchor) {
  if (toggle && (quickWindow?.isVisible() || Date.now() - lastQuickBlur < 180)) { hideQuickView(); return; }
  quickWanted = true;
  if (!quickWindow || quickWindow.isDestroyed()) {
    quickReady = false;
    quickWindow = new BrowserWindow({ width: 400, height: 334, title: `${APP_NAME} · Quick view`,
      show: false, frame: false, resizable: false, minimizable: false, maximizable: false,
      fullscreenable: false, skipTaskbar: true, alwaysOnTop: true, backgroundColor: '#232229',
      roundedCorners: true, autoHideMenuBar: true, icon: path.join(app.getAppPath(), 'dist', 'pulse.ico'),
      webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true } });
    const win = quickWindow; secureWindow(win);
    win.on('page-title-updated', event => event.preventDefault());
    win.on('focus', () => { if (!win.isAlwaysOnTop()) win.setAlwaysOnTop(true); });
    win.on('blur', () => { lastQuickBlur = Date.now(); hideQuickView(); });
    win.on('closed', () => { quickWindow = null; quickReady = false; quickWanted = false; });
    win.webContents.on('before-input-event', (_event, input) => { if (input.type === 'keyDown' && input.key === 'Escape') hideQuickView(); });
    win.webContents.on('did-finish-load', publish);
    win.once('ready-to-show', () => { quickReady = true; if (quickWanted) { positionQuickView(); win.show(); win.focus(); win.setAlwaysOnTop(true); publish(); } });
    const query = '?quick=1' + (demo ? '&demo=1' : '');
    win.loadURL(!app.isPackaged && process.env.PULSE_DEV_URL === 'http://127.0.0.1:5184' ? process.env.PULSE_DEV_URL + '/' + query : 'pulse://app/index.html' + query);
  }
  positionQuickView(anchor);
  if (quickReady) { quickWindow.show(); quickWindow.focus(); quickWindow.setAlwaysOnTop(true); publish(); }
}
function showPinnedWidget() {
  hideQuickView();
  if (!widgetWindow || widgetWindow.isDestroyed()) { widgetWindow = createWindow(true); widgetWindow.on('closed', () => { widgetWindow = null; }); }
  else { widgetWindow.show(); widgetWindow.focus(); }
}
function trusted(event) {
  const sender = event.senderFrame?.url || '';
  if (sender.startsWith('pulse://app/') || (!app.isPackaged && sender.startsWith('http://127.0.0.1:5184/'))) return;
  throw new Error('Untrusted application request.');
}
function handle(name, callback) { ipcMain.handle(name, async (event, ...args) => { trusted(event); return callback(...args); }); }
function id(value) { if (typeof value !== 'string' || !/^\d{1,9}$/.test(value)) throw new Error('Invalid account.'); return value; }
async function operation(method, params = {}) {
  if (demo) throw new Error('Sample accounts are read-only. Leave preview to manage real accounts.');
  const result = await engine.request(method, params);
  accept(result.snapshot || result);
  return result;
}

app.on('second-instance', showDashboard);
app.on('before-quit', () => { quitting = true; clearInterval(pollTimer); providerMonitor?.stop(); mobileRecovery?.stop(); login?.stop(); engine?.stop(); void mobile?.stop(); });
app.on('window-all-closed', () => { if (!tray) app.quit(); });
app.whenReady().then(async () => {
  if (!primaryInstance) return;
  protocol.handle('pulse', (request) => {
    const url = new URL(request.url);
    if (url.hostname !== 'app') return new Response('Forbidden', { status: 403 });
    const root = path.join(app.getAppPath(), 'dist');
    const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
    if (!file.startsWith(root + path.sep)) return new Response('Forbidden', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  store = createStore(app.getPath('userData'));
  const cachedSnapshot = store.load('snapshot', snapshot);
  if (validSnapshot(cachedSnapshot)) snapshot = cachedSnapshot;
  history = store.load('history', []); events = store.load('events', []);
  if (!Array.isArray(history)) history = [];
  if (!Array.isArray(events)) events = [];
  nativeTheme.themeSource = 'dark';
  engine = new Engine({ packaged: app.isPackaged, resourcesPath: process.resourcesPath, appPath: app.getAppPath(), dataDir: path.join(app.getPath('userData'), 'vault'), codexHome: lifecycle ? path.join(app.getPath('userData'), 'test-codex') : undefined });
  login = new LoginManager({ root: path.join(app.getPath('userData'), 'vault'), changed: publish,
    importLogin: async (sessionId, expectedIdentity) => {
      await operation('importLogin', { sessionId, expectedIdentity });
      event('account', 'Added a signed-in Codex account to the encrypted vault');
      void refresh();
    },
  });
  if (!demo) await bootstrap();
  else initialized = true;
  const getMobile = () => {
    if (demo || lifecycle) throw new Error('Phone pairing is available in your real desktop workspace, not sample mode.');
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows encryption is unavailable. Phone pairing was not enabled.');
    if (!mobile) mobile = new MobileBridge({ getState: state, discoverable: () => store.settings.mobileDiscovery,
      readSecret: () => { const encrypted = store.load('mobile-vault', null); return encrypted ? JSON.parse(safeStorage.decryptString(Buffer.from(encrypted, 'base64'))) : null; },
      writeSecret: value => store.save('mobile-vault', safeStorage.encryptString(JSON.stringify(value)).toString('base64')) });
    return mobile;
  };
  mobileRecovery = new MobileRecovery({ getSettings: () => store.settings, bridge: getMobile, changed: publish });
  if (!demo && !lifecycle) providerMonitor = new ProviderManager({
    readVault: () => {
      const value = store.load('providers-vault', null);
      if (!value) { if (fs.existsSync(path.join(profileDirectory, 'providers-vault.json'))) throw new Error('The encrypted provider vault is unreadable.'); return null; }
      if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows encryption is unavailable.');
      return JSON.parse(safeStorage.decryptString(Buffer.from(value, 'base64')));
    },
    writeVault: value => {
      if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows encryption is unavailable. Your credential was not saved.');
      store.save('providers-vault', safeStorage.encryptString(JSON.stringify(value)).toString('base64'));
    },
    readReports: () => store.load('provider-reports', null), writeReports: value => store.save('provider-reports', value), changed: publish,
  });
  const providers = () => {
    if (!providerMonitor || demo || lifecycle) throw new Error('Connect providers in your real Windows workspace, not sample mode.');
    return providerMonitor;
  };
  handle('pulse:provider-connect', async input => {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows encryption is unavailable. No credential was saved.');
    const result = await providers().connect(input);
    event('provider', 'Connected an authorized provider reporting source'); publish();
    return { connectionId: result.connectionId, providers: providers().public(store.settings.privacy) };
  });
  handle('pulse:provider-cancel-connect', () => providerMonitor?.cancelConnect());
  handle('pulse:provider-refresh', async value => { await providers().refresh(value, true); return providers().public(store.settings.privacy); });
  handle('pulse:provider-enabled', (value, enabled) => { providers().setEnabled(value, enabled); return providers().public(store.settings.privacy); });
  handle('pulse:provider-rename', (value, label) => { providers().rename(value, label); return providers().public(store.settings.privacy); });
  handle('pulse:provider-remove', async value => {
    const monitor = providers(), connection = monitor.public().connections.find(row => row.id === value);
    if (!connection) throw new Error('Unknown provider connection.');
    const answer = await dialog.showMessageBox(mainWindow, { type: 'question', title: 'Remove reporting connection?',
      message: `Remove ${connection.label}?`, detail: 'This removes its encrypted reporting credential and local report from Quota management. It does not log you out, revoke the provider key, modify billing, or change a running session.',
      buttons: ['Cancel', 'Remove connection'], defaultId: 0, cancelId: 0, noLink: true });
    if (answer.response === 1) { monitor.remove(value); event('provider', 'Removed a local provider reporting connection'); publish(); }
    return monitor.public(store.settings.privacy);
  });
  handle('pulse:provider-docs', (kind, setup = false) => {
    if (!Object.hasOwn(PROVIDER_SOURCES, kind) || typeof setup !== 'boolean') throw new Error('Choose a supported provider.');
    const links = { copilot: 'https://docs.github.com/en/copilot/how-tos/copilot-sdk/auth/authenticate', claude: 'https://platform.claude.com/docs/en/manage-claude/usage-cost-api', cursor: 'https://cursor.com/docs/account/teams/admin-api', gemini: 'https://docs.cloud.google.com/monitoring/access-control' };
    return shell.openExternal(setup ? links[kind] : PROVIDER_SOURCES[kind]);
  });
  handle('pulse:mobile-status', () => ({ ...getMobile().status(), autoResume: store.settings.mobileResume,
    discovery: store.settings.mobileDiscovery, recovery: mobileRecovery.message }));
  handle('pulse:mobile-start', async (address) => {
    const selected = networkEntries().find(entry => entry.address === address);
    if (!selected) throw new Error('Choose an available private LAN or Tailscale adapter.');
    const result = await getMobile().start(address);
    store.update({ mobileAddress: address, mobileTransport: selected.kind }); publish(); return result;
  });
  handle('pulse:mobile-stop', () => { store.update({ mobileResume: false }); publish(); return getMobile().stop(); });
  handle('pulse:mobile-revoke', (id) => getMobile().revoke(id));
  handle('pulse:login-copy-code', () => {
    const code = login?.status?.code;
    if (typeof code !== 'string' || !/^[A-Z0-9-]{4,32}$/i.test(code)) throw new Error('No active device code to copy.');
    clipboard.writeText(code); return true;
  });
  handle('pulse:mobile-copy-pair', (text) => copyPairingLink(text, clipboard));
  handle('pulse:android-download', (source = 'direct') => shell.openExternal(androidDownload(source)));
  handle('pulse:mobile-cancel-pair', () => getMobile().cancelPair());
  handle('pulse:mobile-pair', async () => {
    const payload = getMobile().pair();
    const text = 'codexpulse://pair?data=' + Buffer.from(JSON.stringify(payload)).toString('base64url');
    const qr = await require('qrcode').toDataURL(text, { errorCorrectionLevel: 'M', width: 360, margin: 2 });
    return { text, qr, expiresAt: payload.expiresAt };
  });
  handle('pulse:state', state);
  handle('pulse:view-health', (count, viewRevision) => {
    if (!Number.isInteger(count) || count < 0 || count > 10000 || !Number.isInteger(viewRevision) || viewRevision < 0) return;
    writeHealth({ rendererAccounts: count, rendererRevision: viewRevision, rendererSeenAt: new Date().toISOString() });
  });
  handle('pulse:quit', () => { setImmediate(() => app.quit()); });
  handle('pulse:refresh', async () => { if (!initialized && !demo) await bootstrap(); return refresh(); });
  handle('pulse:refresh-account', (value) => refresh(id(value)));
  handle('pulse:current', () => engine.request('current'));
  handle('pulse:reset-review', async value => {
    if (demo) throw new Error('Reset review requires a real saved account.');
    const account = snapshot.accounts.find(a => a.id === id(value));
    if (!account) throw new Error('This account is no longer saved.');
    const executable = findCodex();
    if (!executable) throw new Error('Install the official Codex CLI to review earned resets.');
    const result = await engine.request('resetReview', { id: account.id, expectedIdentity: account.identity, executable });
    const attempts = store.load('reset-attempts', {});
    const pending = Object.keys(attempts).find(key => key.startsWith(account.identity + ':'));
    if (pending) result.review.pendingCreditId = pending.slice(account.identity.length + 1);
    accept(result.snapshot, true); return result.review;
  });
  let redeemBusy = false;
  handle('pulse:reset-consume', async (value, creditId) => {
    if (demo || redeemBusy) throw new Error('A reset cannot be redeemed in this state.');
    const account = snapshot.accounts.find(a => a.id === id(value));
    if (!account || account.disabled || typeof creditId !== 'string' || !creditId.length || creditId.length > 512) throw new Error('Refresh the account and choose a specific reset.');
    const executable = findCodex();
    if (!executable) throw new Error('Install the official Codex CLI to redeem earned resets.');
    redeemBusy = true;
    try {
      const confirmation = await dialog.showMessageBox(mainWindow, { type: 'question', title: 'Use one earned reset?',
        message: `Use one Codex reset for ${store.settings.accounts[account.identity]?.label || account.email}?`,
        detail: 'This may spend a banked reset credit. Natural quota resets are free. The provider checks eligibility. Running sessions and selected accounts will not be changed.',
        buttons: ['Cancel', 'Use this reset'], defaultId: 0, cancelId: 0, noLink: true });
      if (confirmation.response !== 1) return { canceled: true };
      const attempts = store.load('reset-attempts', {});
      const key = account.identity + ':' + creditId;
      if (Object.keys(attempts).some(other => other.startsWith(account.identity + ':') && other !== key)) throw new Error('An earlier redemption has an uncertain result. Check or retry that same credit before choosing another.');
      const previous = attempts[key];
      const attemptId = previous?.id || randomUUID();
      // Persist before sending. A crash/timeout must not turn a retry into a
      // second logical redemption. No mutation is retried on startup.
      attempts[key] = { id: attemptId, createdAt: previous?.createdAt || new Date().toISOString() };
      store.save('reset-attempts', attempts);
      const result = await engine.request('resetConsume', { id: account.id, expectedIdentity: account.identity, executable, creditId, attemptId, retry: Boolean(previous) });
      accept(result.snapshot, true);
      delete attempts[key]; store.save('reset-attempts', attempts);
      event('reset', result.outcome === 'reset' || result.outcome === 'alreadyRedeemed' ? 'Earned reset verified; refreshed provider limits' : 'Reset eligibility checked; no credit consumed');
      return { review: result.review, outcome: result.outcome, canceled: false };
    } finally { redeemBusy = false; }
  });
  handle('pulse:login-start', (mode, expectedIdentity = null) => {
    if (demo) throw new Error('Open the Windows app without preview mode to sign in.');
    return login.start(mode, expectedIdentity);
  });
  handle('pulse:login-cancel', () => login.cancel());
  handle('pulse:login-page', () => {
    if (!login.status.code || login.status.phase !== 'waiting') throw new Error('Start device-code sign-in first.');
    return shell.openExternal(DEVICE_URL);
  });
  handle('pulse:install-codex', () => shell.openExternal('https://learn.chatgpt.com/docs/cli'));
  handle('pulse:add-current', async () => { const result = await operation('addCurrent'); event('account', 'Saved a Codex login securely'); refresh(); return state(); });
  handle('pulse:import', async () => { const result = await operation('importExisting'); event('account', `Imported ${result.imported} saved ccswap account${result.imported === 1 ? '' : 's'}`); refresh(); return { imported: result.imported, state: state() }; });
  handle('pulse:switch', async (value) => {
    const result = await operation('switch', { id: id(value) });
    event('switch', 'Selected an account for the next Codex launch'); publish(); return state();
  });
  handle('pulse:remove', async (value) => { await operation('remove', { id: id(value) }); event('account', 'Removed an account from Quota management'); publish(); return state(); });
  handle('pulse:disable', async (value, disabled) => { if (typeof disabled !== 'boolean') throw new Error('Invalid state.'); await operation('setDisabled', { id: id(value), disabled }); return state(); });
  handle('pulse:settings', (input) => {
    if (!input || typeof input !== 'object' || Array.isArray(input) || JSON.stringify(input).length > 32768) throw new Error('Invalid settings.');
    const before = store.settings.startAtLogin;
    store.update(input); nativeTheme.themeSource = 'dark';
    if (before !== store.settings.startAtLogin && app.isPackaged) {
      try {
        app.setLoginItemSettings({ openAtLogin: store.settings.startAtLogin,
          path: process.env.PORTABLE_EXECUTABLE_FILE || process.execPath });
      } catch { store.update({ startAtLogin: before }); throw new Error('Windows could not update startup registration. Your previous setting was kept.'); }
    }
    widgetWindow?.setAlwaysOnTop(store.settings.widgetTop);
    mobile?.updateDiscovery();
    if (!demo && !lifecycle) void mobileRecovery.tick();
    schedule(); publish(); return store.settings;
  });
  handle('pulse:widget', () => { showPinnedWidget(); return true; });
  handle('pulse:quick-view', () => { showQuickView(); return true; });
  handle('pulse:quick-close', () => { hideQuickView(); return true; });
  handle('pulse:dashboard', () => { showDashboard(); return true; });
  handle('pulse:usage-link', () => shell.openExternal('https://chatgpt.com/codex/settings/usage'));
  handle('pulse:export', async () => {
    const destination = await dialog.showSaveDialog(mainWindow, { defaultPath: 'codex-pulse-usage.csv', filters: [{ name: 'CSV', extensions: ['csv'] }] });
    if (destination.canceled || !destination.filePath) return false;
    const rows = [['observed_at', 'account_id', 'window', 'remaining_percent', 'resets_at']];
    for (const sample of history) for (const account of sample.accounts || []) for (const window of account.windows || []) rows.push([sample.at, account.identity, window.id, window.remainingPercent, window.resetsAt || '']);
    const csv = rows.map(row => row.map(value => '"' + String(value ?? '').replaceAll('"', '""') + '"').join(',')).join('\r\n');
    fs.writeFileSync(destination.filePath, csv, 'utf8'); return true;
  });
  const svg = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"64\" height=\"64\" viewBox=\"0 0 64 64\" fill=\"none\"><title>Quota management</title><rect width=\"64\" height=\"64\" rx=\"19\" fill=\"#25212E\"/><circle cx=\"30\" cy=\"30\" r=\"17\" stroke=\"#DDCFFF\" stroke-width=\"6.5\"/><path d=\"M30 13A17 17 0 0 1 47 30\" stroke=\"#86D8BD\" stroke-width=\"6.5\" stroke-linecap=\"round\"/><path d=\"M40 40L49 49\" stroke=\"#DDCFFF\" stroke-width=\"6.5\" stroke-linecap=\"round\"/><path d=\"M24 27H36M24 34H31\" stroke=\"#DDCFFF\" stroke-width=\"4\" stroke-linecap=\"round\"/></svg>";
  handle('pulse:backup', async () => {
    if (demo || lifecycle) throw new Error('Backups are available only for your real saved profile.');
    const target = await dialog.showSaveDialog(mainWindow, { defaultPath: `Quota-management-${new Date().toISOString().slice(0, 10)}.qmbak`, filters: [{ name: 'Encrypted Quota management backup', extensions: ['qmbak'] }] });
    if (target.canceled || !target.filePath) return false;
    // DPAPI-wrapped per-backup key is independent of Chromium Local State, so
    // this backup remains recoverable after reinstall on the same Windows user.
    const bundle = await engine.request('backupCreateKey');
    const backup = createBackup(profileDirectory, bundle, app.getVersion());
    fs.writeFileSync(target.filePath, JSON.stringify(backup), { flag: 'wx', mode: 0o600 });
    event('backup', 'Created a Windows-account-encrypted recovery backup'); publish(); return true;
  });
  let restoring = false;
  handle('pulse:restore', async () => {
    if (demo || lifecycle || restoring || redeemBusy || login.active) throw new Error('Finish the current sign-in or reset before restoring your profile.');
    restoring = true;
    try {
      const chosen = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'], filters: [{ name: 'Encrypted Quota management backup', extensions: ['qmbak'] }] });
      if (chosen.canceled || !chosen.filePaths[0]) return false;
      const filename = chosen.filePaths[0], stat = fs.lstatSync(filename);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 128 * 1024 * 1024) throw new Error('Choose a regular encrypted backup smaller than 128 MB.');
      const bytes = fs.readFileSync(filename);
      const bundle = await engine.request('backupOpenKey', { wrappedKey: backupEnvelope(bytes).wrappedKey });
      const backup = readBackup(bytes, bundle.key);
      const answer = await dialog.showMessageBox(mainWindow, { type: 'warning', title: 'Restore saved accounts and pairing?',
        message: 'Restore this encrypted backup and restart Quota management?',
        detail: `Backup: ${backup.createdAt ? new Date(backup.createdAt).toLocaleString() : 'date unknown'} · version ${backup.version}\n\nThis replaces Quota management accounts, phone pairings, readings and settings with the backup. Your current profile is preserved in a separate recovery folder. Existing file-backed Codex/ChatGPT sessions are not modified. Phone sharing stays paused until you enable it again.`,
        buttons: ['Cancel', 'Restore and restart'], defaultId: 0, cancelId: 0, noLink: true });
      if (answer.response !== 1) return false;
      const staged = stageRestore(profileDirectory, backup);
      const args = process.argv.slice(1).filter(arg => !arg.startsWith('--apply-quota-restore='));
      app.relaunch({ args: [...args, `--apply-quota-restore=${staged.id}`] });
      app.quit(); return true;
    } finally { restoring = false; }
  });
  handle('pulse:diagnostics', () => {
    const status = mobile?.status();
    return { version: app.getVersion(), packaged: app.isPackaged, profile: 'Independent Windows profile',
      initialized, accounts: snapshot.accounts.length, ready: snapshot.accounts.filter(a => a.status === 'ready').length,
      engine: { available: !engineError, collectorRunning: Boolean(engine.child), lastReading: snapshot.generatedAt }, cli: { installed: Boolean(findCodex()) },
      phone: { enabled: Boolean(status?.enabled), transport: store.settings.mobileTransport || 'lan', pairedDevices: status?.devices?.length || 0,
        autoResume: store.settings.mobileResume, discovery: store.settings.mobileDiscovery, recovery: mobileRecovery.message || status?.error || null },
      network: networkEntries().map(entry => ({ kind: entry.kind, adapter: entry.adapter })),
      startup: app.isPackaged ? app.getLoginItemSettings().openAtLogin : false,
      encryption: safeStorage.isEncryptionAvailable(), observedAt: new Date().toISOString() };
  });
  // NativeImage SVG support varies by Windows build; use the packaged ICO.
  const iconFile = path.join(app.getAppPath(), 'dist', 'pulse.ico');
  const trayIcon = fs.existsSync(iconFile) ? nativeImage.createFromPath(iconFile) : nativeImage.createFromDataURL('data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64'));
  tray = new Tray(trayIcon.resize({ width: 20, height: 20 }));
  tray.setContextMenu(Menu.buildFromTemplate([{ label: 'Quick usage', click: () => showQuickView() }, { label: 'Open Quota management', click: showDashboard }, { label: 'Pin usage widget', click: showPinnedWidget }, { label: 'Refresh usage', click: refresh }, { type: 'separator' }, { label: 'Quit Quota management', click: () => app.quit() }]));
  tray.on('click', (_event, bounds) => showQuickView(true, bounds));
  tray.on('double-click', showDashboard);
  tray.on('right-click', hideQuickView);
  screen.on('display-metrics-changed', () => { if (quickWindow?.isVisible()) positionQuickView(); });
  screen.on('display-removed', hideQuickView);
  powerMonitor.on('suspend', hideQuickView);
  mainWindow = createWindow();
  if (!lifecycle) { powerMonitor.on('resume', () => { refresh(); if (!demo) void mobileRecovery.tick(); }); schedule(); }
  if (!demo && !lifecycle) void mobileRecovery.start();
  if (!demo && !lifecycle) void providerMonitor.start();
  if (!demo && !lifecycle) refresh();
  if (lifecycle) {
    mainWindow.webContents.once('did-finish-load', async () => {
      const { runLifecycle } = require('./lifecycle.cjs');
      const ok = await runLifecycle({ app, window: mainWindow, createWindow, showDashboard, state });
      app.exit(ok ? 0 : 1);
    });
  }
  if (smoke) {
    mainWindow.webContents.once('did-finish-load', async () => {
      const { runSmoke } = require('./smoke.cjs');
      const ok = await runSmoke({ app, window: mainWindow, createWindow, showQuickView, hideQuickView, getQuickWindow: () => quickWindow, getPinnedWindow: () => widgetWindow });
      app.exit(ok ? 0 : 1);
    });
  }
}).catch((error) => { dialog.showErrorBox('Quota management could not start', error.message); app.exit(1); });
