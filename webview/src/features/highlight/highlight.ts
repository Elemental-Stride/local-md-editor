// コードブロック用の依存ゼロな小さなトークナイザ。バンドルサイズを抑え、
// 100KB 超のハイライタを引き込まないために、対応言語と粒度は意図的に絞って
// いる（よく使う数言語を粗く色分けする程度）。未対応言語は素のテキストに
// フォールバックする。

export type TokenType =
  | "plain"
  | "keyword"
  | "string"
  | "comment"
  | "number"
  | "function"
  | "punctuation"
  | "builtin"
  | "tag"
  | "attribute";

export type Token = { type: TokenType; value: string; };

type Pattern = [TokenType, RegExp];

const sticky = (src: string, flags = ""): RegExp => new RegExp(src, flags + "y");

const KW_JS = [
  "var",
  "let",
  "const",
  "function",
  "class",
  "extends",
  "if",
  "else",
  "for",
  "while",
  "do",
  "return",
  "break",
  "continue",
  "switch",
  "case",
  "default",
  "throw",
  "try",
  "catch",
  "finally",
  "new",
  "delete",
  "typeof",
  "instanceof",
  "in",
  "of",
  "this",
  "super",
  "import",
  "export",
  "from",
  "as",
  "async",
  "await",
  "yield",
  "void",
];
const KW_TS = [
  ...KW_JS,
  "type",
  "interface",
  "enum",
  "public",
  "private",
  "protected",
  "readonly",
  "implements",
  "namespace",
  "declare",
  "satisfies",
  "abstract",
  "keyof",
  "infer",
  "never",
  "unknown",
  "any",
  "is",
  "module",
  "global",
];
const BI_JS = [
  "true",
  "false",
  "null",
  "undefined",
  "console",
  "window",
  "document",
  "Math",
  "JSON",
  "Object",
  "Array",
  "String",
  "Number",
  "Boolean",
  "Promise",
  "Map",
  "Set",
];

const KW_PY = [
  "False",
  "None",
  "True",
  "and",
  "as",
  "assert",
  "async",
  "await",
  "break",
  "class",
  "continue",
  "def",
  "del",
  "elif",
  "else",
  "except",
  "finally",
  "for",
  "from",
  "global",
  "if",
  "import",
  "in",
  "is",
  "lambda",
  "nonlocal",
  "not",
  "or",
  "pass",
  "raise",
  "return",
  "try",
  "while",
  "with",
  "yield",
];
const BI_PY = [
  "self",
  "print",
  "len",
  "range",
  "int",
  "str",
  "float",
  "list",
  "dict",
  "set",
  "tuple",
  "bool",
  "None",
  "True",
  "False",
];

const KW_SH = [
  "if",
  "then",
  "else",
  "elif",
  "fi",
  "for",
  "in",
  "do",
  "done",
  "while",
  "case",
  "esac",
  "function",
  "return",
  "break",
  "continue",
  "export",
  "source",
  "local",
  "alias",
  "unset",
  "read",
];
const BI_SH = [
  "echo",
  "cd",
  "ls",
  "pwd",
  "mkdir",
  "rm",
  "cp",
  "mv",
  "cat",
  "grep",
  "sed",
  "awk",
  "find",
  "curl",
  "git",
  "npm",
  "pnpm",
  "node",
  "python",
  "python3",
];

const KW_SQL = [
  "SELECT",
  "FROM",
  "WHERE",
  "INSERT",
  "INTO",
  "VALUES",
  "UPDATE",
  "SET",
  "DELETE",
  "CREATE",
  "TABLE",
  "DROP",
  "ALTER",
  "JOIN",
  "LEFT",
  "RIGHT",
  "INNER",
  "OUTER",
  "ON",
  "AS",
  "AND",
  "OR",
  "NOT",
  "NULL",
  "IS",
  "IN",
  "BETWEEN",
  "LIKE",
  "GROUP",
  "BY",
  "ORDER",
  "HAVING",
  "LIMIT",
  "OFFSET",
  "UNION",
  "DISTINCT",
];

const wordRe = (words: string[]): RegExp => sticky(`(?:${words.join("|")})\\b`);

