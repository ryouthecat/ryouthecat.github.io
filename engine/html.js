// Tiny auto-escaping HTML template tag.
//
//   html`<a href="${url}">${title}</a>`      → values are escaped
//   html`<ul>${items.map(i => html`<li>${i}</li>`)}</ul>`   → arrays / nested html are joined as-is
//   raw(markup)                              → trusted markup (already-rendered markdown, SVG …)

export class Raw {
  constructor(s) {
    this.s = s;
  }
  toString() {
    return this.s;
  }
}

export const raw = (s) => new Raw(String(s ?? ''));

const reNeedsEscape = /[&<>"']/;
const MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(s) {
  s = String(s);
  return reNeedsEscape.test(s) ? s.replace(/[&<>"']/g, (c) => MAP[c]) : s;
}

function val(v) {
  if (v === null || v === undefined || v === false || v === true) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) {
    let out = '';
    for (let i = 0; i < v.length; i++) out += val(v[i]);
    return out;
  }
  return escapeHtml(v);
}

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += val(values[i]) + strings[i + 1];
  return new Raw(out);
}

/** Escape for use inside XML (RSS / sitemap). */
export const escapeXml = escapeHtml;
