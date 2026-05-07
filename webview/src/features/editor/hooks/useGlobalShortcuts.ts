import { useEffect } from "react";

type Args = {
  openSearch: () => void;
  openPalette: () => void;
  moveActiveBlock: (delta: -1 | 1) => void;
};

// グローバルなキーバインド: Cmd+F 検索 / Cmd+P コマンドパレット /
// Cmd+Shift+矢印 でアクティブブロックの上下移動。
export const useGlobalShortcuts = (
  { openSearch, openPalette, moveActiveBlock }: Args,
): void => {
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === "f") {
        e.preventDefault();
        openSearch();
        return;
      }
      if (key === "p") {
        e.preventDefault();
        openPalette();
        return;
      }
      if (e.shiftKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        e.preventDefault();
        moveActiveBlock(e.key === "ArrowUp" ? -1 : 1);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [openSearch, openPalette, moveActiveBlock]);
};
