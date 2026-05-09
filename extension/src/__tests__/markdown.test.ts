import type { BlockKind } from "@local-md-editor/shared";
import { describe, expect, test } from "vitest";
import { documentToMarkdown, markdownToDocument } from "../markdown.js";

// when: markdownToDocument(given) を呼ぶ
describe("markdownToDocument", () => {
  describe("構造の認識", () => {
    // dprint-ignore
    test.each`
      name                                                 | given                       | then
      ${"見出し直後の段落を独立 paragraph として認識できる"} | ${"# Title\n\nbody text\n"} | ${["heading", "paragraph"]}
      ${"連続する bullet を個別の bulletItem に分解できる"}  | ${"- one\n- two\n"}         | ${["bulletItem", "bulletItem"]}
    `(
      "$name",
      ({ given, then }: { given: string; then: BlockKind[]; }) => {
        expect(markdownToDocument(given).blocks.map((b) => b.kind)).toEqual(then);
      },
    );
  });
});

// when: markdownToDocument の結果を documentToMarkdown で戻す
describe("documentToMarkdown", () => {
  describe("往復変換", () => {
    test("見出し + 段落 + 箇条書きを構造を保って markdown に戻せる", () => {
      const input = "# Title\n\nbody\n\n- one\n- two\n";
      const out = documentToMarkdown(markdownToDocument(input));
      expect(out).toContain("# Title");
      expect(out).toContain("body");
      expect(out).toContain("- one");
      expect(out).toContain("- two");
    });
  });
});
