// Page templates. Each takes the `site` data object (see engine/build.js) and returns a full HTML document.

import { html, raw, escapeHtml } from '../engine/html.js';
import { icon } from '../engine/pixel.js';
import { layout, postRow, tagChip, sectionBadge, socialIcon, fmtDate, isoDate, readMinutes } from './layout.js';

const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;

/** Group posts (already sorted newest-first) by year. */
function byYear(posts) {
  const groups = [];
  for (const p of posts) {
    const y = p.date.getUTCFullYear();
    const g = groups[groups.length - 1];
    if (g && g.year === y) g.posts.push(p);
    else groups.push({ year: y, posts: [p] });
  }
  return groups;
}

function archive(site, posts) {
  return html`${byYear(posts).map(
    (g) => html`<section class="year"><h2 class="year-h">${g.year}<span>${plural(g.posts.length, 'post')}</span></h2><ol class="rows">${g.posts.map((p) => postRow(site, p, 'archive'))}</ol></section>`,
  )}`;
}

// ── home ───────────────────────────────────────────────────────────────────
export function home(site) {
  const { cfg } = site;
  const pr = cfg.profile;
  const latest = site.posts.slice(0, cfg.homeLatest);
  const body = html`<div class="scene" aria-hidden="true">${raw(site.scene)}<span class="meteor m1"></span><span class="meteor m2"></span><span class="meteor m3"></span><span class="meteor m4"></span></div>
<div class="wrap">
<section class="intro" aria-labelledby="hello">
<div class="avatar"><img src="${site.href(pr.avatar)}" width="112" height="112" alt="${pr.name}" fetchpriority="high" decoding="async"><span class="status"><i></i>online</span></div>
<div class="intro-text">
<h1 id="hello" class="display">${pr.name}</h1>
<p class="tagline">${pr.tagline}</p>
<p class="lede">${pr.headline}</p>
<p class="socials">${cfg.social.map((s) => html`<a class="btn" href="${s.href}"${/^https?:/.test(s.href) ? raw(' rel="noopener" target="_blank"') : ''}>${raw(socialIcon(s.name))}<span>${s.name}</span></a>`)}</p>
</div>
</section>

<section class="block" aria-labelledby="latest">
<header class="block-head"><h2 id="latest" class="sec-title">Latest posts</h2><a class="more" href="${site.href('/posts/')}">All posts <span aria-hidden="true">→</span></a></header>
<ol class="rows">${latest.map((p) => postRow(site, p, 'home'))}</ol>
</section>

<section class="block" aria-labelledby="worlds">
<header class="block-head"><h2 id="worlds" class="sec-title">Worlds</h2></header>
<div class="cards">${site.sections.map(
    (s) => html`<a class="card" href="${site.href(s.url)}"><span class="card-ico">${raw(icon(s.icon, 3))}</span><span class="card-t">${s.title}</span><span class="card-n">${plural(s.posts.length, 'post')}</span><span class="card-go" aria-hidden="true">→</span><span class="card-d">${s.description}</span></a>`,
  )}</div>
</section>

${site.tags.length
    ? html`<section class="block" aria-labelledby="tagsh">
<header class="block-head"><h2 id="tagsh" class="sec-title">Tags</h2><a class="more" href="${site.href('/tags/')}">All tags <span aria-hidden="true">→</span></a></header>
<p class="chips">${site.tags.slice(0, 14).map((t) => tagChip(site, t, t.posts.length))}</p>
</section>`
    : ''}
</div>`;
  return layout(site, { title: cfg.title, description: cfg.description, path: '/', body, bodyClass: 'home' });
}

