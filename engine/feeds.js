// RSS, sitemap, robots.txt and the client-side search index.

import { unescapeString } from './markdown/util.js';
import { escapeXml } from './html.js';
import { fmtDate } from '../theme/layout.js';

const X = escapeXml;

export function rssFeed(site) {
  const { cfg } = site;
  const items = site.posts.slice(0, 30);
  const last = items[0] ? items[0].date : new Date();
  return (
    `<?xml version="1.0" encoding="utf-8"?>\n` +
    `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>` +
    `<title>${X(cfg.title)}</title><link>${X(site.abs('/'))}</link><description>${X(cfg.description)}</description>` +
    `<language>${X(cfg.lang)}</language><lastBuildDate>${last.toUTCString()}</lastBuildDate>` +
    `<atom:link href="${X(site.abs('/index.xml'))}" rel="self" type="application/rss+xml"/>` +
    items
      .map(
        (p) =>
          `<item><title>${X(p.title)}</title><link>${X(site.abs(p.url))}</link><guid isPermaLink="true">${X(site.abs(p.url))}</guid>` +
          `<pubDate>${p.date.toUTCString()}</pubDate><description>${X(p.description || p.summary || '')}</description>` +
          p.tags.map((t) => `<category>${X(t.name)}</category>`).join('') +
          `</item>`,
      )
      .join('') +
    `</channel></rss>\n`
  );
}

export function sitemap(site, extraUrls = []) {
  const entries = [
    { url: '/', date: site.posts[0]?.date },
    { url: '/posts/' },
    { url: '/tags/' },
    ...site.sections.map((s) => ({ url: s.url, date: s.posts[0]?.date })),
    ...site.tags.map((t) => ({ url: t.url, date: t.posts[0]?.date })),
    ...site.posts.map((p) => ({ url: p.url, date: p.updated || p.date })),
    ...site.pages.map((p) => ({ url: p.url, date: p.updated || p.date })),
    ...extraUrls,
  ];
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` +
    entries.map((e) => `<url><loc>${X(site.abs(e.url))}</loc>${e.date ? `<lastmod>${e.date.toISOString().slice(0, 10)}</lastmod>` : ''}</url>`).join('') +
    `</urlset>\n`
  );
}

export function robots(site) {
  return `User-agent: *\nAllow: /\n\nSitemap: ${site.abs('/sitemap.xml')}\n`;
}

const plain = (html) => unescapeString(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

/** Search sections preserve heading destinations and keep code separate from prose. */
export function searchSections(html) {
  const sections = [];
  let id = '', title = '', start = 0;
  const add = (end) => {
    const chunk = html.slice(start, end);
    const code = [...chunk.matchAll(/<figure class="code"[\s\S]*?<\/figure>/g)].map(m => {
      const pre = /<pre\b[^>]*>([\s\S]*?)<\/pre>/.exec(m[0]);
      return pre ? plain(pre[1]) : '';
    }).join(' ');
    const text = plain(chunk.replace(/<figure class="code"[\s\S]*?<\/figure>/g, ' '));
    if (text || code) sections.push({ id, t: title, x: text, c: code });
  };
  for (const h of html.matchAll(/<h[1-6] id="([^"]*)">([\s\S]*?)<\/h[1-6]>/g)) {
    add(h.index);
    id = unescapeString(h[1]); title = plain(h[2].replace(/<a class="hl"[\s\S]*?<\/a>/g, ''));
    start = h.index + h[0].length;
  }
  add(html.length);
  return sections;
}

/** Compact index for the search page: title, url, description, tags, date label and prose text (no code). */
export function searchIndex(site) {
  return JSON.stringify(
    site.posts.map((p) => ({
      t: p.title,
      u: site.href(p.url),
      d: p.description || p.summary || '',
      g: p.tags.map((t) => t.name),
      s: fmtDate(p.date),
      x: p.prose || '',
      sections: searchSections(p.html || ''),
    })),
  );
}
