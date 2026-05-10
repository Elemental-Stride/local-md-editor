import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { Editor } from "../Editor.js";

vi.mock("../../mermaid/index.js", () => ({
  MermaidView: () => <div data-testid="mermaid-stub" />,
}));
vi.mock("../../../vscode.js", () => ({
  post: vi.fn(),
  onMessage: () => () => {},
}));
vi.mock("../../../resources.js", () => ({
  classifyUrl: () => ({ kind: "remote" }),
  useResolvedUri: () => null,
}));

// when: <Editor /> をマウントして orchestration が動くか確認する
//
// Editor は 9 個の hook を合成してレンダリングする最上位コンポーネント。
// 個別の hook は別テストで網羅済みなので、ここでは「マウント直後の見た目」と
// 「extension 未接続時の Loading 表示」のスモークテストのみ行う。
describe("Editor", () => {
  test("マウント直後 (doc=null) は Loading… を表示できる", () => {
    render(<Editor />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });
});
