// Filesystem helpers shared by the build and the dev tooling.

import { createHash } from 'node:crypto';
import { promises as fs, statSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const sha1 = (data) => createHash('sha1').update(data).digest('hex');
export const shortHash = (data, n = 8) => createHash('sha1').update(data).digest('hex').slice(0, n);

export async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

/** Recursively list files under `dir` (absolute paths). Skips dot-directories and node_modules. */
export async function walk(dir, { skip = () => false } = {}) {
  const out = [];
  async function rec(d) {
    let entries;
    try {
      entries = await fs.readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    await Promise.all(
      entries.map(async (e) => {
        const p = join(d, e.name);
        if (e.name.startsWith('.') || e.name === 'node_modules' || skip(p, e)) return;
        if (e.isDirectory()) await rec(p);
        else if (e.isFile()) out.push(p);
      }),
    );
  }
  await rec(dir);
  return out.sort();
}

export function exists(p) {
  try {
    statSync(p);
    return true;
  } catch {
    return false;
  }
}

const fileExists = (p) => fs.access(p).then(() => true, () => false);

/** Collects output files, writes only the ones whose bytes changed, and prunes stale files from the output dir. */
export class Output {
  constructor(root, manifest = {}) {
    this.root = root;
    this.manifest = manifest; // rel path -> hash of last written content (or src signature for copies)
    this.next = {};
    this.written = 0;
    this.skipped = 0;
    this.bytes = 0;
    this.dirs = new Map();
  }

  /** mkdir -p once per directory; concurrent callers share the same promise. */
  mkdirFor(rel) {
    const dir = dirname(this.abs(rel));
    let p = this.dirs.get(dir);
    if (!p) this.dirs.set(dir, (p = fs.mkdir(dir, { recursive: true })));
    return p;
  }

  abs(rel) {
    return join(this.root, rel);
  }

  async write(rel, data) {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
    const h = sha1(buf);
    this.next[rel] = h;
    this.bytes += buf.length;
    if (this.manifest[rel] === h && (await fileExists(this.abs(rel)))) {
      this.skipped++;
      return;
    }
    await this.mkdirFor(rel);
    await fs.writeFile(this.abs(rel), buf);
    this.written++;
  }

  /**
   * Place a file in the output: skipped when the destination already matches (size + mtime signature),
   * otherwise hard-linked (instant, no data copied) with a plain copy as fallback (cross-device, FAT …).
   */
  async copy(rel, src) {
    const st = await fs.stat(src);
    const sig = `copy:${st.size}:${Math.floor(st.mtimeMs)}`;
    this.next[rel] = sig;
    this.bytes += st.size;
    const dest = this.abs(rel);
    if (this.manifest[rel] === sig && (await fileExists(dest))) {
      this.skipped++;
      return;
    }
    await this.mkdirFor(rel);
    await fs.rm(dest, { force: true });
    try {
      await fs.link(src, dest);
    } catch {
      await fs.copyFile(src, dest);
    }
    this.written++;
  }

  /** Remove files from the previous build that were not produced this time. */
  async prune() {
    const dirs = new Set();
    for (const rel of Object.keys(this.manifest)) {
      if (rel in this.next) continue;
      try {
        await fs.unlink(this.abs(rel));
        dirs.add(dirname(rel));
      } catch {
        /* already gone */
      }
    }
    for (const d of [...dirs].sort((a, b) => b.length - a.length)) {
      let cur = d;
      while (cur && cur !== '.') {
        try {
          await fs.rmdir(this.abs(cur));
        } catch {
          break;
        }
        cur = dirname(cur);
      }
    }
  }
}
