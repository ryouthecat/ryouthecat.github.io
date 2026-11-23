#!/usr/bin/env node
// Micro-benchmark of the markdown engine on the real posts.
//   node scripts/bench.mjs [--ref path/to/markdown-it]   (the reference is optional and NOT a dependency)

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { walk } from '../engine/fsutil.js';
import { parseFrontMatter } from '../engine/frontmatter.js';
import { render } from '../engine/markdown/index.js';
import { highlight } from '../engine/highlight/index.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const files = (await walk(join(root, 'content'))).filter((f) => f.endsWith('.md'));
const docs = files.map((f) => parseFrontMatter(readFileSync(f, 'utf8')).body);
const bytes = docs.reduce((n, d) => n + Buffer.byteLength(d), 0);
const lines = docs.reduce((n, d) => n + d.split('\n').length, 0);

function time(label, fn, iters = 30) {
  for (let i = 0; i < 5; i++) fn(); // warm-up (JIT)
  const t0 = performance.now();
  for (let i = 0; i < iters; i++) fn();
  const ms = (performance.now() - t0) / iters;
  console.log(`${label.padEnd(34)} ${ms.toFixed(2).padStart(8)} ms/run   ${(bytes / 1048576 / (ms / 1000)).toFixed(1).padStart(6)} MB/s`);
  return ms;
}

console.log(`corpus: ${docs.length} documents, ${(bytes / 1024).toFixed(0)} KB, ${lines} lines\n`);
const ours = time('this engine (parse + render)', () => docs.forEach((d) => render(d)));

const refIdx = process.argv.indexOf('--ref');
if (refIdx !== -1) {
  const MarkdownIt = createRequire(import.meta.url)(process.argv[refIdx + 1]);
  const md = new MarkdownIt({ html: true });
  const theirs = time('markdown-it (reference)', () => docs.forEach((d) => md.render(d)));
  console.log(`\nratio: this engine is ${(theirs / ours).toFixed(2)}× the speed of markdown-it`);
}

// syntax highlighting alone: every fenced code block in the corpus
const blocks = [];
for (const d of docs) {
  const re = /^```(\w+)[ \t]*\n([\s\S]*?)^```/gm;
  let m;
  while ((m = re.exec(d))) blocks.push([m[1], m[2]]);
}
const codeBytes = blocks.reduce((n, b) => n + b[1].length, 0);
const hl = time(`highlight ${blocks.length} code blocks`, () => blocks.forEach(([l, c]) => highlight(c, l)));
console.log(`  (${(codeBytes / 1024).toFixed(0)} KB of code → ${(codeBytes / 1048576 / (hl / 1000)).toFixed(1)} MB/s)`);
