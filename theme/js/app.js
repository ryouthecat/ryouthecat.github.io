/* Site behaviour — progressive enhancement only; every page works without this file. */
(function () {
'use strict';
var d = document;
var root = d.documentElement;
var $ = function (s, c) { return (c || d).querySelector(s); };
var $$ = function (s, c) { return Array.prototype.slice.call((c || d).querySelectorAll(s)); };
var store = function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} };
var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion:reduce)').matches;
var canHover = window.matchMedia && window.matchMedia('(hover:hover)').matches;

var animTimer = null;
var smoothTheme = function () {
  if (reduceMotion) return;
  root.classList.add('theme-anim');
  clearTimeout(animTimer);
  animTimer = setTimeout(function () { root.classList.remove('theme-anim'); }, 300);
};

/* optional hybrid CC0 sample + clean bell Web Audio SFX (default Off; first enable -> 20%; zero network while muted) */
var sfxBtn = $('#sfx-toggle');
var sfxMenu = $('#sfx-menu');
var sfxRange = $('#sfx-range');
var sfxValEl = $('#sfx-val');
var sfxBase = (sfxBtn && sfxBtn.getAttribute('data-sfx-base')) || '/sfx/';
var closeSfx = null;
var sfxVol = 0;
try {
  var savedVol = parseInt(localStorage.getItem('sfx_vol'), 10);
  if (!isNaN(savedVol)) sfxVol = Math.max(0, Math.min(100, savedVol));
  else if (localStorage.getItem('sfx') === '1') sfxVol = 20;
} catch (e) {}
var sfxOn = sfxVol > 0;
var sfxCtx = null;
var sfxMaster = null;
var sfxBufs = {};
var sfxPending = {};
var sfxPreloaded = false;
var sfxLastBoom = -1;
var sfxLast = {};
var sfxMinGap = { click: 35, aim: 90, theme: 120, meteor: 75, boom: 55, splash: 70, crackle: 110, adv: 140, challenge: 200, xp: 180 };
var sfxFiles = {
  boom1: 'boom1.mp3', boom2: 'boom2.mp3', boom3: 'boom3.mp3',
  meteor: 'meteor.mp3', splash1: 'splash1.mp3', splash2: 'splash2.mp3',
  steam: 'steam.mp3', crackle: 'crackle.mp3', wood: 'wood.mp3',
  click: 'click.mp3', aim: 'aim.mp3', chime: 'chime.mp3', xp: 'xp.mp3'
};

var sfxGainValue = function () {
  /* calibrated for -14 LUFS mastered CC0 samples: 20% -> 0.28, 50% -> 0.62, 100% -> 1.15 */
  if (sfxVol <= 0) return 0;
  return Math.pow(sfxVol / 100, 0.88) * 1.15;
};

var decodeSfxBuf = function (ctx, ab) {
  return new Promise(function (resolve, reject) {
    try {
      var p = ctx.decodeAudioData(ab, resolve, reject);
      if (p && p.then) p.then(resolve, reject);
    } catch (err) { reject(err); }
  });
};

var loadSfxSample = function (ctx, name) {
  if (sfxBufs[name]) return Promise.resolve(sfxBufs[name]);
  if (sfxPending[name]) return sfxPending[name];
  var file = sfxFiles[name];
  if (!file || typeof fetch !== 'function') return Promise.resolve(null);
  sfxPending[name] = fetch(sfxBase + file)
    .then(function (r) { return r.ok ? r.arrayBuffer() : null; })
    .then(function (ab) { return ab ? decodeSfxBuf(ctx, ab) : null; })
    .then(function (buf) {
      if (buf) sfxBufs[name] = buf;
      delete sfxPending[name];
      return buf;
    })
    .catch(function () { delete sfxPending[name]; return null; });
  return sfxPending[name];
};

var preloadSfx = function (ctx) {
  if (sfxPreloaded || !ctx) return;
  sfxPreloaded = true;
  Object.keys(sfxFiles).forEach(function (k) { loadSfxSample(ctx, k); });
};

var ensureAudio = function () {
  if (!sfxCtx) {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      sfxCtx = new AC();
      sfxMaster = sfxCtx.createGain();
      sfxMaster.gain.value = sfxGainValue();
      var comp = sfxCtx.createDynamicsCompressor ? sfxCtx.createDynamicsCompressor() : null;
      if (comp) {
        comp.threshold.value = -3;
        comp.knee.value = 8;
        comp.ratio.value = 6;
        comp.attack.value = 0.003;
        comp.release.value = 0.12;
        sfxMaster.connect(comp);
        comp.connect(sfxCtx.destination);
      } else {
        sfxMaster.connect(sfxCtx.destination);
      }
    } catch (e) { sfxCtx = null; return null; }
  }
  if (sfxMaster) sfxMaster.gain.setTargetAtTime(sfxGainValue(), sfxCtx.currentTime, 0.015);
  if (sfxCtx.state === 'suspended' && sfxCtx.resume) sfxCtx.resume().catch(function () {});
  preloadSfx(sfxCtx);
  return sfxCtx;
};

var sfxBell = function (ctx, freq, delay, dur, vol) {
  /* silky harmonic sine bell — zero distortion, used for musical Day/Night & Challenge cues */
  var t = ctx.currentTime + (delay || 0);
  var osc = ctx.createOscillator();
  var g = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(Math.max(40, freq), t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g);
  g.connect(sfxMaster);
  osc.start(t);
  osc.stop(t + dur + 0.02);
};

var sfxPlaySample = function (ctx, name, vol, rate, delay, fallback) {
  var startBuf = function (buf) {
    if (!buf) { if (fallback) fallback(); return; }
    var t = ctx.currentTime + (delay || 0);
    var src = ctx.createBufferSource();
    src.buffer = buf;
    if (rate && rate !== 1) src.playbackRate.setValueAtTime(rate, t);
    var g = ctx.createGain();
    g.gain.setValueAtTime(vol || 0.8, t);
    src.connect(g);
    g.connect(sfxMaster);
    src.start(t);
  };
  if (sfxBufs[name]) { startBuf(sfxBufs[name]); return; }
  var requestedAt = performance.now();
  loadSfxSample(ctx, name).then(function (buf) {
    if (!sfxOn || d.hidden) return;
    if (buf && performance.now() - requestedAt < 550) startBuf(buf);
    else if (!buf && fallback) fallback();
  });
};

var playSfx = function (kind, arg) {
  if (!sfxOn || d.hidden) return;
  var now = performance.now();
  var gap = sfxMinGap[kind] || 40;
  if (sfxLast[kind] && now - sfxLast[kind] < gap) return;
  sfxLast[kind] = now;
  var ctx = ensureAudio();
  if (!ctx) return;

  if (kind === 'click') {
    sfxPlaySample(ctx, 'click', 0.58, 0.94 + Math.random() * 0.14, 0, function () {
      sfxBell(ctx, 760, 0, 0.035, 0.18);
    });
  } else if (kind === 'aim') {
    sfxPlaySample(ctx, 'aim', 0.56, 0.95 + Math.random() * 0.12, 0, function () {
      sfxBell(ctx, 440, 0, 0.06, 0.2);
    });
  } else if (kind === 'theme') {
    var notes = arg === 'light' ? [587.33, 739.99, 880] : [880, 659.25, 554.37];
    for (var ti = 0; ti < notes.length; ti++) {
      sfxBell(ctx, notes[ti], ti * 0.06, 0.28, 0.24);
      sfxBell(ctx, notes[ti] * 2, ti * 0.06, 0.16, 0.07);
    }
  } else if (kind === 'meteor') {
    sfxPlaySample(ctx, 'meteor', 0.62, 0.92 + Math.random() * 0.22, 0);
  } else if (kind === 'boom') {
    var pwr = (arg && typeof arg.power === 'number') ? arg.power : (typeof arg === 'number' ? arg : 0.35);
    var surf = (arg && arg.surface) || 'grass';
    var pool = ['boom1', 'boom2', 'boom3'];
    var idx;
    if (pwr >= 0.62) {
      idx = 2;
    } else {
      idx = Math.floor(Math.random() * pool.length);
      if (idx === sfxLastBoom) idx = (idx + 1) % pool.length;
    }
    sfxLastBoom = idx;
    var rate = pwr >= 0.62 ? (0.88 + Math.random() * 0.1) : (0.91 + Math.random() * 0.18);
    var vol = Math.min(1.12, 0.84 + pwr * 0.26);
    sfxPlaySample(ctx, pool[idx], vol, rate, 0);
    if (pwr >= 0.62) sfxPlaySample(ctx, 'boom1', 0.34, 1.04 + Math.random() * 0.08, 0.012);
    if (surf === 'wood') sfxPlaySample(ctx, 'wood', 0.72, 0.92 + Math.random() * 0.16, 0);
  } else if (kind === 'splash') {
    var big = !!arg;
    if (big) {
      sfxPlaySample(ctx, 'splash1', 0.92, 0.93 + Math.random() * 0.15, 0);
      sfxPlaySample(ctx, 'steam', 0.54, 0.94 + Math.random() * 0.14, 0.055);
    } else {
      sfxPlaySample(ctx, 'splash2', 0.76, 0.92 + Math.random() * 0.18, 0);
    }
  } else if (kind === 'crackle') {
    sfxPlaySample(ctx, 'crackle', 0.78, 0.94 + Math.random() * 0.12, 0);
  } else if (kind === 'adv') {
    sfxPlaySample(ctx, 'chime', 0.74, 1, 0, function () {
      sfxBell(ctx, 659.25, 0, 0.2, 0.26);
      sfxBell(ctx, 987.77, 0.095, 0.36, 0.3);
    });
  } else if (kind === 'challenge') {
    var cNotes = [523.25, 659.25, 783.99, 987.77, 1046.5];
    for (var ni = 0; ni < cNotes.length; ni++) {
      var nt = ni * 0.075;
      var nd = ni === 4 ? 0.55 : 0.22;
      sfxBell(ctx, cNotes[ni], nt, nd, 0.26);
      sfxBell(ctx, cNotes[ni] * 2, nt, nd * 0.7, 0.08);
    }
    sfxPlaySample(ctx, 'chime', 0.52, 1.12, 0.24);
  } else if (kind === 'xp') {
    var ratios = [0.95, 1.07, 1.2, 1.42, 1.6];
    for (var xi = 0; xi < ratios.length; xi++) {
      var r = ratios[xi] * (0.97 + Math.random() * 0.06);
      sfxPlaySample(ctx, 'xp', 0.44, r, xi * 0.052 + Math.random() * 0.012);
    }
  }
};

