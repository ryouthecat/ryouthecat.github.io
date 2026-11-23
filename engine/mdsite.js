// Site-specific markdown rendering: wires the generic markdown engine to the theme
// (code blocks, heading anchors, figures, callouts, links, tables) and extracts page metadata.

import { existsSync } from 'node:fs';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { parse, renderParsed, inlineText, esc, slugify } from './markdown/index.js';
import { highlight, normalizeLang, LANG_LABELS } from './highlight/index.js';
import { imageInfo } from './imgsize.js';

const CALLOUT_LABEL = { note: 'Note', tip: 'Tip', important: 'Important', warning: 'Warning', caution: 'Caution' };
const CALLOUT_GLYPH = { note: 'i', tip: '+', important: '!', warning: '▲', caution: '✕' };
const CALLOUT_ALIAS = { info: 'note', hint: 'tip', success: 'tip', danger: 'caution', error: 'caution', bug: 'caution', example: 'note', todo: 'note' };

const reLocal = /^(?![a-z][a-z0-9+.-]*:|#|\/\/)/i;
const reExternal = /^https?:\/\//i;

function parseFenceInfo(info) {
  const out = { lang: '', title: '', lines: new Set(), nolines: false, nocopy: false };
  let rest = info.trim();
  const m = /^([^\s{]+)/.exec(rest);
  if (m) {
    out.lang = m[1];
    rest = rest.slice(m[0].length);
  }
  rest = rest.replace(/\btitle=(?:"([^"]*)"|'([^']*)'|(\S+))/, (_, a, b, c) => {
    out.title = a ?? b ?? c ?? '';
    return '';
  });
  rest = rest.replace(/\{([\d,\-\s]+)\}/, (_, spec) => {
    for (const part of spec.split(',')) {
      const [a, b] = part.split('-').map((x) => parseInt(x, 10));
      if (Number.isNaN(a)) continue;
      for (let i = a; i <= (Number.isNaN(b) ? a : b); i++) out.lines.add(i);
    }
    return '';
  });
  if (/\bnolines\b/.test(rest)) out.nolines = true;
  if (/\bnocopy\b/.test(rest)) out.nocopy = true;
  return out;
}

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function calloutHtml(kindRaw, titleHtml, bodyHtml, fold) {
  const kind = CALLOUT_LABEL[kindRaw] ? kindRaw : CALLOUT_ALIAS[kindRaw] || 'note';
  const glyph = CALLOUT_GLYPH[kind];
  const head = `<span class="ci" aria-hidden="true">${glyph}</span><span class="ct">${titleHtml}</span>`;
  if (fold) {
    return `<details class="callout callout-${kind}"${fold === '+' ? ' open' : ''}><summary class="callout-title">${head}</summary><div class="callout-body">${bodyHtml}</div></details>`;
  }
  return `<aside class="callout callout-${kind}"><p class="callout-title">${head}</p><div class="callout-body">${bodyHtml}</div></aside>`;
}

/**
 * Render a markdown body for a page.
 * @param {string} body
 * @param {object} opts { page, cfg, fileUrls: Map<absPath,url>, warn(msg) }
 */
