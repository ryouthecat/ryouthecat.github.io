import { test } from 'node:test';
import assert from 'node:assert/strict';
import { render, renderInline } from '../engine/markdown/index.js';

const md = (src, opts) => render(src, opts).trim();

test('inline: emphasis, strong, code, escapes', () => {
  assert.equal(md('*a* **b** ***c*** `d` \\*e\\*'), '<p><em>a</em> <strong>b</strong> <em><strong>c</strong></em> <code>d</code> *e*</p>');
  assert.equal(md('__Prologue:__ text'), '<p><strong>Prologue:</strong> text</p>');
  assert.equal(md('snake_case_name and 2*3*4'), '<p>snake_case_name and 2<em>3</em>4</p>');
  assert.equal(md('`` a ` b ``'), '<p><code>a ` b</code></p>');
});

test('inline: links, references, images, autolinks', () => {
  assert.equal(md('[x](/u "t")'), '<p><a href="/u" title="t">x</a></p>');
  assert.equal(md('[x][r]\n\n[r]: /ref'), '<p><a href="/ref">x</a></p>');
  assert.equal(md('![a](p.png)'), '<p><img src="p.png" alt="a" /></p>');
  assert.equal(md('<https://a.b/c>'), '<p><a href="https://a.b/c">https://a.b/c</a></p>');
  assert.equal(md('see https://a.b/c_d, ok'), '<p>see <a href="https://a.b/c_d">https://a.b/c_d</a>, ok</p>');
  assert.equal(md('[https://a.b](https://a.b)'), '<p><a href="https://a.b">https://a.b</a></p>', 'no nested links');
  assert.equal(md('`https://a.b`'), '<p><code>https://a.b</code></p>', 'no links inside code');
});

test('security: unsafe URL schemes are dropped', () => {
  assert.equal(md('[x](javascript:alert(1))'), '<p><a href="">x</a></p>');
  assert.equal(md('![x](javascript:alert(1))'), '<p><img src="" alt="x" /></p>');
});

test('blocks: headings, setext, hr, quotes', () => {
  assert.equal(md('# a\n\nb\n---\n\n***'), '<h1>a</h1>\n<h2>b</h2>\n<hr />');
  assert.equal(md('> a\n> b'), '<blockquote>\n<p>a\nb</p>\n</blockquote>');
});

test('blocks: lists tight/loose/nested/ordered start', () => {
  assert.equal(md('- a\n- b'), '<ul>\n<li>a</li>\n<li>b</li>\n</ul>');
  assert.equal(md('- a\n\n- b'), '<ul>\n<li>\n<p>a</p>\n</li>\n<li>\n<p>b</p>\n</li>\n</ul>');
  assert.equal(md('3. a\n4. b'), '<ol start="3">\n<li>a</li>\n<li>b</li>\n</ol>');
  assert.match(md('- a\n  - b'), /<li>a\n<ul>\n<li>b<\/li>\n<\/ul>\n<\/li>/);
});

test('blocks: fenced code keeps content verbatim', () => {
  const out = md('```c\nint *p = &x; // <b>\n```');
  assert.equal(out, '<pre><code class="language-c">int *p = &amp;x; // &lt;b&gt;\n</code></pre>');
  assert.equal(md('~~~\na\n~~~'), '<pre><code>a\n</code></pre>');
  assert.equal(md('```\nunclosed'), '<pre><code>unclosed\n</code></pre>');
});

test('blocks: raw html blocks pass through', () => {
  assert.equal(md('<div>\n*not md*\n</div>'), '<div>\n*not md*\n</div>');
  assert.equal(md('<details><summary>x</summary>\n\ny\n\n</details>'), '<details><summary>x</summary>\n<p>y</p>\n</details>');
});

test('gfm: tables with alignment and escaped pipes', () => {
  const out = md('| a | b |\n|:--|--:|\n| 1 | x \\| y |');
  assert.match(out, /<th align="left">a<\/th>/);
  assert.match(out, /<th align="right">b<\/th>/);
  assert.match(out, /<td align="right">x \| y<\/td>/);
});

