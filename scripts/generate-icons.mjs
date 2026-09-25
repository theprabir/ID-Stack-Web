/**
 * Generates simple PWA icons (PNG) from an inline SVG without external deps,
 * by drawing on a Node canvas-less approach: we hand-encode a minimal PNG.
 *
 * Simpler and more robust: write the SVG sources and a tiny PNG encoder is
 * overkill — instead we generate PNGs using zlib (built into Node) to
 * compress raw pixel data. This produces solid-color rounded icons with a
 * simple card glyph.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(__dirname, '..', 'public');
mkdirSync(publicDir, { recursive: true });

/** CRC32 for PNG chunks */
function crc32(buffer) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      table[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buffer.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buffer[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([length, typeBuf, data, crcBuf]);
}

/**
 * Render a simple ID-card glyph icon at the given size.
 * Background #0078D4, white rounded card with a blue stripe.
 */
function renderIcon(size) {
  const px = Buffer.alloc(size * size * 4);
  const radius = Math.round(size * 0.1);
  const cardX = Math.round(size * 0.15);
  const cardY = Math.round(size * 0.25);
  const cardW = size - 2 * cardX;
  const cardH = size - 2 * cardY;
  const stripeH = Math.round(cardH * 0.28);

  const insideRoundedRect = (x, y, rx, ry, w, h, r) => {
    if (x < rx || x >= rx + w || y < ry || y >= ry + h) return false;
    // Corner check
    const cx = x < rx + r ? rx + r : x >= rx + w - r ? rx + w - r : null;
    const cy = y < ry + r ? ry + r : y >= ry + h - r ? ry + h - r : null;
    if (cx !== null && cy !== null) {
      const dx = x - cx;
      const dy = y - cy;
      return dx * dx + dy * dy <= r * r;
    }
    return true;
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      let r = 0;
      let g = 120;
      let b = 212; // #0078D4 background
      let a = 255;

      if (insideRoundedRect(x, y, cardX, cardY, cardW, cardH, Math.round(size * 0.06))) {
        r = 255;
        g = 255;
        b = 255; // white card
        if (y < cardY + stripeH) {
          r = 0;
          g = 120;
          b = 212; // blue stripe
        } else if (
          insideRoundedRect(x, y, cardX + Math.round(cardW * 0.08), cardY + Math.round(cardH * 0.45), Math.round(cardW * 0.3), Math.round(cardH * 0.14), 2)
        ) {
          r = 0;
          g = 120;
          b = 212; // text line 1
        } else if (
          insideRoundedRect(x, y, cardX + Math.round(cardW * 0.08), cardY + Math.round(cardH * 0.68), Math.round(cardW * 0.5), Math.round(cardH * 0.14), 2)
        ) {
          r = 0;
          g = 120;
          b = 212; // text line 2
        }
      }

      // Rounded app corners (transparent outside)
      const cornerR = radius;
      const nearCorner =
        (x < cornerR && y < cornerR) ||
        (x >= size - cornerR && y < cornerR) ||
        (x < cornerR && y >= size - cornerR) ||
        (x >= size - cornerR && y >= size - cornerR);
      if (nearCorner) {
        const cx = x < size / 2 ? cornerR : size - cornerR;
        const cy = y < size / 2 ? cornerR : size - cornerR;
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy > cornerR * cornerR) {
          a = 0;
        }
      }

      px[idx] = r;
      px[idx + 1] = g;
      px[idx + 2] = b;
      px[idx + 3] = a;
    }
  }
  return px;
}

function pngFromRGBA(px, size) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  // raw scanlines with filter byte 0
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const size of [192, 512]) {
  const png = pngFromRGBA(renderIcon(size), size);
  writeFileSync(resolve(publicDir, `pwa-${size}x${size}.png`), png);
  console.log(`Wrote public/pwa-${size}x${size}.png (${png.length} bytes)`);
}

// favicon.ico: browsers accept PNG-in-ICO; write a 32x32 PNG-derived .ico
const size32 = 32;
const png32 = pngFromRGBA(renderIcon(size32), size32);
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(1, 4); // count
const entry = Buffer.alloc(16);
entry[0] = size32; // width
entry[1] = size32; // height
entry[2] = 0; // colors
entry[3] = 0; // reserved
entry.writeUInt16LE(1, 4); // planes
entry.writeUInt16LE(32, 6); // bpp
entry.writeUInt32LE(png32.length, 8);
entry.writeUInt32LE(22, 12); // offset: 6 + 16
writeFileSync(resolve(publicDir, 'favicon.ico'), Buffer.concat([header, entry, png32]));
console.log('Wrote public/favicon.ico');
