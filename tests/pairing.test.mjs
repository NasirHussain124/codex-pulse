import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { copyPairingLink } = createRequire(import.meta.url)('../electron/pairing.cjs');
const link = patch => 'codexpulse://pair?data=' + Buffer.from(JSON.stringify({ version: 1, code: 'a'.repeat(43), fingerprint: 'b'.repeat(64), endpoint: 'https://192.168.1.2:47831', expiresAt: Date.now() + 120000, ...patch })).toString('base64url');
test('pairing Copy uses native clipboard without browser permission', () => {
  let copied; const value = link(); assert.equal(copyPairingLink(value, { writeText: text => { copied = text; } }), true); assert.equal(copied, value);
});
test('expired, malformed and arbitrary URLs never reach the clipboard', () => {
  for (const value of [null, 'https://example.test', 'codexpulse://pair?data=invalid', link({ expiresAt: 1 }), link({ code: 'wrong' })]) assert.throws(() => copyPairingLink(value, { writeText: () => assert.fail('Must not copy invalid input') }));
});
