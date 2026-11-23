// Content loader: scans content/, parses front matter, classifies files into posts / pages and
// derives URLs, tags, sections and navigation.
//
// Layout conventions (all optional, see README):
//   content/posts/<section>/<slug>/index.md      post  → /posts/<section>/<slug>/   (+ assets next to it)
//   content/posts/<section>/<slug>.md            post without assets
//   content/pages/<slug>.md                      page  → /<slug>/
//   content/<slug>.md                            page  → /<slug>/

import { promises as fs } from 'node:fs';
import { basename, dirname, join, relative, sep } from 'node:path';
import { parseFrontMatter, parseDate } from './frontmatter.js';
import { slugifyPath } from './markdown/util.js';
import { walk } from './fsutil.js';

const posix = (p) => p.split(sep).join('/');
const humanize = (s) => s.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const asArray = (v) => (Array.isArray(v) ? v : v === undefined || v === null || v === '' ? [] : [v]);

export async function loadContent(cfg, { drafts = false, future = false } = {}) {
  const warnings = [];
  const root = join(cfg.root, 'content');
  const files = await walk(root);

  // bundle directories: folders that contain an index.md
  const bundleDirs = new Set(files.filter((f) => basename(f) === 'index.md').map((f) => dirname(f)));
  const assetsByDir = new Map();
  for (const f of files) {
    if (f.endsWith('.md')) continue;
    // nearest bundle ancestor
    let d = dirname(f);
    while (d.length >= root.length && !bundleDirs.has(d)) d = dirname(d);
    if (d.length < root.length) continue;
    if (!assetsByDir.has(d)) assetsByDir.set(d, []);
    assetsByDir.get(d).push({ abs: f, rel: posix(relative(d, f)) });
  }

  const mdFiles = files.filter((f) => f.endsWith('.md'));
  const entries = await Promise.all(
    mdFiles.map(async (abs) => {
      const [src, st] = await Promise.all([fs.readFile(abs, 'utf8'), fs.stat(abs)]);
      return { abs, src, mtime: st.mtime, rel: posix(relative(root, abs)), fm: parseFrontMatter(src) };
    }),
  );

  const now = Date.now();
  const posts = [];
  const pages = [];
  const seenUrls = new Map();

  for (const e of entries) {
    const { data, body, bodyOffsetLines } = e.fm;
    const parts = e.rel.replace(/\.md$/, '').split('/');
    const isIndex = parts[parts.length - 1] === 'index';
    const dirParts = isIndex ? parts.slice(0, -1) : parts;

    let kind;
    let section = null;
    let slugPath;
    if (dirParts[0] === 'posts') {
      kind = 'post';
      if (dirParts.length === 2) {
        section = data.section ? slugifyPath(String(data.section)) : 'general';
        slugPath = [dirParts[1]];
      } else if (dirParts.length >= 3) {
        section = data.section ? slugifyPath(String(data.section)) : slugifyPath(dirParts[1]);
        slugPath = dirParts.slice(2);
      } else continue; // posts/index.md — ignore
    } else if (dirParts[0] === 'pages') {
      kind = 'page';
      slugPath = dirParts.slice(1);
    } else {
      kind = 'page';
      slugPath = dirParts;
    }
    if (!slugPath.length || (slugPath.length === 1 && slugPath[0] === '')) continue;

    const slug = data.slug ? slugifyPath(String(data.slug)) : slugPath.map(slugifyPath).join('/');
    const url = data.url
      ? String(data.url).replace(/^\/?/, '/').replace(/\/?$/, '/')
      : kind === 'post'
        ? `/posts/${section}/${slug}/`
        : `/${slug}/`;

    const draft = data.draft === true;
    const date = parseDate(data.date);
    if (draft && !drafts) continue;
    if (kind === 'post' && !date) warnings.push(`${e.rel}: no valid "date" in front matter (using file modification time)`);
    if (kind === 'post' && date && date.getTime() > now + 864e5 && !future) {
      warnings.push(`${e.rel}: dated in the future (${data.date}) — skipped (use --future to include)`);
      continue;
    }

    const bundleDir = isIndex ? dirname(e.abs) : null;
    const tags = [];
    const seenTag = new Set();
    for (const t of asArray(data.tags)) {
      const name = String(t).trim();
      const tslug = slugifyPath(name) || encodeURIComponent(name);
      if (!name || seenTag.has(tslug)) continue;
      seenTag.add(tslug);
      tags.push({ name, slug: tslug });
    }

    const page = {
      kind,
      title: data.title ? String(data.title) : humanize(slugPath[slugPath.length - 1]),
      description: data.description ? String(data.description) : '',
      date: date || (kind === 'post' ? e.mtime : null),
      updated: parseDate(data.updated ?? data.lastmod),
      draft,
      tags,
      section,
      slug,
      url,
      outPath: url.replace(/^\//, '') + 'index.html',
      srcAbs: e.abs,
      srcRel: e.rel,
      dir: bundleDir,
      assets: bundleDir ? assetsByDir.get(bundleDir) || [] : [],
      body,
      bodyOffsetLines,
      math: data.math === true,
      toc: data.toc !== false,
      aliases: asArray(data.aliases).map((a) => String(a).replace(/^\/?/, '/').replace(/\/?$/, '/')),
      fm: data,
    };

    if (seenUrls.has(url)) {
      warnings.push(`${e.rel}: URL ${url} already used by ${seenUrls.get(url)}`);
      continue;
    }
    seenUrls.set(url, e.rel);
    (kind === 'post' ? posts : pages).push(page);
  }

  posts.sort((a, b) => b.date - a.date || a.title.localeCompare(b.title));
  posts.forEach((p, i) => {
    p.newer = i > 0 ? posts[i - 1] : null;
    p.older = i < posts.length - 1 ? posts[i + 1] : null;
  });

  // taxonomies
  const tagMap = new Map();
  for (const p of posts) {
    for (const t of p.tags) {
      let entry = tagMap.get(t.slug);
      if (!entry) tagMap.set(t.slug, (entry = { name: t.name, slug: t.slug, posts: [], url: `/tags/${t.slug}/` }));
      entry.posts.push(p);
    }
  }
  const tags = [...tagMap.values()].sort((a, b) => b.posts.length - a.posts.length || a.name.localeCompare(b.name));

  const sectionMap = new Map();
  for (const p of posts) {
    let s = sectionMap.get(p.section);
    if (!s) {
      const conf = (cfg.sections && cfg.sections[p.section]) || {};
      sectionMap.set(
        p.section,
        (s = { key: p.section, title: conf.title || humanize(p.section), icon: conf.icon || 'book', description: conf.description || '', url: `/posts/${p.section}/`, posts: [] }),
      );
    }
    s.posts.push(p);
  }
  const order = Object.keys(cfg.sections || {});
  const sections = [...sectionMap.values()].sort((a, b) => {
    const ia = order.indexOf(a.key);
    const ib = order.indexOf(b.key);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.title.localeCompare(b.title);
  });
  const sectionByKey = new Map(sections.map((s) => [s.key, s]));
  for (const p of posts) p.sectionInfo = sectionByKey.get(p.section);

  // markdown file → URL map (for [text](../other/index.md) links)
  const fileUrls = new Map();
  for (const p of [...posts, ...pages]) fileUrls.set(p.srcAbs, p.url);

  return { posts, pages, tags, sections, fileUrls, warnings };
}
