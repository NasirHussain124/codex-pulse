import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ANDROID, androidDownload } from '../electron/downloads.cjs';

test('Android distribution uses immutable, distinct direct-file hosts and the actual APK version', () => {
  assert.equal(androidDownload(), `https://cdn.jsdelivr.net/gh/NasirHussain124/codex-pulse@${ANDROID.commit}/Quota-management-Android.apk`);
  assert.equal(new URL(androidDownload('alternate')).hostname, 'raw.githubusercontent.com');
  assert.ok(androidDownload('alternate').includes('/' + ANDROID.commit + '/'));
  assert.equal(androidDownload('release'), 'https://github.com/NasirHussain124/codex-pulse/releases/tag/v' + ANDROID.version);
  assert.match(ANDROID.commit, /^[a-f0-9]{40}$/); assert.match(ANDROID.sha256, /^[a-f0-9]{64}$/);
  const gradle = fs.readFileSync(new URL('../mobile/android/app/build.gradle', import.meta.url), 'utf8');
  assert.ok(gradle.includes(`versionName '${ANDROID.version}'`));
  const main = fs.readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf8');
  assert.ok(main.includes('shell.openExternal(androidDownload(source))'));
  assert.ok(!main.includes('android-download-v0.5.0'));
});
test('Android download IPC cannot become an arbitrary shell URL opener', () => {
  for (const value of [null, {}, [], '__proto__', 'constructor', 'https://evil.example', 'file:///C:/Windows', 'javascript:alert(1)']) assert.throws(() => androidDownload(value), /supported/);
  assert.ok(Object.isFrozen(ANDROID));
});
