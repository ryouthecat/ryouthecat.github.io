// Build-time syntax highlighter. Each language is a list of [class, regex-source] rules compiled into ONE
// global alternation regex, so the JS engine scans in native code instead of trying rules per character.
//
// Token classes (CSS: `.code .k` etc.):
//   c comment · s string · n number/constant · k keyword · t type · f function · b builtin/macro
//   p preprocessor/directive/prompt · r register · l label · a attribute/key/param
//   v variable · ad diff-add · de diff-del
//
// highlight(code, lang) → array of HTML strings (one per line, spans never cross lines) or null for unknown/plain.

import { esc } from '../markdown/util.js';

const R = String.raw;
const words = (list) => R`\b(?:${list.split(/\s+/).filter(Boolean).join('|')})\b`;
const LINE = R`(?<=\n|^)`; // start of a line

// ── shared rule fragments
const cBlockComment = ['c', R`/\*[\s\S]*?(?:\*/|$)`];
const cLineComment = ['c', R`//[^\n]*`];
const dqString = ['s', R`"(?:\\[\s\S]|[^"\\\n])*"?`];
const sqString = ['s', R`'(?:\\[\s\S]|[^'\\\n])*'?`];
const cNumber = ['n', R`(?<![\w.$])(?:0[xX][0-9a-fA-F']+|0[bB][01']+|(?:\d[\d']*\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)(?:[uUlLfFzZ]|ull|ULL|i64|ui64)*\b`];
const callName = ['f', R`\b[A-Za-z_]\w*(?=[ \t]*\()`];

const C_KEYWORDS =
  'if else for while do switch case default break continue return goto sizeof typedef struct union enum static extern const volatile inline register auto restrict signed unsigned asm _Alignof _Alignas _Atomic _Bool _Complex _Noreturn _Static_assert _Thread_local';
const C_TYPES =
  'void char short int long float double bool size_t ssize_t ptrdiff_t intptr_t uintptr_t wchar_t int8_t int16_t int32_t int64_t uint8_t uint16_t uint32_t uint64_t FILE BOOL BYTE WORD DWORD QWORD LPVOID LPCSTR LPSTR LPCWSTR LPWSTR HANDLE HWND HINSTANCE HMODULE HRESULT NTSTATUS PVOID ULONG USHORT UCHAR LONG CHAR WCHAR UINT SIZE_T ' +
  '_BYTE _WORD _DWORD _QWORD _OWORD _UNKNOWN _BOOL1 _BOOL2 _BOOL4 _BOOL8 __int8 __int16 __int32 __int64 __int128 __m128 __m128i __m256 __m256i __m512 __m128d';
const C_BUILTINS =
  'LOBYTE HIBYTE LOWORD HIWORD LODWORD HIDWORD SLODWORD SHIDWORD BYTE1 BYTE2 BYTE3 BYTE4 BYTE5 BYTE6 BYTE7 WORD1 WORD2 WORD3 DWORD1 DWORD2 COERCE_FLOAT COERCE_DOUBLE ' +
  '__ROL1__ __ROL2__ __ROL4__ __ROL8__ __ROR1__ __ROR2__ __ROR4__ __ROR8__ __PAIR8__ __PAIR16__ __PAIR32__ __PAIR64__ __PAIR128__ __CFADD__ __OFADD__ __CFSHL__ __SETP__ ' +
  'NULL TRUE FALSE true false nullptr stdin stdout stderr EOF __FILE__ __LINE__ __func__ __cdecl __stdcall __fastcall __thiscall __vectorcall __usercall __userpurge __spoils __noreturn __declspec __attribute__ __forceinline __restrict __unaligned __ptr64 __ptr32 __cppobj __unwind __noreturn';

const cppExtra =
  'class namespace template typename using new delete this public private protected virtual override final try catch throw constexpr noexcept operator explicit friend mutable decltype static_assert thread_local export concept requires co_await co_yield co_return';

const preproc = [
  ['p', R`${LINE}[ \t]*#[ \t]*(?:include|import)\b`],
  ['s', R`(?<=#[ \t]*(?:include|import)[ \t]*)(?:<[^>\n]*>|"[^"\n]*")`],
  ['p', R`${LINE}[ \t]*#[ \t]*[a-z_]+\b`],
];

