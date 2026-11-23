// Static site build. Designed to be fast:
//   • content is read + parsed in parallel, markdown results are cached by content hash
//   • output files are written only when their bytes change (cheap rebuilds, stable mtimes)
//   • bundle assets (images, downloads) are copied by size+mtime signature, never re-read
//   • stale files from earlier builds are pruned

import { promises as fs } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';

import { loadContent } from './content.js';
import { renderMarkdown } from './mdsite.js';
import { Output, ensureDir, sha1, shortHash, walk } from './fsutil.js';
import { minifyCss, minifyHtml, minifyJs } from './minify.js';
import { SPRITES, faviconSvg, sceneSvg, strataTileSvg } from './pixel.js';
import { renderOgCard } from './og.js';
import { rssFeed, robots, searchIndex, sitemap } from './feeds.js';
import { checkLinks } from './linkcheck.js';
import * as pages from '../theme/pages.js';
import { fmtDate } from '../theme/layout.js';

const CSS_FILES = ['base.css', 'components.css', 'post.css'];
const ENGINE_DIR = dirname(fileURLToPath(import.meta.url));
const THEME_DIR = join(ENGINE_DIR, '..', 'theme');

async function loadConfig(root) {
  const mod = await import(pathToFileURL(join(root, 'site.config.js')).href + `?t=${Date.now()}`);
  const cfg = { ...mod.default };
  cfg.root = root;
  cfg.base = (cfg.base || '').replace(/\/+$/, '');
  cfg.url = (cfg.url || '').replace(/\/+$/, '');
  return cfg;
}

/** Cheap fingerprint of the files that influence markdown rendering (so the cache invalidates on engine edits). */
async function engineSalt() {
  const dirs = ['markdown', 'highlight'];
  const all = ['mdsite.js', 'imgsize.js', 'frontmatter.js'];
  for (const d of dirs) for (const f of await fs.readdir(join(ENGINE_DIR, d))) all.push(`${d}/${f}`);
  const parts = await Promise.all(all.sort().map(async (f) => {
    const st = await fs.stat(join(ENGINE_DIR, f));
    return `${f}:${st.size}:${Math.floor(st.mtimeMs)}`;
  }));
  return shortHash(parts.join('|'), 12);
}

async function readJsonSafe(path, fallback) {
  try {
    return JSON.parse(await fs.readFile(path, 'utf8'));
  } catch {
    return fallback;
  }
}

