import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { validateSettings } = createRequire(import.meta.url)('../electron/store.cjs');

test('settings accept only typed allowlisted values', () => {
  const result = validateSettings({ theme: 'javascript:bad', interval: 1, notifications: 'false', closeToTray: false });
  assert.equal(result.theme, 'dark'); assert.equal(result.interval, 120);
  assert.equal(result.notifications, true); assert.equal(result.closeToTray, false);
});
test('account labels are bounded and prototype keys cannot enter settings', () => {
  const input = JSON.parse('{"accounts":{"__proto__":{"polluted":true},"abcdef0123456789":{"label":"  Work  ","pinned":true}}}');
  const result = validateSettings(input);
  assert.equal(Object.keys(result.accounts).length, 1);
  assert.equal(result.accounts.abcdef0123456789.label, 'Work');
  assert.equal({}.polluted, undefined);
});

test('recommendation preferences are bounded, typed and preserved on unrelated edits', () => {
  const accepted = validateSettings({ recommendationMode: 'reserve', reservePercent: 30, sessionMinutes: 120, recommendationAlerts: false });
  assert.equal(accepted.recommendationMode, 'reserve'); assert.equal(accepted.reservePercent, 30);
  assert.equal(accepted.sessionMinutes, 120); assert.equal(accepted.recommendationAlerts, false);
  const refused = validateSettings({ recommendationMode: 'auto-spend', reservePercent: -1, sessionMinutes: Infinity, recommendationAlerts: 'true' }, accepted);
  assert.deepEqual(refused, accepted);
  assert.equal(validateSettings({ privacy: true }, accepted).recommendationMode, 'reserve');
});

test('phone auto-resume and discovery require typed opt-in and private endpoint preferences', () => {
  const defaults = validateSettings({ mobileResume: 'yes', mobileDiscovery: 1, mobileAddress: '8.8.8.8', mobileTransport: 'public' });
  assert.equal(defaults.mobileResume, false); assert.equal(defaults.mobileDiscovery, false); assert.equal(defaults.mobileAddress, '');
  const selected = validateSettings({ mobileResume: true, mobileDiscovery: true, mobileAddress: '100.90.1.2', mobileTransport: 'tailscale' });
  assert.equal(selected.mobileResume, true); assert.equal(selected.mobileTransport, 'tailscale');
  assert.equal(validateSettings({ mobileAddress: '192.168.999.1' }, selected).mobileAddress, '100.90.1.2');
});
