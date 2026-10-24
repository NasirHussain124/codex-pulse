const os = require('node:os');
const net = require('node:net');
const { execFile } = require('node:child_process');
const lanAddress = value => net.isIPv4(value) && (/^10\./.test(value) || /^192\.168\./.test(value) || /^172\.(1[6-9]|2\d|3[01])\./.test(value));
const tailscaleAddress = value => net.isIPv4(value) && Number(value.split('.')[0]) === 100 && Number(value.split('.')[1]) >= 64 && Number(value.split('.')[1]) <= 127;

function networkEntries(interfaces = os.networkInterfaces()) {
  return Object.entries(interfaces).flatMap(([adapter, addresses]) => (addresses || []).filter(a => a.family === 'IPv4' && !a.internal).flatMap(a => {
    const kind = /^tailscale(?:\b|[ _-])/i.test(adapter) && tailscaleAddress(a.address) ? 'tailscale' : lanAddress(a.address) ? 'lan' : null;
    return kind ? [{ address: a.address, adapter, kind }] : [];
  }));
}

function trustedLanAddresses({ platform = process.platform, run = execFile } = {}) {
  // Auto-resume on LAN requires Windows' own Private/DomainAuthenticated
  // classification. RFC1918 alone also includes hotel and public Wi-Fi.
  if (platform !== 'win32') return Promise.resolve([]);
  const command = "$ErrorActionPreference='Stop'; $quotaIndices=@(Get-NetConnectionProfile | Where-Object { $_.NetworkCategory -in @('Private','DomainAuthenticated') } | Select-Object -ExpandProperty InterfaceIndex); @(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceIndex -in $quotaIndices } | Select-Object -ExpandProperty IPAddress) | ConvertTo-Json -Compress";
  return new Promise(resolve => {
    run('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true, shell: false, timeout: 10000, maxBuffer: 32768 }, (error, stdout) => {
      if (error) return resolve([]);
      try { const value = JSON.parse(stdout); resolve((Array.isArray(value) ? value : [value]).filter(ip => typeof ip === 'string' && lanAddress(ip))); }
      catch { resolve([]); }
    });
  });
}

class MobileRecovery {
  constructor({ getSettings, bridge, enumerate = networkEntries, trusted = trustedLanAddresses, changed = () => {} }) {
    Object.assign(this, { getSettings, bridge, enumerate, trusted, changed });
    this.running = null; this.closed = false; this.message = null;
  }
  async tick() {
    if (this.closed) return;
    if (this.running) return this.running;
    const run = async () => {
      const settings = this.getSettings();
      if (!settings.mobileResume) { this.message = null; return; }
      const mode = settings.mobileTransport || 'lan';
      const all = this.enumerate().filter(entry => entry.kind === mode);
      const trusted = mode === 'lan' ? await this.trusted() : [];
      if (this.closed || !this.getSettings().mobileResume || this.getSettings().mobileTransport !== settings.mobileTransport) return;
      const eligible = all.filter(entry => mode === 'tailscale' || trusted.includes(entry.address));
      const target = eligible.find(entry => entry.address === settings.mobileAddress) || eligible[0];
      const bridge = this.bridge();
      if (!target) {
        if (bridge.status().enabled) await bridge.stop();
        this.message = mode === 'tailscale' ? 'Waiting for the enrolled Tailscale adapter.' : 'Waiting for a Windows Private or domain network. Public Wi-Fi is not auto-enabled.';
        this.changed(); return;
      }
      if (bridge.status().enabled && bridge.status().address === target.address) { this.message = null; return; }
      try { await bridge.start(target.address); this.message = null; }
      catch { this.message = 'Could not resume the phone connection. Check the selected network and retry.'; }
      this.changed();
    };
    this.running = run().catch(() => {
      // A damaged encryption vault, adapter enumeration failure or rejected
      // bridge stop must be recoverable, not an unhandled main-process error.
      this.message = 'Connection recovery needs attention. Open Phone companion to check the saved pairing.';
      this.changed();
    }).finally(() => { this.running = null; });
    return this.running;
  }
  start() { this.closed = false; this.timer = setInterval(() => void this.tick().catch(() => { this.message = 'Connection recovery will retry shortly.'; }), 15000); this.timer.unref?.(); return this.tick(); }
  stop() { this.closed = true; clearInterval(this.timer); }
}

module.exports = { lanAddress, tailscaleAddress, networkEntries, trustedLanAddresses, MobileRecovery };
