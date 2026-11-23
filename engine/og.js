// Zero-dependency OpenGraph PNG card generator (1200×630, rendered at 600×315 crisp 2× pixel art).
// Deterministic output so incremental builds skip unchanged cards.

import { deflateSync } from 'node:zlib';
import { SPRITES, hashString, mulberry32 } from './pixel.js';

const W = 600;
const H = 315;
const OUT_W = W * 2;
const OUT_H = H * 2;

const SECTION_ACCENT = {
  ctf: '#ff6b5e',
  wargames: '#4fd6d0',
  cve: '#f2b84b',
  research: '#b58cff',
  malware: '#6cc24a',
  tools: '#6f8cff',
  projects: '#e8875a',
  notes: '#b58cff',
  selfhelp: '#f2b84b',
};

// ── CRC32 + PNG encoder ──────────────────────────────────────────────────────
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const out = Buffer.allocUnsafe(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** Encode a 600×315 RGB pixel buffer as a crisp 2× upscaled 1200×630 PNG Buffer. */
function encodePng2x(rgb) {
  const rowBytes = OUT_W * 3;
  const stride = rowBytes + 1;
  const raw = Buffer.allocUnsafe(stride * OUT_H);
  // Even rows use PNG Sub filter (1); odd rows are identical to the row above → Up filter (2) = all zeros!
  for (let y = 0; y < H; y++) {
    const srcOff = y * W * 3;
    const dstEven = y * 2 * stride;
    const dstOdd = dstEven + stride;
    raw[dstEven] = 1; // Sub
    let prevR = 0;
    let prevG = 0;
    let prevB = 0;
    let p = dstEven + 1;
    for (let x = 0; x < W; x++) {
      const r = rgb[srcOff + x * 3];
      const g = rgb[srcOff + x * 3 + 1];
      const b = rgb[srcOff + x * 3 + 2];
      raw[p++] = (r - prevR) & 0xff;
      raw[p++] = (g - prevG) & 0xff;
      raw[p++] = (b - prevB) & 0xff;
      // Second pixel of the 2× horizontal pair has diff 0 from the first!
      raw[p++] = 0;
      raw[p++] = 0;
      raw[p++] = 0;
      prevR = r;
      prevG = g;
      prevB = b;
    }
    raw[dstOdd] = 2; // Up
    raw.fill(0, dstOdd + 1, dstOdd + stride);
  }

  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(OUT_W, 0);
  ihdr.writeUInt32BE(OUT_H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = deflateSync(raw, { level: 6 });
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', Buffer.alloc(0))]);
}

// ── Pixel canvas primitives ──────────────────────────────────────────────────
function hexRgb(hex) {
  const s = hex.startsWith('#') ? hex.slice(1) : hex;
  const n = parseInt(s.length === 3 ? s.replace(/./g, (c) => c + c) : s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

class Canvas {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.rgb = new Uint8Array(w * h * 3);
  }
  blend(x, y, r, g, b, a = 1) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || a <= 0) return;
    const i = (y * this.w + x) * 3;
    if (a >= 1) {
      this.rgb[i] = r;
      this.rgb[i + 1] = g;
      this.rgb[i + 2] = b;
    } else {
      const inv = 1 - a;
      this.rgb[i] = Math.round(this.rgb[i] * inv + r * a);
      this.rgb[i + 1] = Math.round(this.rgb[i + 1] * inv + g * a);
      this.rgb[i + 2] = Math.round(this.rgb[i + 2] * inv + b * a);
    }
  }
  rect(x, y, w, h, col, a = 1) {
    const [r, g, b] = typeof col === 'string' ? hexRgb(col) : col;
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.w, Math.ceil(x + w));
    const y1 = Math.min(this.h, Math.ceil(y + h));
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) this.blend(xx, yy, r, g, b, a);
    }
  }
  roundRect(x, y, w, h, rad, fill, fillAlpha = 1, border = null, borderAlpha = 1) {
    const [fr, fg, fb] = fill ? (typeof fill === 'string' ? hexRgb(fill) : fill) : [0, 0, 0];
    const [br, bg, bb] = border ? (typeof border === 'string' ? hexRgb(border) : border) : [0, 0, 0];
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = Math.floor(x + w - 1);
    const y1 = Math.floor(y + h - 1);
    const rr = rad * rad;
    const inCorner = (dx, dy) => dx * dx + dy * dy <= rr;
    for (let yy = y0; yy <= y1; yy++) {
      for (let xx = x0; xx <= x1; xx++) {
        let dx = 0;
        let dy = 0;
        if (xx < x0 + rad) dx = x0 + rad - xx;
        else if (xx > x1 - rad) dx = xx - (x1 - rad);
        if (yy < y0 + rad) dy = y0 + rad - yy;
        else if (yy > y1 - rad) dy = yy - (y1 - rad);
        if (dx && dy && !inCorner(dx, dy)) continue;
        const isEdge =
          xx === x0 ||
          xx === x1 ||
          yy === y0 ||
          yy === y1 ||
          (dx && dy && (dx + 1) * (dx + 1) + dy * dy > rr && dx * dx + (dy + 1) * (dy + 1) > rr);
        if (isEdge && border) this.blend(xx, yy, br, bg, bb, borderAlpha);
        else if (fill) this.blend(xx, yy, fr, fg, fb, fillAlpha);
      }
    }
  }
  radialGlow(cx, cy, rx, ry, col, peakAlpha) {
    const [r, g, b] = typeof col === 'string' ? hexRgb(col) : col;
    const x0 = Math.max(0, Math.floor(cx - rx));
    const y0 = Math.max(0, Math.floor(cy - ry));
    const x1 = Math.min(this.w - 1, Math.ceil(cx + rx));
    const y1 = Math.min(this.h - 1, Math.ceil(cy + ry));
    for (let y = y0; y <= y1; y++) {
      const dy = (y - cy) / ry;
      const dy2 = dy * dy;
      for (let x = x0; x <= x1; x++) {
        const dx = (x - cx) / rx;
        const d2 = dx * dx + dy2;
        if (d2 >= 1) continue;
        const falloff = 1 - Math.sqrt(d2);
        this.blend(x, y, r, g, b, peakAlpha * falloff * falloff);
      }
    }
  }
  drawSprite(name, x, y, scale = 2) {
    const s = SPRITES[name];
    if (!s) return;
    for (let ry = 0; ry < s.rows.length; ry++) {
      const row = s.rows[ry];
      for (let rx = 0; rx < row.length; rx++) {
        const ch = row[rx];
        if (ch === '.' || ch === ' ') continue;
        const hex = s.palette[ch];
        if (!hex || !hex.startsWith('#')) continue;
        this.rect(x + rx * scale, y + ry * scale, scale, scale, hex, 1);
      }
    }
  }
}

