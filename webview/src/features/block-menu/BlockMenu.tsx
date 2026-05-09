import type { Block, BlockId, Document } from "@local-md-editor/shared";
import { useEffect, useRef } from "react";
import { transformBlock, type TransformKind } from "./transformBlock.js";

export type BlockMenuApply = (
  next: Document,
  focus?: { id: BlockId; cursor: "start" | "end"; },
) => void;

type Props = {
  block: Block;
  document: Document;
  // ハンドル要素の viewport 座標。fixed 配置の基準。
  anchorRect: DOMRect;
  onApply: BlockMenuApply;
  onClose: () => void;
};

type Action = { label: string; hint?: string; run: () => void; };
type Section = { heading: string; actions: Action[]; };

const newId = (): string =>
  `wb${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

// ブロック左の ⋮⋮ ハンドルクリックで開くポップオーバーメニュー。
// kind 変換 (10 種) と move/duplicate/delete を 1 つのメニューに集約する。
// 閉じる契機: メニュー外 mousedown / Esc / 項目クリック / スクロール。
// ハンドル自身を再クリックした場合の close→reopen を避けるため、ハンドルには
// `[data-block-handle]` を付け、外部 mousedown 判定でそれを除外している。
export const BlockMenu = (
  { block, document, anchorRect, onApply, onClose }: Props,
): JSX.Element | null => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent): void => {
      const target = e.target as Element | null;
      if (!target) return;
      if (menuRef.current?.contains(target)) return;
      // ハンドル自身は close 対象から除外し、ハンドル側の onClick で
      // toggle (close) させる。これがないと mousedown→close→click→open で
      // ちらつく。
      if (target.closest("[data-block-handle]")) return;
      onClose();
    };
    const handleKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    // スクロール時はアンカー座標が古くなるので閉じる（Notion 等と同じ挙動）。
    const handleScroll = (): void => onClose();
    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("keydown", handleKey);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [onClose]);

  const idx = document.blocks.findIndex((b) => b.id === block.id);
  if (idx === -1) return null;

  const transform = (kind: TransformKind) => (): void => {
    const blocks = [...document.blocks];
    blocks[idx] = transformBlock(blocks[idx], kind);
    onApply({ blocks }, { id: blocks[idx].id, cursor: "end" });
    onClose();
  };

  const moveUp = (): void => {
    if (idx === 0) return;
    const blocks = [...document.blocks];
    [blocks[idx - 1], blocks[idx]] = [blocks[idx], blocks[idx - 1]];
    onApply({ blocks }, { id: blocks[idx - 1].id, cursor: "end" });
    onClose();
  };

  const moveDown = (): void => {
    if (idx === document.blocks.length - 1) return;
    const blocks = [...document.blocks];
    [blocks[idx], blocks[idx + 1]] = [blocks[idx + 1], blocks[idx]];
    onApply({ blocks }, { id: blocks[idx + 1].id, cursor: "end" });
    onClose();
  };

  const duplicate = (): void => {
    const orig = document.blocks[idx];
    const copy = { ...orig, id: newId() } as Block;
    const blocks = [...document.blocks];
    blocks.splice(idx + 1, 0, copy);
    onApply({ blocks }, { id: copy.id, cursor: "end" });
    onClose();
  };

  const remove = (): void => {
    const blocks = document.blocks.filter((_, i) => i !== idx);
    const focusTarget = blocks[Math.max(0, idx - 1)];
    onApply(
      { blocks },
      focusTarget ? { id: focusTarget.id, cursor: "end" } : undefined,
    );
    onClose();
  };

  const operationActions: Action[] = [];
  if (idx > 0) {
    operationActions.push({ label: "上に移動", hint: "Cmd+Shift+↑", run: moveUp });
  }
  if (idx < document.blocks.length - 1) {
    operationActions.push({ label: "下に移動", hint: "Cmd+Shift+↓", run: moveDown });
  }
  operationActions.push({ label: "複製", run: duplicate });
  operationActions.push({ label: "削除", run: remove });

  const sections: Section[] = [
    {
      heading: "変換",
      actions: [
        { label: "テキスト", run: transform("paragraph") },
        { label: "見出し 1", run: transform("h1") },
        { label: "見出し 2", run: transform("h2") },
        { label: "見出し 3", run: transform("h3") },
        { label: "箇条書き", run: transform("bullet") },
        { label: "番号付きリスト", run: transform("ordered") },
        { label: "タスク", run: transform("todo") },
        { label: "コードブロック", run: transform("code") },
        { label: "引用", run: transform("quote") },
        { label: "区切り線", run: transform("divider") },
      ],
    },
    { heading: "操作", actions: operationActions },
  ];

  return (
    <div
      ref={menuRef}
      className="fixed z-30 min-w-[12rem] rounded border py-1 text-sm shadow-lg"
      style={{
        top: anchorRect.bottom + 4,
        left: anchorRect.left,
        background: "var(--vscode-editorWidget-background)",
        borderColor: "var(--vscode-editorWidget-border)",
        color: "var(--vscode-editorWidget-foreground)",
      }}
    >
      {sections.map((section, sIdx) => (
        <div key={section.heading}>
          {sIdx > 0 && (
            <div
              className="my-1 border-t"
              style={{ borderColor: "var(--vscode-editorWidget-border)" }}
            />
          )}
          <div className="px-3 py-1 text-xs uppercase opacity-50">
            {section.heading}
          </div>
          {section.actions.map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={a.run}
              className="flex w-full items-center justify-between gap-3 px-3 py-1 text-left hover:bg-white/10"
            >
              <span>{a.label}</span>
              {a.hint && <span className="text-xs opacity-60">{a.hint}</span>}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
};
