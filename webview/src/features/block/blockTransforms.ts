import type { Block, HeadingBlock } from "@local-md-editor/shared";

// ブロックの「マーカー（# / - / 1. / [x]）を除いた本文部分」を返す。
// code / table はマーカー概念がないため空文字を返す（呼び出し側はこれらを
// 通常テキスト編集パスに乗せない前提）。
export const contentOf = (block: Block): string => {
  switch (block.kind) {
    case "heading": {
      const m = block.source.match(/^(#{1,6}) /);
      return m ? block.source.slice(m[0].length) : block.source;
    }
    case "bulletItem": {
      const m = block.source.match(/^\s*[-*+] /);
      return m ? block.source.slice(m[0].length) : block.source;
    }
    case "orderedItem": {
      const m = block.source.match(/^\s*\d+[.)] /);
      return m ? block.source.slice(m[0].length) : block.source;
    }
    case "taskItem": {
      const m = block.source.match(/^\s*[-*+] \[[ xX]\] /);
      return m ? block.source.slice(m[0].length) : block.source;
    }
    case "blockquote":
      // 各行の `> ` または `>` 接頭を取り除く（空行は `>` のみのこともある）。
      // 多行引用の表示テキストに対応するため /m フラグで行頭マッチさせる。
      return block.source.replace(/^>[ \t]?/gm, "");
    case "code":
    case "table":
      return "";
    default:
      return block.source;
  }
};

// 本文部分（contentOf の戻り値）を新しいテキストで差し替えた `source` を組み立てる。
// マーカーやインデントは維持する。
export const withDisplayValue = (block: Block, display: string): string => {
  switch (block.kind) {
    case "heading":
      return `${"#".repeat(block.level)} ${display}`;
    case "bulletItem": {
      const indent = block.source.match(/^( *)/)?.[0] ?? "";
      const m = block.source.match(/^\s*([-*+]) /);
      const marker = m?.[1] ?? "-";
      return `${indent}${marker} ${display}`;
    }
    case "orderedItem": {
      const m = block.source.match(/^(\s*)(\d+[.)])\s/);
      const indent = m?.[1] ?? "";
      const marker = m?.[2] ?? "1.";
      return `${indent}${marker} ${display}`;
    }
    case "taskItem": {
      const indent = block.source.match(/^( *)/)?.[0] ?? "";
      const m = block.source.match(/^\s*([-*+]) /);
      const marker = m?.[1] ?? "-";
      return `${indent}${marker} [${block.checked ? "x" : " "}] ${display}`;
    }
    case "blockquote":
      // 各行に `> ` を付け直す。display 内の改行を多行引用として保つため
      // 行ごとに分割して再構成する。空行は `> ` (末尾スペースあり) で出力する。
      return display.split("\n").map((line) => `> ${line}`).join("\n");
    case "code":
    case "table":
      return display;
    default:
      return display;
  }
};

// 編集後の `source` を見て block の kind を再判定する。文脈依存の markdown
// ルール（リストネスト・見出しレベルなど）はドキュメント全体の再パースで
// 担保されるため、ここではトップレベルの marker パターンだけを見る。
export const reclassify = (current: Block, source: string): Block => {
  if (
    current.kind === "blockquote"
    || current.kind === "thematicBreak"
    || current.kind === "html"
    || current.kind === "table"
    || current.kind === "code"
    || current.kind === "other"
  ) {
    if (current.kind === "code" || current.kind === "table") return current;
    return { ...current, source } as Block;
  }

  // 行頭 `> ` (or タブ) で blockquote へ昇格。markdown 仕様では `>` 単体でも
  // 引用だが、`# `/`- ` 等と同様に空白を要求して誤発火を抑える。
  if (/^>[ \t]/.test(source)) {
    return { id: current.id, kind: "blockquote", source };
  }

  const headingMatch = source.match(/^(#{1,6}) /);
  if (headingMatch) {
    const level = headingMatch[1].length as HeadingBlock["level"];
    if (current.kind === "heading" && current.level === level) {
      return { ...current, source, inlines: [] };
    }
    return { id: current.id, kind: "heading", level, source, inlines: [] };
  }

  const taskMatch = source.match(/^\s*[-*+] \[([ xX])\] /);
  if (taskMatch) {
    const checked = taskMatch[1].toLowerCase() === "x";
    if (current.kind === "taskItem") {
      return { ...current, source, checked, inlines: [] };
    }
    return { id: current.id, kind: "taskItem", checked, source, inlines: [] };
  }

  if (/^\s*[-*+] /.test(source)) {
    if (current.kind === "bulletItem") return { ...current, source, inlines: [] };
    return { id: current.id, kind: "bulletItem", source, inlines: [] };
  }

  if (/^\s*\d+[.)] /.test(source)) {
    if (current.kind === "orderedItem") return { ...current, source, inlines: [] };
    return { id: current.id, kind: "orderedItem", source, inlines: [] };
  }

  if (current.kind === "paragraph") return { ...current, source, inlines: [] };
  return { id: current.id, kind: "paragraph", source, inlines: [] };
};

export const headingClass: Record<HeadingBlock["level"], string> = {
  1: "text-3xl font-bold",
  2: "text-2xl font-bold",
  3: "text-xl font-semibold",
  4: "text-lg font-semibold",
  5: "text-base font-semibold",
  6: "text-sm font-semibold",
};

export const orderedMarker = (source: string): string => {
  const m = source.match(/^\s*(\d+)([.)])/);
  return m ? `${m[1]}${m[2]}` : "1.";
};

const sourceIndent = (source: string): number => {
  const m = source.match(/^( *)/);
  return m ? m[0].length : 0;
};

export const indentStyle = (source: string): { paddingLeft: string; } | undefined => {
  const n = sourceIndent(source);
  if (n === 0) return undefined;
  return { paddingLeft: `${n * 0.5}rem` };
};

export const toggleTaskSource = (source: string, checked: boolean): string =>
  source.replace(/(\[)[xX ](\])/, (_, l: string, r: string) => `${l}${checked ? "x" : " "}${r}`);

export const searchHighlightClass = (current: boolean): string =>
  current ? "ring-2 ring-yellow-400/80 bg-yellow-400/10" : "bg-yellow-300/10";
