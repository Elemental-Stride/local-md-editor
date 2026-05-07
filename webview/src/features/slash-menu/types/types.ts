import type { Block } from "@local-md-editor/shared";

export type SlashItem = {
  id: string;
  label: string;
  hint: string;
  apply: (block: Block) => Block;
  thenInsertAfter?: boolean;
};

export type SlashMenuController = {
  open: boolean;
  filter: string;
  index: number;
  setIndex: (n: number) => void;
  filteredItems: SlashItem[];
  close: () => void;
  selectItem: (item: SlashItem) => void;
  // textarea の onChange から「内容が変わった結果、メニューを開く / 絞る /
  // 閉じるべきか」をまとめて判断する。oldContent / newContent はマーカーを
  // 除いた本文（contentOf の戻り値）。
  syncFromContentChange: (oldContent: string, newContent: string) => void;
};
