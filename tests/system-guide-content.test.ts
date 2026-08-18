import { describe, expect, it } from "vitest";
import { guideTopics } from "@/content/system-guide";

const primaryTitles = ["首页", "一键算公式", "公式结果统计", "综合参考结果", "专项概率观察", "开奖数据", "公式管理", "公式校验", "公式筛选", "设置"];
const secondaryTitles = ["公式逐期明细", "数据导入", "公式编辑", "高级回测", "单期输出", "导出报告", "规则理解"];
const requiredKinds = ["purpose", "when", "orientation", "steps", "interpretation", "misunderstanding", "troubleshooting", "related"];

describe("system guide catalog", () => {
  it("covers every primary module and secondary tool with unique stable links", () => {
    expect(new Set(guideTopics.map((topic) => topic.slug)).size).toBe(guideTopics.length);
    expect(primaryTitles.every((title) => guideTopics.some((topic) => topic.title === title))).toBe(true);
    expect(secondaryTitles.every((title) => guideTopics.some((topic) => topic.title === title))).toBe(true);
    for (const topic of guideTopics) {
      expect(new Set(topic.sections.map((section) => section.anchor)).size).toBe(topic.sections.length);
      expect(topic.related.every((slug) => guideTopics.some((candidate) => candidate.slug === slug))).toBe(true);
    }
  });

  it("gives every workflow a complete plain-language learning path", () => {
    for (const topic of guideTopics.filter((item) => item.group === "module" || item.group === "start")) {
      expect(requiredKinds.every((kind) => topic.sections.some((section) => section.kind === kind)), topic.slug).toBe(true);
      const steps = topic.sections.find((section) => section.kind === "steps")?.steps ?? [];
      expect(steps.length, topic.slug).toBeGreaterThanOrEqual(3);
      expect(steps.length, topic.slug).toBeLessThanOrEqual(6);
      expect(topic.screenshot?.alt.trim().length, topic.slug).toBeGreaterThan(8);
      expect(topic.screenshot?.caption.trim().length, topic.slug).toBeGreaterThan(8);
      expect(new Set(topic.screenshot?.callouts.map((callout) => callout.number)).size).toBe(topic.screenshot?.callouts.length);
    }
    expect(JSON.stringify(guideTopics)).not.toMatch(/TODO|placeholder|lorem|待补充/i);
  });

  it("gives every chart an exact reading recipe and caveat", () => {
    for (const topic of guideTopics.filter((item) => item.group === "chart")) {
      const text = topic.sections.flatMap((section) => [section.title, ...section.paragraphs]).join(" ");
      expect(text, topic.slug).toContain("先看");
      expect(text, topic.slug).toMatch(/横轴|行|列/);
      expect(text, topic.slug).toMatch(/纵轴|颜色|次数|位置/);
      expect(text, topic.slug).toContain("示例");
      expect(text, topic.slug).toContain("不代表");
    }
  });
});
