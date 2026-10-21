import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { popoverBounds } = createRequire(import.meta.url)('../electron/popover.cjs');
const area = { x: 0, y: 48, width: 1920, height: 1032 };
test('tray popover anchors below a top taskbar and above a bottom taskbar', () => {
  const top = popoverBounds({ x: 1840, y: 5, width: 24, height: 24 }, area, 4);
  const bottom = popoverBounds({ x: 1840, y: 1084, width: 24, height: 24 }, area, 4);
  assert.equal(top.y, 56); assert.equal(bottom.y + bottom.height, 1072);
  assert.equal(top.width, 400); assert.equal(top.height, 334);
});
test('side taskbars, tray overflow and negative monitor origins remain on-screen', () => {
  for (const display of [area, { x: -1600, y: -100, width: 1600, height: 900 }]) {
    for (const anchor of [
      { x: display.x - 30, y: display.y + 400, width: 24, height: 24 },
      { x: display.x + display.width + 2, y: display.y + 200, width: 24, height: 24 },
      { x: display.x + 1000, y: display.y + 450, width: 24, height: 24 },
    ]) {
      const p = popoverBounds(anchor, display, 20);
      assert.ok(p.x >= display.x && p.y >= display.y);
      assert.ok(p.x + p.width <= display.x + display.width && p.y + p.height <= display.y + display.height);
    }
  }
});
test('small displays and large rosters are bounded rather than clipped off-screen', () => {
  const p = popoverBounds({ x: 290, y: 190, width: 24, height: 24 }, { x: 0, y: 0, width: 320, height: 240 }, 500);
  assert.equal(p.width, 304); assert.equal(p.height, 224); assert.equal(p.x, 8); assert.equal(p.y, 8);
});
