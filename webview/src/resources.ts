import { useEffect, useState } from "react";
import { onMessage, post } from "./vscode.js";

// 解決済みの webview URI のキャッシュ。markdown 内に書かれた元の ref
// （例: "./images/foo.png"）をキーにする。null は「extension が解決を
// 拒否した」を意味し、再レンダリングのたびに extension へ問い合わせ
// 直さないよう同様にキャッシュする。
type Resolved = string | null;
const cache = new Map<string, Resolved>();
const subscribers = new Map<string, Set<(value: Resolved) => void>>();
let started = false;
let counter = 0;

const startListener = (): void => {
  if (started) return;
  started = true;
  onMessage((msg) => {
    if (msg.type !== "resolvedResource") return;
    cache.set(msg.ref, msg.uri);
    const subs = subscribers.get(msg.ref);
    if (subs) {
      for (const fn of subs) fn(msg.uri);
      subscribers.delete(msg.ref);
    }
  });
};

// URL を extension に解決させる必要があるかを判定する。webview から
// そのまま読めるもの（data URL / blob / vscode-webview URI）は素通し、
// http(s) は CSP でブロックされるので解決不能扱い。
export const classifyUrl = (
  url: string,
): { kind: "passthrough"; uri: string; } | { kind: "remote"; } | { kind: "relative"; } => {
  if (url === "") return { kind: "remote" };
  if (url.startsWith("data:")) return { kind: "passthrough", uri: url };
  if (url.startsWith("blob:")) return { kind: "passthrough", uri: url };
  if (url.startsWith("vscode-webview://")) return { kind: "passthrough", uri: url };
  if (/^https?:\/\//i.test(url)) return { kind: "remote" };
  return { kind: "relative" };
};

export const useResolvedUri = (ref: string): Resolved | undefined => {
  const initial = cache.has(ref) ? cache.get(ref) ?? null : undefined;
  const [value, setValue] = useState<Resolved | undefined>(initial);

  useEffect(() => {
    if (cache.has(ref)) {
      setValue(cache.get(ref) ?? null);
      return;
    }
    startListener();
    let alive = true;
    const cb = (v: Resolved): void => {
      if (alive) setValue(v);
    };
    let subs = subscribers.get(ref);
    if (!subs) {
      subs = new Set();
      subscribers.set(ref, subs);
      const requestId = `r${(counter++).toString(36)}-${Date.now().toString(36)}`;
      post({ type: "resolveResource", requestId, ref });
    }
    subs.add(cb);
    return () => {
      alive = false;
      subs?.delete(cb);
    };
  }, [ref]);

  return value;
};
