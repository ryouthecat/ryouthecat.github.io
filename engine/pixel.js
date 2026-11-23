// Pixel-art toolkit: sprites, the procedural home-page landscape, footer strata and favicon.
// Everything is generated at build time as tiny SVG (merged <path> runs, shape-rendering: crispEdges).

// ── deterministic randomness
export function hashString(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const num = (n) => (Number.isInteger(n) ? String(n) : String(+n.toFixed(3)));

/** Collects axis-aligned rectangles per class/colour and serialises them as merged <path> elements. */
class Rects {
  constructor() {
    this.groups = new Map();
  }
  add(key, x, y, w = 1, h = 1) {
    let g = this.groups.get(key);
    if (!g) this.groups.set(key, (g = []));
    g.push(`M${num(x)} ${num(y)}h${num(w)}v${num(h)}h${num(-w)}z`);
  }
  paths(attr) {
    let s = '';
    for (const [key, d] of this.groups) s += `<path ${attr(key)} d="${d.join('')}"/>`;
    return s;
  }
}

// ── sprites ────────────────────────────────────────────────────────────────
// rows: array of equal-length strings, '.' = transparent. palette: char → CSS colour.
export function sprite(rows, palette, { size = 2, cls = 'px', label } = {}) {
  const w = rows[0].length;
  const h = rows.length;
  const r = new Rects();
  for (let y = 0; y < h; y++) {
    let x = 0;
    while (x < w) {
      const c = rows[y][x];
      if (c === '.' || c === ' ') {
        x++;
        continue;
      }
      let x2 = x + 1;
      while (x2 < w && rows[y][x2] === c) x2++;
      r.add(c, x, y, x2 - x, 1);
      x = x2;
    }
  }
  const body = r.paths((c) => {
    const col = palette[c] || '#f0f';
    return col.startsWith('var(') ? `style="fill:${col}"` : `fill="${col}"`;
  });
  const a11y = label ? `role="img" aria-label="${label}"` : 'aria-hidden="true" focusable="false"';
  return `<svg class="${cls}" viewBox="0 0 ${w} ${h}" width="${w * size}" height="${h * size}" shape-rendering="crispEdges" ${a11y}>${body}</svg>`;
}

export const SPRITES = {
  // 8×8 grass block (side face) — the logo
  grass: {
    rows: ['GgGGGgGG', 'GGGHGGgG', 'HGGGGHGG', 'DGDDGDDG', 'DDlDDDdD', 'dDDDlDDD', 'DDDdDDlD', 'DlDDDDDD'],
    palette: { G: '#5da13a', g: '#7cc152', H: '#43802b', D: '#8a5a30', d: '#6a421f', l: '#a97646' },
  },
  sun: {
    rows: ['..oooo..', '.oyyyyo.', 'oyyyyyyo', 'oyyYYyyo', 'oyyYYyyo', 'oyyyyyyo', '.oyyyyo.', '..oooo..'],
    palette: { o: '#f2a31f', y: '#ffd84a', Y: '#fff4a8' },
  },
  moon: {
    rows: ['..wwww..', '.wwwwww.', 'wwwwcc..', 'wwwc....', 'wwwc....', 'wwwwcc..', '.wwwwww.', '..wwww..'],
    palette: { w: '#8a98c4', c: '#5f6d99' },
  },
  search: {
    rows: ['.XXXX....', 'X....X...', 'X....X...', 'X....X...', 'X....X...', '.XXXXX...', '.....XX..', '......XX.', '.......XX'],
    palette: { X: 'currentColor' },
  },
  // accent swatch for the "dye" picker
  dye: {
    rows: ['.oooooo.', 'oaaaaaao', 'oaAAaaao', 'oaAaaaao', 'oaaaaaao', 'oaaaaaaO', 'oaaaaaOO', '.oOOOOO.'],
    palette: { o: 'rgba(0,0,0,.45)', O: 'rgba(0,0,0,.6)', a: 'currentColor', A: 'rgba(255,255,255,.45)' },
  },
  // 12×12 section icons
  flag: {
    rows: [
      'bbbbbbbbbbb.',
      '.RRRRRRRRR..',
      '.RrrrrrrrR..',
      '.RrrWWWrrR..',
      '.RrrWrrrrR..',
      '.RrrWWWrrR..',
      '.RrrWrrrrR..',
      '.RrrWrrrrR..',
      '.RrrrrrrrR..',
      '.Rrr..rrrR..',
      '.Rr....rrR..',
      '..R......R..',
    ],
    palette: { b: '#7a4d27', R: '#e0584f', r: '#b83a33', W: '#f4efe4' },
  },
  sword: {
    rows: [
      '..........cC',
      '.........cC.',
      '........cC..',
      '.......cC...',
      '......cC....',
      '.....cC.....',
      '....cC......',
      '..gcCg......',
      '...gGg......',
      '..hgg.g.....',
      '.hh.........',
      'hh..........',
    ],
    palette: { c: '#36b3ae', C: '#8ff5ee', g: '#7a4d27', G: '#a8703a', h: '#8a5a30' },
  },
  book: {
    rows: [
      '.bbbbbbbbbb.',
      'bBBBBBBBBBBb',
      'bBsBBBBBBBBb',
      'bBsBBggBBBBb',
      'bBsBBgGBBBBb',
      'bBsBBBBBBBBb',
      'bBsBBBBBBBBb',
      'bBsBBBBBBBBb',
      'bBBBBBBBBBBb',
      'bppppppppppb',
      '.bppppppppb.',
      '..bbbbbbbb..',
    ],
    palette: { b: '#3a2a52', B: '#6b4a9c', s: '#4e3677', g: '#e8c14a', G: '#fff0a0', p: '#efe6cf' },
  },
  // more 12×12 section icons
  creeper: {
    rows: [
      'GGGGGGGGGGGG',
      'GgGGGGGGGGgG',
      'GGdddGGdddGG',
      'GGdddGGdddGG',
      'GGdddGGdddGG',
      'GGGGddddGGGG',
      'GGGddddddGGG',
      'GGGddddddGGG',
      'GGGddGGddGGG',
      'GGGddGGddGGG',
      'GgGGGGGGGGgG',
      'GGGGGGGGGGGG',
    ],
    palette: { G: '#5da13a', g: '#7cc152', d: '#17301b' },
  },
  tnt: {
    rows: [
      '....fbb.....',
      '.....b.s....',
      'kkkkkkkkkkkk',
      'kRRRRRRRRRRk',
      'kRrRRRRRRrRk',
      'kWWWWWWWWWWk',
      'kWkWkkWkkWWk',
      'kWkWkkWkkWWk',
      'kWWWWWWWWWWk',
      'kRrRRRRRRrRk',
      'kRRRRRRRRRRk',
      'kkkkkkkkkkkk',
    ],
    palette: { k: '#5a1612', R: '#e0443c', r: '#b5302a', W: '#f3eee2', b: '#6b4423', f: '#ffb02e', s: '#ffe27a' },
  },
  potion: {
    rows: [
      '....bbbb....',
      '....cGGc....',
      '....cGGc....',
      '....cGGc....',
      '...cGGGGc...',
      '..cGppppGc..',
      '.cGpPppppGc.',
      '.cGppppppGc.',
      '.cGppppppGc.',
      '.cGppppppGc.',
      '..cGppppGc..',
      '...cccccc...',
    ],
    palette: { b: '#8a5a30', c: '#566683', G: '#bcd9ea', p: '#9b4de0', P: '#dcaaff' },
  },
  anvil: {
    rows: [
      '.aaaaaaaaaa.',
      'aHHHHHHHHHHa',
      'aAAAAAAAAAAa',
      '.aaAAAAAAaa.',
      '...aAAAAa...',
      '...aAAAAa...',
      '...aAAAAa...',
      '..aAAAAAAa..',
      '.aAAAAAAAAa.',
      '.aHAAAAAAAa.',
      '.aaaaaaaaaa.',
      '............',
    ],
    palette: { a: '#25262b', A: '#5d606b', H: '#939aa8' },
  },
  apple: {
    rows: [
      '.....bLL....',
      '..oooobooo..',
      '.oGGGGoGGGo.',
      'oGhhGGGGGGgo',
      'oGhGGGGGGggo',
      'oGGGGGGGGggo',
      'oGGGGGGGGggo',
      'oGGGGGGGgggo',
      '.oGGGGGGggo.',
      '.oGGGGGgggo.',
      '..ooGGggoo..',
      '....oooo....',
    ],
    palette: { o: '#9a6a00', G: '#ffd83a', g: '#f0a800', h: '#fff7b8', b: '#6b4423', L: '#4fa33d' },
  },
  table: {
    rows: [
      'bbbbbbbbbbbb',
      'bPPPPPPPPPPb',
      'bPkkPkkPkkPb',
      'bPkkPkkPkkPb',
      'bPPPPPPPPPPb',
      'bPkkPkkPkkPb',
      'bPkkPkkPkkPb',
      'bPPPPPPPPPPb',
      'bPkkPkkPkkPb',
      'bPkkPkkPkkPb',
      'bPPPPPPPPPPb',
      'bbbbbbbbbbbb',
    ],
    palette: { b: '#5a3a1c', P: '#c19558', k: '#8a6531' },
  },
  heart: {
    rows: ['.rr..rr.', 'rRRrrrrr', 'rRrrrrrr', 'rrrrrrrr', '.rrrrrr.', '..rrrr..', '...rr...'],
    palette: { r: '#e0443c', R: '#ff9a8f' },
  },
};

export function icon(name, size = 2, cls = 'px') {
  const s = SPRITES[name];
  if (!s) throw new Error(`unknown sprite: ${name}`);
  return sprite(s.rows, s.palette, { size, cls });
}

// ── favicon ────────────────────────────────────────────────────────────────
export function faviconSvg() {
  const s = SPRITES.grass;
  return sprite(s.rows, s.palette, { size: 8, cls: '' }).replace('<svg class=""', '<svg xmlns="http://www.w3.org/2000/svg"');
}

// ── tiling textures ────────────────────────────────────────────────────────
/** Strip of grass over dirt used under the header (tile of 32×4 art pixels). */
export function grassTileSvg() {
  const rnd = mulberry32(7);
  const W = 32;
  const rows = [[], [], [], []];
  const pick = (a, p) => a[Math.floor(rnd() * a.length)] ?? p;
  for (let x = 0; x < W; x++) {
    rows[0].push(rnd() < 0.3 ? 'g' : 'G');
    rows[1].push(rnd() < 0.25 ? 'H' : 'G');
    rows[2].push(rnd() < 0.45 ? 'G' : pick(['D', 'D', 'l'], 'D'));
    rows[3].push(pick(['D', 'D', 'd', 'l'], 'D'));
  }
  const pal = { G: '#5da13a', g: '#7cc152', H: '#43802b', D: '#8a5a30', d: '#6a421f', l: '#a97646' };
  const strs = rows.map((r) => r.join(''));
  return sprite(strs, pal, { size: 2, cls: '' }).replace('<svg class=""', '<svg xmlns="http://www.w3.org/2000/svg"');
}

/** Footer strata: dirt → stone with ores → deepslate → bedrock. Tile of 96×8 blocks (block = 8px). */
export function strataTileSvg(seed = 'strata') {
  const W = 96;
  const H = 8;
  const rnd = mulberry32(hashString(seed));
  const r = new Rects();
  const layerOf = (y) => (y === 0 ? 'dirt' : y <= 3 ? 'stone' : y <= 6 ? 'deep' : 'bed');
  const shades = {
    dirt: ['#6b4829', '#614124', '#74502f'],
    stone: ['#62656e', '#6a6d77', '#5a5d66'],
    deep: ['#393a42', '#40414a', '#32333a'],
    bed: ['#202127', '#272830', '#191a1f'],
  };
  const pickShade = () => {
    const t = rnd();
    return t < 0.72 ? 0 : t < 0.87 ? 2 : 1;
  };
  for (let y = 0; y < H; y++) {
    const layer = layerOf(y);
    for (let x = 0; x < W; x++) {
      // gentle, clean transition between geological layers (not overly noisy)
      let l = layer;
      if (y === 1 && rnd() < 0.16) l = 'dirt';
      if (y === 4 && rnd() < 0.22) l = 'stone';
      if (y === 7 && rnd() < 0.2) l = 'deep';
      r.add(l + pickShade(), x, y, 1, 1);
    }
  }
  const ores = [
    ['coal', '#1b1b1f', null, 11, 4],
    ['iron', '#d9b391', '#f3dac2', 7, 3],
    ['gold', '#f2be38', '#fff0a6', 4, 4],
    ['redstone', '#e8433a', '#ffaba6', 5, 5],
    ['lapis', '#3f72f0', '#a8c4ff', 3, 4],
    ['diamond', '#3de5f5', '#d4ffff', 4, 5],
    ['emerald', '#32db64', '#c2ffd2', 2, 3],
  ];
  const vein = [
    [0.125, 0.125, 0.375, 0.25],
    [0.5, 0.375, 0.375, 0.25],
    [0.25, 0.625, 0.375, 0.25],
    [0.0, 0.375, 0.25, 0.25],
  ];
  const oreRects = new Rects();
  for (const [name, , hi, count, targetY] of ores) {
    for (let i = 0; i < count; i++) {
      const x = Math.floor(rnd() * W);
      const y = Math.min(6, Math.max(1, targetY + Math.floor(rnd() * 3) - 1));
      for (const [sx, sy, sw, sh] of vein) if (rnd() < 0.85) oreRects.add(name, x + sx, y + sy, sw, sh);
      if (hi) oreRects.add(name + '-hi', x + 0.25, y + 0.125, 0.25, 0.25);
    }
  }
  const fills = {};
  for (const [layer, cols] of Object.entries(shades)) cols.forEach((c, i) => (fills[layer + i] = c));
  for (const [name, color, hi] of ores) {
    fills[name] = color;
    if (hi) fills[name + '-hi'] = hi;
  }
  const attr = (k) => `fill="${fills[k]}"`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W * 8}" height="${H * 8}" shape-rendering="crispEdges">` +
    r.paths(attr) +
    oreRects.paths(attr) +
    '</svg>'
  );
}