const COMMON_JS_TS: Pattern[] = [
  ["comment", sticky(`//[^\\n]*`)],
  ["comment", sticky(`/\\*[\\s\\S]*?\\*/`)],
  ["string", sticky(`"(?:\\\\.|[^"\\\\\\n])*"`)],
  ["string", sticky(`'(?:\\\\.|[^'\\\\\\n])*'`)],
  ["string", sticky(`\`(?:\\\\.|[^\`\\\\])*\``)],
  [
    "number",
    sticky(`0[xX][0-9a-fA-F_]+n?|0[bB][01_]+n?|\\d[\\d_]*(?:\\.\\d[\\d_]*)?(?:[eE][+-]?\\d+)?n?`),
  ],
  ["function", sticky(`[A-Za-z_$][\\w$]*(?=\\s*\\()`)],
  ["punctuation", sticky(`[{}()\\[\\];,]`)],
];

const patternsJs = (kw: string[], bi: string[]): Pattern[] => [
  ...COMMON_JS_TS.slice(0, 5), // キーワードより前に コメント + 文字列（順序で最長一致を担保）
  ["keyword", wordRe(kw)],
  ["builtin", wordRe(bi)],
  ...COMMON_JS_TS.slice(5),
];

const patternsPy: Pattern[] = [
  ["comment", sticky(`#[^\\n]*`)],
  ["string", sticky(`"""[\\s\\S]*?"""`)],
  ["string", sticky(`'''[\\s\\S]*?'''`)],
  ["string", sticky(`"(?:\\\\.|[^"\\\\\\n])*"`)],
  ["string", sticky(`'(?:\\\\.|[^'\\\\\\n])*'`)],
  ["keyword", wordRe(KW_PY)],
  ["builtin", wordRe(BI_PY)],
  ["number", sticky(`\\d[\\d_]*(?:\\.\\d[\\d_]*)?(?:[eE][+-]?\\d+)?`)],
  ["function", sticky(`[A-Za-z_][\\w]*(?=\\s*\\()`)],
  ["punctuation", sticky(`[{}()\\[\\]:;,]`)],
];

const patternsSh: Pattern[] = [
  ["comment", sticky(`#[^\\n]*`)],
  ["string", sticky(`"(?:\\\\.|[^"\\\\])*"`)],
  ["string", sticky(`'[^']*'`)],
  ["keyword", wordRe(KW_SH)],
  ["builtin", wordRe(BI_SH)],
  ["number", sticky(`\\b\\d+\\b`)],
  ["function", sticky(`\\$[A-Za-z_][\\w]*|\\$\\{[^}]+\\}`)],
  ["punctuation", sticky(`[|&;()<>]`)],
];

const patternsJson: Pattern[] = [
  ["string", sticky(`"(?:\\\\.|[^"\\\\\\n])*"`)],
  ["keyword", sticky(`(?:true|false|null)\\b`)],
  ["number", sticky(`-?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?`)],
  ["punctuation", sticky(`[{}\\[\\]:,]`)],
];

const patternsCss: Pattern[] = [
  ["comment", sticky(`/\\*[\\s\\S]*?\\*/`)],
  ["string", sticky(`"(?:\\\\.|[^"\\\\\\n])*"|'(?:\\\\.|[^'\\\\\\n])*'`)],
  ["keyword", sticky(`@[A-Za-z-]+`)],
  ["function", sticky(`[A-Za-z-][\\w-]*(?=\\s*\\()`)],
  ["attribute", sticky(`[A-Za-z-][\\w-]*(?=\\s*:)`)],
  ["number", sticky(`-?\\d+(?:\\.\\d+)?(?:px|em|rem|%|vh|vw|s|ms|deg)?`)],
  ["builtin", sticky(`#[A-Fa-f0-9]{3,8}\\b`)],
  ["punctuation", sticky(`[{};:,()]`)],
];

const patternsSql: Pattern[] = [
  ["comment", sticky(`--[^\\n]*`)],
  ["comment", sticky(`/\\*[\\s\\S]*?\\*/`)],
  ["string", sticky(`'(?:''|[^'])*'`)],
  ["keyword", new RegExp(`(?:${KW_SQL.join("|")})\\b`, "iy")],
  ["number", sticky(`\\b\\d+(?:\\.\\d+)?\\b`)],
  ["punctuation", sticky(`[(),;]`)],
];

