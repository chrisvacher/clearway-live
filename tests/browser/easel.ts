// A plain 640 by 480 picture of an easel page (white paper with a few dark lines), made without a library, for the
// kits that put a photo through the scribe console.
import { deflateSync } from "node:zlib";

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf: Buffer) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type: string, data: Buffer) => { const head = Buffer.alloc(8); head.writeUInt32BE(data.length, 0); head.write(type, 4); const tail = Buffer.alloc(4); tail.writeUInt32BE(crc(Buffer.concat([head.subarray(4), data])), 0); return Buffer.concat([head, data, tail]); };
export function easelPng() {
  const w = 640, h = 480, rows: Buffer[] = [];
  for (let y = 0; y < h; y++) { const row = Buffer.alloc(1 + w * 3, 255); row[0] = 0; if (y % 60 === 30) for (let x = 40; x < w - 40; x++) { row[1 + x * 3] = 40; row[2 + x * 3] = 60; row[3 + x * 3] = 90; } rows.push(row); }
  const header = Buffer.alloc(13); header.writeUInt32BE(w, 0); header.writeUInt32BE(h, 4); header[8] = 8; header[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(Buffer.concat(rows))), chunk("IEND", Buffer.alloc(0))]);
}
