import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Activity, ArrowDownToLine, ArrowRight, Check, ChevronDown, ChevronUp, Code2, Ellipsis, Eye, EyeOff, Monitor, Plus, RefreshCw, Search, Settings2, ShieldCheck, Smartphone, X } from 'lucide-react';
import type { Account, AppState, QuotaWindow, Settings } from './types';
import { api } from './api';
import { AccountSignIn } from './AccountSignIn';
import { AccountDrawer } from './AccountDrawer';
import { Dropdown } from './Dropdown';
import { connectState } from './stateSync';
import { QuotaMark } from './QuotaMark';
import { QuotaPills, QuotaWidget } from './QuotaWidget';
import { MobilePairing } from './MobilePairing';
import { demoState } from './demo';
import { age, countdown, email, label, lowest } from './model';
import { estimateDrain, project, readingsFor } from './forecast';

type DialogState = { kind: 'add'; account?: Account } | { kind: 'import' | 'settings' | 'widgets' | 'mobile' } | { kind: 'switch' | 'remove'; account: Account } | null;
const isWidget = new URLSearchParams(location.search).has('widget');
const timeLabel = (value: string | null) => value ? new Date(value).toLocaleString('en', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : 'Reset not reported';
const health = (remaining: number) => remaining <= 10 ? 'red' : remaining <= 30 ? 'amber' : 'green';

function Dialog({ title, children, close, busy }: { title: string; children: ReactNode; close: () => void; busy: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prior = document.activeElement as HTMLElement;
    const elements = () => Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input,select') || []);
    elements()[0]?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) close();
      if (event.key !== 'Tab') return;
      const all = elements();
      if (event.shiftKey && document.activeElement === all[0]) { event.preventDefault(); all.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === all.at(-1)) { event.preventDefault(); all[0]?.focus(); }
    };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); prior?.focus(); };
  }, [busy, close]);
  return <div className="dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) close(); }}><div className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title" ref={ref}><header><h2 id="dialog-title">{title}</h2><button className="icon-btn" aria-label="Close dialog" disabled={busy} onClick={close}><X size={18} /></button></header>{children}</div></div>;
}

function QuotaCell({ window, kind, reconnect = false }: { window?: QuotaWindow; kind: 'weekly' | 'five_hour'; reconnect?: boolean }) {
  return <div className={`quota-cell ${!window || reconnect ? 'unknown' : ''}`}><div className="quota-title"><span>{kind === 'weekly' ? '7-day limit' : '5-hour limit'}</span><strong>{window && !reconnect ? `${Math.round(window.remainingPercent)}%` : '—'}</strong></div><div className="ledger-track"><div className={window ? health(window.remainingPercent) : ''} style={{ width: window && !reconnect ? `${window.remainingPercent}%` : 0 }} /></div><div className="reset-caption">{window && !reconnect ? <>in {countdown(window.resetsAt)} <span>· {timeLabel(window.resetsAt)}</span></> : reconnect ? 'Reconnect to see usage' : 'Not reported for this account'}</div></div>;
}

