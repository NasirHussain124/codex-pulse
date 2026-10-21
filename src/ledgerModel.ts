import type { Account } from './types';
import { countdown } from './model.ts';

/** Each cell uses its exact provider window; an expired login never implies zero or a fresh reset. */
export function ledgerQuota(account: Account, duration: 300 | 10080, now = Date.now()) {
  const quota = account.windows.find(window => window.durationMinutes === duration);
  const reconnect = account.status === 'reconnect';
  const percent = !reconnect && quota && Number.isFinite(quota.remainingPercent) && quota.remainingPercent >= 0 && quota.remainingPercent <= 100 ? quota.remainingPercent : null;
  const reset = Date.parse(quota?.resetsAt || '');
  const fetched = Date.parse(account.fetchedAt || '');
  const stale = account.status !== 'ready' || !Number.isFinite(fetched) || now - fetched > 300000;
  const resetCaption = !Number.isFinite(reset) ? 'Reset not reported' : reset <= now ? 'Reset due · awaiting refresh' : `Resets in ${countdown(quota!.resetsAt, now)}`;
  return { percent, stale, resetsAt: percent !== null && Number.isFinite(reset) ? quota!.resetsAt : null,
    caption: reconnect ? 'Reconnect to see usage' : percent === null ? 'Not reported' : `${stale ? 'Saved · ' : ''}${resetCaption}` };
}
