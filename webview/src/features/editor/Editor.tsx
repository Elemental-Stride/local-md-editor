import { useCallback } from "react";
import { post } from "../../vscode.js";
import { BlockList } from "../block-list/index.js";
import { CommandPalette } from "../command-palette/index.js";
import { SearchPanel } from "../search/index.js";
import { useActiveBlock } from "./hooks/useActiveBlock.js";
import { useBlockBuilders } from "./hooks/useBlockBuilders.js";
import { useBlockReconciliation } from "./hooks/useBlockReconciliation.js";
import { useDocumentHistory } from "./hooks/useDocumentHistory.js";
import { useDocumentMutations } from "./hooks/useDocumentMutations.js";
import { useDocumentNavigation } from "./hooks/useDocumentNavigation.js";
import { useDocumentSync } from "./hooks/useDocumentSync.js";
import { useDomSelectionDelete } from "./hooks/useDomSelectionDelete.js";
import { useGlobalShortcuts } from "./hooks/useGlobalShortcuts.js";
import { useSearchAndPalette } from "./hooks/useSearchAndPalette.js";

// エディタ全体のオーケストレーション。9 つの hook を配線し、状態を JSX に
// 流すだけのトップレベルコンポーネント。状態を持たず、純粋に hook の合成。
export const Editor = (): JSX.Element => {
  const builders = useBlockBuilders();
  const reconciliation = useBlockReconciliation();
  const history = useDocumentHistory();
  const { doc, setDoc, docRef } = useDocumentSync({
    reconciliation,
    onExternalUpdate: history.reset,
  });
  const { focus, setFocus, focusRef, navigateOut } = useDocumentNavigation({ setDoc });
  const mutations = useDocumentMutations({
    setDoc,
    setFocus,
    builders,
    history,
    docRef,
    focusRef,
  });
  const { activeBlockId, setActiveBlockId, moveActiveBlock } = useActiveBlock({ setDoc });
  const overlays = useSearchAndPalette();

  // undo / redo は history に「現在の doc / focus」を渡して past/future を
  // 一段移動させ、戻ってきたエントリを setDoc / setFocus に流して `edit` で
  // 永続化する。history は state を持たない（ref のみ）ので、ここで
  // 実際の状態反映を担う。
  const undo = useCallback((): void => {
    const cur = docRef.current;
    if (!cur) return;
    const restored = history.popUndo(cur, focusRef.current);
    if (!restored) return;
    setDoc(restored.doc);
    setFocus(restored.focus);
    post({ type: "edit", document: restored.doc });
  }, [history, docRef, focusRef, setDoc, setFocus]);

  const redo = useCallback((): void => {
    const cur = docRef.current;
    if (!cur) return;
    const restored = history.popRedo(cur, focusRef.current);
    if (!restored) return;
    setDoc(restored.doc);
    setFocus(restored.focus);
    post({ type: "edit", document: restored.doc });
  }, [history, docRef, focusRef, setDoc, setFocus]);

  useGlobalShortcuts({
    openSearch: overlays.openSearch,
    openPalette: overlays.openPalette,
    moveActiveBlock,
    undo,
    redo,
  });
  useDomSelectionDelete({ deleteBlocks: mutations.deleteBlocks });

  if (!doc) {
    return <div className="p-6 opacity-60">Loading…</div>;
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      {doc.blocks.length === 0
        ? (
          <button
            type="button"
            onClick={mutations.startWriting}
            className="w-full rounded border border-dashed border-current/20 p-6 text-left text-sm opacity-50 transition hover:opacity-100"
          >
            クリックして書き始める…
          </button>
        )
        : (
          <BlockList
            document={doc}
            focus={focus}
            onChange={mutations.handleChange}
            onCommit={mutations.handleCommit}
            onInsertAfter={mutations.insertAfter}
            onSplitBlock={mutations.splitBlock}
            onDeleteAndFocusPrev={mutations.deleteAndFocusPrev}
            onReorder={mutations.reorder}
            onNavigateOut={navigateOut}
            onFocus={setActiveBlockId}
            searchMatches={overlays.searchMatches}
            currentMatchId={overlays.currentMatchId}
          />
        )}
      {overlays.searchOpen && (
        <SearchPanel
          document={doc}
          onClose={overlays.closeSearch}
          onActiveMatchChanged={overlays.handleSearchChange}
          onReplaceCommit={mutations.applySearchReplacement}
        />
      )}
      {overlays.paletteOpen && (
        <CommandPalette
          document={doc}
          activeBlockId={activeBlockId}
          onApply={mutations.applyPaletteCommand}
          onClose={overlays.closePalette}
        />
      )}
    </div>
  );
};
