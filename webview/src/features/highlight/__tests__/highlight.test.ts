import { describe, expect, test } from "vitest";
import { type Token, tokenize } from "../highlight.js";

const containsToken = (tokens: Token[], type: Token["type"], value: string): boolean =>
  tokens.some((t) => t.type === type && t.value === value);

// when: tokenize(code, lang) を呼ぶ
describe("tokenize", () => {
  describe("フォールバック", () => {
    test("未対応言語を単一の plain トークンとして返せる", () => {
      expect(tokenize("hello", "klingon")).toEqual([
        { type: "plain", value: "hello" },
      ]);
    });
  });

  describe("JS / TS", () => {
    test("JS の const と数値リテラルを認識できる", () => {
      expect(tokenize("const x = 1", "js")).toEqual([
        { type: "keyword", value: "const" },
        { type: "plain", value: " x = " },
        { type: "number", value: "1" },
      ]);
    });

    test("ダブルクォート文字列を string として認識できる", () => {
      const tokens = tokenize(`const s = "hello"`, "js");
      expect(containsToken(tokens, "string", `"hello"`)).toBe(true);
    });

    test("シングルクォート文字列を string として認識できる", () => {
      const tokens = tokenize(`const s = 'hi'`, "js");
      expect(containsToken(tokens, "string", `'hi'`)).toBe(true);
    });

    test("行コメントを comment として認識できる", () => {
      const tokens = tokenize("x // note", "js");
      expect(containsToken(tokens, "comment", "// note")).toBe(true);
    });

    test("ブロックコメントを comment として認識できる", () => {
      const tokens = tokenize("/* hi */", "js");
      expect(containsToken(tokens, "comment", "/* hi */")).toBe(true);
    });

    test("関数呼び出しを function として認識できる", () => {
      const tokens = tokenize("foo(1)", "js");
      expect(containsToken(tokens, "function", "foo")).toBe(true);
    });

    test("組み込みオブジェクトを builtin として認識できる", () => {
      const tokens = tokenize("console", "js");
      expect(containsToken(tokens, "builtin", "console")).toBe(true);
    });

    test("TS の interface キーワードを認識できる", () => {
      const tokens = tokenize("interface X {}", "ts");
      expect(containsToken(tokens, "keyword", "interface")).toBe(true);
    });
  });

  describe("Python", () => {
    test("def キーワードと関数名を認識できる", () => {
      const tokens = tokenize("def foo(x):", "py");
      expect(containsToken(tokens, "keyword", "def")).toBe(true);
      expect(containsToken(tokens, "function", "foo")).toBe(true);
    });

    test("# コメントを認識できる", () => {
      const tokens = tokenize("x = 1 # note", "py");
      expect(containsToken(tokens, "comment", "# note")).toBe(true);
    });

    test("triple-quoted 文字列を string として認識できる", () => {
      const tokens = tokenize(`"""docstring"""`, "py");
      expect(containsToken(tokens, "string", `"""docstring"""`)).toBe(true);
    });
  });

  describe("Shell", () => {
    test("export キーワードと変数参照を認識できる", () => {
      const tokens = tokenize("export $VAR", "sh");
      expect(containsToken(tokens, "keyword", "export")).toBe(true);
      expect(containsToken(tokens, "function", "$VAR")).toBe(true);
    });

    test("# コメントを認識できる", () => {
      const tokens = tokenize("ls # files", "sh");
      expect(containsToken(tokens, "comment", "# files")).toBe(true);
    });
  });

  describe("JSON", () => {
    test("キーと値を string、構造を punctuation として認識できる", () => {
      expect(tokenize('{"k":"v"}', "json")).toEqual([
        { type: "punctuation", value: "{" },
        { type: "string", value: '"k"' },
        { type: "punctuation", value: ":" },
        { type: "string", value: '"v"' },
        { type: "punctuation", value: "}" },
      ]);
    });

    test("true / false / null を keyword として認識できる", () => {
      const tokens = tokenize("true", "json");
      expect(containsToken(tokens, "keyword", "true")).toBe(true);
    });
  });

  describe("CSS", () => {
    test("@-rule を keyword として認識できる", () => {
      const tokens = tokenize("@media (max-width: 600px) {}", "css");
      expect(containsToken(tokens, "keyword", "@media")).toBe(true);
    });

    test("hex カラーを builtin として認識できる", () => {
      const tokens = tokenize("color: #ff00aa;", "css");
      expect(containsToken(tokens, "builtin", "#ff00aa")).toBe(true);
    });

    test("プロパティ名を attribute として認識できる", () => {
      const tokens = tokenize("color: red;", "css");
      expect(containsToken(tokens, "attribute", "color")).toBe(true);
    });
  });

  describe("SQL (case-insensitive)", () => {
    test("大文字 SELECT を keyword として認識できる", () => {
      const tokens = tokenize("SELECT * FROM t", "sql");
      expect(containsToken(tokens, "keyword", "SELECT")).toBe(true);
      expect(containsToken(tokens, "keyword", "FROM")).toBe(true);
    });

    test("小文字 select も keyword として認識できる", () => {
      const tokens = tokenize("select * from t", "sql");
      expect(containsToken(tokens, "keyword", "select")).toBe(true);
    });

    test("-- コメントを認識できる", () => {
      const tokens = tokenize("SELECT 1 -- comment", "sql");
      expect(containsToken(tokens, "comment", "-- comment")).toBe(true);
    });
  });

  describe("YAML", () => {
    test("key: 形式のキーを attribute として認識できる", () => {
      const tokens = tokenize("name: foo", "yaml");
      expect(containsToken(tokens, "attribute", "name")).toBe(true);
    });

    test("true / false を keyword として認識できる", () => {
      const tokens = tokenize("flag: true", "yaml");
      expect(containsToken(tokens, "keyword", "true")).toBe(true);
    });
  });

  describe("HTML", () => {
    test("タグ名を tag として認識できる", () => {
      const tokens = tokenize("<div>x</div>", "html");
      expect(containsToken(tokens, "tag", "div")).toBe(true);
    });

    test("属性を attribute として認識できる", () => {
      const tokens = tokenize(`<a href="x">L</a>`, "html");
      expect(containsToken(tokens, "attribute", "href")).toBe(true);
    });

    test("属性値の文字列を string として認識できる", () => {
      const tokens = tokenize(`<a href="x">L</a>`, "html");
      expect(containsToken(tokens, "string", `"x"`)).toBe(true);
    });

    test("HTML コメントを comment として認識できる", () => {
      const tokens = tokenize("<!-- note -->", "html");
      expect(containsToken(tokens, "comment", "<!-- note -->")).toBe(true);
    });

    test("自己閉じタグ /> を punctuation として認識できる", () => {
      const tokens = tokenize(`<img src="x" />`, "html");
      expect(containsToken(tokens, "punctuation", "/>")).toBe(true);
    });

    test("値なしのバラ属性 (<input disabled>) も attribute として認識できる", () => {
      // tokenizeHtml の `if (am[2])` else 分岐 — `=` が無い属性
      const tokens = tokenize("<input disabled>", "html");
      expect(containsToken(tokens, "attribute", "disabled")).toBe(true);
    });

    test("引用符無しの属性値 (<a href=x>) は plain として認識できる", () => {
      // tokenizeHtml の attribute value 分岐 `else push("plain", val)`
      const tokens = tokenize("<a href=x>", "html");
      expect(containsToken(tokens, "plain", "x")).toBe(true);
    });

    test("タグ名にならない `<` (<>) は plain として認識できる", () => {
      // `if (!m)` true 分岐 — タグ正規表現にマッチしない `<` 始まり
      const tokens = tokenize("<>", "html");
      expect(containsToken(tokens, "plain", "<>")).toBe(true);
    });
  });

  describe("Markdown", () => {
    test("見出し行全体を keyword として認識できる", () => {
      const tokens = tokenize("# Title", "md");
      expect(containsToken(tokens, "keyword", "# Title")).toBe(true);
    });

    test("段落内の太字を keyword として認識できる", () => {
      const tokens = tokenize("**bold**", "md");
      expect(containsToken(tokens, "keyword", "**bold**")).toBe(true);
    });

    test("インラインコードを string として認識できる", () => {
      const tokens = tokenize("`code`", "md");
      expect(containsToken(tokens, "string", "`code`")).toBe(true);
    });

    test("引用行を comment として認識できる", () => {
      const tokens = tokenize("> quoted", "md");
      expect(containsToken(tokens, "comment", "> quoted")).toBe(true);
    });

    test("bullet マーカーを punctuation として認識できる", () => {
      const tokens = tokenize("- item", "md");
      expect(containsToken(tokens, "punctuation", "- ")).toBe(true);
    });

    test("複数行 markdown では行末に plain 改行トークンを挟める", () => {
      // tokenizeMarkdown の `if (li < lines.length - 1)` true 分岐 — 最終行以外で
      // 改行 plain を出力する
      const tokens = tokenize("# A\n# B", "md");
      expect(containsToken(tokens, "plain", "\n")).toBe(true);
    });
  });

  describe("言語エイリアスの正規化", () => {
    test.each<{ alias: string; canonical: string; }>([
      { alias: "typescript", canonical: "ts" },
      { alias: "javascript", canonical: "js" },
      { alias: "node", canonical: "js" },
      { alias: "jsx", canonical: "js" },
      { alias: "tsx", canonical: "ts" },
      { alias: "shell", canonical: "sh" },
      { alias: "bash", canonical: "sh" },
      { alias: "zsh", canonical: "sh" },
      { alias: "python", canonical: "py" },
      { alias: "markdown", canonical: "md" },
      { alias: "xml", canonical: "html" },
      { alias: "svg", canonical: "html" },
    ])("$alias を $canonical エイリアスとして同じ結果を返せる", ({ alias, canonical }) => {
      const code = "x";
      expect(tokenize(code, alias)).toEqual(tokenize(code, canonical));
    });
  });
});