const patternsYaml: Pattern[] = [
  ["comment", sticky(`#[^\\n]*`)],
  ["attribute", sticky(`[A-Za-z_][\\w-]*(?=\\s*:)`)],
  ["string", sticky(`"(?:\\\\.|[^"\\\\\\n])*"|'[^'\\n]*'`)],
  ["keyword", sticky(`(?:true|false|null|yes|no|on|off)\\b`)],
  ["number", sticky(`-?\\d+(?:\\.\\d+)?`)],
  ["punctuation", sticky(`[{}\\[\\]:,-]`)],
];

const tokenizeWith = (code: string, patterns: Pattern[]): Token[] => {
  const out: Token[] = [];
  let i = 0;
  while (i < code.length) {
    let matched: { type: TokenType; len: number; } | null = null;
    for (const [type, re] of patterns) {
      re.lastIndex = i;
      const m = re.exec(code);
      if (m && m.index === i && m[0].length > 0) {
        matched = { type, len: m[0].length };
        break;
      }
    }
    if (matched) {
      out.push({ type: matched.type, value: code.slice(i, i + matched.len) });
      i += matched.len;
    } else {
      out.push({ type: "plain", value: code[i] });
      i += 1;
    }
  }
  return coalesce(out);
};

// シンプルな状態機械による HTML/XML トークナイザ（正規表現だけだと
// 入れ子のクォートで脆い）。出力するトークン: タグ punctuation、
// タグ名、属性、文字列。
const tokenizeHtml = (code: string): Token[] => {
  const out: Token[] = [];
  let i = 0;
  const push = (type: TokenType, value: string): void => {
    if (value.length === 0) return;
    out.push({ type, value });
  };
  while (i < code.length) {
    const lt = code.indexOf("<", i);
    if (lt === -1) {
      push("plain", code.slice(i));
      break;
    }
    push("plain", code.slice(i, lt));
    // コメント <!-- ... -->
    if (code.startsWith("<!--", lt)) {
      const end = code.indexOf("-->", lt + 4);
      const stop = end === -1 ? code.length : end + 3;
      push("comment", code.slice(lt, stop));
      i = stop;
      continue;
    }
    // タグ開始
    const gt = code.indexOf(">", lt);
    const stop = gt === -1 ? code.length : gt + 1;
    const inner = code.slice(lt, stop);
    // 分解: <, /?, 名前, 属性..., >
    const m = inner.match(/^<\/?\s*([A-Za-z][\w-]*)/);
    if (!m) {
      push("plain", inner);
      i = stop;
      continue;
    }
    push("punctuation", inner[1] === "/" ? "</" : "<");
    push("tag", m[1]);
    let j = m[0].length;
    while (j < inner.length && inner[j] !== ">") {
      const ch = inner[j];
      if (ch === " " || ch === "\t" || ch === "\n") {
        push("plain", ch);
        j++;
        continue;
      }
      if (ch === "/" && inner[j + 1] === ">") {
        push("punctuation", "/>");
        j += 2;
        continue;
      }
      // 属性
      const am = inner.slice(j).match(/^([A-Za-z_:][\w:-]*)\s*(=\s*("[^"]*"|'[^']*'|[^\s>]+))?/);
      if (am) {
        push("attribute", am[1]);
        if (am[2]) {
          push("punctuation", "=");
          const val = am[3];
          if (val.startsWith('"') || val.startsWith("'")) push("string", val);
          else push("plain", val);
        }
        j += am[0].length;
      } else {
        push("plain", ch);
        j++;
      }
    }
    if (j < inner.length && inner[j] === ">") push("punctuation", ">");
    i = stop;
  }
  return coalesce(out);
};

// Markdown: 軽めの色付け。見出し + 強調 + コードスパン + リンク。
const tokenizeMarkdown = (code: string): Token[] => {
  const out: Token[] = [];
  const lines = code.split("\n");
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    if (/^#{1,6}\s/.test(line)) {
      out.push({ type: "keyword", value: line });
    } else if (/^\s*[-*+]\s/.test(line) || /^\s*\d+[.)]\s/.test(line)) {
      const m = line.match(/^\s*([-*+]|\d+[.)])\s/);
      if (m) {
        out.push({ type: "punctuation", value: m[0] });
        out.push(...inlineMd(line.slice(m[0].length)));
      } else {
        out.push(...inlineMd(line));
      }
    } else if (/^>\s?/.test(line)) {
      out.push({ type: "comment", value: line });
    } else {
      out.push(...inlineMd(line));
    }
    if (li < lines.length - 1) out.push({ type: "plain", value: "\n" });
  }
  return coalesce(out);
};

