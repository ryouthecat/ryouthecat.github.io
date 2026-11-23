// Public API of the markdown engine.
//
//   import { render, parse, renderParsed } from './markdown/index.js'
//   const html = render('# Hello *world*');
//
// options: { math, tables, footnotes, containers, alerts, linkify, html, softbreak, hooks }

import { parseBlocks } from './block.js';
import { Renderer, inlineText } from './render.js';

export { inlineText };
export { esc, slugify, slugifyPath } from './util.js';

/** Parse markdown into a block tree (no HTML yet). */
export function parse(src, options = {}) {
  return parseBlocks(src, options);
}

/** Render a parsed document to HTML. */
export function renderParsed(parsed, options = {}) {
  return new Renderer(parsed, options).render();
}

/** One-shot: markdown string → HTML string. */
export function render(src, options = {}) {
  return renderParsed(parseBlocks(src, options), options);
}

/** Render a single line/fragment of inline markdown (titles, descriptions). */
export function renderInline(src, options = {}) {
  const parsed = parseBlocks('', options);
  return new Renderer(parsed, options).inline(src);
}
