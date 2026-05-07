import type { Block } from "@local-md-editor/shared";

const blocksLookSame = (a: Block, b: Block): boolean => {
  if (a.kind === "code" && b.kind === "code") {
    return a.lang === b.lang && a.value === b.value;
  }
  if ("source" in a && "source" in b) return a.source === b.source;
  return false;
};

// 受け取った blocks を (kind, source) で現在の state と照合し、ドキュメント
// 全体の再パース後も React の key を安定させる。同位置に同等のブロックが
// 残っていれば優先的にその id を引き継ぎ、見つからなければ他位置から探す。
const reuseIds = (oldBlocks: Block[], newBlocks: Block[]): Block[] => {
  const oldUsed = new Set<number>();
  return newBlocks.map((nb, idx) => {
    const sameIdxOld = oldBlocks[idx];
    if (
      sameIdxOld
      && !oldUsed.has(idx)
      && sameIdxOld.kind === nb.kind
      && blocksLookSame(sameIdxOld, nb)
    ) {
      oldUsed.add(idx);
      return { ...nb, id: sameIdxOld.id };
    }
    for (let i = 0; i < oldBlocks.length; i++) {
      if (oldUsed.has(i)) continue;
      const ob = oldBlocks[i];
      if (ob.kind === nb.kind && blocksLookSame(ob, nb)) {
        oldUsed.add(i);
        return { ...nb, id: ob.id };
      }
    }
    return nb;
  });
};

export type BlockReconciliation = {
  reuseIds: (oldBlocks: Block[], newBlocks: Block[]) => Block[];
  blocksLookSame: (a: Block, b: Block) => boolean;
};

const RECONCILIATION: BlockReconciliation = { reuseIds, blocksLookSame };

export const useBlockReconciliation = (): BlockReconciliation => RECONCILIATION;