if (sfxBtn && sfxMenu) {
  sfxMenu.removeAttribute('hidden');
  var sfxOpen = false;
  var syncSfxUi = function () {
    sfxOn = sfxVol > 0;
    root.setAttribute('data-sfx', sfxOn ? 'on' : 'off');
    sfxBtn.setAttribute('title', sfxOn ? 'Sound effects (' + sfxVol + '%)' : 'Sound effects (off)');
    if (sfxRange) sfxRange.value = String(sfxVol);
    if (sfxValEl) sfxValEl.textContent = sfxOn ? sfxVol + '%' : 'Off';
    $$('.sfx-opt', sfxMenu).forEach(function (b) {
      b.setAttribute('aria-pressed', parseInt(b.getAttribute('data-vol'), 10) === sfxVol ? 'true' : 'false');
    });
    if (sfxMaster && sfxCtx) sfxMaster.gain.setTargetAtTime(sfxGainValue(), sfxCtx.currentTime, 0.012);
  };
  var setSfxVol = function (v, preview) {
    sfxVol = Math.max(0, Math.min(100, parseInt(v, 10) || 0));
    store('sfx_vol', String(sfxVol));
    store('sfx', sfxVol > 0 ? '1' : '0');
    syncSfxUi();
    if (preview && sfxVol > 0) playSfx('adv');
  };
  var setSfxMenu = function (open) {
    sfxOpen = !!open;
    if (sfxOpen && closeDye) closeDye();
    sfxMenu.classList.toggle('open', sfxOpen);
    sfxMenu.setAttribute('aria-hidden', sfxOpen ? 'false' : 'true');
    sfxBtn.setAttribute('aria-expanded', sfxOpen ? 'true' : 'false');
  };
  closeSfx = function () { if (sfxOpen) setSfxMenu(false); };
  syncSfxUi();
  setSfxMenu(false);
  sfxBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    if (!sfxOpen && sfxVol === 0) {
      setSfxVol(20, true);
      setSfxMenu(true);
    } else {
      setSfxMenu(!sfxOpen);
    }
    if (e.detail > 0) sfxBtn.blur();
  });
  if (sfxRange) {
    sfxRange.addEventListener('input', function () { setSfxVol(sfxRange.value, false); });
    sfxRange.addEventListener('change', function () { setSfxVol(sfxRange.value, true); });
  }
  sfxMenu.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('.sfx-opt') : null;
    if (!b) return;
    setSfxVol(b.getAttribute('data-vol'), true);
    if (e.detail > 0) b.blur();
  });
  d.addEventListener('click', function (e) { if (sfxOpen && !sfxMenu.contains(e.target)) setSfxMenu(false); });
  d.addEventListener('keydown', function (e) { if (e.key === 'Escape' && sfxOpen) { setSfxMenu(false); sfxBtn.focus(); } });
}

/* Minecraft "Advancement Made!" toast engine (one-shot per browser via localStorage) */
var ADV_STORE = 'ryou_adv';
var ADV_LIST = {
  dye: {
    title: 'Dye Hard',
    sub: 'Customised your accent colour',
    ico: '<svg class="px" viewBox="0 0 8 8" width="20" height="20" shape-rendering="crispEdges"><path fill="var(--accent)" d="M3 1h2v1h1v1h1v3h-1v1h-4v-1h-1v-3h1v-1h1z"/><path fill="rgba(255,255,255,.45)" d="M2 3h1v2h-1zM3 2h1v1h-1z"/></svg>'
  },
  copy: {
    title: 'Paste Engineer',
    sub: 'Copied a code snippet',
    ico: '<svg class="px" viewBox="0 0 8 8" width="20" height="20" shape-rendering="crispEdges"><path fill="#d8cfb8" d="M1 0h5v1h1v7h-6z"/><path fill="#5d667a" d="M2 2h3v1h-3zM2 4h4v1h-4zM2 6h3v1h-3z"/></svg>'
  },
  search: {
    title: 'Deep Recon',
    sub: 'Opened Quick Search',
    ico: '<svg class="px" viewBox="0 0 8 8" width="20" height="20" shape-rendering="crispEdges"><path fill="#7ee8ff" d="M2 1h2v1h1v2h-1v1h-2v-1h-1v-2h1z"/><path fill="#e6b042" d="M4 4h1v1h1v1h1v1h-1v-1h-1v-1h-1z"/><path fill="#ffffff" d="M2 2h1v1h-1z"/></svg>'
  },
  meteor: {
    title: 'Starfall',
    sub: 'Drag to aim · Shift-sweep or dbl-click for barrage',
    ico: '<svg class="px" viewBox="0 0 8 8" width="20" height="20" shape-rendering="crispEdges"><path fill="#e84b2c" d="M0 1h2v1h1v1h-2v-1h-1z"/><path fill="#ff9c2a" d="M2 2h2v1h1v1h-2v-1h-1z"/><path fill="#ffe46b" d="M4 4h3v3h-3z"/><path fill="#fffbe0" d="M5 5h1v1h-1z"/></svg>'
  },
  reader: {
    title: 'Flag Captured',
    sub: 'Read a write-up to the end',
    ico: '<svg class="px" viewBox="0 0 8 8" width="20" height="20" shape-rendering="crispEdges"><path fill="#8a5a30" d="M1 0h1v8h-1z"/><path fill="#e0584f" d="M2 1h5v4h-5z"/><path fill="#f4efe4" d="M3 2h3v1h-2v1h-1z"/></svg>'
  },
  crackme: {
    title: 'Reverse Engineer',
    sub: 'Cracked the hidden challenge',
    challenge: true,
    ico: '<svg class="px" viewBox="0 0 8 8" width="20" height="20" shape-rendering="crispEdges"><path fill="#c77dff" d="M3 0h2v2h1v1h2v2h-2v1h-1v2h-2v-2h-1v-1h-2v-2h2v-1h1z"/><path fill="#fff3ff" d="M3 3h2v2h-2z"/></svg>'
  }
};
var advState = {};
try { advState = JSON.parse(localStorage.getItem(ADV_STORE) || '{}') || {}; } catch (e) { advState = {}; }
var advQueue = [];
var advBusy = false;
var drainAdv = function () {
  if (advBusy || !advQueue.length) return;
  advBusy = true;
  var item = advQueue.shift();
  var el = d.createElement('div');
  el.className = 'adv-toast' + (item.challenge ? ' is-challenge' : '');
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.innerHTML =
    '<span class="adv-ico" aria-hidden="true">' + item.ico + '</span>' +
    '<span class="adv-text"><span class="adv-kicker">' + (item.challenge ? 'Challenge Complete!' : 'Advancement Made!') + '</span>' +
    '<span class="adv-title">' + item.title + '</span>' +
    '<span class="adv-sub">' + item.sub + '</span></span>';
  var gone = false;
  var dismiss = function () {
    if (gone) return;
    gone = true;
    el.classList.remove('open');
    setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
      advBusy = false;
      drainAdv();
    }, reduceMotion ? 0 : 260);
  };
  el.addEventListener('click', dismiss);
  d.body.appendChild(el);
  playSfx(item.challenge ? 'challenge' : 'adv');
  requestAnimationFrame(function () { el.classList.add('open'); });
  setTimeout(dismiss, item.challenge ? 5200 : 3800);
};
var unlockAdv = function (id, force) {
  var item = ADV_LIST[id];
  if (!item) return;
  if (!force && advState[id]) return;
  advState[id] = 1;
  try { localStorage.setItem(ADV_STORE, JSON.stringify(advState)); } catch (e) {}
  advQueue.push(item);
  drainAdv();
};

var burstXpOrbs = function (cx, cy) {
  playSfx('xp');
  if (reduceMotion) return;
  var cols = ['#7fff3b', '#b8ff57', '#e6ff7a', '#d070ff'];
  for (var i = 0; i < 18; i++) {
    var orb = d.createElement('span');
    orb.className = 'xp-orb';
    var ang = (Math.PI * 2 * i) / 18 + (Math.random() - 0.5) * 0.32;
    var dist = 48 + Math.random() * 96;
    var dx = Math.cos(ang) * dist;
    var dy = Math.sin(ang) * dist - 24;
    orb.style.left = cx.toFixed(0) + 'px';
    orb.style.top = cy.toFixed(0) + 'px';
    orb.style.setProperty('--dx', dx.toFixed(1) + 'px');
    orb.style.setProperty('--dy', dy.toFixed(1) + 'px');
    orb.style.setProperty('--oc', cols[i % cols.length]);
    orb.style.setProperty('--dur', (760 + Math.random() * 480).toFixed(0) + 'ms');
    d.body.appendChild(orb);
    (function (n) { setTimeout(function () { if (n.parentNode) n.parentNode.removeChild(n); }, 1300); })(orb);
  }
};

/* day / night */
var syncThemeColor = function () {
  var m = $('meta[name=theme-color]');
  if (m) m.setAttribute('content', getComputedStyle(root).getPropertyValue('--bg').trim());
};
syncThemeColor();
var themeBtn = $('#theme-toggle');
var toggleTheme = function () {
  var next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
  smoothTheme();
  root.setAttribute('data-theme', next);
  store('theme', next);
  syncThemeColor();
  playSfx('theme', next);
  if (themeBtn && !reduceMotion) {
    themeBtn.classList.remove('pop');
    void themeBtn.offsetWidth;
    themeBtn.classList.add('pop');
  }
  return next;
};
if (themeBtn) {
  themeBtn.addEventListener('click', function (e) {
    toggleTheme();
    if (e.detail > 0) themeBtn.blur();
  });
}

/* accent colour ("dye") + live hovered dye name label + unlockable secret dye */
var dyeBtn = $('#dye-toggle');
var dyeMenu = $('#dye-menu');
var dyeNameEl = $('#dye-name');
var closeDye = null;
var applyDye = null;
var ensureSecretDye = null;
if (dyeBtn && dyeMenu) {
  dyeMenu.removeAttribute('hidden');
  var current = (getComputedStyle(root).getPropertyValue('--accent') || '').trim().toLowerCase();
  var activeDyeName = '';
  var isOpen = false;
  var showDyeLabel = function (name, col) {
    if (!dyeNameEl) return;
    dyeNameEl.textContent = name || '';
    if (col) dyeNameEl.style.setProperty('--preview', col);
  };
  var mark = function () {
    $$('.dye', dyeMenu).forEach(function (b) {
      var on = b.getAttribute('data-color').toLowerCase() === current;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      if (on) activeDyeName = b.getAttribute('data-name') || '';
    });
    showDyeLabel(activeDyeName, current);
  };
  ensureSecretDye = function () {
    var unlocked = false;
    try { unlocked = localStorage.getItem('ryou_secret_dye') === '1'; } catch (e) {}
    var row = $('.dye-swatches', dyeMenu);
    if (!unlocked || !row || $('.dye-secret', row)) return;
    var sb = d.createElement('button');
    sb.type = 'button';
    sb.className = 'dye dye-secret';
    sb.setAttribute('data-color', '#c77dff');
    sb.setAttribute('data-name', 'Enchanted ✦');
    sb.style.setProperty('--c', '#c77dff');
    sb.setAttribute('aria-label', 'Enchanted');
    sb.title = 'Enchanted';
    row.appendChild(sb);
    mark();
  };
  applyDye = function (hex) {
    current = hex.toLowerCase();
    smoothTheme();
    root.style.setProperty('--accent', current);
    store('dye', current);
    mark();
  };
  var setMenu = function (open) {
    isOpen = !!open;
    if (isOpen && closeSfx) closeSfx();
    dyeMenu.classList.toggle('open', isOpen);
    dyeMenu.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
    dyeBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    if (isOpen) showDyeLabel(activeDyeName, current);
  };
  closeDye = function () { if (isOpen) setMenu(false); };
  ensureSecretDye();
  mark();
  setMenu(false);
  dyeBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    setMenu(!isOpen);
    if (e.detail > 0) dyeBtn.blur();
  });
  dyeMenu.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('.dye') : null;
    if (!b) return;
    var nextCol = b.getAttribute('data-color').toLowerCase();
    var changed = nextCol !== current;
    applyDye(nextCol);
    playSfx('click');
    if (changed) unlockAdv('dye');
    if (e.detail > 0) b.blur();
  });
  dyeMenu.addEventListener('pointerover', function (e) {
    var b = e.target.closest ? e.target.closest('.dye') : null;
    if (b) showDyeLabel(b.getAttribute('data-name'), b.getAttribute('data-color'));
  });
  dyeMenu.addEventListener('focusin', function (e) {
    var b = e.target.closest ? e.target.closest('.dye') : null;
    if (b) showDyeLabel(b.getAttribute('data-name'), b.getAttribute('data-color'));
  });
  dyeMenu.addEventListener('pointerleave', function () { showDyeLabel(activeDyeName, current); });
  dyeMenu.addEventListener('focusout', function (e) {
    if (!dyeMenu.contains(e.relatedTarget)) showDyeLabel(activeDyeName, current);
  });
  d.addEventListener('click', function (e) { if (isOpen && !dyeMenu.contains(e.target)) setMenu(false); });
  d.addEventListener('keydown', function (e) { if (e.key === 'Escape' && isOpen) { setMenu(false); dyeBtn.focus(); } });
}

