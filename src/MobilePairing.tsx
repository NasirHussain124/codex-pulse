import { useEffect, useState } from 'react';
import { Check, Copy, QrCode, ShieldCheck, Smartphone, Trash2 } from 'lucide-react';
import { api } from './api';
import type { MobileStatus } from './types';
import { Dropdown } from './Dropdown';

export function MobilePairing({ preview }: { preview: boolean }) {
  const [status, setStatus] = useState<MobileStatus | null>(null), [address, setAddress] = useState('');
  const [pair, setPair] = useState<{ text: string; qr: string; expiresAt: number } | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [now, setNow] = useState(Date.now()), [copied, setCopied] = useState(false);
  useEffect(() => {
    if (preview || !api.mobileStatus) return;
    let active = true;
    const sync = () => void api.mobileStatus!().then(next => { if (active) { setStatus(next); setAddress(previous => next.addresses.includes(previous) ? previous : next.address || next.addresses[0] || ''); } }).catch(err => { if (active) setError(err.message); });
    sync(); const timer = setInterval(sync, 3000), clock = setInterval(() => setNow(Date.now()), 1000);
    return () => { active = false; clearInterval(timer); clearInterval(clock); void api.mobileCancelPair?.(); };
  }, [preview]);
  const act = async (work: () => Promise<void>) => { setBusy(true); setError(''); try { await work(); } catch (err) { setError((err as Error).message.replace(/^Error invoking remote method '[^']+': Error: /, '')); } finally { setBusy(false); } };
  const expired = pair && pair.expiresAt <= now;
  return <div className="mobile-pairing">
    <div className="mobile-intro"><span><Smartphone size={25} /></span><div><strong>Your limits. In your pocket.</strong><p>Pair the Android companion to see every account and add a home-screen widget.</p></div></div>
    <div className="dialog-note"><ShieldCheck size={17} /><span>Read-only, certificate-pinned HTTPS. Only account names and usage readings leave your PC—never login tokens. Account emails follow the desktop’s Show emails setting.</span></div>
    <p className="fine-print">Use the same private Wi-Fi, or choose a Tailscale adapter for access from another network. Both devices need Tailscale for remote access. Your PC must be awake and Quota management running. No public ports are opened.</p>
    {preview ? <p className="pair-error">Open your real Windows workspace to pair a phone. Sample accounts cannot be paired.</p> : <>
      {!status?.enabled ? <><div className="setting"><span>Connection network</span><Dropdown label="Phone connection address" placeholder="No private network found" value={address} onChange={setAddress} options={(status?.addresses || []).map(ip => ({ value: ip, label: `${status?.networks?.find(n => n.address === ip)?.kind === 'tailscale' ? 'Tailscale · ' : 'Local · '}${ip}` }))} /></div><button className="solid-btn wide spaced" disabled={busy || !address} onClick={() => void act(async () => { setStatus(await api.mobileStart!(address)); })}>{busy ? 'Starting…' : 'Enable private phone connection'}</button></> : <>
        <div className="pair-connected"><span><Check size={14} /> Private connection enabled</span><small>{status.address}:{status.port}</small></div>
        {pair && !expired ? <div className="pair-code"><img src={pair.qr} alt="Scan this one-time pairing QR in the Quota management Android app" /><span>Scan inside the Android app · expires in {Math.max(0, Math.ceil((pair.expiresAt - now) / 1000))}s</span><input className="pair-link-input" aria-label="Pairing link" readOnly value={pair.text} onFocus={event => event.target.select()} /><small>Paste this in the Android app, not a browser.</small><button className="outline-btn" onClick={() => void act(async () => { if (!api.mobileCopyPair) throw new Error('Update the Windows app to copy a pairing link.'); await api.mobileCopyPair(pair.text); setCopied(true); })}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? 'Copied' : 'Copy pairing link'}</button></div> : <button className="solid-btn wide spaced" disabled={busy} onClick={() => void act(async () => { setPair(await api.mobilePair!()); setCopied(false); })}><QrCode size={16} />{expired ? 'Generate a new QR code' : 'Pair an Android phone'}</button>}
        <button className="outline-btn wide spaced" disabled={busy} onClick={() => void act(async () => { setStatus(await api.mobileStop!()); setPair(null); })}>Disable phone connection</button>
      </>}
      <label className="setting"><span>Resume connection after restart</span><input type="checkbox" checked={Boolean(status?.autoResume)} disabled={busy || !status} onChange={event => { const enabled = event.target.checked; void act(async () => { await api.saveSettings({ mobileResume: enabled }); setStatus(await api.mobileStatus!()); }); }} /></label>
      <label className="setting"><span>Find this PC after its local IP changes</span><input type="checkbox" checked={Boolean(status?.discovery)} disabled={busy || !status} onChange={event => { const enabled = event.target.checked; void act(async () => { await api.saveSettings({ mobileDiscovery: enabled }); setStatus(await api.mobileStatus!()); }); }} /></label>
      <p className="fine-print">Local discovery advertises an anonymous PC identity and address on the selected LAN. It never advertises your account names or pairing secret. The phone still verifies its saved certificate before connecting.</p>
      <p className="fine-print">LAN auto-resume waits for a Windows Private or domain network. Enable Start at Windows sign-in in Monitor settings to start the collector after reboot. Existing phone trust is retained; no fresh QR is normally needed.</p>
      {status?.recovery && <p className="connection-recovery" role="status">{status.recovery}</p>}
      {status && status.devices.length > 0 && <div className="paired-devices"><h3>Paired devices</h3>{status.devices.map(device => <div key={device.id}><span><strong>{device.name}</strong><small>{device.lastSeenAt ? `Last connected ${new Date(device.lastSeenAt).toLocaleString()}` : 'Waiting for first reading'}</small></span><button className="icon-btn" aria-label={`Revoke ${device.name}`} disabled={busy} onClick={() => void act(async () => { setStatus(await api.mobileRevoke!(device.id)); })}><Trash2 size={15} /></button></div>)}</div>}
    </>}
    {(error || status?.error) && <p className="pair-error" role="alert">{error || status?.error}</p>}
    <button className="outline-btn wide spaced" disabled={preview || busy} onClick={() => void act(async () => { await api.mobileDownload?.(); })}><Smartphone size={15} /> Download Android app</button>
    <p className="fine-print">If Windows asks about network access, allow only your private network. No firewall rules or router port forwarding are changed automatically.</p>
  </div>;
}
