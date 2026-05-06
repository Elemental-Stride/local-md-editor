import { useCallback, useEffect, useState } from "react";
import type {
  Block,
  BlockId,
  Document,
  ParagraphBlock,
} from "@local-md-editor/shared";
import { onMessage, post } from "./vscode.js";
import { BlockList } from "./blocks/BlockList.js";
import { SearchPanel } from "./blocks/SearchPanel.js";
import { CommandPalette } from "./blocks/CommandPalette.js";

const makeBlockId = (): BlockId =>
  `wb${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

const emptyParagraph = (): ParagraphBlock => ({
  id: makeBlockId(),
  kind: "paragraph",
  source: "",
  inlines: [],
});

const indentOf = (block: Block): string =>
  ("source" in block ? (block.source.match(/^( *)/)?.[0] ?? "") : "");

const sourceWithContent = (block: Block, content: string): string => {
  switch (block.kind) {
    case "heading":
      return `${"#".repeat(block.level)} ${content}`;
    case "bulletItem":
      return `${indentOf(block)}- ${content}`;
    case "orderedItem": {
      const m = block.source.match(/^(\s*)(\d+[.)])\s/);
      const indent = m?.[1] ?? indentOf(block);
      const marker = m?.[2] ?? "1.";
      return `${indent}${marker} ${content}`;
    }
    case "taskItem":
      return `${indentOf(block)}- [${block.checked ? "x" : " "}] ${content}`;
    default:
      return content;
  }
};

const nextOrderedMarker = (current: Block): { indent: string; marker: string } => {
  const indent = indentOf(current);
  const m = "source" in current
    ? current.source.match(/^(\s*)(\d+)([.)])\s/)
    : null;
  if (!m) return { indent, marker: "1." };
  return {
    indent: m[1],
    marker: `${parseInt(m[2], 10) + 1}${m[3]}`,
  };
};

const createSiblingWithContent = (current: Block, content: string): Block => {
  const indent = indentOf(current);
  switch (current.kind) {
    case "bulletItem":
      return {
        id: makeBlockId(),
        kind: "bulletItem",
        source: `${indent}- ${content}`,
        inlines: [],
      };
    case "orderedItem": {
      const { indent: i, marker } = nextOrderedMarker(current);
      return {
        id: makeBlockId(),
        kind: "orderedItem",
        source: `${i}${marker} ${content}`,
        inlines: [],
      };
    }
    case "taskItem":
      return {
        id: makeBlockId(),
        kind: "taskItem",
        checked: false,
        source: `${indent}- [ ] ${content}`,
        inlines: [],
      };
    default:
      return {
        id: makeBlockId(),
        kind: "paragraph",
        source: content,
        inlines: [],
      };
  }
};

// 受け取った blocks を (kind, source) で現在の state と照合し、ドキュメント
// 全体の再パース後も React の key を安定させる。
const reuseIds = (oldBlocks: Block[], newBlocks: Block[]): Block[] => {
  const oldUsed = new Set<number>();
  return newBlocks.map((nb, idx) => {
    const sameIdxOld = oldBlocks[idx];
    if (
      sameIdxOld
      && !oldUsed.has(idx)
      && sameIdxOld.kind === nb.kind
      && blocksLookSame(sameIdxOld, nb)
    ) {
      oldUsed.add(idx);
      return { ...nb, id: sameIdxOld.id };
    }
    for (let i = 0; i < oldBlocks.length; i++) {
      if (oldUsed.has(i)) continue;
      const ob = oldBlocks[i];
      if (ob.kind === nb.kind && blocksLookSame(ob, nb)) {
        oldUsed.add(i);
        return { ...nb, id: ob.id };
      }
    }
    return nb;
  });
};

const blocksLookSame = (a: Block, b: Block): boolean => {
  if (a.kind === "code" && b.kind === "code") {
    return a.lang === b.lang && a.value === b.value;
  }
  if ("source" in a && "source" in b) return a.source === b.source;
  return false;
};

export type FocusIntent = { id: BlockId; cursor: "start" | "end" };

export const App = (): JSX.Element => {
  const [doc, setDoc] = useState<Document | null>(null);
  const [focus, setFocus] = useState<FocusIntent | null>(null);
  const [activeBlockId, setActiveBlockId] = useState<BlockId | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [searchMatches, setSearchMatches] = useState<Set<BlockId>>(new Set());
  const [currentMatchId, setCurrentMatchId] = useState<BlockId | null>(null);

  useEffect(() => {
    const off = onMessage((msg) => {
      switch (msg.type) {
        case "init":
          setDoc(msg.document);
          return;
        case "update":
          setDoc((prev) => {
            if (!prev) return msg.document;
            return { blocks: reuseIds(prev.blocks, msg.document.blocks) };
          });
          return;
      }
    });
    post({ type: "ready" });
    return off;
  }, []);

  useEffect(() => {
    if (focus === null) return;
    const t = setTimeout(() => setFocus(null), 0);
    return () => clearTimeout(t);
  }, [focus]);

  // グローバルなキーバインド: Cmd+F 検索 / Cmd+P コマンドパレット /
  // Cmd+Shift+矢印 でブロック移動。
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === "f") {
        e.preventDefault();
        setSearchOpen(true);
        return;
      }
      if (key === "p") {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if (e.shiftKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        e.preventDefault();
        moveActiveBlock(e.key === "ArrowUp" ? -1 : 1);
        return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  const moveActiveBlock = (delta: -1 | 1): void => {
    setDoc((prev) => {
      if (!prev || !activeBlockId) return prev;
      const idx = prev.blocks.findIndex((b) => b.id === activeBlockId);
      if (idx === -1) return prev;
      const target = idx + delta;
      if (target < 0 || target >= prev.blocks.length) return prev;
      const blocks = [...prev.blocks];
      [blocks[idx], blocks[target]] = [blocks[target], blocks[idx]];
      const next: Document = { blocks };
      post({ type: "edit", document: next });
      return next;
    });
  };

  const handleChange = (next: Document): void => {
    setDoc(next);
    post({ type: "edit", document: next });
  };

  const handleCommit = (): void => {
    setDoc((prev) => {
      if (prev) post({ type: "commit", document: prev });
      return prev;
    });
  };

  const insertAfter = (current: Block): void => {
    setDoc((prev) => {
      if (!prev) return prev;
      const idx = prev.blocks.findIndex((b) => b.id === current.id);
      if (idx === -1) return prev;
      const sibling = createSiblingWithContent(current, "");
      const next: Document = {
        blocks: [
          ...prev.blocks.slice(0, idx + 1),
          sibling,
          ...prev.blocks.slice(idx + 1),
        ],
      };
      setFocus({ id: sibling.id, cursor: "end" });
      post({ type: "edit", document: next });
      return next;
    });
  };

  const splitBlock = (current: Block, before: string, after: string): void => {
    setDoc((prev) => {
      if (!prev) return prev;
      const idx = prev.blocks.findIndex((b) => b.id === current.id);
      if (idx === -1) return prev;

      if (current.kind === "orderedItem" && before === "" && after === "") {
        const demoted: ParagraphBlock = {
          id: current.id,
          kind: "paragraph",
          source: "",
          inlines: [],
        };
        const next: Document = {
          blocks: [
            ...prev.blocks.slice(0, idx),
            demoted,
            ...prev.blocks.slice(idx + 1),
          ],
        };
        post({ type: "edit", document: next });
        return next;
      }

      const updated = { ...current, source: sourceWithContent(current, before) } as Block;

      let sibling: Block;
      if (current.kind === "orderedItem") {
        const { indent, marker } = nextOrderedMarker(current);
        sibling = {
          id: makeBlockId(),
          kind: "orderedItem",
          source: `${indent}${marker} ${after}`,
          inlines: [],
        };
      } else {
        sibling = {
          id: makeBlockId(),
          kind: "paragraph",
          source: after,
          inlines: [],
        };
      }

      const next: Document = {
        blocks: [
          ...prev.blocks.slice(0, idx),
          updated,
          sibling,
          ...prev.blocks.slice(idx + 1),
        ],
      };
      setFocus({ id: sibling.id, cursor: "start" });
      post({ type: "edit", document: next });
      return next;
    });
  };

  const deleteAndFocusPrev = (blockId: BlockId): void => {
    setDoc((prev) => {
      if (!prev) return prev;
      const idx = prev.blocks.findIndex((b) => b.id === blockId);
      if (idx === -1) return prev;
      const next: Document = {
        blocks: [...prev.blocks.slice(0, idx), ...prev.blocks.slice(idx + 1)],
      };
      if (idx > 0) setFocus({ id: prev.blocks[idx - 1].id, cursor: "end" });
      post({ type: "edit", document: next });
      return next;
    });
  };

  const reorder = (
    sourceId: BlockId,
    targetId: BlockId,
    where: "before" | "after",
  ): void => {
    if (sourceId === targetId) return;
    setDoc((prev) => {
      if (!prev) return prev;
      const blocks = [...prev.blocks];
      const srcIdx = blocks.findIndex((b) => b.id === sourceId);
      if (srcIdx === -1) return prev;
      const [item] = blocks.splice(srcIdx, 1);
      let tgtIdx = blocks.findIndex((b) => b.id === targetId);
      if (tgtIdx === -1) {
        blocks.splice(srcIdx, 0, item);
        return prev;
      }
      if (where === "after") tgtIdx += 1;
      blocks.splice(tgtIdx, 0, item);
      const next: Document = { blocks };
      post({ type: "edit", document: next });
      return next;
    });
  };

  const navigateOut = (blockId: BlockId, dir: "up" | "down"): void => {
    setDoc((prev) => {
      if (!prev) return prev;
      const idx = prev.blocks.findIndex((b) => b.id === blockId);
      if (idx === -1) return prev;
      const targetIdx = dir === "up" ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= prev.blocks.length) return prev;
      const target = prev.blocks[targetIdx];
      setFocus({ id: target.id, cursor: dir === "up" ? "end" : "start" });
      return prev;
    });
  };

  const startWriting = (): void => {
    const newBlock = emptyParagraph();
    const next: Document = { blocks: [newBlock] };
    setFocus({ id: newBlock.id, cursor: "end" });
    setDoc(next);
    post({ type: "edit", document: next });
  };

  const handleSearchChange = useCallback(
    (current: BlockId | null, ids: Set<BlockId>) => {
      setCurrentMatchId(current);
      setSearchMatches(ids);
    },
    [],
  );

  const handleSearchReplace = (next: Document): void => {
    setDoc(next);
    post({ type: "commit", document: next });
  };

  const handlePaletteApply = (
    next: Document,
    nextFocus?: { id: BlockId; cursor: "start" | "end" },
  ): void => {
    setDoc(next);
    if (nextFocus) setFocus(nextFocus);
    post({ type: "commit", document: next });
  };

  if (!doc) {
    return <div className="p-6 opacity-60">Loading…</div>;
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      {doc.blocks.length === 0
        ? (
          <button
            type="button"
            onClick={startWriting}
            className="w-full rounded border border-dashed border-current/20 p-6 text-left text-sm opacity-50 transition hover:opacity-100"
          >
            クリックして書き始める…
          </button>
        )
        : (
          <BlockList
            document={doc}
            focus={focus}
            onChange={handleChange}
            onCommit={handleCommit}
            onInsertAfter={insertAfter}
            onSplitBlock={splitBlock}
            onDeleteAndFocusPrev={deleteAndFocusPrev}
            onReorder={reorder}
            onNavigateOut={navigateOut}
            onFocus={setActiveBlockId}
            searchMatches={searchMatches}
            currentMatchId={currentMatchId}
          />
        )}
      {searchOpen && (
        <SearchPanel
          document={doc}
          onClose={() => setSearchOpen(false)}
          onActiveMatchChanged={handleSearchChange}
          onReplaceCommit={handleSearchReplace}
        />
      )}
      {paletteOpen && (
        <CommandPalette
          document={doc}
          activeBlockId={activeBlockId}
          onApply={handlePaletteApply}
          onClose={() => setPaletteOpen(false)}
        />
      )}
    </div>
  );
};
