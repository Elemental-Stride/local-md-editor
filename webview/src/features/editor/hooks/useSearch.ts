import type { BlockId } from "@local-md-editor/shared";
import { useCallback, useState } from "react";

type Return = {
  searchOpen: boolean;
  searchMatches: Set<BlockId>;
  currentMatchId: BlockId | null;
  openSearch: () => void;
  closeSearch: () => void;
  // SearchPanel が現在マッチ位置とマッチ集合を更新するときのコールバック。
  // memo 化してあり、SearchPanel 側の useEffect 依存に安定して入れられる。
  handleSearchChange: (current: BlockId | null, ids: Set<BlockId>) => void;
};

// 検索パネルの開閉状態 / 検索ハイライト state を集約する。
// 実際のドキュメント変更（置換）は useDocumentMutations 側で持っており、
// ここは UI のオン/オフだけを管理する。
export const useSearch = (): Return => {
  const [searchOpen, setSearchOpen] = useState(false);
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
    searchMatches,
    currentMatchId,
    openSearch: () => setSearchOpen(true),
    closeSearch: () => setSearchOpen(false),
    handleSearchChange,
  };
};
