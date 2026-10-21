import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import branding from '../electron/branding.cjs';

test('rebranding recovers legacy data into a host-independent profile', () => {
  assert.equal(branding.APP_NAME, 'Quota management');
  assert.equal(branding.userDataPath('profile'), path.join('profile', 'Codex Pulse'));
  const main = fs.readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf8');
  assert.ok(main.indexOf("app.setPath('userData', profileDirectory)") < main.indexOf('app.requestSingleInstanceLock()'));
  assert.ok(main.indexOf('prepareProfile({') < main.indexOf("app.setPath('userData', profileDirectory)"));
});
test('desktop and Android keep their upgrade identities and keys', () => {
  const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url)));
  assert.equal(pkg.productName, branding.APP_NAME); assert.equal(pkg.build.productName, branding.APP_NAME);
  assert.equal(pkg.build.appId, 'com.codexpulse.desktop'); assert.equal(pkg.build.executableName, 'Codex Pulse');
  const android = fs.readFileSync(new URL('../mobile/android/app/build.gradle', import.meta.url), 'utf8');
  assert.match(android, /applicationId 'com.codexpulse.companion'/);
  const store = fs.readFileSync(new URL('../mobile/android/app/src/main/java/com/codexpulse/companion/PhoneStore.java', import.meta.url), 'utf8');
  assert.match(store, /codex-pulse-companion-v1/);
});
