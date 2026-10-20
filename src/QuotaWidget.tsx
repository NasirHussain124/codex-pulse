import { ArrowUpRight, Eye, EyeOff, Plus, RefreshCw, Settings2, UserRound } from 'lucide-react';
import type { Account, AppState, Settings } from './types';
import { age } from './model';
import { widgetReading } from './widgetModel';
import { QuotaMark } from './QuotaMark';

export function QuotaPills({ accounts, settings, open }: { accounts: Account[]; settings: Settings; open?: (account: Account) => void }) {
  return <section className="quota-pills" aria-label="All saved Codex accounts">{accounts.map(account => {
    const { percent, detail, name } = widgetReading(account, settings);
    return <button type="button" className={`quota-pill ${account.selected ? 'selected' : ''} ${percent === null ? 'unreported' : ''}`} data-account-card={account.id} data-remaining={percent ?? ''} key={account.identity}
      onClick={() => open?.(account)} title={`${name} · ${percent === null ? 'Quota not reported' : `${Math.round(percent)}% remaining`} · ${detail}`} aria-label={`${name}, ${percent === null ? 'quota not reported' : `${Math.round(percent)} percent remaining`}. ${detail}. Open account details`}>
      <span className="quota-pill-fill" style={{ width: `${percent ?? 0}%` }} aria-hidden="true" /><UserRound className="quota-pill-icon" size={24} strokeWidth={1.7} />
      <span className="quota-pill-copy"><strong>{name}</strong><small>{detail}</small></span><span className="quota-pill-value">{percent === null ? '—' : `${Math.round(percent)}%`}</span>
    </button>;
  })}</section>;
}

export function QuotaWidget({ state, preview, busy, open, settings, refresh, add, configure, dashboard, privacy }: {
  state: AppState; preview: boolean; busy: boolean; open: (account: Account) => void;
  settings: (patch: Partial<Settings>) => void; refresh: () => void; add: () => void; configure: () => void; dashboard: () => void; privacy: () => void;
}) {
  const accounts = [...state.snapshot.accounts].sort((a, b) => Number(b.selected) - Number(a.selected) || Number(a.id) - Number(b.id));
  return <main className="battery-widget"><header className="battery-widget-heading"><div><h1>Codex accounts</h1><p>{preview ? 'Sample accounts · ' : ''}Remaining quota</p></div><div>
    <button className="icon-btn" aria-label={state.settings.privacy ? 'Show email addresses' : 'Hide email addresses'} onClick={privacy}>{state.settings.privacy ? <EyeOff size={17} /> : <Eye size={17} />}</button><button className="icon-btn" aria-label="Settings" onClick={configure}><Settings2 size={17} /></button>
  </div></header><div className="battery-widget-controls"><div className="widget-period" role="group" aria-label="Widget quota window">{(['five_hour', 'weekly'] as const).map(value => <button key={value} aria-pressed={state.settings.widgetWindow === value} onClick={() => settings({ widgetWindow: value })}>{value === 'weekly' ? '7-day' : '5-hour'}</button>)}</div><button className="icon-btn" aria-label="Refresh quota" disabled={state.refreshing || busy} onClick={refresh}><RefreshCw size={17} className={state.refreshing ? 'spin' : ''} /></button><button className="icon-btn" aria-label="Add account" onClick={add}><Plus size={19} /></button></div>
    <div className="battery-widget-body">{accounts.length ? <QuotaPills accounts={accounts} settings={state.settings} open={open} /> : <div className="widget-empty"><QuotaMark size={48} /><h2>Your accounts, at a glance.</h2><p>Add a Codex account to see its remaining quota.</p><button className="solid-btn" onClick={add}><Plus size={16} /> Add account</button></div>}</div>
    <footer className="battery-widget-footer"><div><QuotaMark size={29} /><span>Quota management<small>{preview ? 'Sample preview' : state.engineError ? 'Refresh failed · saved readings' : state.refreshing ? 'Refreshing…' : `Updated ${age(state.snapshot.generatedAt).toLowerCase()}`}</small></span></div><button className="icon-btn" aria-label="Open dashboard" onClick={dashboard}><ArrowUpRight size={20} /></button></footer>
  </main>;
}
