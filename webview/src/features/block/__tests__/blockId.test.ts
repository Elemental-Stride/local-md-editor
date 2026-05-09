import { describe, expect, test } from "vitest";
import { makeBlockId } from "../blockId.js";

// when: makeBlockId() を呼ぶ
describe("makeBlockId", () => {
  test("webview 由来を示す wb 接頭辞付きの ID を返せる", () => {
    expect(makeBlockId().startsWith("wb")).toBe(true);
  });

  test("時刻部とランダム部を区切る - を含む ID を返せる", () => {
    expect(makeBlockId()).toMatch(/^wb[0-9a-z]+-[0-9a-z]{4}$/);
  });

  test("連続呼び出しで衝突しない (異なる ID を返せる)", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 50; i++) ids.add(makeBlockId());
    expect(ids.size).toBe(50);
  });
});
