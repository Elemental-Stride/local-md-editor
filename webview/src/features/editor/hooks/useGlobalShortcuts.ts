import { useEffect } from "react";

type Args = {
  openSearch: () => void;
  openPalette: () => void;
  moveActiveBlock: (delta: -1 | 1) => void;
  undo: () => void;
  redo: () => void;
};

// グローバルなキーバインド: Cmd+F 検索 / Cmd+P コマンドパレット /
// Cmd+Shift+矢印 でアクティブブロックの上下移動 /
// Cmd+Z で undo / Cmd+Shift+Z または Ctrl+Y で redo。
// 検索パネルやコマンドパレットの input/textarea にフォーカスがある場合は
// document 側の undo/redo は発火させず、ネイティブの input 内 undo に委ねる。
export const useGlobalShortcuts = (
  { openSearch, openPalette, moveActiveBlock, undo, redo }: Args,
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
      if (key === "z") {
        // IME 変換中は document の undo / ネイティブ undo どちらも誤動作の
        // もとになる（変換途中の状態を巻き戻すと残骸が確定時に注入される
        // 事故が起きやすい）。明示的に no-op にして、ユーザに変換確定を
        // 先に行ってもらう運用に寄せる。
        if (e.isComposing) {
          e.preventDefault();
          e.stopImmediatePropagation();
          return;
        }
        // 検索パネル / コマンドパレット入力中はネイティブ undo を尊重する。
        if (isInOverlayInput(e.target)) return;
        // textarea のネイティブ undo を確実に止めるため preventDefault に
        // 加えて伝播も停止する（capture フェーズで先回りしている）。
        // React の controlled textarea は value 再代入で undo スタックが
        // 壊れることが知られており、ネイティブ undo を発火させると
        // 「ユーザが打っていない中間状態」が復元される事故になる。
        e.preventDefault();
        e.stopImmediatePropagation();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (key === "y") {
        // Cmd+Z と同様に、IME 変換中は redo を発火しない（変換状態を破壊
        // しないため）。
        if (e.isComposing) {
          e.preventDefault();
          e.stopImmediatePropagation();
          return;
        }
        if (isInOverlayInput(e.target)) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        redo();
        return;
      }
      if (e.shiftKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        e.preventDefault();
        moveActiveBlock(e.key === "ArrowUp" ? -1 : 1);
      }
    };
    // capture フェーズで先取りして、textarea / VS Code 側ハンドラより先に
    // preventDefault する。bubble フェーズだと React の合成イベント処理後に
    // しか走らず、ネイティブ undo を間に合わせで止めきれないケースがある。
    window.addEventListener("keydown", handler, { capture: true });
    return () => window.removeEventListener("keydown", handler, { capture: true });
  }, [openSearch, openPalette, moveActiveBlock, undo, redo]);
};

// オーバーレイ（検索 / コマンドパレット）の input にフォーカスがあるかを
// 判定する。これらの中では document 側 undo を起こさず、ブラウザの input
// 単体 undo にフォールバックする方が自然。data 属性で webview のブロック
// 編集 textarea と区別する。
const isInOverlayInput = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  if (target.tagName !== "INPUT" && target.tagName !== "TEXTAREA") return false;
  return target.closest("[data-overlay-input]") !== null;
};
