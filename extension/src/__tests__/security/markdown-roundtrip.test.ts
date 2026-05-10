import { describe, expect, test } from "vitest";
import { documentToMarkdown, markdownToDocument } from "../../markdown.js";

// 非機能テスト (Markdown Compatibility 思想に対応)。
// `markdownToDocument → documentToMarkdown` の round-trip が
// 「1 周で固定点に到達する」ことを property として固定する。
//
// 入力 md と 1 回後の md は normalization で異なって OK だが、
// 1 回後と 2 回後が異なるなら、再パース時に意味/構造が揺れている =
// "Markdown <-> Block UI <-> Markdown" の往復で情報が漏れている、
// つまり「他ツールでも読める Markdown を維持する」原則が壊れている。
//
// 固定点性が壊れる典型例:
// - block 内に編集状態を独自記法で encode してしまっている
// - whitespace / quoting が再パースのたびに微妙に変わる
// - リストやテーブルの正規化が決定的でない

const roundTrip = (md: string): string => documentToMarkdown(markdownToDocument(md));

// when: round-trip 関数を 1 回 / 2 回適用したときの安定性を見る
describe("Markdown round-trip 固定点性", () => {
  describe("単一ブロック種別の固定点", () => {
    // 各 fixture は意味のある最小例。idempotent を確認する目的なので、
    // 「現状の出力と同一かどうか」(snapshot) ではなく「2 回目以降が動かないか」
    // を見る。これにより remark-stringify の出力フォーマットが将来微調整
    // されても、固定点性さえ守られていれば test は通り続ける。
    // dprint-ignore
    test.each`
      name                                | given
      ${"H1 見出しは 1 周で固定点に到達できる"}    | ${"# Title\n"}
      ${"H3 見出しは 1 周で固定点に到達できる"}    | ${"### Sub\n"}
      ${"単純な段落は 1 周で固定点に到達できる"}   | ${"hello world\n"}
      ${"太字付き段落は 1 周で固定点に到達できる"} | ${"**bold** here\n"}
      ${"斜体付き段落は 1 周で固定点に到達できる"} | ${"*em* here\n"}
      ${"リンク付き段落は 1 周で固定点に到達できる"} | ${"[label](https://example.com)\n"}
      ${"画像付き段落は 1 周で固定点に到達できる"} | ${"![alt](./img.png)\n"}
      ${"inline code は 1 周で固定点に到達できる"} | ${"text `code` more\n"}
      ${"順序なしリストは 1 周で固定点に到達できる"} | ${"- one\n- two\n- three\n"}
      ${"順序付きリストは 1 周で固定点に到達できる"} | ${"1. one\n2. two\n"}
      ${"checkbox 未完了は 1 周で固定点に到達できる"} | ${"- [ ] todo\n"}
      ${"checkbox 完了は 1 周で固定点に到達できる"}   | ${"- [x] done\n"}
      ${"フェンス code (lang あり) は 1 周で固定点に到達できる"} | ${"```ts\nconst x = 1;\n```\n"}
      ${"フェンス code (lang なし) は 1 周で固定点に到達できる"} | ${"```\nplain\n```\n"}
      ${"blockquote は 1 周で固定点に到達できる"}     | ${"> quoted\n"}
      ${"水平線は 1 周で固定点に到達できる"}         | ${"---\n"}
    `(
      "$name",
      ({ given }: { given: string; }) => {
        const once = roundTrip(given);
        const twice = roundTrip(once);
        expect(twice).toBe(once);
      },
    );
  });

  describe("複合ドキュメントの固定点", () => {
    // 単一種別だけだと block 間の境界 (blank line 挿入規則等) が試されない。
    // 実利用に近い混在パターンで、ブロック間結合の正規化が決定的かを見る。
    test("見出し + 段落 + リスト の混在は 1 周で固定点に到達できる", () => {
      const given = "# Project\n\nIntro text.\n\n- alpha\n- beta\n";
      const once = roundTrip(given);
      expect(roundTrip(once)).toBe(once);
    });

    test("段落 + コード + 段落 の混在は 1 周で固定点に到達できる", () => {
      const given = "before\n\n```ts\nconst x = 1;\n```\n\nafter\n";
      const once = roundTrip(given);
      expect(roundTrip(once)).toBe(once);
    });

    test("ネストした順序なしリストは 1 周で固定点に到達できる", () => {
      const given = "- top\n  - child\n  - sibling\n- next\n";
      const once = roundTrip(given);
      expect(roundTrip(once)).toBe(once);
    });

    test("checkbox とテキストの混在リストは 1 周で固定点に到達できる", () => {
      const given = "- [ ] open\n- [x] done\n- plain\n";
      const once = roundTrip(given);
      expect(roundTrip(once)).toBe(once);
    });
  });

  describe("空白・改行の正規化が決定的であること", () => {
    // 入力に冗長な空白 / 余分な改行があっても、1 周後の表現は安定する。
    // 「ある意味で normalize されたあとは形が変わらない」ことを担保する。
    // dprint-ignore
    test.each`
      name                                          | given
      ${"末尾改行なし入力でも 1 周で固定点に到達できる"} | ${"# Title"}
      ${"末尾改行多重入力でも 1 周で固定点に到達できる"} | ${"# Title\n\n\n\n"}
      ${"段落間の連続空行入力でも 1 周で固定点に到達できる"} | ${"a\n\n\n\nb\n"}
    `(
      "$name",
      ({ given }: { given: string; }) => {
        const once = roundTrip(given);
        expect(roundTrip(once)).toBe(once);
      },
    );
  });
});
