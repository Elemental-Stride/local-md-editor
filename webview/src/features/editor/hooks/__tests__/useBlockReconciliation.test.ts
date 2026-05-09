import type { Block, CodeBlock } from "@local-md-editor/shared";
import { renderHook } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { useBlockReconciliation } from "../useBlockReconciliation.js";

const para = (id: string, source: string): Block => ({
  id,
  kind: "paragraph",
  source,
  inlines: [],
});

const heading = (id: string, source: string): Block => ({
  id,
  kind: "heading",
  level: 1,
  source,
  inlines: [],
});

const code = (id: string, lang: string, value: string): CodeBlock => ({
  id,
  kind: "code",
  lang,
  value,
  source: value,
});

const useReconciliation = () => renderHook(() => useBlockReconciliation()).result.current;

// when: useBlockReconciliation() の reuseIds / blocksLookSame を呼ぶ
describe("useBlockReconciliation", () => {
  describe("blocksLookSame", () => {
    test("source が同じ非 code ブロックを同等と判定できる", () => {
      const r = useReconciliation();
      expect(r.blocksLookSame(para("a", "x"), para("b", "x"))).toBe(true);
    });

    test("source が異なる非 code ブロックを別物として判定できる", () => {
      const r = useReconciliation();
      expect(r.blocksLookSame(para("a", "x"), para("b", "y"))).toBe(false);
    });

    test("kind が違っても source が同じなら同等と判定できる", () => {
      // blocksLookSame は source 等価のみで判定する。kind 確認は呼び出し側責務
      const r = useReconciliation();
      expect(r.blocksLookSame(para("a", "x"), heading("b", "x"))).toBe(true);
    });

    test("code ブロックは lang と value の両方一致で同等と判定できる", () => {
      const r = useReconciliation();
      expect(r.blocksLookSame(code("a", "ts", "1"), code("b", "ts", "1"))).toBe(true);
      expect(r.blocksLookSame(code("a", "ts", "1"), code("b", "js", "1"))).toBe(false);
      expect(r.blocksLookSame(code("a", "ts", "1"), code("b", "ts", "2"))).toBe(false);
    });
  });

  describe("reuseIds", () => {
    test("同位置に同等ブロックがあれば old の id を引き継げる", () => {
      const r = useReconciliation();
      const old = [para("o1", "x"), para("o2", "y")];
      const next = [para("n1", "x"), para("n2", "y")];
      expect(r.reuseIds(old, next).map((b) => b.id)).toEqual(["o1", "o2"]);
    });

    test("位置がずれていても同等ブロックが見つかれば id を引き継げる", () => {
      const r = useReconciliation();
      const old = [para("o1", "x"), para("o2", "y")];
      const next = [para("n1", "y"), para("n2", "x")];
      expect(r.reuseIds(old, next).map((b) => b.id)).toEqual(["o2", "o1"]);
    });

    test("同位置の old と kind が違う場合は他位置から探せる", () => {
      const r = useReconciliation();
      const old = [heading("o1", "x"), para("o2", "y")];
      const next = [para("n1", "y"), para("n2", "x")];
      // n1 (paragraph y) は o2 (paragraph y) と同位置ではないが kind/source 一致
      // n2 (paragraph x) は old に paragraph で source x が無いので id 維持
      expect(r.reuseIds(old, next).map((b) => b.id)).toEqual(["o2", "n2"]);
    });

    test("該当する old が無い new ブロックは元の id を維持できる", () => {
      const r = useReconciliation();
      const old = [para("o1", "x")];
      const next = [para("n1", "z")];
      expect(r.reuseIds(old, next).map((b) => b.id)).toEqual(["n1"]);
    });

    test("同等の old を複数の new で重複利用しない (先勝ち)", () => {
      const r = useReconciliation();
      const old = [para("o1", "x")];
      const next = [para("n1", "x"), para("n2", "x")];
      const result = r.reuseIds(old, next);
      expect(result[0].id).toBe("o1");
      // 2 つ目の n2 は old が使い尽くされているので元の id を維持
      expect(result[1].id).toBe("n2");
    });

    test("空配列同士は空配列を返せる", () => {
      const r = useReconciliation();
      expect(r.reuseIds([], [])).toEqual([]);
    });
  });
});