function ForecastChart({ state, identity, setIdentity }: { state: AppState; identity: string; setIdentity: (identity: string) => void }) {
  const [windowId, setWindowId] = useState('weekly');
  const [tab, setTab] = useState<'remaining' | 'drain'>('remaining');
  const [horizon, setHorizon] = useState(168);
  const [expanded, setExpanded] = useState(true);
  const [forecast, setForecast] = useState(true);
  const [forecastSettings, setForecastSettings] = useState(false);
  const account = state.snapshot.accounts.find(a => a.identity === identity) || state.snapshot.accounts.find(a => a.selected) || state.snapshot.accounts[0];
  const window = account?.windows.find(w => windowId === 'weekly' ? w.durationMinutes === 10080 : w.id === windowId);
  const readings = readingsFor(state.history, account, window?.id || windowId);
  const rate = account?.status === 'ready' && account.fetchedAt && Date.now() - new Date(account.fetchedAt).getTime() <= 300000 ? estimateDrain(readings) : null;
  const now = Date.now(), end = now + horizon * 3600000, start = now - 48 * 3600000;
  const points = readings.filter(point => point.at >= start && point.at <= now);
  const projection = forecast ? project(window, rate, now, end) : [];
  const x = (at: number) => 980 * (at - start) / (end - start) + 10;
  const y = (remaining: number) => 186 - remaining * 1.8;
  const observed = points.map(point => `${x(point.at)},${y(point.remaining)}`).join(' ');
  const projected = projection.map(point => `${x(point.at)},${y(point.remaining)}`).join(' ');
  const drainPoints = points.flatMap((point, i) => {
    if (!i) return [];
    const previous = points[i - 1]; const hours = (point.at - previous.at) / 3600000;
    return hours >= .25 && previous.remaining >= point.remaining ? [{ at: point.at, rate: (previous.remaining - point.remaining) / hours }] : [];
  });
  const maxRate = Math.max(1, ...drainPoints.map(p => p.rate));
  const emptyAt = rate !== null && window ? now + window.remainingPercent / rate * 3600000 : null;
  const depletionLabel = emptyAt !== null && window?.resetsAt && emptyAt >= new Date(window.resetsAt).getTime() ? 'after next reset' : emptyAt !== null && emptyAt <= end ? new Date(emptyAt).toLocaleString('en', { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : 'outside forecast range';
  return <section className="forecast-section"><div className="chart-context"><span>ACCOUNT FORECAST</span><span>{account ? label(account, state.settings) : 'No account selected'} · {windowId === 'weekly' ? 'Weekly window' : '5-hour window'}</span></div><div className="capacity-heading"><div><strong>{window ? `${Math.round(window.remainingPercent)}%` : '—'}</strong><span> / 100% remaining</span><small>{rate === null ? 'Collecting drain-rate history' : `~${rate.toFixed(2)}% per hour`}</small></div><div className="chart-selectors"><Dropdown label="Chart account" value={account?.identity || ''} onChange={setIdentity} placeholder="Select account" options={state.snapshot.accounts.map(a => ({ value: a.identity, label: label(a, state.settings) }))} /><Dropdown label="Chart quota window" value={windowId} onChange={setWindowId} options={[{ value: 'weekly', label: '7-day limit' }, { value: 'five_hour', label: '5-hour limit' }]} /><button className="icon-btn" aria-label={expanded ? 'Collapse chart' : 'Expand chart'} onClick={() => setExpanded(!expanded)}>{expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</button></div></div>
    {expanded && <><div className="chart-tabs"><button aria-pressed={tab === 'remaining'} className={tab === 'remaining' ? 'active' : ''} onClick={() => setTab('remaining')}>Remaining quota</button><button aria-pressed={tab === 'drain'} className={tab === 'drain' ? 'active' : ''} onClick={() => setTab('drain')}>Drain rate</button></div><div className="chart-legend"><span><i /> {tab === 'remaining' ? 'Remaining' : 'Observed drain'}</span>{tab === 'remaining' && <span className="projected-key">┄ Projected <small>(estimate)</small></span>}<label>Next <Dropdown label="Forecast horizon" value={horizon} onChange={value => setHorizon(Number(value))} options={[{ value: '24', label: '24 hours' }, { value: '72', label: '3 days' }, { value: '168', label: '7 days' }]} /></label></div>
      <div className="chart-layout"><div className="y-labels">{[100, 75, 50, 25, 0].map(value => <span key={value}>{tab === 'remaining' ? `${value}%` : `${(maxRate * value / 100).toFixed(1)}%/h`}</span>)}</div><div className="chart-area"><svg viewBox="0 0 1000 192" preserveAspectRatio="none" role="img" aria-label={tab === 'remaining' ? 'Recorded remaining quota with estimated future resets' : 'Observed capacity drain per hour'}><defs><linearGradient id="capacity-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#d27d59" stopOpacity=".27" /><stop offset="100%" stopColor="#d27d59" stopOpacity="0" /></linearGradient></defs>{[6, 51, 96, 141, 186].map(yValue => <line key={yValue} x1="0" x2="1000" y1={yValue} y2={yValue} className="chart-grid" />)}<line x1={x(now)} x2={x(now)} y1="6" y2="186" className="now-line" /><text x={x(now) + 6} y="17" className="now-label">Now</text>{tab === 'remaining' ? <>{points.length > 1 && <polygon points={`${x(points[0].at)},186 ${observed} ${x(points.at(-1)!.at)},186`} fill="url(#capacity-fill)" />}<polyline points={observed} className="actual-line" />{points.length === 1 && <circle cx={x(points[0].at)} cy={y(points[0].remaining)} r="3" fill="#d27d59" />}{projection.length > 1 && <polygon points={`${x(projection[0].at)},186 ${projected} ${x(projection.at(-1)!.at)},186`} fill="url(#capacity-fill)" opacity=".35" />}<polyline points={projected} className="forecast-line" /></> : <polyline className="actual-line" points={drainPoints.map(point => `${x(point.at)},${186 - point.rate / maxRate * 180}`).join(' ')} />}</svg>
        {(!points.length || (tab === 'drain' && !drainPoints.length)) && <div className="chart-empty"><Activity size={20} /><span>{tab === 'drain' ? 'More recorded readings are needed to estimate drain.' : 'Your first successful reading will start this chart.'}</span></div>}<div className="x-labels">{[0, .25, .5, .75, 1].map(part => <span key={part}>{new Date(start + (end - start) * part).toLocaleDateString('en', { month: 'short', day: 'numeric' })}</span>)}</div></div></div>
      <div className="forecast-footer"><span>{rate !== null && window ? <>Estimated empty: <strong>{depletionLabel}</strong></> : 'Forecast starts after 2 readings at least 15 minutes apart.'}</span><span>Next reset <strong>{window ? countdown(window.resetsAt) : '—'}</strong></span><button className="forecast-settings-toggle" aria-expanded={forecastSettings} onClick={() => setForecastSettings(!forecastSettings)}><Settings2 size={13} /> Forecast settings {forecastSettings ? <ChevronUp size={12} /> : <ChevronDown size={12} />}</button></div>{forecastSettings && <div className="forecast-settings"><label><input type="checkbox" checked={forecast} onChange={event => setForecast(event.target.checked)} /> Show estimated projection</label><p>Estimates use this account’s recorded drain rate and reported reset time. They do not combine quota across accounts.</p></div>}</>}
  </section>;
}

export default function LedgerApp() {
  const [live, setLive] = useState<AppState | null>(null);
  const [preview, setPreview] = useState(!window.pulse || new URLSearchParams(location.search).has('demo'));
  const demo = useMemo(() => demoState(Boolean(window.pulse)), []);
  const [previewSettings, setPreviewSettings] = useState(demo.settings);
  const [search, setSearch] = useState(''); const [sort, setSort] = useState('default');
  const [dialog, setDialog] = useState<DialogState>(null);
  const [busy, setBusy] = useState(false); const [notice, setNotice] = useState('');
  const [menu, setMenu] = useState<string | null>(null);
  const [panelIdentity, setPanelIdentity] = useState<string | null>(null);
  const [chartIdentity, setChartIdentity] = useState('');
  const closePanel = useCallback(() => setPanelIdentity(null), []);
  const openPanel = (account: Account) => { setPanelIdentity(account.identity); setChartIdentity(account.identity); setMenu(null); };
  const panelDialog = (kind: 'switch' | 'add' | 'remove', account: Account) => { setPanelIdentity(null); setDialog({ kind, account }); };
  const [, tick] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const state = preview ? { ...demo, settings: previewSettings } : live;
  const close = useCallback(() => {
    if (live?.login?.phase === 'saving') return;
    if (['waiting', 'starting'].includes(live?.login?.phase || '')) void api.cancelLogin().catch(() => {});
    setDialog(null);
  }, [live?.login?.phase]);

  useEffect(() => {
    const connection = connectState(api, next => { setLive(next); if (next.demo) setPreview(true); }, () => {
      setLive(previous => previous || { ...demo, demo: false, initialized: false, snapshot: { ...demo.snapshot, generatedAt: null, accounts: [] }, engineError: 'The saved account list could not be loaded. Your credentials have not been deleted.' });
    });
    const sync = () => { if (!document.hidden) void connection.sync(); };
    window.addEventListener('focus', sync); document.addEventListener('visibilitychange', sync);
    const timer = window.setInterval(sync, 15000);
    return () => { connection.dispose(); window.removeEventListener('focus', sync); document.removeEventListener('visibilitychange', sync); clearInterval(timer); };
  }, [demo]);
  useEffect(() => {
    if (live && !preview) void api.reportView?.(live.snapshot.accounts.length, live.revision || 0).catch(() => {});
  }, [live?.revision, live?.snapshot.accounts.length, preview]);

  useEffect(() => { const timer = setInterval(() => tick(n => n + 1), 30000); return () => clearInterval(timer); }, []);
  useEffect(() => { const timer = setTimeout(() => setNotice(''), 6500); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => { document.documentElement.dataset.theme = 'dark'; }, []);
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); searchRef.current?.focus(); } if (event.key === 'Escape') setMenu(null); };
    const outside = (event: MouseEvent) => { if (!(event.target as HTMLElement).closest('[data-menu]')) setMenu(null); };
    document.addEventListener('keydown', key); document.addEventListener('mousedown', outside);
    return () => { document.removeEventListener('keydown', key); document.removeEventListener('mousedown', outside); };
  }, []);
  const update = async (patch: Partial<Settings>) => {
    if (!state) return;
    if (preview) { setPreviewSettings(previous => ({ ...previous, ...patch })); return; }
    const settings = await api.saveSettings(patch); setLive(previous => previous ? { ...previous, settings } : previous);
  };
  const act = async (fn: () => Promise<unknown>, message?: string, dismiss = true) => { setBusy(true); try { await fn(); if (message) setNotice(message); if (dismiss) setDialog(null); } catch (error) { setNotice((error as Error).message.replace(/^Error invoking remote method '[^']+': Error: /, '')); } finally { setBusy(false); } };
  const refresh = async (id?: string) => {
    if (preview) { setNotice('Sample preview. Connect accounts in the Windows app for live quota.'); return; }
    await act(async () => { const next = id ? await api.refreshAccount(id) : await api.refresh(); setLive(next); if (next.engineError) throw new Error(next.engineError); }, undefined, false);
  };

  if (state?.initialized === false && !state.snapshot.accounts.length) return <div className="startup" role="status"><Code2 size={28} /><h1>Reconnect your saved accounts</h1><p>{state.engineError || 'Loading the local account vault…'}</p><button className="solid-btn" disabled={busy} onClick={() => void refresh()}><RefreshCw size={15} /> Retry loading accounts</button><small>Your stored logins are kept. You do not need to add them again.</small></div>;
  if (!state) return <div className="startup"><Code2 size={28} /><h1>Quota management</h1><p>opening account monitor…</p><RefreshCw size={16} className="spin" /></div>;
  const accounts = state.snapshot.accounts;
  const visible = accounts.filter(account => `${label(account, state.settings)} ${account.email} ${account.plan}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => sort === 'remaining' ? (lowest(b) ?? -1) - (lowest(a) ?? -1) : sort === 'name' ? label(a, state.settings).localeCompare(label(b, state.settings)) : Number(b.selected) - Number(a.selected) || Number(a.id) - Number(b.id));
  const ready = accounts.filter(a => a.status === 'ready' && (lowest(a) ?? 0) > 0).length;
  const panelAccount = accounts.find(account => account.identity === panelIdentity);
  const renameAccount = async (name: string) => {
    if (!panelAccount) return;
    await update({ accounts: { ...state.settings.accounts, [panelAccount.identity]: { ...state.settings.accounts[panelAccount.identity], label: name, pinned: false } } });
    setNotice('Account name saved.');
  };
  const changeSettings = (patch: Partial<Settings>) => void act(() => update(patch), undefined, false);

  return <div className={`ledger-app ${isWidget ? 'widget-mode' : ''}`}>
    {isWidget ? <div inert={Boolean(panelAccount)}><QuotaWidget state={state} preview={preview} busy={busy} open={openPanel} settings={changeSettings} refresh={() => void refresh()} add={() => setDialog({ kind: 'add' })} configure={() => setDialog({ kind: 'settings' })} privacy={() => changeSettings({ privacy: !state.settings.privacy })} dashboard={() => void api.openDashboard()} /></div> : <>
    <header className="app-topbar" inert={Boolean(panelAccount)}><div className="app-brand"><QuotaMark size={29} /><strong>Quota management</strong></div><div className="app-top-actions"><button onClick={() => setDialog({ kind: 'widgets' })}><Monitor size={15} /> Desktop widget</button><button onClick={() => void act(() => api.openUsage(), undefined, false)}>Official usage <ArrowRight size={14} /></button><span className="top-separator" /><button className="icon-btn" aria-label="Settings" onClick={() => setDialog({ kind: 'settings' })}><Settings2 size={17} /></button></div></header>
    <main className="monitor-content" inert={Boolean(panelAccount)}>
      {<div className="companion-shortcut"><button onClick={() => setDialog({ kind: 'mobile' })}><Smartphone size={14} /> Phone companion <span>NEW</span></button></div>}
      {<><div className="page-heading"><div><h1>Quota management</h1><p><i /><span>{accounts.length} account{accounts.length === 1 ? '' : 's'}</span><b>·</b><span className="connected-count">{ready} available</span></p></div><div className="page-actions"><button className="email-toggle" aria-label={state.settings.privacy ? 'Show email addresses' : 'Hide email addresses'} onClick={() => changeSettings({ privacy: !state.settings.privacy })}>{state.settings.privacy ? <Eye size={15} /> : <EyeOff size={15} />}{state.settings.privacy ? 'Show emails' : 'Hide emails'}</button><button className="add-control header-add" onClick={() => setDialog({ kind: 'add' })}><Plus size={15} /> Add account</button><button className="refresh-all" disabled={state.refreshing || busy} onClick={() => void refresh()}><RefreshCw size={16} className={state.refreshing ? 'spin' : ''} />{state.refreshing ? 'Refreshing accounts…' : 'Refresh all accounts'}</button></div></div><nav className="provider-navigation" aria-label="Codex accounts"><button className="provider-tab" aria-current="page" aria-haspopup="dialog" disabled={!accounts.length} onClick={() => openPanel(accounts.find(account => account.selected) || accounts[0])}><span className="codex-mark"><Code2 size={17} /></span>Codex<span className="provider-count">{accounts.length}</span></button><span className="provider-local"><ShieldCheck size={12} /> Local, encrypted accounts</span></nav></>}
      {state.demo && <div className="sample-notice"><span>PREVIEW</span> Sample accounts · no live credentials connected{window.pulse && !live?.demo && <button onClick={() => setPreview(false)}>Return to my accounts <ArrowRight size={12} /></button>}</div>}
      {state.engineError && !preview && <div className="engine-error" role="alert"><Activity size={15} /><span>{state.engineError}</span><button onClick={() => void refresh()}>Retry</button></div>}
      {<ForecastChart state={state} identity={chartIdentity} setIdentity={setChartIdentity} />}
      <div className="ledger-controls"><label className="account-search"><Search size={16} /><input ref={searchRef} aria-label="Search accounts" placeholder="Search by account name or email" value={search} onChange={event => setSearch(event.target.value)} /><kbd>Ctrl K</kbd></label><div><span className="ledger-mode-label">Ledger</span><Dropdown label="Sort accounts" value={sort} onChange={setSort} options={[{ value: 'default', label: 'Selected first' }, { value: 'remaining', label: 'Most remaining' }, { value: 'name', label: 'Name A–Z' }]} /></div></div>
      {<div className="provider-summary"><div><span className="codex-mark"><Code2 size={16} /></span><strong>Codex</strong><span>{accounts.length} saved account{accounts.length === 1 ? '' : 's'}</span></div><footer><span>{ready} available <i>·</i> {accounts.length - ready} unavailable</span><span>Click an account to manage <ArrowRight size={12} /></span></footer></div>}
      {!accounts.length ? <div className="empty-monitor"><Code2 size={28} /><h1>All your Codex accounts, together.</h1><p>Sign in with ChatGPT to add each account, or import your existing ccswap accounts.</p><button className="solid-btn" onClick={() => setDialog({ kind: 'add' })}><Plus size={15} /> Add your first account</button><div><button onClick={() => setDialog({ kind: 'import' })}>Import from ccswap</button><span>·</span><button onClick={() => setPreview(true)}>Explore sample accounts</button></div><small><ShieldCheck size={13} /> Saved credentials are encrypted for your Windows account.</small></div> : !visible.length ? <div className="no-matches">No accounts match “{search}”. <button onClick={() => setSearch('')}>Clear search</button></div> : <section className="ledger-list" aria-label="All saved Codex accounts">{visible.map(account => {
        const weekly = account.windows.find(w => w.durationMinutes === 10080);
        const session = account.windows.find(w => w.durationMinutes === 300);
        const reconnect = account.status === 'reconnect';
        return <article data-account-card className={`account-entry ${reconnect ? 'needs-login' : ''} ${account.selected ? 'selected-entry' : ''}`} key={account.identity} data-panel-selected={panelIdentity === account.identity} onClick={event => { if (!(event.target as HTMLElement).closest('button, input, select, a')) openPanel(account); }}>
          <div className="entry-identity"><div><span className="codex-mark"><Code2 size={14} /></span><button className="account-name" onClick={() => openPanel(account)}>{label(account, state.settings)}</button>{account.selected && <span className="active-marker"><i /> active</span>}</div><p>{email(account, state.settings)}<span className="plan-label">{account.plan}</span>{reconnect && <span className="needs-login-label"> · reconnect needed</span>}</p><small>Last seen {age(account.fetchedAt)}{account.status === 'stale' && <span> · last known reading</span>}</small></div>
          {<><QuotaCell window={weekly} kind="weekly" reconnect={reconnect} /><QuotaCell window={session} kind="five_hour" reconnect={reconnect} /><div className="credit-cell"><div><span>Credits</span><strong>{account.credits === null ? '—' : account.credits.toLocaleString()}</strong></div><div><span>Banked resets</span><strong>{account.bankedResets ?? '—'}</strong></div><small>{account.status === 'api_key' ? 'API-key login · no plan quota' : 'Reported separately from quota'}</small></div></>}
          <div className="entry-actions"><button disabled={state.refreshing || busy || preview} onClick={() => void refresh(account.id)} title="Refresh this account’s quota"><RefreshCw size={13} /> Refresh quota</button>{reconnect ? <button disabled={preview} onClick={() => setDialog({ kind: 'add', account })}>Reconnect <ArrowRight size={13} /></button> : <button disabled={(account.selected && !account.pendingLogin) || preview || busy} onClick={() => openPanel(account)}>{account.pendingLogin ? <>Apply new login <ArrowRight size={13} /></> : account.selected ? <><Check size={13} /> Selected for launch</> : <>Use account <ArrowRight size={13} /></>}</button>}<div className="account-menu-wrap" data-menu><button className="icon-btn" aria-label={`Options for ${label(account, state.settings)}`} aria-expanded={menu === account.id} onClick={() => setMenu(menu === account.id ? null : account.id)}><Ellipsis size={17} /></button>{menu === account.id && <div className="account-menu"><button onClick={() => { setMenu(null); openPanel(account); }}>Open account panel</button><button disabled={preview} onClick={() => { setMenu(null); setDialog({ kind: 'remove', account }); }}>Remove from Quota management</button></div>}</div></div>
        </article>;
      })}</section>}
      <footer className="monitor-footer"><span><i className={state.engineError ? 'disconnected' : ''} /> {preview ? 'sample workspace' : state.refreshing ? 'refreshing quota…' : 'local collector'} <span>·</span> {age(state.snapshot.generatedAt)}</span><span>percentages show remaining capacity <span>·</span> ccswap 0.39.2</span></footer>
    </main></>}
    {panelAccount && <AccountDrawer account={panelAccount} state={state} preview={preview} busy={busy} close={closePanel} choose={identity => { setPanelIdentity(identity); setChartIdentity(identity); }} rename={renameAccount} refresh={() => void refresh(panelAccount.id)} select={() => panelDialog('switch', panelAccount)} reconnect={() => panelDialog('add', panelAccount)} remove={() => panelDialog('remove', panelAccount)} notify={setNotice} />}
    {notice && <div className="toast" role="status"><Activity size={15} /><span>{notice}</span><button className="icon-btn" aria-label="Dismiss message" onClick={() => setNotice('')}><X size={14} /></button></div>}
    {dialog && <Dialog title={dialog.kind === 'add' ? 'Add a Codex account' : dialog.kind === 'import' ? 'Import from ccswap' : dialog.kind === 'switch' ? 'Select account for next launch' : dialog.kind === 'remove' ? 'Remove saved account' : dialog.kind === 'mobile' ? 'Phone companion' : dialog.kind === 'widgets' ? 'Desktop widget' : 'Monitor settings'} close={close} busy={busy || state.login?.phase === 'saving'}>
      {dialog.kind === 'mobile' && <MobilePairing preview={preview} />}
      {dialog.kind === 'add' && <><AccountSignIn state={state} preview={preview} target={dialog.account} saved={setLive} notify={setNotice} />{preview && window.pulse && !live?.demo && <button className="outline-btn wide" onClick={() => { setPreview(false); close(); }}>Return to my real accounts</button>}<div className="dialog-rule" /><button className="outline-btn wide" disabled={preview || ['starting', 'waiting', 'saving'].includes(state.login?.phase || '')} onClick={() => setDialog({ kind: 'import' })}>Import existing ccswap accounts <ArrowRight size={14} /></button></>}
      {dialog.kind === 'import' && <><p>Bring your saved Codex accounts into the encrypted vault. Existing accounts are skipped, and original ccswap backups stay in place.</p><div className="dialog-note"><ShieldCheck size={17} /> Importing does not switch your active Codex login.</div><button className="solid-btn wide" disabled={busy || preview} onClick={() => void act(async () => { const result = await api.importExisting(); setLive(result.state); setNotice(`${result.imported} accounts imported.`); })}>{busy ? 'Importing…' : 'Import saved Codex accounts'}</button></>}
      {dialog.kind === 'switch' && <><p>Select <strong>{label(dialog.account, state.settings)}</strong> for compatible file-backed Codex launches.</p><div className="dialog-note"><ShieldCheck size={17} /><span>This selects the Codex auth file. It does not confirm the account inside ChatGPT or the desktop app.</span></div><div className="switch-steps"><span><b>1</b> Save any active Codex work.</span><span><b>2</b> Select the login below.</span><span><b>3</b> Restart your compatible CLI/IDE and check its signed-in account.</span></div><p className="fine-print">ChatGPT/Codex desktop may use a separate credential store. Restarting alone cannot guarantee a switch. Quota management does not force-close work or modify the desktop app’s private login store. Use its own account menu when needed.</p><button className="solid-btn wide" disabled={busy || preview} onClick={() => void act(async () => { setLive(await api.switchAccount(dialog.account.id)); }, 'File-backed login selected. Desktop ChatGPT account is not verified.')}>{busy ? 'Selecting…' : 'Select file-backed Codex login'} <ArrowRight size={14} /></button></>}
      {dialog.kind === 'remove' && <><p>Remove <strong>{label(dialog.account, state.settings)}</strong> and its encrypted backup from Quota management. Your active Codex login and original ccswap data stay in their existing locations.</p><button className="danger-btn wide" disabled={busy || preview} onClick={() => void act(async () => { setLive(await api.removeAccount(dialog.account.id)); }, 'Saved account removed from Quota management.')}>Remove from Quota management</button></>}
      {dialog.kind === 'settings' && <><p>Accounts are checked by one local collector. Credentials never reach this interface.</p><div className="setting"><span>Refresh interval</span><Dropdown label="Refresh interval" value={state.settings.interval} onChange={value => changeSettings({ interval: Number(value) })} options={[{ value: '120', label: '2 minutes' }, { value: '300', label: '5 minutes' }, { value: '600', label: '10 minutes' }]} /></div>{([
        ['privacy', 'Mask email addresses'], ['notifications', 'Low-quota notifications'], ['closeToTray', 'Keep running in the system tray'], ['widgetTop', 'Keep desktop widget on top'], ['startAtLogin', 'Start at Windows sign-in'],
      ] as const).map(([key, title]) => <label className="setting" key={key}><span>{title}</span><input type="checkbox" checked={state.settings[key]} disabled={key === 'startAtLogin' && (!state.desktop || preview)} onChange={event => changeSettings({ [key]: event.target.checked })} /></label>)}<div className="setting"><span>Notify below</span><Dropdown label="Notification threshold" value={state.settings.threshold} onChange={value => changeSettings({ threshold: Number(value) })} options={[10, 20, 30].map(n => ({ value: String(n), label: n + '% remaining' }))} /></div><div className="dialog-rule" /><button className="outline-btn wide" disabled={preview} onClick={() => void act(async () => { if (await api.exportHistory()) setNotice('Usage history exported.'); }, undefined, false)}><ArrowDownToLine size={14} /> Export local usage history</button><button className="outline-btn wide spaced" disabled={preview || busy || !api.quit} onClick={() => void api.quit?.()}>Quit Quota management</button><p className="fine-print">Quota management {state.version} · ccswap 0.39.2 · Windows DPAPI vault.<br />Quota endpoints depend on the upstream ccswap integration.</p></>}
      {dialog.kind === 'widgets' && <><p>Your Codex accounts in one glanceable window, with filled quota bars and reset times.</p><div className="widget-design-preview"><QuotaPills accounts={accounts.slice(0, 4)} settings={state.settings} open={account => { close(); openPanel(account); }} /></div><div className="setting"><span>Widget quota window</span><Dropdown label="Widget quota window" value={state.settings.widgetWindow} onChange={value => changeSettings({ widgetWindow: value as Settings['widgetWindow'] })} options={[{ value: 'weekly', label: '7-day limit' }, { value: 'five_hour', label: '5-hour limit' }]} /></div><button className="solid-btn wide spaced" onClick={() => void api.openWidget()}><Monitor size={15} /> Open desktop widget</button><p className="fine-print">For Android pairing and native phone widgets, open Phone companion in the dashboard. iPhone widgets and internet relay are not included.</p></>}
    </Dialog>}
  </div>;
}
