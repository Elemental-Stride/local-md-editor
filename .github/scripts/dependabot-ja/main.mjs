/**
 * Dependabot PR のタイトル / 本文を日本語へ差し替える。
 * .github/workflows/dependabot-ja.yml から実行される。
 *
 * 必要な環境変数:
 *   GH_TOKEN   pull-requests: write を持つ GITHUB_TOKEN
 *   GH_REPO    owner/repo
 *   PR_NUMBER  対象 PR 番号
 *
 * GitHub API は gh CLI 経由で叩く (runner に同梱されているため追加依存が不要)。
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseDependabotPr } from "./parse.mjs";
import { renderBody, renderTitle } from "./render.mjs";

function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
}

const prNumber = process.env.PR_NUMBER;
if (!prNumber) {
  console.error("PR_NUMBER が未設定です。");
  process.exit(1);
}

const pr = JSON.parse(gh(["pr", "view", prNumber, "--json", "title,body,commits,author"]));

// 手動実行でも人間が書いた PR を書き換えないようにする (gh は bot を app/<slug> で返す)。
if (!/dependabot/i.test(pr.author?.login ?? "")) {
  console.log(`PR #${prNumber} は Dependabot の PR ではないため何もしません。`);
  process.exit(0);
}
const commitMessage = (pr.commits ?? [])
  .map((commit) => `${commit.messageHeadline}\n${commit.messageBody}`)
  .join("\n");

const meta = parseDependabotPr({ title: pr.title, body: pr.body ?? "", commitMessage });
if (meta.dependencies.length === 0) {
  console.warn("commit message から更新対象の依存を読めませんでした。タイトルは原文を維持します。");
}

const title = renderTitle(meta, pr.title);
const body = renderBody(meta, pr.body ?? "");

if (title === pr.title && body === pr.body) {
  console.log(`PR #${prNumber} は既に日本語化済みです。`);
  process.exit(0);
}

const bodyFile = join(mkdtempSync(join(tmpdir(), "dependabot-ja-")), "body.md");
writeFileSync(bodyFile, body, "utf8");
gh(["pr", "edit", prNumber, "--title", title, "--body-file", bodyFile]);

console.log(`PR #${prNumber} を日本語化しました: ${title}`);
