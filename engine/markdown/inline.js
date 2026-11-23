// Inline parser: CommonMark delimiter-stack algorithm + a few extensions
// (~~strike~~, ==mark==, footnote refs, $math$, bare-URL autolinks, image attribute blocks).
//
// Performance notes: every scan uses sticky regexes with `lastIndex` — no substring copies on the hot path.

import { unescapeString, normalizeURI, decodeEntity, reUnicodePunctuation, reUnicodeWhitespace } from './util.js';

export class Inline {
  constructor(type, literal = '') {
    this.type = type;
    this.literal = literal;
    this.parent = null;
    this.first = null;
    this.last = null;
    this.prev = null;
    this.next = null;
  }
  append(child) {
    child.unlink();
    child.parent = this;
    if (this.last) {
      this.last.next = child;
      child.prev = this.last;
      this.last = child;
    } else {
      this.first = this.last = child;
    }
  }
  insertAfter(sibling) {
    sibling.unlink();
    sibling.next = this.next;
    if (sibling.next) sibling.next.prev = sibling;
    sibling.prev = this;
    this.next = sibling;
    sibling.parent = this.parent;
    if (!sibling.next && sibling.parent) sibling.parent.last = sibling;
  }
  unlink() {
    if (this.prev) this.prev.next = this.next;
    else if (this.parent) this.parent.first = this.next;
    if (this.next) this.next.prev = this.prev;
    else if (this.parent) this.parent.last = this.prev;
    this.parent = null;
    this.next = null;
    this.prev = null;
  }
}

const text = (s) => new Inline('text', s);

// ── character codes
const C_NEWLINE = 10, C_ASTERISK = 42, C_UNDERSCORE = 95, C_BACKTICK = 96, C_OPEN_BRACKET = 91,
  C_CLOSE_BRACKET = 93, C_BACKSLASH = 92, C_BANG = 33, C_LESSTHAN = 60, C_AMPERSAND = 38, C_OPEN_PAREN = 40,
  C_CLOSE_PAREN = 41, C_COLON = 58, C_TILDE = 126, C_EQUALS = 61, C_DOLLAR = 36, C_CARET = 94;

