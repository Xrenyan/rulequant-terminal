"use client";

import { useEffect, useRef, useState } from "react";
import { ImageOff, Maximize2, X } from "lucide-react";
import Image from "next/image";
import { createPortal } from "react-dom";
import type { GuideScreenshot } from "@/content/system-guide";

export function AnnotatedScreenshot({ screenshot }: { screenshot: GuideScreenshot }) {
  const [zoomed, setZoomed] = useState(false);
  const [imageError, setImageError] = useState(false);
  const openRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!zoomed) return;
    const previous = document.documentElement.style.overflow;
    const openButton = openRef.current;
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setZoomed(false);
      if (event.key !== "Tab") return;
      const dialog = closeRef.current?.closest<HTMLElement>('[role="dialog"]');
      const controls = dialog ? [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')] : [];
      const first = controls[0];
      const last = controls.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.documentElement.style.overflow = "hidden";
    document.addEventListener("keydown", keydown);
    queueMicrotask(() => closeRef.current?.focus());
    return () => {
      document.documentElement.style.overflow = previous;
      document.removeEventListener("keydown", keydown);
      queueMicrotask(() => openButton?.focus());
    };
  }, [zoomed]);

  return <figure className="rq-guide-shot">
    <div className="rq-guide-shot__image">
      {imageError ? <div className="rq-guide-shot__error" role="status"><ImageOff className="h-5 w-5" /><strong>界面图片暂时无法显示</strong><p>下方编号文字包含完整说明，可以继续阅读和操作。</p></div> : <picture><Image src={screenshot.src} width={screenshot.width} height={screenshot.height} alt={screenshot.alt} loading="eager" fetchPriority="high" decoding="async" unoptimized onError={() => setImageError(true)} /></picture>}
      {!imageError && screenshot.callouts.map((callout) => <button key={callout.number} type="button" data-guide-callout={callout.number} className="rq-guide-shot__hotspot" style={{ left: `${callout.x}%`, top: `${callout.y}%` }} aria-label={`${callout.number}：${callout.title}。${callout.body}`}><span>{callout.number}</span></button>)}
      {!imageError && <button ref={openRef} type="button" className="rq-guide-shot__zoom" onClick={() => setZoomed(true)}><Maximize2 className="h-4 w-4" />放大界面图</button>}
    </div>
    <figcaption>{screenshot.caption}</figcaption>
    <ol className="rq-guide-shot__callouts">{screenshot.callouts.map((callout) => <li key={callout.number}><b>{callout.number}</b><div><strong>{callout.title}</strong><p>{callout.body}</p></div></li>)}</ol>
    {zoomed && typeof document !== "undefined" && createPortal(<div className="rq-guide-zoom" role="presentation"><button type="button" className="rq-guide-zoom__backdrop" aria-label="关闭放大界面图" onClick={() => setZoomed(false)} /><section role="dialog" aria-modal="true" aria-label="放大的界面说明图"><header><strong>{screenshot.alt}</strong><button ref={closeRef} type="button" aria-label="关闭放大界面图" onClick={() => setZoomed(false)}><X className="h-5 w-5" /></button></header><div><Image src={screenshot.src} width={screenshot.width} height={screenshot.height} alt={screenshot.alt} unoptimized /></div></section></div>, document.body)}
  </figure>;
}
