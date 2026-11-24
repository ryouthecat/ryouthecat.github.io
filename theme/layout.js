// Page shell + shared components. Pure functions: (site data) → HTML string.

import { html, raw, escapeHtml } from '../engine/html.js';
import { icon } from '../engine/pixel.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const fmtDate = (d) => `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
export const fmtShort = (d) => `${MONTHS[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2, '0')}`;
export const isoDate = (d) => d.toISOString().slice(0, 10);

export function readMinutes(page, cfg) {
  const wpm = cfg.wordsPerMinute || 200;
  const w = (page.words || 0) + (page.codeWords || 0) * 0.25;
  return Math.max(1, Math.round(w / wpm));
}

export function socialIcon(name = '') {
  const k = name.toLowerCase();
  if (k.includes('github')) {
    return '<svg class="ui-ico" viewBox="0 0 16 16" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>';
  }
  if (k.includes('mail')) {
    return '<svg class="ui-ico" viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true"><rect x="1.5" y="3" width="13" height="10"/><path d="M2 3.5 8 8.5 14 3.5"/></svg>';
  }
  return '<svg class="ui-ico" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M6 3h7v7M13 3 5.5 10.5"/></svg>';
}

// Runs before first paint: applies saved theme + accent + sfx state so there is no flash.
const THEME_BOOT = (cfg) =>
  `(function(){var d=document.documentElement;try{var t=localStorage.getItem('theme')||'${cfg.defaultTheme || 'dark'}';var q=/[?&]theme=(light|dark)/.exec(location.search);if(q)t=q[1];d.setAttribute('data-theme',t);var a=localStorage.getItem('dye');if(a&&/^#[0-9a-f]{6}$/i.test(a))d.style.setProperty('--accent',a);var v=parseInt(localStorage.getItem('sfx_vol'),10);if((!isNaN(v)&&v>0)||(isNaN(v)&&localStorage.getItem('sfx')==='1'))d.setAttribute('data-sfx','on')}catch(e){d.setAttribute('data-theme','${cfg.defaultTheme || 'dark'}')}d.className='js'})()`;

export function layout(site, { title, description, path, body, type = 'website', scripts = [], head = '', noindex = false, jsonld = '', bodyClass = '', ogImage = '' }) {
  const { cfg, assets } = site;
  const fullTitle = path === '/' ? `${cfg.title} — ${cfg.profile.tagline}` : `${title} · ${cfg.title}`;
  const desc = description || cfg.description;
  const canonical = site.abs(path);
  const ogImg = ogImage || assets.ogDefault || cfg.profile.avatar;
  const speculation = JSON.stringify({
    prefetch: [{ where: { and: [{ href_matches: `${cfg.base}/*` }, { not: { href_matches: [`${cfg.base}/assets/*`, `${cfg.base}/*.xml`, `${cfg.base}/*.json`] } }] }, eagerness: 'moderate' }],
  });
  return html`<!doctype html>
<html lang="${cfg.lang}" class="no-js" data-theme="${cfg.defaultTheme || 'dark'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${fullTitle}</title>
<meta name="description" content="${desc}">
<meta name="color-scheme" content="dark light">
<meta name="theme-color" content="#161922">
<meta name="author" content="${cfg.author}">
${noindex ? raw('<meta name="robots" content="noindex">') : ''}
<link rel="canonical" href="${canonical}">
<link rel="icon" href="${site.href('/favicon.svg')}" type="image/svg+xml">
<link rel="alternate" type="application/rss+xml" title="${cfg.title}" href="${site.href('/index.xml')}">
<meta property="og:site_name" content="${cfg.title}">
<meta property="og:type" content="${type}">
<meta property="og:title" content="${title || cfg.title}">
<meta property="og:description" content="${desc}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${site.abs(ogImg)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<script>${raw(THEME_BOOT(cfg))}</script>
<link rel="preload" href="${assets.fontLatin}" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${assets.css}">
<script type="speculationrules">${raw(speculation)}</script>
<script defer src="${assets.js}"></script>
${scripts.map((s) => raw(`<script defer src="${s}"></script>`))}
${head ? raw(head) : ''}
${jsonld ? raw(`<script type="application/ld+json">${jsonld}</script>`) : ''}
</head>
<body${bodyClass ? raw(` class="${bodyClass}"`) : ''}>
<a class="skip" href="#main">Skip to content</a>
${header(site, path)}
<main id="main">
${body}
</main>
${footer(site)}
<button class="to-top" id="to-top" type="button" aria-label="Back to top" title="Back to top"><svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square" aria-hidden="true"><path d="M8 13V3.5M3.5 7.5 8 3l4.5 4.5"/></svg></button>
</body>
</html>`;
}

