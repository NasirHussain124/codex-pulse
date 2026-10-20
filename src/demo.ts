import type { AppState, Account, QuotaWindow } from './types';

const stamp = Date.now();
const after = (minutes: number) => new Date(stamp + minutes * 60000).toISOString();
const quota = (id: 'weekly' | 'five_hour', remaining: number, reset: number): QuotaWindow => ({ id, label: id === 'weekly' ? 'Weekly' : '5-hour window', durationMinutes: id === 'weekly' ? 10080 : 300, usedPercent: 100 - remaining, remainingPercent: remaining, resetsAt: after(reset) });
const accounts: Account[] = [
  { id: '1', identity: '0000000000000000', email: 'arjun.personal@gmail.com', plan: 'Pro', provider: 'codex', selected: true, disabled: false, status: 'ready', hint: null, windows: [quota('weekly', 74, 4260), quota('five_hour', 92, 106)], fetchedAt: after(-1), credits: null, bankedResets: 1 },
  { id: '2', identity: '0000000000000001', email: 'arjun@northstar.studio', plan: 'Business', provider: 'codex', selected: false, disabled: false, status: 'ready', hint: null, windows: [quota('weekly', 48, 1980), quota('five_hour', 68, 184)], fetchedAt: after(-1), credits: 120, bankedResets: null },
  { id: '3', identity: '0000000000000002', email: 'builds@northstar.studio', plan: 'Plus', provider: 'codex', selected: false, disabled: false, status: 'ready', hint: null, windows: [quota('weekly', 16, 540), quota('five_hour', 38, 213)], fetchedAt: after(-2), credits: null, bankedResets: 0 },
  { id: '4', identity: '0000000000000003', email: 'arjun.research@gmail.com', plan: 'Pro', provider: 'codex', selected: false, disabled: true, status: 'reconnect', hint: 'Sign in to this account in Codex, then save its login again.', windows: [], fetchedAt: null, credits: null, bankedResets: null },
];
export function demoState(desktop = false): AppState {
  return {
    snapshot: { schemaVersion: 1, generatedAt: after(-1), accounts, engine: { name: 'ccswap', version: '0.39.2', secureStorage: 'Windows DPAPI' } },
    settings: { theme: 'light', interval: 120, privacy: false, notifications: true, threshold: 20, startAtLogin: false, closeToTray: true, widgetWindow: 'weekly', widgetTop: true, compact: false,
      accounts: { '0000000000000000': { label: 'Personal', pinned: true }, '0000000000000001': { label: 'Northstar', pinned: true }, '0000000000000002': { label: 'Studio builds', pinned: false }, '0000000000000003': { label: 'Research', pinned: false } } },
    history: Array.from({ length: 7 }, (_, i) => ({ at: new Date(stamp - (6 - i) * 86400000).toISOString(), accounts: accounts.filter(a => a.windows.length).map((a, j) => ({ identity: a.identity, fetchedAt: new Date(stamp - (6 - i) * 86400000 - 60000).toISOString(), windows: a.windows.map(w => ({ ...w, remainingPercent: Math.min(100, w.remainingPercent + (6 - i) * (3 + j * 1.5)), usedPercent: Math.max(0, w.usedPercent - (6 - i) * (3 + j * 1.5)) })) })) })),
    events: [{ id: '1', kind: 'refresh', title: 'Usage refreshed across 3 accounts', at: after(-1) }, { id: '2', kind: 'switch', title: 'Personal selected for the next launch', at: after(-24) }, { id: '3', kind: 'account', title: 'Northstar account added securely', at: after(-138) }],
    refreshing: false, engineError: null, desktop, demo: true, version: '0.2.0',
  };
}
