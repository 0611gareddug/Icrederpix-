// 아이콘 PNG 생성 (픽셀아트 → 확대)
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const ART = [
  '................................',
  '................................',
  '................................',
  '..........kkkkkkkkkkkk..........',
  '.........kYYYYYYYYYYYYk.........',
  '.........kYwwwwYYYYYYYk.........',
  '.........kYwYYYYYYYYYdk.........',
  '.........kYYYYYYYYYYYdk.........',
  '.........kYYYYkkYYkkYdk.........',
  '.........kYYYYkwYYkwYdk.........',
  '.........kYYYYkkYYkkYdk.........',
  '.........kYYYYYYYYYYYdk.........',
  '.........kYYYYkYYYYkYdk.........',
  '.........kYYYYYkkkkYYdk.........',
  '.........kddddddddddddk.........',
  '..........kkkkkkkkkkkk..........',
  '...........kYYYYYYYYk...........',
  '..........kYkYYYYYYkYk..........',
  '..........kYkYYYYYYkYk..........',
  '...........kddddddddk...........',
  '...........kbbk..kbbk...........',
  '...........kbbk..kbbk...........',
  '..........kkkkkkkkkkkk..........',
  '....g..g..g..g..g..g..g..g..g...',
  '...ggg.ggg.ggg.ggg.ggg.ggg.ggg..',
  '..GGGGGGGGGGGGGGGGGGGGGGGGGGGGG.',
  '..GrrrGGGGGGGGGGGGGGGGGGGGGrrrG.',
  '..GrrrrrrrrrrrrrrrrrrrrrrrrrrrG.',
  '..GrrrrrrrrrrrrrrrrrrrrrrrrrrrG.',
  '..GGGGGGGGGGGGGGGGGGGGGGGGGGGGG.',
  '................................',
  '................................',
];
const PAL = { '.': [20, 18, 31], k: [27, 23, 38], Y: [255, 207, 58], w: [255, 255, 255], d: [199, 140, 16], b: [90, 60, 20], g: [232, 236, 244], G: [106, 112, 128], r: [154, 160, 174] };

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size) {
  const sc = size / 32;
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const ch = ART[Math.floor(y / sc)][Math.floor(x / sc)];
      const c = PAL[ch] || PAL['.'];
      const o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = c[0]; raw[o + 1] = c[1]; raw[o + 2] = c[2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
export function makeIcons(root) {
  writeFileSync(root + 'icon-192.png', png(192));
  writeFileSync(root + 'icon-512.png', png(512));
}