// ── /posts/ and /posts/<section>/ ──────────────────────────────────────────
function listPage(site, { title, heading, lead, path, posts, section }) {
  const tabs = html`<nav class="tabs" aria-label="Sections"><a href="${site.href('/posts/')}"${!section ? raw(' aria-current="page"') : ''}>All <b>${site.posts.length}</b></a>${site.sections.map(
    (s) => html`<a href="${site.href(s.url)}"${section && section.key === s.key ? raw(' aria-current="page"') : ''}><span class="tab-ico">${raw(icon(s.icon, 1.25))}</span>${s.title} <b>${s.posts.length}</b></a>`,
  )}</nav>`;
  const body = html`<div class="wrap">
<header class="page-head">
<div class="page-title-row">${section ? html`<span class="page-ico">${raw(icon(section.icon, 3))}</span>` : ''}<h1 class="display">${heading}</h1></div>
<p class="lead">${lead}</p>
</header>
${tabs}
${posts.length ? archive(site, posts) : html`<p class="empty">No posts yet — the world is still being generated.</p>`}
</div>`;
  return layout(site, { title, description: lead, path, body });
}

export const postsIndex = (site) =>
  listPage(site, { title: 'Posts', heading: 'Posts', lead: `${plural(site.posts.length, 'write-up')} on reverse engineering, pwn and CTFs.`, path: '/posts/', posts: site.posts });

export const sectionPage = (site, section) =>
  listPage(site, { title: section.title, heading: section.title, lead: section.description || `${plural(section.posts.length, 'post')}.`, path: section.url, posts: section.posts, section });

// ── tags ───────────────────────────────────────────────────────────────────
export function tagsIndex(site) {
  const body = html`<div class="wrap">
<header class="page-head"><h1 class="display">Tags</h1><p class="lead">${plural(site.tags.length, 'tag')} — things I keep coming back to.</p></header>
<div class="tag-cards">${site.tags.map((t) => {
    const latest = t.posts[0];
    return html`<a class="card tag-card" href="${site.href(t.url)}"><span class="tag-head"><span class="tag-name"><span class="hash">#</span>${t.name}</span><span class="tag-count">${plural(t.posts.length, 'post')}</span></span><span class="card-go" aria-hidden="true">→</span>${latest ? html`<span class="tag-latest">${latest.title}</span>` : ''}</a>`;
  })}</div>
</div>`;
  return layout(site, { title: 'Tags', description: 'All tags.', path: '/tags/', body });
}

export function tagPage(site, tag) {
  const body = html`<div class="wrap">
<header class="page-head">
<nav class="crumbs" aria-label="Breadcrumb"><a href="${site.href('/tags/')}">Tags</a><span aria-hidden="true">›</span><span>#${tag.name}</span></nav>
<h1 class="display"><span class="hash">#</span>${tag.name}</h1>
<p class="lead">${plural(tag.posts.length, 'post')} tagged <b>${tag.name}</b>.</p>
</header>
${archive(site, tag.posts)}
</div>`;
  return layout(site, { title: `#${tag.name}`, description: `Posts tagged ${tag.name}.`, path: tag.url, body });
}

// ── a post ─────────────────────────────────────────────────────────────────
function tocHtml(site, headings, min = 2, max = 4) {
  const items = headings.filter((h) => h.level >= min && h.level <= max);
  if (items.length < 2) return '';
  const stack = [];
  let out = '';
  for (const h of items) {
    if (stack.length === 0) {
      out += '<ol>';
      stack.push(h.level);
    } else if (h.level > stack[stack.length - 1]) {
      out += '<ol>';
      stack.push(h.level);
    } else {
      while (stack.length && h.level < stack[stack.length - 1]) {
        out += '</li></ol>';
        stack.pop();
      }
      if (!stack.length) {
        out += '<ol>';
        stack.push(h.level);
      } else out += '</li>';
    }
    out += `<li><a href="#${escapeHtml(h.id)}">${escapeHtml(h.text)}</a>`;
  }
  while (stack.length) {
    out += '</li></ol>';
    stack.pop();
  }
  return out;
}

