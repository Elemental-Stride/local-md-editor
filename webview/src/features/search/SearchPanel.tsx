import type { Block, BlockId, Document } from "@local-md-editor/shared";
import { useEffect, useMemo, useRef, useState } from "react";

export type SearchMatch = {
  blockId: BlockId;
  // ブロックの検索対象テキスト内でのオフセット（テキスト系ブロックは
  // block.source、コードブロックは block.value）。
  start: number;
  end: number;
};

type Props = {
  document: Document;
  onClose: () => void;
  onActiveMatchChanged: (blockId: BlockId | null, allMatchedIds: Set<BlockId>) => void;
  onReplaceCommit: (next: Document) => void;
};

const searchableTextOf = (block: Block): string | null => {
  switch (block.kind) {
    case "paragraph":
    case "heading":
    case "bulletItem":
    case "orderedItem":
    case "taskItem":
    case "blockquote":
    case "html":
    case "thematicBreak":
    case "other":
      return block.source;
    case "code":
      return block.value;
    case "table":
      // テーブルはまだセル単位の検索に対応していないため、シリアライズ
      // 済み HTML にフォールバックする（少なくとも内容は検索できる）。
      return block.source;
  }
};

const replaceInBlock = (
  block: Block,
  start: number,
  end: number,
  replacement: string,
): Block => {
  if (block.kind === "code") {
    return { ...block, value: block.value.slice(0, start) + replacement + block.value.slice(end) };
  }
  if (block.kind === "table") {
    return {
      ...block,
      source: block.source.slice(0, start) + replacement + block.source.slice(end),
    };
  }
  if ("source" in block) {
    return {
      ...block,
      source: block.source.slice(0, start) + replacement + block.source.slice(end),
    } as Block;
  }
  return block;
};

const findAll = (
  text: string,
  query: string,
  caseSensitive: boolean,
): { start: number; end: number; }[] => {
  if (query === "") return [];
  const out: { start: number; end: number; }[] = [];
  const haystack = caseSensitive ? text : text.toLowerCase();
  const needle = caseSensitive ? query : query.toLowerCase();
  let from = 0;
  while (from <= haystack.length) {
    const i = haystack.indexOf(needle, from);
    if (i === -1) break;
    out.push({ start: i, end: i + needle.length });
    from = i + Math.max(1, needle.length);
  }
  return out;
};

