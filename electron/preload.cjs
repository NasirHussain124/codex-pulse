const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pulse', Object.freeze({
  getState: () => ipcRenderer.invoke('pulse:state'),
  reportView: (count, revision) => ipcRenderer.invoke('pulse:view-health', count, revision),
  quit: () => ipcRenderer.invoke('pulse:quit'),
  mobileStatus: () => ipcRenderer.invoke('pulse:mobile-status'),
  mobileStart: address => ipcRenderer.invoke('pulse:mobile-start', address),
  mobileStop: () => ipcRenderer.invoke('pulse:mobile-stop'),
  copyLoginCode: () => ipcRenderer.invoke('pulse:login-copy-code'),
  mobileCopyPair: text => ipcRenderer.invoke('pulse:mobile-copy-pair', text),
  mobileDownload: () => ipcRenderer.invoke('pulse:android-download'),
  mobilePair: () => ipcRenderer.invoke('pulse:mobile-pair'),
  mobileCancelPair: () => ipcRenderer.invoke('pulse:mobile-cancel-pair'),
  mobileRevoke: id => ipcRenderer.invoke('pulse:mobile-revoke', id),
  refresh: () => ipcRenderer.invoke('pulse:refresh'),
  refreshAccount: (id) => ipcRenderer.invoke('pulse:refresh-account', id),
  current: () => ipcRenderer.invoke('pulse:current'),
  resetReview: id => ipcRenderer.invoke('pulse:reset-review', id),
  resetConsume: (id, creditId) => ipcRenderer.invoke('pulse:reset-consume', id, creditId),
  addCurrent: () => ipcRenderer.invoke('pulse:add-current'),
  startLogin: (mode, identity) => ipcRenderer.invoke('pulse:login-start', mode, identity),
  cancelLogin: () => ipcRenderer.invoke('pulse:login-cancel'),
  openLoginPage: () => ipcRenderer.invoke('pulse:login-page'),
  installCodex: () => ipcRenderer.invoke('pulse:install-codex'),
  importExisting: () => ipcRenderer.invoke('pulse:import'),
  switchAccount: (id) => ipcRenderer.invoke('pulse:switch', id),
  removeAccount: (id) => ipcRenderer.invoke('pulse:remove', id),
  setDisabled: (id, disabled) => ipcRenderer.invoke('pulse:disable', id, disabled),
  saveSettings: (value) => ipcRenderer.invoke('pulse:settings', value),
  openWidget: () => ipcRenderer.invoke('pulse:widget'),
  openQuickView: () => ipcRenderer.invoke('pulse:quick-view'),
  closeQuickView: () => ipcRenderer.invoke('pulse:quick-close'),
  openDashboard: () => ipcRenderer.invoke('pulse:dashboard'),
  openUsage: () => ipcRenderer.invoke('pulse:usage-link'),
  exportHistory: () => ipcRenderer.invoke('pulse:export'),
  createBackup: () => ipcRenderer.invoke('pulse:backup'),
  restoreBackup: () => ipcRenderer.invoke('pulse:restore'),
  diagnostics: () => ipcRenderer.invoke('pulse:diagnostics'),
  onOpenAccount: handler => {
    const listener = (_event, identity) => { if (typeof identity === 'string' && /^[a-f0-9]{16}$/.test(identity)) handler(identity); };
    ipcRenderer.on('pulse:open-account', listener);
    return () => ipcRenderer.removeListener('pulse:open-account', listener);
  },
  onState: (handler) => {
    const listener = (_event, state) => handler(state);
    ipcRenderer.on('pulse:changed', listener);
    return () => ipcRenderer.removeListener('pulse:changed', listener);
  },
}));
