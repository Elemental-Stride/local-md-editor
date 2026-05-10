import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// 各テスト後に React の render をクリーンアップ。これがないと render した
// component や window-level listener が次のテストに漏れて DOM 衝突や
// stopImmediatePropagation の事故になる。@testing-library/react は globals
// を検出すると自動で afterEach を呼ぶが、vitest では globals=false のため
// 明示的に行う。
afterEach(() => {
  cleanup();
});
