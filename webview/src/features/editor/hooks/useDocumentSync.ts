import type { Document } from "@local-md-editor/shared";
import { type MutableRefObject, useEffect, useRef, useState } from "react";
import { onMessage, post } from "../../../vscode.js";
import type { BlockReconciliation } from "./useBlockReconciliation.js";

type Args = {
  reconciliation: BlockReconciliation;
  // 外部からのファイル書き換え（他エディタや VS Code の text undo 等）を
  // 検知したときに呼ぶ。webview 側の undo 履歴は外部編集と整合しないため
  // 通常はここで履歴を破棄する。
  onExternalUpdate: () => void;
};

type Return = {
  doc: Document | null;
  setDoc: React.Dispatch<React.SetStateAction<Document | null>>;
  // 各 mutation が「変更直前の Document」を履歴に積むときに参照する ref。
  // setDoc の関数更新内で副作用を起こすと React strict mode の二重実行で
  // 二重記録が走るため、ref で素直に最新値を読む。
  docRef: MutableRefObject<Document | null>;
};

// extension からの `init` / `update` を受け取り、ドキュメント状態の
// 唯一の所有者となる。`update` 時は reuseIds で React のキーを安定させる。
// `external` 由来の update（他エディタからの書き換え）は webview の undo 履歴と
// 整合しないため onExternalUpdate を呼んで履歴破棄を促し、`commit-echo`
// （自前 commit の再パース返り）は履歴を維持する。マウント直後に `ready` を
// 返して初期送信を促す。
export const useDocumentSync = ({ reconciliation, onExternalUpdate }: Args): Return => {
  const [doc, setDoc] = useState<Document | null>(null);
  const docRef = useRef<Document | null>(null);
  // 同期タイミング: render 中に sync する。useEffect で同期すると、
  // 連続入力イベントが同フレーム内で発火するケースで docRef が 1 フレーム
  // 遅れ、handleChange が「直前の prev」を取り損ねて履歴粒度がブレる。
  // ref の代入は idempotent なので strict mode の二重 render でも安全。
  docRef.current = doc;

  useEffect(() => {
    const off = onMessage((msg) => {
      switch (msg.type) {
        case "init":
          onExternalUpdate();
          setDoc(msg.document);
          return;
        case "update":
          if (msg.reason === "external") onExternalUpdate();
          setDoc((prev) => {
            if (!prev) return msg.document;
            return { blocks: reconciliation.reuseIds(prev.blocks, msg.document.blocks) };
          });
          return;
      }
    });
    post({ type: "ready" });
    return off;
  }, [reconciliation, onExternalUpdate]);

  return { doc, setDoc, docRef };
};
