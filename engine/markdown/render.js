// HTML renderer. Default output follows the CommonMark reference renderer byte-for-byte for core syntax,
// so the engine can be checked against the official spec. The site layer overrides pieces through `hooks`.

import { esc, isUnsafeUrl } from './util.js';

/** Output buffer with the `cr()` (newline unless already at line start) helper used by the reference renderer. */
class Out {
  constructor() {
    this.buf = [];
    this.last = 10;
  }
  lit(s) {
    if (s.length === 0) return;
    this.buf.push(s);
    this.last = s.charCodeAt(s.length - 1);
  }
  cr() {
    if (this.last !== 10) {
      this.buf.push('\n');
      this.last = 10;
    }
  }
  toString() {
    return this.buf.join('');
  }
}

/** Plain text of an inline subtree (used for alt text, heading ids, search text). */
export function inlineText(node) {
  let s = '';
  for (let c = node.first; c; c = c.next) {
    switch (c.type) {
      case 'text':
      case 'code':
      case 'math_inline':
      case 'math_display':
        s += c.literal;
        break;
      case 'softbreak':
      case 'linebreak':
        s += ' ';
        break;
      case 'html_inline':
        break;
      default:
        if (c.first) s += inlineText(c);
    }
  }
  return s;
}

export class Renderer {
  /**
   * @param {{doc, env, footnotes, inline}} parsed  result of parseBlocks()
   * @param {object} options { hooks, html, softbreak }
   */
  constructor(parsed, options = {}) {
    this.doc = parsed.doc;
    this.env = parsed.env;
    this.footnotes = parsed.footnotes;
    this.inlineParser = parsed.inline;
    this.hooks = options.hooks || {};
    this.allowHtml = options.html !== false;
    this.softbreak = options.softbreak ?? '\n';
    this.ctx = {
      renderer: this,
      env: this.env,
      inline: (src) => this.inline(src),
      children: (node) => this.childrenToString(node),
      defaultBlock: (node) => {
        const o = new Out();
        this.blockDefault(node, o);
        return o.toString();
      },
      text: (src) => inlineText(this.inlineParser.parse(src)),
      esc,
    };
  }

  render() {
    const out = new Out();
    this.blocks(this.doc, out);
    this.footnoteSection(out);
    return out.toString();
  }

  // ── inline
  inline(src) {
    return this.inlineNodes(this.inlineParser.parse(src));
  }

  inlineNodes(root) {
    let s = '';
    for (let c = root.first; c; c = c.next) s += this.inlineNode(c);
    return s;
  }

  inlineNode(c) {
    const hook = this.hooks[c.type];
    if (hook) {
      const r = hook(c, this.ctx, this);
      if (r !== undefined && r !== null) return r;
    }
    switch (c.type) {
      case 'text':
        return esc(c.literal);
      case 'softbreak':
        return this.softbreak;
      case 'linebreak':
        return '<br />\n';
      case 'code':
        return '<code>' + esc(c.literal) + '</code>';
      case 'html_inline':
        return this.allowHtml ? c.literal : esc(c.literal);
      case 'emph':
        return '<em>' + this.inlineNodes(c) + '</em>';
      case 'strong':
        return '<strong>' + this.inlineNodes(c) + '</strong>';
      case 'del':
        return '<del>' + this.inlineNodes(c) + '</del>';
      case 'mark':
        return '<mark>' + this.inlineNodes(c) + '</mark>';
      case 'link': {
        const href = isUnsafeUrl(c.dest) ? '' : c.dest;
        return `<a href="${esc(href)}"${c.title ? ` title="${esc(c.title)}"` : ''}>${this.inlineNodes(c)}</a>`;
      }
      case 'image': {
        const src = isUnsafeUrl(c.dest) ? '' : c.dest;
        return `<img src="${esc(src)}" alt="${esc(inlineText(c))}"${c.title ? ` title="${esc(c.title)}"` : ''} />`;
      }
      case 'footnote_ref': {
        const id = encodeURIComponent(c.label);
        return `<sup class="footnote-ref"><a href="#fn-${id}" id="fnref-${id}${c.refIdx > 1 ? '-' + c.refIdx : ''}">${c.num}</a></sup>`;
      }
      case 'math_inline':
        return `<span class="math math-inline">${esc(c.literal)}</span>`;
      case 'math_display':
        return `<span class="math math-display">${esc(c.literal)}</span>`;
      default:
        return '';
    }
  }

  // ── blocks
  childrenToString(node) {
    const out = new Out();
    this.blocks(node, out);
    return out.toString();
  }

  blocks(node, out) {
    const kids = node.children;
    for (let i = 0; i < kids.length; i++) this.block(kids[i], out);
  }

  block(node, out) {
    const hook = this.hooks[node.type];
    if (hook) {
      const r = hook(node, this.ctx, this);
      if (r !== undefined && r !== null) {
        out.cr();
        out.lit(r);
        out.cr();
        return;
      }
    }
    this.blockDefault(node, out);
  }