export async function build(opts = {}) {
  const t0 = performance.now();
  const root = resolve(opts.root);
  const outDir = resolve(root, opts.out || 'dist');
  const cacheDir = join(root, '.cache');
  const log = opts.quiet ? () => {} : (...a) => console.log(...a);
  const warnings = [];
  const warn = (m) => warnings.push(m);
  const phases = [];
  let tPhase = performance.now();
  const phase = (name) => {
    const now = performance.now();
    phases.push([name, now - tPhase]);
    tPhase = now;
  };

  const cfg = await loadConfig(root);
  // catch typos in icon names now, not months later when the first post of that category is published
  for (const [key, sec] of Object.entries(cfg.sections || {})) {
    if (sec.icon && !SPRITES[sec.icon]) warn(`site.config.js: section "${key}" uses unknown icon "${sec.icon}" (available: ${Object.keys(SPRITES).join(', ')})`);
  }
  const manifestPath = join(cacheDir, `manifest-${shortHash(outDir, 6)}.json`);
  const out = new Output(outDir, await readJsonSafe(manifestPath, {}));
  await ensureDir(outDir);

  // ── 1. content + theme assets (independent → parallel)
  const [content, salt] = await Promise.all([loadContent(cfg, { drafts: !!opts.drafts, future: !!opts.future }), engineSalt()]);
  warnings.push(...content.warnings);
  phase('config + content scan');
  const tAssets = await buildAssets(cfg, out);
  phase('theme assets');

  // ── 2. markdown (cached)
  const mdCacheDir = join(cacheDir, 'md');
  await ensureDir(mdCacheDir);
  const all = [...content.posts, ...content.pages];
  // Rendered links and image metadata depend on other pages and shared assets too.
  const dependencies = [...content.fileUrls].map(([file, url]) => [relative(root, file), url]);
  const assetFiles = [...new Set([...all.flatMap(p => p.assets.map(a => a.abs)), ...await walk(join(root, 'static'))])].sort();
  const assetState = await Promise.all(assetFiles.map(async file => {
    const st = await fs.stat(file);
    return [relative(root, file), st.size, st.mtimeMs];
  }));
  const dependencySalt = sha1(JSON.stringify([dependencies, assetState]));
  let hits = 0;
  await Promise.all(
    all.map(async (p) => {
      const assetSig = p.assets.length ? sha1(p.assets.map((a) => a.rel).join('|')).slice(0, 8) : '';
      const imgSig = await bundleSignature(p);
      const key = shortHash([salt, dependencySalt, p.srcRel, p.math, cfg.codeCollapseLines, cfg.base, cfg.url, assetSig, imgSig, p.body].join('\u0001'), 20);
      const cachePath = join(mdCacheDir, key + '.json');
      let r = opts.cache === false ? null : await readJsonSafe(cachePath, null);
      if (r) hits++;
      else {
        const local = [];
        r = renderMarkdown(p.body, { page: p, cfg, fileUrls: content.fileUrls, warn: (m) => local.push(m) });
        r.warnings = local;
        await fs.writeFile(cachePath, JSON.stringify(r));
      }
      Object.assign(p, {
        html: r.html,
        headings: r.headings,
        words: r.words,
        codeWords: r.codeWords,
        hasMath: r.hasMath,
        hasCode: r.hasCode,
        prose: r.prose,
        summary: r.summary,
      });
      for (const w of r.warnings || []) warn(`${p.srcRel}: ${w}`);
    }),
  );

  phase('markdown');
  // ── 3. render pages + OpenGraph PNG cards
  const domain = (cfg.url || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '') || cfg.title;
  const ogCacheDir = join(cacheDir, 'og');
  await ensureDir(ogCacheDir);
  const emitOg = async (rel, spec) => {
    const key = shortHash('og-v2|' + JSON.stringify(spec), 16);
    const cp = join(ogCacheDir, key + '.png');
    let buf = null;
    if (opts.cache !== false) {
      try { buf = await fs.readFile(cp); } catch {}
    }
    if (!buf) {
      buf = renderOgCard(spec);
      await fs.writeFile(cp, buf);
    }
    return out.write(rel, buf);
  };
  const ogDefault = '/og/site.png';
  for (const p of content.posts) {
    const slug = p.url.replace(/^\/posts\/|\/$/g, '').replace(/[^a-z0-9-]+/gi, '-');
    p.ogImage = `/og/${slug}.png`;
  }

  const site = {
    cfg,
    posts: content.posts,
    pages: content.pages,
    tags: content.tags,
    sections: content.sections,
    assets: { ...tAssets, ogDefault },
    scene: sceneSvg({ seed: cfg.title }),
    href: (p) => cfg.base + p,
    abs: (p) => cfg.url + cfg.base + p,
  };

  const documents = new Map();
  const emit = (rel, doc) => {
    const html = minifyHtml(String(doc));
    documents.set(rel, html);
    return out.write(rel, html);
  };
  const jobs = [];
  jobs.push(
    emitOg('og/site.png', {
      siteTitle: cfg.title,
      domain,
      title: cfg.profile?.name || cfg.title,
      description: cfg.profile?.headline || cfg.description,
      tags: content.tags.slice(0, 3).map((t) => t.name),
      metaRight: cfg.profile?.tagline || domain,
    }),
  );
  for (const p of site.posts) {
    jobs.push(
      emitOg(p.ogImage.slice(1), {
        siteTitle: cfg.title,
        domain,
        title: p.title,
        description: p.description || p.summary,
        section: p.sectionInfo ? { key: p.sectionInfo.key, title: p.sectionInfo.title, icon: p.sectionInfo.icon } : null,
        tags: p.tags.slice(0, 3).map((t) => t.name),
        metaRight: fmtDate(p.date),
      }),
    );
  }
  jobs.push(emit('index.html', pages.home(site)));
  jobs.push(emit('posts/index.html', pages.postsIndex(site)));
  for (const s of site.sections) jobs.push(emit(`posts/${s.key}/index.html`, pages.sectionPage(site, s)));
  jobs.push(emit('tags/index.html', pages.tagsIndex(site)));
  for (const t of site.tags) jobs.push(emit(`tags/${t.slug}/index.html`, pages.tagPage(site, t)));
  for (const p of site.posts) jobs.push(emit(p.outPath, pages.postPage(site, p)));
  for (const p of site.pages) jobs.push(emit(p.outPath, pages.genericPage(site, p)));
  jobs.push(emit('search/index.html', pages.searchPage(site)));
  jobs.push(emit('404.html', pages.notFound(site)));

  // redirects: front-matter aliases + config.redirects (never overwrite a real page)
  const real = new Set([...site.posts, ...site.pages].map((p) => p.url));
  for (const s of site.sections) real.add(s.url);
  const redirects = [];
  const redirectMap = new Map();
  for (const p of [...site.posts, ...site.pages]) for (const a of p.aliases) redirects.push([a, p.url]);
  for (const [from, to] of Object.entries(cfg.redirects || {})) redirects.push([from, to]);
  for (const [from, to] of redirects) {
    if (real.has(from) || from === to) continue;
    redirectMap.set(from, to);
    jobs.push(emit(from.replace(/^\//, '') + 'index.html', pages.redirectPage(site, to)));
  }

  // feeds & machine files
  jobs.push(out.write('index.xml', rssFeed(site)));
  jobs.push(out.write('sitemap.xml', sitemap(site)));
  jobs.push(out.write('robots.txt', robots(site)));
  jobs.push(out.write('search.json', searchIndex(site)));
  jobs.push(out.write('favicon.svg', faviconSvg()));

  // ── 4. copy post bundles + static files
  for (const p of all) for (const a of p.assets) jobs.push(out.copy(p.url.replace(/^\//, '') + a.rel, a.abs));
  const staticDir = join(root, 'static');
  for (const f of await walk(staticDir)) jobs.push(out.copy(relative(staticDir, f).split('\\').join('/'), f));

  phase('templates');
  await Promise.all(jobs);
  warnings.push(...checkLinks(documents, new Set(Object.keys(out.next)), cfg, redirectMap));
  phase('write + copy files');
  await out.prune();
  await ensureDir(cacheDir);
  await fs.writeFile(manifestPath, JSON.stringify(out.next));

  phase('manifest + prune');
  const ms = performance.now() - t0;
  const result = { ms, pages: all.length, posts: content.posts.length, written: out.written, skipped: out.skipped, bytes: out.bytes, cacheHits: hits, warnings, outDir };
  if (!opts.quiet) {
    log(`\n  built ${content.posts.length} posts, ${content.pages.length} pages, ${content.tags.length} tags in ${ms.toFixed(0)} ms`);
    log(`  markdown cache: ${hits}/${all.length} hits · files written: ${out.written}, unchanged: ${out.skipped}`);
    log(`  css ${(tAssets.sizes.css / 1024).toFixed(1)} KB · js ${(tAssets.sizes.js / 1024).toFixed(1)} KB (minified, before gzip)`);
  }
  if (opts.profile) {
    log('\n  phase timings:');
    for (const [name, t] of phases) log(`    ${name.padEnd(24)} ${t.toFixed(0).padStart(5)} ms`);
  }
  if (warnings.length) {
    console.warn(`\n  ${warnings.length} warning${warnings.length === 1 ? '' : 's'}:`);
    for (const w of warnings) console.warn('   ⚠ ' + w);
  }
  return result;
}

/** size+mtime of every file in a post bundle that markdown output depends on (image dimensions). */
async function bundleSignature(p) {
  if (!p.assets.length) return '';
  const imgs = p.assets.filter((a) => /\.(png|jpe?g|gif|webp|svg)$/i.test(a.rel));
  const sig = await Promise.all(imgs.map(async (a) => {
    const st = await fs.stat(a.abs);
    return `${a.rel}:${st.size}:${Math.floor(st.mtimeMs)}`;
  }));
  return shortHash(sig.join('|'), 8);
}

/** CSS / JS / fonts / generated textures → hashed files under /assets. Returns the URL map for templates. */
async function buildAssets(cfg, out) {
  const theme = THEME_DIR;
  const [cssParts, appJs, searchJs, mathJs, fontFiles] = await Promise.all([
    Promise.all(CSS_FILES.map((f) => fs.readFile(join(theme, 'css', f), 'utf8'))),
    fs.readFile(join(theme, 'js/app.js'), 'utf8'),
    fs.readFile(join(theme, 'js/search.js'), 'utf8'),
    fs.readFile(join(theme, 'js/math.js'), 'utf8'),
    walk(join(theme, 'fonts')),
  ]);

  const strata = strataTileSvg();
  const strataName = `strata.${shortHash(strata)}.svg`;
  const css = minifyCss(cssParts.join('\n').replace('__STRATA__', strataName));
  const cssName = `site.${shortHash(css)}.css`;
  const jsMin = minifyJs(appJs);
  const searchMin = minifyJs(searchJs);
  const mathMin = minifyJs(mathJs);
  const names = {
    js: `app.${shortHash(jsMin)}.js`,
    search: `search.${shortHash(searchMin)}.js`,
    math: `math.${shortHash(mathMin)}.js`,
  };

  const jobs = [
    out.write(`assets/${cssName}`, css),
    out.write(`assets/${names.js}`, jsMin),
    out.write(`assets/${names.search}`, searchMin),
    out.write(`assets/${names.math}`, mathMin),
    out.write(`assets/${strataName}`, strata),
  ];
  for (const f of fontFiles) jobs.push(out.copy(`assets/fonts/${f.split('/').pop()}`, f));
  await Promise.all(jobs);

  const href = (name) => `${cfg.base}/assets/${name}`;
  return {
    css: href(cssName),
    js: href(names.js),
    searchJs: href(names.search),
    mathJs: href(names.math),
    fontLatin: href('fonts/unifont-latin.woff2'),
    searchIndex: `${cfg.base}/search.json`,
    sizes: { css: Buffer.byteLength(css), js: Buffer.byteLength(jsMin) },
  };
}

export { ensureDir };
