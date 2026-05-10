import type { Block, Document, OrderedItemBlock } from "@local-md-editor/shared";
import { act, renderHook } from "@testing-library/react";
import { useEffect, useRef, useState } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { FocusIntent } from "../../../../types/document.js";
import { useBlockBuilders } from "../useBlockBuilders.js";
import { useDocumentHistory } from "../useDocumentHistory.js";
import { useDocumentMutations } from "../useDocumentMutations.js";

const postSpy = vi.fn();
vi.mock("../../../../vscode.js", () => ({
  post: (msg: unknown) => postSpy(msg),
}));

afterEach(() => {
  postSpy.mockClear();
});

const para = (id: string, source = id): Block => ({
  id,
  kind: "paragraph",
  source,
  inlines: [],
});
const bullet = (id: string, source: string): Block => ({
  id,
  kind: "bulletItem",
  source,
  inlines: [],
});
const ordered = (id: string, source: string): OrderedItemBlock => ({
  id,
  kind: "orderedItem",
  source,
  inlines: [],
});

// Editor.tsx と同じ配線で hook 群を組み合わせて useDocumentMutations を露出させる
// テスト用 harness。docRef / focusRef は state の useEffect 同期に任せる。
const useMutationsHarness = (initial: Document | null) => {
  const [doc, setDoc] = useState<Document | null>(initial);
  const [focus, setFocus] = useState<FocusIntent | null>(null);
  const docRef = useRef<Document | null>(initial);
  const focusRef = useRef<FocusIntent | null>(null);
  useEffect(() => {
    docRef.current = doc;
  }, [doc]);
  useEffect(() => {
    focusRef.current = focus;
  }, [focus]);

  const builders = useBlockBuilders();
  const history = useDocumentHistory();
  const mutations = useDocumentMutations({
    setDoc,
    setFocus,
    builders,
    history,
    docRef,
    focusRef,
  });
  return { doc, focus, history, ...mutations };
};

