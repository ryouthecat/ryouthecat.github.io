#!/usr/bin/env node
// CLI:  node engine/cli.js <command> [options]
//
//   build     build the site into dist/            --drafts --future --no-cache --out <dir> --quiet
//   dev       live-reloading dev server (drafts on) --port 4321
//   preview   build, then serve dist/ like production --port 4322
//   new       scaffold a post:  new "Title" [section] --tags a,b --slug my-slug
//   check     full uncached build; exits 1 on warnings (broken links/images …)

import { promises as fs, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const cliPath = fileURLToPath(import.meta.url);

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2).replace(/^no-/, '');
      const neg = a.startsWith('--no-');
      const next = argv[i + 1];
      if (neg) out[key] = false;
      else if (next !== undefined && !next.startsWith('--') && ['out', 'port', 'tags', 'slug', 'section', 'date'].includes(key)) {
        out[key] = next;
        i++;
      } else out[key] = true;
    } else out._.push(a);
  }
  return out;
}

const [cmd = 'help', ...rest] = process.argv.slice(2);
const args = parseArgs(rest);

const commands = {
  async build() {
    const { build } = await import('./build.js');
    const r = await build({ root, out: args.out, drafts: !!args.drafts, future: !!args.future, cache: args.cache !== false, quiet: !!args.quiet, profile: !!args.profile });
    if (args.strict && r.warnings.length) process.exitCode = 1;
  },

  async check() {
    const { build } = await import('./build.js');
    const r = await build({ root, out: '.cache/check', cache: false, quiet: true });
    console.log(r.warnings.length ? `\n✗ ${r.warnings.length} problem(s) found.` : `✓ ${r.posts} posts checked, no problems (${r.ms.toFixed(0)} ms).`);
    process.exitCode = r.warnings.length ? 1 : 0;
  },

  async preview() {
    const { build } = await import('./build.js');
    const { serve } = await import('./server.js');
    const r = await build({ root, out: 'dist' });
    const s = await serve({ dir: r.outDir, port: Number(args.port) || 4322 });
    console.log(`\n  preview: http://localhost:${s.port}/   (Ctrl+C to stop)`);
  },

  async dev() {
    const { serve } = await import('./server.js');
    const devOut = '.cache/dev';
    const runBuild = (quiet) =>
      new Promise((res) => {
        const p = spawn(process.execPath, [cliPath, 'build', '--drafts', '--future', '--out', devOut, ...(quiet ? ['--quiet'] : [])], { stdio: 'inherit', cwd: root });
        p.on('exit', (code) => res(code === 0));
      });

    await fs.mkdir(join(root, devOut), { recursive: true });
    await runBuild(false);
    const s = await serve({ dir: resolve(root, devOut), port: Number(args.port) || 4321, live: true });
    console.log(`\n  dev server: http://localhost:${s.port}/   (drafts visible · Ctrl+C to stop)\n`);

    // polling watcher: works on every filesystem (including WSL's /mnt/* drives)
    const watched = ['content', 'theme', 'static', 'engine'];
    const snapshot = async () => {
      const { walk } = await import('./fsutil.js');
      const files = ['site.config.js', ...(await Promise.all(watched.map((d) => walk(join(root, d))))).flat()];
      const parts = await Promise.all(
        files.map(async (f) => {
          const p = f.startsWith(root) ? f : join(root, f);
          try {
            const st = await fs.stat(p);
            return `${p}:${st.size}:${Math.floor(st.mtimeMs)}`;
          } catch {
            return `${p}:gone`;
          }
        }),
      );
      return parts.join('\n');
    };
    let last = await snapshot();
    let busy = false;
    setInterval(async () => {
      if (busy) return;
      const now = await snapshot();
      if (now === last) return;
      busy = true;
      last = now;
      const t = Date.now();
      const ok = await runBuild(true);
      if (ok) {
        s.reload();
        console.log(`  ↻ rebuilt in ${Date.now() - t} ms`);
      } else console.log('  ✗ build failed — fix the error above and save again');
      busy = false;
    }, 600);
  },

  async new() {
    const { slugifyPath } = await import('./markdown/util.js');
    const title = args._[0];
    if (!title) {
      console.error('usage: npm run new -- "Post title" [section] [--tags a,b] [--slug my-slug]');
      process.exit(2);
    }
    const section = slugifyPath(args._[1] || args.section || 'notes');
    const slug = slugifyPath(args.slug || title);
    const dir = join(root, 'content', 'posts', section, slug);
    if (existsSync(dir)) {
      console.error(`already exists: ${dir}`);
      process.exit(1);
    }
    await fs.mkdir(join(dir, 'img'), { recursive: true });
    const d = new Date();
    const date = args.date || `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const tags = args.tags && args.tags !== true ? String(args.tags).split(',').map((t) => `"${t.trim()}"`).join(', ') : '';
    const fm = `---\ntitle: ${JSON.stringify(title)}\ndate: ${date}\ndraft: true\ndescription: ""\ntags: [${tags}]\n---\n\nWrite something here. Images go in \`img/\`, e.g. \`![caption](img/screenshot.png "optional caption")\`.\n\nSet \`draft: false\` when it is ready to publish.\n`;
    await fs.writeFile(join(dir, 'index.md'), fm);
    console.log(`created ${dir.replace(root + '/', '')}/index.md\n  (it is a draft: visible in \`npm run dev\`, hidden from \`npm run build\` until you set draft: false)`);
  },

  help() {
    console.log(`usage: node engine/cli.js <build|dev|preview|new|check> [options]\n  see the header of engine/cli.js or README.md`);
  },
};

if (!commands[cmd]) {
  commands.help();
  process.exit(cmd === 'help' ? 0 : 2);
}
await commands[cmd]();
