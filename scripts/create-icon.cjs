// Original, code-native Q / dual-window mark. Render the same geometry at
// native Windows icon sizes, avoiding downscaled 256px-only tray bitmaps.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
function crc32(buffer) { let crc = 0xffffffff; for (const byte of buffer) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); } return (crc ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const name = Buffer.from(type), head = Buffer.alloc(4), tail = Buffer.alloc(4); head.writeUInt32BE(data.length); tail.writeUInt32BE(crc32(Buffer.concat([name, data]))); return Buffer.concat([head, name, data, tail]); }
function distance(x, y, a, b) { const dx = b[0] - a[0], dy = b[1] - a[1]; const t = Math.max(0, Math.min(1, ((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy))); return Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy); }
function roundedBox(x, y, radius) { const dx = Math.abs(x-32)-32+radius, dy = Math.abs(y-32)-32+radius; return Math.hypot(Math.max(dx,0),Math.max(dy,0))+Math.min(Math.max(dx,dy),0)-radius; }
const clamp = value => Math.max(0, Math.min(1, value));
function png(size) {
  const scale = size / 64, raw = Buffer.alloc((size*4+1)*size);
  const blend = (base, ink, coverage) => base.map((value,i) => value*(1-coverage)+ink[i]*coverage);
  for (let y=0;y<size;y++) for(let x=0;x<size;x++) {
    // Four-by-four supersampling keeps round caps legible at 16px and 20px.
    const sum=[0,0,0,0];
    for(let sy=0;sy<4;sy++) for(let sx=0;sx<4;sx++) {
      const px=(x+(sx+.5)/4)/scale, py=(y+(sy+.5)/4)/scale;
      const cover = (d,width) => clamp(.5+(width-d)*scale*4);
      const alpha=clamp(.5-roundedBox(px,py,19)*scale*4);
      const ring=Math.abs(Math.hypot(px-30,py-30)-17);
      let rgb=blend([37,33,46],[221,207,255],cover(ring,3.25));
      const arc=px>=30&&py<=30 ? ring : Math.min(Math.hypot(px-30,py-13),Math.hypot(px-47,py-30));
      rgb=blend(rgb,[134,216,189],cover(arc,3.25));
      rgb=blend(rgb,[221,207,255],cover(distance(px,py,[40,40],[49,49]),3.25));
      const bars=Math.min(distance(px,py,[24,27],[36,27]),distance(px,py,[24,34],[31,34]));
      rgb=blend(rgb,[221,207,255],cover(bars,2));
      for(let i=0;i<3;i++) sum[i]+=rgb[i]*alpha/16;
      sum[3]+=alpha/16;
    }
    const offset=y*(size*4+1)+1+x*4;
    for(let i=0;i<3;i++) raw[offset+i]=sum[3] ? Math.round(sum[i]/sum[3]) : 0;
    raw[offset+3]=Math.round(sum[3]*255);
  }
  const header=Buffer.alloc(13);header.writeUInt32BE(size,0);header.writeUInt32BE(size,4);header[8]=8;header[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
const sizes=[16,20,24,32,48,64,128,256], images=sizes.map(png);
const header=Buffer.alloc(6+sizes.length*16);header.writeUInt16LE(1,2);header.writeUInt16LE(sizes.length,4);
let position=header.length;
images.forEach((image,i)=>{const offset=6+i*16;header[offset]=header[offset+1]=sizes[i]===256?0:sizes[i];header.writeUInt16LE(1,offset+4);header.writeUInt16LE(32,offset+6);header.writeUInt32LE(image.length,offset+8);header.writeUInt32LE(position,offset+12);position+=image.length;});
const output=path.join(__dirname,'..','public');fs.mkdirSync(output,{recursive:true});
fs.writeFileSync(path.join(output,'pulse.png'),images.at(-1));
fs.writeFileSync(path.join(output,'pulse.ico'),Buffer.concat([header,...images]));
for(let i=0;i<sizes.length;i++) if(sizes[i]<=64) fs.writeFileSync(path.join(output,'pulse-'+sizes[i]+'.png'),images[i]);
