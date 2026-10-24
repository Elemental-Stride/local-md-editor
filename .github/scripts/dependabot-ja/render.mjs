/**
 * Dependabot PR のメタ情報から、日本語のタイトルと本文を組み立てる。
 *
 * 翻訳 API は使わない。外部サービスへ依存せず、同じ入力から常に同じ文面が出ることを
 * 優先して、Dependabot が機械可読に書いた項目を定型文へ差し込む方式にしている。
 */

/** @typedef {import("./parse.mjs").DependabotPr} DependabotPr */

export const JA_BEGIN = "<!-- dependabot-ja:begin -->";
export const JA_END = "<!-- dependabot-ja:end -->";
const ORIGINAL_BEGIN = "<!-- dependabot-ja:original:begin -->";
const ORIGINAL_END = "<!-- dependabot-ja:original:end -->";

const KIND_LABEL = {
  production: "配布物に含まれる",
  development: "開発用",
  indirect: "間接依存",
  unknown: "不明",
};

const LEVEL_LABEL = {
  major: "メジャー",
  minor: "マイナー",
  patch: "パッチ",
  unknown: "-",
};

const DEFAULT_PREFIX = "chore(deps)";

/**
 * 既に日本語化された本文から Dependabot の原文を取り出す。
 * 日本語セクションが無ければ本文そのものが原文。再実行時の入れ子を防ぐ。
 *
 * @param {string} body
 * @returns {string}
 */
export function extractOriginalBody(body) {
  const text = String(body ?? "");
  const begin = text.indexOf(ORIGINAL_BEGIN);
  const end = text.indexOf(ORIGINAL_END);
  if (begin === -1 || end === -1 || end < begin) return text;
  return text.slice(begin + ORIGINAL_BEGIN.length, end).trim();
}

/**
 * @param {DependabotPr} meta
 * @param {string} originalTitle
 * @returns {string}
 */
export function renderTitle(meta, originalTitle) {
  // 依存が 1 件も読めなければ Dependabot の原文を壊さない。
  if (meta.dependencies.length === 0) return String(originalTitle ?? "");

  const prefix = meta.prefix ?? DEFAULT_PREFIX;
  const suffix = meta.security ? " (セキュリティ修正)" : "";
  return `${prefix}: ${renderSubject(meta)}${suffix}`;
}

function renderSubject(meta) {
  if (meta.group) {
    return `${meta.group} グループの依存 ${meta.dependencies.length} 件を更新`;
  }
  if (meta.dependencies.length > 1) {
    return `依存 ${meta.dependencies.length} 件を更新`;
  }
  const [dependency] = meta.dependencies;
  const version = dependency.from && dependency.to
    ? `${dependency.from} から ${dependency.to} に`
    : `${dependency.to ?? "最新"} に`;
  return `${dependency.name} を ${version}更新`;
}

/**
 * @param {DependabotPr} meta
 * @param {string} originalBody
 * @returns {string}
 */
export function renderBody(meta, originalBody) {
  const original = extractOriginalBody(originalBody);
  const sections = [
    meta.security ? "## 🔒 セキュリティ修正を含む依存更新" : "## 依存更新",
    renderLead(meta),
    renderTable(meta),
    renderAdvisories(meta),
    renderChecklist(meta),
    "<sub>この日本語要約は `.github/workflows/dependabot-ja.yml` が自動生成しています。"
    + "内容の正本は下の原文です。</sub>",
    renderOriginal(original),
  ].filter(Boolean);

  return [JA_BEGIN, sections.join("\n\n"), JA_END].join("\n");
}

function renderLead(meta) {
  if (meta.dependencies.length === 0) {
    return "Dependabot による自動更新です。詳細は下の原文を参照してください。";
  }
  const target = meta.group
    ? `${meta.group} グループの依存 ${meta.dependencies.length} 件`
    : `${meta.dependencies.length} 件の依存`;
  const purpose = meta.security
    ? "既知の脆弱性を修正するための更新です。"
    : "定期更新です。";
  return `Dependabot が ${target}を更新しました。${purpose}`;
}

function renderTable(meta) {
  if (meta.dependencies.length === 0) return "";
  const rows = meta.dependencies.map((dependency) => {
    const version = dependency.from && dependency.to
      ? `${dependency.from} → ${dependency.to}`
      : (dependency.to ?? "-");
    return `| \`${dependency.name}\` | ${version} | ${KIND_LABEL[dependency.kind]} | ${
      LEVEL_LABEL[dependency.level]
    } |`;
  });
  return ["| 依存 | バージョン | 区分 | 更新種別 |", "| --- | --- | --- | --- |", ...rows].join(
    "\n",
  );
}

function renderAdvisories(meta) {
  if (meta.advisories.length === 0) return "";
  const items = meta.advisories.map((advisory) =>
    advisory.url ? `- [${advisory.id}](${advisory.url})` : `- ${advisory.id}`
  );
  return ["### 修正される脆弱性", ...items].join("\n");
}

function renderChecklist(meta) {
  const items = [
    "`pnpm install --frozen-lockfile` → `pnpm typecheck` / `pnpm lint` / `pnpm format:check` / `pnpm test` が通る",
  ];
  if (meta.dependencies.some((dependency) => dependency.kind === "production")) {
    items.push("配布物に入る依存のため、VS Code 上で拡張の動作確認を行う");
  }
  if (meta.dependencies.some((dependency) => dependency.level === "major")) {
    items.push("メジャー更新のため、breaking change (CHANGELOG / migration guide) を確認する");
  }
  if (meta.security) {
    items.push(
      "修正版が公開 7 日以上経過しているか (`minimumReleaseAge`)。未経過なら待つか、"
        + "`minimumReleaseAgeExclude` で一時的に除外して手動更新する",
    );
  }
  return ["### マージ前の確認", ...items.map((item) => `- [ ] ${item}`)].join("\n");
}

function renderOriginal(original) {
  return [
    "<details>",
    "<summary>Dependabot の原文 (英語)</summary>",
    "",
    ORIGINAL_BEGIN,
    original,
    ORIGINAL_END,
    "",
    "</details>",
  ].join("\n");
}
