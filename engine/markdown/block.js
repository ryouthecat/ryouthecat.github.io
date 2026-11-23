// Block parser: line-by-line open-container algorithm (CommonMark) + extensions:
//   GFM tables, task lists, GitHub-style alerts (> [!NOTE]), ::: containers, footnote definitions, $$ math blocks.
//
// Output is a tree of `Block` nodes whose leaf blocks keep their raw inline source in `content`.
// Inline parsing happens at render time (reference definitions must be known first).

import { unescapeString } from './util.js';
import { InlineParser, OPENTAG, CLOSETAG } from './inline.js';

const CODE_INDENT = 4;

const reHtmlBlockOpen = [
  /./,
  /^<(?:script|pre|textarea|style)(?:\s|>|$)/i,
  /^<!--/,
  /^<[?]/,
  /^<![A-Za-z]/,
  /^<!\[CDATA\[/,
  /^<[/]?(?:address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[123456]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul)(?:\s|[/]?[>]|$)/i,
  new RegExp('^(?:' + OPENTAG + '|' + CLOSETAG + ')\\s*$', 'i'),
];
const reHtmlBlockClose = [/./, /<\/(?:script|pre|textarea|style)>/i, /-->/, /\?>/, />/, /\]\]>/];

const reThematicBreak = /^(?:\*[ \t]*){3,}$|^(?:_[ \t]*){3,}$|^(?:-[ \t]*){3,}$/;
const reATXHeadingMarker = /^#{1,6}(?:[ \t]+|$)/;
const reCodeFence = /^`{3,}(?!.*`)|^~{3,}/;
const reClosingCodeFence = /^(?:`{3,}|~{3,})(?=[ \t]*$)/;
const reSetextHeadingLine = /^(?:=+|-+)[ \t]*$/;
const reBulletListMarker = /^[*+-]/;
const reOrderedListMarker = /^(\d{1,9})([.)])/;
const reNonSpace = /[^ \t\f\v\r\n]/;
const reLineEnding = /\r\n|\n|\r/;
const reAlert = /^\[!([A-Za-z][\w-]*)\]([+-]?)[ \t]*([^\n]*)\n?/;
const reTaskMarker = /^\[([ xX])\][ \t]+(?=\S)/;
const reTableDelim = /^\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;
const reContainerOpen = /^(:{3,})[ \t]*([A-Za-z][\w-]*)(\+?)(?:[ \t]+(.*?))?[ \t]*$/;
const reContainerClose = /^(:{3,})[ \t]*$/;
const reFootnoteDef = /^\[\^([^\s\]]+)\]:[ \t]*/;

// characters that may begin a block construct (cheap pre-check before running the start regexes)
const SPECIAL = new Uint8Array(128);
for (const ch of '#`~*+_=<>0123456789-:$|[') SPECIAL[ch.charCodeAt(0)] = 1;

const isSpaceOrTab = (c) => c === 32 || c === 9;
const peek = (ln, pos) => (pos < ln.length ? ln.charCodeAt(pos) : -1);
const isBlank = (s) => !reNonSpace.test(s);

export class Block {
  constructor(type, line) {
    this.type = type;
    this.parent = null;
    this.children = [];
    this.open = true;
    this.content = '';
    this.lastLineBlank = false;
    this.lastLineChecked = false;
    this.startLine = line;
  }
  get lastChild() {
    const c = this.children;
    return c.length ? c[c.length - 1] : null;
  }
  append(child) {
    child.parent = this;
    this.children.push(child);
  }
  unlink() {
    if (!this.parent) return;
    const sib = this.parent.children;
    const i = sib.lastIndexOf(this);
    if (i !== -1) sib.splice(i, 1);
    this.parent = null;
  }
}

function endsWithBlankLine(block) {
  while (block) {
    if (block.lastLineBlank) return true;
    const t = block.type;
    if (!block.lastLineChecked && (t === 'list' || t === 'item')) {
      block.lastLineChecked = true;
      block = block.lastChild;
    } else {
      block.lastLineChecked = true;
      break;
    }
  }
  return false;
}

/** Split a GFM table row into trimmed cells (handles leading/trailing pipes and `\|`). */
export function splitRow(line) {
  let s = line.trim();
  if (s.charCodeAt(0) === 124) s = s.slice(1);
  if (s.length && s.charCodeAt(s.length - 1) === 124 && s.charCodeAt(s.length - 2) !== 92) s = s.slice(0, -1);
  const cells = [];
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\' && s[i + 1] === '|') {
      cur += '|';
      i++;
    } else if (c === '|') {
      cells.push(cur.trim());
      cur = '';
    } else cur += c;
  }
  cells.push(cur.trim());
  return cells;
}

