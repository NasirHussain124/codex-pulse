import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
const root = new URL('../public/providers/', import.meta.url);
test('provider SVGs are pinned, unmodified Lobe Icons with bundled MIT attribution', () => {
  const manifest = JSON.parse(fs.readFileSync(new URL('SOURCES.json', root), 'utf8'));
  assert.equal(manifest.commit, '7d7d0379f18b114a4009dc5cb85a7c375284f31b');
  assert.deepEqual(manifest.files.map(f => f.file).sort(), ['claude-color.svg', 'codex.svg', 'cursor.svg', 'gemini-color.svg', 'githubcopilot.svg']);
  for (const file of manifest.files) {
    const bytes = fs.readFileSync(new URL(file.file, root)), svg = bytes.toString('utf8');
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256);
    // Assets end in a source-file newline; vector markup is upstream-exact.
    assert.equal(createHash('sha256').update(svg.trimEnd()).digest('hex'), file.upstreamSha256);
    assert.match(file.source, new RegExp(manifest.commit + '/packages/static-svg/icons/'));
    assert.match(svg, /^<svg /); assert.match(svg, /viewBox="0 0 24 24"/);
    assert.doesNotMatch(svg, /<script|<foreignObject|\bon[a-z]+\s*=|(?:href|src)\s*=|url\((?!#)/i);
  }
  assert.match(fs.readFileSync(new URL('LICENSE.txt', root), 'utf8'), /Copyright \(c\) 2023 LobeHub/);
  const component = fs.readFileSync(new URL('../src/ProviderMark.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(component, /https?:\/\/|dangerouslySetInnerHTML/);
});
test('app icon stays distinct from provider marks and includes small native Windows sizes', () => {
  const svg = fs.readFileSync(new URL('../public/pulse.svg', import.meta.url), 'utf8');
  assert.match(svg, /<circle cx="30" cy="30" r="17"/); assert.match(svg, /#86D8BD/);
  const icon = fs.readFileSync(new URL('../public/pulse.ico', import.meta.url));
  assert.equal(icon.readUInt16LE(2), 1); assert.equal(icon.readUInt16LE(4), 8);
  const sizes = [];
  for (let i = 0; i < 8; i++) {
    const offset = 6 + i * 16, size = icon[offset] || 256;
    const length = icon.readUInt32LE(offset + 8), start = icon.readUInt32LE(offset + 12);
    assert.equal(icon.readUInt16LE(offset + 6), 32); assert.ok(start + length <= icon.length);
    assert.deepEqual([...icon.subarray(start, start + 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(icon.readUInt32BE(start + 16), size); sizes.push(size);
  }
  assert.deepEqual(sizes, [16, 20, 24, 32, 48, 64, 128, 256]);
  const manifest = fs.readFileSync(new URL('../mobile/android/app/src/main/AndroidManifest.xml', import.meta.url), 'utf8');
  assert.match(manifest, /android:icon="@mipmap\/ic_launcher"/);
  const themed = fs.readFileSync(new URL('../mobile/android/app/src/main/res/mipmap-anydpi-v33/ic_launcher.xml', import.meta.url), 'utf8');
  assert.match(themed, /monochrome/);
});
