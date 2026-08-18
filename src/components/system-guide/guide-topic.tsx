"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, ExternalLink } from "lucide-react";
import { guideTopics, type GuideTopic } from "@/content/system-guide";
import { AnnotatedScreenshot } from "@/components/system-guide/annotated-screenshot";

function GuideSectionView({ topic, section }: { topic: GuideTopic; section: GuideTopic["sections"][number] }) {
  return <section id={`guide-${topic.slug}-${section.anchor}`} data-guide-section={section.kind}><span>{section.kind === "steps" ? "操作步骤" : "通俗说明"}</span><h2>{section.title}</h2>{section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}{section.bullets?.length ? <ul>{section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul> : null}{section.steps?.length ? <ol className="rq-guide-steps">{section.steps.map((step, index) => <li key={step.title}><b>{index + 1}</b><div><strong>{step.title}</strong><p>{step.body}</p></div></li>)}</ol> : null}</section>;
}

export function GuideTopicView({ topic, initialSection, returnTo, onBack, onSelectTopic }: { topic: GuideTopic; initialSection?: string; returnTo?: string; onBack: () => void; onSelectTopic: (slug: string) => void }) {
  const related = topic.related.flatMap((slug) => guideTopics.filter((candidate) => candidate.slug === slug));
  const quickSections = topic.sections.slice(0, 3);
  const detailSections = topic.sections.slice(3);
  return <article className="rq-guide-topic">
    <div className="rq-guide-breadcrumb"><button type="button" onClick={onBack}>使用说明</button><span>/</span><strong>{topic.title}</strong></div>
    <header className="rq-guide-topic__hero"><div><span>使用说明 / {topic.title}</span><h1>{topic.title}</h1><p>{topic.summary}</p></div>{topic.route && <Link href={topic.route}>打开实际页面<ExternalLink className="h-4 w-4" /></Link>}</header>
    <div className="rq-guide-topic__layout">
      <nav className="rq-guide-topic__toc" aria-label="本主题目录"><strong>本页目录</strong>{topic.sections.map((section) => <a key={section.anchor} href={`#guide-${topic.slug}-${section.anchor}`} aria-current={initialSection === section.anchor ? "location" : undefined}>{section.title}</a>)}</nav>
      <div className="rq-guide-topic__body">
        {topic.screenshot && <AnnotatedScreenshot screenshot={topic.screenshot} />}
        <div className="rq-guide-topic__quick" aria-label="本页先看">{quickSections.map((section) => <GuideSectionView key={section.anchor} topic={topic} section={section} />)}</div>
        {detailSections.map((section) => <GuideSectionView key={section.anchor} topic={topic} section={section} />)}
        <section className="rq-guide-related"><span>相关说明</span><h2>继续学习</h2><div>{related.map((item) => <button key={item.slug} type="button" onClick={() => onSelectTopic(item.slug)}><span><strong>{item.title}</strong><small>{item.summary}</small></span><ArrowRight className="h-4 w-4" /></button>)}</div></section>
        <footer>{returnTo && <Link href={returnTo}><ArrowLeft className="h-4 w-4" />返回刚才的页面</Link>}<button type="button" onClick={onBack}>返回说明目录</button></footer>
      </div>
    </div>
  </article>;
}
