// Check generated HTML against this build's output inventory, never stale files on disk.
import { posix } from 'node:path';
import { unescapeString } from './markdown/util.js';

export function inspectHtml(html) {
  const ids = new Set(), links = [];
  const source = html.replace(/<!--[\s\S]*?-->|<(script|style|textarea)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  for (const tag of source.matchAll(/<([a-z][\w:-]*)\b(?:"[^"]*"|'[^']*'|[^'">])*>/gi)) {
    const attrs = {};
    for (const a of tag[0].slice(tag[1].length + 1).matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
      attrs[a[1].toLowerCase()] = unescapeString(a[2] ?? a[3] ?? a[4] ?? '');
    }
    if (attrs.id) ids.add(attrs.id);
    if (tag[1].toLowerCase() === 'a') {
      if (attrs.name) ids.add(attrs.name);
      if (attrs.href) links.push(attrs.href);
    }
  }
  return { ids, links };
}

export function checkLinks(documents, files, cfg, redirects = new Map()) {
  const origin = new URL(cfg.url || 'https://local.invalid').origin;
  const base = cfg.base || '';
  const warnings = new Set();
  const inspected = new Map([...documents].map(([file, html]) => [file, inspectHtml(html)]));
  const locate = (path) => {
    const rel = path.replace(/^\//, '');
    if (files.has(rel)) return rel;
    const index = posix.join(rel, 'index.html');
    return files.has(index) ? index : null;
  };
  for (const [file, doc] of inspected) {
    const page = file.endsWith('index.html') ? file.slice(0, -10) : file;
    for (const href of doc.links) {
      let target;
      try { target = new URL(href, origin + base + '/' + page); } catch {
        warnings.add(`${file}: invalid link: ${href}`); continue;
      }
      if (!/^https?:$/.test(target.protocol) || target.origin !== origin) continue;
      if (base && target.pathname !== base && !target.pathname.startsWith(base + '/')) continue;
      let path, fragment;
      try { path = decodeURIComponent(target.pathname.slice(base.length) || '/'); fragment = decodeURIComponent(target.hash.slice(1).split(':~:')[0]); } catch {
        warnings.add(`${file}: invalid URL encoding: ${href}`); continue;
      }
      const visited = new Set();
      while (redirects.has(path) && !visited.has(path)) { visited.add(path); path = redirects.get(path); }
      const dest = locate(path);
      if (!dest) warnings.add(`${file}: broken internal link: ${href}`);
      else if (fragment && inspected.has(dest) && !inspected.get(dest).ids.has(fragment)) warnings.add(`${file}: missing anchor: ${href}`);
    }
  }
  return [...warnings];
}