const inlineMd = (line: string): Token[] => {
  const out: Token[] = [];
  let i = 0;
  let buf = "";
  const flush = (): void => {
    if (buf.length > 0) {
      out.push({ type: "plain", value: buf });
      buf = "";
    }
  };
  while (i < line.length) {
    const rest = line.slice(i);
    let m = rest.match(/^`[^`\n]+`/);
    if (m) {
      flush();
      out.push({ type: "string", value: m[0] });
      i += m[0].length;
      continue;
    }
    m = rest.match(/^\*\*[^*\n]+\*\*/) ?? rest.match(/^__[^_\n]+__/);
    if (m) {
      flush();
      out.push({ type: "keyword", value: m[0] });
      i += m[0].length;
      continue;
    }
    m = rest.match(/^!?\[[^\]]*\]\([^)]*\)/);
    if (m) {
      flush();
      out.push({ type: "function", value: m[0] });
      i += m[0].length;
      continue;
    }
    buf += line[i];
    i++;
  }
  flush();
  return out;
};

const coalesce = (tokens: Token[]): Token[] => {
  const out: Token[] = [];
  for (const t of tokens) {
    const last = out[out.length - 1];
    if (last && last.type === t.type) last.value += t.value;
    else out.push({ ...t });
  }
  return out;
};

const normalizeLang = (lang: string): string => {
  const l = lang.trim().toLowerCase();
  if (l === "javascript" || l === "node") return "js";
  if (l === "typescript") return "ts";
  if (l === "jsx") return "js";
  if (l === "tsx") return "ts";
  if (l === "shell" || l === "bash" || l === "zsh") return "sh";
  if (l === "python") return "py";
  if (l === "markdown") return "md";
  if (l === "xml" || l === "svg") return "html";
  return l;
};

export const tokenize = (code: string, lang: string): Token[] => {
  const norm = normalizeLang(lang);
  switch (norm) {
    case "js":
      return tokenizeWith(code, patternsJs(KW_JS, BI_JS));
    case "ts":
      return tokenizeWith(code, patternsJs(KW_TS, BI_JS));
    case "py":
      return tokenizeWith(code, patternsPy);
    case "sh":
      return tokenizeWith(code, patternsSh);
    case "json":
      return tokenizeWith(code, patternsJson);
    case "css":
      return tokenizeWith(code, patternsCss);
    case "sql":
      return tokenizeWith(code, patternsSql);
    case "yaml":
    case "yml":
      return tokenizeWith(code, patternsYaml);
    case "html":
      return tokenizeHtml(code);
    case "md":
      return tokenizeMarkdown(code);
    default:
      return [{ type: "plain", value: code }];
  }
};

export const TOKEN_CLASS: Record<TokenType, string> = {
  plain: "",
  keyword: "text-blue-400",
  string: "text-orange-300",
  comment: "italic text-emerald-500/70",
  number: "text-lime-300",
  function: "text-yellow-200",
  punctuation: "text-zinc-400",
  builtin: "text-cyan-300",
  tag: "text-blue-300",
  attribute: "text-yellow-300",
};

// 言語ピッカーに並べる代表的な言語一覧。"" は「言語指定なし」。
export const LANG_OPTIONS: { value: string; label: string; }[] = [
  { value: "", label: "プレーン" },
  { value: "js", label: "JavaScript" },
  { value: "ts", label: "TypeScript" },
  { value: "tsx", label: "TSX" },
  { value: "jsx", label: "JSX" },
  { value: "json", label: "JSON" },
  { value: "py", label: "Python" },
  { value: "sh", label: "Shell" },
  { value: "html", label: "HTML" },
  { value: "css", label: "CSS" },
  { value: "md", label: "Markdown" },
  { value: "sql", label: "SQL" },
  { value: "yaml", label: "YAML" },
  { value: "mermaid", label: "Mermaid" },
];
