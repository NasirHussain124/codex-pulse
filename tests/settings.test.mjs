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
