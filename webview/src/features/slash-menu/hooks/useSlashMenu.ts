import { type RefObject, useEffect, useState } from "react";
import type { Block } from "@local-md-editor/shared";
import { filterItems } from "../SlashMenu.js";
import type { SlashItem, SlashMenuController } from "../types/types.js";

type Args = {
  block: Block;
  onChange: (next: Block) => void;
  onInsertAfter: (block: Block) => void;
  taRef: RefObject<HTMLTextAreaElement>;
};

export const useSlashMenu = (
  { block, onChange, onInsertAfter, taRef }: Args,
): SlashMenuController => {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [index, setIndex] = useState(0);
  const filteredItems = filterItems(filter);

  useEffect(() => {
    setIndex(0);
  }, [filter]);

  const close = (): void => {
    setOpen(false);
    setFilter("");
  };

  const selectItem = (item: SlashItem): void => {
    const transformed = item.apply(block);
    onChange(transformed);
    if (item.thenInsertAfter) {
      onInsertAfter(transformed);
    }
    close();
    requestAnimationFrame(() => {
      const ta = taRef.current;
      if (!ta) return;
      const len = ta.value.length;
      ta.setSelectionRange(len, len);
    });
  };

  const syncFromContentChange = (oldContent: string, newContent: string): void => {
    if (newContent === "/" && oldContent === "") {
      setOpen(true);
      setFilter("");
      return;
    }
    if (!open) return;
    if (newContent.startsWith("/") && !newContent.includes(" ")) {
      setFilter(newContent.slice(1));
    } else {
      close();
    }
  };

  return { open, filter, index, setIndex, filteredItems, close, selectItem, syncFromContentChange };
};
