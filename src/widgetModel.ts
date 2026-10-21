import type { Account, Settings } from './types';
import { countdown, label } from './model.ts';

export function widgetReading(account: Account, settings: Settings, now = Date.now()) {
  const duration = settings.widgetWindow === 'five_hour' ? 300 : 10080;
  const quota = account.status === 'reconnect' ? undefined : account.windows.find(w => w.durationMinutes === duration);
  const percent = quota && Number.isFinite(quota.remainingPercent) && quota.remainingPercent >= 0 && quota.remainingPercent <= 100 ? quota.remainingPercent : null;
  const fetched = Date.parse(account.fetchedAt || '');
  const stale = account.status !== 'ready' || !Number.isFinite(fetched) || now - fetched > 300000;
  const reset = Date.parse(quota?.resetsAt || '');
  const resetText = !Number.isFinite(reset) ? 'Reset not reported' : reset <= now ? 'Reset due · awaiting refresh' : `Resets in ${countdown(quota!.resetsAt)}`;
  const detail = account.status === 'reconnect' ? 'Reconnect on your PC' : percent === null ? 'Quota not reported' : `${stale ? 'Saved · ' : ''}${resetText}`;
  const name = settings.accounts[account.identity]?.label || (!settings.privacy && account.email ? account.email : label(account, settings));
  return { percent, stale, detail, name };
}

export function dualWidgetReading(account: Account, settings: Settings, now = Date.now()) {
  const five = widgetReading(account, { ...settings, widgetWindow: 'five_hour' }, now);
  const weekly = widgetReading(account, { ...settings, widgetWindow: 'weekly' }, now);
  return { name: label(account, settings), five, weekly,
    status: account.status === 'reconnect' ? 'Reconnect' : five.stale || weekly.stale ? 'Saved' : '',
    description: `5-hour: ${five.percent === null ? 'not reported' : Math.round(five.percent) + '% remaining'}. ${five.detail}. 7-day: ${weekly.percent === null ? 'not reported' : Math.round(weekly.percent) + '% remaining'}. ${weekly.detail}.` };
}
