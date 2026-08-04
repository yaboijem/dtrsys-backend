import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type);
  const crcBuf = Buffer.concat([t, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcBuf));
  return Buffer.concat([len, t, data, crc]);
}

function png(size, bg, fg) {
  const [br, bgc, bb] = bg;
  const [fr, fg2, fb] = fg;
  const margin = Math.floor(size * 0.18);
  const thick = Math.max(2, Math.floor(size * 0.12));
  const rows = [];

  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3);
    row[0] = 0;
    for (let x = 0; x < size; x++) {
      let r = br;
      let g = bgc;
      let b = bb;
      const lx = x - margin;
      const ly = y - margin;
      const w = size - 2 * margin;
      const h = size - 2 * margin;
      if (lx >= 0 && ly >= 0 && lx < w && ly < h) {
        const stem = lx < thick;
        const topBar = ly < thick && lx < w * 0.75;
        const botBar = ly >= h - thick && lx < w * 0.75;
        const cx = w * 0.45;
        const cy = h / 2;
        const rx = w * 0.45;
        const ry = h * 0.48;
        const nx = (lx - cx) / rx;
        const ny = (ly - cy) / ry;
        const d = nx * nx + ny * ny;
        const outer = d <= 1 && d >= 0.55 && lx >= w * 0.3;
        if (stem || topBar || botBar || outer) {
          r = fr;
          g = fg2;
          b = fb;
        }
      }
      const o = 1 + x * 3;
      row[o] = r;
      row[o + 1] = g;
      row[o + 2] = b;
    }
    rows.push(row);
  }

  const raw = Buffer.concat(rows);
  const compressed = zlib.deflateSync(raw);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const dir = path.join(__dirname, '..', 'public', 'icons');
fs.mkdirSync(dir, { recursive: true });
const bg = [12, 27, 42];
const fg = [241, 245, 249];
for (const s of [192, 512]) {
  fs.writeFileSync(path.join(dir, `icon-${s}.png`), png(s, bg, fg));
}
console.log('Wrote icons to', dir);
