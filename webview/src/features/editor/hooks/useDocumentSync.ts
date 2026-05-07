import { useEffect, useState } from "react";
import type { Document } from "@local-md-editor/shared";
import { onMessage, post } from "../../../vscode.js";
import type { BlockReconciliation } from "./useBlockReconciliation.js";

type Args = {
  reconciliation: BlockReconciliation;
};

type Return = {
  doc: Document | null;
  setDoc: React.Dispatch<React.SetStateAction<Document | null>>;
};

// extension からの `init` / `update` を受け取り、ドキュメント状態の
// 唯一の所有者となる。`update` 時は reuseIds で React のキーを安定させる。
// マウント直後に `ready` を返して初期送信を促す。
export const useDocumentSync = ({ reconciliation }: Args): Return => {
  const [doc, setDoc] = useState<Document | null>(null);

  useEffect(() => {
    const off = onMessage((msg) => {
      switch (msg.type) {
        case "init":
          setDoc(msg.document);
          return;
        case "update":
          setDoc((prev) => {
            if (!prev) return msg.document;
            return { blocks: reconciliation.reuseIds(prev.blocks, msg.document.blocks) };
          });
          return;
      }
    });
    post({ type: "ready" });
    return off;
  }, [reconciliation]);

  return { doc, setDoc };
};
