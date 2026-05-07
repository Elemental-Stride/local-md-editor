import type { BlockId } from "@local-md-editor/shared";
import { useCallback, useState } from "react";

type Return = {
  searchOpen: boolean;
  paletteOpen: boolean;
  searchMatches: Set<BlockId>;
  currentMatchId: BlockId | null;
  openSearch: () => void;
  closeSearch: () => void;
  openPalette: () => void;
  closePalette: () => void;
  // SearchPanel が現在マッチ位置とマッチ集合を更新するときのコールバック。
  // memo 化してあり、SearchPanel 側の useEffect 依存に安定して入れられる。
  handleSearchChange: (current: BlockId | null, ids: Set<BlockId>) => void;
};

// 検索パネルとコマンドパレットの開閉状態 / 検索ハイライト state を集約する。
// 実際のドキュメント変更（置換 / コマンド適用）は useDocumentMutations 側で
// 持っており、ここは UI のオン/オフだけを管理する。
export const useSearchAndPalette = (): Return => {
  const [searchOpen, setSearchOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [searchMatches, setSearchMatches] = useState<Set<BlockId>>(new Set());
  const [currentMatchId, setCurrentMatchId] = useState<BlockId | null>(null);

  const handleSearchChange = useCallback(
    (current: BlockId | null, ids: Set<BlockId>) => {
      setCurrentMatchId(current);
      setSearchMatches(ids);
    },
    [],
  );

  return {
    searchOpen,
    paletteOpen,
    searchMatches,
    currentMatchId,
    openSearch: () => setSearchOpen(true),
    closeSearch: () => setSearchOpen(false),
    openPalette: () => setPaletteOpen(true),
    closePalette: () => setPaletteOpen(false),
    handleSearchChange,
  };
};
