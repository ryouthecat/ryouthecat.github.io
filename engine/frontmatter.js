// Front matter reader: a pragmatic YAML subset (everything blog posts actually use).
//
//   title: "Hello"            quoted / unquoted strings, numbers, true/false/null
//   tags: [a, "b c"]          flow sequences
//   tags:                     block sequences
//     - a
//   cover:                    nested maps (any depth, indentation based)
//     image: x.png
//   summary: >                folded / literal block scalars
//     text...

const reFrontMatter = /^---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/;

export function parseFrontMatter(src) {
  if (src.charCodeAt(0) === 0xfeff) src = src.slice(1);
  const m = reFrontMatter.exec(src);
  if (!m) return { data: {}, body: src, bodyOffsetLines: 0 };
  const consumed = m[0];
  return {
    data: parseYaml(m[1] || ''),
    body: src.slice(consumed.length),
    bodyOffsetLines: consumed.split('\n').length - 1,
  };
}

const reKey = /^(?:"([^"]+)"|'([^']+)'|([^\s:#"'][^:#]*?))\s*:(?:\s+(.*)|\s*)$/;

export function parseYaml(text) {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\t/g, '  '));
  const ctx = { lines, i: 0 };
  return parseMap(ctx, indentAt(ctx));
}

function isSkippable(line) {
  return line === undefined ? false : /^\s*(?:#.*)?$/.test(line);
}
function indentAt(ctx) {
  skipBlank(ctx);
  const l = ctx.lines[ctx.i];
  return l === undefined ? 0 : l.length - l.trimStart().length;
}
function skipBlank(ctx) {
  while (ctx.i < ctx.lines.length && isSkippable(ctx.lines[ctx.i])) ctx.i++;
}

function parseMap(ctx, indent) {
  const obj = {};
  for (;;) {
    skipBlank(ctx);
    if (ctx.i >= ctx.lines.length) break;
    const line = ctx.lines[ctx.i];
    const ind = line.length - line.trimStart().length;
    if (ind < indent) break;
    if (ind > indent) {
      ctx.i++; // stray over-indented line
      continue;
    }
    const m = reKey.exec(line.trim());
    if (!m) {
      ctx.i++;
      continue;
    }
    const key = m[1] ?? m[2] ?? m[3].trim();
    const rest = m[4] === undefined ? '' : m[4].trim();
    ctx.i++;
    if (rest === '' || rest.startsWith('#')) {
      skipBlank(ctx);
      const next = ctx.lines[ctx.i];
      if (next !== undefined) {
        const nind = next.length - next.trimStart().length;
        if (nind > indent && /^\s*-(?:\s|$)/.test(next)) obj[key] = parseList(ctx, nind);
        else if (nind > indent) obj[key] = parseMap(ctx, nind);
        else if (nind === indent && /^\s*-(?:\s|$)/.test(next)) obj[key] = parseList(ctx, nind);
        else obj[key] = null;
      } else obj[key] = null;
    } else if (/^[|>][+-]?$/.test(rest)) {
      obj[key] = parseBlockScalar(ctx, indent, rest[0] === '>');
    } else {
      obj[key] = parseScalar(rest);
    }
  }
  return obj;
}

function parseList(ctx, indent) {
  const arr = [];
  for (;;) {
    skipBlank(ctx);
    if (ctx.i >= ctx.lines.length) break;
    const line = ctx.lines[ctx.i];
    const ind = line.length - line.trimStart().length;
    if (ind !== indent || !/^\s*-(?:\s|$)/.test(line)) break;
    arr.push(parseScalar(line.trim().replace(/^-\s*/, '')));
    ctx.i++;
  }
  return arr;
}

function parseBlockScalar(ctx, indent, folded) {
  const out = [];
  let blockIndent = -1;
  while (ctx.i < ctx.lines.length) {
    const line = ctx.lines[ctx.i];
    if (line.trim() === '') {
      out.push('');
      ctx.i++;
      continue;
    }
    const ind = line.length - line.trimStart().length;
    if (ind <= indent) break;
    if (blockIndent < 0) blockIndent = ind;
    out.push(line.slice(Math.min(blockIndent, ind)));
    ctx.i++;
  }
  while (out.length && out[out.length - 1] === '') out.pop();
  return folded ? out.join(' ').replace(/ {2,}/g, ' ') : out.join('\n');
}

function stripComment(s) {
  let q = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '\\' && q === '"') i++;
      else if (c === q) q = '';
    } else if (c === '"' || c === "'") {
      if (i === 0 || /[\s[{,:]/.test(s[i - 1])) q = c;
    } else if (c === '#' && (i === 0 || /\s/.test(s[i - 1]))) return s.slice(0, i).trimEnd();
  }
  return s;
}

function unquote(s) {
  if (s[0] === '"') {
    return s.slice(1, -1).replace(/\\(["\\/nrt]|u[0-9a-fA-F]{4})/g, (m, c) => {
      if (c === 'n') return '\n';
      if (c === 'r') return '\r';
      if (c === 't') return '\t';
      if (c[0] === 'u') return String.fromCharCode(parseInt(c.slice(1), 16));
      return c;
    });
  }
  return s.slice(1, -1).replace(/''/g, "'");
}

function splitFlow(s) {
  const parts = [];
  let cur = '';
  let q = '';
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      cur += c;
      if (c === '\\' && q === '"') cur += s[++i] ?? '';
      else if (c === q) q = '';
    } else if (c === '"' || c === "'") {
      q = c;
      cur += c;
    } else if (c === '[' || c === '{') {
      depth++;
      cur += c;
    } else if (c === ']' || c === '}') {
      depth--;
      cur += c;
    } else if (c === ',' && depth === 0) {
      parts.push(cur.trim());
      cur = '';
    } else cur += c;
  }
  if (cur.trim() !== '') parts.push(cur.trim());
  return parts;
}

export function parseScalar(raw) {
  const s = stripComment(raw.trim());
  if (s === '') return '';
  if (s[0] === '"' && s.endsWith('"') && s.length > 1) return unquote(s);
  if (s[0] === "'" && s.endsWith("'") && s.length > 1) return unquote(s);
  if (s[0] === '[' && s.endsWith(']')) return splitFlow(s.slice(1, -1)).map(parseScalar);
  if (s[0] === '{' && s.endsWith('}')) {
    const obj = {};
    for (const part of splitFlow(s.slice(1, -1))) {
      const m = /^(["']?)(.+?)\1\s*:\s*(.*)$/.exec(part);
      if (m) obj[m[2]] = parseScalar(m[3]);
    }
    return obj;
  }
  if (s === 'true' || s === 'True') return true;
  if (s === 'false' || s === 'False') return false;
  if (s === 'null' || s === '~') return null;
  if (/^-?\d+(?:\.\d+)?$/.test(s)) return Number(s);
  return s;
}

/** Parse the many date notations authors use. Returns a Date or null. */
export function parseDate(v) {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (v === undefined || v === null || v === '') return null;
  let s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s += 'T00:00:00Z';
  else if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?$/.test(s)) s = s.replace(' ', 'T') + 'Z';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}
