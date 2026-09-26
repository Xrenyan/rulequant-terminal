"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Maximize2, X } from "lucide-react";
import { createPortal } from "react-dom";

type ScrollPosition = { element: HTMLElement; top: number; left: number };

function readScrollPositions(host: HTMLElement): ScrollPosition[] {
  return [host, ...host.querySelectorAll<HTMLElement>("*")]
    .filter((element) => element.scrollTop || element.scrollLeft)
    .map((element) => ({ element, top: element.scrollTop, left: element.scrollLeft }));
}

function restoreScrollPositions(positions: ScrollPosition[]): void {
  for (const { element, top, left } of positions) {
    if (!element.isConnected) continue;
    element.scrollTop = top;
    element.scrollLeft = left;
    // Assignment can be clamped by the new viewport. Notify virtual lists of
    // the actual offset even when the browser does not emit a scroll event.
    element.dispatchEvent(new Event("scroll"));
  }
}

export function ExpandableVisualization({ title, children }: { title: string; children: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const openRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const inlineRef = useRef<HTMLDivElement | null>(null);
  const pendingScroll = useRef<ScrollPosition[] | null>(null);
  const [portalHost, setPortalHost] = useState<HTMLDivElement | null>(null);
  const attachInline = useCallback((node: HTMLDivElement | null) => {
    inlineRef.current = node;
    if (node) setPortalHost((current) => current ?? document.createElement("div"));
  }, []);

  const changeExpanded = useCallback((value: boolean) => {
    if (value && portalHost && inlineRef.current) {
      // The action color belongs to the inline chart scope, not document.body.
      // Read it afresh for every opening so support/exclude changes are retained.
      const mark = window.getComputedStyle(inlineRef.current).getPropertyValue("--rq-viz-mark").trim();
      if (mark) portalHost.style.setProperty("--rq-viz-mark", mark);
      else portalHost.style.removeProperty("--rq-viz-mark");
    }
    // Capture before React changes layout classes: detaching or resizing a scroller
    // can reset its native offsets without notifying a virtualized child.
    pendingScroll.current = portalHost ? readScrollPositions(portalHost) : null;
    setExpanded(value);
  }, [portalHost]);

  useLayoutEffect(() => {
    if (!portalHost) return;
    const positions = pendingScroll.current ?? readScrollPositions(portalHost);
    pendingScroll.current = null;
    (expanded ? document.body : inlineRef.current)?.appendChild(portalHost);
    if (!expanded) portalHost.style.removeProperty("--rq-viz-mark");
    if (!expanded && inlineRef.current) inlineRef.current.style.minHeight = "";
    const restore = () => restoreScrollPositions(positions);
    restore();
    const frame = requestAnimationFrame(restore);
    return () => cancelAnimationFrame(frame);
  }, [expanded, portalHost]);

  useLayoutEffect(() => () => { portalHost?.remove(); }, [portalHost]);

  useEffect(() => {
    if (!expanded) return;
    const previousOverflow = document.documentElement.style.overflow;
    const returnFocus = openRef.current;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); changeExpanded(false); }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), summary, [tabindex]:not([tabindex="-1"])')).filter((element) => {
        if (element.closest("[hidden]")) return false;
        const closedDetails = element.closest("details:not([open])");
        return !closedDetails || element === closedDetails.querySelector(":scope > summary");
      });
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (!dialogRef.current.contains(document.activeElement)) {
        event.preventDefault(); first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.documentElement.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    queueMicrotask(() => closeRef.current?.focus({ preventScroll: true }));
    return () => {
      document.documentElement.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      queueMicrotask(() => returnFocus?.focus({ preventScroll: true }));
    };
  }, [expanded, changeExpanded]);

  return <div className="rq-expandable-visualization">
    <button ref={openRef} type="button" aria-haspopup="dialog" aria-expanded={expanded} className="rq-expandable-visualization__open" onClick={() => { if (inlineRef.current) inlineRef.current.style.minHeight = `${inlineRef.current.getBoundingClientRect().height}px`; changeExpanded(true); }}><Maximize2 className="h-4 w-4" />放大图表</button>
    <div ref={attachInline} />
    {portalHost && createPortal(
      <div className={expanded ? "rq-visualization-dialog" : "rq-visualization-inline"}>
        <button type="button" style={{ display: expanded ? undefined : "none" }} className="rq-visualization-dialog__backdrop" tabIndex={-1} aria-hidden="true" onClick={() => changeExpanded(false)} />
        <section ref={dialogRef} role={expanded ? "dialog" : undefined} aria-modal={expanded ? true : undefined} aria-label={expanded ? `放大${title}` : undefined}>
          <header style={{ display: expanded ? undefined : "none" }}><div><small>{expanded ? "全屏查看" : null}</small><strong>{expanded ? title : null}</strong></div><button ref={closeRef} type="button" aria-label="关闭放大图表" onClick={() => changeExpanded(false)}><X className="h-5 w-5" /></button></header>
          <div className={expanded ? "rq-visualization-dialog__content" : undefined}><p style={{ display: expanded ? undefined : "none" }} className="rq-visualization-swipe-hint">左右滑动图表可见全部内容，较长内容可上下滚动。</p>{children}</div>
        </section>
      </div>,
      portalHost,
    )}
  </div>;
}
