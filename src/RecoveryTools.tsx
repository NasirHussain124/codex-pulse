import { useState } from 'react';
import { Activity, ArrowDownToLine, RotateCcw } from 'lucide-react';
import { api } from './api';
import type { Diagnostics } from './types';
import { age } from './model';

export function RecoveryTools({ preview, notify }: { preview: boolean; notify: (text: string) => void }) {
  const [pending, setPending] = useState(false);
  const [data, setData] = useState<Diagnostics | null>(null);
  const act = async (action: () => Promise<unknown>) => {
    setPending(true);
    try { await action(); } catch (e) { notify((e as Error).message.replace(/^Error invoking remote method '[^']+': Error: /, '')); }
    finally { setPending(false); }
  };
  return <section className="recovery-tools" aria-label="Recovery and diagnostics"><h3>Keep your workspace safe</h3>
    <p className="fine-print">Encrypted backups preserve accounts, history and phone pairing. They can only be unlocked by this Windows user on this PC.</p>
    <div className="recovery-actions"><button className="outline-btn" disabled={preview || pending || !api.createBackup} onClick={() => void act(async () => { if (await api.createBackup?.()) notify('Encrypted backup saved. Keep it somewhere safe.'); })}><ArrowDownToLine size={14} /> Create backup</button><button className="outline-btn" disabled={preview || pending || !api.restoreBackup} onClick={() => void act(async () => { await api.restoreBackup?.(); })}><RotateCcw size={14} /> Restore backup</button></div>
    <button className="outline-btn wide spaced" disabled={preview || pending || !api.diagnostics} onClick={() => void act(async () => setData(await api.diagnostics!()))}><Activity size={14} /> Check connection health</button>
    {data && <div className="connection-health" role="status"><dl>
      <div><dt>Saved accounts</dt><dd>{data.accounts} · {data.ready} ready</dd></div>
      <div><dt>Local collector</dt><dd>{data.engine.available && data.engine.collectorRunning ? 'Running' : 'Needs attention'}</dd></div>
      <div><dt>Last reading</dt><dd>{age(data.engine.lastReading)}</dd></div>
      <div><dt>Windows encryption</dt><dd>{data.encryption ? 'Available' : 'Unavailable'}</dd></div>
      <div><dt>Official Codex CLI</dt><dd>{data.cli.installed ? 'Installed' : 'Not found'}</dd></div>
      <div><dt>Phone connection</dt><dd>{data.phone.enabled ? `Sharing · ${data.phone.transport === 'tailscale' ? 'Tailscale' : 'local network'}` : 'Paused'}</dd></div>
      <div><dt>Paired phones</dt><dd>{data.phone.pairedDevices}</dd></div>
      <div><dt>Recovery after restart</dt><dd>{data.phone.autoResume && data.startup ? 'Enabled' : data.phone.autoResume ? 'Enable Windows sign-in startup' : 'Off'}</dd></div>
    </dl>{data.phone.recovery && <p>{data.phone.recovery}</p>}<p className="fine-print">No email addresses, IP addresses, credentials or pairing secrets are included in this health report. Version {data.version}.</p></div>}
  </section>;
}