const clikeRules = (kw, extraKw = '') => [
  cBlockComment,
  cLineComment,
  ...preproc,
  dqString,
  ['s', R`'(?:\\[\s\S]|[^'\\\n]){1,12}'?`],
  ['k', words(kw + ' ' + extraKw)],
  ['t', words(C_TYPES)],
  ['b', words(C_BUILTINS)],
  cNumber,
  callName,
];

const REGISTERS = R`(?:[re]?(?:[abcd]x|[sd]i|[sb]p|ip)|[abcd][lh]|[sd]il|[sb]pl|r(?:[89]|1[0-5])[dwb]?|[xyz]mm(?:[0-9]|[12][0-9]|3[01])|k[0-7]|mm[0-7]|st(?:\([0-7]\)|[0-7])?|[cdefgs]s|[cd]r[0-9]+|[re]?flags|[re]?ip|[xwq][0-9]{1,2}|sp|lr|pc|fp)`;

const LANGS = {
  c: { rules: clikeRules(C_KEYWORDS) },
  cpp: { rules: clikeRules(C_KEYWORDS, cppExtra) },

  python: {
    rules: [
      ['c', R`#[^\n]*`],
      ['s', R`(?<![\w.])[rRbBuUfF]{0,2}(?:"""[\s\S]*?(?:"""|$)|'''[\s\S]*?(?:'''|$))`],
      ['s', R`(?<![\w.])[rRbBuUfF]{0,2}(?:"(?:\\[\s\S]|[^"\\\n])*"?|'(?:\\[\s\S]|[^'\\\n])*'?)`],
      ['a', R`${LINE}[ \t]*@[\w.]+`],
      [['k', '', 'f'], R`(\bdef\b)([ \t]+)([A-Za-z_]\w*)`],
      [['k', '', 't'], R`(\bclass\b)([ \t]+)([A-Za-z_]\w*)`],
      [
        'k',
        words(
          'and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case True False None',
        ),
      ],
      [
        'b',
        words(
          'print len range int str bytes bytearray list dict set tuple frozenset float bool open enumerate zip map filter sum min max abs sorted reversed isinstance issubclass type hex bin oct ord chr input super self cls any all iter next repr round pow divmod hash id format getattr setattr hasattr callable vars dir slice object Exception ValueError TypeError KeyError IndexError struct',
        ),
      ],
      ['n', R`(?<![\w.])(?:0[xX][0-9a-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|\d[\d_]*\.?[\d_]*(?:[eE][+-]?\d+)?j?)\b`],
      callName,
    ],
  },

  js: {
    rules: [
      cBlockComment,
      cLineComment,
      ['s', R`\`(?:\\[\s\S]|[^\`\\])*\`?`],
      dqString,
      sqString,
      [['k', '', 'f'], R`(\bfunction\b)([ \t]*\*?[ \t]*)([A-Za-z_$][\w$]*)`],
      [['k', '', 't'], R`(\b(?:class|interface|enum|type)\b)([ \t]+)([A-Za-z_$][\w$]*)`],
      [
        'k',
        words(
          'async await break case catch class const continue debugger default delete do else export extends finally for from function if import in instanceof let new of return static super switch this throw try typeof var void while with yield interface type enum implements readonly public private protected abstract namespace declare as keyof is get set',
        ),
      ],
      ['n', words('true false null undefined NaN Infinity')],
      [
        'b',
        words(
          'console Math JSON Promise Array Object Number String Boolean Map Set WeakMap Symbol BigInt Date RegExp Error Buffer process require module exports window document globalThis parseInt parseFloat isNaN setTimeout setInterval fetch Uint8Array Uint16Array Uint32Array Int8Array Int16Array Int32Array Float32Array Float64Array ArrayBuffer DataView TextEncoder TextDecoder',
        ),
      ],
      ['n', R`(?<![\w.$])(?:0[xX][0-9a-fA-F_]+n?|0[bB][01_]+n?|0[oO][0-7_]+n?|(?:\d[\d_]*\.?[\d_]*|\.\d+)(?:[eE][+-]?\d+)?n?)\b`],
      ['f', R`\b[A-Za-z_$][\w$]*(?=[ \t]*\()`],
    ],
  },

  bash: { rules: bashRules(false) },
  console: { rules: bashRules(true) },

  asm: {
    flags: 'i',
    rules: [
      ['c', R`;[^\n]*|//[^\n]*|/\*[\s\S]*?(?:\*/|$)`],
      dqString,
      sqString,
      ['l', R`${LINE}[ \t]*[A-Za-z_.$@?][\w.$@?]*(?=:)`],
      ['p', R`${LINE}[ \t]*\.[A-Za-z_]\w*`],
      ['p', words('db dw dd dq dt dup resb resw resd resq equ times section segment global extern align org bits use16 use32 use64 proc endp assume public')],
      ['t', words('byte word dword qword xmmword ymmword zmmword tbyte oword ptr offset short near far rel')],
      ['r', R`\b${REGISTERS}\b`],
      ['n', R`(?<![\w.])(?:0x[0-9a-f]+|[0-9][0-9a-f]*h|0b[01]+|\d+)\b|\$-?[0-9a-f]+\b`],
      [['', 'k'], R`${LINE}([ \t]*)((?![^\n=]*\s=\s)(?:(?:rep[a-z]*|lock|bnd|notrack)[ \t]+)?[A-Za-z][A-Za-z0-9]*)(?=[ \t]|\n|$)`],
    ],
  },

  json: {
    rules: [
      ['a', R`"(?:\\[\s\S]|[^"\\\n])*"(?=[ \t]*:)`],
      dqString,
      ['n', R`-?\b\d+\.?\d*(?:[eE][+-]?\d+)?\b`],
      ['k', words('true false null')],
    ],
  },

  yaml: {
    rules: [
      ['c', R`(?<=^|\s)#[^\n]*`],
      ['a', R`${LINE}[ \t-]*[\w."'/-]+(?=:(?:[ \t]|\n|$))`],
      dqString,
      sqString,
      ['k', R`(?<=:[ \t])(?:true|false|null|yes|no|on|off|~)(?=[ \t]*(?:#|\n|$))`],
      ['n', R`(?<=:[ \t]|-[ \t])-?\d+(?:\.\d+)?(?=[ \t]*(?:#|\n|$))`],
    ],
  },

  ini: {
    rules: [
      ['c', R`(?:^|(?<=\n))[ \t]*[#;][^\n]*`],
      ['p', R`${LINE}[ \t]*\[[^\]\n]+\]`],
      ['a', R`${LINE}[ \t]*[\w.-]+(?=[ \t]*=)`],
      dqString,
      sqString,
      ['n', R`(?<=[=\s])-?\d+(?:\.\d+)?\b`],
      ['k', words('true false')],
    ],
  },

  diff: {
    rules: [
      ['c', R`${LINE}(?:diff |index |--- |\+\+\+ )[^\n]*`],
      ['p', R`${LINE}@@[^\n]*`],
      ['ad', R`${LINE}\+[^\n]*`],
      ['de', R`${LINE}-[^\n]*`],
    ],
  },

  html: {
    rules: [
      ['c', R`<!--[\s\S]*?(?:-->|$)`],
      ['p', R`<![A-Za-z][^>]*>`],
      [['p', 'k'], R`(</?)([A-Za-z][\w:-]*)`],
      ['p', R`/?>`],
      ['a', R`[\w:@.-]+(?=\s*=)`],
      dqString,
      sqString,
    ],
  },

  css: {
    rules: [
      cBlockComment,
      dqString,
      sqString,
      ['k', R`@[\w-]+`],
      ['n', R`#[0-9a-fA-F]{3,8}\b`],
      ['n', R`(?<![\w#-])-?\d+\.?\d*(?:px|em|rem|%|vh|vw|vmin|vmax|ch|s|ms|deg|fr)?\b`],
      ['f', R`[\w-]+(?=\()`],
      ['a', R`[\w-]+(?=\s*:)`],
    ],
  },

  rust: {
    rules: [
      cBlockComment,
      cLineComment,
      ['s', R`b?"(?:\\[\s\S]|[^"\\])*"?`],
      ['s', R`b?'(?:\\.|[^'\\\n])'`],
      ['v', R`'[a-z_]\w*\b(?!')`],
      ['a', R`#!?\[[^\]\n]*\]`],
      ['b', R`\b\w+!(?=[(\[{])`],
      [['k', '', 'f'], R`(\bfn\b)([ \t]+)([A-Za-z_]\w*)`],
      [['k', '', 't'], R`(\b(?:struct|enum|trait|impl|type|union)\b)([ \t]+)([A-Za-z_]\w*)`],
      [
        'k',
        words(
          'as async await break const continue crate dyn else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type unsafe use where while',
        ),
      ],
      ['t', words('i8 i16 i32 i64 i128 isize u8 u16 u32 u64 u128 usize f32 f64 bool char str String Vec Option Result Box Rc Arc HashMap HashSet BTreeMap Some None Ok Err')],
      cNumber,
      callName,
    ],
  },

  go: {
    rules: [
      cBlockComment,
      cLineComment,
      ['s', R`\`[^\`]*\`?`],
      dqString,
      ['s', R`'(?:\\.|[^'\\\n])+'?`],
      [['k', '', 'f'], R`(\bfunc\b)([ \t]+)([A-Za-z_]\w*)`],
      [
        'k',
        words('break default func interface select case defer go map struct chan else goto package switch const fallthrough if range type continue for import return var'),
      ],
      ['t', words('int int8 int16 int32 int64 uint uint8 uint16 uint32 uint64 uintptr float32 float64 string bool byte rune error any complex64 complex128')],
      ['b', words('make new len cap append copy delete panic recover print println nil true false iota close')],
      cNumber,
      callName,
    ],
  },

  java: {
    rules: [
      cBlockComment,
      cLineComment,
      ['a', R`@\w+`],
      dqString,
      ['s', R`'(?:\\.|[^'\\\n])+'?`],
      [
        'k',
        words(
          'abstract assert break case catch class const continue default do else enum extends final finally for goto if implements import instanceof interface native new package private protected public return static strictfp super switch synchronized this throw throws transient try volatile while var record sealed permits yield namespace using internal override virtual readonly async await get set delegate event foreach in is as out ref params lock fun val when object',
        ),
      ],
      ['t', words('void boolean byte char short int long float double String Object Integer Long List Map Set Optional bool string decimal uint ulong ushort sbyte Task')],
      ['n', words('true false null')],
      cNumber,
      callName,
    ],
  },

  bat: {
    flags: 'i',
    rules: [
      ['c', R`${LINE}[ \t]*(?:rem\b|::)[^\n]*`],
      ['s', R`"[^"\n]*"?`],
      ['v', R`%[~\w:*#-]+%?|%%[~\w]+|![\w]+!`],
      ['l', R`${LINE}[ \t]*:[A-Za-z_][\w-]*`],
      ['k', words('if else for in do goto call exit set setlocal endlocal enabledelayedexpansion echo off on exist defined not equ neq lss leq gtr geq errorlevel pause start shift')],
      ['b', words('cd dir copy move del type md mkdir rd rmdir ren rename cls title color cmd findstr find sort more attrib xcopy robocopy taskkill tasklist reg net ping ipconfig where whoami')],
      ['a', R`(?<=\s)/[A-Za-z?]\b`],
      ['n', R`(?<![\w.])\d+\b`],
    ],
  },

  powershell: {
    flags: 'i',
    rules: [
      ['c', R`<#[\s\S]*?(?:#>|$)|#[^\n]*`],
      ['s', R`"(?:\`[\s\S]|[^"\`])*"?`],
      ['s', R`'(?:''|[^'])*'?`],
      ['v', R`\$(?:\{[^}\n]*\}|[\w:]+)`],
      ['k', words('function param if elseif else foreach for while do until switch return break continue try catch finally throw begin process end in trap using class enum filter')],
      ['n', words('true false null')],
      ['f', R`\b[A-Za-z]+-[A-Za-z]\w*\b`],
      ['a', R`(?<=\s)-[A-Za-z]\w*`],
      ['n', R`(?<![\w.])\d+(?:\.\d+)?\b`],
    ],
  },

  lua: {
    rules: [
      ['c', R`--\[(?<eqc>=*)\[[\s\S]*?(?:\]\k<eqc>\]|$)|--[^\n]*`],
      ['s', R`\[(?<eqs>=*)\[[\s\S]*?(?:\]\k<eqs>\]|$)`],
      dqString,
      sqString,
      [['k', '', 'f'], R`(\bfunction\b)([ \t]+)([A-Za-z_][\w.:]*)`],
      ['k', words('and break do else elseif end for function goto if in local not or repeat return then until while')],
      ['n', words('true false nil')],
      ['b', words('print pairs ipairs require type tostring tonumber setmetatable getmetatable select error assert pcall xpcall table string math os io coroutine')],
      cNumber,
      callName,
    ],
  },

  markdown: {
    rules: [
      ['k', R`${LINE}#{1,6}[ \t][^\n]*`],
      ['c', R`${LINE}>[^\n]*`],
      ['s', R`\`[^\`\n]+\``],
      ['f', R`!?\[[^\]\n]*\]\([^)\n]*\)`],
      ['p', R`${LINE}[ \t]*(?:[-*+]|\d+\.)(?=[ \t])`],
      ['b', R`\*\*[^*\n]+\*\*|__[^_\n]+__`],
    ],
  },

  sql: {
    flags: 'i',
    rules: [
      ['c', R`--[^\n]*|/\*[\s\S]*?(?:\*/|$)`],
      sqString,
      ['s', R`"[^"\n]*"?`],
      [
        'k',
        words(
          'select from where and or not in is null like between join inner outer left right full cross on group by order having limit offset insert into values update set delete create table alter drop index view primary key foreign references unique default as distinct union all case when then else end exists asc desc count sum avg min max begin commit rollback',
        ),
      ],
      ['t', words('int integer bigint smallint tinyint text varchar char boolean bool date time timestamp datetime float double decimal numeric blob')],
      ['n', R`(?<![\w.])\d+\.?\d*\b`],
      callName,
    ],
  },
};

