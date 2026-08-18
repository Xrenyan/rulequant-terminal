import { chartAndTermTopics } from "./charts-and-terms";
import { gettingStartedTopics } from "./getting-started";
import { primaryModuleTopics } from "./primary-modules";
import { secondaryToolTopics } from "./secondary-tools";
import { troubleshootingTopics } from "./troubleshooting";
import type { GuideSearchResult, GuideTopic } from "./types";

export type * from "./types";

export const guideTopics: GuideTopic[] = [
  ...gettingStartedTopics,
  ...primaryModuleTopics,
  ...secondaryToolTopics,
  ...chartAndTermTopics,
  ...troubleshootingTopics,
];

export function getGuideTopic(slug: string | null | undefined): GuideTopic | undefined {
  return guideTopics.find((topic) => topic.slug === slug);
}

function normalize(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("zh-CN").replace(/[\s\p{P}\p{S}]+/gu, "");
}

function excerpt(topic: GuideTopic): string {
  return topic.summary || topic.sections[0]?.paragraphs[0] || topic.title;
}

export function searchGuideTopics(query: string): GuideSearchResult[] {
  const needle = normalize(query);
  if (!needle) return guideTopics.map((topic, index) => ({ topic, score: guideTopics.length - index, matchedField: "catalog", excerpt: topic.summary }));
  return guideTopics.flatMap((topic): GuideSearchResult[] => {
    const fields: Array<{ field: GuideSearchResult["matchedField"]; values: string[]; weight: number }> = [
      { field: "title", values: [topic.title], weight: 500 },
      { field: "keyword", values: topic.keywords, weight: 350 },
      { field: "alias", values: topic.aliases, weight: 400 },
      { field: "content", values: [topic.summary, ...topic.sections.flatMap((section) => [section.title, ...section.paragraphs, ...(section.bullets ?? []), ...(section.steps?.flatMap((step) => [step.title, step.body]) ?? [])])], weight: 180 },
    ];
    let best: { field: GuideSearchResult["matchedField"]; score: number } | undefined;
    for (const candidate of fields) {
      for (const value of candidate.values) {
        const normalized = normalize(value);
        const index = normalized.indexOf(needle);
        if (index < 0) continue;
        const score = candidate.weight + (index === 0 ? 30 : 0) - index;
        if (!best || score > best.score) best = { field: candidate.field, score };
      }
    }
    return best ? [{ topic, score: best.score, matchedField: best.field, excerpt: excerpt(topic) }] : [];
  }).sort((left, right) => right.score - left.score || left.topic.title.localeCompare(right.topic.title, "zh-CN"));
}