function parseAligns(row) {
  return splitRow(row).map((c) => {
    const l = c.charCodeAt(0) === 58;
    const r = c.charCodeAt(c.length - 1) === 58;
    return l && r ? 'center' : l ? 'left' : r ? 'right' : null;
  });
}

// ── block type behaviours: continue() → 0 matched, 1 not matched, 2 line consumed
const BLOCKS = {
  document: {
    continue: () => 0,
    finalize() {},
    canContain: (t) => t !== 'item',
    acceptsLines: false,
  },
  list: {
    continue: () => 0,
    finalize(parser, block) {
      const items = block.children;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const hasNext = i < items.length - 1;
        if (endsWithBlankLine(item) && hasNext) {
          block.listData.tight = false;
          break;
        }
        const subs = item.children;
        let loose = false;
        for (let j = 0; j < subs.length; j++) {
          if (endsWithBlankLine(subs[j]) && (hasNext || j < subs.length - 1)) {
            loose = true;
            break;
          }
        }
        if (loose) {
          block.listData.tight = false;
          break;
        }
      }
    },
    canContain: (t) => t === 'item',
    acceptsLines: false,
  },
  block_quote: {
    continue(parser) {
      const ln = parser.currentLine;
      if (!parser.indented && peek(ln, parser.nextNonspace) === 62) {
        parser.advanceNextNonspace();
        parser.advanceOffset(1, false);
        if (isSpaceOrTab(peek(ln, parser.offset))) parser.advanceOffset(1, true);
        return 0;
      }
      return 1;
    },
    finalize(parser, block) {
      if (parser.options.alerts === false) return;
      const first = block.children[0];
      if (first && first.type === 'paragraph') {
        const m = reAlert.exec(first.content);
        if (m) {
          block.type = 'alert';
          block.kind = m[1].toLowerCase();
          block.fold = m[2];
          block.title = m[3].trim();
          first.content = first.content.slice(m[0].length);
          if (isBlank(first.content)) block.children.shift();
        }
      }
    },
    canContain: (t) => t !== 'item',
    acceptsLines: false,
  },
  item: {
    continue(parser, container) {
      if (parser.blank) {
        if (container.children.length === 0) return 1;
        parser.advanceNextNonspace();
      } else if (parser.indent >= container.listData.markerOffset + container.listData.padding) {
        parser.advanceOffset(container.listData.markerOffset + container.listData.padding, true);
      } else {
        return 1;
      }
      return 0;
    },
    finalize(parser, block) {
      const first = block.children[0];
      if (first && first.type === 'paragraph') {
        const m = reTaskMarker.exec(first.content);
        if (m) {
          block.task = m[1] === ' ' ? 'todo' : 'done';
          first.content = first.content.slice(m[0].length);
        }
      }
    },
    canContain: (t) => t !== 'item',
    acceptsLines: false,
  },
  heading: { continue: () => 1, finalize() {}, canContain: () => false, acceptsLines: false },
  thematic_break: { continue: () => 1, finalize() {}, canContain: () => false, acceptsLines: false },
  code_block: {
    continue(parser, container) {
      const ln = parser.currentLine;
      const indent = parser.indent;
      if (container.isFenced) {
        const m =
          indent <= 3 &&
          ln.charCodeAt(parser.nextNonspace) === container.fenceChar &&
          reClosingCodeFence.exec(ln.slice(parser.nextNonspace));
        if (m && m[0].length >= container.fenceLength) {
          parser.finalize(container);
          return 2;
        }
        let i = container.fenceOffset;
        while (i > 0 && isSpaceOrTab(peek(ln, parser.offset))) {
          parser.advanceOffset(1, true);
          i--;
        }
      } else if (indent >= CODE_INDENT) {
        parser.advanceOffset(CODE_INDENT, true);
      } else if (parser.blank) {
        parser.advanceNextNonspace();
      } else {
        return 1;
      }
      return 0;
    },
    finalize(parser, block) {
      if (block.isFenced) {
        const content = block.content;
        const nl = content.indexOf('\n');
        const firstLine = content.slice(0, nl);
        block.info = unescapeString(firstLine.trim());
        block.literal = content.slice(nl + 1);
      } else {
        block.literal = block.content.replace(/(\n *)+$/, '\n');
      }
      block.content = '';
    },
    canContain: () => false,
    acceptsLines: true,
  },
  html_block: {
    continue: (parser, container) => (parser.blank && (container.htmlBlockType === 6 || container.htmlBlockType === 7) ? 1 : 0),
    finalize(parser, block) {
      block.literal = block.content.replace(/(\n *)+$/, '');
      block.content = '';
    },
    canContain: () => false,
    acceptsLines: true,
  },
  paragraph: {
    continue: (parser) => (parser.blank ? 1 : 0),
    finalize(parser, block) {
      let pos;
      let hasRef = false;
      while (block.content.charCodeAt(0) === 91 && (pos = parser.inlineParser.parseReference(block.content))) {
        block.content = block.content.slice(pos);
        hasRef = true;
      }
      if (hasRef && isBlank(block.content)) block.unlink();
    },
    canContain: () => false,
    acceptsLines: true,
  },
  table: {
    continue: (parser) => (parser.blank ? 1 : 0),
    finalize() {},
    canContain: () => false,
    acceptsLines: false,
  },
  container: {
    continue(parser, container) {
      if (!parser.indented) {
        const m = reContainerClose.exec(parser.currentLine.slice(parser.nextNonspace));
        if (m && m[1].length >= container.fenceLength) {
          parser.finalize(container);
          return 2;
        }
      }
      return 0;
    },
    finalize() {},
    canContain: (t) => t !== 'item',
    acceptsLines: false,
  },
  footnote: {
    continue(parser, container) {
      if (parser.blank) {
        if (container.children.length === 0) return 1;
        parser.advanceNextNonspace();
      } else if (parser.indent >= container.markerOffset + 4) {
        parser.advanceOffset(container.markerOffset + 4, true);
      } else {
        return 1;
      }
      return 0;
    },
    finalize() {},
    canContain: (t) => t !== 'item',
    acceptsLines: false,
  },
  math_block: {
    continue(parser, container) {
      const m = /^(.*?)\$\$[ \t]*$/.exec(parser.currentLine.slice(parser.offset));
      if (m) {
        if (m[1].trim().length) container.content += m[1] + '\n';
        parser.finalize(container);
        return 2;
      }
      return 0;
    },
    finalize(parser, block) {
      block.literal = block.content.replace(/^[ \t]*\n/, '').replace(/\n+$/, '');
      block.content = '';
    },
    canContain: () => false,
    acceptsLines: true,
  },
};

