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
    const sync = () => void api.mobileStatus!().then(next => { if (active) { setStatus(next); setAddress(previous => previous || next.address || next.addresses[0] || ''); } }).catch(err => { if (active) setError(err.message); });
    sync(); const timer = setInterval(sync, 3000), clock = setInterval(() => setNow(Date.now()), 1000);
    return () => { active = false; clearInterval(timer); clearInterval(clock); void api.mobileCancelPair?.(); };
  }, [preview]);
  const act = async (work: () => Promise<void>) => { setBusy(true); setError(''); try { await work(); } catch (err) { setError((err as Error).message.replace(/^Error invoking remote method '[^']+': Error: /, '')); } finally { setBusy(false); } };
  const expired = pair && pair.expiresAt <= now;
  return <div className="mobile-pairing">
    <div className="mobile-intro"><span><Smartphone size={25} /></span><div><strong>Your limits. In your pocket.</strong><p>Pair the Android companion to see every account and add a home-screen widget.</p></div></div>
    <div className="dialog-note"><ShieldCheck size={17} /><span>Read-only, certificate-pinned HTTPS. Only account labels and usage readings leave your PC—never Codex credentials or emails.</span></div>
    <p className="fine-print">Connect both devices to the same private Wi-Fi. Pulse must stay running in the tray. Internet relay and iPhone support are not included. Pairing stays off after a full app restart until you enable it here.</p>
    {preview ? <p className="pair-error">Open your real Windows workspace to pair a phone. Sample accounts cannot be paired.</p> : <>
      {!status?.enabled ? <><div className="setting"><span>Private PC address</span><Dropdown label="Phone connection address" placeholder="No private network found" value={address} onChange={setAddress} options={(status?.addresses || []).map(ip => ({ value: ip, label: ip }))} /></div><button className="solid-btn wide spaced" disabled={busy || !address} onClick={() => void act(async () => { setStatus(await api.mobileStart!(address)); })}>{busy ? 'Starting…' : 'Enable private phone connection'}</button></> : <>
        <div className="pair-connected"><span><Check size={14} /> Private connection enabled</span><small>{status.address}:{status.port}</small></div>
        {pair && !expired ? <div className="pair-code"><img src={pair.qr} alt="Scan this one-time pairing QR in the Codex Pulse Android app" /><span>Scan in the Android app · expires in {Math.max(0, Math.ceil((pair.expiresAt - now) / 1000))}s</span><button className="outline-btn" onClick={() => void act(async () => { await navigator.clipboard.writeText(pair.text); setCopied(true); })}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? 'Copied' : 'Copy pairing link'}</button></div> : <button className="solid-btn wide spaced" disabled={busy} onClick={() => void act(async () => { setPair(await api.mobilePair!()); setCopied(false); })}><QrCode size={16} />{expired ? 'Generate a new QR code' : 'Pair an Android phone'}</button>}
        <button className="outline-btn wide spaced" disabled={busy} onClick={() => void act(async () => { setStatus(await api.mobileStop!()); setPair(null); })}>Disable phone connection</button>
      </>}
      {status && status.devices.length > 0 && <div className="paired-devices"><h3>Paired devices</h3>{status.devices.map(device => <div key={device.id}><span><strong>{device.name}</strong><small>{device.lastSeenAt ? `Last connected ${new Date(device.lastSeenAt).toLocaleString()}` : 'Waiting for first reading'}</small></span><button className="icon-btn" aria-label={`Revoke ${device.name}`} disabled={busy} onClick={() => void act(async () => { setStatus(await api.mobileRevoke!(device.id)); })}><Trash2 size={15} /></button></div>)}</div>}
    </>}
    {(error || status?.error) && <p className="pair-error" role="alert">{error || status?.error}</p>}
    <p className="fine-print">If Windows asks about network access, allow only your private network. No firewall rules or router port forwarding are changed automatically.</p>
  </div>;
}