function relatedPosts(site, p, limit = 3) {
  const tagSet = new Set((p.tags || []).map((t) => t.slug));
  const scored = [];
  for (const other of site.posts) {
    if (other.url === p.url) continue;
    let score = other.section && other.section === p.section ? 1 : 0;
    for (const t of other.tags || []) {
      if (tagSet.has(t.slug)) score += 3;
    }
    if (score > 0) scored.push({ post: other, score });
  }
  scored.sort((a, b) => b.score - a.score || b.post.date - a.post.date);
  return scored.slice(0, limit).map((x) => x.post);
}

export function postPage(site, p) {
  const { cfg } = site;
  const mins = readMinutes(p, cfg);
  const toc = p.toc ? tocHtml(site, p.headings, cfg.toc?.min ?? 2, cfg.toc?.max ?? 4) : '';
  const desc = p.description || p.summary;
  const related = relatedPosts(site, p, 3);
  const relatedBlock = related.length
    ? html`<section class="related" aria-labelledby="rel-h"><h2 id="rel-h" class="rel-title">Related posts</h2><ol class="rows">${related.map((r) => postRow(site, r, 'home'))}</ol></section>`
    : '';
  const pager = html`${p.older || p.newer
    ? html`<nav class="pager" aria-label="More posts">${p.older ? html`<a class="slot prev" href="${site.href(p.older.url)}" rel="prev"><span class="dir">← Older</span><span class="t">${p.older.title}</span></a>` : html`<span></span>`}${p.newer
        ? html`<a class="slot next" href="${site.href(p.newer.url)}" rel="next"><span class="dir">Newer →</span><span class="t">${p.newer.title}</span></a>`
        : html`<span></span>`}</nav>`
    : ''}`;
  const body = html`<article class="post">
<div class="post-grid${toc ? ' has-toc' : ''}">
<header class="post-head">
<nav class="crumbs" aria-label="Breadcrumb"><a href="${site.href('/posts/')}">Posts</a><span aria-hidden="true">›</span>${p.sectionInfo ? html`<a href="${site.href(p.sectionInfo.url)}">${p.sectionInfo.title}</a>` : ''}${p.draft ? html`<span class="draft">draft</span>` : ''}</nav>
<h1 class="post-title">${p.title}</h1>
${desc ? html`<p class="post-desc">${desc}</p>` : ''}
<div class="post-meta">
<time datetime="${isoDate(p.date)}">${fmtDate(p.date)}</time>
${p.updated ? html`<span>updated <time datetime="${isoDate(p.updated)}">${fmtDate(p.updated)}</time></span>` : ''}
<span>${mins} min read</span>
${sectionBadge(site, p.sectionInfo)}
</div>
${p.tags.length ? html`<p class="chips">${p.tags.map((t) => tagChip(site, t))}</p>` : ''}
</header>
${toc ? html`<details class="toc" open><summary>Contents</summary>${raw(toc)}</details>` : ''}
<div class="prose">${raw(p.html)}</div>
${relatedBlock}
${pager}
</div>
</article>`;

  const jsonld = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: p.title,
    description: desc,
    image: site.abs(p.ogImage || site.assets.ogDefault || cfg.profile.avatar),
    datePublished: isoDate(p.date),
    dateModified: isoDate(p.updated || p.date),
    author: { '@type': 'Person', name: cfg.author },
    mainEntityOfPage: site.abs(p.url),
    keywords: p.tags.map((t) => t.name).join(', '),
  }).replace(/</g, '\\u003c');

  const scripts = p.hasMath ? [site.assets.mathJs] : [];
  return layout(site, { title: p.title, description: desc, path: p.url, body, type: 'article', scripts, jsonld, bodyClass: 'is-post', ogImage: p.ogImage });
}