/* clipboard helper */
var legacyCopy = function (text) {
  return new Promise(function (resolve, reject) {
    var ta = d.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0';
    d.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = d.execCommand('copy'); } catch (err) { ok = false; }
    d.body.removeChild(ta);
    if (ok) resolve(); else reject();
  });
};
var copyText = function (text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).catch(function () { return legacyCopy(text); });
  }
  return legacyCopy(text);
};

/* upgraded lightbox: gallery arrows + click-to-zoom for disassembly screenshots */
var openLightbox = function (startImg) {
  var gallery = $$('.prose img').filter(function (im) { return !im.closest('a'); });
  var idx = gallery.indexOf(startImg);
  if (idx < 0) { gallery = [startImg]; idx = 0; }
  var zoomed = false;
  var closing = false;
  var lb = d.createElement('div');
  lb.className = 'lb';
  lb.setAttribute('role', 'dialog');
  lb.setAttribute('aria-modal', 'true');
  lb.setAttribute('aria-label', 'Image viewer');

  var tools = d.createElement('div');
  tools.className = 'lb-tools';
  var zoomBtn = d.createElement('button');
  zoomBtn.type = 'button';
  zoomBtn.className = 'lb-btn';
  zoomBtn.textContent = 'Zoom';
  zoomBtn.setAttribute('aria-label', 'Toggle zoom');
  var closeBtn = d.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'lb-btn';
  closeBtn.textContent = '×';
  closeBtn.setAttribute('aria-label', 'Close image viewer');
  tools.appendChild(zoomBtn);
  tools.appendChild(closeBtn);
  lb.appendChild(tools);

  var prevBtn = null;
  var nextBtn = null;
  if (gallery.length > 1) {
    prevBtn = d.createElement('button');
    prevBtn.type = 'button';
    prevBtn.className = 'lb-btn lb-nav lb-prev';
    prevBtn.textContent = '←';
    prevBtn.setAttribute('aria-label', 'Previous image');
    nextBtn = d.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'lb-btn lb-nav lb-next';
    nextBtn.textContent = '→';
    nextBtn.setAttribute('aria-label', 'Next image');
    lb.appendChild(prevBtn);
    lb.appendChild(nextBtn);
  }

  var stage = d.createElement('div');
  stage.className = 'lb-stage';
  var img = d.createElement('img');
  stage.appendChild(img);
  lb.appendChild(stage);

  var bar = d.createElement('div');
  bar.className = 'lb-bar';
  var countEl = null;
  if (gallery.length > 1) {
    countEl = d.createElement('span');
    countEl.className = 'lb-count';
    bar.appendChild(countEl);
  }
  var capEl = d.createElement('span');
  capEl.className = 'lb-cap';
  bar.appendChild(capEl);
  lb.appendChild(bar);

  var setZoom = function (on) {
    zoomed = !!on;
    if (zoomed) {
      var fitW = img.getBoundingClientRect().width || img.naturalWidth || 640;
      var targetW = Math.max(img.naturalWidth || 0, Math.round(fitW * 1.85));
      lb.classList.add('zoomed');
      img.style.width = targetW + 'px';
      zoomBtn.textContent = 'Fit';
      requestAnimationFrame(function () {
        stage.scrollLeft = Math.max(0, (stage.scrollWidth - stage.clientWidth) / 2);
        stage.scrollTop = Math.max(0, (stage.scrollHeight - stage.clientHeight) / 2);
      });
    } else {
      lb.classList.remove('zoomed');
      img.style.width = '';
      zoomBtn.textContent = 'Zoom';
    }
  };

  var show = function (nextIdx) {
    idx = (nextIdx + gallery.length) % gallery.length;
    setZoom(false);
    var srcEl = gallery[idx];
    img.src = srcEl.currentSrc || srcEl.src;
    img.alt = srcEl.alt || '';
    var fig = srcEl.closest('figure');
    var figCap = fig ? fig.querySelector('figcaption') : null;
    var text = (figCap && figCap.textContent) || srcEl.alt || '';
    capEl.textContent = text;
    capEl.hidden = !text;
    if (countEl) countEl.textContent = (idx + 1) + ' / ' + gallery.length;
    bar.hidden = !text && !countEl;
  };

  var close = function () {
    if (closing) return;
    closing = true;
    d.removeEventListener('keydown', onKey);
    lb.classList.remove('open');
    setTimeout(function () { if (lb.parentNode) lb.parentNode.removeChild(lb); }, reduceMotion ? 0 : 220);
  };

  var onKey = function (ev) {
    if (ev.key === 'Escape') { ev.preventDefault(); close(); }
    else if (ev.key === 'ArrowLeft' && gallery.length > 1) { ev.preventDefault(); show(idx - 1); }
    else if (ev.key === 'ArrowRight' && gallery.length > 1) { ev.preventDefault(); show(idx + 1); }
    else if (ev.key === '+' || ev.key === '=' || ev.key === '0') { ev.preventDefault(); setZoom(!zoomed); }
  };

  img.addEventListener('click', function (ev) { ev.stopPropagation(); setZoom(!zoomed); });
  zoomBtn.addEventListener('click', function (ev) { ev.stopPropagation(); setZoom(!zoomed); });
  closeBtn.addEventListener('click', function (ev) { ev.stopPropagation(); close(); });
  if (prevBtn) prevBtn.addEventListener('click', function (ev) { ev.stopPropagation(); show(idx - 1); });
  if (nextBtn) nextBtn.addEventListener('click', function (ev) { ev.stopPropagation(); show(idx + 1); });
  stage.addEventListener('click', function (ev) { if (ev.target === stage) close(); });

  show(idx);
  d.addEventListener('keydown', onKey);
  d.body.appendChild(lb);
  requestAnimationFrame(function () { lb.classList.add('open'); });
};

/* copy code, expand/collapse long code blocks, heading permalink copy, lightbox */
d.addEventListener('click', function (e) {
  var t = e.target;
  if (!t.closest) return;
  var cp = t.closest('[data-copy]');
  if (cp) {
    var code = cp.closest('figure').querySelector('code');
    var reset = function () { setTimeout(function () { cp.textContent = 'Copy'; cp.removeAttribute('data-done'); }, 1600); };
    copyText(code.textContent.replace(/\n$/, '')).then(function () {
      cp.textContent = '✓ Copied';
      cp.setAttribute('data-done', '');
      playSfx('click');
      unlockAdv('copy');
      reset();
    }, function () {
      cp.textContent = 'Select & Ctrl+C';
      reset();
    });
    return;
  }
  var ex = t.closest('[data-expand]');
  if (ex) {
    var fig = ex.closest('figure');
    var topBtn = fig ? fig.querySelector('figcaption [data-expand]') : null;
    var open = fig.hasAttribute('data-open');
    if (open) {
      fig.removeAttribute('data-open');
      if (topBtn) topBtn.textContent = topBtn.getAttribute('data-label') || 'Expand';
      var foot = fig.querySelector('.code-foot');
      if (foot) foot.remove();
      var rect = fig.getBoundingClientRect();
      if (rect.top < 72) {
        var y = Math.max(0, rect.top + (window.scrollY || root.scrollTop || 0) - 82);
        window.scrollTo({ top: y, behavior: reduceMotion ? 'auto' : 'smooth' });
      }
    } else {
      fig.setAttribute('data-open', '');
      if (topBtn) {
        topBtn.setAttribute('data-label', topBtn.textContent);
        topBtn.textContent = 'Collapse';
      }
      if (!fig.querySelector('.code-foot')) {
        var f = d.createElement('div');
        f.className = 'code-foot';
        var b = d.createElement('button');
        b.className = 'cx';
        b.type = 'button';
        b.setAttribute('data-expand', '');
        b.textContent = 'Collapse ↑';
        f.appendChild(b);
        fig.appendChild(f);
      }
    }
    scheduleMetrics();
    return;
  }
  var hl = t.closest('.prose a.hl');
  if (hl && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
    e.preventDefault();
    var hash = hl.getAttribute('href') || '';
    if (hash && history.replaceState) history.replaceState(null, '', hash);
    var full = location.origin + location.pathname + hash;
    copyText(full).then(function () {
      hl.setAttribute('data-copied', '');
      playSfx('click');
      clearTimeout(hl._ct);
      hl._ct = setTimeout(function () { hl.removeAttribute('data-copied'); }, 1500);
    }, function () {});
    return;
  }
  if (t.tagName === 'IMG' && t.closest('.prose') && !t.closest('a')) {
    openLightbox(t);
  }
});

/* table & math horizontal overflow scroll edge fade hint */
var scrollers = $$('.tbl, .math-display');
var syncScrollEdge = function (el) {
  var canL = el.scrollLeft > 4;
  var canR = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
  el.classList.toggle('scroll-l', canL);
  el.classList.toggle('scroll-r', canR);
};
var syncAllScrollers = function () {
  for (var i = 0; i < scrollers.length; i++) syncScrollEdge(scrollers[i]);
};
scrollers.forEach(function (el) {
  el.addEventListener('scroll', function () { syncScrollEdge(el); }, { passive: true });
});

/* table of contents: deterministic scroll tracking + smooth gliding desktop rail */
var toc = $('.toc');
var tocLinks = [];
var tocHeads = [];
var tocYs = [];
var tocList = null;
var tocActive = -1;
var wideToc = window.matchMedia ? window.matchMedia('(min-width:1220px)') : null;
var setTocActive = function (i) {
  if (i === tocActive || i < 0 || !tocLinks[i]) return;
  if (tocActive >= 0 && tocLinks[tocActive]) tocLinks[tocActive].removeAttribute('aria-current');
  tocActive = i;
  var link = tocLinks[i];
  link.setAttribute('aria-current', 'true');
  if (tocList && wideToc && wideToc.matches) {
    var lr = link.getBoundingClientRect();
    var pr = tocList.getBoundingClientRect();
    tocList.style.setProperty('--ty', (lr.top - pr.top).toFixed(1) + 'px');
    tocList.style.setProperty('--th', lr.height.toFixed(1) + 'px');
    tocList.style.setProperty('--to', '1');
  }
  if (toc.scrollHeight > toc.clientHeight + 4) {
    var y = link.offsetTop;
    if (y < toc.scrollTop + 40 || y > toc.scrollTop + toc.clientHeight - 60) {
      toc.scrollTo({ top: Math.max(0, y - toc.clientHeight / 3), behavior: reduceMotion ? 'auto' : 'smooth' });
    }
  }
};
var measureToc = function () {
  if (!tocHeads.length) return;
  var sy = window.scrollY || root.scrollTop || 0;
  tocYs = tocHeads.map(function (h) { return h ? h.getBoundingClientRect().top + sy : -1; });
};
if (toc) {
  tocList = $('ol', toc);
  var syncTocOpen = function () {
    if (wideToc && wideToc.matches) { toc.setAttribute('open', ''); toc.classList.add('has-rail'); }
    else { toc.removeAttribute('open'); toc.classList.remove('has-rail'); }
  };
  syncTocOpen();
  if (wideToc && wideToc.addEventListener) {
    wideToc.addEventListener('change', function () {
      syncTocOpen();
      if (tocActive >= 0) { var prev = tocActive; tocActive = -1; setTocActive(prev); }
    });
  }
  tocLinks = $$('a[href^="#"]', toc);
  tocHeads = tocLinks.map(function (a) { return d.getElementById(decodeURIComponent(a.getAttribute('href').slice(1))); });
  measureToc();
}

