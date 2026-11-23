// Conservative minifiers (no dependencies). They only remove what is provably safe.

const PROTECTED = /<(pre|script|style|textarea)\b[\s\S]*?<\/\1>/gi;
const BLOCK_TAGS =
  'address|article|aside|blockquote|body|br|caption|dd|details|div|dl|dt|fieldset|figcaption|figure|footer|form|h[1-6]|head|header|hr|html|li|link|main|meta|nav|noscript|ol|p|section|summary|table|tbody|td|tfoot|th|thead|title|tr|ul|script|style';
const reBeforeBlock = new RegExp(`\\s+(<\\/?(?:${BLOCK_TAGS})\\b)`, 'gi');
const reAfterBlock = new RegExp(`(<\\/?(?:${BLOCK_TAGS})\\b[^>]*>)\\s+`, 'gi');

export function minifyHtml(html) {
  const saved = [];
  let s = html.replace(PROTECTED, (m) => {
    saved.push(m);
    return `\u0000${saved.length - 1}\u0000`;
  });
  s = s
    .replace(/<!--(?!\[if)[\s\S]*?-->/g, '')
    .replace(/\s+/g, ' ')
    .replace(reBeforeBlock, '$1')
    .replace(reAfterBlock, '$1')
    .trim();
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => saved[i]);
}

export function minifyCss(css) {
  let out = '';
  const n = css.length;
  let i = 0;
  let pendingSpace = false;
  const push = (s) => {
    out += s;
  };
  while (i < n) {
    const c = css[i];
    // comments
    if (c === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      i = end === -1 ? n : end + 2;
      continue;
    }
    // strings
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && css[j] !== c) j += css[j] === '\\' ? 2 : 1;
      if (pendingSpace) push(' ');
      pendingSpace = false;
      push(css.slice(i, j + 1));
      i = j + 1;
      continue;
    }
    // url( ... ) unquoted
    if ((c === 'u' || c === 'U') && /^url\(/i.test(css.slice(i, i + 4)) && css[i + 4] !== '"' && css[i + 4] !== "'") {
      const end = css.indexOf(')', i);
      if (pendingSpace) push(' ');
      pendingSpace = false;
      push(css.slice(i, end + 1));
      i = end + 1;
      continue;
    }
    if (/\s/.test(c)) {
      pendingSpace = true;
      i++;
      continue;
    }
    if (pendingSpace) {
      const prev = out[out.length - 1];
      // no space needed after these, or before these
      if (!(prev === undefined || '{};,:>('.includes(prev) || '{};,>)'.includes(c))) push(' ');
      pendingSpace = false;
    }
    push(c);
    i++;
  }
  return out.replace(/;}/g, '}');
}

/**
 * Very conservative JS "minifier": drops whole-line comments, leading indentation and blank lines.
 * Client scripts in this repo are written to be safe under this (no multi-line template literals).
 */
export function minifyJs(js) {
  return js
    .replace(/^\s*\/\*[\s\S]*?\*\/\s*$/gm, '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('//'))
    .join('\n');
}