export function header(site, path) {
  const { cfg, assets } = site;
  const current = (href) => (href === '/' ? path === '/' : path === href || path.startsWith(href));
  const topics = (site.tags || []).slice(0, 6).map((t) => t.name).join(',');
  return html`<header class="site-header">
<div class="bar">
<a class="brand" href="${site.href('/')}" aria-label="${cfg.title} — home"><span class="brand-ico">${raw(icon('grass', 3))}</span><span>${cfg.title.toLowerCase()}</span></a>
<nav class="nav" aria-label="Main">${cfg.nav.map((n) => html`<a href="${site.href(n.href)}"${current(n.href) ? raw(' aria-current="page"') : ''}>${n.label}</a>`)}</nav>
<div class="tools">
<a class="tool" id="search-toggle" href="${site.href('/search/')}" data-search="${assets.searchIndex}" data-topics="${topics}" aria-label="Search" title="Search ( / or Ctrl+K )">${raw(icon('search', 2))}</a>
<button class="tool" id="sfx-toggle" type="button" data-sfx-base="${site.href('/sfx/')}" aria-label="Sound effects volume" aria-expanded="false" aria-controls="sfx-menu" title="Sound effects">${raw('<span class="ico-sfx-on">' + icon('soundOn', 2) + '</span><span class="ico-sfx-off">' + icon('soundOff', 2) + '</span>')}</button>
<button class="tool" id="dye-toggle" type="button" aria-label="Accent colour" aria-expanded="false" aria-controls="dye-menu" title="Accent colour">${raw(icon('dye', 2))}</button>
<button class="tool" id="theme-toggle" type="button" aria-label="Switch between day and night" title="Day / night"><span class="ico-sun">${raw(icon('sun', 2))}</span><span class="ico-moon">${raw(icon('moon', 2))}</span></button>
</div>
<div class="sfx-menu" id="sfx-menu" hidden role="group" aria-label="Sound effects volume">
<div class="sfx-head"><span class="sfx-label">Sound FX</span><span class="sfx-val" id="sfx-val">Off</span></div>
<input class="sfx-range" id="sfx-range" type="range" min="0" max="100" step="5" value="0" aria-label="Volume percentage">
<div class="sfx-presets"><button type="button" class="sfx-opt" data-vol="0">Off</button><button type="button" class="sfx-opt" data-vol="20">20%</button><button type="button" class="sfx-opt" data-vol="50">50%</button><button type="button" class="sfx-opt" data-vol="100">100%</button></div>
</div>
<div class="dye-menu" id="dye-menu" hidden role="group" aria-label="Accent colour"><div class="dye-swatches">${cfg.dyes.map((d) => html`<button type="button" class="dye" data-color="${d.color}" data-name="${d.name}" style="--c:${d.color}" aria-label="${d.name}" title="${d.name}"></button>`)}</div><span class="dye-name" id="dye-name" aria-live="polite"></span></div>
</div>
<div class="read-bar" aria-hidden="true"></div>
</header>`;
}

export function footer(site) {
  return html`<footer class="site-footer"><div class="wrap footer-content">
<p class="footer-author">${site.cfg.title}</p>
<nav class="footer-links" aria-label="Footer"><a href="${site.href('/index.xml')}">RSS feed</a>${site.cfg.social.map((s) => html`<a href="${s.href}"${/^https?:/.test(s.href) ? raw(' target="_blank" rel="noopener noreferrer"') : ''}>${s.name}</a>`)}</nav>
</div><div class="strata" aria-hidden="true"></div></footer>`;
}

export function tagChip(site, tag, count) {
  return html`<a class="chip" href="${site.href(tag.url || `/tags/${tag.slug}/`)}"><span class="hash">#</span>${tag.name}${count !== undefined ? html`<b>${count}</b>` : ''}</a>`;
}

export function sectionBadge(site, section) {
  if (!section) return '';
  return html`<a class="sec-badge" href="${site.href(section.url)}">${raw(icon(section.icon, 1.5))}<span>${section.title}</span></a>`;
}

/** A post in a list. variant: 'home' (icon + description) | 'archive' (date + icon + tags). */
export function postRow(site, p, variant = 'home') {
  const sec = p.sectionInfo;
  if (variant === 'archive') {
    return html`<li class="row row-archive">
<span class="row-stamp"><span class="row-ico" title="${sec ? sec.title : ''}">${sec ? raw(icon(sec.icon, 1.5)) : ''}</span><time class="row-date" datetime="${isoDate(p.date)}">${fmtShort(p.date)}</time></span>
<div class="row-main"><a class="row-title" href="${site.href(p.url)}">${p.title}</a>${p.description ? html`<span class="row-desc">${p.description}</span>` : ''}</div>
<div class="row-tags">${p.tags.map((t) => tagChip(site, t))}</div>
</li>`;
  }
  return html`<li><a class="row" href="${site.href(p.url)}">
<span class="row-ico" title="${sec ? sec.title : ''}">${sec ? raw(icon(sec.icon, 2)) : ''}</span>
<span class="row-main"><span class="row-title">${p.title}</span>${p.description ? html`<span class="row-desc">${p.description}</span>` : ''}</span>
<time class="row-date" datetime="${isoDate(p.date)}">${fmtDate(p.date)}</time>
</a></li>`;
}

export { escapeHtml };
