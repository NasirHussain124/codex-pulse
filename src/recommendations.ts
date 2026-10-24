import type { Account, HistorySample, Settings } from './types';
import { estimateDrain, readingsFor } from './forecast.ts';

export type Strategy = 'consume' | 'runway' | 'reserve';
export type AdviceAction = 'use' | 'review-reset' | 'wait' | 'preserve-reset' | 'refresh' | 'none';
export interface Candidate {
  account: Account; usable: boolean; excluded: string | null; headroom: number;
  runwayMinutes: number | null; nextReset: number | null; weeklyReset: number | null;
  blockedReset: number | null; expiry: number | null; resets: number | null;
  meetsSession: boolean; score: number; priorityWindow: '5h' | 'weekly' | null;
}
export interface Advice {
  action: AdviceAction; account: Account | null; title: string; reason: string;
  confidence: 'observed' | 'estimated' | 'limited'; candidates: Candidate[];
  alternatives: Candidate[]; urgentResets: Candidate[]; generatedAt: number;
}
const date = (value: string | null | undefined) => {
  const result = Date.parse(value || ''); return Number.isFinite(result) ? result : null;
};
const percentage = (value: number) => Number.isFinite(value) && value >= 0 && value <= 100;

export function inspectCandidate(account: Account, settings: Settings, history: HistorySample[], now: number): Candidate {
  const fetched = date(account.fetchedAt);
  const windows = account.windows.filter(w => percentage(w.remainingPercent) && Number.isFinite(w.durationMinutes) && w.durationMinutes > 0);
  const required = account.windows.filter(w => w.durationMinutes === 300 || w.durationMinutes === 10080);
  const complete = required.some(w => w.durationMinutes === 300) && required.some(w => w.durationMinutes === 10080)
    && required.every(w => percentage(w.remainingPercent));
  const times = windows.map(w => date(w.resetsAt)).filter((value): value is number => value !== null && value > now);
  const expiredWindow = windows.some(w => { const reset = date(w.resetsAt); return reset !== null && reset <= now; });
  const excluded = account.disabled || settings.accounts?.[account.identity]?.group === 'reserved' ? 'Excluded from recommendations'
    : account.status === 'reconnect' ? 'Sign-in needs reconnecting'
      : account.status !== 'ready' || fetched === null || now - fetched > 300000 || fetched > now + 60000 ? 'Refresh needed before recommending'
        : !complete ? 'Both 5h and 7-day limits must be reported'
          : expiredWindow ? 'Reset due; waiting for a fresh reading' : null;
  const headroom = windows.length ? Math.min(...windows.map(w => w.remainingPercent)) : 0;
  const runway = windows.map(w => {
    const points = readingsFor(history, account, w.id);
    const latest = points.at(-1)?.at;
    const rate = latest !== undefined && latest >= now - 300000 && latest <= now + 60000 ? estimateDrain(points) : null;
    return rate !== null ? w.remainingPercent / rate * 60 : null;
  });
  // Both binding windows need enough observations; one known rate cannot
  // promise that another limit will last. No message/token estimate is invented.
  const runwayMinutes = runway.length > 0 && runway.every(v => v !== null) ? Math.min(...runway as number[]) : null;
  const blockedTimes = windows.filter(w => w.remainingPercent <= 0).map(w => date(w.resetsAt));
  const blockedReset = blockedTimes.length && blockedTimes.every((v): v is number => v !== null && v > now) ? Math.max(...blockedTimes as number[]) : null;
  const weekly = windows.find(w => w.durationMinutes === 10080);
  const creditExpiry = date(account.resetCredits?.earliestExpiresAt);
  const rawCount = account.resetCredits?.available ?? account.bankedResets;
  const resets = Number.isSafeInteger(rawCount) && rawCount !== null && rawCount >= 0 ? rawCount : null;
  const expiry = creditExpiry !== null && creditExpiry > now && resets !== null && resets > 0 ? creditExpiry : null;
  const reserve = settings.recommendationMode === 'reserve' ? settings.reservePercent ?? 20 : 0;
  const usable = excluded === null && headroom > reserve;
  const meetsSession = runwayMinutes === null || runwayMinutes >= (settings.sessionMinutes ?? 60);
  const weeklyReset = date(weekly?.resetsAt);
  const fiveReset = date(windows.find(w => w.durationMinutes === 300)?.resetsAt);
  const urgency = (reset: number | null) => reset !== null && reset > now ? 1 / (1 + (reset - now) / 3600000) : 0;
  const weeklyUrgency = urgency(weeklyReset) * 1000, fiveUrgency = urgency(fiveReset) * 200;
  const priorityWindow = weeklyUrgency === 0 && fiveUrgency === 0 ? null : weeklyUrgency >= fiveUrgency ? 'weekly' : '5h';
  // Do not compare estimated minutes with a percentage masquerading as minutes.
  // In runway mode: measured session fit, then unknown, then measured short.
  // Within the unknown tier only, use headroom without promising working time.
  const sessionTier = settings.recommendationMode === 'runway' ? runwayMinutes === null ? 1 : meetsSession ? 2 : 0 : meetsSession ? 1 : 0;
  const score = sessionTier * 1000000 + (settings.recommendationMode === 'runway'
    ? Math.min(runwayMinutes ?? headroom, 100000) : weeklyUrgency + fiveUrgency + headroom);
  return { account, usable, excluded, headroom, runwayMinutes, nextReset: times.length ? Math.min(...times) : null,
    weeklyReset: weeklyReset !== null && weeklyReset > now ? weeklyReset : null,
    blockedReset, expiry, resets, meetsSession, score, priorityWindow };
}

