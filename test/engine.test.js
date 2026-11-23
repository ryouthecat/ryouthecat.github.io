import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseFrontMatter, parseDate } from '../engine/frontmatter.js';
import { highlight, normalizeLang } from '../engine/highlight/index.js';
import { imageInfo } from '../engine/imgsize.js';
import { minifyCss, minifyHtml } from '../engine/minify.js';
import { html, raw } from '../engine/html.js';
import { build } from '../engine/build.js';
import { slugifyPath } from '../engine/markdown/util.js';
import { SPRITES } from '../engine/pixel.js';
import realConfig from '../site.config.js';

test('front matter: scalars, lists, nested maps, block scalars, comments', () => {
  const { data, body } = parseFrontMatter(`---
title: "Hello: world"
draft: false
count: 3
tags: ["Reverse", 'two words', CTF]   # trailing comment
aliases:
  - /old/
  - /older/
cover:
  image: a.png
  alt: A "quoted" alt
summary: >
  folded
  text
empty:
---
# body`);
  assert.equal(data.title, 'Hello: world');
  assert.equal(data.draft, false);
  assert.equal(data.count, 3);
  assert.deepEqual(data.tags, ['Reverse', 'two words', 'CTF']);
  assert.deepEqual(data.aliases, ['/old/', '/older/']);
  assert.deepEqual(data.cover, { image: 'a.png', alt: 'A "quoted" alt' });
  assert.equal(data.summary, 'folded text');
  assert.equal(data.empty, null);
  assert.equal(body, '# body');
});

test('front matter: absent / CRLF / unquoted apostrophes', () => {
  assert.deepEqual(parseFrontMatter('# no fm').data, {});
  const { data } = parseFrontMatter("---\r\ntitle: It's fine\r\ndescription: Solution for Reverse Engineering's HKCERT: part 2\r\n---\r\nbody");
  assert.equal(data.title, "It's fine");
  assert.equal(data.description, "Solution for Reverse Engineering's HKCERT: part 2");
});

test('dates', () => {
  assert.equal(parseDate('2026-03-17').toISOString(), '2026-03-17T00:00:00.000Z');
  assert.equal(parseDate('2026-03-17 10:30').toISOString(), '2026-03-17T10:30:00.000Z');
  assert.equal(parseDate('nonsense'), null);
  assert.equal(parseDate(undefined), null);
});

test('highlight: languages, aliases, plain fallback', () => {
  assert.equal(normalizeLang('C'), 'c');
  assert.equal(normalizeLang('py'), 'python');
  assert.equal(normalizeLang('ts'), 'js');
  assert.equal(normalizeLang('cmd'), 'bat');
  assert.equal(normalizeLang('paddb'), null);
  assert.equal(normalizeLang('text'), null);
  assert.equal(highlight('x', 'definitely-unknown'), null);
  for (const lang of ['c', 'cpp', 'python', 'js', 'rust', 'go', 'java', 'bash', 'bat', 'powershell', 'sql', 'json', 'yaml', 'ini', 'html', 'css', 'asm', 'lua', 'diff', 'markdown']) {
    assert.ok(highlight('x = 1\n', lang), `${lang} highlights without throwing`);
  }
});

