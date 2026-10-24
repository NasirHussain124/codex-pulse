import { useState } from 'react';
import { Activity, ChevronDown, ChevronUp, Settings2 } from 'lucide-react';
import type { AppState } from './types';
import { Dropdown } from './Dropdown';
import { estimateDrain, project, readingSegments, readingsFor } from './forecast';
import { age, color, countdown, label } from './model';

export function ForecastChart({ state, identity, setIdentity }: { state: AppState; identity: string; setIdentity: (value: string) => void }) {
  const [windowId, setWindowId] = useState('weekly');
  const [tab, setTab] = useState<'remaining' | 'drain'>('remaining');
  const [horizon, setHorizon] = useState(24);
  const [expanded, setExpanded] = useState(true);
  const [forecast, setForecast] = useState(false);
  const [settings, showSettings] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [hover, setHover] = useState<number | null>(null);
  const accounts = identity ? state.snapshot.accounts.filter(a => a.identity === identity) : state.snapshot.accounts;
  const now = Date.now(), start = now - 24 * 3600000, end = now + (forecast ? horizon : 0) * 3600000;
  const x = (time: number) => 10 + 980 * (time - start) / (end - start);
  const y = (value: number) => 186 - value * 1.8;
  const series = accounts.map(account => {
    const quota = account.windows.find(w => windowId === 'weekly' ? w.durationMinutes === 10080 : w.durationMinutes === 300);
    const readings = readingsFor(state.history, account, windowId).filter(p => p.at >= start && p.at <= now);
    const at = Date.parse(account.fetchedAt || '');
    const known = account.status !== 'reconnect' && quota && Number.isFinite(quota.remainingPercent) && quota.remainingPercent >= 0 && quota.remainingPercent <= 100;
    if (known && Number.isFinite(at) && at >= start && at <= now && !readings.some(p => p.at === at)) readings.push({ at, remaining: quota.remainingPercent });
    readings.sort((a, b) => a.at - b.at);
    const rate = account.status === 'ready' && at <= now + 60000 && now - at <= 300000 ? estimateDrain(readings) : null;
    const future = forecast && known ? project(quota, rate, now, end) : [];
    const drain = readings.flatMap((p, i) => {
      if (!i) return [];
      const previous = readings[i - 1], hours = (p.at - previous.at) / 3600000;
      return hours > 0 && hours <= .5 && p.remaining <= previous.remaining ? [{ at: p.at, remaining: (previous.remaining - p.remaining) / hours }] : [];
    });
    return { account, quota, readings, future, drain, known, rate, at, ink: color(account) };
  });
  const visible = series.filter(s => !hidden.has(s.account.identity));
  const maxRate = Math.max(1, ...visible.flatMap(s => s.drain.map(p => p.remaining)));
  const points = (rows: { at: number; remaining: number }[]) => rows.map(p => `${x(p.at)},${tab === 'drain' ? 186 - p.remaining / maxRate * 180 : y(p.remaining)}`).join(' ');
  const hasPoints = visible.some(s => (tab === 'remaining' ? s.readings : s.drain).length > 0);
  const single = series.length === 1 ? series[0] : null;
  const reported = series.filter(s => s.known).length;
  const selectedIdentity = series.some(s => s.account.identity === identity) ? identity : '';
  const toggle = (id: string) => setHidden(before => { const next = new Set(before); next.has(id) ? next.delete(id) : next.add(id); return next; });
  return <section className="forecast-section insights-panel" aria-label="Quota analytics">
    <div className="insights-heading"><div><span className="eyebrow">THE BIG PICTURE</span><h2>{identity ? 'Account insights' : 'Every account. One view.'}</h2><p>{identity ? 'Recorded quota and optional estimates.' : 'Independent account limits—not a pooled allowance.'}</p></div>
      <div className="chart-selectors"><Dropdown label="Chart account" value={selectedIdentity} onChange={value => { setIdentity(value); setHidden(new Set()); }} options={[{ value: '', label: 'All accounts' }, ...state.snapshot.accounts.map(a => ({ value: a.identity, label: label(a, state.settings) }))]} /><Dropdown label="Chart quota window" value={windowId} onChange={setWindowId} options={[{ value: 'weekly', label: '7-day limit' }, { value: 'five_hour', label: '5-hour limit' }]} /><button className="icon-btn" aria-label={expanded ? 'Collapse chart' : 'Expand chart'} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</button></div>
    </div>
    {expanded && <><div className="capacity-heading"><div><strong>{single?.known ? `${Math.round(single.quota!.remainingPercent)}%` : `${reported}/${series.length}`}</strong><span>{single ? ' remaining' : ' accounts reporting'}</span><small>{single?.rate ? `Estimated drain ${single.rate.toFixed(1)}%/h` : 'Past 24 hours · actual readings'}</small></div></div>
      <div className="chart-tabs"><button aria-pressed={tab === 'remaining'} className={tab === 'remaining' ? 'active' : ''} onClick={() => setTab('remaining')}>Remaining quota</button><button aria-pressed={tab === 'drain'} className={tab === 'drain' ? 'active' : ''} onClick={() => setTab('drain')}>Drain rate</button></div>
      <div className="chart-account-legend" aria-label="Accounts shown on chart">{series.map(s => <button key={s.account.identity} aria-label={`${hidden.has(s.account.identity) ? 'Show' : 'Hide'} ${label(s.account, state.settings)} on chart`} aria-pressed={!hidden.has(s.account.identity)} onClick={() => toggle(s.account.identity)} style={{ '--series-color': s.ink } as React.CSSProperties}><i /><span>{label(s.account, state.settings)}</span><small>{s.known ? `${Math.round(s.quota!.remainingPercent)}%` : '—'}</small></button>)}</div>
      <div className="chart-layout"><div className="y-labels">{[100, 75, 50, 25, 0].map(n => <span key={n}>{tab === 'remaining' ? `${n}%` : `${(maxRate * n / 100).toFixed(1)}%/h`}</span>)}</div><div className="chart-area">
        <svg viewBox="0 0 1000 192" preserveAspectRatio="none" role="img" aria-label={`${identity ? 'Selected account' : 'All accounts'} ${windowId === 'weekly' ? '7-day' : '5-hour'} ${tab === 'remaining' ? 'remaining quota' : 'observed drain rate'}. Solid lines are recorded; dashed lines are estimates. Gaps mean missing observations.`}
          onPointerMove={event => { const bounds = event.currentTarget.getBoundingClientRect(); setHover(Math.max(start, Math.min(end, start + ((event.clientX - bounds.left) / bounds.width * 1000 - 10) / 980 * (end - start)))); }} onPointerLeave={() => setHover(null)}>
          {[6, 51, 96, 141, 186].map(line => <line key={line} x1="0" x2="1000" y1={line} y2={line} className="chart-grid" />)}
          <line x1={x(now)} x2={x(now)} y1="6" y2="186" className="now-line" /><text x={Math.min(965, x(now) - 27)} y="17" className="now-label">Now</text>
          {visible.map(s => <g key={s.account.identity} data-chart-series={s.account.identity}>{readingSegments(tab === 'remaining' ? s.readings : s.drain).map((segment, i) => <g key={i}><polyline points={points(segment)} fill="none" stroke={s.ink} strokeWidth="2" vectorEffect="non-scaling-stroke" />{segment.length === 1 && <circle cx={x(segment[0].at)} cy={tab === 'remaining' ? y(segment[0].remaining) : 186 - segment[0].remaining / maxRate * 180} r="3" fill={s.ink} />}</g>)}{tab === 'remaining' && s.future.length > 1 && <polyline points={points(s.future)} fill="none" stroke={s.ink} strokeWidth="1.8" strokeDasharray="5 5" opacity=".6" vectorEffect="non-scaling-stroke" />}</g>)}
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1="6" y2="186" className="chart-hover-line" />}
        </svg>
        {!hasPoints && <div className="chart-empty"><Activity size={20} /><span>{hidden.size >= series.length && series.length ? 'Select an account in the legend to show it.' : tab === 'drain' ? 'More frequent recorded readings are needed to show drain.' : 'Your first successful reading will start this chart.'}</span></div>}
        {hover !== null && hasPoints && <div className="chart-tooltip" role="status"><strong>{new Date(hover).toLocaleString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })}</strong>{visible.map(s => {
          const rows = hover > now ? tab === 'remaining' ? s.future : [] : tab === 'remaining' ? s.readings : s.drain;
          const nearest = rows.reduce<(typeof rows)[number] | null>((best, p) => !best || Math.abs(p.at - hover) < Math.abs(best.at - hover) ? p : best, null);
          const close = nearest && Math.abs(nearest.at - hover) <= (hover > now ? 3600000 : 900000);
          return <span key={s.account.identity}><i style={{ background: s.ink }} />{label(s.account, state.settings)}<b>{close ? `${nearest!.remaining.toFixed(1)}${tab === 'drain' ? '%/h' : '%'}` : 'No reading'}</b></span>;
        })}<small>{hover > now ? 'Estimated—not a provider reading' : 'Nearest observation within 15 minutes'}</small></div>}
        <div className="x-labels">{[0, .25, .5, .75, 1].map(part => <span key={part}>{new Date(start + (end - start) * part).toLocaleString([], { hour: 'numeric', month: forecast ? 'short' : undefined, day: forecast ? 'numeric' : undefined })}</span>)}</div>
      </div></div>
      <div className="forecast-footer"><span>{single ? `Last reading ${age(single.account.fetchedAt)}` : 'Click an account in the legend to show or hide its line.'}</span><span>{single?.quota ? `Next reset ${countdown(single.quota.resetsAt)}` : 'Missing readings stay as gaps.'}</span><button className="forecast-settings-toggle" aria-expanded={settings} onClick={() => showSettings(!settings)}><Settings2 size={13} /> Forecast settings {settings ? <ChevronUp size={12} /> : <ChevronDown size={12} />}</button></div>
      {settings && <div className="forecast-settings"><label><input type="checkbox" checked={forecast} onChange={e => setForecast(e.target.checked)} /> Show estimated projection</label><Dropdown label="Forecast horizon" value={horizon} onChange={v => setHorizon(Number(v))} options={[{ value: '24', label: 'Next 24 hours' }, { value: '72', label: 'Next 3 days' }, { value: '168', label: 'Next 7 days' }]} /><p>Dashed projections need fresh, continuous readings at least 15 minutes apart. They assume unchanged consumption and future resets; they do not combine accounts or redeem credits.</p></div>}
    </>}
  </section>;
}