// when: useDocumentMutations の各 mutation を呼ぶ
describe("useDocumentMutations", () => {
  describe("handleChange", () => {
    test("setDoc を呼び、edit メッセージを送信できる", () => {
      const { result } = renderHook(() => useMutationsHarness({ blocks: [para("a")] }));
      const next: Document = { blocks: [para("a", "updated")] };
      act(() => result.current.handleChange(next));
      expect(result.current.doc).toEqual(next);
      expect(postSpy).toHaveBeenCalledWith({ type: "edit", document: next });
    });

    test("source を持たないブロックの変更は appendedWhitespace の loop を素通りして soft 扱いできる", () => {
      // appendedWhitespace は全ペアが「source なし or source 同一」なら loop 完走 → false
      // (line 265) を返す。thematicBreak は source プロパティを持つが、ここでは
      // 同じ source のまま id だけ違う / 等を再現したいので、source 同一の paragraph を渡す。
      const initial = { blocks: [para("a", "same"), para("b", "same2")] };
      const { result } = renderHook(() => useMutationsHarness(initial));
      // prev と next の各ブロックの source が完全一致 → loop は continue で抜けて
      // 最終 return false に到達する。kind は "soft" になる。
      act(() =>
        result.current.handleChange({
          blocks: [para("a", "same"), para("b", "same2")],
        })
      );
      // history の最新 checkpoint kind を直接観測する手段はないので、振る舞いの
      // 一貫性 (post 発火 / state 更新) のみ検査する
      expect(postSpy).toHaveBeenCalled();
    });

    test("空白文字の追加を word boundary として hard checkpoint を作れる", () => {
      // hard checkpoint は coalesce ウィンドウ内でも別 step として残るので
      // 連続入力後でも undo が 2 段階 (hard 境界 + 直前) で巻き戻る
      const { result } = renderHook(() => useMutationsHarness({ blocks: [para("a", "hello")] }));
      // 文字追記 (soft)
      act(() => result.current.handleChange({ blocks: [para("a", "helloA")] }));
      // 空白追記 (hard 境界)
      act(() => result.current.handleChange({ blocks: [para("a", "helloA ")] }));
      // 1 回 undo すると "helloA" に戻る (hard 境界の手前)
      const u1 = result.current.history.popUndo(result.current.doc!, null);
      expect(u1?.doc.blocks[0].source).toBe("helloA");
    });
  });

  describe("handleCommit", () => {
    test("現在の doc を commit メッセージとして送信できる", () => {
      const initial = { blocks: [para("a")] };
      const { result } = renderHook(() => useMutationsHarness(initial));
      act(() => result.current.handleCommit());
      expect(postSpy).toHaveBeenCalledWith({ type: "commit", document: initial });
    });
  });

  describe("insertAfter", () => {
    test("paragraph の直後に空 paragraph を挿入できる", () => {
      const { result } = renderHook(() => useMutationsHarness({ blocks: [para("a"), para("c")] }));
      act(() => result.current.insertAfter(result.current.doc!.blocks[0]));
      expect(result.current.doc?.blocks).toHaveLength(3);
      expect(result.current.doc?.blocks[1].kind).toBe("paragraph");
      expect(result.current.doc?.blocks[2].id).toBe("c");
    });

    test("bulletItem の直後には bulletItem を挿入できる", () => {
      const { result } = renderHook(() => useMutationsHarness({ blocks: [bullet("a", "- one")] }));
      act(() => result.current.insertAfter(result.current.doc!.blocks[0]));
      expect(result.current.doc?.blocks[1].kind).toBe("bulletItem");
    });

    test("挿入された兄弟の末尾にフォーカスを設定できる", () => {
      const { result } = renderHook(() => useMutationsHarness({ blocks: [para("a")] }));
      act(() => result.current.insertAfter(result.current.doc!.blocks[0]));
      expect(result.current.focus?.cursor).toBe("end");
      expect(result.current.focus?.id).toBe(result.current.doc?.blocks[1].id);
    });
  });

  describe("splitBlock", () => {
    test("paragraph を 2 つに分割できる", () => {
      const { result } = renderHook(() =>
        useMutationsHarness({ blocks: [para("a", "hello world")] })
      );
      act(() => result.current.splitBlock(result.current.doc!.blocks[0], "hello", " world"));
      expect(result.current.doc?.blocks).toHaveLength(2);
      expect(result.current.doc?.blocks[0].source).toBe("hello");
      expect(result.current.doc?.blocks[1].source).toBe(" world");
    });

    test("分割後は新しい兄弟の先頭にフォーカスを設定できる", () => {
      const { result } = renderHook(() => useMutationsHarness({ blocks: [para("a", "ab")] }));
      act(() => result.current.splitBlock(result.current.doc!.blocks[0], "a", "b"));
      expect(result.current.focus?.cursor).toBe("start");
      expect(result.current.focus?.id).toBe(result.current.doc?.blocks[1].id);
    });

    test("空 orderedItem の Enter は paragraph に降格できる", () => {
      const { result } = renderHook(() => useMutationsHarness({ blocks: [ordered("a", "1. ")] }));
      act(() => result.current.splitBlock(result.current.doc!.blocks[0], "", ""));
      expect(result.current.doc?.blocks).toHaveLength(1);
      expect(result.current.doc?.blocks[0].kind).toBe("paragraph");
    });

    test("orderedItem を分割すると次のマーカーが付与される", () => {
      const { result } = renderHook(() =>
        useMutationsHarness({ blocks: [ordered("a", "1. one")] })
      );
      act(() => result.current.splitBlock(result.current.doc!.blocks[0], "1. one", "two"));
      expect(result.current.doc?.blocks[1].kind).toBe("orderedItem");
      expect(result.current.doc?.blocks[1].source).toBe("2. two");
    });
  });

  describe("deleteAndFocusPrev", () => {
    test("該当 id のブロックを削除し、前のブロックの末尾にフォーカスできる", () => {
      const { result } = renderHook(() =>
        useMutationsHarness({ blocks: [para("a"), para("b"), para("c")] })
      );
      act(() => result.current.deleteAndFocusPrev("b"));
      expect(result.current.doc?.blocks.map((b) => b.id)).toEqual(["a", "c"]);
      expect(result.current.focus).toEqual({ id: "a", cursor: "end" });
    });

    test("先頭ブロックを削除した場合はフォーカスを動かさない", () => {
      const { result } = renderHook(() => useMutationsHarness({ blocks: [para("a"), para("b")] }));
      act(() => result.current.deleteAndFocusPrev("a"));
      expect(result.current.doc?.blocks.map((b) => b.id)).toEqual(["b"]);
      expect(result.current.focus).toBeNull();
    });

    test("存在しない id は no-op として扱える", () => {
      const initial = { blocks: [para("a")] };
      const { result } = renderHook(() => useMutationsHarness(initial));
      act(() => result.current.deleteAndFocusPrev("nonexistent"));
      expect(result.current.doc).toEqual(initial);
    });
  });

  describe("deleteBlocks", () => {
    test("複数ブロックを一括削除できる", () => {
      const { result } = renderHook(() =>
        useMutationsHarness({ blocks: [para("a"), para("b"), para("c")] })
      );
      act(() => result.current.deleteBlocks(new Set(["a", "c"])));
      expect(result.current.doc?.blocks.map((b) => b.id)).toEqual(["b"]);
    });

    test("全削除すると空 paragraph 1 つを補充できる", () => {
      const { result } = renderHook(() => useMutationsHarness({ blocks: [para("a"), para("b")] }));
      act(() => result.current.deleteBlocks(new Set(["a", "b"])));
      expect(result.current.doc?.blocks).toHaveLength(1);
      expect(result.current.doc?.blocks[0].kind).toBe("paragraph");
      expect(result.current.doc?.blocks[0].source).toBe("");
    });

    test("空集合は no-op として扱える", () => {
      const initial = { blocks: [para("a")] };
      const { result } = renderHook(() => useMutationsHarness(initial));
      act(() => result.current.deleteBlocks(new Set()));
      expect(result.current.doc).toEqual(initial);
      expect(postSpy).not.toHaveBeenCalled();
    });
  });

  describe("reorder", () => {
    test("ブロックを別ブロックの後ろへ移動できる", () => {
      const { result } = renderHook(() =>
        useMutationsHarness({ blocks: [para("a"), para("b"), para("c")] })
      );
      act(() => result.current.reorder("a", "c", "after"));
      expect(result.current.doc?.blocks.map((b) => b.id)).toEqual(["b", "c", "a"]);
    });

    test("ブロックを別ブロックの前へ移動できる", () => {
      const { result } = renderHook(() =>
        useMutationsHarness({ blocks: [para("a"), para("b"), para("c")] })
      );
      act(() => result.current.reorder("c", "a", "before"));
      expect(result.current.doc?.blocks.map((b) => b.id)).toEqual(["c", "a", "b"]);
    });

    test("source と target が同じ場合は no-op として扱える", () => {
      const initial = { blocks: [para("a"), para("b")] };
      const { result } = renderHook(() => useMutationsHarness(initial));
      act(() => result.current.reorder("a", "a", "after"));
      expect(result.current.doc).toEqual(initial);
    });

    test("targetId が存在しないとき item を元の位置に戻して prev を返せる", () => {
      // setDoc updater 内で blocks.findIndex(target) が -1 になり、
      // splice(srcIdx, 0, item) で復元 → prev を返す経路 (lines 199-201)
      const initial = { blocks: [para("a"), para("b")] };
      const { result } = renderHook(() => useMutationsHarness(initial));
      act(() => result.current.reorder("a", "missing", "after"));
      // doc は変化しない
      expect(result.current.doc?.blocks.map((b) => b.id)).toEqual(["a", "b"]);
    });

    test("sourceId が存在しないとき何も書き換えずに prev を返せる", () => {
      // setDoc updater 内で srcIdx === -1 → prev を返す経路 (line 196)
      const initial = { blocks: [para("a"), para("b")] };
      const { result } = renderHook(() => useMutationsHarness(initial));
      act(() => result.current.reorder("missing", "a", "before"));
      expect(result.current.doc?.blocks.map((b) => b.id)).toEqual(["a", "b"]);
    });
  });

  describe("startWriting", () => {
    test("ドキュメントを空 paragraph 1 つに置き換えてフォーカスを当てられる", () => {
      const { result } = renderHook(() => useMutationsHarness({ blocks: [] }));
      act(() => result.current.startWriting());
      expect(result.current.doc?.blocks).toHaveLength(1);
      expect(result.current.doc?.blocks[0].kind).toBe("paragraph");
      expect(result.current.focus?.cursor).toBe("end");
    });
  });

  describe("applySearchReplacement / applyBlockCommand", () => {
    test("applySearchReplacement で次 doc に置換し commit を送信できる", () => {
      const { result } = renderHook(() => useMutationsHarness({ blocks: [para("a")] }));
      const next: Document = { blocks: [para("a", "replaced")] };
      act(() => result.current.applySearchReplacement(next));
      expect(result.current.doc).toEqual(next);
      expect(postSpy).toHaveBeenCalledWith({ type: "commit", document: next });
    });

    test("applyBlockCommand で次 doc に置換し、必要なら focus も更新できる", () => {
      const { result } = renderHook(() => useMutationsHarness({ blocks: [para("a")] }));
      const next: Document = { blocks: [para("x")] };
      act(() => result.current.applyBlockCommand(next, { id: "x", cursor: "end" }));
      expect(result.current.doc).toEqual(next);
      expect(result.current.focus).toEqual({ id: "x", cursor: "end" });
    });

    test("applyBlockCommand は nextFocus が無ければ focus を変更しない", () => {
      const { result } = renderHook(() => useMutationsHarness({ blocks: [para("a")] }));
      const next: Document = { blocks: [para("y")] };
      act(() => result.current.applyBlockCommand(next));
      expect(result.current.focus).toBeNull();
    });
  });

  // doc=null は init 未受信状態を表す。各 mutation は no-op で安全に終わるべき。
  describe("docRef.current が null のときの guard", () => {
    test("insertAfter は doc=null だと no-op にできる", () => {
      const { result } = renderHook(() => useMutationsHarness(null));
      act(() => result.current.insertAfter(para("any-id")));
      expect(postSpy).not.toHaveBeenCalled();
      expect(result.current.doc).toBeNull();
    });

    test("splitBlock は doc=null だと no-op にできる", () => {
      const { result } = renderHook(() => useMutationsHarness(null));
      act(() => result.current.splitBlock(para("any-id"), "before", "after"));
      expect(postSpy).not.toHaveBeenCalled();
    });

    test("deleteAndFocusPrev は doc=null だと no-op にできる", () => {
      const { result } = renderHook(() => useMutationsHarness(null));
      act(() => result.current.deleteAndFocusPrev("any-id"));
      expect(postSpy).not.toHaveBeenCalled();
    });

    test("reorder は doc=null だと no-op にできる", () => {
      const { result } = renderHook(() => useMutationsHarness(null));
      act(() => result.current.reorder("a", "b", "after"));
      expect(postSpy).not.toHaveBeenCalled();
    });

    test("startWriting は doc=null でも空 paragraph を作れる (history は記録しない)", () => {
      // `if (prev) history.recordCheckpoint(...)` の else 分岐
      const { result } = renderHook(() => useMutationsHarness(null));
      act(() => result.current.startWriting());
      expect(result.current.doc?.blocks).toHaveLength(1);
      expect(result.current.doc?.blocks[0].kind).toBe("paragraph");
    });

    test("applySearchReplacement は doc=null でも next を反映できる (history は記録しない)", () => {
      const { result } = renderHook(() => useMutationsHarness(null));
      const next: Document = { blocks: [para("z", "replaced")] };
      act(() => result.current.applySearchReplacement(next));
      expect(result.current.doc).toEqual(next);
    });

    test("applyBlockCommand は doc=null でも next を反映できる (history は記録しない)", () => {
      const { result } = renderHook(() => useMutationsHarness(null));
      const next: Document = { blocks: [para("y")] };
      act(() => result.current.applyBlockCommand(next));
      expect(result.current.doc).toEqual(next);
    });
  });

  // insertAfter / splitBlock / deleteAndFocusPrev は対象 id が見つからなければ
  // 元の doc を返して post も発火しない (idx === -1 分岐)。
  describe("対象 id が見つからないときの guard", () => {
    test("insertAfter は不在 block の場合 post を発火しない", () => {
      const { result } = renderHook(() => useMutationsHarness({ blocks: [para("a")] }));
      const before = postSpy.mock.calls.length;
      // doc に存在しない id を持つ Block を渡す
      act(() => result.current.insertAfter(para("missing")));
      expect(postSpy.mock.calls.length).toBe(before);
    });

    test("splitBlock は不在 block の場合 post を発火しない", () => {
      const { result } = renderHook(() => useMutationsHarness({ blocks: [para("a")] }));
      const before = postSpy.mock.calls.length;
      act(() => result.current.splitBlock(para("missing"), "x", "y"));
      expect(postSpy.mock.calls.length).toBe(before);
    });
  });
});
