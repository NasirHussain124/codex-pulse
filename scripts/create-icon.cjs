// Generate the code-native quota meter / Q mark as a PNG and a Windows ICO. No external
// image service or build-time image library is needed.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const size = 256;
function crc32(buffer) { let crc = 0xffffffff; for (const byte of buffer) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); } return (crc ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const name = Buffer.from(type), head = Buffer.alloc(4), tail = Buffer.alloc(4); head.writeUInt32BE(data.length); tail.writeUInt32BE(crc32(Buffer.concat([name, data]))); return Buffer.concat([head, name, data, tail]); }
const raw = Buffer.alloc((size * 4 + 1) * size);
const segments = [[[24,26],[40,26]],[[24,35],[33,35]],[[39,42],[50,52]]];
function distance(x, y, a, b) { const dx = b[0] - a[0], dy = b[1] - a[1]; const t = Math.max(0, Math.min(1, ((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy))); return Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy); }
function roundedBox(x, y, cx, cy, width, height, radius) {
  const dx = Math.abs(x - cx) - width / 2 + radius, dy = Math.abs(y - cy) - height / 2 + radius;
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - radius;
}
for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
  const px = (x + .5) / 4, py = (y + .5) / 4;
  const alpha = Math.max(0, Math.min(1, .5 - roundedBox(px, py, 32, 32, 64, 64, 18) * 4));
  let d = Math.abs(roundedBox(px, py, 32, 30.5, 34, 35, 11));
  for (const segment of segments) d = Math.min(d, distance(px, py, segment[0], segment[1]));
  const stroke = Math.max(0, Math.min(1, .5 + (2.5 - d) * 4));
  const i = y * (size * 4 + 1) + 1 + x * 4;
  const base = [53,52,73], ink = [222,213,255];
  for (let c = 0; c < 3; c++) raw[i+c] = base[c] * (1-stroke) + ink[c] * stroke;
  raw[i+3] = alpha * 255;
}
const header = Buffer.alloc(13); header.writeUInt32BE(size,0); header.writeUInt32BE(size,4); header[8]=8; header[9]=6;
const png = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
const icoHeader=Buffer.alloc(22); icoHeader.writeUInt16LE(1,2); icoHeader.writeUInt16LE(1,4); icoHeader.writeUInt16LE(1,10); icoHeader.writeUInt16LE(32,12); icoHeader.writeUInt32LE(png.length,14); icoHeader.writeUInt32LE(22,18);
const output=path.join(__dirname,'..','public'); fs.mkdirSync(output,{recursive:true});
fs.writeFileSync(path.join(output,'pulse.png'),png); fs.writeFileSync(path.join(output,'pulse.ico'),Buffer.concat([icoHeader,png]));
