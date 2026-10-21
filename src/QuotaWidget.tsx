import { ArrowUpRight, Eye, EyeOff, Pin, Plus, RefreshCw, Settings2, X } from 'lucide-react';
import type { Account, AppState, Settings } from './types';
import { age } from './model';
import { dualWidgetReading } from './widgetModel';
import { QuotaMark } from './QuotaMark';

export function QuotaPills({ accounts, settings, open, actionLabel = 'Open account details' }: { accounts: Account[]; settings: Settings; open?: (account: Account) => void; actionLabel?: string }) {
  return <section className="quota-cards" aria-label="All saved Codex accounts">{accounts.map(account => {
    const reading = dualWidgetReading(account, settings);
    return <button type="button" className={`quota-card ${account.selected ? 'selected' : ''}`} data-account-card={account.id} key={account.identity}
      onClick={() => open?.(account)} title={`${reading.name}. ${reading.description}`} aria-label={`${reading.name}. ${reading.description} ${actionLabel}.`}>
      <div className="quota-card-identity"><span className="quota-avatar" aria-hidden="true">{reading.name.slice(0, 1).toUpperCase()}</span><strong>{reading.name}</strong>{account.selected && <i title="Selected for Codex launch" aria-label="Selected for launch" />}</div>
      {reading.status && <span className="quota-card-status">{reading.status}</span>}
      <div className="quota-card-limits">{([['5h', reading.five], ['7d', reading.weekly]] as const).map(([period, value]) =>
        <div className={`quota-mini ${value.percent !== null && value.percent <= 20 ? 'low' : ''}`} data-quota={period} data-remaining={value.percent ?? ''} key={period}>
          <div><span>{period}</span><strong>{value.percent === null ? '—' : Math.round(value.percent)}{value.percent !== null && <small>%</small>}</strong></div>
          <span className="quota-mini-track" aria-hidden="true"><i style={{ width: `${value.percent ?? 0}%` }} /></span>
        </div>)}</div>
    </button>;
  })}</section>;
}

type WidgetProps = {
  state: AppState; preview: boolean; busy: boolean; open: (account: Account) => void;
  settings: (patch: Partial<Settings>) => void; refresh: () => void; add: () => void; configure: () => void; dashboard: () => void; privacy: () => void;
};
export function QuotaWidget({ state, preview, busy, open, refresh, add, configure, dashboard, privacy }: WidgetProps) {
  const accounts = [...state.snapshot.accounts].sort((a, b) => Number(b.selected) - Number(a.selected) || Number(a.id) - Number(b.id));
  return <main className="battery-widget"><header className="battery-widget-heading"><div className="widget-brand"><QuotaMark size={30} /><div><h1>Quota management</h1><p>{preview ? 'Sample accounts · ' : ''}Remaining · 5-hour & 7-day</p></div></div><div>
    <button className="icon-btn" aria-label={state.settings.privacy ? 'Show email addresses' : 'Hide email addresses'} onClick={privacy}>{state.settings.privacy ? <EyeOff size={16} /> : <Eye size={16} />}</button><button className="icon-btn" aria-label="Settings" onClick={configure}><Settings2 size={16} /></button>
  </div></header>
    <div className="battery-widget-controls"><span>{accounts.length} account{accounts.length === 1 ? '' : 's'}</span><button className="icon-btn" aria-label="Refresh quota" disabled={state.refreshing || busy} onClick={refresh}><RefreshCw size={16} className={state.refreshing ? 'spin' : ''} /></button><button className="icon-btn" aria-label="Add account" onClick={add}><Plus size={18} /></button></div>
    <div className="battery-widget-body">{accounts.length ? <QuotaPills accounts={accounts} settings={state.settings} open={open} /> : <div className="widget-empty"><QuotaMark size={40} /><h2>Your accounts, at a glance.</h2><p>Add a Codex account to see both limits here.</p><button className="solid-btn" onClick={add}><Plus size={16} /> Add account</button></div>}</div>
    <footer className="battery-widget-footer"><span>{preview ? 'Sample preview' : state.engineError ? 'Refresh failed · saved readings' : state.refreshing ? 'Refreshing…' : `Updated ${age(state.snapshot.generatedAt).toLowerCase()}`}</span><button className="icon-btn" aria-label="Open dashboard" onClick={dashboard}><ArrowUpRight size={18} /></button></footer>
  </main>;
}

export function QuickView({ state, preview, busy, refresh, close, pin, dashboard }: {
  state: AppState; preview: boolean; busy: boolean; refresh: () => void; close: () => void; pin: () => void; dashboard: () => void;
}) {
  const accounts = [...state.snapshot.accounts].sort((a, b) => Number(b.selected) - Number(a.selected) || Number(a.id) - Number(b.id));
  const saved = state.engineError || accounts.some(a => a.status !== 'ready' || !a.fetchedAt || Date.now() - Date.parse(a.fetchedAt) > 300000);
  return <main className="quick-view" aria-label="Quick usage">
    <header className="quick-heading"><div className="widget-brand"><QuotaMark size={30} /><div><h1>Quota management</h1><p>Remaining capacity</p></div></div><button className="icon-btn" aria-label="Refresh quota" disabled={busy || state.refreshing} onClick={refresh}><RefreshCw size={16} className={state.refreshing ? 'spin' : ''} /></button><button className="icon-btn" aria-label="Close quick view" onClick={close}><X size={17} /></button></header>
    <div className="quick-body">{accounts.length ? <QuotaPills accounts={accounts} settings={state.settings} open={dashboard} actionLabel="Open dashboard" /> : <div className="widget-empty"><QuotaMark size={38} /><h2>A little more headroom.</h2><p>Add your Codex accounts in the dashboard.</p><button className="solid-btn" onClick={dashboard}>Open dashboard <ArrowUpRight size={15} /></button></div>}</div>
    <footer className="quick-footer"><span role="status">{preview ? 'Sample preview' : state.refreshing ? 'Refreshing…' : saved ? 'Saved readings' : age(state.snapshot.generatedAt)}</span><button aria-label="Pin usage widget" onClick={pin}><Pin size={14} /> Pin</button><button onClick={dashboard}>Dashboard <ArrowUpRight size={14} /></button></footer>
  </main>;
}
