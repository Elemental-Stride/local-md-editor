import type { Block } from "@local-md-editor/shared";
import { type RefObject, useState } from "react";
import { contentOf, reclassify, withDisplayValue } from "../../block/blockTransforms.js";
import type { LinkPromptController, LinkPromptState } from "../types/types.js";

type Args = {
  block: Block;
  onChange: (next: Block) => void;
  taRef: RefObject<HTMLTextAreaElement>;
};

// `Cmd/Ctrl+K` でリンク挿入モーダルを開く一連の状態を管理する。
// 開いた時点の選択範囲を覚えておき、閉じる際にその範囲を `[label](url)`
// に置き換える。
export const useLinkPrompt = ({ block, onChange, taRef }: Args): LinkPromptController => {
  const [state, setState] = useState<LinkPromptState | null>(null);

  const openFromTextarea = (ta: HTMLTextAreaElement): void => {
    const selStart = ta.selectionStart;
    const selEnd = ta.selectionEnd;
    const display = contentOf(block);
    setState({
      selStart,
      selEnd,
      defaultLabel: display.slice(selStart, selEnd),
      defaultUrl: "",
    });
  };

  const apply = (label: string, url: string): void => {
    if (!state) return;
    const display = contentOf(block);
    const visibleLabel = label === "" ? url : label;
    const inserted = `[${visibleLabel}](${url})`;
    const newDisplay = display.slice(0, state.selStart)
      + inserted
      + display.slice(state.selEnd);
    onChange(reclassify(block, withDisplayValue(block, newDisplay)));
    const caret = state.selStart + inserted.length;
    setState(null);
    requestAnimationFrame(() => {
      const ta = taRef.current;
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(caret, caret);
    });
  };

  const cancel = (): void => {
    setState(null);
    requestAnimationFrame(() => taRef.current?.focus());
  };

  return { state, openFromTextarea, apply, cancel };
};
