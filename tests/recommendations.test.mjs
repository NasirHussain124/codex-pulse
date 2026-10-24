import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectCandidate, recommend, resetAdvice } from '../src/recommendations.ts';
const now = Date.parse('2026-10-24T09:00:00Z');
const iso = minutes => new Date(now + minutes * 60000).toISOString();
const settings = { recommendationMode: 'consume', reservePercent: 20, sessionMinutes: 60 };
const quota = (duration, percent, reset) => ({ id: duration === 300 ? 'five_hour' : 'weekly', durationMinutes: duration, remainingPercent: percent, resetsAt: iso(reset) });
const account = (id = '1', overrides = {}) => ({ id, identity: id.padStart(16, '0'), email: `test-${id}@example.test`, provider: 'codex', plan: 'Pro',
  disabled: false, selected: false, status: 'ready', fetchedAt: iso(-1), windows: [quota(300, 80, 120), quota(10080, 70, 1440)], bankedResets: 0, ...overrides });
const candidate = a => inspectCandidate(a, settings, [], now);

test('consume mode favors sooner weekly reset while checking both limits', () => {
  const soon = account('1', { windows: [quota(300, 50, 100), quota(10080, 40, 180)] });
  const full = account('2', { windows: [quota(300, 99, 100), quota(10080, 99, 5000)] });
  assert.equal(recommend([full, soon], settings, [], now).account.id, '1');
});
test('zero in either window cannot be selected despite a high other window', () => {
  for (const duration of [300, 10080]) {
    const blocked = account('1', { windows: [quota(300, duration === 300 ? 0 : 100, 120), quota(10080, duration === 10080 ? 0 : 100, 1440)] });
    assert.equal(recommend([blocked, account('2')], settings, [], now).account.id, '2');
  }
});
test('stale, future-dated, reconnect, disabled, invalid and missing data fail safe', () => {
  const invalid = [account('1', { status: 'stale' }), account('2', { fetchedAt: iso(-6) }), account('3', { fetchedAt: iso(5) }),
    account('4', { status: 'reconnect' }), account('5', { disabled: true }), account('6', { windows: [quota(300, NaN, 20), quota(10080, 70, 500)] }),
    account('7', { windows: [quota(10080, 60, 100)] }), account('8', { windows: [quota(300, 20, -1), quota(10080, 40, 100)] })];
  const result = recommend(invalid, settings, [], now);
  assert.equal(result.action, 'refresh'); assert.equal(result.account, null);
  assert.ok(result.candidates.every(c => c.excluded && !c.usable));
});
test('reserve mode protects the configured floor in either window', () => {
  const low = account('1', { windows: [quota(300, 19, 120), quota(10080, 80, 100)] });
  const result = recommend([low, account('2')], { ...settings, recommendationMode: 'reserve' }, [], now);
  assert.equal(result.account.id, '2'); assert.match(result.reason, /20% reserve/);
  assert.equal(recommend([low], { ...settings, recommendationMode: 'reserve' }, [], now).action, 'refresh');
});
test('an expiring reset on a blocked account suggests review, never automatic redemption', () => {
  const blocked = account('1', { windows: [quota(300, 0, 120), quota(10080, 70, 1440)],
    resetCredits: { available: 2, earliestExpiresAt: iso(60), detailsKnown: true } });
  const result = recommend([blocked, account('2')], settings, [], now);
  assert.equal(result.action, 'review-reset'); assert.equal(result.account.id, '1');
  assert.match(result.reason, /eligibility must be checked/);
  assert.equal(blocked.resetCredits.available, 2);
});
test('nearby natural reset wins when the credit survives that reset', () => {
  const blocked = account('1', { windows: [quota(300, 0, 8), quota(10080, 70, 1440)], resetCredits: { available: 1, earliestExpiresAt: iso(90) } });
  assert.equal(recommend([blocked], settings, [], now).action, 'wait');
  assert.equal(resetAdvice(candidate(blocked), now).action, 'wait');
});
test('credit expiring before the natural reset remains worth reviewing', () => {
  const blocked = account('1', { windows: [quota(300, 0, 10), quota(10080, 70, 1440)], resetCredits: { available: 1, earliestExpiresAt: iso(3) } });
  assert.equal(recommend([blocked], settings, [], now).action, 'review-reset');
});
test('both blocked windows must recover before advice says to wait briefly', () => {
  const blocked = account('1', { windows: [quota(300, 0, 5), quota(10080, 0, 1440)], resetCredits: { available: 1, earliestExpiresAt: iso(60) } });
  assert.equal(candidate(blocked).blockedReset, now + 1440 * 60000);
  assert.equal(recommend([blocked], settings, [], now).action, 'review-reset');
});
test('usable quota preserves expiring credits while still surfacing expiry', () => {
  const good = account('1', { resetCredits: { available: 1, earliestExpiresAt: iso(50) } });
  const result = recommend([good], settings, [], now);
  assert.equal(result.action, 'use'); assert.equal(result.urgentResets.length, 1);
  assert.equal(resetAdvice(candidate(good), now).action, 'preserve-reset');
});
test('a count alone never invents expiry or creates urgency', () => {
  const blocked = account('1', { bankedResets: 2, windows: [quota(300, 0, 120), quota(10080, 70, 1440)] });
  const result = recommend([blocked], settings, [], now);
  assert.equal(result.urgentResets.length, 0);
  assert.equal(resetAdvice(candidate(blocked), now).action, 'review-reset');
  assert.match(resetAdvice(candidate(blocked), now).message, /expiry is not reported/);
});
test('expired, malformed or exhausted credit records cannot be urgent', () => {
  for (const resetCredits of [{ available: 1, earliestExpiresAt: iso(-1) }, { available: 1, earliestExpiresAt: 'bad' }, { available: 0, earliestExpiresAt: iso(60) }, { available: -1, earliestExpiresAt: iso(60) }]) {
    assert.equal(recommend([account('1', { resetCredits })], settings, [], now).urgentResets.length, 0);
  }
});
test('earliest expiring blocked account is reviewed first', () => {
  const make = (id, expires) => account(id, { windows: [quota(300, 0, 120), quota(10080, 70, 1440)], resetCredits: { available: 1, earliestExpiresAt: iso(expires) } });
  assert.equal(recommend([make('1', 180), make('2', 40)], settings, [], now).account.id, '2');
});
test('unknown reset time is not interpreted as soonest', () => {
  const unknown = account('1', { windows: [quota(300, 100, 120), { ...quota(10080, 100, 1440), resetsAt: null }] });
  assert.equal(recommend([unknown, account('2')], settings, [], now).account.id, '2');
});
test('session estimation requires independent recent history for both binding windows', () => {
  const a = account(), history = [30, 15, 0].map((minutes, i) => ({ at: iso(-minutes), accounts: [{ identity: a.identity, fetchedAt: iso(-minutes),
    windows: [quota(300, 90 - i * 5, 120), quota(10080, 80 - i * 5, 1440)] }] }));
  const c = inspectCandidate(a, { ...settings, recommendationMode: 'runway' }, history, now);
  assert.equal(c.runwayMinutes, 210); // 70% / 20% per hour
  const missing = history.map(h => ({ ...h, accounts: h.accounts.map(row => ({ ...row, windows: row.windows.slice(0, 1) })) }));
  assert.equal(inspectCandidate(a, settings, missing, now).runwayMinutes, null);
});
test('session fit outranks a tempting sooner-resetting but short-lived account', () => {
  const short = account('1', { windows: [quota(300, 5, 120), quota(10080, 5, 100)] }), long = account('2');
  const history = [30, 15, 0].map((minutes, i) => ({ at: iso(-minutes), accounts: [short, long].map(a => ({ identity: a.identity, fetchedAt: iso(-minutes), windows: a.windows.map(w => ({ ...w, remainingPercent: w.remainingPercent + (2 - i) * 5 })) })) }));
  assert.equal(recommend([short, long], settings, history, now).account.id, '2');
});
test('advice hysteresis avoids jitter without retaining an ineligible account', () => {
  const a = account('1'), b = account('2', { windows: [quota(300, 83, 120), quota(10080, 73, 1440)] });
  assert.equal(recommend([a, b], settings, [], now, a.identity).account.id, '1');
  assert.equal(recommend([{ ...a, disabled: true }, b], settings, [], now, a.identity).account.id, '2');
});
test('empty and all-blocked rosters return truthful actions', () => {
  assert.equal(recommend([], settings, [], now).action, 'none');
  const blocked = account('1', { windows: [quota(300, 0, 50), quota(10080, 60, 1440)] });
  assert.equal(recommend([blocked], settings, [], now).action, 'wait');
});

