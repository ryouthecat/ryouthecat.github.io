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

/* day / night */
var syncThemeColor = function () {
  var m = $('meta[name=theme-color]');
  if (m) m.setAttribute('content', getComputedStyle(root).getPropertyValue('--bg').trim());
};
syncThemeColor();
var themeBtn = $('#theme-toggle');
if (themeBtn) {
  themeBtn.addEventListener('click', function (e) {
    var next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    smoothTheme();
    root.setAttribute('data-theme', next);
    store('theme', next);
    syncThemeColor();
    if (e.detail > 0) themeBtn.blur();
    if (!reduceMotion) {
      themeBtn.classList.remove('pop');
      void themeBtn.offsetWidth;
      themeBtn.classList.add('pop');
    }
  });
}

/* accent colour ("dye") + live hovered dye name label */
var dyeBtn = $('#dye-toggle');
var dyeMenu = $('#dye-menu');
var dyeNameEl = $('#dye-name');
var closeDye = null;
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
  var setMenu = function (open) {
    isOpen = !!open;
    dyeMenu.classList.toggle('open', isOpen);
    dyeMenu.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
    dyeBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    if (isOpen) showDyeLabel(activeDyeName, current);
  };
  closeDye = function () { if (isOpen) setMenu(false); };
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
    current = b.getAttribute('data-color').toLowerCase();
    smoothTheme();
    root.style.setProperty('--accent', current);
    store('dye', current);
    mark();
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
  if (!q.trim()) {
    qsList.innerHTML = '';
    qsStatus.textContent = 'Type to search posts, tags, and sections';
    if (qsTopics) qsTopics.hidden = false;
    if (qsFull && searchTrigger) qsFull.href = searchTrigger.getAttribute('href');
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
      items[Math.max(0, qsSelected)].querySelector('a').click();
    }
  });
  d.body.appendChild(qsWrap);
};

var openQs = function () {
  var pageQ = $('#q');
  if (pageQ) { pageQ.focus(); pageQ.select(); return; }
  if ($('.lb')) return;
  if (closeDye) closeDye();
  buildQs();
  qsReturnEl = d.activeElement;
  qsOpen = true;
  qsWrap.setAttribute('aria-hidden', 'false');
  requestAnimationFrame(function () {
    qsWrap.classList.add('open');
    qsInput.focus();
    qsInput.select();
  });
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
})();