export function recommend(accounts: Account[], settings: Settings, history: HistorySample[], now = Date.now(), previousIdentity?: string): Advice {
  const candidates = accounts.map(a => inspectCandidate(a, settings, history, now));
  const urgentResets = candidates.filter(c => !c.excluded && c.expiry !== null && c.expiry - now <= 86400000).sort((a, b) => a.expiry! - b.expiry!);
  const ranked = candidates.filter(c => c.usable).sort((a, b) => b.score - a.score || a.account.identity.localeCompare(b.account.identity));
  let best = ranked[0];
  // Retain the prior advice for small score changes, never across eligibility or
  // session-fit changes. This is advice hysteresis, not automatic switching.
  const previous = ranked.find(c => c.account.identity === previousIdentity);
  if (best && previous && previous.meetsSession === best.meetsSession && best.score - previous.score < 8) best = previous;
  const base = { candidates, alternatives: ranked.filter(c => c !== best).slice(0, 2), urgentResets, generatedAt: now };
  const reset = urgentResets.find(c => c.headroom <= 0);
  if (reset) {
    if (reset.blockedReset !== null && reset.blockedReset - now <= 15 * 60000 && reset.expiry! > reset.blockedReset + 5 * 60000) {
      return { ...base, action: 'wait', account: reset.account, title: 'A natural reset is close',
        reason: 'Wait for the reported reset and refresh before using a banked credit. Other accounts remain available below.', confidence: 'observed' };
    }
    return { ...base, action: 'review-reset', account: reset.account, title: 'An unused reset expires soon',
      reason: 'This account has reached a quota limit. Review its earliest-expiring reset if you need to continue working; eligibility must be checked before redemption.', confidence: 'observed' };
  }
  if (best) {
    const mode = settings.recommendationMode ?? 'consume';
    return { ...base, action: 'use', account: best.account, title: best.account.selected ? 'Your selected account is a good fit' : 'Your next account, picked thoughtfully',
      reason: !best.meetsSession ? 'It has usable quota, but recent consumption suggests it may not cover your planned session.'
        : mode === 'runway' ? best.runwayMinutes !== null ? 'The longest estimated runway across both limits, based on recent observations.' : 'Strong headroom across both limits. More observations are needed to estimate working time.'
          : mode === 'reserve' ? `Keeps your ${settings.reservePercent ?? 20}% reserve intact while favoring allowance that resets sooner.`
            : best.priorityWindow === '5h' ? 'Its 5h allowance resets soon, with room in the weekly limit too. Use existing allowance before it refreshes.'
              : best.priorityWindow === 'weekly' ? 'Its weekly allowance resets sooner, with room in both quota windows. Use existing allowance before it refreshes.' : 'Usable headroom in both quota windows. Reset timing is not reported, so no urgency is assumed.',
      confidence: best.runwayMinutes === null ? 'observed' : 'estimated' };
  }
  const wait = candidates.filter(c => !c.excluded && c.blockedReset !== null).sort((a, b) => a.blockedReset! - b.blockedReset!)[0];
  if (wait) return { ...base, action: 'wait', account: wait.account, title: 'Your next quota window is on its way',
    reason: 'No eligible account currently has usable headroom. Refresh after the reported reset; the countdown is not a new quota reading.', confidence: 'observed' };
  return { ...base, action: accounts.length ? 'refresh' : 'none', account: null,
    title: accounts.length ? 'Let’s get a clearer reading' : 'Make room for your best work',
    reason: accounts.length ? 'No account can be recommended with confidence. Refresh readings, reconnect an account, or adjust your reserve and exclusions.' : 'Add an account to see your next best action here.', confidence: 'limited' };
}

export function resetAdvice(candidate: Candidate, now = Date.now()): { action: AdviceAction; message: string } {
  if (candidate.excluded) return { action: 'refresh', message: candidate.excluded === 'Excluded from recommendations' ? 'This account is reserved or excluded from recommendations. Adjust that setting before using it in your next-account plan.' : 'Refresh this account before making a reset decision.' };
  if (candidate.resets === null) return { action: 'none', message: 'Reset availability has not been reported.' };
  if (!candidate.resets) return { action: 'none', message: 'No banked resets reported.' };
  if (candidate.blockedReset !== null && candidate.blockedReset - now <= 15 * 60000 && (candidate.expiry === null || candidate.expiry > candidate.blockedReset + 5 * 60000)) {
    return { action: 'wait', message: 'The natural reset is close. Wait and refresh before spending a credit.' };
  }
  if (candidate.headroom > 0) return { action: 'preserve-reset', message: candidate.expiry !== null && candidate.expiry - now <= 86400000
    ? 'A reset expires soon, but usable quota remains. Use existing allowance first; redeem only if it becomes useful.' : 'Usable quota remains. Keep your resets for when you need them.' };
  return { action: 'review-reset', message: candidate.expiry !== null ? 'Review the earliest-expiring reset if you need to continue. Redemption still needs an eligibility check.' : 'A reset is available, but its expiry is not reported. Review it without assuming urgency.' };
}