test('consume mode also values a soon-resetting 5h window when weekly timing is comparable', () => {
  const soon = account('1', { windows: [quota(300, 80, 10), quota(10080, 70, 4000)] });
  const later = account('2', { windows: [quota(300, 80, 290), quota(10080, 70, 4000)] });
  const result = recommend([later, soon], settings, [], now);
  assert.equal(result.account.id, '1'); assert.match(result.reason, /5h allowance resets soon/);
});
test('old consumption history never becomes a fresh working-time estimate', () => {
  const a = account(), old = [180, 165, 150].map((minutes, i) => ({ at: iso(-minutes), accounts: [{ identity: a.identity, fetchedAt: iso(-minutes), windows: [quota(300, 90 - i * 5, 120), quota(10080, 80 - i * 5, 1440)] }] }));
  assert.equal(inspectCandidate(a, settings, old, now).runwayMinutes, null);
});
test('runway does not compare minutes against a fabricated percentage-to-time conversion', () => {
  const known = account('1', { windows: [quota(300, 30, 120), quota(10080, 30, 1440)] }), unknown = account('2', { windows: [quota(300, 100, 120), quota(10080, 100, 1440)] });
  const history = [30, 15, 0].map((minutes, i) => ({ at: iso(-minutes), accounts: [{ identity: known.identity, fetchedAt: iso(-minutes), windows: known.windows.map(w => ({ ...w, remainingPercent: w.remainingPercent + (2 - i) * 10 })) }] }));
  // A measured 45-minute account cannot promise a planned hour. The unknown
  // account can be suggested for headroom, but must not claim a working time.
  const result = recommend([known, unknown], { ...settings, recommendationMode: 'runway' }, history, now);
  assert.equal(result.account.id, '2'); assert.match(result.reason, /More observations/);
  assert.equal(result.candidates.find(c => c.account.id === '2').runwayMinutes, null);
});
