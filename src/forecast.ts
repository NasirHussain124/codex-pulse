import type { Account, HistorySample, QuotaWindow } from './types';

export interface Reading { at: number; remaining: number }
export function readingsFor(history: HistorySample[], account: Account | undefined, windowId: string): Reading[] {
  if (!account) return [];
  const points = history.flatMap(sample => {
    const row = sample.accounts.find(a => a.identity === account.identity);
    const window = row?.windows.find(w => windowId === 'weekly' ? w.durationMinutes === 10080 : w.id === windowId);
    const at = new Date(row?.fetchedAt || sample.at).getTime();
    return window && Number.isFinite(at) && Number.isFinite(window.remainingPercent) && window.remainingPercent >= 0 && window.remainingPercent <= 100 ? [{ at, remaining: window.remainingPercent }] : [];
  });
  return [...new Map(points.map(point => [point.at, point])).values()].sort((a, b) => a.at - b.at);
}
export function readingSegments(points: Reading[], maxGapMs = 1800000): Reading[][] {
  const segments: Reading[][] = [];
  for (const point of points) {
    const segment = segments.at(-1);
    if (!segment || point.at - segment.at(-1)!.at > maxGapMs) segments.push([point]);
    else segment.push(point);
  }
  return segments;
}
export function estimateDrain(points: Reading[]): number | null {
  // A quota reset starts a new series. Do not extrapolate across it.
  let start = 0;
  for (let i = 1; i < points.length; i++) if (points[i].remaining > points[i - 1].remaining + 2) start = i;
  const continuous = readingSegments(points.slice(start)).at(-1) || [];
  const series = continuous.slice(-48);
  if (series.length < 2) return null;
  const first = series[0], last = series.at(-1)!;
  const hours = (last.at - first.at) / 3600000;
  if (hours < .25) return null;
  const rate = (first.remaining - last.remaining) / hours;
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}
export function project(window: QuotaWindow | undefined, rate: number | null, now: number, end: number): Reading[] {
  if (!window || rate === null) return [];
  const reset = window.resetsAt ? new Date(window.resetsAt).getTime() : Infinity;
  if (reset <= now) return [];
  const period = window.durationMinutes * 60000;
  let at = now, remaining = window.remainingPercent, nextReset = reset;
  const result: Reading[] = [{ at, remaining }];
  // Bounded forecast with explicit reset jumps. A reset is an assumption,
  // not a purchased/banked reset; users always see the estimate label.
  for (let i = 0; i < 300 && at < end; i++) {
    const next = Math.min(end, at + 3600000, nextReset);
    remaining = Math.max(0, remaining - rate * ((next - at) / 3600000));
    result.push({ at: next, remaining }); at = next;
    if (at === nextReset) { remaining = 100; result.push({ at: at + 1, remaining }); nextReset += period; }
  }
  return result;
}