function bashRules(consoleMode) {
  return [
    consoleMode
      ? ['p', R`${LINE}[ \t]*(?:\$|#|>|\(gdb\)|pwndbg>|gef➤|\(lldb\)|>>>)(?=[ \t])`]
      : ['p', R`${LINE}\$(?=[ \t])`],
    ['c', R`(?<=^|\s)#[^\n]*`],
    ['s', R`"(?:\\[\s\S]|[^"\\])*"?`],
    ['s', R`'[^']*'?`],
    ['v', R`\$(?:\{[^}\n]*\}|[A-Za-z_]\w*|[0-9@*#?$!-])`],
    ['a', R`(?<=\s)--?[A-Za-z][\w-]*`],
    ['k', words('if then else elif fi for while until do done case esac in function select time local export return exit break continue source alias unset')],
    [
      'b',
      words(
        'echo cd ls cat grep sed awk find chmod chown cp mv rm mkdir rmdir touch curl wget tar gzip unzip git make cmake gcc clang python python3 pip node npm sudo apt file strings objdump readelf nm gdb ldd strace ltrace xxd hexdump od head tail wc sort uniq tr cut diff patch nc ssh scp docker ps kill man which printf read test',
      ),
    ],
    ['n', R`(?<![\w.-])(?:0[xX][0-9a-fA-F]+|\d+)\b`],
  ];
}

