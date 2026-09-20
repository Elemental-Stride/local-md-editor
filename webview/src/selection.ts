// 編集要素（textarea / input / contenteditable）の中で起きたイベントかどうか。
// 編集中はブラウザ既定の挙動（素の markdown のコピー、範囲削除）に任せる。
export const isInEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  if (target.tagName === "TEXTAREA" || target.tagName === "INPUT") return true;
  return target.isContentEditable;
};
