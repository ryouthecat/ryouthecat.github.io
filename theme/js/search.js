/* Search is loaded only on /search/. Code is opt-in; results link to matching headings. */
(function () {
'use strict';
var input = document.getElementById('q');
var list = document.getElementById('results');
var status = document.getElementById('search-status');
var code = document.getElementById('include-code');
var retry = document.getElementById('search-retry');
var suggest = document.getElementById('search-suggest');
if (!input || !list) return;
var index = null, loading = null, selected = -1, timer = null, revision = 0;
var fold = function (s) { return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd'); };
var esc = function (s) { return s.replace(/[&<>"]/g, function (c) { return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); };
var load = function () {
  if (index) return Promise.resolve(index);
  if (!loading) loading = fetch(input.getAttribute('data-index')).then(function (r) {
    if (!r.ok) throw new Error('Search unavailable');
    return r.json();
  }).then(function (rows) {
    rows.forEach(function (r) {
      r._t = fold(r.t); r._d = fold(r.d); r._g = fold(r.g.join(' ')); r._x = fold(r.x);
      (r.sections || []).forEach(function (s) { s._x = fold(s.t + ' ' + s.x); s._c = fold(s.c); });
    });
    index = rows; return rows;
  }).catch(function (err) { loading = null; throw err; });
  return loading;
};
// Map normalized matches back to original text, then escape each segment once.
var ranges = function (text, terms) {
  var normalized = '', offsets = [], ends = [], pos = 0;
  Array.from(text).forEach(function (ch) {
    var f = fold(ch);
    for (var i = 0; i < f.length; i++) { offsets.push(pos); ends.push(pos + ch.length); }
    if (!f.length && ends.length) ends[ends.length - 1] = pos + ch.length;
    normalized += f; pos += ch.length;
  });
  var found = [];
  terms.forEach(function (t) {
    for (var at = normalized.indexOf(t); at !== -1; at = normalized.indexOf(t, at + t.length)) found.push([offsets[at], ends[at + t.length - 1]]);
  });
  found.sort(function (a,b) { return a[0]-b[0]; });
  var merged = [];
  found.forEach(function (r) { var last = merged[merged.length-1]; if (last && r[0] <= last[1]) last[1] = Math.max(last[1],r[1]); else merged.push(r); });
  return merged;
};
var mark = function (text, terms) {
  var out = '', pos = 0;
  ranges(text,terms).forEach(function (r) { out += esc(text.slice(pos,r[0])) + '<mark>' + esc(text.slice(r[0],r[1])) + '</mark>'; pos = r[1]; });
  return out + esc(text.slice(pos));
};
var snippet = function (text, terms) {
  var found = ranges(text, terms);
  if (!found.length) return '';
  var from = Math.max(0,found[0][0]-60), to = Math.min(text.length,found[0][1]+120);
  return (from ? '…' : '') + text.slice(from,to) + (to < text.length ? '…' : '');
};
var render = function (q) {
  selected = -1;
  var terms = Array.from(new Set(fold(q).split(/\s+/).filter(Boolean)));
  if (!terms.length) { list.innerHTML = ''; status.textContent = ''; return; }
  var results = [];
  index.forEach(function (r) {
    var score = 0, best = null, bestScore = 0;
    var sections = r.sections || [];
    for (var i = 0; i < terms.length; i++) {
      var t = terms[i], value = 0;
      if (r._t.includes(t)) value += r._t.startsWith(t) ? 14 : 10;
      if (r._g.includes(t)) value += 7;
      if (r._d.includes(t)) value += 4;
      if (r._x.includes(t)) value += 2;
      if (code.checked && sections.some(function (s) { return s._c.includes(t); })) value += 1;
      if (!value) return;
      score += value;
    }
    sections.forEach(function (s) {
      var value = terms.reduce(function (n,t) { return n + (s._x.includes(t) ? 2 : 0) + (code.checked && s._c.includes(t) ? 1 : 0); },0);
      if (value > bestScore) { best = s; bestScore = value; }
    });
    results.push({r:r,score:score,section:best});
  });
  results.sort(function (a,b) { return b.score-a.score; });
  status.textContent = results.length ? results.length + (results.length===1 ? ' result' : ' results') + (results.length>30 ? ' — showing the first 30' : '') : 'Nothing found. Try fewer words or enable Include code.';
  list.innerHTML = results.slice(0,30).map(function (item) {
    var r = item.r, s = item.section;
    var sn = snippet(s ? s.x : r.x,terms);
    var inCode = false;
    if (!sn && s && code.checked) { sn = snippet(s.c,terms); inCode = !!sn; }
    var href = r.u + (s && s.id ? '#' + encodeURIComponent(s.id) : '');
    return '<li><a class="row" href="'+esc(href)+'"><span class="row-main"><span class="row-title">'+mark(r.t,terms)+'</span>' +
      (r.d ? '<span class="row-desc">'+mark(r.d,terms)+'</span>' : '') +
      (s && s.t ? '<span class="match-section">'+esc(s.t)+(inCode ? ' · Code' : '')+'</span>' : '') +
      (sn ? '<span class="snip">'+mark(sn,terms)+'</span>' : '') + '</span><time class="row-date">'+esc(r.s)+'</time></a></li>';
  }).join('');
};
var update = function () {
  var id = ++revision, q = input.value;
  retry.hidden = true;
  var url = new URL(location.href);
  if (q.trim()) url.searchParams.set('q',q); else url.searchParams.delete('q');
  if (code.checked) url.searchParams.set('code','1'); else url.searchParams.delete('code');
  history.replaceState(null,'',url);
  if (suggest) suggest.hidden = !!q.trim();
  if (!q.trim()) { list.innerHTML=''; status.textContent=''; list.removeAttribute('aria-busy'); return; }
  if (window.__ryou && window.__ryou.check(q.trim())) {
    var ir = input.getBoundingClientRect();
    window.__ryou.submit(q.trim(), ir.left + ir.width / 2, ir.bottom + 24);
    status.textContent = 'Challenge complete!';
    list.innerHTML = '<li><div class="qs-flag"><span>✦</span><div><b>Flag accepted — Enchanted Dye unlocked!</b><span>Equipped #c77dff and added Enchanted ✦ to the Dye picker.</span></div></div></li>';
    list.removeAttribute('aria-busy');
    return;
  }
  list.setAttribute('aria-busy','true');
  if (!index) { list.innerHTML=''; status.textContent='Loading search…'; }
  load().then(function () { if (id===revision) render(input.value); }).catch(function () {
    if (id!==revision) return;
    list.innerHTML=''; status.textContent='Search could not load. Please try again.'; retry.hidden=false;
  }).finally(function () { if (id===revision) list.removeAttribute('aria-busy'); });
};
input.addEventListener('input',function () { revision++; clearTimeout(timer); timer=setTimeout(update,70); });
code.addEventListener('change',update);
retry.addEventListener('click',update);
if (suggest) {
  suggest.addEventListener('click',function (e) {
    var b=e.target.closest ? e.target.closest('[data-q]') : null;
    if (!b) return;
    input.value=b.getAttribute('data-q') || '';
    update();
    input.focus();
  });
}
input.addEventListener('keydown',function (e) {
  if (e.key==='Escape' && input.value) { e.preventDefault(); input.value=''; update(); return; }
  var items=list.querySelectorAll('li');
  if (!items.length) return;
  if (e.key==='ArrowDown' || e.key==='ArrowUp') {
    e.preventDefault(); selected=e.key==='ArrowDown' ? Math.min(items.length-1,selected+1) : Math.max(0,selected-1);
    for(var i=0;i<items.length;i++) items[i].classList.toggle('selected',i===selected);
    items[selected].scrollIntoView({block:'nearest'});
  } else if(e.key==='Enter') { e.preventDefault(); var a=items[Math.max(0,selected)].querySelector('a'); if(a) a.click(); }
});
var params=new URL(location.href).searchParams;
input.value=params.get('q') || ''; code.checked=params.get('code')==='1';
update(); input.focus();
})();
