#!/usr/bin/env node
// Dev tool: run the official CommonMark spec examples against the engine.
//   node scripts/commonmark-spec.mjs path/to/spec.txt [--verbose] [--section "Emphasis"]
// (spec.txt: https://github.com/commonmark/commonmark-spec/blob/master/spec.txt — not bundled.)

import { readFileSync } from 'node:fs';
import { render } from '../engine/markdown/index.js';

const args = process.argv.slice(2);
const secIdx = args.indexOf('--section');
const onlySection = secIdx !== -1 ? args[secIdx + 1] : null;
const file = args.find((a, i) => !a.startsWith('--') && (secIdx === -1 || i !== secIdx + 1));
const verbose = args.includes('--verbose');
if (!file) {
  console.error('usage: node scripts/commonmark-spec.mjs spec.txt [--verbose] [--section NAME]');
  process.exit(2);
}

const lines = readFileSync(file, 'utf8').replace(/\r\n/g, '\n').split('\n');
const examples = [];
let section = '';
for (let i = 0; i < lines.length; i++) {
  const m = /^#{1,6} +(.*)$/.exec(lines[i]);
  if (m && !lines[i].startsWith('#######')) section = m[1];
  if (lines[i].startsWith('```````````````````````````````` example')) {
    const start = i + 1;
    let md = '';
    i++;
    while (lines[i] !== '.') md += lines[i++] + '\n';
    i++;
    let html = '';
    while (!lines[i].startsWith('````````````````````````````````')) html += lines[i++] + '\n';
    examples.push({ n: examples.length + 1, section, line: start, md: md.replace(/→/g, '\t'), html: html.replace(/→/g, '\t') });
  }
}

// extensions that change output of plain CommonMark are switched off for the conformance run
const OPTS = { tables: false, footnotes: false, containers: false, alerts: false, linkify: false };

const bySection = new Map();
let pass = 0;
const failures = [];
for (const ex of examples) {
  if (onlySection && ex.section !== onlySection) continue;
  let out;
  try {
    out = render(ex.md, OPTS);
  } catch (e) {
    out = 'EXCEPTION ' + e.stack;
  }
  const ok = out === ex.html;
  const s = bySection.get(ex.section) || { pass: 0, total: 0 };
  s.total++;
  if (ok) {
    s.pass++;
    pass++;
  } else failures.push({ ex, out });
  bySection.set(ex.section, s);
}

const total = [...bySection.values()].reduce((a, s) => a + s.total, 0);
for (const [name, s] of bySection) {
  const flag = s.pass === s.total ? '✓' : '✗';
  console.log(`${flag} ${name.padEnd(34)} ${s.pass}/${s.total}`);
}
console.log(`\nTOTAL ${pass}/${total} (${((pass / total) * 100).toFixed(1)}%)`);

if (verbose) {
  for (const { ex, out } of failures) {
    console.log(`\n--- #${ex.n} [${ex.section}] spec line ${ex.line}`);
    console.log('MD:      ' + JSON.stringify(ex.md));
    console.log('EXPECT:  ' + JSON.stringify(ex.html));
    console.log('GOT:     ' + JSON.stringify(out));
  }
}
process.exitCode = failures.length ? 1 : 0;
