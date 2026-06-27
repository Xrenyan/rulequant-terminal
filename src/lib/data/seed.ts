import { defaultConfig } from "@/lib/config/default-config";
import type { DrawRecord, RuleRecord, SampleCase } from "@/types/domain";
import sampleDraws from "../../../data/sample-draws.json";
import sampleRules from "../../../data/sample-rules.json";

export const seedDraws = sampleDraws as DrawRecord[];
export const seedRules = sampleRules as RuleRecord[];
export const seedConfig = defaultConfig;

export const seedSampleCases: SampleCase[] = [
  {
    id: "sample-kill-zodiac-pass",
    ruleId: "rq-kill-zodiac-l-core",
    issue: "2026151",
    expectedRawResult: 115,
    expectedFinalResult: 19,
    expectedMappedResult: ["鼠"],
    expectedSuccess: true,
    sourceFile: "杀一肖规，共10条.txt",
    note: "确认 115 - 48 - 48 = 19 = 鼠 的计算链路。",
  },
  {
    id: "sample-image-172-kill-snake",
    ruleId: "rq-macau-kill-zodiac-image-line",
    issue: "2026172",
    expectedRawResult: 62,
    expectedFinalResult: 14,
    expectedMappedResult: ["蛇"],
    expectedSuccess: false,
    sourceFile: "90671526093700bbb4e170db89f28d3f.jpg",
    note: "图片手算：172期 2 + 1 + 42 + 10 + 7 + 0 = 62；62 对应蛇；173期开蛇26，所以杀蛇为错误。",
  },
  {
    id: "sample-eight-zodiac-173",
    ruleId: "rq-eight-zodiac-core",
    issue: "2026173",
    expectedRawResult: 13,
    expectedMappedResult: ["蛇", "龙", "兔", "鸡", "虎", "牛", "羊", "鼠"],
    expectedSuccess: true,
    sourceFile: "八肖自用、、(2个括号内的肖都是括号前的肖的对冲+123456。取值123.txt",
    note: "TXT 手算：173 平5 马13 + 1 = 14 蛇，八肖集合含虎，174 开虎41，正确。",
  },
  {
    id: "sample-kill-three-173",
    ruleId: "rq-kill-three-as-nine",
    issue: "2026173",
    expectedRawResult: 39,
    expectedSuccess: true,
    sourceFile: "杀三肖可以当做九肖用、、20260606、、(取值平7654321.23456.7654321.23456.).txt",
    note: "TXT 手算：173 平1 龙39，杀龙、兔、鸡；174 开虎41，九肖候选命中。",
  },
];
