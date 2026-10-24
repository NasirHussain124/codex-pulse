import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Activity, ArrowDownToLine, ArrowRight, Check, ChevronDown, ChevronUp, Code2, Ellipsis, Eye, EyeOff, Monitor, Plus, RefreshCw, Search, Settings2, ShieldCheck, Smartphone, X } from 'lucide-react';
import type { Account, AppState, Settings, OtherProvider, OtherProviders, ProviderConnection } from './types';
import { api } from './api';
import { ledgerQuota } from './ledgerModel';
import { AccountSignIn } from './AccountSignIn';
import { AccountDrawer } from './AccountDrawer';
import { Dropdown } from './Dropdown';
import { connectState } from './stateSync';
import { QuotaMark } from './QuotaMark';
import { ProviderMark } from './ProviderMark';
import { QuotaPills, QuotaWidget, QuickView } from './QuotaWidget';
import { MobilePairing } from './MobilePairing';
import { demoState } from './demo';
import { age, countdown, email, label, lowest } from './model';
import { ForecastChart } from './ForecastChart';
import { RecommendationPanel } from './RecommendationPanel';
import { RecoveryTools } from './RecoveryTools';
import { ProviderConnect, ProviderConnections, ProviderDrawer, providerNames } from './ProviderConnections';
import { providerDemo } from './providerDemo';