// ── Proportional 5×7 crisp pixel bitmap font ─────────────────────────────────
// Each glyph is 7 rows of 5 bits (trimmed automatically to tight width for clean kerning).
const GLYPHS_RAW = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.####', '#....', '#....', '#....', '#....', '#....', '.####'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.####', '#....', '#....', '#..##', '#...#', '#...#', '.####'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['###..', '.#...', '.#...', '.#...', '.#...', '.#...', '###..'],
  J: ['..###', '...#.', '...#.', '...#.', '#..#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#...#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],

  a: ['.....', '.....', '.###.', '....#', '.####', '#...#', '.####'],
  b: ['#....', '#....', '####.', '#...#', '#...#', '#...#', '####.'],
  c: ['.....', '.....', '.####', '#....', '#....', '#....', '.####'],
  d: ['....#', '....#', '.####', '#...#', '#...#', '#...#', '.####'],
  e: ['.....', '.....', '.###.', '#...#', '#####', '#....', '.####'],
  f: ['..##.', '.#...', '####.', '.#...', '.#...', '.#...', '.#...'],
  g: ['.....', '.....', '.####', '#...#', '#...#', '#...#', '.####', '....#', '.###.'],
  h: ['#....', '#....', '####.', '#...#', '#...#', '#...#', '#...#'],
  i: ['.#...', '.....', '##...', '.#...', '.#...', '.#...', '###..'],
  j: ['..#..', '.....', '.##..', '..#..', '..#..', '..#..', '..#..', '#.#..', '.#...'],
  k: ['#....', '#....', '#..#.', '#.#..', '##...', '#.#..', '#..#.'],
  l: ['##...', '.#...', '.#...', '.#...', '.#...', '.#...', '###..'],
  m: ['.....', '.....', '##.#.', '#.#.#', '#.#.#', '#.#.#', '#...#'],
  n: ['.....', '.....', '####.', '#...#', '#...#', '#...#', '#...#'],
  o: ['.....', '.....', '.###.', '#...#', '#...#', '#...#', '.###.'],
  p: ['.....', '.....', '####.', '#...#', '#...#', '#...#', '####.', '#....', '#....'],
  q: ['.....', '.....', '.####', '#...#', '#...#', '#...#', '.####', '....#', '....#'],
  r: ['.....', '.....', '#.##.', '##..#', '#....', '#....', '#....'],
  s: ['.....', '.....', '.####', '#....', '.###.', '....#', '####.'],
  t: ['.#...', '.#...', '####.', '.#...', '.#...', '.#..#', '..##.'],
  u: ['.....', '.....', '#...#', '#...#', '#...#', '#...#', '.####'],
  v: ['.....', '.....', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  w: ['.....', '.....', '#...#', '#...#', '#.#.#', '#.#.#', '.#.#.'],
  x: ['.....', '.....', '#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
  y: ['.....', '.....', '#...#', '#...#', '#...#', '#...#', '.####', '....#', '.###.'],
  z: ['.....', '.....', '#####', '...#.', '..#..', '.#...', '#####'],

  '0': ['.###.', '#..##', '#.#.#', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '..##.', '.#...', '#....', '#####'],
  '3': ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['.###.', '#....', '####.', '#...#', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],

  '.': ['.....', '.....', '.....', '.....', '.....', '##...', '##...'],
  ',': ['.....', '.....', '.....', '.....', '.#...', '.#...', '#....'],
  ':': ['.....', '.....', '##...', '##...', '.....', '##...', '##...'],
  ';': ['.....', '.....', '.#...', '.....', '.#...', '.#...', '#....'],
  '!': ['#....', '#....', '#....', '#....', '#....', '.....', '#....'],
  '?': ['.###.', '#...#', '....#', '..##.', '..#..', '.....', '..#..'],
  '-': ['.....', '.....', '.....', '####.', '.....', '.....', '.....'],
  '_': ['.....', '.....', '.....', '.....', '.....', '.....', '#####'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  '=': ['.....', '.....', '#####', '.....', '#####', '.....', '.....'],
  '/': ['....#', '...#.', '...#.', '..#..', '.#...', '.#...', '#....'],
  '\\': ['#....', '.#...', '.#...', '..#..', '...#.', '...#.', '....#'],
  '#': ['.#.#.', '#####', '.#.#.', '.#.#.', '#####', '.#.#.', '.....'],
  '&': ['.###.', '#..#.', '.##..', '#.#.#', '#..#.', '#..#.', '.##.#'],
  '(': ['..#..', '.#...', '#....', '#....', '#....', '.#...', '..#..'],
  ')': ['#....', '.#...', '..#..', '..#..', '..#..', '.#...', '#....'],
  '[': ['###..', '#....', '#....', '#....', '#....', '#....', '###..'],
  ']': ['###..', '..#..', '..#..', '..#..', '..#..', '..#..', '###..'],
  "'": ['#....', '#....', '.....', '.....', '.....', '.....', '.....'],
  '"': ['#.#..', '#.#..', '.....', '.....', '.....', '.....', '.....'],
  '@': ['.###.', '#...#', '#.###', '#.#.#', '#.###', '#....', '.####'],
  '*': ['.....', '#.#.#', '.###.', '#####', '.###.', '#.#.#', '.....'],
  '%': ['##..#', '##.#.', '..#..', '.#...', '#.##.', '.#.##', '.....'],
  '<': ['...#.', '..#..', '.#...', '#....', '.#...', '..#..', '...#.'],
  '>': ['#....', '.#...', '..#..', '...#.', '..#..', '.#...', '#....'],
  '~': ['.....', '.....', '.##.#', '#..##', '.....', '.....', '.....'],
  '|': ['#....', '#....', '#....', '#....', '#....', '#....', '#....'],
  '·': ['.....', '.....', '.....', '##...', '##...', '.....', '.....'],
};

const FONT = new Map();
for (const [ch, rows] of Object.entries(GLYPHS_RAW)) {
  let minX = 5;
  let maxX = -1;
  for (const r of rows) {
    for (let x = 0; x < r.length; x++) {
      if (r[x] === '#') {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
  }
  const width = maxX >= minX ? maxX - minX + 1 : 3;
  const trimmed = rows.map((r) => r.slice(minX, maxX + 1));
  FONT.set(ch, { width, rows: trimmed });
}

function cleanText(raw) {
  return String(raw || '')
    .replace(/[—–]/g, '-')
    .replace(/[‘’`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, '...')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function measureText(text, scale = 2) {
  const s = cleanText(text);
  let w = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === ' ') w += 3 * scale;
    else {
      const g = FONT.get(ch) || FONT.get(ch.toUpperCase()) || FONT.get('?');
      w += g.width * scale;
    }
    if (i < s.length - 1) w += scale;
  }
  return w;
}

function drawText(cv, text, x, y, scale, col, alpha = 1, shadow = false) {
  const s = cleanText(text);
  let cx = Math.round(x);
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === ' ') {
      cx += 4 * scale;
      continue;
    }
    const g = FONT.get(ch) || FONT.get(ch.toUpperCase()) || FONT.get('?');
    for (let ry = 0; ry < g.rows.length; ry++) {
      const row = g.rows[ry];
      for (let rx = 0; rx < row.length; rx++) {
        if (row[rx] !== '#') continue;
        if (shadow) cv.rect(cx + rx * scale + Math.max(1, Math.floor(scale * 0.45)), y + ry * scale + Math.max(1, Math.floor(scale * 0.45)), scale, scale, '#05060a', 0.55);
        cv.rect(cx + rx * scale, y + ry * scale, scale, scale, col, alpha);
      }
    }
    cx += (g.width + 1) * scale;
  }
  return cx;
}

function wrapText(text, maxWidth, scale, maxLines) {
  const words = cleanText(text).split(' ').filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const cand = line ? `${line} ${word}` : word;
    if (!line || measureText(cand, scale) <= maxWidth) {
      line = cand;
    } else {
      lines.push(line);
      if (lines.length >= maxLines) break;
      line = word;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  // Ellipsize last line if overflowed
  const usedWords = lines.join(' ').split(' ').length;
  if (lines.length === maxLines && usedWords < words.length) {
    let last = lines[maxLines - 1];
    while (last.length > 4 && measureText(last + '...', scale) > maxWidth) {
      last = last.replace(/\s+\S*$/, '') || last.slice(0, -1);
    }
    lines[maxLines - 1] = last.replace(/[.,;:\- ]+$/, '') + '...';
  }
  return lines;
}

// ── Shared card chrome (background, subtle strata, glowing card frame) ───────
function drawStrataBar(cv, seed) {
  const rnd = mulberry32(hashString(seed));
  const block = 6; // 6×6 in 600px space (= 12px in 1200px)
  const yStart = H - block * 3;
  const palettes = [
    ['#6b4829', '#614124', '#74502f'], // dirt
    ['#5d616b', '#666a75', '#545862'], // stone
    ['#363842', '#3d404b', '#2f313a'], // deepslate
  ];
  const ores = ['#3de5f5', '#32db64', '#f2be38', '#e8433a', '#6f8cff'];
  for (let row = 0; row < 3; row++) {
    for (let bx = 0; bx < Math.ceil(W / block); bx++) {
      let layer = row;
      if (row === 1 && rnd() < 0.14) layer = 0;
      if (row === 2 && rnd() < 0.18) layer = 1;
      const t = rnd();
      const shade = palettes[layer][t < 0.72 ? 0 : t < 0.87 ? 2 : 1];
      cv.rect(bx * block, yStart + row * block, block, block, shade, 0.92);
      if (row >= 1 && rnd() < 0.055) {
        const ore = ores[Math.floor(rnd() * ores.length)];
        cv.rect(bx * block + 1, yStart + row * block + 1, 2, 2, ore, 0.9);
        cv.rect(bx * block + 3, yStart + row * block + 3, 2, 1, ore, 0.75);
      }
    }
  }
  // crisp top edge separating strata from obsidian canvas
  cv.rect(0, yStart, W, 1, '#08090d', 0.85);
}

/**
 * Generate a 1200×630 deterministic PNG OpenGraph card.
 * @param {object} opts
 * @returns {Buffer}
 */
export function renderOgCard({
  siteTitle = 'Ryou',
  domain = 'ryouthecat.github.io',
  title = 'Ryou',
  description = '',
  section = null, // { key, title, icon }
  tags = [],
  metaRight = '',
  accent = null,
} = {}) {
  const cv = new Canvas(W, H);
  const accentHex = accent || (section && SECTION_ACCENT[section.key]) || '#6cc24a';

  // 1. Deep Obsidian background with subtle vertical depth
  const topCol = hexRgb('#0c0e14');
  const botCol = hexRgb('#12151f');
  for (let y = 0; y < H; y++) {
    const t = y / (H - 1);
    const r = Math.round(topCol[0] + (botCol[0] - topCol[0]) * t);
    const g = Math.round(topCol[1] + (botCol[1] - topCol[1]) * t);
    const b = Math.round(topCol[2] + (botCol[2] - topCol[2]) * t);
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      cv.rgb[i] = r;
      cv.rgb[i + 1] = g;
      cv.rgb[i + 2] = b;
    }
  }

  // Subtle ambient dye glow (top-right + soft bottom-left counter-balance)
  cv.radialGlow(505, 58, 250, 155, accentHex, 0.22);
  cv.radialGlow(90, 260, 200, 110, accentHex, 0.08);

  // Subtle dark dot grid for technical blueprint texture
  for (let y = 16; y < H - 24; y += 16) {
    for (let x = 16; x < W - 16; x += 16) {
      cv.blend(x, y, 255, 255, 255, 0.032);
    }
  }

  // 2. Main framed Obsidian panel
  const px = 26;
  const py = 22;
  const pw = W - 52;
  const ph = H - 56;
  cv.roundRect(px, py, pw, ph, 10, '#141822', 0.9, '#2a3142', 0.95);
  // Crisp top highlight hairline + accent bar along top-left edge
  cv.rect(px + 12, py + 1, pw - 24, 1, '#ffffff', 0.06);
  cv.rect(px + 24, py, 118, 2, accentHex, 0.95);

  // 3. Header row inside panel: Grass logo + brand (left) | Section pill or domain (right)
  const padX = px + 26;
  const headY = py + 20;
  cv.drawSprite('grass', padX, headY, 3); // 24×24
  drawText(cv, siteTitle.toLowerCase(), padX + 34, headY + 5, 2, '#f0f3f8', 1, true);

  if (section) {
    const label = section.title;
    const icoW = section.icon && SPRITES[section.icon] ? 24 : 0;
    const textW = measureText(label, 2);
    const pillW = 20 + icoW + (icoW ? 8 : 0) + textW;
    const pillH = 30;
    const pillX = px + pw - 26 - pillW;
    const pillY = headY - 3;
    cv.roundRect(pillX, pillY, pillW, pillH, 6, accentHex, 0.14, accentHex, 0.5);
    let ix = pillX + 10;
    if (icoW) {
      cv.drawSprite(section.icon, ix, pillY + 3, 2);
      ix += icoW + 8;
    }
    drawText(cv, label, ix, pillY + 8, 2, '#eef2fa', 1);
  } else {
    const domW = measureText(domain, 2);
    drawText(cv, domain, px + pw - 26 - domW, headY + 5, 2, '#8c96ab', 1);
  }

  // Subtle horizontal divider under header
  cv.rect(padX, headY + 38, pw - 52, 1, '#262d3d', 0.78);

  // 4. Title (bold large crisp integer-scaled pixel typography)
  const contentW = pw - 52;
  const cleanTitle = cleanText(title);
  const titleScale = cleanTitle.length <= 18 ? 5 : cleanTitle.length <= 36 ? 4 : 3;
  const titleLineH = titleScale === 5 ? 44 : titleScale === 4 ? 38 : 30;
  const markerSize = titleScale >= 4 ? 10 : 8;
  let curY = headY + 54;
  // Accent pixel square marker before title (matching .sec-title::before)
  cv.rect(padX + 2, curY + (titleScale >= 4 ? 11 : 7) + 2, markerSize, markerSize, '#06080d', 0.7);
  cv.rect(padX, curY + (titleScale >= 4 ? 11 : 7), markerSize, markerSize, accentHex, 1);
  const titleX = padX + markerSize + 14;
  const wrappedTitle = wrapText(cleanTitle, contentW - (markerSize + 14), titleScale, 2);
  for (let i = 0; i < wrappedTitle.length; i++) {
    drawText(cv, wrappedTitle[i], titleX, curY + i * titleLineH, titleScale, '#f4f6fb', 1, true);
  }
  curY += wrappedTitle.length * titleLineH + 12;

  // 5. Description (crisp 2× muted 1–2 lines)
  if (description) {
    const descScale = 2;
    const maxDescLines = wrappedTitle.length > 1 ? 1 : 2;
    const descLines = wrapText(description, contentW, descScale, maxDescLines);
    for (let i = 0; i < descLines.length; i++) {
      drawText(cv, descLines[i], padX, curY + i * 22, descScale, '#a0a9bd', 1);
    }
  }

  // 6. Footer row inside card: #tag pills (left) + date / domain (right)
  const footY = py + ph - 40;
  const rightStr = metaRight || domain;
  const rightW = measureText(rightStr, 2);
  const rightX = px + pw - 26 - rightW;
  drawText(cv, rightStr, rightX, footY + 7, 2, '#828ca3', 1);

  let chipX = padX;
  const chipMaxX = rightX - 18;
  const tagList = (tags || []).slice(0, 3);
  for (const t of tagList) {
    const name = typeof t === 'string' ? t : t.name;
    if (!name) continue;
    const hashW = measureText('#', 2);
    const nameW = measureText(name, 2);
    const cw = 18 + hashW + 3 + nameW;
    if (chipX + cw > chipMaxX) break;
    cv.roundRect(chipX, footY, cw, 28, 5, '#1b202d', 1, '#313a50', 0.95);
    drawText(cv, '#', chipX + 9, footY + 7, 2, accentHex, 1);
    drawText(cv, name, chipX + 9 + hashW + 3, footY + 7, 2, '#cfd6e6', 1);
    chipX += cw + 8;
  }

  // 7. Bottom Minecraft geological strata strip (matches site footer)
  drawStrataBar(cv, `${siteTitle}:${cleanTitle}`);

  return encodePng2x(cv.rgb);
}