export const SearchPanel = (
  { document, onClose, onActiveMatchChanged, onReplaceCommit }: Props,
): JSX.Element => {
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [showReplace, setShowReplace] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const queryRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    queryRef.current?.focus();
    queryRef.current?.select();
  }, []);

  const matches = useMemo<SearchMatch[]>(() => {
    if (query === "") return [];
    const out: SearchMatch[] = [];
    for (const block of document.blocks) {
      const text = searchableTextOf(block);
      if (text === null) continue;
      for (const m of findAll(text, query, caseSensitive)) {
        out.push({ blockId: block.id, start: m.start, end: m.end });
      }
    }
    return out;
  }, [document, query, caseSensitive]);

  // matches が変わっても activeIndex を範囲内に保つ。
  useEffect(() => {
    if (matches.length === 0) {
      setActiveIndex(0);
      return;
    }
    if (activeIndex >= matches.length) setActiveIndex(matches.length - 1);
  }, [matches, activeIndex]);

  // ヒットしたブロックの集合と現在ヒット中のブロックを親に通知し、
  // BlockList 側でハイライトと現在ヒットへのスクロールを行えるようにする。
  useEffect(() => {
    const ids = new Set(matches.map((m) => m.blockId));
    const current = matches[activeIndex]?.blockId ?? null;
    onActiveMatchChanged(current, ids);
    if (current) {
      const el = window.document.querySelector(`[data-block-id="${current}"]`);
      if (el && "scrollIntoView" in el) {
        (el as HTMLElement).scrollIntoView({ block: "center", behavior: "smooth" });
      }
    }
  }, [matches, activeIndex, onActiveMatchChanged]);

  // 閉じるときにハイライトをクリアする。
  useEffect(() => {
    return () => onActiveMatchChanged(null, new Set());
  }, [onActiveMatchChanged]);

  const next = (): void => {
    if (matches.length === 0) return;
    setActiveIndex((i) => (i + 1) % matches.length);
  };
  const prev = (): void => {
    if (matches.length === 0) return;
    setActiveIndex((i) => (i - 1 + matches.length) % matches.length);
  };

  const replaceCurrent = (): void => {
    const m = matches[activeIndex];
    if (!m) return;
    const blocks = document.blocks.map((b) =>
      b.id === m.blockId ? replaceInBlock(b, m.start, m.end, replacement) : b
    );
    onReplaceCommit({ blocks });
    // インデックスはそのまま据え置き — matches は再計算される。最後の
    // ヒットを置換した場合は上の useEffect で index がクランプされる。
  };

  const replaceAll = (): void => {
    if (matches.length === 0) return;
    // ブロックごとにヒットをグループ化し、各ブロック内で末尾→先頭の
    // 順に置換していくことで、先頭側のオフセットを有効に保つ。
    const byBlock = new Map<BlockId, SearchMatch[]>();
    for (const m of matches) {
      const arr = byBlock.get(m.blockId) ?? [];
      arr.push(m);
      byBlock.set(m.blockId, arr);
    }
    const blocks = document.blocks.map((b) => {
      const ms = byBlock.get(b.id);
      if (!ms) return b;
      let next = b;
      const sorted = [...ms].sort((a, c) => c.start - a.start);
      for (const m of sorted) next = replaceInBlock(next, m.start, m.end, replacement);
      return next;
    });
    onReplaceCommit({ blocks });
  };

  return (
    <div
      data-overlay-input
      className="fixed right-4 top-4 z-30 w-80 rounded border p-2 text-xs shadow-lg"
      style={{
        background: "var(--vscode-editorWidget-background)",
        borderColor: "var(--vscode-editorWidget-border)",
        color: "var(--vscode-editorWidget-foreground)",
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="mb-1 flex items-center gap-2">
        <input
          ref={queryRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="検索"
          className="flex-1 rounded border bg-transparent px-2 py-1 outline-none"
          style={{ borderColor: "var(--vscode-input-border, transparent)" }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === "Enter") {
              e.preventDefault();
              if (e.shiftKey) prev();
              else next();
            } else if (e.key === "Escape") {
              e.preventDefault();
              onClose();
            }
          }}
        />
        <span className="tabular-nums opacity-70">
          {matches.length === 0 ? "0 / 0" : `${activeIndex + 1} / ${matches.length}`}
        </span>
      </div>
      <div className="mb-1 flex items-center gap-2">
        <label className="flex items-center gap-1 opacity-80">
          <input
            type="checkbox"
            checked={caseSensitive}
            onChange={(e) => setCaseSensitive(e.target.checked)}
          />
          大小区別
        </label>
        <button
          type="button"
          onClick={prev}
          className="rounded px-2 py-1 opacity-80 hover:opacity-100"
        >
          前へ
        </button>
        <button
          type="button"
          onClick={next}
          className="rounded px-2 py-1 opacity-80 hover:opacity-100"
        >
          次へ
        </button>
        <button
          type="button"
          onClick={() => setShowReplace((v) => !v)}
          className="rounded px-2 py-1 opacity-80 hover:opacity-100"
        >
          {showReplace ? "置換を隠す" : "置換"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto rounded px-2 py-1 opacity-80 hover:opacity-100"
        >
          閉じる
        </button>
      </div>
      {showReplace && (
        <div className="flex items-center gap-2">
          <input
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
            placeholder="置換後"
            className="flex-1 rounded border bg-transparent px-2 py-1 outline-none"
            style={{ borderColor: "var(--vscode-input-border, transparent)" }}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === "Enter") {
                e.preventDefault();
                replaceCurrent();
              } else if (e.key === "Escape") {
                e.preventDefault();
                onClose();
              }
            }}
          />
          <button
            type="button"
            onClick={replaceCurrent}
            disabled={matches.length === 0}
            className="rounded px-2 py-1 disabled:opacity-40"
            style={{
              background: "var(--vscode-button-background)",
              color: "var(--vscode-button-foreground)",
            }}
          >
            1件
          </button>
          <button
            type="button"
            onClick={replaceAll}
            disabled={matches.length === 0}
            className="rounded px-2 py-1 disabled:opacity-40"
            style={{
              background: "var(--vscode-button-background)",
              color: "var(--vscode-button-foreground)",
            }}
          >
            全て
          </button>
        </div>
      )}
    </div>
  );
};
