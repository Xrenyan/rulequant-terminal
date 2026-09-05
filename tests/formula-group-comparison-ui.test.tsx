// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FormulaGroupComparison } from "@/components/formula-group-comparison";
import { seedConfig as config, seedRules as rules, seedDraws as draws } from "@/lib/data/seed";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const workers: PendingWorker[] = [];
class PendingWorker {
  onmessage?: (event: MessageEvent) => void;
  onerror?: () => void;
  request?: { key: string };
  stopped = false;
  constructor() { workers.push(this); }
  postMessage(request: { key: string }) { this.request = request; }
  terminate() { this.stopped = true; }
}
afterEach(() => { vi.unstubAllGlobals(); workers.length = 0; });
describe("group comparison request lifecycle", () => {
  it("can restart after changing conditions and returning to a cancelled selection", async () => {
    vi.stubGlobal("Worker", PendingWorker);
    const host = document.createElement("div"), root = createRoot(host);
    const render = (ids: string[]) => root.render(<FormulaGroupComparison draws={draws} config={config} rules={rules} selectedRuleIds={ids} onSelect={() => {}} />);
    const button = () => [...host.querySelectorAll("button")].find((b) => b.textContent === "开始比较" || b.textContent === "正在比较…")!;
    try {
      await act(async () => render([rules[0].id]));
      await act(async () => button().click());
      expect(button().disabled).toBe(true);
      await act(async () => render([rules[1].id]));
      expect(workers[0].stopped).toBe(true);
      await act(async () => render([rules[0].id]));
      expect(button().disabled).toBe(false);
      await act(async () => button().click());
      await act(async () => workers[0].onmessage?.({ data: { key: workers[0].request!.key, ok: false, error: "旧请求错误" } } as MessageEvent));
      expect(host.textContent).not.toContain("旧请求错误");
      await act(async () => workers.at(-1)!.onerror?.());
      expect(host.querySelector('[role="alert"]')?.textContent).toContain("重新比较");
      expect(button().disabled).toBe(false);
    } finally { await act(async () => root.unmount()); }
  });
});
