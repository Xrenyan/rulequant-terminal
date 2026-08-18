export type GuideGroup = "start" | "module" | "chart" | "term" | "data" | "troubleshooting";
export type GuideSectionKind = "purpose" | "when" | "orientation" | "steps" | "interpretation" | "misunderstanding" | "troubleshooting" | "related" | "technical" | "example";

export type GuideStep = { title: string; body: string };
export type GuideCallout = { number: number; x: number; y: number; title: string; body: string };
export type GuideScreenshot = {
  src: string;
  width: number;
  height: number;
  alt: string;
  caption: string;
  callouts: GuideCallout[];
};
export type GuideSection = {
  kind: GuideSectionKind;
  anchor: string;
  title: string;
  paragraphs: string[];
  bullets?: string[];
  steps?: GuideStep[];
};
export type GuideTopic = {
  slug: string;
  title: string;
  summary: string;
  group: GuideGroup;
  keywords: string[];
  aliases: string[];
  route?: string;
  screenshot?: GuideScreenshot;
  sections: GuideSection[];
  related: string[];
};
export type GuideSearchResult = {
  topic: GuideTopic;
  score: number;
  matchedField: "catalog" | "title" | "keyword" | "alias" | "content";
  excerpt: string;
};

export function makeWorkflowTopic(input: {
  slug: string;
  title: string;
  summary: string;
  route?: string;
  keywords: string[];
  aliases?: string[];
  purpose: string;
  when: string;
  orientation: string;
  steps: GuideStep[];
  interpretation: string;
  misunderstanding: string;
  troubleshooting: string;
  related: string[];
  screenshotSlug?: string;
}): GuideTopic {
  const screenshotSlug = input.screenshotSlug ?? input.slug;
  return {
    slug: input.slug,
    title: input.title,
    summary: input.summary,
    group: input.slug === "getting-started" ? "start" : "module",
    keywords: input.keywords,
    aliases: input.aliases ?? [],
    route: input.route,
    screenshot: {
      src: `/help/screens/${screenshotSlug}.webp`,
      width: 1440,
      height: 900,
      alt: `RuleQuant ${input.title}页面的真实界面，标出了主要操作区和结果区`,
      caption: `${input.title}页面实图。编号说明与图片下方文字完全对应，不看图片也能完成操作。`,
      callouts: [
        { number: 1, x: 22, y: 24, title: "先确认页面和数据", body: input.orientation },
        { number: 2, x: 66, y: 58, title: "再阅读主要结果", body: input.interpretation },
      ],
    },
    sections: [
      { kind: "purpose", anchor: "purpose", title: "这个页面做什么", paragraphs: [input.purpose] },
      { kind: "when", anchor: "when", title: "什么时候用", paragraphs: [input.when] },
      { kind: "orientation", anchor: "orientation", title: "先认识页面", paragraphs: [input.orientation] },
      { kind: "steps", anchor: "steps", title: "按这几步使用", paragraphs: ["从上到下操作，不需要先理解全部专业词。"], steps: input.steps },
      { kind: "interpretation", anchor: "interpretation", title: "结果怎么看", paragraphs: [input.interpretation] },
      { kind: "misunderstanding", anchor: "misunderstanding", title: "最容易误解的地方", paragraphs: [input.misunderstanding] },
      { kind: "troubleshooting", anchor: "troubleshooting", title: "遇到问题怎么办", paragraphs: [input.troubleshooting] },
      { kind: "related", anchor: "related", title: "接下来学什么", paragraphs: ["下面的相关说明会沿用同一套数据和术语。"] },
    ],
    related: input.related,
  };
}
