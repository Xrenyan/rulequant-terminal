// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { SystemGuide } from "@/components/system-guide/system-guide";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLDivElement | undefined;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

async function renderGuide(props: React.ComponentProps<typeof SystemGuide> = {}) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(<SystemGuide {...props} />));
  return host;
}

describe("system guide UI", () => {
  it("renders a searchable six-group guide home with a three-minute entry", async () => {
    const view = await renderGuide();
    expect(view.querySelector('[role="search"]')).not.toBeNull();
    expect(view.querySelector('input[aria-label="搜索使用说明"]')).not.toBeNull();
    expect(view.querySelectorAll("[data-guide-group]")).toHaveLength(6);
    expect(view.textContent).toContain("3分钟开始使用");
    expect(view.textContent).toContain("页面功能");
    expect(view.textContent).toContain("图表怎么看");
    expect(view.textContent).toContain("常见问题");
    expect(view.querySelector('[data-guide-reading-path]')).not.toBeNull();
    expect(view.textContent).toContain("推荐阅读路线");
    expect(view.textContent).toContain("先学会操作，再理解图表");
  });

  it("renders breadcrumbs, standard sections, screenshot text, contents, and related learning", async () => {
    const view = await renderGuide({ initialTopicSlug: "formula-result-statistics" });
    expect(view.textContent).toContain("使用说明 / 公式结果统计");
    for (const heading of ["这个页面做什么", "什么时候用", "先认识页面", "按这几步使用", "结果怎么看", "最容易误解的地方", "遇到问题怎么办", "接下来学什么"]) {
      expect(view.textContent).toContain(heading);
    }
    expect(view.querySelector('nav[aria-label="本主题目录"]')).not.toBeNull();
    expect(view.querySelector('img[loading="eager"]')).not.toBeNull();
    expect(view.querySelectorAll("[data-guide-callout]")).toHaveLength(2);
    expect(view.textContent).toContain("相关说明");
  });

  it("searches ordinary wording and opens the matching topic", async () => {
    const view = await renderGuide();
    const input = view.querySelector<HTMLInputElement>('input[aria-label="搜索使用说明"]')!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "杀几次");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(view.textContent).toContain("实际落点趋势怎么看");
    const result = view.querySelector<HTMLButtonElement>('[data-guide-result="landing-trend"]')!;
    await act(async () => result.click());
    expect(view.textContent).toContain("这张图回答什么问题");
  });

  it("opens the annotated page image in a keyboard-safe dialog and restores focus", async () => {
    const view = await renderGuide({ initialTopicSlug: "formula-result-statistics" });
    const open = [...view.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("放大界面图"))!;
    open.focus();
    await act(async () => open.click());
    expect(document.body.querySelector('[role="dialog"][aria-label="放大的界面说明图"]')).not.toBeNull();
    expect(document.activeElement?.getAttribute("aria-label")).toBe("关闭放大界面图");

    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(document.body.querySelector('[role="dialog"][aria-label="放大的界面说明图"]')).toBeNull();
    expect(document.activeElement).toBe(open);
  });

  it("keeps the written callouts usable when a guide image cannot load", async () => {
    const view = await renderGuide({ initialTopicSlug: "formula-result-statistics" });
    const image = view.querySelector<HTMLImageElement>("img")!;
    await act(async () => image.dispatchEvent(new Event("error")));

    expect(view.textContent).toContain("界面图片暂时无法显示");
    expect(view.textContent).toContain("下方编号文字包含完整说明");
    expect(view.querySelectorAll(".rq-guide-shot__callouts li")).toHaveLength(2);
  });
});
