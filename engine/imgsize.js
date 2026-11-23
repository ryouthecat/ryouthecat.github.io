// Read image dimensions straight from file headers (PNG, JPEG, GIF, WebP, SVG).
// Used to emit width/height on <img> so the browser reserves space and avoids layout shift.

import { openSync, readSync, closeSync, readFileSync, statSync } from 'node:fs';

const cache = new Map();

function readHead(path, size) {
  const fd = openSync(path, 'r');
  try {
    const buf = Buffer.allocUnsafe(size);
    const n = readSync(fd, buf, 0, size, 0);
    return buf.subarray(0, n);
  } finally {
    closeSync(fd);
  }
}

function jpegSize(buf) {
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = buf[i + 1];
    if (marker === 0xff) {
      i++;
      continue;
    }
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9) || marker === 0x01) {
      i += 2;
      continue;
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

function webpSize(buf) {
  if (buf.length < 30 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') return null;
  const kind = buf.toString('ascii', 12, 16);
  if (kind === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  if (kind === 'VP8L') {
    const b = buf.readUInt32LE(21);
    return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
  }
  if (kind === 'VP8X') return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
  return null;
}

function svgSize(text) {
  const tag = /<svg\b[^>]*>/i.exec(text);
  if (!tag) return null;
  const num = (name) => {
    const m = new RegExp(`\\b${name}\\s*=\\s*["']([\\d.]+)(?:px)?["']`, 'i').exec(tag[0]);
    return m ? Math.round(parseFloat(m[1])) : null;
  };
  let width = num('width');
  let height = num('height');
  if (!width || !height) {
    const vb = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(tag[0]);
    if (vb) {
      width = Math.round(parseFloat(vb[1]));
      height = Math.round(parseFloat(vb[2]));
    }
  }
  return width && height ? { width, height } : null;
}

/**
 * One stat + (at most) one header read per image.
 * @returns {null | {size: {width:number,height:number}|null}}  null = file does not exist
 */
export function imageInfo(path) {
  let key;
  try {
    const st = statSync(path);
    key = `${path}:${st.size}:${st.mtimeMs}`;
  } catch {
    return null;
  }
  if (cache.has(key)) return cache.get(key);
  let size = null;
  try {
    const lower = path.toLowerCase();
    if (lower.endsWith('.svg')) {
      size = svgSize(readFileSync(path, 'utf8'));
    } else {
      const buf = readHead(path, 32768);
      if (buf.length > 24 && buf.toString('ascii', 1, 4) === 'PNG') {
        size = { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
      } else if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) {
        size = { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
      } else if (buf[0] === 0xff && buf[1] === 0xd8) {
        size = jpegSize(buf) || jpegSize(readFileSync(path));
      } else {
        size = webpSize(buf);
      }
    }
  } catch {
    size = null;
  }
  const info = { size };
  cache.set(key, info);
  return info;
}

export const imageSize = (path) => imageInfo(path)?.size ?? null;
