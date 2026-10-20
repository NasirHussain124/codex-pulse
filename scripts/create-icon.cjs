// Generate the code-native Pulse mark as a PNG and a Windows ICO. No external
// image service or build-time image library is needed.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const size = 256;
function crc32(buffer) { let crc = 0xffffffff; for (const byte of buffer) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); } return (crc ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const name = Buffer.from(type), head = Buffer.alloc(4), tail = Buffer.alloc(4); head.writeUInt32BE(data.length); tail.writeUInt32BE(crc32(Buffer.concat([name, data]))); return Buffer.concat([head, name, data, tail]); }
const raw = Buffer.alloc((size * 4 + 1) * size);
const segments = [[[23,20],[11,32]],[[11,32],[23,44]],[[41,20],[53,32]],[[53,32],[41,44]],[[36,15],[28,49]]].map(segment => segment.map(p => p.map(v => v*4)));
function distance(x, y, a, b) { const dx = b[0] - a[0], dy = b[1] - a[1]; const t = Math.max(0, Math.min(1, ((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy))); return Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy); }
for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
  const cx = Math.max(74-x, 0, x-181), cy = Math.max(74-y, 0, y-181);
  const alpha = Math.max(0, Math.min(1, 75 - Math.hypot(cx, cy)));
  let stroke = 0; for (const segment of segments) stroke = Math.max(stroke, Math.max(0, Math.min(1, 7.5-distance(x+.5,y+.5,segment[0],segment[1]))));
  const i = y * (size * 4 + 1) + 1 + x * 4;
  const base = [34-y*.02,62-y*.04,48-y*.03];
  raw[i] = base[0] * (1-stroke) + 166 * stroke; raw[i+1] = base[1] * (1-stroke) + 214 * stroke; raw[i+2] = base[2] * (1-stroke) + 185 * stroke; raw[i+3] = alpha * 255;
}
const header = Buffer.alloc(13); header.writeUInt32BE(size,0); header.writeUInt32BE(size,4); header[8]=8; header[9]=6;
const png = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
const icoHeader=Buffer.alloc(22); icoHeader.writeUInt16LE(1,2); icoHeader.writeUInt16LE(1,4); icoHeader.writeUInt16LE(1,10); icoHeader.writeUInt16LE(32,12); icoHeader.writeUInt32LE(png.length,14); icoHeader.writeUInt32LE(22,18);
const output=path.join(__dirname,'..','public'); fs.mkdirSync(output,{recursive:true});
fs.writeFileSync(path.join(output,'pulse.png'),png); fs.writeFileSync(path.join(output,'pulse.ico'),Buffer.concat([icoHeader,png]));