// ── the home-page landscape ────────────────────────────────────────────────
// Panoramic layered voxel vista (320×44): aurora, stars, sun/moon, two-tone clouds,
// snow-capped mountains, misty pine ridge, reflective lake, cozy cabin + lantern + campfire,
// shaded spruce/oak trees, fireflies and ore cutaway. All colours come from CSS variables.
export function sceneSvg({ seed = 'ryou', w = 320, h = 44 } = {}) {
  const rnd = mulberry32(hashString(seed));
  const sky = new Rects();
  const cloudsA = new Rects();
  const cloudsB = new Rects();
  const mtFar = new Rects();
  const mtMid = new Rects();
  const ground = new Rects();
  const waterFx = new Rects();
  const oreGlint = new Rects();
  const lights = new Rects();
  const smoke = new Rects();
  const fireflies = new Rects();

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // ── 1. celestial bodies (sitting cleanly in the mountain saddle at x ≈ 206)
  const celX = 205;
  const celY = 5;
  // day sun (7×7 with warm rim + glowing core)
  sky.add('sun-rim', celX, celY, 7, 7);
  sky.add('sun', celX + 1, celY + 1, 5, 5);
  sky.add('sunc', celX + 2, celY + 2, 3, 3);
  // night moon (6×6 with highlight + craters)
  sky.add('moon', celX, celY, 6, 6);
  sky.add('moon-hi', celX, celY, 5, 1);
  sky.add('moon-hi', celX, celY + 1, 2, 3);
  sky.add('moonc', celX + 3, celY + 1, 2, 1);
  sky.add('moonc', celX + 1, celY + 3, 1, 2);
  sky.add('moonc', celX + 4, celY + 4, 1, 1);

  // stars (twinkling groups + crisp 3×3 sparkle stars)
  const nearCel = (x, y) => x >= celX - 4 && x <= celX + 10 && y >= celY - 3 && y <= celY + 9;
  for (let i = 0; i < 64; i++) {
    const sx = Math.floor(rnd() * w);
    const sy = 1 + Math.floor(rnd() * 19);
    if (nearCel(sx, sy)) continue;
    const cls = i % 3 === 0 ? 'star-a' : i % 3 === 1 ? 'star-b' : 'star';
    sky.add(cls, sx, sy, 1, 1);
  }
  const sparkles = [
    [52, 6],
    [118, 4],
    [164, 7],
    [244, 5],
    [282, 8],
  ];
  for (let i = 0; i < sparkles.length; i++) {
    const [sx, sy] = sparkles[i];
    const cls = i % 2 === 0 ? 'star-a' : 'star-b';
    sky.add('star-bright', sx, sy, 1, 1);
    sky.add(cls, sx - 1, sy, 1, 1);
    sky.add(cls, sx + 1, sy, 1, 1);
    sky.add(cls, sx, sy - 1, 1, 1);
    sky.add(cls, sx, sy + 1, 1, 1);
  }

  // ethereal multi-layer aurora borealis curtains (rendered softly BEHIND stars & clouds, night only)
  const auroraMarkup =
    '<g class="aurora" shape-rendering="geometricPrecision" mask="url(#mc-amask)">' +
    '<path class="aurora-veil-1" d="M22 17 C62 14, 92 7, 134 10 C162 12, 182 13, 204 9 L204 0 C180 2, 160 1, 132 0 C90 -1, 60 3, 22 7 Z" fill="url(#mc-au1)" filter="url(#mc-ablur)"/>' +
    '<path class="aurora-veil-2" d="M58 14 C96 9, 132 14, 168 8 C186 5, 200 6, 218 4 L218 0 L58 0 Z" fill="url(#mc-au2)" filter="url(#mc-ablur)"/>' +
    '<path class="aurora-ribbon" d="M28 16.5 C66 13.5, 94 6.8, 134 9.8 C162 11.8, 180 12.6, 200 9.2" fill="none" stroke="url(#mc-aurib)" stroke-width="2.2" stroke-linecap="round" filter="url(#mc-ablur-sm)"/>' +
    '<path class="aurora-ribbon-2" d="M64 13.2 C100 8.8, 132 13.2, 168 7.8 C185 5.4, 198 6, 212 4.2" fill="none" stroke="url(#mc-aurib2)" stroke-width="1.4" stroke-linecap="round" filter="url(#mc-ablur-sm)"/>' +
    '<g class="aurora-rays" filter="url(#mc-ablur-sm)">' +
    '<path d="M66 14 L68 4 M88 10 L90 2 M112 8.5 L114 1 M136 10 L138 1.5 M160 11.5 L162 2.5 M182 11.5 L184 3" fill="none" stroke="url(#mc-auray)" stroke-width="2" stroke-linecap="round"/>' +
    '</g>' +
    '</g>';

  // ── 2. two-tone volumetric voxel clouds (2 drift layers)
  const addCloud = (target, cx, cy, cw) => {
    target.add('cloud', cx + 2, cy - 1, Math.max(4, cw - 5), 1);
    target.add('cloud', cx, cy, cw, 1);
    target.add('cloud-sh', cx + 1, cy + 1, Math.max(3, cw - 2), 1);
  };
  const cloudSpecsA = [
    [18, 8, 16],
    [94, 6, 18],
    [176, 11, 14],
    [258, 7, 19],
  ];
  const cloudSpecsB = [
    [54, 13, 13],
    [138, 8, 15],
    [224, 13, 15],
    [296, 11, 14],
  ];
  for (const [cx, cy, cw] of cloudSpecsA) addCloud(cloudsA, cx, cy, cw);
  for (const [cx, cy, cw] of cloudSpecsB) addCloud(cloudsB, cx, cy, cw);

  // ── 3. far snow-capped voxel mountains (atmospheric perspective)
  const peaks = [
    [22, 19, 0.42],
    [66, 17, 0.36],
    [146, 13, 0.34],
    [177, 17, 0.4],
    [254, 14, 0.35],
    [298, 18, 0.38],
  ];
  const farH = new Array(w);
  for (let x = 0; x < w; x++) {
    let top = 31;
    for (const [px, py, slope] of peaks) {
      const dist = Math.abs(x - px);
      // blocky stepped contour in 2-voxel increments
      const stepped = Math.floor(dist / 2) * 2;
      const y = Math.round(py + stepped * slope);
      if (y < top) top = y;
    }
    farH[x] = clamp(top, 12, 31);
  }
  for (let x = -6; x < w + 6; x++) {
    const cx = clamp(x, 0, w - 1);
    const top = farH[cx];
    mtFar.add('mt-far', x, top, 1, h - top);
    // crisp snow cap on summits above y=18
    if (top <= 18) {
      const snowDepth = clamp(19 - top + (cx % 3 === 0 ? 1 : 0), 1, 5);
      mtFar.add('snow', x, top, 1, Math.min(2, snowDepth));
      if (snowDepth > 2) mtFar.add('snow-sh', x, top + 2, 1, snowDepth - 2);
    }
  }

  // ── 4. mid-ground sweeping foothills (gentle, smooth continuous silhouette — zero notches or sharp dips)
  const midHills = [
    // [centerX, riseHeight, leftSpread, rightSpread]
    [20, 5.2, 34, 42],
    [98, 4.4, 44, 38],
    [192, 3.6, 38, 34],
    [248, 5.0, 38, 46],
    [306, 4.4, 36, 34],
  ];
  const midH = new Array(w);
  for (let x = 0; x < w; x++) {
    let lift = 0;
    for (const [cx, amp, sl, sr] of midHills) {
      const dx = x - cx;
      const spread = dx < 0 ? sl : sr;
      const u = dx / spread;
      // smooth weighted blend (sum with soft cap) avoids sharp V-shaped valleys between hills
      lift += amp * Math.exp(-u * u * 1.05);
    }
    midH[x] = clamp(Math.round(30 - Math.min(6.2, lift)), 23, 29);
  }
  for (let x = -6; x < w + 6; x++) {
    const cx = clamp(x, 0, w - 1);
    const top = midH[cx];
    mtMid.add('mt-mid', x, top, 1, h - top);
  }

  // ── 5. foreground terrain profile + shallower natural sandy lake
  const waterY = 35;
  const lakeStart = 127;
  const lakeEnd = 172;
  const terrain = new Array(w);
  for (let x = 0; x < w; x++) {
    if (x >= lakeStart && x <= lakeEnd) {
      // gentle asymmetric shallow pond (max 3 blocks deep: y=36..38) leaving natural rock below
      const left = x - lakeStart;
      const right = lakeEnd - x;
      if (left <= 2 || right <= 1) terrain[x] = 36;
      else if (left <= 7 || right <= 5) terrain[x] = 37;
      else terrain[x] = 38;
    } else if (x >= 182 && x <= 222) {
      // level scenic bluff for cabin, campfire & lantern
      terrain[x] = 32;
    } else if (x >= 173 && x < 182) {
      // smooth stepped rise from eastern shore up to the bluff
      terrain[x] = x < 176 ? 34 : x < 179 ? 33 : 32;
    } else if (x >= 122 && x < lakeStart) {
      // gentle sandy western beach sloping into the water
      terrain[x] = x < 124 ? 34 : 35;
    } else if (x >= 72 && x <= 104) {
      // calm clean meadow where the avatar sits
      terrain[x] = 34;
    } else {
      const wave = Math.sin(x * 0.055 + 0.6) * 1.4 + Math.cos(x * 0.12) * 0.6;
      terrain[x] = clamp(Math.round(33.5 + wave), 32, 35);
    }
  }

  // layered luminous shallow water (fills cleanly down to each column's curved sand bed)
  for (let x = lakeStart; x <= lakeEnd; x++) {
    const bed = terrain[x];
    const depth = bed - waterY;
    ground.add('water-surf', x, waterY, 1, 0.5);
    ground.add('water', x, waterY + 0.5, 1, Math.min(0.75, depth - 0.5));
    if (depth > 1.25) ground.add('water-mid', x, waterY + 1.25, 1, Math.min(0.95, depth - 1.25));
    if (depth > 2.2) ground.add('water-deep', x, waterY + 2.2, 1, depth - 2.2);
  }
  // subtle underwater caustic ripples inside the 3-block water column
  ground.add('water-caustic', 132, 36.1, 3, 0.45);
  ground.add('water-caustic', 144, 36.75, 4, 0.45);
  ground.add('water-caustic', 157, 36.9, 3.5, 0.45);
  ground.add('water-caustic', 165, 36.15, 2.5, 0.45);

  // animated moonlight / sunlight reflection shimmer cascading across the shallower lake
  const glintA = [
    [152, 35.15, 5.5, 0.45],
    [160, 35.15, 3, 0.45],
    [154, 35.9, 4.5, 0.45],
    [156, 36.65, 2.5, 0.45],
    [136, 35.2, 3, 0.4],
  ];
  const glintB = [
    [148, 35.15, 3.5, 0.45],
    [159, 35.55, 4, 0.4],
    [151, 36.3, 3.5, 0.4],
    [143, 35.2, 2.5, 0.4],
  ];
  for (const [gx, gy, gw, gh] of glintA) waterFx.add('glint-a', gx, gy, gw, gh);
  for (const [gx, gy, gw, gh] of glintB) waterFx.add('glint-b', gx, gy, gw, gh);
  // warm golden lantern & campfire shimmer reflecting along the eastern water edge (night)
  waterFx.add('glint-warm', 166, 35.15, 5, 0.45);
  waterFx.add('glint-warm', 168, 35.8, 3.5, 0.45);
  waterFx.add('glint-warm', 169.5, 36.35, 2, 0.4);

  // cute lily pads (one with a tiny blossom) + lakeside sugarcane reeds
  ground.add('lily', 132, 35, 3, 0.65);
  ground.add('lily-dk', 132, 35.65, 3, 0.35);
  ground.add('fl-p', 133.5, 34.4, 1, 0.6);
  ground.add('lily', 141, 35, 2.5, 0.65);
  ground.add('lily-dk', 141, 35.65, 2.5, 0.35);
  // lakeside sugarcane reeds on both shores
  ground.add('reed', 125.5, 32, 0.75, 3);
  ground.add('reed-hi', 125.5, 32.5, 0.75, 0.5);
  ground.add('reed-hi', 125.5, 33.75, 0.75, 0.5);
  ground.add('reed', 126.5, 33, 0.75, 2);
  ground.add('reed-hi', 126.5, 33.5, 0.75, 0.5);
  ground.add('reed', 173, 31.5, 0.75, 2.5);
  ground.add('reed-hi', 173, 32.25, 0.75, 0.5);

  // calm, smooth asymmetric dirt thickness & deepslate horizon (gentle wide swells, zero noisy jitter!)
  const dirtDepths = new Array(w);
  let dd = 2;
  let ddRun = 0;
  for (let x = 0; x < w; x++) {
    if (ddRun <= 0) {
      ddRun = 7 + Math.floor(rnd() * 11);
      dd = rnd() < 0.55 ? 2 : 3;
    }
    ddRun--;
    dirtDepths[x] = dd;
  }

  const deepLine = new Array(w);
  let dl = 41;
  let dlRun = 0;
  for (let x = 0; x < w; x++) {
    if (dlRun <= 0) {
      dlRun = 16 + Math.floor(rnd() * 20);
      dl = dl === 41 ? 42 : 41;
    }
    dlRun--;
    // gently lift deepslate by 1 under the tall cabin bluff (x=184..228) for natural geology
    deepLine[x] = x >= 188 && x <= 222 && dl === 41 ? 40 : dl;
  }

  const pickTone = (base, hi, dk) => {
    const t = rnd();
    return t < 0.74 ? base : t < 0.88 ? dk : hi;
  };

  // draw clean, cohesive Minecraft cutaway matching footer strata
  const stoneTops = new Array(w);
  for (let x = 0; x < w; x++) {
    const top = terrain[x];
    const inLake = x >= lakeStart && x <= lakeEnd;
    const isBeach = (x >= 123 && x < lakeStart) || (x > lakeEnd && x <= 174);
    if (inLake) {
      // clean wet sand bed (1 block thick, gently blended with dry sand highlights)
      ground.add('sand-wet', x, top, 1, 1);
      if (rnd() < 0.25) ground.add('sand', x, top, 1, 0.5);
      stoneTops[x] = top + 1;
    } else if (isBeach) {
      // warm dry sandy shore stepping smoothly into stone
      ground.add('sand-hi', x, top, 1, 0.5);
      ground.add('sand', x, top + 0.5, 1, 1.5);
      if (x === lakeStart - 1 || x === lakeEnd + 1) ground.add('sand-wet', x, top + 1.5, 1, 0.5);
      ground.add('sand-dk', x, top + 2, 1, 1);
      stoneTops[x] = top + 3;
    } else {
      // crisp 3-tone Minecraft grass cap + clean stepped overhang
      ground.add('grass-hi', x, top, 1, 0.45);
      ground.add('grass', x, top + 0.45, 1, 0.55);
      if (rnd() < 0.26) ground.add('grass2', x, top + 0.35, 1, 0.65);
      const dirtBlocks = dirtDepths[x];
      for (let dy = 0; dy < dirtBlocks; dy++) {
        ground.add(pickTone('dirt', 'dirt-hi', 'dirt-dk'), x, top + 1 + dy, 1, 1);
      }
      // restrained grass overhang pixels
      const overhang = rnd();
      if (overhang < 0.22) ground.add('grass', x, top + 1, 1, 0.65);
      else if (overhang < 0.46) ground.add('grass-dk', x, top + 1, 1, 0.4);
      stoneTops[x] = top + 1 + dirtBlocks;
    }

    // calm 1×1 stone → gentle clean deepslate transition (matched to footer strata!)
    const sTop = stoneTops[x];
    const dLine = Math.max(sTop + 1, deepLine[x]);
    for (let y = sTop; y < h; y++) {
      let isDeep = y >= dLine;
      // restrained natural transition right on the boundary row (no messy scatter)
      if (y === dLine && rnd() < 0.2) isDeep = false;
      const cls = isDeep ? pickTone('deep', 'deep-hi', 'deep-dk') : pickTone('stone', 'stone-hi', 'stone-dk');
      ground.add(cls, x, y, 1, 1);
    }
  }

  // geologically authentic Minecraft ore veins: coal/iron higher in stone, gold/lapis mid, diamond/redstone deep in deepslate
  const addOreVein = (kind, ox, oy, glint = false) => {
    const pattern = [
      [0, 0, 1, 0.5],
      [1, 0.5, 1, 0.5],
      [0.5, 1, 1, 0.5],
      [-0.5, 0.5, 0.5, 0.5],
    ];
    for (const [dx, dy, pw, ph] of pattern) ground.add('ore-' + kind, ox + dx, oy + dy, pw, ph);
    if (kind !== 'coal') ground.add('ore-' + kind + '-hi', ox + 0.5, oy, 0.5, 0.5);
    if (glint) oreGlint.add('ore-glint', ox + 0.5, oy, 0.5, 0.5);
  };
  // irregular natural spacings & realistic depths (never symmetric or evenly spaced!)
  const veins = [
    ['coal', 43, 38.5, false],
    ['iron', 58, 38, false],
    ['diamond', 71, 41.5, true],
    ['coal', 98, 39, false],
    ['gold', 112, 40.5, true],
    ['iron', 129, 39.5, false],
    ['lapis', 147, 41, false],
    ['diamond', 164, 42, true],
    ['redstone', 184, 41.5, true],
    ['iron', 193, 37.5, false],
    ['emerald', 206, 39.5, true],
    ['diamond', 214, 42, true],
    ['coal', 238, 38.5, false],
    ['gold', 251, 40, true],
    ['redstone', 269, 42, false],
    ['iron', 289, 39, false],
  ];
  for (const [kind, ox, oy, g] of veins) {
    const safeY = Math.max(stoneTops[clamp(Math.round(ox), 0, w - 1)] + 0.25, oy);
    if (safeY <= h - 1.5) addOreVein(kind, ox, safeY, g);
  }

  // ── 6. shaded Minecraft trees (tall spruce pines + rounded oaks)
  const plantSpruce = (cx, base, tall = 9) => {
    ground.add('trunk', cx, base - 3, 1, 3);
    const tip = base - tall;
    // tiered pyramidal foliage
    ground.add('spruce-hi', cx, tip, 1, 1);
    ground.add('spruce', cx, tip + 1, 1, 1);
    ground.add('spruce', cx - 1, tip + 2, 3, 1);
    ground.add('spruce-hi', cx - 1, tip + 2, 1, 1);
    ground.add('spruce-dk', cx + 1, tip + 2, 1, 1);
    ground.add('spruce', cx - 2, tip + 3, 5, 1);
    ground.add('spruce-dk', cx - 2, tip + 4, 5, 1);
    ground.add('spruce', cx - 1, tip + 4, 2, 1);
    if (tall >= 8) {
      ground.add('spruce', cx - 2, tip + 5, 5, 1);
      ground.add('spruce-hi', cx - 2, tip + 5, 1, 1);
      ground.add('spruce', cx - 3, tip + 6, 7, 1);
      ground.add('spruce-dk', cx - 3, tip + 6, 2, 1);
      ground.add('spruce-dk', cx + 2, tip + 6, 2, 1);
    }
    if (tall >= 10) {
      ground.add('spruce', cx - 2, tip + 7, 5, 1);
      ground.add('spruce-dk', cx - 3, tip + 8, 7, 1);
      ground.add('spruce', cx - 1, tip + 8, 3, 1);
    }
  };

  const plantOak = (cx, base, trunkH = 4) => {
    ground.add('trunk', cx, base - trunkH, 1, trunkH);
    const cy = base - trunkH;
    ground.add('leaf-dk', cx - 3, cy - 1, 7, 1);
    ground.add('leaf', cx - 3, cy - 2, 7, 1);
    ground.add('leaf', cx - 3, cy - 3, 7, 1);
    ground.add('leaf', cx - 2, cy - 4, 5, 1);
    ground.add('leaf2', cx - 1, cy - 5, 3, 1);
    // sunlit top-left highlights & bottom-right shading
    ground.add('leaf2', cx - 2, cy - 4, 2, 1);
    ground.add('leaf2', cx - 3, cy - 3, 2, 1);
    ground.add('leaf-dk', cx + 2, cy - 2, 2, 1);
    ground.add('leaf-dk', cx + 1, cy - 1, 3, 1);
  };

  // curated tree placement: lush framing, zero overlap with avatar/lake/cabin/moon
  plantSpruce(14, terrain[14], 10);
  plantOak(32, terrain[32], 4);
  plantSpruce(50, terrain[50], 9);
  plantOak(63, terrain[63], 3);
  plantSpruce(108, terrain[108], 10);
  plantSpruce(117, terrain[117], 8);
  plantSpruce(223, terrain[223], 10);
  plantOak(237, terrain[237], 4);
  plantSpruce(252, terrain[252], 9);
  plantSpruce(265, terrain[265], 8);
  plantOak(285, terrain[285], 4);
  plantSpruce(304, terrain[304], 10);

  // ── 7. cozy Minecraft timber cabin, campfire & lakeside lantern on bluff (base=32)
  const bx = 198;
  const by = 32;
  // stone foundation
  ground.add('cobble', bx + 1, by - 1, 15, 1);
  ground.add('cobble2', bx + 3, by - 1, 2, 1);
  ground.add('cobble2', bx + 9, by - 1, 3, 1);
  // oak plank walls + dark-oak corner logs
  ground.add('plank', bx + 1, by - 6, 15, 5);
  ground.add('plank-sh', bx + 1, by - 6, 15, 1);
  ground.add('plank-sh', bx + 2, by - 3, 13, 1);
  ground.add('log', bx + 1, by - 6, 1, 6);
  ground.add('log', bx + 15, by - 6, 1, 6);
  // recessed door
  ground.add('log', bx + 7, by - 4, 2, 3);
  ground.add('plank-sh', bx + 7, by - 4, 2, 1);
  // warm glowing windows (left & right of door)
  lights.add('win-glow', bx + 3, by - 4, 3, 2);
  lights.add('win-core', bx + 4, by - 4, 1, 1);
  lights.add('win-glow', bx + 11, by - 4, 3, 2);
  lights.add('win-core', bx + 12, by - 4, 1, 1);
  // stepped gabled roof with eave overhang
  ground.add('roof', bx - 1, by - 7, 19, 1);
  ground.add('roof', bx + 1, by - 8, 15, 1);
  ground.add('roof', bx + 3, by - 9, 11, 1);
  ground.add('roof', bx + 5, by - 10, 7, 1);
  ground.add('roof-hi', bx - 1, by - 7, 2, 1);
  ground.add('roof-hi', bx + 1, by - 8, 2, 1);
  ground.add('roof-hi', bx + 3, by - 9, 2, 1);
  ground.add('roof-hi', bx + 5, by - 10, 3, 1);
  // stone chimney + drifting animated smoke puffs
  ground.add('cobble', bx + 12, by - 13, 2, 4);
  ground.add('cobble2', bx + 12, by - 13, 1, 1);
  smoke.add('smoke-1', bx + 12, by - 15, 2, 1);
  smoke.add('smoke-2', bx + 13, by - 17, 2, 1);
  smoke.add('smoke-3', bx + 14, by - 19, 2, 1);

  // lakeside glowing lantern post (x = 184)
  ground.add('log', 184, by - 4, 1, 4);
  ground.add('log', 183, by - 4, 1, 1);
  ground.add('cobble2', 183, by - 3, 1, 1);
  lights.add('lantern', 183, by - 2, 1, 1);

  // cozy campfire beside the cabin (x = 190..192)
  ground.add('log', 190, by - 1, 3, 1);
  lights.add('flame-a', 191, by - 2, 1, 1);
  lights.add('flame-b', 191, by - 3, 1, 1);

  // ── 8. sparse wildflowers & grass tufts + floating night fireflies
  const flowers = [
    [42, 'fl-r'],
    [82, 'fl-y'],
    [96, 'fl-b'],
    [120, 'fl-y'],
    [179, 'fl-r'],
    [229, 'fl-b'],
    [274, 'fl-y'],
  ];
  for (const [fx, cls] of flowers) {
    ground.add('grass2', fx, terrain[fx] - 1, 1, 1);
    ground.add(cls, fx, terrain[fx] - 2, 1, 1);
  }

  const ffSpots = [
    [68, 29, 'ff-1'],
    [93, 30, 'ff-2'],
    [119, 28, 'ff-3'],
    [144, 31, 'ff-1'],
    [166, 30, 'ff-2'],
    [187, 27, 'ff-3'],
    [228, 28, 'ff-1'],
    [258, 29, 'ff-2'],
  ];
  for (const [fx, fy, cls] of ffSpots) fireflies.add(cls, fx, fy, 1, 1);

  const attr = (k) => {
    if (k.startsWith('ore-')) return `class="ore ${k}"`;
    if (k === 'star-a' || k === 'star-b') return `class="star ${k}"`;
    if (k.startsWith('ff-')) return `class="ff ${k}"`;
    if (k.startsWith('smoke-')) return `class="smoke-puff ${k}"`;
    return `class="${k}"`;
  };

  const defs =
    '<defs>' +
    '<radialGradient id="mc-sg"><stop offset="0%" stop-color="#fff3a8" stop-opacity=".68"/><stop offset="45%" stop-color="#ffd56b" stop-opacity=".22"/><stop offset="100%" stop-color="#ffd56b" stop-opacity="0"/></radialGradient>' +
    '<radialGradient id="mc-mg"><stop offset="0%" stop-color="#d2e0ff" stop-opacity=".44"/><stop offset="45%" stop-color="#8ba8ff" stop-opacity=".14"/><stop offset="100%" stop-color="#8ba8ff" stop-opacity="0"/></radialGradient>' +
    '<radialGradient id="mc-wg"><stop offset="0%" stop-color="#ffbf59" stop-opacity=".5"/><stop offset="45%" stop-color="#ff8c2e" stop-opacity=".17"/><stop offset="100%" stop-color="#ff8c2e" stop-opacity="0"/></radialGradient>' +
    '<linearGradient id="mc-mf" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--mt-far-hi)"/><stop offset="55%" stop-color="var(--mt-far)"/><stop offset="100%" stop-color="var(--mt-far)"/></linearGradient>' +
    '<linearGradient id="mc-mm" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--mt-mid-hi)"/><stop offset="45%" stop-color="var(--mt-mid)"/><stop offset="100%" stop-color="var(--mt-mid)"/></linearGradient>' +
    '<linearGradient id="mc-au1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#7c68ff" stop-opacity="0"/><stop offset="28%" stop-color="#7c68ff" stop-opacity=".11"/><stop offset="68%" stop-color="var(--accent)" stop-opacity=".22"/><stop offset="92%" stop-color="var(--accent)" stop-opacity=".34"/><stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/></linearGradient>' +
    '<linearGradient id="mc-au2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#a67cff" stop-opacity="0"/><stop offset="35%" stop-color="#5ce6ff" stop-opacity=".13"/><stop offset="78%" stop-color="var(--accent)" stop-opacity=".24"/><stop offset="100%" stop-color="#5ce6ff" stop-opacity="0"/></linearGradient>' +
    '<linearGradient id="mc-aurib" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="var(--accent)" stop-opacity="0"/><stop offset="22%" stop-color="var(--accent)" stop-opacity=".42"/><stop offset="56%" stop-color="#6ef5ff" stop-opacity=".46"/><stop offset="84%" stop-color="#b58cff" stop-opacity=".34"/><stop offset="100%" stop-color="#b58cff" stop-opacity="0"/></linearGradient>' +
    '<linearGradient id="mc-aurib2" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#5ce6ff" stop-opacity="0"/><stop offset="30%" stop-color="#7df5ff" stop-opacity=".30"/><stop offset="72%" stop-color="#b58cff" stop-opacity=".34"/><stop offset="100%" stop-color="#b58cff" stop-opacity="0"/></linearGradient>' +
    '<linearGradient id="mc-auray" x1="0" y1="1" x2="0" y2="0"><stop offset="0%" stop-color="var(--accent)" stop-opacity=".28"/><stop offset="55%" stop-color="#7cf0ff" stop-opacity=".14"/><stop offset="100%" stop-color="#9e7cff" stop-opacity="0"/></linearGradient>' +
    '<linearGradient id="mc-afade" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#000"/><stop offset="16%" stop-color="#fff"/><stop offset="76%" stop-color="#fff"/><stop offset="100%" stop-color="#000"/></linearGradient>' +
    '<mask id="mc-amask"><rect x="18" y="0" width="206" height="22" fill="url(#mc-afade)"/></mask>' +
    '<filter id="mc-ablur" x="-14%" y="-35%" width="128%" height="170%"><feGaussianBlur stdDeviation="2.1"/></filter>' +
    '<filter id="mc-ablur-sm" x="-14%" y="-35%" width="128%" height="170%"><feGaussianBlur stdDeviation="1.05"/></filter>' +
    '</defs>';

  return (
    `<svg class="scene-art" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMax slice" shape-rendering="crispEdges" aria-hidden="true" focusable="false">` +
    defs +
    auroraMarkup +
    `<g class="sky-bodies">` +
    `<circle class="sun-halo" cx="${celX + 3.5}" cy="${celY + 3.5}" r="22" fill="url(#mc-sg)"/>` +
    `<circle class="moon-halo" cx="${celX + 3}" cy="${celY + 3}" r="20" fill="url(#mc-mg)"/>` +
    sky.paths(attr) +
    `</g>` +
    `<g class="clouds clouds-a">${cloudsA.paths(attr)}</g>` +
    `<g class="clouds clouds-b">${cloudsB.paths(attr)}</g>` +
    `<g class="mt-far">${mtFar.paths(attr)}</g>` +
    `<g class="mt-mid">${mtMid.paths(attr)}</g>` +
    `<g class="ground">${ground.paths(attr)}</g>` +
    `<g class="ore-glints">${oreGlint.paths(attr)}</g>` +
    `<g class="water-fx">${waterFx.paths(attr)}</g>` +
    `<g class="warm-halos"><circle class="warm-halo" cx="205.5" cy="29" r="15" fill="url(#mc-wg)"/><circle class="warm-halo warm-halo-sm" cx="183.5" cy="30" r="9" fill="url(#mc-wg)"/></g>` +
    `<g class="lights">${lights.paths(attr)}</g>` +
    `<g class="smoke">${smoke.paths(attr)}</g>` +
    `<g class="fireflies">${fireflies.paths(attr)}</g>` +
    '</svg>'
  );
}