/* zero-reflow rAF-coalesced cursor spotlight on cards and pager slots */
if (canHover) {
  $$('.card, .slot').forEach(function (el) {
    var rect = null;
    var raf = 0;
    var px = 0;
    var py = 0;
    el.addEventListener('pointerenter', function () { rect = el.getBoundingClientRect(); });
    el.addEventListener('pointerleave', function () { rect = null; });
    el.addEventListener('pointermove', function (e) {
      if (!rect) rect = el.getBoundingClientRect();
      px = e.clientX - rect.left;
      py = e.clientY - rect.top;
      if (!raf) {
        raf = requestAnimationFrame(function () {
          raf = 0;
          el.style.setProperty('--mx', px.toFixed(0) + 'px');
          el.style.setProperty('--my', py.toFixed(0) + 'px');
        });
      }
    });
  });
}

/* unified passive scroll loop with cached metrics (zero layout reads during scroll) */
var readBar = $('.read-bar');
var isPost = d.body.classList.contains('is-post');
var toTop = $('#to-top');
var scene = $('.scene');
var maxScroll = 1;
var isTall = false;
var lastScrolled = null;
var lastTopShow = null;
var metricsTimer = null;
var refreshMetrics = function () {
  var sh = root.scrollHeight;
  var vh = window.innerHeight;
  maxScroll = Math.max(1, sh - vh);
  isTall = sh > vh * 2.1;
  measureToc();
  syncAllScrollers();
};
var scheduleMetrics = function () {
  clearTimeout(metricsTimer);
  metricsTimer = setTimeout(function () { refreshMetrics(); onScroll(); }, 60);
};
refreshMetrics();
if ('ResizeObserver' in window) {
  new ResizeObserver(scheduleMetrics).observe(d.body);
}
window.addEventListener('resize', scheduleMetrics, { passive: true });
window.addEventListener('load', scheduleMetrics, { passive: true });

var ticking = false;
var readAdvDone = !!advState.reader;
var onScroll = function () {
  ticking = false;
  var y = window.scrollY || root.scrollTop || 0;
  var scrolled = y > 12;
  if (scrolled !== lastScrolled) {
    lastScrolled = scrolled;
    root.classList.toggle('scrolled', scrolled);
  }
  if (toTop) {
    var showTop = isTall && y > 620;
    if (showTop !== lastTopShow) {
      lastTopShow = showTop;
      toTop.classList.toggle('show', showTop);
    }
  }
  if (isPost && readBar) {
    var p = Math.min(1, Math.max(0, y / maxScroll));
    readBar.style.setProperty('--read', p.toFixed(4));
    if (!readAdvDone && maxScroll > 260 && p >= 0.92) {
      readAdvDone = true;
      unlockAdv('reader');
    }
  }
  if (scene && !reduceMotion && y < 380) {
    scene.style.setProperty('--sy', (y * 0.011).toFixed(2) + 'px');
  }
  if (tocYs.length) {
    var idx = 0;
    if (y >= maxScroll - 8) {
      idx = tocYs.length - 1;
    } else {
      var cutoff = y + 152;
      for (var k = 0; k < tocYs.length; k++) {
        if (tocYs[k] >= 0 && tocYs[k] <= cutoff) idx = k;
      }
    }
    setTocActive(idx);
  }
};
window.addEventListener('scroll', function () {
  if (!ticking) { ticking = true; requestAnimationFrame(onScroll); }
}, { passive: true });
onScroll();

/* off-screen banner auto-pause + zero-reflow horizontal parallax + randomized shooting stars */
var sceneVisible = true;
if (scene && 'IntersectionObserver' in window) {
  new IntersectionObserver(function (entries) {
    sceneVisible = entries[0] ? entries[0].isIntersecting : true;
    scene.classList.toggle('paused', !sceneVisible || d.hidden);
  }, { threshold: 0 }).observe(scene);
  d.addEventListener('visibilitychange', function () {
    scene.classList.toggle('paused', !sceneVisible || d.hidden);
  });
}

if (scene && !reduceMotion && canHover) {
  var sceneRect = null;
  var sceneRaf = 0;
  var sceneNx = 0;
  scene.addEventListener('pointerenter', function () { sceneRect = scene.getBoundingClientRect(); });
  scene.addEventListener('pointermove', function (e) {
    if (!sceneRect) sceneRect = scene.getBoundingClientRect();
    sceneNx = ((e.clientX - sceneRect.left) / Math.max(1, sceneRect.width) - 0.5) * 2;
    if (!sceneRaf) {
      sceneRaf = requestAnimationFrame(function () {
        sceneRaf = 0;
        scene.style.setProperty('--px', sceneNx.toFixed(3));
      });
    }
  });
  scene.addEventListener('pointerleave', function () {
    sceneRect = null;
    scene.style.setProperty('--px', '0');
  });
}

if (scene && !reduceMotion) {
  var meteors = $$('.meteor', scene);
  var rand = function (a, b) { return a + Math.random() * (b - a); };
  meteors.forEach(function (el, idx) {
    var schedule = function (delay) {
      setTimeout(function () {
        if (d.hidden || !sceneVisible || root.getAttribute('data-theme') === 'light') { schedule(rand(2000, 4200)); return; }
        var dur = rand(1.35, 2.25);
        el.classList.remove('shooting');
        el.style.setProperty('--mx', rand(5, 78).toFixed(1) + '%');
        el.style.setProperty('--my', rand(5, 32).toFixed(1) + '%');
        el.style.setProperty('--mw', rand(48, 96).toFixed(0) + 'px');
        el.style.setProperty('--ma', rand(14, 28).toFixed(1) + 'deg');
        el.style.setProperty('--ml', rand(135, 225).toFixed(0) + 'px');
        el.style.setProperty('--ms', dur.toFixed(2) + 's');
        el.style.setProperty('--mo', rand(0.6, 1).toFixed(2));
        void el.offsetWidth;
        el.classList.add('shooting');
        setTimeout(function () {
          el.classList.remove('shooting');
          schedule(rand(5200, 12200));
        }, Math.round(dur * 1000) + 120);
      }, delay);
    };
    schedule(rand(600 + idx * 1100, 2200 + idx * 2000));
  });
}

