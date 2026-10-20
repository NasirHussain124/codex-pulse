import { useEffect, useState } from 'react';
import { ArrowRight, Check, Copy, ExternalLink, RefreshCw, ShieldCheck } from 'lucide-react';
import { api } from './api';
import type { Account, AppState, CurrentLogin, LoginStatus } from './types';
import { email, label } from './model';

export function AccountSignIn({ state, preview, target, saved, notify }: {
  state: AppState; preview: boolean; target?: Account;
  saved: (state: AppState) => void; notify: (message: string) => void;
}) {
  const [status, setStatus] = useState<LoginStatus>(state.login || { phase: 'idle' });
  const [current, setCurrent] = useState<CurrentLogin | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (state.login) setStatus(state.login); }, [state.login]);
  const active = ['starting', 'waiting', 'saving'].includes(status.phase);
  const check = async () => {
    setChecking(true);
    try { setCurrent(await api.current()); } catch { setCurrent({ available: false, message: 'Could not read the current login. Try signing in above.' }); }
    finally { setChecking(false); }
  };
  useEffect(() => { if (!preview) void check(); }, [preview]);
  const start = async (mode: 'browser' | 'device') => {
    try { setStatus(await api.startLogin(mode, target?.identity)); }
    catch (error) { notify((error as Error).message); }
  };
  const save = async () => {
    setSaving(true);
    try { saved(await api.addCurrent()); notify('Current Codex account saved securely.'); }
    catch (error) { notify((error as Error).message); }
    finally { setSaving(false); }
  };
  return <div className="account-signin">
    {target ? <p>Reconnect <strong>{label(target, state.settings)}</strong><br /><span>{email(target, state.settings)}</span>. Choose this same account and workspace in your browser.</p> : <p>Connect each account once. All saved accounts appear together, with their own quota and reset times.</p>}
    {preview && <div className="dialog-note"><ShieldCheck size={18} /><span>This browser is a sample preview. Sign-in and account management run in the Windows app, where credentials are encrypted locally.</span></div>}
    {!active && <><button className="solid-btn wide" disabled={preview || saving} onClick={() => void start('browser')}><ExternalLink size={15} /> {status.phase === 'success' ? 'Sign in to another account' : 'Sign in with ChatGPT'} <ArrowRight size={14} /></button><button className="outline-btn wide spaced" disabled={preview || saving} onClick={() => void start('device')}>Use a one-time device code instead</button></>}
    {status.phase !== 'idle' && <div className={`signin-status ${status.phase}`} role="status">
      <div>{active ? <RefreshCw className="spin" size={16} /> : status.phase === 'success' ? <Check size={16} /> : <ShieldCheck size={16} />}<span>{status.message}</span></div>
      {status.code && active && <><div className="device-code"><code>{status.code}</code><button className="icon-btn" aria-label="Copy device code" onClick={() => void navigator.clipboard.writeText(status.code!).then(() => notify('One-time code copied.')).catch(() => notify('Select and copy the code shown above.'))}><Copy size={16} /></button></div><button className="solid-btn wide" onClick={() => void api.openLoginPage().catch(error => notify(error.message))}>Open verification page <ExternalLink size={14} /></button><small>Device-code login must be enabled in your ChatGPT security or workspace settings.</small></>}
      {active && status.phase !== 'saving' && <button className="outline-btn wide spaced" onClick={() => void api.cancelLogin().then(setStatus).catch(error => notify(error.message))}>Cancel sign-in</button>}
      {status.phase === 'error' && <button className="text-link" onClick={() => void api.installCodex()}>Official Codex setup instructions <ExternalLink size={12} /></button>}
    </div>}
    <p className="fine-print"><ShieldCheck size={12} /> Sign-in is handled by the official Codex CLI. Choose the intended account and workspace in your browser. Pulse never asks for your password. Adding an account leaves your active Codex login unchanged.</p>
    {!target && <details className="existing-login"><summary>Already signed into Codex on this PC?</summary><div className="current-login">{checking ? <><RefreshCw size={15} className="spin" /> Checking login…</> : current?.available ? <><Check size={16} /><span>{state.settings.privacy ? 'Current account detected' : current.email}<small>{current.plan} · file-backed login</small></span></> : <span>{current?.message || 'No compatible login detected yet.'}</span>}</div><div className="existing-actions"><button className="outline-btn" disabled={preview || checking || active || saving} onClick={() => void check()}><RefreshCw size={13} /> Check again</button><button className="solid-btn" disabled={preview || !current?.available || active || saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save current login'}</button></div><p className="fine-print">Keyring-only logins cannot be imported. Use the sign-in button above instead.</p></details>}
  </div>;
}