export class BlockParser {
  constructor(options = {}) {
    this.options = options;
    this.doc = new Block('document', 1);
    this.tip = this.doc;
    this.oldtip = this.doc;
    this.currentLine = '';
    this.lineNumber = 0;
    this.offset = 0;
    this.column = 0;
    this.nextNonspace = 0;
    this.nextNonspaceColumn = 0;
    this.indent = 0;
    this.indented = false;
    this.blank = false;
    this.partiallyConsumedTab = false;
    this.allClosed = true;
    this.lastMatchedContainer = this.doc;

    this.refmap = Object.create(null);
    this.footnotes = new Map();
    this.env = {
      refmap: this.refmap,
      footnotes: options.footnotes === false ? null : this.footnotes,
      noteRefs: { order: [], byId: new Map() },
      options: { math: !!options.math, linkify: options.linkify !== false },
    };
    this.inlineParser = new InlineParser(this.env);

    this.starts = [
      this.startBlockQuote,
      this.startATX,
      this.startFenced,
      this.startHtml,
      ...(options.containers === false ? [] : [this.startContainer]),
      ...(options.math ? [this.startMath] : []),
      this.startSetext,
      ...(options.tables === false ? [] : [this.startTable]),
      this.startThematicBreak,
      ...(options.footnotes === false ? [] : [this.startFootnote]),
      this.startListItem,
      this.startIndentedCode,
    ];
  }

