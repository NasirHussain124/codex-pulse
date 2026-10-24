import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, ExternalLink, Pause, Play, Plus, RefreshCw, ShieldCheck, Trash2, X } from 'lucide-react';
import { api } from './api';
import { age, countdown } from './model';
import { Dropdown } from './Dropdown';
import { ProviderMark } from './ProviderMark';
import type { OtherProvider, OtherProviders, ProviderConnection, ProviderMetric, ProviderQuota } from './types';

export const providerNames: Record<OtherProvider, string> = { copilot: 'GitHub Copilot', claude: 'Claude', cursor: 'Cursor', gemini: 'Gemini API' };
const descriptions: Record<OtherProvider, { kind: string; summary: string; credential: string; hint: string }> = {
  copilot: { kind: 'Account quota', summary: 'Premium interactions, chat and completions from the official Copilot SDK.', credential: 'GitHub token', hint: 'Use a supported OAuth/user token or fine-grained PAT with the Copilot permission required by GitHub. Classic ghp_ tokens are not supported. No AI session is created.' },
  claude: { kind: 'Organization report', summary: 'Authorized API token usage and cost. Not Claude.ai Pro/Max 5h or 7-day limits.', credential: 'Organization Admin API key', hint: 'Use a Claude Console sk-ant-admin01- key for an organization you administer. Do not paste a subscription OAuth token, session cookie or browser credentials.' },
  cursor: { kind: 'Team billing report', summary: 'Member usage and current-cycle spend from the Cursor Admin API.', credential: 'Team Admin API key', hint: 'Use a key_ reporting key from a team you administer. This reports team billing, not personal quota. Updates are limited to once per hour.' },
  gemini: { kind: 'Project monitoring', summary: 'Gemini API project metrics and compatible quota series in Google Cloud Monitoring.', credential: 'Service-account JSON', hint: 'Use an existing service account authorized for Monitoring Viewer on your project. No account, role or project is created. This is not Gemini CLI or Google AI Pro/Ultra account quota.' },
};
const cleanError = (error: unknown) => (error as Error).message.replace(/^Error invoking remote method '[^']+': Error: /, '');
export function metricValue(row: ProviderMetric) {
  if (row.value === null) return 'Not reported';
  if (row.unit === 'USD') return `$${row.value}`;
  return typeof row.value === 'number' ? row.value.toLocaleString() : row.value;
}
export function ProviderQuotaView({ quota, stale }: { quota: ProviderQuota; stale: boolean }) {
  const due = quota.resetsAt !== null && Date.parse(quota.resetsAt) <= Date.now();
  const percent = quota.remainingPercent;
  return <div className={`provider-quota ${stale || due ? 'is-stale' : ''}`}>
    <div><span>{quota.label}</span><strong>{quota.unlimited ? 'Unlimited entitlement' : percent === null ? 'Not reported' : `${Math.round(percent)}% left`}</strong></div>
    {!quota.unlimited && percent !== null && <div className="provider-progress" role="progressbar" aria-label={`${quota.label} remaining`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><i style={{ width: `${percent}%` }} /></div>}
    <p>{quota.used === null ? 'Usage not reported' : `${quota.used.toLocaleString()} used`}{quota.limit !== null ? ` / ${quota.limit.toLocaleString()} ${quota.unit}` : ''}<span>{due ? 'Reset due · refresh for a new reading' : quota.resetsAt ? `Resets in ${countdown(quota.resetsAt)}` : quota.period || 'Reset not reported'}</span></p>
    {quota.overage !== null && quota.overage !== undefined && quota.overage > 0 && <small>Reported overage · {quota.overage.toLocaleString()} requests</small>}
    {quota.overageAllowed && <small>Provider reports overage is allowed. This app does not enable it or authorize charges.</small>}
    {quota.observedAt && <small>Provider observation · {age(quota.observedAt)}</small>}
  </div>;
}
export function ProviderConnect({ preview, existing, initialProvider, connected }: { preview: boolean; existing?: ProviderConnection; initialProvider?: OtherProvider; connected: (id: string, state: OtherProviders) => void }) {
  const [provider, setProvider] = useState<OtherProvider>(existing?.provider || initialProvider || 'copilot');
  const [name, setName] = useState(existing?.label || '');
  const [secret, setSecret] = useState(''), [project, setProject] = useState(existing?.provider === 'gemini' ? existing.report?.subject || '' : '');
  const [show, setShow] = useState(false), [pending, setPending] = useState(false), [error, setError] = useState('');
  const active = useRef(false);
  useEffect(() => () => { if (active.current) void api.cancelProviderConnect?.(); }, []);
  const info = descriptions[provider];
  const submit = async () => {
    if (!api.connectProvider || pending || preview) return;
    const input = { provider, label: name.trim(), secret, ...(existing ? { id: existing.id } : {}), ...(project.trim() ? { projectId: project.trim() } : {}) };
    setSecret(''); setShow(false); setPending(true); setError(''); active.current = true;
    try { const result = await api.connectProvider(input); active.current = false; connected(result.connectionId, result.providers); }
    catch (e) { setError(cleanError(e)); }
    finally { active.current = false; setPending(false); }
  };
  return <div className="provider-connect">
    <p>Connect a source you are authorized to monitor. Each provider keeps its own limits and reporting scope.</p>
    <div className="provider-options">{(Object.keys(providerNames) as OtherProvider[]).map(kind => <button key={kind} type="button" aria-pressed={provider === kind} disabled={pending || Boolean(existing && existing.provider !== kind)} onClick={() => { setProvider(kind); setSecret(''); setError(''); }}><ProviderMark provider={kind} size={24} /><span><strong>{providerNames[kind]}</strong><small>{descriptions[kind].kind}</small></span>{provider === kind && <Check size={14} />}</button>)}</div>
    <div className="provider-capability"><strong>{info.kind}</strong><p>{info.summary}</p><small>{info.hint}</small><button type="button" onClick={() => void api.providerDocs?.(provider, true)}>Setup and permissions <ExternalLink size={12} /></button></div>
    {preview && <div className="dialog-note"><ShieldCheck size={16} /> Sample mode is read-only. Open your real Windows workspace to connect a provider.</div>}
    <form onSubmit={event => { event.preventDefault(); void submit(); }}>
      <label>Connection name<input autoComplete="off" maxLength={48} value={name} disabled={pending} placeholder="Personal, work or project name" onChange={event => setName(event.target.value)} /></label>
      {provider === 'gemini' && <label>Project ID <small>(optional if present in the JSON)</small><input value={project} maxLength={64} disabled={pending} autoComplete="off" onChange={event => setProject(event.target.value)} /></label>}
      <label>{info.credential}{provider === 'gemini' ? <textarea className={!show ? 'masked-secret' : ''} value={secret} disabled={pending || preview} autoComplete="off" spellCheck={false} maxLength={35000} rows={3} onChange={event => setSecret(event.target.value)} /> : <input type={show ? 'text' : 'password'} value={secret} disabled={pending || preview} autoComplete="off" spellCheck={false} maxLength={1200} onChange={event => setSecret(event.target.value)} />}</label>
      <label className="provider-secret-toggle"><input type="checkbox" checked={show} disabled={pending || preview} onChange={event => setShow(event.target.checked)} /> Show the credential I’m entering</label>
      <small className="fine-print">Entered credentials are cleared when checking starts, encrypted on this Windows user, and never returned in application state. Reports are read-only; no model call, subscription reset or billing change is performed.</small>
      {error && <p className="provider-error" role="alert">{error}</p>}
      <button className="solid-btn wide spaced" type="submit" disabled={pending || preview || !name.trim() || !secret.trim() || !api.connectProvider}>{pending ? <><RefreshCw size={14} className="spin" /> Checking reporting access…</> : <>{existing ? 'Reconnect securely' : 'Connect and read usage'} <ArrowRight size={14} /></>}</button>
      {pending && <button className="outline-btn wide spaced" type="button" onClick={() => void api.cancelProviderConnect?.()}>Cancel connection check</button>}
    </form>
  </div>;
}

export function ProviderConnections({ value, add, open, preview, samples }: { value?: OtherProviders; add: (kind?: OtherProvider) => void; open: (id: string) => void; preview: boolean; samples: () => void }) {
  const rows = value?.connections || [];
  return <section className="provider-connections" aria-label="Other provider connections"><header><div><h2>More of your AI workspace</h2><p>Native quota and authorized reports. Never pooled into Codex capacity.</p></div><button className="outline-btn" onClick={() => add()}><Plus size={14} /> Connect provider</button></header>
    {value?.error && <p className="provider-error" role="alert">{value.error}</p>}
    {preview && !rows.length && <button className="sample-provider-reports" onClick={samples}>Explore sample provider reports <ArrowRight size={13} /></button>}
    {rows.length ? <div className="provider-connection-grid">{rows.map(row => <button key={row.id} className="provider-connection-card" onClick={() => open(row.id)}><ProviderMark provider={row.provider} size={26} /><span><strong>{row.label}</strong><small>{providerNames[row.provider]} · {row.report?.scope || 'Not yet reported'}</small></span><i className={`connection-status ${row.status}`}>{row.refreshing ? 'Updating' : row.status === 'ready' ? 'Connected' : row.status === 'stale' ? 'Saved reading' : row.status === 'paused' ? 'Paused' : 'Needs attention'}</i><ArrowRight size={15} /></button>)}</div> : <div className="provider-empty">{(Object.keys(providerNames) as OtherProvider[]).map(kind => <button key={kind} onClick={() => add(kind)}><ProviderMark provider={kind} size={22} /><span>{providerNames[kind]}<small>{descriptions[kind].kind}</small></span></button>)}</div>}
  </section>;
}

export function ProviderDrawer({ connection, value, preview, close, choose, reconnect, update, notify }: { connection: ProviderConnection; value: OtherProviders; preview: boolean;
  close: () => void; choose: (id: string) => void; reconnect: () => void; update: (value: OtherProviders) => void; notify: (text: string) => void }) {
  const panel = useRef<HTMLElement>(null), [pending, setPending] = useState(false);
  const [editing, setEditing] = useState(false), [name, setName] = useState(connection.label);
  useEffect(() => { setName(connection.label); setEditing(false); }, [connection.id, connection.label]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null, overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; panel.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      if (event.key !== 'Tab') return;
      const targets = [...panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),a[href]') || []];
      if (event.shiftKey && document.activeElement === targets[0]) { event.preventDefault(); targets.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === targets.at(-1)) { event.preventDefault(); targets[0]?.focus(); }
    };
    document.addEventListener('keydown', key);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', key); previous?.focus(); };
  }, [close]);
  const act = async (action: () => Promise<OtherProviders>) => {
    setPending(true); try { update(await action()); } catch (e) { notify(cleanError(e)); } finally { setPending(false); }
  };
  const report = connection.report, waiting = connection.nextUpdateAt !== null && Date.parse(connection.nextUpdateAt) > Date.now();
  return <div className="drawer-scrim" onMouseDown={event => { if (event.currentTarget === event.target) close(); }}><aside className="account-drawer provider-drawer" ref={panel} role="dialog" aria-modal="true" aria-labelledby="provider-panel-title">
    <header className="drawer-top"><div><span className="drawer-kicker">QUOTA MANAGEMENT</span><h2 id="provider-panel-title">Provider connection</h2></div><button className="icon-btn" aria-label="Close provider panel" onClick={close}><X size={20} /></button></header>
    <div className="drawer-content">
      {preview && <div className="drawer-info sample-panel-note">Sample report · no live provider is connected and credentials cannot be changed here.</div>}
      <label className="drawer-chooser">Connection<Dropdown label="Provider connection in panel" value={connection.id} onChange={choose} options={value.connections.map(row => ({ value: row.id, label: `${row.label} · ${providerNames[row.provider]}` }))} /></label>
      <div className="provider-identity"><ProviderMark provider={connection.provider} size={40} /><div><h3>{connection.label}</h3><p>{providerNames[connection.provider]} · {report?.scope || 'Reporting connection'}</p><small>{report?.subject}</small></div></div>
      <div className="provider-report-meta"><span>{connection.status === 'paused' ? 'Monitoring paused' : connection.status === 'stale' ? 'Saved reading · not live' : connection.status === 'ready' ? 'Last successful report' : 'Report unavailable'} · {age(connection.fetchedAt)}</span><button disabled={preview || pending || connection.refreshing || waiting || !connection.enabled || !api.refreshProvider} onClick={() => void act(() => api.refreshProvider!(connection.id))}><RefreshCw size={13} className={connection.refreshing ? 'spin' : ''} /> Refresh</button></div>
      {waiting && <p className="fine-print">Next permitted refresh in {countdown(connection.nextUpdateAt)}. Auto-updates respect provider reporting intervals.</p>}
      {connection.error && <p className="provider-error" role="alert">{connection.error}</p>}
      {report && <>
        {!report.complete && <div className="dialog-note">Partial report. Missing totals are not treated as zero.</div>}
        {report.periodStart && <p className="provider-period">{new Date(report.periodStart).toLocaleDateString()} — {report.periodEnd ? new Date(report.periodEnd).toLocaleDateString() : 'current billing cycle'}</p>}
        {report.quotas.length > 0 && <section className="provider-quotas" aria-label="Native provider quota">{report.quotas.map(row => <ProviderQuotaView key={row.id} quota={row} stale={connection.status !== 'ready'} />)}</section>}
        {report.metrics.length > 0 && <dl className="provider-metrics">{report.metrics.map(row => <div key={row.id}><dt>{row.label}</dt><dd>{metricValue(row)}</dd></div>)}</dl>}
        {report.members.length > 0 && <details className="provider-members"><summary>Member reports · {report.members.length}</summary>{report.members.map(member => <article key={member.id}><strong>{member.label}</strong>{member.email && <small>{member.email}</small>}<div>{member.metrics.map(row => <span key={row.id}>{row.label} <b>{metricValue(row)}</b></span>)}</div></article>)}</details>}
        <div className="provider-notes">{report.notes.map((note, index) => <p key={index}>{note}</p>)}</div>
      </>}
      <button className="outline-btn wide spaced" onClick={() => void api.providerDocs?.(connection.provider)}>Reporting source and limitations <ExternalLink size={13} /></button>
      <div className="dialog-rule" /><button className="outline-btn wide" disabled={preview || pending} onClick={() => setEditing(!editing)}>Rename connection</button>
      {editing && <form className="provider-rename" onSubmit={event => { event.preventDefault(); void act(() => api.renameProvider!(connection.id, name)); }}><input aria-label="Provider connection name" value={name} maxLength={48} onChange={event => setName(event.target.value)} /><button disabled={pending || !name.trim()} type="submit">Save name</button></form>}
      <button className="outline-btn wide spaced" disabled={preview || pending || !api.enableProvider} onClick={() => void act(() => api.enableProvider!(connection.id, !connection.enabled))}>{connection.enabled ? <><Pause size={13} /> Pause monitoring</> : <><Play size={13} /> Resume monitoring</>}</button>
      <button className="drawer-remove" disabled={preview || pending || !api.removeProvider} onClick={() => void act(() => api.removeProvider!(connection.id))}><Trash2 size={14} /> Remove reporting connection</button>
    </div><footer className="drawer-footer"><button className="select-account-btn" disabled={preview || pending} onClick={reconnect}>Reconnect reporting access <ArrowRight size={15} /></button><p>Read-only monitoring. Selecting a report does not switch an AI app’s signed-in account.</p></footer>
  </aside></div>;
}
