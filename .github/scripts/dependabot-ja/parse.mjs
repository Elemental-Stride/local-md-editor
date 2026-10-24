/**
 * Dependabot が作った PR (タイトル / 本文 / commit message) から、日本語化に必要な
 * 情報だけを抜き出す。GitHub API の追加権限を要らなくするため、Dependabot が自分で
 * 書いた文字列だけを情報源にしている。
 *
 * commit message の末尾には Dependabot が機械可読な YAML ブロックを付けている:
 *
 *   ---
 *   updated-dependencies:
 *   - dependency-name: undici
 *     dependency-version: 7.30.1
 *     dependency-type: indirect
 *     update-type: version-update:semver-patch
 *   ...
 *
 * 更新前バージョンだけはこのブロックに無いため、本文の
 * "Bumps [undici](...) from 7.25.0 to 7.30.1." から拾う。
 */

/**
 * @typedef {"production" | "development" | "indirect" | "unknown"} DependencyKind
 * @typedef {"major" | "minor" | "patch" | "unknown"} UpdateLevel
 *
 * @typedef {object} UpdatedDependency
 * @property {string} name 依存パッケージ名
 * @property {string | null} to 更新後バージョン
 * @property {string | null} from 更新前バージョン (本文から拾えた場合のみ)
 * @property {DependencyKind} kind 配布物に入るか / 開発用か / 間接依存か
 * @property {UpdateLevel} level semver 上の更新種別
 *
 * @typedef {object} Advisory
 * @property {string} id GHSA ID または CVE ID
 * @property {string | null} url GitHub Advisory Database の URL (GHSA のみ)
 *
 * @typedef {object} DependabotPr
 * @property {string | null} prefix 元タイトルの conventional commit prefix (例: "chore(deps)")
 * @property {string | null} group グループ更新のグループ名
 * @property {boolean} security 脆弱性修正を含むか
 * @property {UpdatedDependency[]} dependencies
 * @property {Advisory[]} advisories
 */

const DEPENDENCY_KIND = {
  "direct:production": "production",
  "direct:development": "development",
  indirect: "indirect",
};

const UPDATE_LEVEL = {
  "version-update:semver-major": "major",
  "version-update:semver-minor": "minor",
  "version-update:semver-patch": "patch",
};

const GHSA_PATTERN = /GHSA(?:-[23456789cfghjmpqrvwx]{4}){3}/gi;
const CVE_PATTERN = /CVE-\d{4}-\d{4,7}/gi;

/** YAML のスカラーから引用符を外す (scoped package 名は `"@types/node"` の形で来る)。 */
function unquote(value) {
  const trimmed = value.trim();
  const quoted = /^(["'])(.*)\1$/.exec(trimmed);
  return quoted ? quoted[2] : trimmed;
}

/**
 * commit message 末尾の `updated-dependencies:` ブロックを読む。
 *
 * @param {string} commitMessage
 * @returns {UpdatedDependency[]}
 */
export function parseUpdatedDependencies(commitMessage) {
  const lines = String(commitMessage ?? "").split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === "updated-dependencies:");
  if (start === -1) return [];

  /** @type {UpdatedDependency[]} */
  const dependencies = [];
  /** @type {Record<string, string>[]} */
  const raw = [];

  for (const line of lines.slice(start + 1)) {
    const head = /^-\s+dependency-name:\s*(.+)$/.exec(line);
    if (head) {
      raw.push({ "dependency-name": unquote(head[1]) });
      continue;
    }
    const field = /^\s+([a-z-]+):\s*(.+)$/.exec(line);
    if (field && raw.length > 0) {
      raw[raw.length - 1][field[1]] = unquote(field[2]);
      continue;
    }
    // リストを抜けた (`...` / 空行 / Signed-off-by) ので打ち切る。
    break;
  }

  for (const entry of raw) {
    dependencies.push({
      name: entry["dependency-name"],
      to: entry["dependency-version"] ?? null,
      from: null,
      kind: DEPENDENCY_KIND[entry["dependency-type"]] ?? "unknown",
      level: UPDATE_LEVEL[entry["update-type"]] ?? "unknown",
    });
  }
  return dependencies;
}

/**
 * 本文の "Bumps / Updates `name` from X to Y" 行から更新前バージョンを拾う。
 *
 * @param {string} body
 * @returns {Map<string, { from: string; to: string }>}
 */
export function parseVersionTransitions(body) {
  // 行末は固定しない。"from X to Y." の後ろに "**This update includes a security fix.**"
  // のような文が続く形があるため、バージョンは「末尾のピリオドを食わない」形で取る。
  const pattern =
    /^(?:Bumps|Updates)\s+(?:\[([^\]]+)\]\([^)]*\)|`([^`]+)`|(\S+))\s+from\s+(\S+?)\s+to\s+(\S+?)\.?(?=\s|$)/gim;
  const transitions = new Map();
  for (const match of String(body ?? "").matchAll(pattern)) {
    const name = match[1] ?? match[2] ?? match[3];
    if (!transitions.has(name)) transitions.set(name, { from: match[4], to: match[5] });
  }
  return transitions;
}

/**
 * 本文から GHSA / CVE ID を拾う。security updates の本文には Dependabot が
 * "Vulnerabilities fixed" セクションを付けるため、そこに必ず GHSA ID が入る。
 *
 * @param {string} body
 * @returns {Advisory[]}
 */
export function parseAdvisories(body) {
  const text = String(body ?? "");
  /** @type {Map<string, Advisory>} */
  const advisories = new Map();
  for (const match of text.matchAll(GHSA_PATTERN)) {
    // GitHub の表記 (prefix は大文字 / 本体は小文字) に合わせる。
    const id = `GHSA-${match[0].slice("GHSA-".length).toLowerCase()}`;
    advisories.set(id, { id, url: `https://github.com/advisories/${id}` });
  }
  for (const match of text.matchAll(CVE_PATTERN)) {
    const id = match[0].toUpperCase();
    if (!advisories.has(id)) advisories.set(id, { id, url: null });
  }
  return [...advisories.values()];
}

/** 元タイトルの conventional commit prefix を保つ (squash merge のコミット件名になるため)。 */
export function parseTitlePrefix(title) {
  const match = /^([a-z]+(?:\([^)]*\))?)!?:\s/.exec(String(title ?? ""));
  return match ? match[1] : null;
}

/**
 * @param {{ title: string; body: string; commitMessage: string }} pr
 * @returns {DependabotPr}
 */
export function parseDependabotPr({ title, body, commitMessage }) {
  const dependencies = parseUpdatedDependencies(commitMessage);
  const transitions = parseVersionTransitions(body);
  for (const dependency of dependencies) {
    const transition = transitions.get(dependency.name);
    if (transition) {
      dependency.from = transition.from;
      dependency.to ??= transition.to;
    }
  }

  const advisories = parseAdvisories(body);
  const text = String(body ?? "");

  return {
    prefix: parseTitlePrefix(title),
    group: parseGroup(commitMessage),
    security: advisories.length > 0
      || /security (?:fix|update)|Vulnerabilities fixed/i.test(text),
    dependencies,
    advisories,
  };
}

/** グループ更新の場合、commit message の各エントリに同じ dependency-group が入る。 */
function parseGroup(commitMessage) {
  const match = /^\s+dependency-group:\s*(.+)$/m.exec(String(commitMessage ?? ""));
  return match ? unquote(match[1]) : null;
}
