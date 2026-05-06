import type { InlineToken } from "./blocks.js";

// 軽量な markdown インラインパーサ。webview（編集中に inlines が次の commit
// で更新される前のテキストを描画する用途）と extension（テーブルセル内容を
// HTML 経由で往復させる用途）の双方から使うため `shared` に置いている。
// 例外を投げず、対応するマーカーが見つからない場合は素のテキストにフォール
// バックする寛容な実装。
export const parseInlines = (text: string): InlineToken[] => {
  const out: InlineToken[] = [];
  let i = 0;
  let bufStart = 0;

  const flushUpTo = (end: number): void => {
    if (end > bufStart) out.push({ type: "text", value: text.slice(bufStart, end) });
    bufStart = end;
  };

  while (i < text.length) {
    const c = text[i];

    // ハード改行: 末尾の半角スペース 2 つ + 改行
    if (c === " " && text[i + 1] === " " && text[i + 2] === "\n") {
      flushUpTo(i);
      out.push({ type: "break" });
      i += 3;
      bufStart = i;
      continue;
    }

    // インラインコード: `text`
    if (c === "`") {
      const close = text.indexOf("`", i + 1);
      if (close > i) {
        flushUpTo(i);
        out.push({ type: "code", value: text.slice(i + 1, close) });
        i = close + 1;
        bufStart = i;
        continue;
      }
    }

    // 画像: ![alt](url) — `!` を確実に消費するためリンクより先に判定する。
    if (c === "!" && text[i + 1] === "[") {
      const m = text.slice(i).match(/^!\[([^\]]*?)\]\(([^)]*)\)/);
      if (m) {
        flushUpTo(i);
        out.push({ type: "image", url: m[2], alt: m[1] });
        i += m[0].length;
        bufStart = i;
        continue;
      }
    }

    // リンク: [text](url)
    if (c === "[") {
      const m = text.slice(i).match(/^\[([^\]]*?)\]\(([^)]*)\)/);
      if (m) {
        flushUpTo(i);
        out.push({
          type: "link",
          url: m[2],
          children: parseInlines(m[1]),
        });
        i += m[0].length;
        bufStart = i;
        continue;
      }
    }

    // 太字: **text** または __text__（同じマーカー同士を貪欲にマッチ）
    if ((c === "*" && text[i + 1] === "*") || (c === "_" && text[i + 1] === "_")) {
      const marker = c + c;
      const close = text.indexOf(marker, i + 2);
      if (close > i + 1) {
        flushUpTo(i);
        out.push({
          type: "strong",
          children: parseInlines(text.slice(i + 2, close)),
        });
        i = close + 2;
        bufStart = i;
        continue;
      }
    }

    // 斜体: 二重マーカーの一部ではない単独の * または _
    if ((c === "*" || c === "_") && text[i + 1] !== c && text[i - 1] !== c) {
      let close = -1;
      for (let j = i + 1; j < text.length; j++) {
        if (text[j] === c && text[j + 1] !== c && text[j - 1] !== c) {
          close = j;
          break;
        }
      }
      if (close > i) {
        flushUpTo(i);
        out.push({
          type: "em",
          children: parseInlines(text.slice(i + 1, close)),
        });
        i = close + 1;
        bufStart = i;
        continue;
      }
    }

    i++;
  }

  flushUpTo(i);
  return out;
};
