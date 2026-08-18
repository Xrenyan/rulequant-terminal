import { makeWorkflowTopic } from "./types";

export const gettingStartedTopics = [makeWorkflowTopic({
  slug: "getting-started",
  title: "3分钟开始使用",
  summary: "从确认最新开奖，到计算、统计、核验和综合参考的最短正确路径。",
  route: "/config?tab=guide&topic=getting-started",
  keywords: ["新手", "开始", "流程", "三分钟"],
  aliases: ["怎么用", "从哪里开始"],
  purpose: "这不是功能总目录，而是一条可以直接照着走的最短流程。先确保数据正确，再计算公式，再用实际开奖核验，最后才阅读综合参考。",
  when: "第一次使用、换电脑、刚同步完数据，或者一段时间没有操作时，都从这里开始。",
  orientation: "顶部先看数据来源和最新期；中间是主要操作；任何历史比例旁边都应同时看到样本期数。",
  steps: [
    { title: "确认数据", body: "在顶部确认数据来源、最新期和更新时间；不对就先到开奖数据同步。" },
    { title: "一键计算", body: "打开一键算公式，使用最新一期，确认没有大量计算异常。" },
    { title: "看结果统计", body: "进入公式结果统计，区分排除与支持，选择生肖、尾数或其他结果类型。" },
    { title: "核验实际落点", body: "进入分析驾驶舱，先看落点趋势，再点实际期次查看贡献公式。" },
    { title: "最后看综合参考", body: "确认数据和公式都正常后，再阅读综合参考结果及证据。" },
  ],
  interpretation: "正常流程的关键不是某个数字高，而是数据最新、公式能算、实际落点可追溯、证据与期次一致。",
  misunderstanding: "不要把历史通过率或落点位置当成下一期保证；它们只描述已经开奖的样本。",
  troubleshooting: "页面为空先看数据来源；公式异常先去公式校验；更新时间过旧先同步；仍不清楚可搜索报错文字。",
  related: ["draws", "one-click", "formula-result-statistics", "landing-trend", "candidate-pool"],
  screenshotSlug: "dashboard",
})];
