import type { BlockId } from "@local-md-editor/shared";

// 「次に編集状態に入ったブロックでカーソルをどこへ置くか」を伝える 1 回限りの
// 指示。fire-and-forget で、消費後すぐ null に戻す（useDocumentNavigation の
// 自動リセット参照）。features 横断で参照されるため共通型ディレクトリに置く。
export type FocusIntent = { id: BlockId; cursor: "start" | "end" };
