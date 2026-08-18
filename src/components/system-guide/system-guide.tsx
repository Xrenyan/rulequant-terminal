"use client";

import { useMemo, useState } from "react";
import { ArrowRight, BookOpen, ChartSpline, CircleHelp, Eraser, MousePointerClick, Search } from "lucide-react";
import { getGuideTopic, guideTopics, searchGuideTopics, type GuideGroup } from "@/content/system-guide";
import { GuideTopicView } from "@/components/system-guide/guide-topic";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";

const GROUPS: Array<{ key: GuideGroup; title: string; description: string }> = [
  { key: "start", title: "快速开始", description: "第一次使用，从这里照着走" },
  { key: "module", title: "页面功能", description: "系统每个页面分别做什么" },
  { key: "chart", title: "图表怎么看", description: "横轴、纵轴、颜色和示例" },
  { key: "term", title: "术语口径", description: "6+1、公式动作和号码属性" },
  { key: "data", title: "健康状态", description: "公式、数据和样本是否可靠" },
  { key: "troubleshooting", title: "常见问题", description: "按现象查原因和处理方法" },
];

export function SystemGuide({ initialTopicSlug, initialSection, returnTo, mode = "settings" }: { initialTopicSlug?: string; initialSection?: string; returnTo?: string; mode?: "settings" | "help" } = {}) {
  const [query, setQuery] = useState("");
  const [selectedSlug, setSelectedSlug] = useState(() => getGuideTopic(initialTopicSlug)?.slug ?? "");
  const topic = getGuideTopic(selectedSlug);
  const results = useMemo(() => searchGuideTopics(query), [query]);
  const selectTopic = (slug: string) => {
    const selected = getGuideTopic(slug);
    if (!selected) return;
    setSelectedSlug(slug);
    setQuery("");
    if (typeof window !== "undefined") {
      const params = new URLSearchParams();
      if (mode === "settings") params.set("tab", "guide");
      params.set("topic", slug);
      if (returnTo) params.set("returnTo", returnTo);
      window.history.replaceState(window.history.state, "", `${mode === "settings" ? "/config" : "/help"}?${params}`);
    }
  };
  const back = () => {
    setSelectedSlug("");
    if (typeof window !== "undefined") window.history.replaceState(window.history.state, "", mode === "settings" ? "/config?tab=guide" : "/help");
  };
  if (topic) return <GuideTopicView topic={topic} initialSection={initialSection} returnTo={returnTo} onBack={back} onSelectTopic={selectTopic} />;
  return <div className="rq-system-guide">
    <Panel className="rq-system-guide__hero"><div><Badge tone="cyan">RuleQuant 使用说明</Badge><h1>普通人也能看懂的完整说明书</h1><p>不知道按钮做什么、图怎么看、公式为什么异常，直接输入你看到的文字。每条说明都包含用途、步骤、结果解释、误区和排查方法。</p></div><BookOpen className="h-10 w-10" /></Panel>
    <section className="rq-guide-search" role="search" aria-label="搜索系统使用说明"><Search className="h-5 w-5" /><Input aria-label="搜索使用说明" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="例如：杀几次、矩阵、公式冲突、数据过期、打不开" />{query && <Button size="icon" variant="ghost" aria-label="清空说明搜索" onClick={() => setQuery("")}><Eraser className="h-4 w-4" /></Button>}</section>
    {!query && <section className="rq-guide-reading-path" data-guide-reading-path>
      <header><div><span>推荐阅读路线</span><h2>先学会操作，再理解图表</h2><p>第一次使用按 1 → 2 → 3 阅读；熟悉以后直接用上方搜索。</p></div><Badge tone="green">约 3 分钟</Badge></header>
      <div>
        <button type="button" onClick={() => selectTopic("getting-started")}><i>1</i><span><MousePointerClick className="h-5 w-5" /><strong>完成第一次分析</strong><small>照着步骤走一遍</small></span><ArrowRight className="h-4 w-4" /></button>
        <button type="button" onClick={() => selectTopic("formula-result-statistics")}><i>2</i><span><BookOpen className="h-5 w-5" /><strong>看懂公式结果</strong><small>次数、排除与支持</small></span><ArrowRight className="h-4 w-4" /></button>
        <button type="button" onClick={() => selectTopic("landing-trend")}><i>3</i><span><ChartSpline className="h-5 w-5" /><strong>读懂落点图</strong><small>柱形次数与折线位置</small></span><ArrowRight className="h-4 w-4" /></button>
      </div>
    </section>}
    {query ? <section className="rq-guide-results"><header><div><span>搜索结果</span><h2>找到 {results.length} 条说明</h2></div></header>{results.length ? <div>{results.map((result) => <button key={result.topic.slug} type="button" data-guide-result={result.topic.slug} onClick={() => selectTopic(result.topic.slug)}><span><strong>{result.topic.title}</strong><small>{result.excerpt}</small></span><em>{result.matchedField === "title" ? "标题" : result.matchedField === "alias" ? "常用说法" : "内容"}</em></button>)}</div> : <div className="rq-guide-empty"><CircleHelp className="h-6 w-6" /><strong>没有找到完全匹配的说明</strong><p>可以换成页面上的按钮文字、报错原文，或搜索“常见问题”。</p></div>}</section> : <div className="rq-guide-groups">{GROUPS.map((group) => <section key={group.key} data-guide-group={group.key}><header><div><span>{group.title}</span><p>{group.description}</p></div><Badge tone="slate">{guideTopics.filter((item) => item.group === group.key).length} 篇</Badge></header><div>{guideTopics.filter((item) => item.group === group.key).map((item) => <button key={item.slug} type="button" onClick={() => selectTopic(item.slug)}><strong>{item.title}</strong><p>{item.summary}</p><small>打开说明</small></button>)}</div></section>)}</div>}
  </div>;
}
