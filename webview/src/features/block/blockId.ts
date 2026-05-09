import type { BlockId } from "@local-md-editor/shared";

// webview 内で新規作成するブロックの ID 生成。`wb` 接頭で webview 由来である
// ことを示し、衝突回避のため Date.now と Math.random を組み合わせる。
// 同形状のロジックを各所で再実装すると規則がズレる事故になるため、生成は
// このモジュール経由に揃える。
export const makeBlockId = (): BlockId =>
  `wb${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