  blockDefault(node, out) {
    switch (node.type) {
      case 'paragraph': {
        const parent = node.parent;
        const grand = parent && parent.parent;
        if (parent && parent.type === 'item' && grand && grand.listData && grand.listData.tight) {
          out.lit(this.inline(node.content));
          return;
        }
        out.cr();
        out.lit('<p>' + this.inline(node.content) + '</p>');
        out.cr();
        return;
      }
      case 'heading':
        out.cr();
        out.lit(`<h${node.level}>${this.inline(node.content)}</h${node.level}>`);
        out.cr();
        return;
      case 'thematic_break':
        out.cr();
        out.lit('<hr />');
        out.cr();
        return;
      case 'code_block': {
        const lang = node.info ? node.info.split(/\s+/)[0] : '';
        out.cr();
        out.lit(`<pre><code${lang ? ` class="language-${esc(lang)}"` : ''}>${esc(node.literal)}</code></pre>`);
        out.cr();
        return;
      }
      case 'html_block':
        out.cr();
        out.lit(this.allowHtml ? node.literal : esc(node.literal));
        out.cr();
        return;
      case 'block_quote':
        out.cr();
        out.lit('<blockquote>');
        out.cr();
        this.blocks(node, out);
        out.cr();
        out.lit('</blockquote>');
        out.cr();
        return;
      case 'alert': {
        const title = node.title ? this.inline(node.title) : esc(node.kind.charAt(0).toUpperCase() + node.kind.slice(1));
        out.cr();
        out.lit(`<div class="alert alert-${esc(node.kind)}"><p class="alert-title">${title}</p>`);
        out.cr();
        this.blocks(node, out);
        out.cr();
        out.lit('</div>');
        out.cr();
        return;
      }
      case 'container': {
        out.cr();
        if (node.name === 'details') {
          out.lit(`<details${node.expanded ? ' open' : ''}><summary>${this.inline(node.title || 'Details')}</summary>`);
          out.cr();
          this.blocks(node, out);
          out.cr();
          out.lit('</details>');
        } else {
          out.lit(`<div class="container container-${esc(node.name)}">`);
          if (node.title) out.lit(`<p class="container-title">${this.inline(node.title)}</p>`);
          out.cr();
          this.blocks(node, out);
          out.cr();
          out.lit('</div>');
        }
        out.cr();
        return;
      }
      case 'list': {
        const d = node.listData;
        const tag = d.type === 'bullet' ? 'ul' : 'ol';
        out.cr();
        out.lit(`<${tag}${tag === 'ol' && d.start !== 1 ? ` start="${d.start}"` : ''}>`);
        out.cr();
        this.blocks(node, out);
        out.cr();
        out.lit(`</${tag}>`);
        out.cr();
        return;
      }
      case 'item': {
        if (node.task) {
          out.lit(`<li class="task"><input type="checkbox" disabled${node.task === 'done' ? ' checked' : ''} /> `);
        } else out.lit('<li>');
        this.blocks(node, out);
        out.lit('</li>');
        out.cr();
        return;
      }
      case 'table': {
        const al = (i) => (node.aligns[i] ? ` align="${node.aligns[i]}"` : '');
        const n = node.aligns.length;
        let s = '<table>\n<thead>\n<tr>\n';
        for (let i = 0; i < n; i++) s += `<th${al(i)}>${this.inline(node.head[i] || '')}</th>\n`;
        s += '</tr>\n</thead>\n';
        if (node.rows.length) {
          s += '<tbody>\n';
          for (const row of node.rows) {
            s += '<tr>\n';
            for (let i = 0; i < n; i++) s += `<td${al(i)}>${this.inline(row[i] || '')}</td>\n`;
            s += '</tr>\n';
          }
          s += '</tbody>\n';
        }
        s += '</table>';
        out.cr();
        out.lit(s);
        out.cr();
        return;
      }
      case 'math_block':
        out.cr();
        out.lit(`<div class="math math-display">${esc(node.literal)}</div>`);
        out.cr();
        return;
      case 'footnote':
        return; // rendered at the end of the document
      default:
        this.blocks(node, out);
    }
  }

  footnoteSection(out) {
    const refs = this.env.noteRefs;
    if (!refs || refs.order.length === 0) return;
    const hook = this.hooks.footnotes;
    let items = '';
    for (const entry of refs.order) {
      const def = this.footnotes.get(entry.id);
      if (!def) continue;
      const id = encodeURIComponent(entry.id);
      let inner = this.childrenToString(def);
      let back = '';
      for (let i = 1; i <= entry.count; i++) {
        back += `<a href="#fnref-${id}${i > 1 ? '-' + i : ''}" class="footnote-back" aria-label="Back to reference ${entry.num}">↩</a>`;
      }
      if (inner.endsWith('</p>\n')) inner = inner.slice(0, -5) + ' ' + back + '</p>\n';
      else inner += back;
      items += `<li id="fn-${id}">\n${inner}</li>\n`;
    }
    if (!items) return;
    const html = `<section class="footnotes" role="doc-endnotes">\n<ol>\n${items}</ol>\n</section>`;
    out.cr();
    out.lit(hook ? hook(html, this.ctx, this) ?? html : html);
    out.cr();
  }
}
