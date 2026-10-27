// Build-time raster images for search engines and link previews: the
// 1200x630 Open Graph card and the PNG app icons. Social sites and iOS do
// not accept SVG there, so they are drawn pixel by pixel from the same
// sprites and favicon the page uses, and encoded as PNG with node:zlib.
import { readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { ART, PALETTE } from './src/sprites.js';

// ── PNG encoding (8-bit RGB, no filtering) ───────────────────────────────

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng({ w, h, px }) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    px.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Drawing ──────────────────────────────────────────────────────────────

const hex = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

function canvas(w, h) {
  return { w, h, px: Buffer.alloc(w * h * 3) };
}

function set(c, x, y, rgb) {
  if (x < 0 || y < 0 || x >= c.w || y >= c.h) return;
  c.px.set(rgb, (y * c.w + x) * 3);
}

function rect(c, x, y, w, h, rgb) {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) set(c, i, j, rgb);
}

function drawSprite(c, name, x0, y0, scale) {
  ART[name].forEach((row, y) => {
    [...row.padEnd(16, '.')].forEach((ch, x) => {
      const fill = PALETTE[ch] ?? (ch === 'K' ? PALETTE.k : null);
      if (fill) rect(c, x0 + x * scale, y0 + y * scale, scale, scale, hex(fill));
    });
  });
}

// 5x7 pixel glyphs, only the letters the card spells.
const GLYPHS = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  C: ['.####', '#....', '#....', '#....', '#....', '#....', '.####'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  I: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
};

const textWidth = (text, scale) => text.length * 6 * scale - scale;

/// Draws `parts` ([text, colour] pairs) as one centred line with a drop shadow.
function drawText(c, parts, y, scale, shadow) {
  const total = textWidth(parts.map(([t]) => t).join(''), scale);
  for (const [dx, colour] of [[shadow, hex('#12061c')], [0, null]]) {
    let x = Math.round((c.w - total) / 2) + dx;
    for (const [text, fill] of parts) {
      for (const ch of text) {
        (GLYPHS[ch] ?? []).forEach((row, gy) => {
          [...row].forEach((on, gx) => {
            if (on === '#') rect(c, x + gx * scale, y + dx + gy * scale, scale, scale, colour ?? hex(fill));
          });
        });
        x += 6 * scale;
      }
    }
  }
}

function line(c, x0, y0, x1, y1, rgb, width) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let s = 0; s <= steps; s++) {
    const x = Math.round(x0 + ((x1 - x0) * s) / steps);
    const y = Math.round(y0 + ((y1 - y0) * s) / steps);
    rect(c, x - (width >> 1), y, width, 1, rgb);
  }
}

/// The 1200x630 link-preview card: synthwave sky, sun and grid, the title
/// and the three fighters standing on the horizon.
export function renderOgImage() {
  const c = canvas(1200, 630);
  const horizon = 420;

  for (let y = 0; y < horizon; y++) {
    rect(c, 0, y, c.w, 1, mix(hex('#0b0410'), hex('#3a0d4a'), y / horizon));
  }

  // Sun with the classic cut-out bands in its lower half.
  const [cx, cy, r] = [600, horizon, 190];
  for (let y = cy - r; y < cy; y++) {
    const band = y - (cy - 110);
    if (band > 0 && band % 26 < 4 + band / 14) continue;
    const half = Math.floor(Math.sqrt(r * r - (cy - y) ** 2));
    rect(c, cx - half, y, half * 2, 1, mix(hex('#ffd23f'), hex('#ff2bd6'), (y - (cy - r)) / r));
  }

  rect(c, 0, horizon, c.w, c.h - horizon, hex('#14061f'));
  const gridColour = hex('#a3168a');
  for (let k = 1; k < 12; k++) {
    const y = horizon + Math.round(k * k * 2.2);
    if (y < c.h) rect(c, 0, y, c.w, 2, gridColour);
  }
  for (let x = -2400; x <= 3600; x += 120) line(c, cx, horizon, x, c.h, gridColour, 2);
  rect(c, 0, horizon - 2, c.w, 4, hex('#25e3ff'));

  drawText(c, [['RPS', '#ff2bd6'], [' ', '#ffffff'], ['ARCADE', '#25e3ff']], 46, 12, 6);
  drawText(c, [['ROCK PAPER SCISSORS ONLINE', '#ffd23f']], 160, 5, 3);

  const scale = 10;
  const size = 16 * scale;
  for (const [name, x] of [['rock', 340], ['paper', 600], ['scissors', 860]]) {
    drawSprite(c, name, x - size / 2, horizon - size + 2 * scale, scale);
  }

  return encodePng(c);
}

/// The favicon (an 8x8 pixel SVG) scaled up to a `size`-pixel square PNG.
export function renderIcon(svgPath, size) {
  const svg = readFileSync(svgPath, 'utf8');
  const rects = [...svg.matchAll(/<rect([^>]*)\/>/g)].map(([, attrs]) => {
    const get = (k, d) => attrs.match(new RegExp(`\\b${k}="([^"]+)"`))?.[1] ?? d;
    return { x: +get('x', 0), y: +get('y', 0), w: +get('width'), h: +get('height'), fill: hex(get('fill')) };
  });
  const c = canvas(size, size);
  const scale = Math.floor(size / 8);
  const pad = Math.floor((size - 8 * scale) / 2);
  rect(c, 0, 0, size, size, rects[0].fill);
  for (const r of rects) rect(c, pad + r.x * scale, pad + r.y * scale, r.w * scale, r.h * scale, r.fill);
  return encodePng(c);
}
