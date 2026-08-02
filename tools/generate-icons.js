// Generates branded PNG icons with zero third-party deps (pure Node + zlib).
// Draws a fresh-green tile with a white leaf emblem. Supersampled for smooth
// edges. Run: node tools/generate-icons.js
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', 'icons');
fs.mkdirSync(OUT_DIR, { recursive: true });

// ---- PNG encoder (RGBA, 8-bit) ----
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}
function encodePng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  // add filter byte (0) per row
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- Drawing ----
// Light-blue theme (matches CSS --primary / --primary-dark).
const GREEN = [24, 119, 209]; // #1877D1 (primary blue, AA vs white)
const GREEN_DARK = [17, 96, 172]; // #1160AC
const WHITE = [255, 255, 255];

function mix(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

// Leaf via vesica (intersection of two circles), rotated 45 degrees.
function leafCoverage(nx, ny) {
  // rotate -45deg
  const ang = -Math.PI / 4;
  const x = nx * Math.cos(ang) - ny * Math.sin(ang);
  const y = nx * Math.sin(ang) + ny * Math.cos(ang);
  const R = 0.95;
  const d = 0.5;
  const inLeft = Math.hypot(x + d, y) <= R;
  const inRight = Math.hypot(x - d, y) <= R;
  const inLeaf = inLeft && inRight;
  // midrib (vein) along x=0 within the leaf
  const isVein = inLeaf && Math.abs(x) < 0.045 && Math.abs(y) < 0.72;
  return { inLeaf, isVein };
}

function render(size) {
  const SS = 4; // supersample
  const S = size * SS;
  const rgba = Buffer.alloc(size * size * 4);

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0,
        g = 0,
        b = 0,
        a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const X = px * SS + sx + 0.5;
          const Y = py * SS + sy + 0.5;
          // background: vertical gradient green -> darker green
          const t = Y / S;
          let col = mix(GREEN, GREEN_DARK, t * 0.55);
          let alpha = 255;
          // normalized coords centered, range ~[-1,1]
          const nx = (X / S) * 2 - 1;
          const ny = (Y / S) * 2 - 1;
          const scale = 1.35; // shrink leaf a bit
          const { inLeaf, isVein } = leafCoverage(nx * scale, ny * scale);
          if (inLeaf) col = isVein ? GREEN : WHITE;
          r += col[0];
          g += col[1];
          b += col[2];
          a += alpha;
        }
      }
      const n = SS * SS;
      const i = (py * size + px) * 4;
      rgba[i] = Math.round(r / n);
      rgba[i + 1] = Math.round(g / n);
      rgba[i + 2] = Math.round(b / n);
      rgba[i + 3] = Math.round(a / n);
    }
  }
  return encodePng(size, size, rgba);
}

const targets = [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon-180.png', 180],
];
for (const [name, size] of targets) {
  const png = render(size);
  fs.writeFileSync(path.join(OUT_DIR, name), png);
  console.log('wrote', name, size + 'x' + size, png.length + ' bytes');
}