  parse(input) {
    const lines = input.split(reLineEnding);
    let len = lines.length;
    const last = input.charCodeAt(input.length - 1);
    if (len > 1 && (last === 10 || last === 13)) len -= 1;
    for (let i = 0; i < len; i++) this.incorporateLine(lines[i]);
    while (this.tip) this.finalize(this.tip);
    return this.doc;
  }

  // ── cursor helpers
  findNextNonspace() {
    const ln = this.currentLine;
    let i = this.offset;
    let cols = this.column;
    let c;
    while (i < ln.length) {
      c = ln.charCodeAt(i);
      if (c === 32) {
        i++;
        cols++;
      } else if (c === 9) {
        i++;
        cols += 4 - (cols % 4);
      } else break;
    }
    this.blank = i >= ln.length;
    this.nextNonspace = i;
    this.nextNonspaceColumn = cols;
    this.indent = cols - this.column;
    this.indented = this.indent >= CODE_INDENT;
  }

  advanceNextNonspace() {
    this.offset = this.nextNonspace;
    this.column = this.nextNonspaceColumn;
    this.partiallyConsumedTab = false;
  }

  advanceOffset(count, columns) {
    const ln = this.currentLine;
    while (count > 0 && this.offset < ln.length) {
      if (ln.charCodeAt(this.offset) === 9) {
        const charsToTab = 4 - (this.column % 4);
        if (columns) {
          this.partiallyConsumedTab = charsToTab > count;
          const charsToAdvance = charsToTab > count ? count : charsToTab;
          this.column += charsToAdvance;
          this.offset += this.partiallyConsumedTab ? 0 : 1;
          count -= charsToAdvance;
        } else {
          this.partiallyConsumedTab = false;
          this.column += charsToTab;
          this.offset += 1;
          count -= 1;
        }
      } else {
        this.partiallyConsumedTab = false;
        this.offset += 1;
        this.column += 1;
        count -= 1;
      }
    }
  }

  addLine() {
    if (this.partiallyConsumedTab) {
      this.offset += 1;
      const charsToTab = 4 - (this.column % 4);
      this.tip.content += ' '.repeat(charsToTab);
    }
    this.tip.content += this.currentLine.slice(this.offset) + '\n';
  }

  addChild(type, offset) {
    while (!BLOCKS[this.tip.type].canContain(type)) this.finalize(this.tip);
    const block = new Block(type, this.lineNumber);
    this.tip.append(block);
    this.tip = block;
    return block;
  }

  closeUnmatchedBlocks() {
    if (!this.allClosed) {
      while (this.oldtip !== this.lastMatchedContainer) {
        const parent = this.oldtip.parent;
        this.finalize(this.oldtip);
        this.oldtip = parent;
      }
      this.allClosed = true;
    }
  }

  finalize(block) {
    const above = block.parent;
    block.open = false;
    BLOCKS[block.type].finalize(this, block);
    this.tip = above;
  }

  // ── block starts: return 0 (no), 1 (container started; keep scanning), 2 (leaf started)
  startBlockQuote() {
    if (!this.indented && peek(this.currentLine, this.nextNonspace) === 62) {
      this.advanceNextNonspace();
      this.advanceOffset(1, false);
      if (isSpaceOrTab(peek(this.currentLine, this.offset))) this.advanceOffset(1, true);
      this.closeUnmatchedBlocks();
      this.addChild('block_quote', this.nextNonspace);
      return 1;
    }
    return 0;
  }

