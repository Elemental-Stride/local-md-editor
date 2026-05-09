import { existsSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { DefaultReporter } from "vitest/node";

// tree reporter (DefaultReporter + verbose + renderSucceed) を 2 点だけ調整：
//
// 1. ファイル単位ヘッダー行から path / 件数 / 時間を取り除き project label のみ残す
//    → printTestModule を override し、super の出力をバッファして先頭行を差し替え。
// 2. 起動バナー "RUN v4.x.y <fullPath>" を短縮表示にする
//    → onInit の前後で config.root を一時的に書き換える。printBanner は同期的に
//      config.root を読むので、終わった直後に元に戻して問題ない。
//      - workspace root (pnpm-workspace.yaml がある) なら basename のみ
//      - サブパッケージなら "<parent>/<basename>" 形式
//
// getModuleLog を直接 override する案もあるが DefaultReporter で private 宣言
// されており TS 的に拡張不可。printTestModule / onInit は protected で override 可。

const formatProjectLabel = (root: string): string => {
  if (existsSync(join(root, "pnpm-workspace.yaml"))) {
    return basename(root);
  }
  return `${basename(dirname(root))}/${basename(root)}`;
};

export class CleanTreeReporter extends DefaultReporter {
  override verbose = true;
  override renderSucceed = true;

  override onInit(ctx: Parameters<DefaultReporter["onInit"]>[0]): void {
    const config = ctx.config as { root: string; };
    const originalRoot = config.root;
    config.root = formatProjectLabel(originalRoot);
    try {
      super.onInit(ctx);
    } finally {
      config.root = originalRoot;
    }
  }

  override printTestModule(
    testModule: Parameters<DefaultReporter["printTestModule"]>[0],
  ): void {
    const state = testModule.state();
    if (state === "queued" || state === "pending") return;

    const captured: (string | undefined)[] = [];
    const originalLog = this.log.bind(this);
    this.log = (msg?: string) => {
      captured.push(msg);
    };
    super.printTestModule(testModule);
    this.log = originalLog;

    if (captured.length > 0) {
      originalLog(` ${this.getEntityPrefix(testModule)}`);
    }
    for (let i = 1; i < captured.length; i++) originalLog(captured[i]);
  }
}
