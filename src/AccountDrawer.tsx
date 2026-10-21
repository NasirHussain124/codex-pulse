import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Code2, ExternalLink, Pencil, RefreshCw, ShieldCheck, Trash2, X } from 'lucide-react';
import type { Account, AppState } from './types';
import { age, countdown, email, label } from './model';
import { Dropdown } from './Dropdown';

const health = (remaining: number) => remaining <= 10 ? 'red' : remaining <= 30 ? 'amber' : 'green';

export function AccountDrawer({ account, state, preview, busy, close, choose, rename, refresh, select, reconnect, remove, notify }: {
  account: Account; state: AppState; preview: boolean; busy: boolean;
  close: () => void; choose: (identity: string) => void; rename: (name: string) => Promise<void>;
  refresh: () => void; select: () => void; reconnect: () => void; remove: () => void; notify: (message: string) => void;
}) {
  const panel = useRef<HTMLElement>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(label(account, state.settings));
  const [saving, setSaving] = useState(false);
  const displayName = label(account, state.settings);
  const expired = account.status === 'reconnect';
  const working = busy || saving || state.refreshing;
  useEffect(() => { setEditing(false); setName(label(account, state.settings)); }, [account.identity, state.settings.accounts]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const focusable = () => Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href]') || []);
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      if (event.key !== 'Tab') return;
      const all = focusable();
      if (event.shiftKey && document.activeElement === all[0]) { event.preventDefault(); all.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === all.at(-1)) { event.preventDefault(); all[0]?.focus(); }
    };
    document.addEventListener('keydown', keyboard);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', keyboard); previous?.focus(); };
  }, [close]);
  const save = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    try { await rename(name.trim()); setEditing(false); }
    catch (error) { notify((error as Error).message); }
    finally { setSaving(false); }
  };
  return <div className="drawer-scrim" onMouseDown={event => { if (event.currentTarget === event.target) close(); }}>
    <aside className="account-drawer" ref={panel} role="dialog" aria-modal="true" aria-labelledby="account-panel-title">
      <header className="drawer-top"><div><span className="drawer-kicker">QUOTA MANAGEMENT</span><h2 id="account-panel-title">Account details</h2></div><button className="icon-btn" aria-label="Close account panel" onClick={close}><X size={20} /></button></header>
      <div className="drawer-content">
        <label className="drawer-chooser">Account<div><Code2 size={16} /><Dropdown label="Account in panel" value={account.identity} onChange={choose} options={state.snapshot.accounts.map(row => ({ value: row.identity, label: label(row, state.settings) }))} /></div></label>
        <section className="drawer-identity"><span className="drawer-avatar"><Code2 size={27} /></span><div>{editing ? <form className="drawer-rename" onSubmit={event => { event.preventDefault(); void save(); }}><input autoFocus aria-label="Account name" maxLength={48} value={name} onChange={event => setName(event.target.value)} /><div><button type="submit" disabled={saving || !name.trim()}><Check size={14} /> {saving ? 'Saving…' : 'Save name'}</button><button type="button" disabled={saving} onClick={() => setEditing(false)}>Cancel</button></div></form> : <><h3>{displayName}<button className="icon-btn" aria-label="Rename account" onClick={() => setEditing(true)}><Pencil size={14} /></button></h3><p>{email(account, state.settings)}</p></>}<span className="drawer-plan">{account.plan}</span>{account.selected && <span className="drawer-selected"><Check size={11} /> Selected login</span>}</div></section>
        {preview && <div className="drawer-info sample-panel-note">Sample account. Sign-in and switching are available in the Windows app.</div>}
        <div className="drawer-section-heading"><h3>Quota remaining</h3><button disabled={working || preview} onClick={refresh}><RefreshCw size={13} className={state.refreshing ? 'spin' : ''} /> Refresh</button></div>
        <div className="drawer-quotas">{([{ duration: 300, name: '5h' }, { duration: 10080, name: '7 days' }]).map(item => {
          const quota = account.windows.find(window => window.durationMinutes === item.duration);
          const known = quota && !expired;
          return <div className="drawer-quota" key={item.duration}><div><span>{item.name}</span><strong>{known ? `${Math.round(quota.remainingPercent)}%` : '—'}</strong></div><div className="ledger-track"><div className={known ? health(quota.remainingPercent) : ''} style={{ width: known ? `${quota.remainingPercent}%` : 0 }} /></div><small>{known ? `Resets in ${countdown(quota.resetsAt)}` : expired ? 'Reconnect to see quota' : 'Not reported for this account'}</small></div>;
        })}</div>
        <dl className="drawer-facts"><div><dt>Credits</dt><dd>{account.credits === null ? 'Not reported' : account.credits.toLocaleString()}</dd></div><div><dt>Banked resets</dt><dd>{account.bankedResets ?? 'Not reported'}</dd></div><div><dt>Last reading</dt><dd>{age(account.fetchedAt)}</dd></div><div><dt>Connection</dt><dd className={account.status === 'ready' ? 'connected' : 'attention'}><i />{expired ? 'Reconnect needed' : account.status === 'stale' ? 'Last known reading' : account.status === 'ready' ? 'Connected' : account.status === 'api_key' ? 'API-key login' : 'Usage unavailable'}</dd></div></dl>
        {account.hint && <div className="drawer-info">{account.hint}</div>}
        <div className="drawer-security"><ShieldCheck size={17} /><div><strong>{preview ? 'Local-first by design' : 'Protected on this Windows account'}</strong><p>{preview ? 'Live accounts use Windows-encrypted credential backups.' : 'Saved credentials are encrypted with Windows DPAPI. Tokens never reach this interface.'}</p></div></div>
        <button className="drawer-remove" disabled={working || preview} onClick={remove}><Trash2 size={14} /> Remove from Quota management</button>
      </div>
      <footer className="drawer-footer">{expired ? <><button className="select-account-btn" disabled={working || preview} onClick={reconnect}>Reconnect this account <ExternalLink size={16} /></button><p>Sign in to the same account and workspace to restore its readings.</p></> : <><button className="select-account-btn" disabled={working || preview || (account.selected && !account.pendingLogin)} onClick={select}>{account.pendingLogin ? <>Apply reconnected login <ArrowRight size={16} /></> : account.selected ? <><Check size={16} /> Currently selected</> : <>Use this account <ArrowRight size={16} /></>}</button><p>{account.selected && !account.pendingLogin ? 'This login is already selected. Running Codex sessions keep their current account.' : 'Select for the next file-backed Codex launch. You’ll confirm before anything changes.'}</p></>}</footer>
    </aside>
  </div>;
}