/* interactive Minecraft pixel-physics banner: tumbling magma meteor, terrain explosions, lake splash, cabin embers, sun/moon toggle */
if (scene) {
  var sceneSvgEl = $('.scene-art', scene);
  var PX = 3;
  var fxCanvas = d.createElement('canvas');
  fxCanvas.className = 'scene-fx';
  fxCanvas.setAttribute('aria-hidden', 'true');
  scene.appendChild(fxCanvas);
  var fxCtx = fxCanvas.getContext ? fxCanvas.getContext('2d') : null;
  var fxW = 1;
  var fxH = 1;
  var syncFxCanvas = function () {
    if (!fxCtx) return;
    var r = scene.getBoundingClientRect();
    fxRect = r;
    fxW = Math.max(1, Math.round(r.width / PX));
    fxH = Math.max(1, Math.round(r.height / PX));
    if (fxCanvas.width !== fxW || fxCanvas.height !== fxH) {
      fxCanvas.width = fxW;
      fxCanvas.height = fxH;
    }
    fxCtx.imageSmoothingEnabled = false;
  };
  syncFxCanvas();
  window.addEventListener('resize', syncFxCanvas, { passive: true });
  window.addEventListener('scroll', function () { fxRect = null; }, { passive: true });

  var getSceneRect = function () {
    return fxRect || (fxRect = scene.getBoundingClientRect());
  };
  var eventToCanvas = function (e, rect) {
    var r = rect || getSceneRect();
    return {
      x: ((e.clientX - r.left) / Math.max(1, r.width)) * fxW,
      y: ((e.clientY - r.top) / Math.max(1, r.height)) * fxH
    };
  };
  var scenePoint = function (e) {
    if (sceneSvgEl && sceneSvgEl.getScreenCTM && sceneSvgEl.createSVGPoint) {
      var ctm = sceneSvgEl.getScreenCTM();
      if (ctm) {
        var pt = sceneSvgEl.createSVGPoint();
        pt.x = e.clientX;
        pt.y = e.clientY;
        var out = pt.matrixTransform(ctm.inverse());
        return { x: out.x, y: out.y };
      }
    }
    var r = getSceneRect();
    return { x: ((e.clientX - r.left) / Math.max(1, r.width)) * 320, y: ((e.clientY - r.top) / Math.max(1, r.height)) * 44 };
  };
  var svgToCanvas = function (vx, vy, rect) {
    var r = rect || getSceneRect();
    if (sceneSvgEl && sceneSvgEl.getScreenCTM && sceneSvgEl.createSVGPoint) {
      var ctm = sceneSvgEl.getScreenCTM();
      if (ctm) {
        var pt = sceneSvgEl.createSVGPoint();
        pt.x = vx;
        pt.y = vy;
        var s = pt.matrixTransform(ctm);
        return {
          x: ((s.x - r.left) / Math.max(1, r.width)) * fxW,
          y: ((s.y - r.top) / Math.max(1, r.height)) * fxH
        };
      }
    }
    return { x: (vx / 320) * fxW, y: (vy / 44) * fxH };
  };
  var canvasXToSvgX = function (cx, rect) {
    var r = rect || getSceneRect();
    if (sceneSvgEl && sceneSvgEl.getScreenCTM && sceneSvgEl.createSVGPoint) {
      var ctm = sceneSvgEl.getScreenCTM();
      if (ctm) {
        var pt = sceneSvgEl.createSVGPoint();
        pt.x = r.left + (cx / Math.max(1, fxW)) * r.width;
        pt.y = r.top + r.height * 0.5;
        return pt.matrixTransform(ctm.inverse()).x;
      }
    }
    return (cx / Math.max(1, fxW)) * 320;
  };
  var terrainAtSvgX = function (vx) {
    var x = Math.max(0, Math.min(319, Math.round(vx)));
    if (x >= 127 && x <= 172) return { y: 35, surface: 'water' };
    if (x >= 197 && x <= 216) return { y: 24.5, surface: 'wood' };
    if (x >= 182 && x <= 222) return { y: 32, surface: 'grass' };
    if (x >= 173 && x < 182) return { y: x < 176 ? 34 : x < 179 ? 33 : 32, surface: 'grass' };
    if (x >= 122 && x < 127) return { y: x < 124 ? 34 : 35, surface: 'sand' };
    if (x >= 72 && x <= 104) return { y: 34, surface: 'grass' };
    var wave = Math.sin(x * 0.055 + 0.6) * 1.4 + Math.cos(x * 0.12) * 0.6;
    return { y: Math.max(32, Math.min(35, Math.round(33.5 + wave))), surface: 'grass' };
  };
  var groundAtCanvasX = function (cx, rect) {
    var vx = canvasXToSvgX(cx, rect);
    var t = terrainAtSvgX(vx);
    var c = svgToCanvas(vx, t.y, rect);
    return { y: c.y, surface: t.surface };
  };
  var sceneZone = function (vx, vy) {
    if (vx >= 201 && vx <= 216 && vy >= 2 && vy <= 14) return 'celestial';
    if (vx >= 180 && vx <= 218 && vy >= 18 && vy <= 33) return 'cabin';
    if (vx >= 125 && vx <= 174 && vy >= 34 && vy <= 39.5) return 'lake';
    return 'sky';
  };

  /* 5x5 Minecraft volcanic magma-basalt voxel pattern */
  var ROCK_MAP = [
    '.BDB.',
    'BLMBD',
    'DMYMB',
    'BBMLD',
    '.DBB.'
  ];
  var ROCK_PAL = { D: '#241c24', B: '#423745', L: '#665669', M: '#ff6e1a', Y: '#ffe354' };
  var fxMeteors = [];
  var fxParts = [];
  var fxFlashes = [];
  var fxRipples = [];
  var fxRaf = 0;
  var fxLast = 0;
  var fxRect = null;
  var aim = { down: false, dragging: false, id: -1, x0: 0, y0: 0, x1: 0, y1: 0, sx0: 0, sy0: 0, phase: 0 };
  var lastSweepAt = 0;
  var lastTapAt = 0;
  var lastTapX = 0;
  var lastTapY = 0;
  var AIM_G = 155;

  var startFx = function () {
    if (!fxCtx || fxRaf) return;
    syncFxCanvas();
    fxRect = scene.getBoundingClientRect();
    fxLast = performance.now();
    fxRaf = requestAnimationFrame(stepFx);
  };

  var addPart = function (p) {
    if (fxParts.length < 340) fxParts.push(p);
  };

  /* exact cursor-locked ballistic solver: trajectory passes dead-center through cursor (or lands directly at cursor on terrain) */
  var aimVelocity = function (x0, y0, x1, y1, rect) {
    var g1 = groundAtCanvasX(x1, rect);
    var tx = Math.max(2, Math.min(fxW - 2, x1));
    var ty = Math.min(y1, g1.y);
    var dist = Math.hypot(tx - x0, ty - y0);
    var T = Math.max(0.14, Math.min(0.62, dist / 215));
    var vx = (tx - x0) / T;
    var vy = (ty - y0 - 0.5 * AIM_G * T * T) / T;
    var spd = Math.hypot(vx, vy);
    return {
      vx: vx,
      vy: vy,
      tx: tx,
      ty: ty,
      onGround: y1 >= g1.y - 2,
      power: Math.max(0, Math.min(1, (spd - 130) / 190))
    };
  };

  var drawAimPreview = function (rect) {
    var vel = aimVelocity(aim.x0, aim.y0, aim.x1, aim.y1, rect);
    var px = aim.x0;
    var py = aim.y0;
    var vx = vel.vx;
    var vy = vel.vy;
    var stepDt = 1 / 60;
    var hit = null;
    var dotCol = vel.power > 0.65 ? '#ff7c38' : vel.power > 0.3 ? '#ffbe42' : '#ffe97d';

    /* origin anchor ring */
    var ox = Math.floor(aim.x0);
    var oy = Math.floor(aim.y0);
    fxCtx.fillStyle = '#fff9d6';
    fxCtx.fillRect(ox - 1, oy - 1, 3, 3);
    fxCtx.fillStyle = dotCol;
    fxCtx.fillRect(ox - 2, oy, 1, 1);
    fxCtx.fillRect(ox + 2, oy, 1, 1);
    fxCtx.fillRect(ox, oy - 2, 1, 1);
    fxCtx.fillRect(ox, oy + 2, 1, 1);

    /* exact Verlet/midpoint trajectory preview (0px error vs live flight at any refresh rate) */
    var acc = (aim.phase * 14) % 3;
    for (var s = 0; s < 160; s++) {
      var nx = px + vx * stepDt;
      var ny = py + vy * stepDt + 0.5 * AIM_G * stepDt * stepDt;
      vy += AIM_G * stepDt;
      px = nx;
      py = ny;
      if (px < -4 || px > fxW + 4 || py > fxH + 4) break;
      var gi = groundAtCanvasX(px, rect);
      if (py >= gi.y) {
        var frac = ny > (py - vy * stepDt) ? Math.max(0, Math.min(1, (gi.y - (py - vy * stepDt)) / (vy * stepDt || 1))) : 1;
        hit = { x: px - vx * stepDt * (1 - frac), y: gi.y, surface: gi.surface };
        break;
      }
      if (((s - Math.floor(acc)) % 3 + 3) % 3 === 0 && py >= 0) {
        var fade = Math.max(0.3, 1 - s / 130);
        fxCtx.globalAlpha = fade;
        fxCtx.fillStyle = s < 5 ? '#fffbe0' : dotCol;
        fxCtx.fillRect(Math.floor(px), Math.floor(py), 1, 1);
        fxCtx.globalAlpha = 1;
      }
    }

    /* mark exact cursor pass-through pixel cleanly when aiming above terrain */
    if (!vel.onGround) {
      var kx = Math.floor(vel.tx);
      var ky = Math.floor(vel.ty);
      fxCtx.fillStyle = 'rgba(255,251,230,.85)';
      fxCtx.fillRect(kx - 1, ky, 1, 1);
      fxCtx.fillRect(kx + 1, ky, 1, 1);
      fxCtx.fillRect(kx, ky - 1, 1, 1);
      fxCtx.fillRect(kx, ky + 1, 1, 1);
    }

    /* crisp symmetric pixel target crosshair right on predicted terrain / lake impact point */
    if (hit) {
      var hx = Math.floor(hit.x);
      var hy = Math.floor(hit.y);
      var pulse = Math.floor(aim.phase * 5) % 2;
      var cCol = hit.surface === 'water' ? '#7fd8fa' : vel.power > 0.65 ? '#ff6b3d' : '#ffd84a';
      fxCtx.fillStyle = cCol;
      fxCtx.fillRect(hx - 3 - pulse, hy, 2, 1);
      fxCtx.fillRect(hx + 2 + pulse, hy, 2, 1);
      fxCtx.fillRect(hx, hy - 3 - pulse, 1, 2);
      fxCtx.fillRect(hx, hy + 2 + pulse, 1, 2);
      fxCtx.fillStyle = '#fffbe6';
      fxCtx.fillRect(hx, hy, 1, 1);
    }
  };

  var triggerQuake = function () {
    if (reduceMotion) return;
    scene.classList.remove('quake');
    void scene.offsetWidth;
    scene.classList.add('quake');
    setTimeout(function () { scene.classList.remove('quake'); }, 230);
  };

  var explodeAt = function (ix, iy, surface, power) {
    var pwr = power || 0;
    if (surface === 'water') {
      playSfx('splash', true);
      fxFlashes.push({ x: ix, y: iy, r: 9 + Math.round(pwr * 4), age: 0, life: 0.14, col: 'rgba(210,244,255,' });
      var wCols = ['#4588c4', '#7fd8fa', '#c8f1ff', '#2a6cb0'];
      var wCnt = 18 + Math.round(pwr * 8);
      for (var w = 0; w < wCnt; w++) {
        addPart({
          kind: 'debris',
          x: ix + (Math.random() - 0.5) * 4,
          y: iy - 1,
          vx: (Math.random() - 0.5) * (95 + pwr * 40),
          vy: -55 - Math.random() * (88 + pwr * 35),
          g: 270,
          s: Math.random() < 0.45 ? 2 : 1,
          col: wCols[w % wCols.length],
          age: 0,
          life: 0.48 + Math.random() * 0.32,
          floorY: iy + 1,
          bounced: true
        });
      }
      var stCols = ['#eef6ff', '#c9dcf0', '#9ab4cf'];
      for (var st = 0; st < 10; st++) {
        addPart({
          kind: 'smoke',
          x: ix + (Math.random() - 0.5) * 8,
          y: iy - 1 - Math.random() * 3,
          vx: (Math.random() - 0.5) * 20,
          vy: -14 - Math.random() * 20,
          s: 3 + (st % 2),
          col: stCols[st % stCols.length],
          age: 0,
          life: 0.55 + Math.random() * 0.45
        });
      }
      fxRipples.push({ x: ix, y: iy, span: 2, max: 22, speed: 34 + pwr * 12, age: 0, life: 0.62 });
      fxRipples.push({ x: ix, y: iy + 1, span: 1, max: 14, speed: 24, age: 0, life: 0.52 });
      return;
    }

    fxFlashes.push({ x: ix, y: iy - 2, r: 16 + Math.round(pwr * 6), age: 0, life: 0.16, col: 'rgba(255,212,118,' });
    playSfx('boom', { power: pwr, surface: surface });
    triggerQuake();

    /* authentic Minecraft chunky explosion smoke cubes */
    var puffCnt = 10 + Math.round(pwr * 5);
    for (var pf = 0; pf < puffCnt; pf++) {
      var pang = (Math.PI * 2 * pf) / puffCnt + (Math.random() - 0.5) * 0.45;
      var pspd = 14 + Math.random() * (28 + pwr * 16);
      addPart({
        kind: 'puff',
        x: ix + Math.cos(pang) * (1 + Math.random() * 3),
        y: iy - 2 + Math.sin(pang) * 2.5,
        vx: Math.cos(pang) * pspd,
        vy: Math.sin(pang) * pspd * 0.65 - 10,
        s: pf < 4 + Math.round(pwr * 2) ? 5 : 4,
        age: 0,
        life: 0.44 + Math.random() * 0.36
      });
    }

    /* real parabolic Minecraft block fragments matching surface material */
    var matCols = surface === 'sand'
      ? ['#a6966b', '#8c7d55', '#695d41', '#2c222b', '#ff7b1c']
      : surface === 'wood'
        ? ['#755030', '#5b3c22', '#42506b', '#2c222b', '#ff8c24']
        : ['#458f34', '#62b849', '#634224', '#6f4b2c', '#5d6069', '#2c222b', '#ff7b1c'];
    var debCnt = 16 + Math.round(pwr * 8);
    for (var d1 = 0; d1 < debCnt; d1++) {
      addPart({
        kind: 'debris',
        x: ix + (Math.random() - 0.5) * 4,
        y: iy - 1,
        vx: (Math.random() - 0.5) * (115 + pwr * 45),
        vy: -65 - Math.random() * (98 + pwr * 38),
        g: 310,
        s: d1 < 7 ? 2 : 1,
        col: matCols[d1 % matCols.length],
        age: 0,
        life: 0.72 + Math.random() * 0.48,
        floorY: iy,
        bounced: false
      });
    }

    /* fast incandescent impact sparks */
    var fCols = ['#fffce0', '#ffe047', '#ff911e', '#e03e1a'];
    var spCnt = 10 + Math.round(pwr * 6);
    for (var sp = 0; sp < spCnt; sp++) {
      addPart({
        kind: 'fire',
        x: ix + (Math.random() - 0.5) * 3,
        y: iy - 1,
        vx: (Math.random() - 0.5) * (125 + pwr * 45),
        vy: -40 - Math.random() * (75 + pwr * 30),
        g: 180,
        s: 1,
        col: fCols[sp % fCols.length],
        age: 0,
        life: 0.24 + Math.random() * 0.22
      });
    }

    /* lingering ground embers flickering on impact crater */
    var emCnt = 4 + Math.round(pwr * 2);
    for (var em = 0; em < emCnt; em++) {
      addPart({
        kind: 'ember',
        x: ix + (Math.random() - 0.5) * (9 + pwr * 5),
        y: iy - 1,
        age: 0,
        life: 1.0 + Math.random() * 0.7,
        tick: Math.random() * 0.15
      });
    }
  };

  var drawMeteor = function (m) {
    var cx = Math.round(m.x);
    var cy = Math.round(m.y);
    var rot = m.rot & 3;
    for (var ry = 0; ry < 5; ry++) {
      for (var rx = 0; rx < 5; rx++) {
        var ch = ROCK_MAP[ry][rx];
        if (ch === '.') continue;
        var ox = rx - 2;
        var oy = ry - 2;
        var tx = rot === 0 ? ox : rot === 1 ? -oy : rot === 2 ? -ox : oy;
        var ty = rot === 0 ? oy : rot === 1 ? ox : rot === 2 ? -oy : -ox;
        fxCtx.fillStyle = ROCK_PAL[ch];
        fxCtx.fillRect(cx + tx, cy + ty, 1, 1);
      }
    }
    /* crisp atmospheric reentry bow-shock plasma pixels on leading edge */
    var spd = Math.hypot(m.vx, m.vy) || 1;
    var ux = m.vx / spd;
    var uy = m.vy / spd;
    var px = -uy;
    var py = ux;
    var fx0 = Math.round(cx + ux * 2.5);
    var fy0 = Math.round(cy + uy * 2.5);
    fxCtx.fillStyle = '#fffce0';
    fxCtx.fillRect(fx0, fy0, 1, 1);
    fxCtx.fillStyle = '#ffe047';
    fxCtx.fillRect(Math.round(fx0 + px), Math.round(fy0 + py), 1, 1);
    fxCtx.fillRect(Math.round(fx0 - px), Math.round(fy0 - py), 1, 1);
    fxCtx.fillStyle = '#ff881c';
    fxCtx.fillRect(Math.round(cx + ux * 1.4 + px * 2), Math.round(cy + uy * 1.4 + py * 2), 1, 1);
    fxCtx.fillRect(Math.round(cx + ux * 1.4 - px * 2), Math.round(cy + uy * 1.4 - py * 2), 1, 1);
  };

  var stepFx = function (now) {
    fxRaf = 0;
    var dt = Math.min(0.05, Math.max(0.001, (now - fxLast) / 1000));
    fxLast = now;
    if (!fxRect) fxRect = scene.getBoundingClientRect();
    fxCtx.clearRect(0, 0, fxW, fxH);

    /* 1. brief Minecraft stepped pixel flash burst */
    for (var fi = fxFlashes.length - 1; fi >= 0; fi--) {
      var fl = fxFlashes[fi];
      fl.age += dt;
      if (fl.age >= fl.life) { fxFlashes.splice(fi, 1); continue; }
      var fa = (1 - fl.age / fl.life) * 0.52;
      var fr = Math.round(fl.r * (0.65 + (fl.age / fl.life) * 0.55));
      var fx0 = Math.round(fl.x);
      var fy0 = Math.round(fl.y);
      var r1 = Math.max(2, Math.round(fr * 0.48));
      var r2 = Math.max(3, Math.round(fr * 0.86));
      fxCtx.fillStyle = fl.col + (fa * 0.5).toFixed(3) + ')';
      fxCtx.fillRect(fx0 - r2, fy0 - r1, r2 * 2, r1 * 2);
      fxCtx.fillRect(fx0 - r1, fy0 - r2, r1 * 2, r2 * 2);
      fxCtx.fillStyle = fl.col + fa.toFixed(3) + ')';
      fxCtx.fillRect(fx0 - r1, fy0 - r1, r1 * 2, r1 * 2);
    }

    /* 2. sliding pixel water ripples */
    for (var ri = fxRipples.length - 1; ri >= 0; ri--) {
      var rp = fxRipples[ri];
      rp.age += dt;
      if (rp.age >= rp.life) { fxRipples.splice(ri, 1); continue; }
      var rt = rp.age / rp.life;
      var off = Math.round(rp.span + rp.speed * rp.age);
      var rw = Math.max(1, Math.round((1 - rt) * 4));
      fxCtx.fillStyle = 'rgba(205,244,255,' + ((1 - rt) * 0.85).toFixed(2) + ')';
      fxCtx.fillRect(Math.round(rp.x - off - rw), Math.round(rp.y), rw, 1);
      fxCtx.fillRect(Math.round(rp.x + off), Math.round(rp.y), rw, 1);
    }

    /* 3. particles (smoke, explosion puffs, flames, debris, lingering embers) */
    for (var pi = fxParts.length - 1; pi >= 0; pi--) {
      var p = fxParts[pi];
      p.age += dt;
      if (p.age >= p.life) { fxParts.splice(pi, 1); continue; }
      var t = p.age / p.life;
      if (p.kind === 'smoke') {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.96;
        var sz = Math.max(1, Math.ceil(p.s * (1 - t * 0.72)));
        fxCtx.globalAlpha = Math.max(0, (1 - t) * 0.78);
        fxCtx.fillStyle = p.col;
        fxCtx.fillRect(Math.round(p.x - sz * 0.5), Math.round(p.y - sz * 0.5), sz, sz);
        fxCtx.globalAlpha = 1;
      } else if (p.kind === 'puff') {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.9;
        p.vy = p.vy * 0.9 - 6 * dt;
        var ps = t < 0.2 ? p.s : Math.max(1, Math.ceil(p.s * (1 - (t - 0.2) * 0.9)));
        var col = t < 0.16 ? '#fff8e2' : t < 0.42 ? '#d6d8e0' : t < 0.72 ? '#8b909e' : '#4a4d59';
        var px0 = Math.round(p.x - ps * 0.5);
        var py0 = Math.round(p.y - ps * 0.5);
        fxCtx.globalAlpha = Math.max(0, 1 - t * t);
        fxCtx.fillStyle = col;
        fxCtx.fillRect(px0, py0, ps, ps);
        if (ps >= 3) {
          fxCtx.fillStyle = 'rgba(255,255,255,.28)';
          fxCtx.fillRect(px0, py0, ps - 1, 1);
          fxCtx.fillStyle = 'rgba(0,0,0,.22)';
          fxCtx.fillRect(px0 + 1, py0 + ps - 1, ps - 1, 1);
        }
        fxCtx.globalAlpha = 1;
      } else if (p.kind === 'fire') {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.g) p.vy += p.g * dt;
        var fc = p.col || (t < 0.25 ? '#fff9d1' : t < 0.55 ? '#ffdc47' : t < 0.8 ? '#ff821c' : '#c93318');
        var fs = t < 0.45 ? p.s : 1;
        fxCtx.globalAlpha = Math.max(0, 1 - t * 0.85);
        fxCtx.fillStyle = fc;
        fxCtx.fillRect(Math.round(p.x), Math.round(p.y), fs, fs);
        fxCtx.globalAlpha = 1;
      } else if (p.kind === 'debris') {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += p.g * dt;
        if (p.y >= p.floorY) {
          p.y = p.floorY;
          if (!p.bounced && Math.abs(p.vy) > 22) {
            p.bounced = true;
            p.vy = -p.vy * 0.34;
            p.vx *= 0.58;
          } else {
            p.vy = 0;
            p.vx *= 0.72;
          }
        }
        fxCtx.globalAlpha = t > 0.72 ? Math.max(0, (1 - t) / 0.28) : 1;
        fxCtx.fillStyle = p.col;
        fxCtx.fillRect(Math.round(p.x), Math.round(p.y - p.s), p.s, p.s);
        fxCtx.globalAlpha = 1;
      } else if (p.kind === 'ember') {
        p.tick += dt;
        var flick = Math.floor(p.age * 16) % 3;
        fxCtx.globalAlpha = Math.max(0, 1 - t * 0.85);
        fxCtx.fillStyle = flick === 0 ? '#fff6bd' : flick === 1 ? '#ffb830' : '#ff6b1c';
        fxCtx.fillRect(Math.round(p.x), Math.round(p.y - (flick === 0 ? 1 : 0)), 1, flick === 0 ? 2 : 1);
        fxCtx.globalAlpha = 1;
        if (p.tick > 0.22) {
          p.tick = 0;
          addPart({
            kind: 'smoke',
            x: p.x,
            y: p.y - 2,
            vx: (Math.random() - 0.5) * 6,
            vy: -10 - Math.random() * 8,
            s: 2,
            col: '#636775',
            age: 0,
            life: 0.45 + Math.random() * 0.25
          });
        }
      }
    }

    /* 4. active tumbling meteors with exact frame-rate-independent Verlet/midpoint physics */
    for (var mi = fxMeteors.length - 1; mi >= 0; mi--) {
      var m = fxMeteors[mi];
      var ox = m.x;
      var oy = m.y;
      m.x += m.vx * dt;
      m.y += m.vy * dt + 0.5 * m.g * dt * dt;
      m.vy += m.g * dt;
      m.rotT += dt;
      if (m.rotT >= 0.085) { m.rotT = 0; m.rot = (m.rot + 1) & 3; }
      m.smokeT += dt;

      var segX = m.x - ox;
      var segY = m.y - oy;
      var steps = Math.max(2, Math.ceil(Math.hypot(segX, segY) / 2));
      var spd = Math.hypot(m.vx, m.vy) || 1;
      var bx = -m.vx / spd;
      var by = -m.vy / spd;
      for (var k = 0; k < steps; k++) {
        var u = k / steps;
        var ex = ox + segX * u + bx * 2.2 + (Math.random() - 0.5) * 2.2;
        var ey = oy + segY * u + by * 2.2 + (Math.random() - 0.5) * 2.2;
        if (ey > -4) {
          addPart({
            kind: 'fire',
            x: ex,
            y: ey,
            vx: bx * (18 + Math.random() * 24) + (Math.random() - 0.5) * 14,
            vy: by * (18 + Math.random() * 24) + (Math.random() - 0.5) * 14,
            g: -8,
            s: Math.random() < 0.55 ? 2 : 1,
            col: '',
            age: 0,
            life: 0.14 + Math.random() * 0.16
          });
        }
      }
      if (m.smokeT >= 0.024 && m.y > -2) {
        m.smokeT = 0;
        var scols = ['#4d505e', '#666b7a', '#868b9c', '#3c3e4a'];
        addPart({
          kind: 'smoke',
          x: m.x + bx * 4.5 + (Math.random() - 0.5) * 2.5,
          y: m.y + by * 4.5 + (Math.random() - 0.5) * 2.5,
          vx: bx * 8 + (Math.random() - 0.5) * 10,
          vy: -7 - Math.random() * 10,
          s: Math.random() < 0.5 ? 3 : 2,
          col: scols[Math.floor(Math.random() * scols.length)],
          age: 0,
          life: 0.52 + Math.random() * 0.44
        });
      }

      var gInfo = groundAtCanvasX(m.x, fxRect);
      if (m.y >= gInfo.y || m.y > fxH + 6 || m.x < -20 || m.x > fxW + 20) {
        if (m.x >= -6 && m.x <= fxW + 6) {
          var hitX = m.x;
          if (oy < gInfo.y && m.y > oy) {
            var frac = Math.max(0, Math.min(1, (gInfo.y - oy) / (m.y - oy)));
            hitX = ox + (m.x - ox) * frac;
          }
          explodeAt(hitX, Math.min(gInfo.y, fxH - 2), gInfo.surface, m.power);
        }
        fxMeteors.splice(mi, 1);
        continue;
      }
      drawMeteor(m);
    }

    /* 5. live drag-to-aim parabolic preview + target crosshair */
    if (aim.dragging) {
      aim.phase += dt;
      drawAimPreview(fxRect);
    }

    if (aim.dragging || fxMeteors.length || fxParts.length || fxFlashes.length || fxRipples.length) {
      fxRaf = requestAnimationFrame(stepFx);
    }
  };

  /* pinpoint quick-strike meteor: enters cleanly from space and hits dead-on beneath click x */
  var summonMeteor = function (cx, cy, rect, opts) {
    unlockAdv('meteor');
    playSfx('meteor');
    if (!fxCtx) return;
    syncFxCanvas();
    var r = rect || getSceneRect();
    fxRect = r;
    if (reduceMotion) {
      var gi = groundAtCanvasX(cx, r);
      fxFlashes.push({ x: cx, y: Math.min(cy, gi.y), r: 12, age: 0, life: 0.24, col: 'rgba(255,200,100,' });
      startFx();
      return;
    }
    var gTarget = groundAtCanvasX(cx, r);
    var targetSvgX = canvasXToSvgX(cx, r);
    var fromRight = opts && typeof opts.fromRight === 'boolean'
      ? opts.fromRight
      : (cx < fxW * 0.24 || cx > fxW * 0.76 || (targetSvgX > 216 && targetSvgX < 240));
    var deg = fromRight ? 112 + Math.random() * 10 : 58 + Math.random() * 10;
    var rad = (deg * Math.PI) / 180;
    var sy = -8;
    var gAcc = 145;
    var flightT = 0.42 + Math.random() * 0.12;
    var dyTotal = Math.max(24, gTarget.y - sy);
    var dxTotal = dyTotal / Math.tan(rad);
    var sx = cx - dxTotal;
    fxMeteors.push({
      x: sx,
      y: sy,
      vx: dxTotal / flightT,
      vy: (dyTotal - 0.5 * gAcc * flightT * flightT) / flightT,
      g: gAcc,
      power: (opts && opts.power) || 0.25,
      rot: Math.floor(Math.random() * 4),
      rotT: 0,
      smokeT: 0
    });
    startFx();
  };

  /* guided launch from drag-to-aim vector */
  var launchAimedMeteor = function (x0, y0, x1, y1, rect) {
    unlockAdv('meteor');
    playSfx('meteor');
    if (!fxCtx) return;
    syncFxCanvas();
    var r = rect || getSceneRect();
    fxRect = r;
    var vel = aimVelocity(x0, y0, x1, y1, r);
    fxFlashes.push({ x: x0, y: y0, r: 7 + Math.round(vel.power * 3), age: 0, life: 0.12, col: 'rgba(255,224,132,' });
    fxMeteors.push({
      x: x0,
      y: y0,
      vx: vel.vx,
      vy: vel.vy,
      g: AIM_G,
      power: vel.power,
      rot: Math.floor(Math.random() * 4),
      rotT: 0,
      smokeT: 0
    });
    startFx();
  };

  /* sequential 5-meteor barrage sweeping around target point */
  var launchBarrage = function (cx, cy, rect) {
    var fromRight = cx < fxW * 0.26;
    for (var bi = 0; bi < 5; bi++) {
      (function (k) {
        setTimeout(function () {
          if (d.hidden || root.getAttribute('data-theme') === 'light') return;
          var rNow = scene.getBoundingClientRect();
          var spreadX = Math.max(6, Math.min(fxW - 6, cx + (k - 2) * 11 + (Math.random() - 0.5) * 6));
          summonMeteor(spreadX, cy, rNow, { fromRight: fromRight, power: 0.45 });
        }, k * 95);
      })(bi);
    }
  };

  var spawnCabinEmbers = function (cx, cy, rect) {
    playSfx('crackle');
    if (reduceMotion || !fxCtx) return;
    syncFxCanvas();
    fxRect = rect || getSceneRect();
    var cols = ['#fff2ad', '#ffbe3d', '#ff7b24'];
    for (var i = 0; i < 6; i++) {
      addPart({
        kind: 'fire',
        x: cx + (Math.random() - 0.5) * 6,
        y: cy + (Math.random() - 0.5) * 3,
        vx: (Math.random() - 0.35) * 14,
        vy: -14 - Math.random() * 16,
        g: -4,
        s: 1,
        col: cols[i % cols.length],
        age: 0,
        life: 0.65 + Math.random() * 0.45
      });
    }
    for (var sm = 0; sm < 3; sm++) {
      addPart({
        kind: 'smoke',
        x: cx + (Math.random() - 0.5) * 5,
        y: cy - 1,
        vx: 3 + (Math.random() - 0.5) * 8,
        vy: -12 - Math.random() * 10,
        s: 2 + (sm % 2),
        col: '#9ea6ba',
        age: 0,
        life: 0.75 + Math.random() * 0.4
      });
    }
    startFx();
  };

  var spawnLakeRipple = function (cx, cy, rect) {
    playSfx('splash', false);
    if (reduceMotion || !fxCtx) return;
    syncFxCanvas();
    fxRect = rect || getSceneRect();
    fxRipples.push({ x: cx, y: cy, span: 1, max: 16, speed: 24, age: 0, life: 0.55 });
    var cols = ['#7fd8fa', '#d8f4ff', '#4588c4'];
    for (var i = 0; i < 7; i++) {
      addPart({
        kind: 'debris',
        x: cx + (Math.random() - 0.5) * 3,
        y: cy,
        vx: (Math.random() - 0.5) * 44,
        vy: -32 - Math.random() * 34,
        g: 210,
        s: 1,
        col: cols[i % cols.length],
        age: 0,
        life: 0.42 + Math.random() * 0.2,
        floorY: cy + 1,
        bounced: true
      });
    }
    startFx();
  };

  var spawnCelestialBurst = function (cx, cy, rect, isDay) {
    if (reduceMotion || !fxCtx) return;
    syncFxCanvas();
    fxRect = rect || getSceneRect();
    var cols = isDay ? ['#fff7c2', '#ffd84a', '#ffa92e'] : ['#eef5ff', '#b9d1ff', '#7fa6ff'];
    for (var i = 0; i < 10; i++) {
      var a = (Math.PI * 2 * i) / 10 + (Math.random() - 0.5) * 0.25;
      var spd = 22 + Math.random() * 24;
      addPart({
        kind: 'fire',
        x: cx,
        y: cy,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        g: 0,
        s: 1,
        col: cols[i % cols.length],
        age: 0,
        life: 0.36 + Math.random() * 0.2
      });
    }
    startFx();
  };

  var cancelAim = function () {
    if (!aim.down && !aim.dragging) return;
    aim.down = false;
    aim.dragging = false;
    aim.id = -1;
    scene.classList.remove('aiming');
  };

  scene.addEventListener('pointerdown', function (e) {
    if (e.button !== 0 || e.pointerType === 'touch') return;
    if (root.getAttribute('data-theme') === 'light') return;
    var p = scenePoint(e);
    if (sceneZone(p.x, p.y) !== 'sky' || p.y >= terrainAtSvgX(p.x).y - 2) return;
    syncFxCanvas();
    var rect = scene.getBoundingClientRect();
    fxRect = rect;
    var c = eventToCanvas(e, rect);
    aim.down = true;
    aim.dragging = false;
    aim.id = e.pointerId;
    aim.sx0 = e.clientX;
    aim.sy0 = e.clientY;
    aim.x0 = c.x;
    aim.y0 = c.y;
    aim.x1 = c.x;
    aim.y1 = c.y;
    aim.phase = 0;
    if (scene.setPointerCapture) { try { scene.setPointerCapture(e.pointerId); } catch (err) {} }
  });

  scene.addEventListener('pointermove', function (e) {
    if (aim.down && e.pointerId === aim.id) {
      var rect = getSceneRect();
      var c = eventToCanvas(e, rect);
      aim.x1 = c.x;
      aim.y1 = c.y;
      if (!aim.dragging && Math.hypot(e.clientX - aim.sx0, e.clientY - aim.sy0) >= 8) {
        aim.dragging = true;
        scene.classList.add('aiming');
        playSfx('aim');
        startFx();
      }
      return;
    }
    var p = scenePoint(e);
    var z = sceneZone(p.x, p.y);
    if (canHover) scene.classList.toggle('hot', z === 'celestial' || z === 'cabin' || z === 'lake');
    /* hold Shift + sweep mouse across night sky for smooth continuous meteor barrage */
    if (e.shiftKey && z === 'sky' && root.getAttribute('data-theme') !== 'light') {
      var now = performance.now();
      if (now - lastSweepAt >= 105) {
        lastSweepAt = now;
        var sr = scene.getBoundingClientRect();
        fxRect = sr;
        var sc = eventToCanvas(e, sr);
        summonMeteor(sc.x, sc.y, sr, { power: 0.35 });
      }
    }
  });

  scene.addEventListener('pointerup', function (e) {
    if (!aim.down || e.pointerId !== aim.id) return;
    var wasDragging = aim.dragging;
    var rect = scene.getBoundingClientRect();
    fxRect = rect;
    var x0 = aim.x0;
    var y0 = aim.y0;
    var c1 = eventToCanvas(e, rect);
    cancelAim();
    if (wasDragging) {
      launchAimedMeteor(x0, y0, c1.x, c1.y, rect);
      aim.skipClick = performance.now();
    }
  });
  scene.addEventListener('pointercancel', cancelAim);
  scene.addEventListener('pointerleave', function () { scene.classList.remove('hot'); });
  d.addEventListener('keydown', function (e) { if (e.key === 'Escape' && aim.dragging) cancelAim(); });

  scene.addEventListener('click', function (e) {
    if (aim.skipClick && performance.now() - aim.skipClick < 180) return;
    syncFxCanvas();
    var rect = scene.getBoundingClientRect();
    fxRect = rect;
    var c = eventToCanvas(e, rect);
    var p = scenePoint(e);
    var z = sceneZone(p.x, p.y);
    if (z === 'celestial') {
      var next = toggleTheme();
      spawnCelestialBurst(c.x, c.y, rect, next === 'light');
    } else if (z === 'cabin') {
      spawnCabinEmbers(c.x, c.y, rect);
    } else if (z === 'lake') {
      spawnLakeRipple(c.x, c.y, rect);
    } else if (z === 'sky') {
      if (root.getAttribute('data-theme') !== 'light') {
        var now = performance.now();
        if (now - lastTapAt < 300 && Math.hypot(e.clientX - lastTapX, e.clientY - lastTapY) < 42) {
          lastTapAt = 0;
          launchBarrage(c.x, c.y, rect);
        } else {
          lastTapAt = now;
          lastTapX = e.clientX;
          lastTapY = e.clientY;
          summonMeteor(c.x, c.y, rect);
        }
      } else {
        spawnCelestialBurst(c.x, c.y, rect, true);
      }
    }
  });
}