export function renderMarkdown(body, { page, cfg, fileUrls, warn }) {
  const stats = { math: false, code: false, codeChars: 0 };
  const headings = [];
  const usedIds = new Map();
  const base = cfg.base || '';

  const uniqueId = (text) => {
    const slug = slugify(text);
    const n = usedIds.get(slug) || 0;
    usedIds.set(slug, n + 1);
    return n === 0 ? slug : `${slug}-${n}`;
  };

  const assetPath = (src) => {
    const clean = decodeURI(src.split(/[?#]/)[0]);
    if (clean.startsWith('/')) return join(cfg.root, 'static', clean);
    return page.dir ? join(page.dir, clean) : join(dirname(page.srcAbs), clean);
  };

  const mapUrl = (href) => {
    if (href.startsWith('/') && !href.startsWith('//')) return base + href;
    return href;
  };

  const hooks = {
    heading(node, ctx, renderer) {
      const root = renderer.inlineParser.parse(node.content);
      const inner = renderer.inlineNodes(root);
      const plain = inlineText(root);
      const id = uniqueId(plain);
      headings.push({ level: node.level, id, text: plain });
      return `<h${node.level} id="${esc(id)}">${inner}<a class="hl" href="#${esc(id)}" aria-label="Permalink to this section">#</a></h${node.level}>`;
    },

    code_block(node) {
      stats.code = true;
      const info = parseFenceInfo(node.info || '');
      const code = node.literal.replace(/\n$/, '');
      stats.codeChars += code.length;
      const key = normalizeLang(info.lang);
      const lines = (key && highlight(code, info.lang)) || code.split('\n').map(esc);
      const label = key ? LANG_LABELS[key] : '';
      let body = '';
      for (let i = 0; i < lines.length; i++) {
        body += `<span class="ln${info.lines.has(i + 1) ? ' h' : ''}">${lines[i]}\n</span>`;
      }
      const long = lines.length > (cfg.codeCollapseLines || 36);
      const attrs = `${key ? ` data-lang="${key}"` : ''}${long ? ' data-long' : ''}${info.nolines ? ' data-nolines' : ''}`;
      const head =
        label || info.title || !info.nocopy
          ? `<figcaption>${label ? `<span class="cl">${esc(label)}</span>` : ''}${info.title ? `<span class="ctitle">${esc(info.title)}</span>` : ''}<span class="cs"></span>${long ? `<button class="cx" type="button" data-expand>${lines.length} lines</button>` : ''}${info.nocopy ? '' : '<button class="cp" type="button" data-copy aria-label="Copy code">Copy</button>'}</figcaption>`
          : '';
      return `<figure class="code"${attrs}>${head}<pre tabindex="0"><code>${body}</code></pre></figure>`;
    },

    paragraph(node, ctx, renderer) {
      if (!/^\s*\[?!\[/.test(node.content)) return undefined;
      const root = renderer.inlineParser.parse(node.content);
      const only = root.first && root.first === root.last ? root.first : null;
      const img = only && (only.type === 'image' ? only : only.type === 'link' && only.first && only.first === only.last && only.first.type === 'image' ? only.first : null);
      if (!img) return undefined;
      const html = renderer.inlineNodes(root);
      return `<figure class="fig">${html}${img.title ? `<figcaption>${esc(img.title)}</figcaption>` : ''}</figure>`;
    },

    image(node) {
      const alt = inlineText(node);
      let src = node.dest;
      const attrs = node.attrs || {};
      let dims = '';
      if (reLocal.test(src) || src.startsWith('/')) {
        const info = imageInfo(assetPath(src));
        if (!info) warn(`image not found: ${src}`);
        else if (info.size) dims = ` width="${info.size.width}" height="${info.size.height}"`;
        src = mapUrl(src);
      }
      let style = '';
      if (attrs.width) style = `width:${/^\d+$/.test(attrs.width) ? attrs.width + 'px' : esc(attrs.width)}`;
      const cls = attrs.class ? ` class="${esc(attrs.class)}"` : '';
      return `<img src="${esc(src)}" alt="${esc(alt)}"${dims} loading="lazy" decoding="async"${cls}${style ? ` style="${style}"` : ''}>`;
    },

    link(node, ctx, renderer) {
      let href = node.dest;
      const inner = renderer.inlineNodes(node);
      const title = node.title ? ` title="${esc(node.title)}"` : '';
      if (/^(?:javascript|vbscript|file|data):/i.test(href)) href = '';
      let extra = '';
      if (reExternal.test(href) && !(cfg.url && href.startsWith(cfg.url))) {
        extra = ' class="ext" rel="noopener noreferrer" target="_blank"';
      } else if (reLocal.test(href) && href) {
        const [pathPart, hash] = href.split('#');
        if (/\.md$/i.test(pathPart)) {
          const target = resolvePath(dirname(page.srcAbs), decodeURI(pathPart));
          const url = fileUrls.get(target);
          if (url) href = base + url + (hash ? '#' + hash : '');
          else warn(`link to unknown markdown file: ${node.dest}`);
        } else if (pathPart && /\.[a-z0-9]{1,5}$/i.test(pathPart) && !existsSync(assetPath(pathPart))) {
          warn(`broken relative link: ${node.dest}`);
        }
        if (pathPart.startsWith('/') && !/\.md$/i.test(pathPart)) href = mapUrl(href);
      } else if (href.startsWith('/') && !href.startsWith('//')) {
        href = base + href;
      }
      return `<a href="${esc(href)}"${title}${extra}>${inner}</a>`;
    },

    alert(node, ctx, renderer) {
      const titleHtml = node.title ? renderer.inline(node.title) : esc(CALLOUT_LABEL[node.kind] || capitalize(node.kind));
      return calloutHtml(node.kind, titleHtml, ctx.children(node), node.fold);
    },

    container(node, ctx, renderer) {
      if (node.name === 'details' || node.name === 'fold') {
        return `<details class="fold"${node.expanded ? ' open' : ''}><summary>${renderer.inline(node.title || 'Details')}</summary><div class="fold-body">${ctx.children(node)}</div></details>`;
      }
      if (CALLOUT_LABEL[node.name] || CALLOUT_ALIAS[node.name]) {
        const titleHtml = node.title ? renderer.inline(node.title) : esc(CALLOUT_LABEL[node.name] || capitalize(node.name));
        return calloutHtml(node.name, titleHtml, ctx.children(node), '');
      }
      return undefined;
    },

    table(node, ctx) {
      return `<div class="tbl">${ctx.defaultBlock(node)}</div>`;
    },

    math_inline() {
      stats.math = true;
      return undefined;
    },
    math_display() {
      stats.math = true;
      return undefined;
    },
    math_block() {
      stats.math = true;
      return undefined;
    },
  };

  const options = { math: !!page.math, hooks };
  const parsed = parse(body, options);
  const html = renderParsed(parsed, options);

  // plain text (without code) for search, summary and reading time
  const prose = html
    .replace(/<figure class="code"[\s\S]*?<\/figure>/g, ' ')
    .replace(/<a class="hl"[^>]*>#<\/a>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(?:amp|lt|gt|quot|#39);/g, (m) => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" })[m])
    .replace(/\s+/g, ' ')
    .trim();
  const words = prose ? prose.split(' ').length : 0;
  const codeWords = Math.round(stats.codeChars / 6);

  let summary = '';
  const p = /<p>([\s\S]*?)<\/p>/.exec(html.replace(/<figure[\s\S]*?<\/figure>/g, '').replace(/<aside[\s\S]*?<\/aside>/g, ''));
  if (p) {
    summary = p[1]
      .replace(/<[^>]+>/g, '')
      .replace(/&(?:amp|lt|gt|quot|#39);/g, (m) => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" })[m])
      .replace(/\s+/g, ' ')
      .trim();
    if (summary.length > 170) summary = summary.slice(0, 167).replace(/\s+\S*$/, '') + '…';
  }

  return { html, headings, prose, words, codeWords, hasMath: stats.math, hasCode: stats.code, summary };
}
