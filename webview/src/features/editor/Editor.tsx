import { BlockList } from "../block-list/index.js";
import { CommandPalette } from "../command-palette/index.js";
import { SearchPanel } from "../search/index.js";
import { useActiveBlock } from "./hooks/useActiveBlock.js";
import { useBlockBuilders } from "./hooks/useBlockBuilders.js";
import { useBlockReconciliation } from "./hooks/useBlockReconciliation.js";
import { useDocumentMutations } from "./hooks/useDocumentMutations.js";
import { useDocumentNavigation } from "./hooks/useDocumentNavigation.js";
import { useDocumentSync } from "./hooks/useDocumentSync.js";
import { useGlobalShortcuts } from "./hooks/useGlobalShortcuts.js";
import { useSearchAndPalette } from "./hooks/useSearchAndPalette.js";

// エディタ全体のオーケストレーション。8 つの hook を配線し、状態を JSX に
// 流すだけのトップレベルコンポーネント。状態を持たず、純粋に hook の合成。
export const Editor = (): JSX.Element => {
  const builders = useBlockBuilders();
  const reconciliation = useBlockReconciliation();
  const { doc, setDoc } = useDocumentSync({ reconciliation });
  const { focus, setFocus, navigateOut } = useDocumentNavigation({ setDoc });
  const mutations = useDocumentMutations({ setDoc, setFocus, builders });
  const { activeBlockId, setActiveBlockId, moveActiveBlock } = useActiveBlock({ setDoc });
  const overlays = useSearchAndPalette();
  useGlobalShortcuts({
    openSearch: overlays.openSearch,
    openPalette: overlays.openPalette,
    moveActiveBlock,
  });

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