if (toTop) {
  toTop.addEventListener('click', function () {
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  });
}

/* quick search modal (Ctrl+K / Cmd+K / "/" / header search icon) */
var searchTrigger = $('#search-toggle');
var qsWrap = null;
var qsInput = null;
var qsList = null;
var qsStatus = null;
var qsCode = null;
var qsTopics = null;
var qsFull = null;
var qsIndex = null;
var qsLoading = null;
var qsSelected = -1;
var qsTimer = null;
var qsRev = 0;
var qsOpen = false;
var qsReturnEl = null;

var fold = function (s) { return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd'); };
var esc = function (s) { return s.replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };

var qsRanges = function (text, terms) {
  var normalized = '';
  var offsets = [];
  var ends = [];
  var pos = 0;
  Array.from(text).forEach(function (ch) {
    var f = fold(ch);
    for (var i = 0; i < f.length; i++) { offsets.push(pos); ends.push(pos + ch.length); }
    if (!f.length && ends.length) ends[ends.length - 1] = pos + ch.length;
    normalized += f;
    pos += ch.length;
  });
  var found = [];
  terms.forEach(function (t) {
    for (var at = normalized.indexOf(t); at !== -1; at = normalized.indexOf(t, at + t.length)) {
      found.push([offsets[at], ends[at + t.length - 1]]);
    }
  });
  found.sort(function (a, b) { return a[0] - b[0]; });
  var merged = [];
  found.forEach(function (r) {
    var last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push(r);
  });
  return merged;
};
var qsMark = function (text, terms) {
  var out = '';
  var pos = 0;
  qsRanges(text, terms).forEach(function (r) {
    out += esc(text.slice(pos, r[0])) + '<mark>' + esc(text.slice(r[0], r[1])) + '</mark>';
    pos = r[1];
  });
  return out + esc(text.slice(pos));
};
var qsSnippet = function (text, terms) {
  var found = qsRanges(text, terms);
  if (!found.length) return '';
  var from = Math.max(0, found[0][0] - 48);
  var to = Math.min(text.length, found[0][1] + 96);
  return (from ? '…' : '') + text.slice(from, to) + (to < text.length ? '…' : '');
};

var loadQsIndex = function () {
  if (qsIndex) return Promise.resolve(qsIndex);
  if (!qsLoading) {
    var src = searchTrigger ? searchTrigger.getAttribute('data-search') : '/search.json';
    qsLoading = fetch(src).then(function (r) {
      if (!r.ok) throw new Error('Search unavailable');
      return r.json();
    }).then(function (rows) {
      rows.forEach(function (r) {
        r._t = fold(r.t); r._d = fold(r.d); r._g = fold((r.g || []).join(' ')); r._x = fold(r.x);
        (r.sections || []).forEach(function (s) { s._x = fold(s.t + ' ' + s.x); s._c = fold(s.c); });
      });
      qsIndex = rows;
      return rows;
    }).catch(function (err) { qsLoading = null; throw err; });
  }
  return qsLoading;
};

var renderQs = function (q) {
  qsSelected = -1;
  var terms = Array.from(new Set(fold(q).split(/\s+/).filter(Boolean)));
  if (!terms.length) {
    qsList.innerHTML = '';
    qsStatus.textContent = 'Type to search posts, tags, and sections';
    if (qsTopics) qsTopics.hidden = false;
    return;
  }
  if (qsTopics) qsTopics.hidden = true;
  var incCode = qsCode && qsCode.checked;
  var results = [];
  qsIndex.forEach(function (r) {
    var score = 0;
    var best = null;
    var bestScore = 0;
    var sections = r.sections || [];
    for (var i = 0; i < terms.length; i++) {
      var t = terms[i];
      var val = 0;
      if (r._t.includes(t)) val += r._t.startsWith(t) ? 14 : 10;
      if (r._g.includes(t)) val += 7;
      if (r._d.includes(t)) val += 4;
      if (r._x.includes(t)) val += 2;
      if (incCode && sections.some(function (s) { return s._c.includes(t); })) val += 1;
      if (!val) return;
      score += val;
    }
    sections.forEach(function (s) {
      var val = terms.reduce(function (n, t) { return n + (s._x.includes(t) ? 2 : 0) + (incCode && s._c.includes(t) ? 1 : 0); }, 0);
      if (val > bestScore) { best = s; bestScore = val; }
    });
    results.push({ r: r, score: score, section: best });
  });
  results.sort(function (a, b) { return b.score - a.score; });
  qsStatus.textContent = results.length
    ? results.length + (results.length === 1 ? ' result' : ' results')
    : 'No matches — try fewer words or Include code';
  qsList.innerHTML = results.slice(0, 12).map(function (item) {
    var r = item.r;
    var s = item.section;
    var sn = qsSnippet(s ? s.x : r.x, terms);
    var inCode = false;
    if (!sn && s && incCode) { sn = qsSnippet(s.c, terms); inCode = !!sn; }
    var href = r.u + (s && s.id ? '#' + encodeURIComponent(s.id) : '');
    return '<li><a class="row" href="' + esc(href) + '"><span class="row-main"><span class="row-title">' + qsMark(r.t, terms) + '</span>' +
      (r.d ? '<span class="row-desc">' + qsMark(r.d, terms) + '</span>' : '') +
      (s && s.t ? '<span class="match-section">' + esc(s.t) + (inCode ? ' · Code' : '') + '</span>' : '') +
      (sn ? '<span class="snip">' + qsMark(sn, terms) + '</span>' : '') + '</span><time class="row-date">' + esc(r.s) + '</time></a></li>';
  }).join('');
  if (qsFull && searchTrigger) {
    var baseHref = searchTrigger.getAttribute('href');
    var params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (incCode) params.set('code', '1');
    qsFull.href = params.toString() ? baseHref + '?' + params.toString() : baseHref;
  }
};

var updateQs = function () {
  var id = ++qsRev;
  var q = qsInput.value;
  var trimmed = q.trim();
  if (!trimmed) {
    qsList.innerHTML = '';
    qsStatus.textContent = 'Type to search posts, tags, and sections';
    if (qsTopics) qsTopics.hidden = false;
    if (qsFull && searchTrigger) qsFull.href = searchTrigger.getAttribute('href');
    return;
  }
  if (window.__ryou && window.__ryou.check(trimmed)) {
    if (qsTopics) qsTopics.hidden = true;
    var dlg = $('.qs-dialog', qsWrap);
    var dr = dlg ? dlg.getBoundingClientRect() : null;
    window.__ryou.submit(trimmed, dr ? dr.left + dr.width / 2 : window.innerWidth / 2, dr ? dr.top + 80 : window.innerHeight / 3);
    qsStatus.textContent = 'Challenge complete!';
    qsList.innerHTML = '<li><div class="qs-flag"><span>✦</span><div><b>Flag accepted — Enchanted Dye unlocked!</b><span>Equipped #c77dff and added Enchanted ✦ to the Dye picker.</span></div></div></li>';
    return;
  }
  if (qsTopics) qsTopics.hidden = true;
  if (!qsIndex) qsStatus.textContent = 'Loading index…';
  loadQsIndex().then(function () {
    if (id === qsRev) renderQs(qsInput.value);
  }).catch(function () {
    if (id === qsRev) { qsList.innerHTML = ''; qsStatus.textContent = 'Could not load search index.'; }
  });
};

var closeQs = function () {
  if (!qsOpen || !qsWrap) return;
  qsOpen = false;
  qsWrap.classList.remove('open');
  qsWrap.setAttribute('aria-hidden', 'true');
  if (qsReturnEl && qsReturnEl.focus) { qsReturnEl.focus(); qsReturnEl = null; }
};

var buildQs = function () {
  if (qsWrap) return;
  var searchHref = searchTrigger ? searchTrigger.getAttribute('href') : '/search/';
  var iconHtml = searchTrigger ? searchTrigger.innerHTML : '';
  var topicStr = searchTrigger ? (searchTrigger.getAttribute('data-topics') || '') : '';
  var topics = topicStr ? topicStr.split(',').filter(Boolean) : [];
  qsWrap = d.createElement('div');
  qsWrap.className = 'qs-backdrop';
  qsWrap.setAttribute('aria-hidden', 'true');
  var topicHtml = topics.length
    ? '<div class="qs-topics"><span class="suggest-label">Topics</span>' + topics.map(function (t) {
        return '<button type="button" class="chip suggest-chip" data-q="' + esc(t) + '"><span class="hash">#</span>' + esc(t) + '</button>';
      }).join('') + '</div>'
    : '';
  qsWrap.innerHTML =
    '<div class="qs-dialog" role="dialog" aria-modal="true" aria-label="Quick search">' +
    '<div class="qs-head"><span class="qs-ico" aria-hidden="true">' + iconHtml + '</span>' +
    '<input class="qs-input" type="search" placeholder="Search write-ups, tags, notes…" autocomplete="off" autocapitalize="off" spellcheck="false">' +
    '<button type="button" class="qs-esc" aria-label="Close search">Esc</button></div>' +
    '<div class="qs-bar"><span class="qs-status" aria-live="polite">Type to search posts, tags, and sections</span>' +
    '<label class="qs-code"><input type="checkbox"> Include code</label></div>' +
    '<div class="qs-body">' + topicHtml + '<ol class="rows results qs-results"></ol></div>' +
    '<div class="qs-foot"><span class="qs-hints"><span><kbd>↑</kbd><kbd>↓</kbd> navigate</span><span><kbd>↵</kbd> open</span><span><kbd>Esc</kbd> close</span></span>' +
    '<a class="qs-full" href="' + esc(searchHref) + '">Full search →</a></div></div>';

  qsInput = $('.qs-input', qsWrap);
  qsList = $('.qs-results', qsWrap);
  qsStatus = $('.qs-status', qsWrap);
  qsCode = $('.qs-code input', qsWrap);
  qsTopics = $('.qs-topics', qsWrap);
  qsFull = $('.qs-full', qsWrap);

  qsWrap.addEventListener('click', function (e) { if (e.target === qsWrap) closeQs(); });
  $('.qs-esc', qsWrap).addEventListener('click', closeQs);
  qsInput.addEventListener('input', function () { qsRev++; clearTimeout(qsTimer); qsTimer = setTimeout(updateQs, 60); });
  qsCode.addEventListener('change', updateQs);
  if (qsTopics) {
    qsTopics.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-q]') : null;
      if (!b) return;
      qsInput.value = b.getAttribute('data-q') || '';
      updateQs();
      qsInput.focus();
    });
  }
  qsList.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('a')) closeQs();
  });
  qsInput.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (qsInput.value) { qsInput.value = ''; updateQs(); }
      else closeQs();
      return;
    }
    var items = qsList.querySelectorAll('li');
    if (!items.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      qsSelected = e.key === 'ArrowDown' ? Math.min(items.length - 1, qsSelected + 1) : Math.max(0, qsSelected - 1);
      for (var i = 0; i < items.length; i++) items[i].classList.toggle('selected', i === qsSelected);
      items[qsSelected].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      var link = items[Math.max(0, qsSelected)].querySelector('a');
      if (link) link.click();
    }
  });
  d.body.appendChild(qsWrap);
};