// language aliases → canonical keys (and display labels)
const ALIASES = {
  c: 'c', h: 'c',
  cpp: 'cpp', 'c++': 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp', hxx: 'cpp',
  py: 'python', python: 'python', python3: 'python', py3: 'python',
  asm: 'asm', nasm: 'asm', masm: 'asm', x86: 'asm', x86asm: 'asm', x64: 'asm', assembly: 'asm', s: 'asm',
  js: 'js', javascript: 'js', mjs: 'js', jsx: 'js', ts: 'js', typescript: 'js', tsx: 'js',
  sh: 'bash', bash: 'bash', zsh: 'bash', shell: 'bash',
  console: 'console', terminal: 'console', 'shell-session': 'console', shellsession: 'console',
  json: 'json', jsonc: 'json',
  yml: 'yaml', yaml: 'yaml',
  ini: 'ini', toml: 'ini', cfg: 'ini', conf: 'ini', properties: 'ini',
  diff: 'diff', patch: 'diff',
  html: 'html', xml: 'html', svg: 'html', xhtml: 'html', htm: 'html',
  css: 'css',
  rust: 'rust', rs: 'rust',
  go: 'go', golang: 'go',
  java: 'java', kotlin: 'java', kt: 'java', cs: 'java', csharp: 'java', 'c#': 'java',
  sql: 'sql',
  bat: 'bat', batch: 'bat', cmd: 'bat',
  powershell: 'powershell', ps1: 'powershell', pwsh: 'powershell', ps: 'powershell',
  lua: 'lua',
  markdown: 'markdown', md: 'markdown',
};

