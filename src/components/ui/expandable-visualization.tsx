"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Maximize2, X } from "lucide-react";
import { createPortal } from "react-dom";

export function ExpandableVisualization({ title, children }: { title: string; children: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const openRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!expanded) return;
    const previousOverflow = document.documentElement.style.overflow;
    const returnFocus = openRef.current;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'));
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.documentElement.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    queueMicrotask(() => closeRef.current?.focus());
    return () => {
      document.documentElement.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      queueMicrotask(() => returnFocus?.focus());
    };
  }, [expanded]);

  return <div className="rq-expandable-visualization">
    <button ref={openRef} type="button" className="rq-expandable-visualization__open" onClick={() => setExpanded(true)}><Maximize2 className="h-4 w-4" />放大图表</button>
    {children}
    {expanded && typeof document !== "undefined" && createPortal(
      <div className="rq-visualization-dialog">
        <button type="button" className="rq-visualization-dialog__backdrop" tabIndex={-1} aria-hidden="true" onClick={() => setExpanded(false)} />
        <section ref={dialogRef} role="dialog" aria-modal="true" aria-label={`放大${title}`}>
          <header><div><small>全屏查看</small><strong>{title}</strong></div><button ref={closeRef} type="button" aria-label="关闭放大图表" onClick={() => setExpanded(false)}><X className="h-5 w-5" /></button></header>
          <div className="rq-visualization-dialog__content">{children}</div>
        </section>
      </div>,
      document.body,
    )}
  </div>;
}
