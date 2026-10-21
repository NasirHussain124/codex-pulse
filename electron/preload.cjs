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
  openDashboard: () => ipcRenderer.invoke('pulse:dashboard'),
  openUsage: () => ipcRenderer.invoke('pulse:usage-link'),
  exportHistory: () => ipcRenderer.invoke('pulse:export'),
  onState: (handler) => {
    const listener = (_event, state) => handler(state);
    ipcRenderer.on('pulse:changed', listener);
    return () => ipcRenderer.removeListener('pulse:changed', listener);
  },
}));