// ── regexes (sticky ones are matched at `lastIndex`)
const ESCAPABLE = '[!"#$%&\'()*+,\\-./:;<=>?@[\\\\\\]^_`{|}~]';
const reEscapable = new RegExp(ESCAPABLE);
const reLinkTitle = new RegExp(
  `"(?:\\\\${ESCAPABLE.slice(0)}|[^"\\x00])*"|'(?:\\\\${ESCAPABLE}|[^'\\x00])*'|\\((?:\\\\${ESCAPABLE}|[^()\\x00])*\\)`.replace(
    /\\\\\[/g,
    '\\\\[',
  ),
  'y',
);
const reLinkDestinationBraces = /<(?:[^<>\n\\\x00]|\\.)*>/y;
const reLinkLabel = /\[(?:[^\\[\]]|\\.){0,1000}\]/sy;
const reSpnl = / *(?:\n *)?/y;
const reSpaceAtEndOfLine = / *(?:\n|$)/y;
const reWhitespaceChar = /^[ \t\n\x0b\x0c\x0d]/;
const reTicksHere = /`+/y;
const reTicks = /`+/g;
const reInitialSpace = / */y;
const reEntityHere = /&(?:#x[a-f0-9]{1,6}|#[0-9]{1,7}|[a-z][a-z0-9]{1,31});/iy;
const reEmailAutolink =
  /<([a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*)>/y;
const reAutolink = /<[A-Za-z][A-Za-z0-9.+-]{1,31}:[^<>\x00-\x20]*>/iy;

const TAGNAME = '[A-Za-z][A-Za-z0-9-]*';
const ATTRIBUTENAME = '[a-zA-Z_:][a-zA-Z0-9:._-]*';
const UNQUOTEDVALUE = '[^"\'=<>`\\x00-\\x20]+';
const ATTRIBUTEVALUE = `(?:${UNQUOTEDVALUE}|'[^']*'|"[^"]*")`;
const ATTRIBUTE = `(?:\\s+${ATTRIBUTENAME}(?:\\s*=\\s*${ATTRIBUTEVALUE})?)`;
export const OPENTAG = `<${TAGNAME}${ATTRIBUTE}*\\s*/?>`;
export const CLOSETAG = `</${TAGNAME}\\s*[>]`;
const HTMLCOMMENT = '<!-->|<!--->|<!--(?:[^-]|-(?!->))*-->';
const PROCESSINGINSTRUCTION = '[<][?][\\s\\S]*?[?][>]';
const DECLARATION = '<![A-Za-z]+[^>]*>';
const CDATA = '<!\\[CDATA\\[[\\s\\S]*?\\]\\]>';
const reHtmlTag = new RegExp(`(?:${OPENTAG}|${CLOSETAG}|${HTMLCOMMENT}|${PROCESSINGINSTRUCTION}|${DECLARATION}|${CDATA})`, 'iy');

// text run that cannot start any inline construct
const reMainPlain = /(?:[^\n`[\]\\!<&*_~=]|[~=](?![~=]))+/y;
const reMainMath = /(?:[^\n`[\]\\!<&*_~=$]|[~=](?![~=]))+/y;

const reImageAttrs = /\{((?:\s*(?:[.#][\w-]+|[\w-]+=(?:"[^"\n]*"|[^\s}"]+)))+)\s*\}/y;

export function normalizeReference(s) {
  return s.slice(1, -1).trim().replace(/[ \t\r\n]+/g, ' ').toLowerCase().toUpperCase();
}

const isWhitespaceCp = (ch) => reUnicodeWhitespace.test(ch);
const isPunctCp = (ch) => reUnicodePunctuation.test(ch);

// Last full code point before `pos` / at `pos` (handles surrogate pairs)
function charBefore(s, pos) {
  if (pos === 0) return '\n';
  const lo = s.charCodeAt(pos - 1);
  if (lo >= 0xdc00 && lo <= 0xdfff && pos >= 2) {
    const hi = s.charCodeAt(pos - 2);
    if (hi >= 0xd800 && hi <= 0xdbff) return s.slice(pos - 2, pos);
  }
  return s[pos - 1];
}
function charAt(s, pos) {
  if (pos >= s.length) return '\n';
  const hi = s.charCodeAt(pos);
  if (hi >= 0xd800 && hi <= 0xdbff && pos + 1 < s.length) return s.slice(pos, pos + 2);
  return s[pos];
}

const reUrlLiteral = /(^|[\s([*_~>])(https?:\/\/[^\s<]+)/g;
function trimUrlEnd(url) {
  let end = url.length;
  for (;;) {
    const c = url[end - 1];
    if ('?!.,:*_~\'"'.includes(c)) end--;
    else if (c === ')') {
      let open = 0, close = 0;
      for (let i = 0; i < end; i++) {
        if (url[i] === '(') open++;
        else if (url[i] === ')') close++;
      }
      if (close > open) end--;
      else break;
    } else if (c === ';') {
      const m = /&[a-zA-Z0-9]+;$/.exec(url.slice(0, end));
      if (m) end -= m[0].length;
      else break;
    } else break;
    if (end <= 0) break;
  }
  return url.slice(0, end);
}

export class InlineParser {
  /**
   * env: { refmap: Object, footnotes: Map|null, noteRefs: {order:[], counts:{}}, options: {math, linkify} }
   */
  constructor(env) {
    this.env = env;
    this.refmap = env.refmap;
    this.options = env.options || {};
    this.reMain = this.options.math ? reMainMath : reMainPlain;
    this.subject = '';
    this.pos = 0;
    this.delimiters = null;
    this.brackets = null;
  }

  // ── low-level scanning helpers
  peek() {
    return this.pos < this.subject.length ? this.subject.charCodeAt(this.pos) : -1;
  }
  /** Sticky match at pos; returns matched string or null, advancing pos. */
  match(re) {
    re.lastIndex = this.pos;
    const m = re.exec(this.subject);
    if (m === null) return null;
    this.pos = re.lastIndex;
    return m[0];
  }
  spnl() {
    this.match(reSpnl);
    return true;
  }

  // ── links
  parseLinkTitle() {
    const title = this.match(reLinkTitle);
    return title === null ? null : unescapeString(title.slice(1, -1));
  }

  parseLinkDestination() {
    let res = this.match(reLinkDestinationBraces);
    if (res === null) {
      if (this.peek() === C_LESSTHAN) return null;
      const savepos = this.pos;
      let openparens = 0;
      let c;
      while ((c = this.peek()) !== -1) {
        if (c === C_BACKSLASH && reEscapable.test(this.subject.charAt(this.pos + 1))) {
          this.pos += 1;
          if (this.peek() !== -1) this.pos += 1;
        } else if (c === C_OPEN_PAREN) {
          this.pos += 1;
          openparens += 1;
        } else if (c === C_CLOSE_PAREN) {
          if (openparens < 1) break;
          this.pos += 1;
          openparens -= 1;
        } else if (c <= 32 && reWhitespaceChar.test(String.fromCharCode(c))) {
          break;
        } else {
          this.pos += 1;
        }
      }
      if (this.pos === savepos && c !== C_CLOSE_PAREN) return null;
      if (openparens !== 0) return null;
      res = this.subject.slice(savepos, this.pos);
      return normalizeURI(unescapeString(res));
    }
    return normalizeURI(unescapeString(res.slice(1, -1)));
  }

  parseLinkLabel() {
    const m = this.match(reLinkLabel);
    return m === null ? 0 : m.length;
  }

  /** Parse a link reference definition at the start of `s`. Returns chars consumed (0 if none). */
  parseReference(s) {
    this.subject = s;
    this.pos = 0;
    const startpos = this.pos;
    const matchChars = this.parseLinkLabel();
    if (matchChars === 0) return 0;
    const rawlabel = this.subject.slice(0, matchChars);
    if (this.peek() === C_COLON) this.pos++;
    else {
      this.pos = startpos;
      return 0;
    }
    this.spnl();
    const dest = this.parseLinkDestination();
    if (dest === null) {
      this.pos = startpos;
      return 0;
    }
    const beforetitle = this.pos;
    this.spnl();
    let title = null;
    if (this.pos !== beforetitle) title = this.parseLinkTitle();
    if (title === null) {
      title = '';
      this.pos = beforetitle;
    }
    let atLineEnd = true;
    if (this.match(reSpaceAtEndOfLine) === null) {
      if (title === '') atLineEnd = false;
      else {
        title = '';
        this.pos = beforetitle;
        atLineEnd = this.match(reSpaceAtEndOfLine) !== null;
      }
    }
    if (!atLineEnd) {
      this.pos = startpos;
      return 0;
    }
    const normlabel = normalizeReference(rawlabel);
    if (normlabel === '') {
      this.pos = startpos;
      return 0;
    }
    if (!this.refmap[normlabel]) this.refmap[normlabel] = { destination: dest, title };
    return this.pos - startpos;
  }

  // ── inline constructs
  parseBackticks(block) {
    const ticks = this.match(reTicksHere);
    if (ticks === null) return false;
    const afterOpenTicks = this.pos;
    for (;;) {
      reTicks.lastIndex = this.pos;
      const m = reTicks.exec(this.subject);
      if (m === null) break;
      this.pos = reTicks.lastIndex;
      if (m[0] === ticks) {
        const node = new Inline('code');
        let contents = this.subject.slice(afterOpenTicks, this.pos - ticks.length).replace(/\n/g, ' ');
        if (contents.length > 0 && /[^ ]/.test(contents) && contents[0] === ' ' && contents[contents.length - 1] === ' ') {
          contents = contents.slice(1, -1);
        }
        node.literal = contents;
        block.append(node);
        return true;
      }
    }
    this.pos = afterOpenTicks;
    block.append(text(ticks));
    return true;
  }

  parseBackslash(block) {
    this.pos += 1;
    if (this.peek() === C_NEWLINE) {
      this.pos += 1;
      block.append(new Inline('linebreak'));
    } else if (this.pos < this.subject.length && reEscapable.test(this.subject.charAt(this.pos))) {
      block.append(text(this.subject.charAt(this.pos)));
      this.pos += 1;
    } else {
      block.append(text('\\'));
    }
    return true;
  }

  parseAutolink(block) {
    let m;
    if ((m = this.match(reEmailAutolink))) {
      const node = new Inline('link');
      node.dest = normalizeURI('mailto:' + m.slice(1, -1));
      node.title = '';
      node.append(text(m.slice(1, -1)));
      block.append(node);
      return true;
    }
    if ((m = this.match(reAutolink))) {
      const node = new Inline('link');
      node.dest = normalizeURI(m.slice(1, -1));
      node.title = '';
      node.append(text(m.slice(1, -1)));
      node.autolink = true;
      block.append(node);
      return true;
    }
    return false;
  }

  parseHtmlTag(block) {
    const m = this.match(reHtmlTag);
    if (m === null) return false;
    block.append(new Inline('html_inline', m));
    return true;
  }

  parseEntity(block) {
    const m = this.match(reEntityHere);
    if (m === null) return false;
    block.append(text(decodeEntity(m)));
    return true;
  }

  parseNewline(block) {
    this.pos += 1;
    const lastc = block.last;
    if (lastc && lastc.type === 'text' && lastc.literal.charCodeAt(lastc.literal.length - 1) === 32) {
      const hardbreak = lastc.literal.charCodeAt(lastc.literal.length - 2) === 32;
      lastc.literal = lastc.literal.replace(/ +$/, '');
      block.append(new Inline(hardbreak ? 'linebreak' : 'softbreak'));
    } else {
      block.append(new Inline('softbreak'));
    }
    this.match(reInitialSpace);
    return true;
  }

  parseString(block) {
    const m = this.match(this.reMain);
    if (m === null) return false;
    block.append(text(m));
    return true;
  }

  /** $inline math$  and  $$display math$$ (opt-in). */
  parseMath(block) {
    const s = this.subject;
    const start = this.pos;
    const display = s.charCodeAt(start + 1) === C_DOLLAR;
    const open = display ? 2 : 1;
    const first = s.charCodeAt(start + open);
    if (Number.isNaN(first) || first === 32 || first === 9 || first === 10 || (!display && first === C_DOLLAR)) return false;
    let i = start + open;
    while (i < s.length) {
      const c = s.charCodeAt(i);
      if (c === C_BACKSLASH) {
        i += 2;
        continue;
      }
      if (c === C_DOLLAR) {
        if (display) {
          if (s.charCodeAt(i + 1) === C_DOLLAR) break;
        } else {
          const prev = s.charCodeAt(i - 1);
          const next = s.charCodeAt(i + 1);
          const nextIsDigit = next >= 48 && next <= 57;
          if (prev !== 32 && prev !== 9 && prev !== 10 && !nextIsDigit) break;
        }
      }
      i++;
    }
    if (i >= s.length) return false;
    const node = new Inline(display ? 'math_display' : 'math_inline', s.slice(start + open, i));
    this.pos = i + open;
    block.append(node);
    return true;
  }

  scanDelims(cc) {
    const startpos = this.pos;
    let numdelims = 0;
    while (this.peek() === cc) {
      numdelims++;
      this.pos++;
    }
    if (numdelims === 0) return null;
    if ((cc === C_TILDE || cc === C_EQUALS) && numdelims !== 2) {
      this.pos = startpos;
      return null;
    }
    const charBeforeStr = charBefore(this.subject, startpos);
    const charAfterStr = charAt(this.subject, this.pos);
    const afterWs = isWhitespaceCp(charAfterStr);
    const afterPunct = isPunctCp(charAfterStr);
    const beforeWs = isWhitespaceCp(charBeforeStr);
    const beforePunct = isPunctCp(charBeforeStr);
    const leftFlanking = !afterWs && (!afterPunct || beforeWs || beforePunct);
    const rightFlanking = !beforeWs && (!beforePunct || afterWs || afterPunct);
    let canOpen, canClose;
    if (cc === C_UNDERSCORE) {
      canOpen = leftFlanking && (!rightFlanking || beforePunct);
      canClose = rightFlanking && (!leftFlanking || afterPunct);
    } else {
      canOpen = leftFlanking;
      canClose = rightFlanking;
    }
    this.pos = startpos;
    return { numdelims, canOpen, canClose };
  }

  handleDelim(cc, block) {
    const res = this.scanDelims(cc);
    if (!res) return false;
    const numdelims = res.numdelims;
    const startpos = this.pos;
    this.pos += numdelims;
    const node = text(this.subject.slice(startpos, this.pos));
    block.append(node);
    if (res.canOpen || res.canClose) {
      this.delimiters = {
        cc,
        numdelims,
        origdelims: numdelims,
        node,
        previous: this.delimiters,
        next: null,
        canOpen: res.canOpen,
        canClose: res.canClose,
      };
      if (this.delimiters.previous !== null) this.delimiters.previous.next = this.delimiters;
    }
    return true;
  }

  removeDelimiter(delim) {
    if (delim.previous !== null) delim.previous.next = delim.next;
    if (delim.next === null) this.delimiters = delim.previous;
    else delim.next.previous = delim.previous;
  }

  processEmphasis(stackBottom) {
    const openersBottom = new Array(16).fill(stackBottom);
    let closer = this.delimiters;
    while (closer !== null && closer.previous !== stackBottom) closer = closer.previous;

    while (closer !== null) {
      const cc = closer.cc;
      if (!closer.canClose) {
        closer = closer.next;
        continue;
      }
      let idx;
      if (cc === C_UNDERSCORE) idx = 2 + (closer.canOpen ? 3 : 0) + (closer.origdelims % 3);
      else if (cc === C_ASTERISK) idx = 8 + (closer.canOpen ? 3 : 0) + (closer.origdelims % 3);
      else idx = cc === C_TILDE ? 14 : 15;

      let opener = closer.previous;
      let openerFound = false;
      while (opener !== null && opener !== stackBottom && opener !== openersBottom[idx]) {
        const oddMatch =
          (closer.canOpen || opener.canClose) && closer.origdelims % 3 !== 0 && (opener.origdelims + closer.origdelims) % 3 === 0;
        if (opener.cc === closer.cc && opener.canOpen && !oddMatch) {
          openerFound = true;
          break;
        }
        opener = opener.previous;
      }
      const oldCloser = closer;

      if (!openerFound) {
        closer = closer.next;
      } else {
        const useDelims = closer.numdelims >= 2 && opener.numdelims >= 2 ? 2 : 1;
        const openerInl = opener.node;
        const closerInl = closer.node;
        opener.numdelims -= useDelims;
        closer.numdelims -= useDelims;
        openerInl.literal = openerInl.literal.slice(0, openerInl.literal.length - useDelims);
        closerInl.literal = closerInl.literal.slice(0, closerInl.literal.length - useDelims);

        const type = cc === C_TILDE ? 'del' : cc === C_EQUALS ? 'mark' : useDelims === 1 ? 'emph' : 'strong';
        const emph = new Inline(type);
        let tmp = openerInl.next;
        while (tmp && tmp !== closerInl) {
          const next = tmp.next;
          tmp.unlink();
          emph.append(tmp);
          tmp = next;
        }
        openerInl.insertAfter(emph);

        // drop delimiters between opener and closer
        if (opener.next !== closer) {
          opener.next = closer;
          closer.previous = opener;
        }
        if (opener.numdelims === 0) {
          openerInl.unlink();
          this.removeDelimiter(opener);
        }
        if (closer.numdelims === 0) {
          closerInl.unlink();
          const tempstack = closer.next;
          this.removeDelimiter(closer);
          closer = tempstack;
        }
      }

      if (!openerFound) {
        openersBottom[idx] = oldCloser.previous;
        if (!oldCloser.canOpen) this.removeDelimiter(oldCloser);
      }
    }
    while (this.delimiters !== null && this.delimiters !== stackBottom) this.removeDelimiter(this.delimiters);
  }

  addBracket(node, index, image) {
    if (this.brackets !== null) this.brackets.bracketAfter = true;
    this.brackets = { node, previous: this.brackets, previousDelimiter: this.delimiters, index, image, active: true, bracketAfter: false };
  }
  removeBracket() {
    this.brackets = this.brackets.previous;
  }

  parseOpenBracket(block) {
    const startpos = this.pos;
    this.pos += 1;
    const node = text('[');
    block.append(node);
    this.addBracket(node, startpos, false);
    return true;
  }

  parseBang(block) {
    const startpos = this.pos;
    this.pos += 1;
    if (this.peek() === C_OPEN_BRACKET) {
      this.pos += 1;
      const node = text('![');
      block.append(node);
      this.addBracket(node, startpos + 1, true);
    } else {
      block.append(text('!'));
    }
    return true;
  }

  parseCloseBracket(block) {
    this.pos += 1;
    const startpos = this.pos;
    let opener = this.brackets;
    if (opener === null) {
      block.append(text(']'));
      return true;
    }
    if (!opener.active) {
      block.append(text(']'));
      this.removeBracket();
      return true;
    }
    const isImage = opener.image;

    // Footnote reference: [^label]
    const notes = this.env.footnotes;
    if (!isImage && notes && this.subject.charCodeAt(opener.index + 1) === C_CARET) {
      const label = this.subject.slice(opener.index + 2, startpos - 1);
      if (label && !/[\s[\]]/.test(label) && notes.has(label)) {
        const refs = this.env.noteRefs;
        let entry = refs.byId.get(label);
        if (!entry) {
          entry = { id: label, num: refs.order.length + 1, count: 0 };
          refs.byId.set(label, entry);
          refs.order.push(entry);
        }
        entry.count++;
        const node = new Inline('footnote_ref');
        node.label = label;
        node.num = entry.num;
        node.refIdx = entry.count;
        let tmp = opener.node.next;
        while (tmp) {
          const next = tmp.next;
          tmp.unlink();
          tmp = next;
        }
        block.append(node);
        this.processEmphasis(opener.previousDelimiter);
        this.removeBracket();
        opener.node.unlink();
        return true;
      }
    }

    const savepos = this.pos;
    let matched = false;
    let dest = null;
    let title = null;
    let reflabel = null;

    if (this.peek() === C_OPEN_PAREN) {
      this.pos++;
      if (
        this.spnl() &&
        (dest = this.parseLinkDestination()) !== null &&
        this.spnl() &&
        ((reWhitespaceChar.test(this.subject.charAt(this.pos - 1)) && (title = this.parseLinkTitle())) || true) &&
        this.spnl() &&
        this.peek() === C_CLOSE_PAREN
      ) {
        this.pos += 1;
        matched = true;
      } else {
        this.pos = savepos;
      }
    }

    if (!matched) {
      const beforelabel = this.pos;
      const n = this.parseLinkLabel();
      if (n > 2) {
        reflabel = this.subject.slice(beforelabel, beforelabel + n);
      } else if (!opener.bracketAfter) {
        reflabel = this.subject.slice(opener.index, startpos);
      }
      if (n === 0) this.pos = savepos;
      if (reflabel) {
        const link = this.refmap[normalizeReference(reflabel)];
        if (link) {
          dest = link.destination;
          title = link.title;
          matched = true;
        }
      }
    }

    if (matched) {
      const node = new Inline(isImage ? 'image' : 'link');
      node.dest = dest;
      node.title = title || '';
      let tmp = opener.node.next;
      while (tmp) {
        const next = tmp.next;
        tmp.unlink();
        node.append(tmp);
        tmp = next;
      }
      block.append(node);
      this.processEmphasis(opener.previousDelimiter);
      this.removeBracket();
      opener.node.unlink();

      if (isImage) {
        // optional attribute block: ![alt](src){width=300 .wide}
        reImageAttrs.lastIndex = this.pos;
        const am = reImageAttrs.exec(this.subject);
        if (am) {
          this.pos = reImageAttrs.lastIndex;
          node.attrs = parseAttrs(am[1]);
        }
      } else {
        opener = this.brackets;
        while (opener !== null) {
          if (!opener.image) opener.active = false;
          opener = opener.previous;
        }
      }
      return true;
    }
    this.removeBracket();
    this.pos = startpos;
    block.append(text(']'));
    return true;
  }

  parseInline(block) {
    const c = this.peek();
    if (c === -1) return false;
    let res = false;
    switch (c) {
      case C_NEWLINE:
        res = this.parseNewline(block);
        break;
      case C_BACKSLASH:
        res = this.parseBackslash(block);
        break;
      case C_BACKTICK:
        res = this.parseBackticks(block);
        break;
      case C_ASTERISK:
      case C_UNDERSCORE:
      case C_TILDE:
      case C_EQUALS:
        res = this.handleDelim(c, block);
        break;
      case C_OPEN_BRACKET:
        res = this.parseOpenBracket(block);
        break;
      case C_BANG:
        res = this.parseBang(block);
        break;
      case C_CLOSE_BRACKET:
        res = this.parseCloseBracket(block);
        break;
      case C_LESSTHAN:
        res = this.parseAutolink(block) || this.parseHtmlTag(block);
        break;
      case C_AMPERSAND:
        res = this.parseEntity(block);
        break;
      case C_DOLLAR:
        res = this.options.math ? this.parseMath(block) : false;
        break;
      default:
        res = this.parseString(block);
        break;
    }
    if (!res) {
      // consume one full code point literally
      const cp = this.subject.codePointAt(this.pos);
      const ch = String.fromCodePoint(cp);
      this.pos += ch.length;
      block.append(text(ch));
    }
    return true;
  }

  /** Parse inline source into a tree rooted at a synthetic 'root' node. */
  parse(source) {
    const root = new Inline('root');
    this.subject = source.trim();
    this.pos = 0;
    this.delimiters = null;
    this.brackets = null;
    while (this.parseInline(root)) {
      /* keep going */
    }
    this.processEmphasis(null);
    finishTree(root, this.options.linkify !== false);
    return root;
  }
}

function parseAttrs(src) {
  const attrs = {};
  const re = /([.#])([\w-]+)|([\w-]+)=(?:"([^"\n]*)"|([^\s}"]+))/g;
  let m;
  while ((m = re.exec(src))) {
    if (m[1] === '.') attrs.class = attrs.class ? attrs.class + ' ' + m[2] : m[2];
    else if (m[1] === '#') attrs.id = m[2];
    else attrs[m[3]] = m[4] !== undefined ? m[4] : m[5];
  }
  return attrs;
}

/** Merge adjacent text nodes; turn bare http(s) URLs in text into links (outside links/images). */
function finishTree(node, linkify, insideLink = false) {
  let child = node.first;
  while (child) {
    const next = child.next;
    if (child.type === 'text') {
      while (child.next && child.next.type === 'text') {
        child.literal += child.next.literal;
        child.next.unlink();
      }
      if (linkify && !insideLink && child.literal.length > 8 && child.literal.indexOf('://') !== -1) {
        linkifyText(child);
      }
    } else if (child.first) {
      finishTree(child, linkify, insideLink || child.type === 'link' || child.type === 'image');
    }
    child = child.next;
  }
}

function linkifyText(node) {
  const s = node.literal;
  reUrlLiteral.lastIndex = 0;
  let m;
  let last = 0;
  const parts = [];
  while ((m = reUrlLiteral.exec(s))) {
    const start = m.index + m[1].length;
    const url = trimUrlEnd(m[2]);
    if (url.length <= 8) continue;
    if (start > last) parts.push(text(s.slice(last, start)));
    const link = new Inline('link');
    link.dest = normalizeURI(url);
    link.title = '';
    link.autolink = true;
    link.append(text(url));
    parts.push(link);
    last = start + url.length;
    reUrlLiteral.lastIndex = last;
  }
  if (!parts.length) return;
  if (last < s.length) parts.push(text(s.slice(last)));
  let anchor = node;
  for (const p of parts) {
    anchor.insertAfter(p);
    anchor = p;
  }
  node.unlink();
}