// ── generic page (About …) ─────────────────────────────────────────────────
export function genericPage(site, p) {
  const { cfg } = site;
  const isAbout = p.url === '/about/' && cfg.profile;
  const pr = cfg.profile;
  const body = isAbout
    ? html`<div class="wrap wrap-narrow">
<section class="about-head">
<div class="avatar avatar-inline"><img src="${site.href(pr.avatar)}" width="88" height="88" alt="${pr.name}" decoding="async"><span class="status"><i></i>online</span></div>
<div class="about-meta">
<h1 class="display">${p.title}</h1>
<p class="tagline">${pr.tagline}</p>
${cfg.social && cfg.social.length ? html`<p class="socials">${cfg.social.map((s) => html`<a class="btn" href="${s.href}"${/^https?:/.test(s.href) ? raw(' rel="noopener" target="_blank"') : ''}>${raw(socialIcon(s.name))}<span>${s.name}</span></a>`)}</p>` : ''}
</div>
</section>
<div class="about-body prose">${raw(p.html)}</div>
</div>`
    : html`<div class="wrap wrap-narrow">
<header class="page-head"><h1 class="display">${p.title}</h1>${p.description ? html`<p class="lead">${p.description}</p>` : ''}</header>
<div class="prose">${raw(p.html)}</div>
</div>`;
  return layout(site, { title: p.title, description: p.description || p.summary, path: p.url, body, scripts: p.hasMath ? [site.assets.mathJs] : [] });
}

// ── search ─────────────────────────────────────────────────────────────────
export function searchPage(site) {
  const topTags = site.tags.slice(0, 7);
  const body = html`<div class="wrap wrap-narrow">
<header class="page-head"><h1 class="display">Search</h1><p class="lead">Titles, tags and full text. Press <kbd>/</kbd> or <kbd>Ctrl+K</kbd> anywhere to search.</p></header>
<form class="search" role="search" onsubmit="return false"><label class="sr" for="q">Search posts</label><div class="search-box"><span class="search-ico" aria-hidden="true">${raw(icon('search', 2))}</span><input id="q" type="search" placeholder="chacha20, relocation, simd…" autocomplete="off" autocapitalize="off" spellcheck="false" data-index="${site.assets.searchIndex}" aria-controls="results"></div><label class="search-option"><input id="include-code" type="checkbox"> Include code</label></form>
${topTags.length ? html`<div id="search-suggest" class="search-suggest" aria-label="Quick topics"><span class="suggest-label">Topics</span>${topTags.map((t) => html`<button type="button" class="chip suggest-chip" data-q="${t.name}"><span class="hash">#</span>${t.name}<b>${t.posts.length}</b></button>`)}</div>` : ''}
<p id="search-status" class="search-status" aria-live="polite"></p>
<button id="search-retry" class="btn" type="button" hidden>Try again</button>
<ol id="results" class="rows results"></ol>
<noscript><p class="empty">Search needs JavaScript. You can also browse <a href="${site.href('/posts/')}">all posts</a> or <a href="${site.href('/tags/')}">tags</a>.</p></noscript>
</div>`;
  return layout(site, { title: 'Search', description: 'Search the blog.', path: '/search/', body, scripts: [site.assets.searchJs] });
}

// ── 404 ────────────────────────────────────────────────────────────────────
export function notFound(site) {
  const body = html`<div class="wrap wrap-narrow notfound">
<div class="nf-face">${raw(icon('creeper', 8))}</div>
<h1 class="display">404</h1>
<p class="lead">Ssssss… this chunk hasn't been generated yet.</p>
<p class="nf-actions"><a class="btn btn-primary" href="${site.href('/')}">Back to spawn</a> <a class="btn" href="${site.href('/posts/')}">Browse posts</a></p>
</div>`;
  return layout(site, { title: 'Page not found', description: 'This page does not exist.', path: '/404.html', body, noindex: true });
}

/** Tiny HTML redirect page for old URLs. */
export function redirectPage(site, to) {
  const href = site.href(to);
  return `<!doctype html><html lang="${site.cfg.lang}"><head><meta charset="utf-8"><title>Redirecting…</title><meta name="robots" content="noindex"><link rel="canonical" href="${escapeHtml(site.abs(to))}"><meta http-equiv="refresh" content="0; url=${escapeHtml(href)}"></head><body><p>Moved to <a href="${escapeHtml(href)}">${escapeHtml(href)}</a>.</p></body></html>`;
}