  startATX() {
    let m;
    if (!this.indented && (m = reATXHeadingMarker.exec(this.currentLine.slice(this.nextNonspace)))) {
      this.advanceNextNonspace();
      this.advanceOffset(m[0].length, false);
      this.closeUnmatchedBlocks();
      const heading = this.addChild('heading', this.nextNonspace);
      heading.level = m[0].trim().length;
      heading.content = this.currentLine
        .slice(this.offset)
        .replace(/^[ \t]*#+[ \t]*$/, '')
        .replace(/[ \t]+#+[ \t]*$/, '');
      this.advanceOffset(this.currentLine.length - this.offset);
      return 2;
    }
    return 0;
  }

  startFenced() {
    let m;
    if (!this.indented && (m = reCodeFence.exec(this.currentLine.slice(this.nextNonspace)))) {
      const fenceLength = m[0].length;
      this.closeUnmatchedBlocks();
      const block = this.addChild('code_block', this.nextNonspace);
      block.isFenced = true;
      block.fenceLength = fenceLength;
      block.fenceChar = m[0].charCodeAt(0);
      block.fenceOffset = this.indent;
      this.advanceNextNonspace();
      this.advanceOffset(fenceLength, false);
      return 2;
    }
    return 0;
  }

  startHtml(container) {
    if (!this.indented && peek(this.currentLine, this.nextNonspace) === 60) {
      const s = this.currentLine.slice(this.nextNonspace);
      for (let blockType = 1; blockType <= 7; blockType++) {
        if (
          reHtmlBlockOpen[blockType].test(s) &&
          (blockType < 7 || (container.type !== 'paragraph' && !(!this.allClosed && !this.blank && this.tip.type === 'paragraph')))
        ) {
          this.closeUnmatchedBlocks();
          const b = this.addChild('html_block', this.offset);
          b.htmlBlockType = blockType;
          return 2;
        }
      }
    }
    return 0;
  }

  startContainer() {
    if (this.indented || peek(this.currentLine, this.nextNonspace) !== 58) return 0;
    const m = reContainerOpen.exec(this.currentLine.slice(this.nextNonspace));
    if (!m) return 0;
    this.closeUnmatchedBlocks();
    const block = this.addChild('container', this.nextNonspace);
    block.fenceLength = m[1].length;
    block.name = m[2].toLowerCase();
    block.expanded = m[3] === '+'; // `:::details+` starts expanded
    block.title = (m[4] || '').trim();
    this.advanceOffset(this.currentLine.length - this.offset, false);
    return 1;
  }

  startMath() {
    if (this.indented || peek(this.currentLine, this.nextNonspace) !== 36) return 0;
    const rest = this.currentLine.slice(this.nextNonspace);
    if (!rest.startsWith('$$')) return 0;
    const single = /^\$\$(.+?)\$\$[ \t]*$/.exec(rest);
    this.closeUnmatchedBlocks();
    const block = this.addChild('math_block', this.nextNonspace);
    if (single) {
      block.content = single[1] + '\n';
      this.advanceOffset(this.currentLine.length - this.offset, false);
      this.finalize(block);
      return 2;
    }
    this.advanceNextNonspace();
    this.advanceOffset(2, false);
    return 2;
  }

  startSetext(container) {
    let m;
    if (!this.indented && container.type === 'paragraph' && (m = reSetextHeadingLine.exec(this.currentLine.slice(this.nextNonspace)))) {
      this.closeUnmatchedBlocks();
      let pos;
      while (container.content.charCodeAt(0) === 91 && (pos = this.inlineParser.parseReference(container.content))) {
        container.content = container.content.slice(pos);
      }
      if (container.content.length > 0) {
        const heading = new Block('heading', container.startLine);
        heading.level = m[0].charCodeAt(0) === 61 ? 1 : 2;
        heading.content = container.content;
        heading.open = false;
        const parent = container.parent;
        const idx = parent.children.lastIndexOf(container);
        parent.children[idx] = heading;
        heading.parent = parent;
        container.parent = null;
        this.tip = heading;
        this.advanceOffset(this.currentLine.length - this.offset, false);
        return 2;
      }
    }
    return 0;
  }

  startTable(container) {
    if (this.indented || container.type !== 'paragraph') return 0;
    const rest = this.currentLine.slice(this.nextNonspace);
    if (rest.indexOf('|') === -1 || !reTableDelim.test(rest)) return 0;
    const lines = container.content.slice(0, -1).split('\n');
    const headerCells = splitRow(lines[lines.length - 1]);
    const aligns = parseAligns(rest);
    if (headerCells.length !== aligns.length) return 0;
    this.closeUnmatchedBlocks();
    container.open = false;
    if (lines.length === 1) {
      const parent = container.parent;
      container.unlink();
      this.tip = parent;
    } else {
      container.content = lines.slice(0, -1).join('\n') + '\n';
      this.finalize(container);
    }
    const table = this.addChild('table', this.nextNonspace);
    table.aligns = aligns;
    table.head = headerCells;
    table.rows = [];
    this.advanceOffset(this.currentLine.length - this.offset, false);
    return 2;
  }

  startThematicBreak() {
    if (!this.indented && reThematicBreak.test(this.currentLine.slice(this.nextNonspace))) {
      this.closeUnmatchedBlocks();
      this.addChild('thematic_break', this.nextNonspace);
      this.advanceOffset(this.currentLine.length - this.offset, false);
      return 2;
    }
    return 0;
  }

  startFootnote() {
    if (this.indented || peek(this.currentLine, this.nextNonspace) !== 91) return 0;
    const m = reFootnoteDef.exec(this.currentLine.slice(this.nextNonspace));
    if (!m) return 0;
    this.closeUnmatchedBlocks();
    const node = this.addChild('footnote', this.nextNonspace);
    node.label = m[1];
    node.markerOffset = this.indent;
    this.advanceNextNonspace();
    this.advanceOffset(m[0].length, false);
    if (!this.footnotes.has(m[1])) this.footnotes.set(m[1], node);
    return 1;
  }

  parseListMarker(container) {
    const rest = this.currentLine.slice(this.nextNonspace);
    let m;
    const data = { type: null, tight: true, bulletChar: null, start: null, delimiter: null, padding: null, markerOffset: this.indent };
    if (this.indent >= 4) return null;
    if ((m = reBulletListMarker.exec(rest))) {
      data.type = 'bullet';
      data.bulletChar = m[0];
    } else if ((m = reOrderedListMarker.exec(rest)) && (container.type !== 'paragraph' || m[1] === '1')) {
      data.type = 'ordered';
      data.start = parseInt(m[1], 10);
      data.delimiter = m[2];
    } else return null;
    const nextc = peek(this.currentLine, this.nextNonspace + m[0].length);
    if (!(nextc === -1 || nextc === 9 || nextc === 32)) return null;
    if (container.type === 'paragraph' && !reNonSpace.test(this.currentLine.slice(this.nextNonspace + m[0].length))) return null;

    this.advanceNextNonspace();
    this.advanceOffset(m[0].length, true);
    const spacesStartCol = this.column;
    const spacesStartOffset = this.offset;
    let nc;
    do {
      this.advanceOffset(1, true);
      nc = peek(this.currentLine, this.offset);
    } while (this.column - spacesStartCol < 5 && isSpaceOrTab(nc));
    const blankItem = peek(this.currentLine, this.offset) === -1;
    const spacesAfterMarker = this.column - spacesStartCol;
    if (spacesAfterMarker >= 5 || spacesAfterMarker < 1 || blankItem) {
      data.padding = m[0].length + 1;
      this.column = spacesStartCol;
      this.offset = spacesStartOffset;
      if (isSpaceOrTab(peek(this.currentLine, this.offset))) this.advanceOffset(1, true);
    } else {
      data.padding = m[0].length + spacesAfterMarker;
    }
    return data;
  }

  startListItem(container) {
    let data;
    if ((!this.indented || container.type === 'list') && (data = this.parseListMarker(container))) {
      this.closeUnmatchedBlocks();
      if (this.tip.type !== 'list' || !listsMatch(container.listData, data)) {
        container = this.addChild('list', this.nextNonspace);
        container.listData = data;
      }
      container = this.addChild('item', this.nextNonspace);
      container.listData = data;
      return 1;
    }
    return 0;
  }

  startIndentedCode() {
    if (this.indented && this.tip.type !== 'paragraph' && !this.blank) {
      this.advanceOffset(CODE_INDENT, true);
      this.closeUnmatchedBlocks();
      this.addChild('code_block', this.offset);
      return 2;
    }
    return 0;
  }

  // ── main per-line step
  incorporateLine(line) {
    let container = this.doc;
    this.oldtip = this.tip;
    this.offset = 0;
    this.column = 0;
    this.blank = false;
    this.partiallyConsumedTab = false;
    this.lineNumber += 1;
    const ln = line.indexOf('\u0000') === -1 ? line : line.replace(/\u0000/g, '�');
    this.currentLine = ln;

    // 1. match open containers
    let allMatched = true;
    let lastChild;
    while ((lastChild = container.lastChild) && lastChild.open) {
      container = lastChild;
      this.findNextNonspace();
      const r = BLOCKS[container.type].continue(this, container);
      if (r === 1) allMatched = false;
      else if (r === 2) return;
      if (!allMatched) {
        container = container.parent;
        break;
      }
    }
    this.allClosed = container === this.oldtip;
    this.lastMatchedContainer = container;

    let matchedLeaf = container.type !== 'paragraph' && BLOCKS[container.type].acceptsLines;
    const starts = this.starts;
    const startsLen = starts.length;

    // 2. try new container / leaf starts
    while (!matchedLeaf) {
      this.findNextNonspace();
      if (!this.indented) {
        const c = this.nextNonspace < ln.length ? ln.charCodeAt(this.nextNonspace) : -1;
        if (!(c >= 0 && c < 128 && SPECIAL[c] === 1)) {
          this.advanceNextNonspace();
          break;
        }
      }
      let i = 0;
      while (i < startsLen) {
        const res = starts[i].call(this, container);
        if (res === 1) {
          container = this.tip;
          break;
        } else if (res === 2) {
          container = this.tip;
          matchedLeaf = true;
          break;
        } else i++;
      }
      if (i === startsLen) {
        this.advanceNextNonspace();
        break;
      }
    }

    // 3. what remains is text for the appropriate container
    if (!this.allClosed && !this.blank && this.tip.type === 'paragraph') {
      this.addLine(); // lazy paragraph continuation
    } else {
      this.closeUnmatchedBlocks();
      if (this.blank && container.lastChild) container.lastChild.lastLineBlank = true;
      const t = container.type;
      const lastLineBlank =
        this.blank &&
        !(
          t === 'block_quote' ||
          t === 'container' ||
          (t === 'code_block' && container.isFenced) ||
          ((t === 'item' || t === 'footnote') && container.children.length === 0 && container.startLine === this.lineNumber)
        );
      for (let cont = container; cont; cont = cont.parent) cont.lastLineBlank = lastLineBlank;

      if (BLOCKS[t].acceptsLines) {
        this.addLine();
        if (t === 'html_block' && container.htmlBlockType >= 1 && container.htmlBlockType <= 5 && reHtmlBlockClose[container.htmlBlockType].test(ln.slice(this.offset))) {
          this.finalize(container);
        }
      } else if (t === 'table') {
        if (this.offset < ln.length && !this.blank) container.rows.push(splitRow(ln.slice(this.offset)));
      } else if (this.offset < ln.length && !this.blank) {
        container = this.addChild('paragraph', this.offset);
        this.advanceNextNonspace();
        this.addLine();
      }
    }
  }
}

function listsMatch(a, b) {
  return !!a && a.type === b.type && a.delimiter === b.delimiter && a.bulletChar === b.bulletChar;
}

/** Parse markdown source into a block tree. Returns { doc, env, footnotes }. */
export function parseBlocks(input, options = {}) {
  const parser = new BlockParser(options);
  const doc = parser.parse(input);
  return { doc, env: parser.env, footnotes: parser.footnotes, inline: parser.inlineParser };
}