test('highlight: output is escaped, line-aligned, and lossless', () => {
  const src = 'int a = 1; /* multi\nline <b> */\nchar *s = "x & y";\n\nreturn 0;';
  const lines = highlight(src, 'c');
  assert.equal(lines.length, src.split('\n').length);
  assert.ok(lines.every((l) => (l.match(/<i /g) || []).length === (l.match(/<\/i>/g) || []).length), 'spans never cross lines');
  const text = lines.map((l) => l.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&')).join('\n');
  assert.equal(text, src);
  assert.match(lines[0], /<i class=c>\/\* multi<\/i>/);
  assert.match(lines[1], /<i class=c>line &lt;b&gt; \*\/<\/i>/);
});

test('highlight: tokens', () => {
  const py = highlight('def f(x):\n    return x + 0x1f  # hi', 'python').join('\n');
  assert.match(py, /<i class=k>def<\/i> <i class=f>f<\/i>/);
  assert.match(py, /<i class=n>0x1f<\/i>/);
  assert.match(py, /<i class=c># hi<\/i>/);
  assert.match(highlight('"a\\"b"', 'js')[0], /<i class=s>/);
  assert.match(highlight('+ new\n- old', 'diff').join(''), /class=ad.*class=de/);
});

test('html template escapes values but not raw()', () => {
  assert.equal(String(html`<p>${'<b>"x"</b>'}</p>`), '<p>&lt;b&gt;&quot;x&quot;&lt;/b&gt;</p>');
  assert.equal(String(html`<p>${raw('<b>x</b>')}</p>`), '<p><b>x</b></p>');
  assert.equal(String(html`<ul>${['a', 'b<'].map((x) => html`<li>${x}</li>`)}</ul>`), '<ul><li>a</li><li>b&lt;</li></ul>');
  assert.equal(String(html`${null}${undefined}${false}x`), 'x');
});

test('minifiers keep semantics', () => {
  assert.equal(minifyHtml('<div>\n  <p>a   b</p>\n  <pre>x\n   y</pre>\n</div>'), '<div><p>a b</p><pre>x\n   y</pre></div>');
  assert.equal(minifyHtml('<a>x</a> <a>y</a>'), '<a>x</a> <a>y</a>', 'inline whitespace kept');
  assert.equal(minifyCss('a  b { color: red ; }  /* c */ .x :hover{margin:0 auto}'), 'a b{color:red}.x :hover{margin:0 auto}');
  assert.equal(minifyCss('a{width:calc(1px + 2px);content:"a  b"}'), 'a{width:calc(1px + 2px);content:"a  b"}');
});

test('slugs', () => {
  assert.equal(slugifyPath('Crackmes.one RE 2026!'), 'crackmes-one-re-2026');
  assert.equal(slugifyPath('Đường đi'), 'duong-di');
});

test('image size from header', async () => {
  const dir = await fs.mkdtemp(join(tmpdir(), 'img-'));
  // 1×1 PNG scaled in IHDR to 13×7 (only the header is read)
  const png = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png);
  png.writeUInt32BE(13, 8);
  png.write('IHDR', 12);
  png.writeUInt32BE(13, 16);
  png.writeUInt32BE(7, 20);
  await fs.writeFile(join(dir, 'a.png'), png);
  await fs.writeFile(join(dir, 'a.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 20"></svg>');
  assert.deepEqual(imageInfo(join(dir, 'a.png')).size, { width: 13, height: 7 });
  assert.deepEqual(imageInfo(join(dir, 'a.svg')).size, { width: 40, height: 20 });
  assert.equal(imageInfo(join(dir, 'missing.png')), null);
});

// ── end-to-end: build a tiny site into a temp dir ───────────────────────────
async function makeSite(overrides = {}) {
  const root = await fs.mkdtemp(join(tmpdir(), 'blog-'));
  const cfg = {
    title: 'Test',
    description: 'd',
    lang: 'en',
    author: 'A',
    url: 'https://example.com',
    base: '',
    profile: { name: 'T', tagline: 'tag', headline: 'h', avatar: '/img/a.png'},
    nav: [{ label: 'Posts', href: '/posts/' }],
    social: [],
    sections: { ctf: { title: 'CTF', icon: 'flag', description: 'x' } },
    redirects: {},
    dyes: [{ id: 'g', name: 'G', color: '#6cc24a' }],
    ...overrides,
  };
  await fs.writeFile(join(root, 'site.config.js'), `export default ${JSON.stringify(cfg)};`);
  const post = join(root, 'content/posts/ctf/hello');
  await fs.mkdir(join(post, 'img'), { recursive: true });
  await fs.mkdir(join(root, 'content/pages'), { recursive: true });
  await fs.mkdir(join(root, 'static/img'), { recursive: true });
  await fs.writeFile(join(root, 'static/img/a.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  await fs.writeFile(join(post, 'index.md'), `---\ntitle: Hello\ndate: 2025-01-02\ntags: [Reverse, CTF]\naliases: [/old/hello/]\n---\n\n## First\n\nText with \`code\`.\n\n![shot](img/s.png "cap")\n\n[file](img/s.png)\n\n\`\`\`py\nprint(1)\n\`\`\`\n\n## Second\n\nmore\n`);
  await fs.writeFile(join(post, 'img/s.png'), Buffer.from('89504e470d0a1a0a0000000d49484452000000050000000308', 'hex'));
  await fs.mkdir(join(root, 'content/posts/ctf/secret'), { recursive: true });
  await fs.writeFile(join(root, 'content/posts/ctf/secret/index.md'), '---\ntitle: Secret\ndate: 2025-01-03\ndraft: true\n---\nhidden');
  await fs.writeFile(join(root, 'content/pages/about.md'), '---\ntitle: About\n---\nhi');
  return root;
}

test('build: pages, feeds, redirects, drafts, assets', async () => {
  const root = await makeSite();
  const r = await build({ root, out: 'dist', quiet: true });
  const out = (p) => fs.readFile(join(root, 'dist', p), 'utf8');
  const home = await out('index.html');
  assert.match(home, /<title>Test — tag<\/title>/);
  assert.match(home, /Hello/);
  const post = await out('posts/ctf/hello/index.html');
  assert.match(post, /<h2 id="first">First<a class="hl"/);
  assert.match(post, /<img src="img\/s.png" alt="shot" width="5" height="3" loading="lazy"/);
  assert.match(post, /<figcaption>cap<\/figcaption>/);
  assert.match(post, /<figure class="code" data-lang="python">/);
  assert.match(post, /<meta property="og:image" content="https:\/\/example\.com\/og\/ctf-hello\.png">/);
  assert.match(post, /<meta name="twitter:card" content="summary_large_image">/);
  assert.deepEqual(imageInfo(join(root, 'dist/og/ctf-hello.png')).size, { width: 1200, height: 630 });
  assert.deepEqual(imageInfo(join(root, 'dist/og/site.png')).size, { width: 1200, height: 630 });
  assert.match(await out('tags/reverse/index.html'), /#<\/span>Reverse|Reverse/);
  assert.match(await out('index.xml'), /<item><title>Hello<\/title><link>https:\/\/example.com\/posts\/ctf\/hello\/<\/link>/);
  assert.match(await out('sitemap.xml'), /posts\/ctf\/hello\//);
  assert.match(await out('robots.txt'), /Sitemap: https:\/\/example.com\/sitemap.xml/);
  assert.match(await out('old/hello/index.html'), /url=\/posts\/ctf\/hello\//);
  assert.match(await out('about/index.html'), /<h1 class="display">About<\/h1>/);
  assert.match(await out('search.json'), /"t":"Hello"/);
  await fs.access(join(root, 'dist/posts/ctf/hello/img/s.png'));
  await fs.access(join(root, 'dist/img/a.png'));
  await fs.access(join(root, 'dist/404.html'));
  assert.ok(!(await out('index.xml')).includes('Secret'), 'drafts are excluded');
  await assert.rejects(fs.access(join(root, 'dist/posts/ctf/secret/index.html')));
  assert.equal(r.warnings.length, 0, r.warnings.join('\n'));
});

test('build: incremental — second run writes nothing; edit rewrites only what changed; stale files pruned', async () => {
  const root = await makeSite();
  await build({ root, out: 'dist', quiet: true });
  const second = await build({ root, out: 'dist', quiet: true });
  assert.equal(second.written, 0);
  assert.equal(second.cacheHits, 2);
  const file = join(root, 'content/pages/about.md');
  await fs.writeFile(file, '---\ntitle: About\n---\nchanged');
  const third = await build({ root, out: 'dist', quiet: true });
  assert.ok(third.written >= 1 && third.written < 10, `rewrote ${third.written} files`);
  await fs.rm(file);
  await build({ root, out: 'dist', quiet: true });
  await assert.rejects(fs.access(join(root, 'dist/about/index.html')), 'removed page is pruned');
});

test('build: drafts flag, base path, broken link + image warnings', async () => {
  const root = await makeSite({ base: '/blog' });
  await fs.appendFile(join(root, 'content/posts/ctf/hello/index.md'), '\n![x](img/missing.png)\n\n[y](img/missing.zip)\n\n[z](../nope/index.md)\n');
  const r = await build({ root, out: 'dist', quiet: true, drafts: true });
  const post = await fs.readFile(join(root, 'dist/posts/ctf/hello/index.html'), 'utf8');
  assert.match(post, /href="\/blog\/assets\/site\.[0-9a-f]+\.css"/);
  assert.match(await fs.readFile(join(root, 'dist/index.html'), 'utf8'), /href="\/blog\/posts\/ctf\/hello\/"/);
  await fs.access(join(root, 'dist/posts/ctf/secret/index.html'));
  const w = r.warnings.join('\n');
  assert.match(w, /image not found: img\/missing\.png/);
  assert.match(w, /broken relative link: img\/missing\.zip/);
  assert.match(w, /link to unknown markdown file: \.\.\/nope\/index\.md/);
});

test('site.config.js: every section icon is a real sprite', () => {
  for (const [key, sec] of Object.entries(realConfig.sections)) {
    assert.ok(SPRITES[sec.icon], `section "${key}" uses unknown icon "${sec.icon}"`);
    assert.ok(sec.title, `section "${key}" needs a title`);
  }
});

test('cache: changing a linked page URL refreshes its incoming links', async () => {
  const root = await makeSite();
  await fs.appendFile(join(root, 'content/posts/ctf/hello/index.md'), '\n[About](../../../pages/about.md#intro)\n');
  const about = join(root, 'content/pages/about.md');
  await fs.writeFile(about, '---\ntitle: About\n---\n## Intro\nHello');
  assert.equal((await build({root,quiet:true})).warnings.length, 0);
  await fs.writeFile(about, '---\ntitle: About\nslug: profile\n---\n## Intro\nHello');
  const result = await build({root,quiet:true});
  assert.equal(result.warnings.length, 0);
  const html = await fs.readFile(join(root,'dist/posts/ctf/hello/index.html'),'utf8');
  assert.match(html, /href="\/profile\/#intro">About/);
  await fs.rm(about);
  const removed = await build({root,quiet:true});
  assert.ok(removed.warnings.some(w => w.includes('unknown markdown file')));
});

test('link checker: base paths, encoded anchors, queries, redirects, raw HTML and stale outputs', async () => {
  const root = await makeSite({base:'/blog'});
  const post = join(root,'content/posts/ctf/hello/index.md');
  await fs.appendFile(post, '\n## Đường đi\n\n[unicode](#%C4%91%C6%B0%E1%BB%9Dng-%C4%91i)\n\n[query](/posts/ctf/hello/?q=1#first)\n\n[alias](/old/hello/#second)\n\n[external](https://elsewhere.invalid/nope#x)\n');
  assert.deepEqual((await build({root,quiet:true})).warnings, []);
  await fs.mkdir(join(root,'dist/gone'),{recursive:true});
  await fs.writeFile(join(root,'dist/gone/index.html'),'stale');
  await fs.appendFile(post, '\n[bad anchor](#absent)\n\n<a href="/blog/gone/">Stale</a>\n\n[bad page](/missing/)\n');
  const result = await build({root,quiet:true});
  assert.ok(result.warnings.some(w => w.includes('missing anchor: #absent')));
  assert.ok(result.warnings.some(w => w.includes('broken internal link: /blog/gone/')));
  assert.ok(result.warnings.some(w => w.includes('broken internal link: /blog/missing/')));
});

test('search: complete prose and code with matching section anchors; drafts excluded', async () => {
  const root = await makeSite();
  await fs.appendFile(join(root,'content/posts/ctf/hello/index.md'), '\n'+ 'ordinary text '.repeat(1000) + '\n\n## Late section\n\nlate_unique_word\n\n```c\nvoid code_only_symbol();\n```\n');
  await build({root,quiet:true});
  const rows = JSON.parse(await fs.readFile(join(root,'dist/search.json'),'utf8'));
  assert.equal(rows.length,1);
  assert.ok(rows[0].x.includes('late_unique_word'));
  assert.ok(!rows[0].x.includes('code_only_symbol'));
  const section = rows[0].sections.find(s => s.id==='late-section');
  assert.ok(section.x.includes('late_unique_word'));
  assert.ok(section.c.includes('code_only_symbol'));
});