type DialogState = { kind: 'add'; account?: Account } | { kind: 'provider'; connection?: ProviderConnection; provider?: OtherProvider } | { kind: 'import' | 'settings' | 'widgets' | 'mobile' } | { kind: 'switch' | 'remove'; account: Account } | null;
const isWidget = new URLSearchParams(location.search).has('widget');
const isQuick = new URLSearchParams(location.search).has('quick');
const timeLabel = (value: string | null) => value ? new Date(value).toLocaleString('en', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : 'Reset not reported';
const health = (remaining: number) => remaining <= 10 ? 'red' : remaining <= 30 ? 'amber' : 'green';

function Dialog({ title, children, close, busy }: { title: string; children: ReactNode; close: () => void; busy: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prior = document.activeElement as HTMLElement;
    const elements = () => Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href]') || []);
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

function QuotaCell({ account, kind, name, open }: { account: Account; kind: 'weekly' | 'five_hour'; name: string; open: () => void }) {
  const reading = ledgerQuota(account, kind === 'five_hour' ? 300 : 10080);
  const period = kind === 'five_hour' ? '5h' : '7 days';
  return <button type="button" className={`quota-cell ${reading.percent === null ? 'unknown' : ''}`} data-window={kind} data-remaining={reading.percent ?? ''} onClick={open}
    aria-label={`${name}, ${period}: ${reading.percent === null ? 'quota not reported' : Math.round(reading.percent) + ' percent remaining'}. ${reading.caption}. Open account details`} title={reading.resetsAt ? `Next reset · ${timeLabel(reading.resetsAt)}` : reading.caption}>
    <span className="quota-title"><span>{period}</span><strong>{reading.percent === null ? '—' : <>{Math.round(reading.percent)}<small>%</small></>}</strong></span>
    <span className="ledger-track" aria-hidden="true"><i className={reading.percent === null ? '' : health(reading.percent)} style={{ width: `${reading.percent ?? 0}%` }} /></span>
    <span className="reset-caption">{reading.caption}</span>
  </button>;
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
  const [providerPanelId, setProviderPanelId] = useState<string | null>(null);
  const [showProviderSamples, setShowProviderSamples] = useState(false);
  const sampleProviders = useMemo(() => providerDemo(previewSettings.privacy), [previewSettings.privacy]);
  const closeProviderPanel = useCallback(() => setProviderPanelId(null), []);
  const [chartIdentity, setChartIdentity] = useState('');
  const closePanel = useCallback(() => setPanelIdentity(null), []);
  useEffect(() => api.onOpenAccount?.(identity => { setDialog(null); setProviderPanelId(null); setPanelIdentity(identity); }), []);
  const openPanel = (account: Account) => { setProviderPanelId(null); setPanelIdentity(account.identity); setMenu(null); };
  const openProvider = (id: string) => { setPanelIdentity(null); setProviderPanelId(id); setMenu(null); };
  const addProvider = (provider?: OtherProvider) => { setProviderPanelId(null); setPanelIdentity(null); setDialog({ kind: 'provider', provider }); };
  const panelDialog = (kind: 'switch' | 'add' | 'remove', account: Account) => { setPanelIdentity(null); setDialog({ kind, account }); };
  const [, tick] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const state = preview ? { ...demo, settings: previewSettings, providers: showProviderSamples ? sampleProviders : undefined } : live;
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
    const key = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); searchRef.current?.focus(); } if (event.key === 'Escape') { setMenu(null); if (isQuick) void api.closeQuickView(); } };
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
  const providerPanel = state.providers?.connections.find(row => row.id === providerPanelId);
  const overlayOpen = Boolean(panelAccount || providerPanel);
  const updateProviders = (providers: OtherProviders) => setLive(previous => previous ? { ...previous, providers } : previous);
  const renameAccount = async (name: string) => {
    if (!panelAccount) return;
    await update({ accounts: { ...state.settings.accounts, [panelAccount.identity]: { ...state.settings.accounts[panelAccount.identity], label: name, pinned: state.settings.accounts[panelAccount.identity]?.pinned ?? false } } });
    setNotice('Account name saved.');
  };
  const changeSettings = (patch: Partial<Settings>) => void act(() => update(patch), undefined, false);

  if (isQuick) return <div className="ledger-app quick-mode"><QuickView state={state} preview={preview} busy={busy} refresh={() => void refresh()} close={() => void api.closeQuickView()} pin={() => void api.openWidget()} dashboard={() => void api.openDashboard()} /></div>;

  return <div className={`ledger-app ${isWidget ? 'widget-mode' : 'dashboard-v2'} ${state.settings.compact ? 'compact-density' : ''}`}>
    {isWidget ? <div inert={overlayOpen}><QuotaWidget state={state} preview={preview} busy={busy} open={openPanel} settings={changeSettings} refresh={() => void refresh()} add={() => setDialog({ kind: 'add' })} configure={() => setDialog({ kind: 'settings' })} privacy={() => changeSettings({ privacy: !state.settings.privacy })} dashboard={() => void api.openDashboard()} /></div> : <>
    <header className="app-topbar" inert={overlayOpen}><div className="app-brand"><QuotaMark size={29} /><strong>Quota management</strong></div><div className="app-top-actions"><button onClick={() => void api.openQuickView()}><Activity size={15} /> Quick view</button><button onClick={() => setDialog({ kind: 'widgets' })}><Monitor size={15} /> Desktop widget</button><button onClick={() => void act(() => api.openUsage(), undefined, false)}>Official usage <ArrowRight size={14} /></button><span className="top-separator" /><button className="icon-btn" aria-label="Settings" onClick={() => setDialog({ kind: 'settings' })}><Settings2 size={17} /></button></div></header>
    <main className="monitor-content" inert={overlayOpen}>
      {<div className="companion-shortcut"><button onClick={() => setDialog({ kind: 'mobile' })}><Smartphone size={14} /> Phone companion <span>NEW</span></button></div>}
      {<><div className="page-heading"><div><h1>Quota management</h1><p><i /><span>{accounts.length} account{accounts.length === 1 ? '' : 's'}</span><b>·</b><span className="connected-count">{ready} available</span></p></div><div className="page-actions"><button className="email-toggle" aria-label={state.settings.privacy ? 'Show email addresses' : 'Hide email addresses'} onClick={() => changeSettings({ privacy: !state.settings.privacy })}>{state.settings.privacy ? <Eye size={15} /> : <EyeOff size={15} />}{state.settings.privacy ? 'Show emails' : 'Hide emails'}</button><button className="add-control header-add" onClick={() => setDialog({ kind: 'add' })}><Plus size={15} /> Add account</button><button className="refresh-all" disabled={state.refreshing || busy} onClick={() => void refresh()}><RefreshCw size={16} className={state.refreshing ? 'spin' : ''} />{state.refreshing ? 'Refreshing accounts…' : 'Refresh all accounts'}</button></div></div><nav className="provider-navigation" aria-label="Codex accounts"><button className="provider-tab" aria-current="page" aria-haspopup="dialog" disabled={!accounts.length} onClick={() => openPanel(accounts.find(account => account.selected) || accounts[0])}><span className="codex-mark"><ProviderMark provider="codex" size={19} /></span>Codex<span className="provider-count">{accounts.length}</span></button>{([...new Set(state.providers?.connections.map(row => row.provider) || [])]).map(kind => <button className="provider-tab connected-provider-tab" key={kind} onClick={() => openProvider(state.providers!.connections.find(row => row.provider === kind)!.id)} aria-haspopup="dialog"><ProviderMark provider={kind} size={19} />{providerNames[kind]}<span className="provider-count">{state.providers!.connections.filter(row => row.provider === kind).length}</span></button>)}<button className="connect-provider-nav" onClick={() => addProvider()}><Plus size={13} /> Add provider</button><span className="provider-local"><ShieldCheck size={12} /> Local, encrypted accounts</span></nav></>}
      {state.demo && <div className="sample-notice"><span>PREVIEW</span> Sample accounts · no live credentials connected{window.pulse && !live?.demo && <button onClick={() => setPreview(false)}>Return to my accounts <ArrowRight size={12} /></button>}</div>}
      {state.engineError && !preview && <div className="engine-error" role="alert"><Activity size={15} /><span>{state.engineError}</span><button onClick={() => void refresh()}>Retry</button></div>}
      {accounts.length > 0 && <RecommendationPanel state={state} open={openPanel} update={changeSettings} refresh={() => void refresh()} busy={busy} />}
      <div className="ledger-controls"><label className="account-search"><Search size={16} /><input ref={searchRef} aria-label="Search accounts" placeholder="Search by account name or email" value={search} onChange={event => setSearch(event.target.value)} /><kbd>Ctrl K</kbd></label><div><span className="ledger-mode-label">Ledger</span><Dropdown label="Sort accounts" value={sort} onChange={setSort} options={[{ value: 'default', label: 'Selected first' }, { value: 'remaining', label: 'Most remaining' }, { value: 'name', label: 'Name A–Z' }]} /></div></div>
      <div className="provider-summary account-summary"><div><span className="codex-mark"><ProviderMark provider="codex" size={18} /></span><strong>Codex</strong><span className="summary-caption">Remaining quota</span><span className="summary-count">{accounts.length} account{accounts.length === 1 ? '' : 's'} <i>·</i> {ready} available</span></div></div>
      {!accounts.length ? <div className="empty-monitor"><Code2 size={28} /><h1>All your Codex accounts, together.</h1><p>Sign in with ChatGPT to add each account, or import your existing ccswap accounts.</p><button className="solid-btn" onClick={() => setDialog({ kind: 'add' })}><Plus size={15} /> Add your first account</button><div><button onClick={() => setDialog({ kind: 'import' })}>Import from ccswap</button><span>·</span><button onClick={() => setPreview(true)}>Explore sample accounts</button></div><small><ShieldCheck size={13} /> Saved credentials are encrypted for your Windows account.</small></div> : !visible.length ? <div className="no-matches">No accounts match “{search}”. <button onClick={() => setSearch('')}>Clear search</button></div> : <section className="ledger-list" aria-label="All saved Codex accounts">{visible.map(account => {
        const reconnect = account.status === 'reconnect';
        return <article data-account-card className={`account-entry ${reconnect ? 'needs-login' : ''} ${account.selected ? 'selected-entry' : ''}`} key={account.identity} data-panel-selected={panelIdentity === account.identity} onClick={event => { if (!(event.target as HTMLElement).closest('button, input, select, a')) openPanel(account); }}>
          <div className="entry-identity"><span className="account-avatar" aria-hidden="true">{label(account, state.settings).slice(0, 1).toUpperCase()}</span><div className="account-copy"><div><button className="account-name" onClick={() => openPanel(account)}>{label(account, state.settings)}</button>{account.selected && <span className="active-marker"><i /> Selected</span>}</div><p title={`${email(account, state.settings)} · ${account.plan}`}>{email(account, state.settings)}<span className="plan-label">{account.plan}</span></p>{reconnect && <small className="needs-login-label">Reconnect needed</small>}</div></div>
          <QuotaCell account={account} kind="five_hour" name={label(account, state.settings)} open={() => openPanel(account)} /><QuotaCell account={account} kind="weekly" name={label(account, state.settings)} open={() => openPanel(account)} />
          <div className="entry-actions"><button className="row-refresh" aria-label={`Refresh quota for ${label(account, state.settings)}`} disabled={state.refreshing || busy || preview} onClick={() => void refresh(account.id)} title="Refresh this account’s quota"><RefreshCw size={15} className={state.refreshing ? 'spin' : ''} /></button>{reconnect ? <button className="row-manage" disabled={preview || busy} onClick={() => setDialog({ kind: 'add', account })}>Reconnect <ArrowRight size={14} /></button> : <button className="row-manage" onClick={() => openPanel(account)}>Details <ArrowRight size={14} /></button>}<div className="account-menu-wrap" data-menu><button className="icon-btn" aria-label={`Options for ${label(account, state.settings)}`} aria-expanded={menu === account.id} onClick={() => setMenu(menu === account.id ? null : account.id)}><Ellipsis size={17} /></button>{menu === account.id && <div className="account-menu"><button onClick={() => { setMenu(null); openPanel(account); }}>Open account panel</button><button disabled={preview} onClick={() => { setMenu(null); setDialog({ kind: 'remove', account }); }}>Remove from Quota management</button></div>}</div></div>
        </article>;
      })}</section>}
      {<ForecastChart state={state} identity={chartIdentity} setIdentity={setChartIdentity} />}
      <ProviderConnections value={state.providers} add={addProvider} open={openProvider} preview={preview} samples={() => setShowProviderSamples(true)} />
      <footer className="monitor-footer"><span><i className={state.engineError ? 'disconnected' : ''} /> {preview ? 'sample workspace' : state.refreshing ? 'refreshing quota…' : 'local collector'} <span>·</span> {age(state.snapshot.generatedAt)}</span><span>Percentages show independent remaining capacity <span>·</span> Windows-encrypted vault</span></footer>
    </main></>}
    {panelAccount && <AccountDrawer account={panelAccount} state={state} preview={preview} busy={busy} close={closePanel} choose={setPanelIdentity} rename={renameAccount} refresh={() => void refresh(panelAccount.id)} select={() => panelDialog('switch', panelAccount)} reconnect={() => panelDialog('add', panelAccount)} remove={() => panelDialog('remove', panelAccount)} notify={setNotice} exclude={() => void act(async () => { setLive(await api.setDisabled(panelAccount.id, !panelAccount.disabled)); }, undefined, false)} group={value => changeSettings({ accounts: { ...state.settings.accounts, [panelAccount.identity]: { ...state.settings.accounts[panelAccount.identity], label: state.settings.accounts[panelAccount.identity]?.label ?? '', pinned: state.settings.accounts[panelAccount.identity]?.pinned ?? false, group: value } } })} />}
    {providerPanel && state.providers && <ProviderDrawer connection={providerPanel} value={state.providers} preview={preview} close={closeProviderPanel} choose={setProviderPanelId} reconnect={() => { setProviderPanelId(null); setDialog({ kind: 'provider', connection: providerPanel }); }} update={updateProviders} notify={setNotice} />}
    {notice && <div className="toast" role="status"><Activity size={15} /><span>{notice}</span><button className="icon-btn" aria-label="Dismiss message" onClick={() => setNotice('')}><X size={14} /></button></div>}
    {dialog && <Dialog title={dialog.kind === 'provider' ? dialog.connection ? 'Reconnect provider' : 'Connect a provider' : dialog.kind === 'add' ? 'Add a Codex account' : dialog.kind === 'import' ? 'Import from ccswap' : dialog.kind === 'switch' ? 'Select account for next launch' : dialog.kind === 'remove' ? 'Remove saved account' : dialog.kind === 'mobile' ? 'Phone companion' : dialog.kind === 'widgets' ? 'Desktop widget' : 'Monitor settings'} close={close} busy={busy || state.login?.phase === 'saving'}>
      {dialog.kind === 'mobile' && <MobilePairing preview={preview} />}
      {dialog.kind === 'provider' && <ProviderConnect key={dialog.connection?.id || dialog.provider || 'new'} preview={preview} existing={dialog.connection} initialProvider={dialog.provider} connected={(id, providers) => { updateProviders(providers); setDialog(null); openProvider(id); }} />}
      {dialog.kind === 'settings' && <RecoveryTools preview={preview} notify={setNotice} />}
      {dialog.kind === 'settings' && <label className="setting"><span>Expiring-reset and recovered-quota alerts</span><input type="checkbox" disabled={!state.settings.notifications} checked={state.settings.recommendationAlerts ?? true} onChange={event => changeSettings({ recommendationAlerts: event.target.checked })} /></label>}
      {dialog.kind === 'add' && <><AccountSignIn state={state} preview={preview} target={dialog.account} saved={setLive} notify={setNotice} />{preview && window.pulse && !live?.demo && <button className="outline-btn wide" onClick={() => { setPreview(false); close(); }}>Return to my real accounts</button>}<div className="dialog-rule" /><button className="outline-btn wide" disabled={preview || ['starting', 'waiting', 'saving'].includes(state.login?.phase || '')} onClick={() => setDialog({ kind: 'import' })}>Import existing ccswap accounts <ArrowRight size={14} /></button></>}
      {dialog.kind === 'import' && <><p>Bring your saved Codex accounts into the encrypted vault. Existing accounts are skipped, and original ccswap backups stay in place.</p><div className="dialog-note"><ShieldCheck size={17} /> Importing does not switch your active Codex login.</div><button className="solid-btn wide" disabled={busy || preview} onClick={() => void act(async () => { const result = await api.importExisting(); setLive(result.state); setNotice(`${result.imported} accounts imported.`); })}>{busy ? 'Importing…' : 'Import saved Codex accounts'}</button></>}
      {dialog.kind === 'switch' && <><p>Select <strong>{label(dialog.account, state.settings)}</strong> for compatible file-backed Codex launches.</p><div className="dialog-note"><ShieldCheck size={17} /><span>This selects the Codex auth file. It does not confirm the account inside ChatGPT or the desktop app.</span></div><div className="switch-steps"><span><b>1</b> Save any active Codex work.</span><span><b>2</b> Select the login below.</span><span><b>3</b> Restart your compatible CLI/IDE and check its signed-in account.</span></div><p className="fine-print">ChatGPT/Codex desktop may use a separate credential store. Restarting alone cannot guarantee a switch. Quota management does not force-close work or modify the desktop app’s private login store. Use its own account menu when needed.</p><button className="solid-btn wide" disabled={busy || preview} onClick={() => void act(async () => { setLive(await api.switchAccount(dialog.account.id)); }, 'File-backed login selected. Desktop ChatGPT account is not verified.')}>{busy ? 'Selecting…' : 'Select file-backed Codex login'} <ArrowRight size={14} /></button></>}
      {dialog.kind === 'remove' && <><p>Remove <strong>{label(dialog.account, state.settings)}</strong> and its encrypted backup from Quota management. Your active Codex login and original ccswap data stay in their existing locations.</p><button className="danger-btn wide" disabled={busy || preview} onClick={() => void act(async () => { setLive(await api.removeAccount(dialog.account.id)); }, 'Saved account removed from Quota management.')}>Remove from Quota management</button></>}
      {dialog.kind === 'settings' && <><p>Accounts are checked by one local collector. Credentials never reach this interface.</p><div className="setting"><span>Refresh interval</span><Dropdown label="Refresh interval" value={state.settings.interval} onChange={value => changeSettings({ interval: Number(value) })} options={[{ value: '120', label: '2 minutes' }, { value: '300', label: '5 minutes' }, { value: '600', label: '10 minutes' }]} /></div>{([
        ['privacy', 'Mask email addresses'], ['notifications', 'Low-quota notifications'], ['compact', 'Compact account rows'], ['closeToTray', 'Keep running in the system tray'], ['widgetTop', 'Keep desktop widget on top'], ['startAtLogin', 'Start at Windows sign-in'],
      ] as const).map(([key, title]) => <label className="setting" key={key}><span>{title}</span><input type="checkbox" checked={state.settings[key]} disabled={key === 'startAtLogin' && (!state.desktop || preview)} onChange={event => changeSettings({ [key]: event.target.checked })} /></label>)}<div className="setting"><span>Notify below</span><Dropdown label="Notification threshold" value={state.settings.threshold} onChange={value => changeSettings({ threshold: Number(value) })} options={[10, 20, 30].map(n => ({ value: String(n), label: n + '% remaining' }))} /></div><div className="dialog-rule" /><button className="outline-btn wide" disabled={preview} onClick={() => void act(async () => { if (await api.exportHistory()) setNotice('Usage history exported.'); }, undefined, false)}><ArrowDownToLine size={14} /> Export local usage history</button><button className="outline-btn wide spaced" disabled={preview || busy || !api.quit} onClick={() => void api.quit?.()}>Quit Quota management</button><p className="fine-print">Quota management {state.version} · ccswap 0.39.2 · Windows DPAPI vault.<br />Quota endpoints depend on the upstream ccswap integration.</p></>}
      {dialog.kind === 'widgets' && <><p>Both limits for every account. Click the Q icon in the Windows system tray for a quick glance, or pin this view as a desktop window.</p><div className="widget-design-preview"><QuotaPills accounts={accounts.slice(0, 4)} settings={state.settings} open={account => { close(); openPanel(account); }} /></div><button className="solid-btn wide spaced" onClick={() => void api.openQuickView()}><Activity size={15} /> Open tray quick view</button><button className="outline-btn wide spaced" onClick={() => void api.openWidget()}><Monitor size={15} /> Pin desktop widget</button><p className="fine-print">Quick view closes when you click away or press Escape. If the Q tray icon is hidden, find it in Windows’ hidden-icons menu and drag it beside the clock. Phone widgets are available through Phone companion.</p></>}
    </Dialog>}
  </div>;
}