export const LANG_LABELS = {
  c: 'C', cpp: 'C++', python: 'Python', asm: 'ASM', js: 'JavaScript', bash: 'Bash', console: 'Console', json: 'JSON',
  yaml: 'YAML', ini: 'INI', diff: 'Diff', html: 'HTML', css: 'CSS', rust: 'Rust', go: 'Go', java: 'Java', sql: 'SQL',
  bat: 'Batch', powershell: 'PowerShell', lua: 'Lua', markdown: 'Markdown',
};

const PLAIN = new Set(['', 'text', 'txt', 'plain', 'plaintext', 'none', 'output', 'log', 'raw', 'hex']);

/** Canonical language key for a fence tag (or null = plain text). */
export function normalizeLang(lang) {
  if (!lang) return null;
  const key = String(lang).toLowerCase();
  if (PLAIN.has(key)) return null;
  return ALIASES[key] || null;
}

const compiled = new Map();
function compileLang(key) {
  let c = compiled.get(key);
  if (c) return c;
  const def = LANGS[key];
  const parts = [];
  const meta = [];
  let gi = 1;
  for (const [cls, src] of def.rules) {
    const inner = new RegExp(src + '|').exec('').length - 1;
    parts.push('(' + src + ')');
    meta.push({ cls, gi, inner });
    gi += 1 + inner;
  }
  c = { re: new RegExp(parts.join('|'), 'g' + (def.flags || '')), meta };
  compiled.set(key, c);
  return c;
}

