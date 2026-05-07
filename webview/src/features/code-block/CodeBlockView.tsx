import {
  type DragEvent,
  type KeyboardEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { CodeBlock } from "@local-md-editor/shared";
import { LANG_OPTIONS } from "../highlight/index.js";
import { CodeBlockPreview } from "./CodeBlockPreview.js";

type Props = {
  block: CodeBlock;
  onChange: (next: CodeBlock) => void;
  onCommit: () => void;
  onDelete: () => void;
  onInsertAfter: () => void;
  onDragStart?: (e: DragEvent<HTMLElement>) => void;
  onNavigateOut: (dir: "up" | "down") => void;
  onFocus?: () => void;
  initiallyEditing?: boolean;
  initialCursor?: "start" | "end";
};

// 現在のキャレット位置で ArrowUp / ArrowDown がブロック外へ抜けるべきか
// 判定する。Up はキャレットより前に `\n` が無いとき、Down は後に無いとき
// 抜ける。段落編集と同じ方針。
const isAtFirstLine = (ta: HTMLTextAreaElement): boolean => {
  return !ta.value.slice(0, ta.selectionStart).includes("\n");
};
const isAtLastLine = (ta: HTMLTextAreaElement): boolean => {
  return !ta.value.slice(ta.selectionEnd).includes("\n");
};

export const CodeBlockView = (
  {
    block,
    onChange,
    onCommit,
    onDelete,
    onInsertAfter,
    onDragStart,
    onNavigateOut,
    onFocus,
    initiallyEditing,
    initialCursor,
  }: Props,
): JSX.Element => {
  const [editing, setEditing] = useState(!!initiallyEditing);
  const [selected, setSelected] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const initialMount = useRef(initiallyEditing === true);

  useLayoutEffect(() => {
    if (!editing) return;
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
    if (initialMount.current) {
      initialMount.current = false;
      const pos = initialCursor === "start" ? 0 : el.value.length;
      el.setSelectionRange(pos, pos);
    }
  }, [editing, block.value, initialCursor]);

  useEffect(() => {
    if (!editing) return;
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [editing, block.value]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.nativeEvent.isComposing) return;
    const ta = e.currentTarget;
    if (e.key === "Escape") {
      e.preventDefault();
      // 編集を抜けた直後にラッパーへフォーカスを移し「選択状態」に。
      // ここで Backspace を押すとブロック自体が削除される。
      setEditing(false);
      requestAnimationFrame(() => wrapperRef.current?.focus());
      return;
    }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      // 通常の Enter はコード内改行として残しつつ、Cmd/Ctrl+Enter で
      // コードブロックを抜けて直下に新しい段落を作る。これがないと
      // 末尾がコードブロックの場合に下へ書き進める手段がなくなる。
      e.preventDefault();
      onInsertAfter();
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const next = block.value.slice(0, start) + "  " + block.value.slice(end);
      onChange({ ...block, value: next });
      requestAnimationFrame(() => ta.setSelectionRange(start + 2, start + 2));
      return;
    }
    if (e.key === "Backspace" && block.value === "") {
      e.preventDefault();
      onDelete();
      return;
    }
    if (e.key === "ArrowUp" && isAtFirstLine(ta)) {
      e.preventDefault();
      onNavigateOut("up");
      return;
    }
    if (e.key === "ArrowDown" && isAtLastLine(ta)) {
      e.preventDefault();
      onNavigateOut("down");
      return;
    }
  };

  return (
    <div
      ref={wrapperRef}
      tabIndex={-1}
      className="rounded border text-[13px] outline-none"
      style={{
        background: "var(--vscode-textCodeBlock-background, rgba(0,0,0,0.25))",
        borderColor: "var(--vscode-editorWidget-border, rgba(255,255,255,0.1))",
        ...(selected && !editing
          ? {
            outline: "2px solid var(--vscode-focusBorder)",
            outlineOffset: "-2px",
          }
          : {}),
      }}
      onFocus={(e) => {
        if (e.target === e.currentTarget) setSelected(true);
      }}
      onBlur={(e) => {
        if (e.target === e.currentTarget) setSelected(false);
      }}
      onKeyDown={(e) => {
        if (editing) return;
        if (e.nativeEvent.isComposing) return;
        if (e.key === "Backspace" || e.key === "Delete") {
          e.preventDefault();
          onDelete();
          return;
        }
        if (e.key === "Enter") {
          // 選択状態での Enter は「下に書き進めたい」意図とみなして
          // 直下に新しい段落を挿入する。コード自体を再編集したい場合は
          // クリックすれば良い。
          e.preventDefault();
          onInsertAfter();
          return;
        }
      }}
    >
      <div className="flex items-center justify-between gap-2 px-2 py-1 text-xs opacity-70">
        <span
          draggable={!!onDragStart}
          onDragStart={onDragStart}
          className="select-none"
          style={{ cursor: onDragStart ? "grab" : undefined }}
          title="ドラッグして並べ替え"
        >
          ⋮⋮ コード
        </span>
        <select
          value={block.lang}
          onChange={(e) => {
            onChange({ ...block, lang: e.target.value });
            // 言語変更は textarea の blur を経由しないため、ここで明示的に
            // commit して保存先の markdown のフェンス情報文字列を更新する。
            queueMicrotask(onCommit);
          }}
          className="rounded bg-transparent px-1 py-px text-xs outline-none"
          style={{ color: "inherit", borderColor: "transparent" }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {LANG_OPTIONS.map((o) => (
            <option key={o.value || "_plain"} value={o.value}>{o.label}</option>
          ))}
          {!LANG_OPTIONS.some((o) => o.value === block.lang) && block.lang !== "" && (
            <option value={block.lang}>{block.lang}</option>
          )}
        </select>
      </div>
      {editing
        ? (
          <textarea
            ref={taRef}
            autoFocus
            value={block.value}
            spellCheck={false}
            className="block w-full resize-none overflow-hidden bg-transparent px-3 py-2 font-mono text-[13px] leading-relaxed outline-none"
            onChange={(e) => onChange({ ...block, value: e.target.value })}
            onFocus={() => onFocus?.()}
            onBlur={() => {
              setEditing(false);
              onCommit();
            }}
            onKeyDown={handleKeyDown}
          />
        )
        : (
          <CodeBlockPreview
            block={block}
            onEnterEdit={() => {
              setEditing(true);
              onFocus?.();
            }}
          />
        )}
    </div>
  );
};
