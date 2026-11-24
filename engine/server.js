// Zero-dependency static file server with optional live reload (Server-Sent Events).

import http from 'node:http';
import { createReadStream, promises as fs } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf',
};

const RELOAD_SNIPPET = `<script>(function(){var es=new EventSource('/__reload');es.onmessage=function(){location.reload()}})()</script>`;

export function serve({ dir, port = 4321, live = false, base = '', host = '127.0.0.1' }) {
  dir = resolve(dir); // normalise (no trailing slash) so the path-traversal guard below is exact
  const clients = new Set();

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      let pathname = decodeURIComponent(url.pathname);
      if (base && pathname.startsWith(base)) pathname = pathname.slice(base.length) || '/';

      if (live && pathname === '/__reload') {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
        res.write('retry: 400\n\n');
        clients.add(res);
        req.on('close', () => clients.delete(res));
        return;
      }

      let file = normalize(join(dir, pathname));
      if (file !== dir && !file.startsWith(dir + sep)) {
        res.writeHead(403).end('Forbidden');
        return;
      }
      let st = await fs.stat(file).catch(() => null);
      if (st && st.isDirectory()) {
        if (!pathname.endsWith('/')) {
          res.writeHead(301, { location: pathname + '/' + url.search }).end();
          return;
        }
        file = join(file, 'index.html');
        st = await fs.stat(file).catch(() => null);
      }
      let status = 200;
      if (!st) {
        status = 404;
        file = join(dir, '404.html');
        st = await fs.stat(file).catch(() => null);
        if (!st) {
          res.writeHead(404, { 'content-type': 'text/plain' }).end('404 Not Found');
          return;
        }
      }
      const type = MIME[extname(file).toLowerCase()] || 'application/octet-stream';
      const headers = { 'content-type': type, 'cache-control': live ? 'no-store' : 'public, max-age=600' };
      if (live && type.startsWith('text/html')) {
        const body = (await fs.readFile(file, 'utf8')).replace('</body>', RELOAD_SNIPPET + '</body>');
        res.writeHead(status, { ...headers, 'content-length': Buffer.byteLength(body) }).end(body);
        return;
      }
      headers['content-length'] = st.size;
      res.writeHead(status, headers);
      if (req.method === 'HEAD') res.end();
      else createReadStream(file).pipe(res);
    } catch (err) {
      res.writeHead(500, { 'content-type': 'text/plain' }).end(String(err && err.message));
    }
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      resolve({
        server,
        port: server.address().port,
        reload() {
          for (const c of clients) c.write('data: reload\n\n');
        },
        close() {
          for (const c of clients) c.end();
          server.close();
        },
      });
    });
  });
}