/**
 * Highlight `code`. Returns an array of per-line HTML (spans never cross a newline), or null when `lang` is unknown.
 */
export function highlight(code, lang) {
  const key = normalizeLang(lang);
  if (!key) return null;
  const { re, meta } = compileLang(key);

  const lines = [];
  let cur = '';
  const emit = (cls, text) => {
    if (!text) return;
    let start = 0;
    for (;;) {
      const nl = text.indexOf('\n', start);
      const seg = nl === -1 ? (start === 0 ? text : text.slice(start)) : text.slice(start, nl);
      if (seg) cur += cls ? `<i class=${cls}>${esc(seg)}</i>` : esc(seg);
      if (nl === -1) break;
      lines.push(cur);
      cur = '';
      start = nl + 1;
    }
  };

  re.lastIndex = 0;
  let last = 0;
  let m;
  while ((m = re.exec(code))) {
    if (m[0].length === 0) {
      re.lastIndex++;
      continue;
    }
    if (m.index > last) emit('', code.slice(last, m.index));
    for (let i = 0; i < meta.length; i++) {
      const r = meta[i];
      if (m[r.gi] === undefined) continue;
      if (typeof r.cls === 'string') emit(r.cls, m[0]);
      else for (let j = 0; j < r.inner; j++) emit(r.cls[j], m[r.gi + 1 + j] || '');
      break;
    }
    last = re.lastIndex;
  }
  if (last < code.length) emit('', code.slice(last));
  lines.push(cur);
  return lines;
}
