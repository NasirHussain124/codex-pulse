import type { Account, Settings, QuotaWindow } from './types';

export const palette = ['#8d72db', '#61a89e', '#d49663', '#7898c9', '#b77daa', '#7fa46a'];
export function color(account: Account) { return palette[(parseInt(account.identity.slice(-2), 16) || 0) % palette.length]; }
export function label(account: Account, settings: Settings) { return settings.accounts[account.identity]?.label || account.email.split('@')[0] || `Account ${account.id}`; }
export function email(account: Account, settings: Settings) { return settings.privacy ? `${account.email.slice(0, 1)}••••@${account.email.split('@')[1] || 'private'}` : account.email; }
export function pinned(account: Account, settings: Settings) { return Boolean(settings.accounts[account.identity]?.pinned); }
export function primaryWindow(account: Account, selected = 'weekly'): QuotaWindow | undefined {
  return account.windows.find(window => selected === 'weekly' ? window.durationMinutes === 10080 : window.id === selected) || account.windows[0];
}
export function lowest(account: Account) { return account.windows.length ? Math.min(...account.windows.map(w => w.remainingPercent)) : null; }
export function needsAttention(account: Account, threshold = 20) { const value = lowest(account); return ['reconnect', 'unavailable', 'stale'].includes(account.status) || (value !== null && value <= threshold); }
export function age(value: string | null): string {
  if (!value) return 'Not refreshed yet';
  const seconds = Math.max(0, (Date.now() - new Date(value).getTime()) / 1000);
  if (!Number.isFinite(seconds)) return 'Time unavailable';
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
export function countdown(value: string | null): string {
  if (!value) return 'Reset unavailable';
  const delta = new Date(value).getTime() - Date.now();
  if (!Number.isFinite(delta)) return 'Reset unavailable';
  if (delta <= 0) return 'Awaiting refresh';
  const mins = Math.ceil(delta / 60000), days = Math.floor(mins / 1440), hours = Math.floor((mins % 1440) / 60);
  return days ? `${days}d ${hours}h` : hours ? `${hours}h ${mins % 60}m` : `${mins}m`;
}
export function statusLabel(account: Account, threshold: number) {
  if (account.status === 'reconnect') return 'Reconnect needed';
  if (account.status === 'stale') return 'Last known reading';
  if (account.status === 'unavailable') return 'Usage unavailable';
  if (account.status === 'api_key') return 'API-key account';
  if (account.disabled) return 'Excluded from rotation';
  if ((lowest(account) ?? 100) <= threshold) return 'Low headroom';
  return 'Ready to go';
}