test('gfm: task lists and strikethrough', () => {
  const out = md('- [x] done\n- [ ] todo');
  assert.match(out, /<li class="task"><input type="checkbox" disabled checked \/> done<\/li>/);
  assert.match(out, /<li class="task"><input type="checkbox" disabled \/> todo<\/li>/);
  assert.equal(md('~~x~~ and ~y~ and ==z=='), '<p><del>x</del> and ~y~ and <mark>z</mark></p>');
});

test('extension: github alerts (+ title, + fold)', () => {
  assert.match(md('> [!NOTE]\n> hi'), /<div class="alert alert-note"><p class="alert-title">Note<\/p>\n<p>hi<\/p>/);
  assert.match(md('>[!TIP] Custom\n> hi'), /alert-tip"><p class="alert-title">Custom<\/p>/);
  const folded = render('> [!WARNING]-\n> x', { hooks: { alert: (n) => `fold=${n.fold} kind=${n.kind}` } });
  assert.match(folded, /fold=- kind=warning/);
  assert.equal(md('> [!NOTE]\n> 1. a\n> 2. b').includes('<ol>'), true, 'list directly inside an alert');
});

test('extension: ::: containers', () => {
  assert.equal(md(':::details Title\nbody\n:::'), '<details><summary>Title</summary>\n<p>body</p>\n</details>');
  assert.match(md(':::details+ T\nx\n:::'), /<details open>/);
  assert.match(md('::::outer\n:::inner\nx\n:::\n::::'), /container-outer[\s\S]*container-inner/);
});

test('extension: footnotes', () => {
  const out = md('Hi[^a] there[^a].\n\n[^a]: The note.');
  assert.match(out, /<sup class="footnote-ref"><a href="#fn-a" id="fnref-a">1<\/a><\/sup>/);
  assert.match(out, /id="fnref-a-2"/);
  assert.match(out, /<li id="fn-a">[\s\S]*The note\./);
  assert.equal(md('[^missing] stays text'), '<p>[^missing] stays text</p>');
});

test('extension: math is opt-in and does not eat currency', () => {
  assert.equal(md('costs $5 and $10'), '<p>costs $5 and $10</p>');
  assert.equal(md('$x^2$', { math: true }), '<p><span class="math math-inline">x^2</span></p>');
  assert.equal(md('$$\na+b\n$$', { math: true }), '<div class="math math-display">a+b</div>');
  assert.equal(md('costs $5 and $10', { math: true }), '<p>costs $5 and $10</p>');
  assert.equal(md('$a$', {}), '<p>$a$</p>');
});

test('extension: image attribute block', () => {
  let attrs;
  render('![a](p.png){width=300 .wide}', { hooks: { image: (n) => ((attrs = n.attrs), '') } });
  assert.deepEqual(attrs, { width: '300', class: 'wide' });
  assert.match(md('![a](p.png){not attrs}'), /\{not attrs\}/);
});

test('hooks can override block + inline rendering and fall back', () => {
  const out = render('# T\n\ntext', { hooks: { heading: (n, ctx) => `<h${n.level} id="x">${ctx.inline(n.content)}</h${n.level}>`, link: () => undefined } });
  assert.equal(out.trim(), '<h1 id="x">T</h1>\n<p>text</p>');
});

test('renderInline', () => {
  assert.equal(renderInline('a *b*'), 'a <em>b</em>');
});

test('robustness: pathological input does not hang or throw', () => {
  const nasty = ['*'.repeat(3000), '['.repeat(3000), '`'.repeat(3001), '> '.repeat(500) + 'x', '- '.repeat(500) + 'x', '<'.repeat(2000), '_a '.repeat(2000), '|a|\n|-|\n'.repeat(300)];
  for (const src of nasty) {
    const t0 = Date.now();
    assert.doesNotThrow(() => render(src));
    assert.ok(Date.now() - t0 < 2000, 'finished in reasonable time');
  }
});