var openQs = function () {
  var pageQ = $('#q');
  if (pageQ) { pageQ.focus(); pageQ.select(); return; }
  if ($('.lb')) return;
  if (closeDye) closeDye();
  if (closeSfx) closeSfx();
  buildQs();
  qsReturnEl = d.activeElement;
  qsOpen = true;
  qsWrap.setAttribute('aria-hidden', 'false');
  requestAnimationFrame(function () {
    qsWrap.classList.add('open');
    qsInput.focus();
    qsInput.select();
  });
  unlockAdv('search');
  loadQsIndex().catch(function () {});
};

if (searchTrigger) {
  searchTrigger.addEventListener('click', function (e) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0 || $('#q')) return;
    e.preventDefault();
    openQs();
  });
}

/* "/" and Ctrl+K / Cmd+K open Quick Search */
d.addEventListener('keydown', function (e) {
  if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'k' || e.key === 'K')) {
    e.preventDefault();
    if (qsOpen) closeQs(); else openQs();
    return;
  }
  if (e.key === 'Escape' && qsOpen) { e.preventDefault(); closeQs(); return; }
  if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
  var tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;
  e.preventDefault();
  openQs();
});

/* mini RE / CTF crackme Easter egg — unlock secret "Enchanted" dye */
var vaultBlob = [40, 45, 25, 49, 49, 36, 117, 60, 21, 50, 42, 239, 29, 71, 242, 64, 54, 66, 71];
var vaultCheck = function (s) {
  if (typeof s !== 'string' || s.length !== vaultBlob.length) return false;
  for (var i = 0; i < vaultBlob.length; i++) {
    if ((((s.charCodeAt(i) ^ (0x5a + i * 5)) + i * 7) & 255) !== vaultBlob[i]) return false;
  }
  return true;
};
var vaultSolvedOnce = false;
var vaultSubmit = function (s, cx, cy) {
  if (!vaultCheck(String(s || '').trim())) return false;
  store('ryou_secret_dye', '1');
  if (ensureSecretDye) ensureSecretDye();
  if (applyDye) applyDye('#c77dff');
  if (!vaultSolvedOnce) {
    vaultSolvedOnce = true;
    burstXpOrbs(typeof cx === 'number' ? cx : window.innerWidth / 2, typeof cy === 'number' ? cy : window.innerHeight / 3);
    unlockAdv('crackme', true);
  }
  return true;
};
window.__ryou = {
  hint: 'Reverse check(flag) to recover ryou{...}, then enter it into Quick Search (Ctrl+K).',
  blob: vaultBlob.slice(),
  check: vaultCheck,
  submit: vaultSubmit
};
if (typeof console !== 'undefined' && console.log) {
  console.log('%c ryou.blog %c Curious mind detected — inspect window.__ryou to unlock a secret Dye.', 'background:#1e2230;color:#6cc24a;border:1px solid #6cc24a;border-radius:3px;padding:2px 6px;font-weight:bold', 'color:#b2bccd');
}
})();
