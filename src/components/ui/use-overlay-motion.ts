"use client";

import { useCallback, useLayoutEffect, useRef, type RefObject } from "react";

/** Small, interruptible compositor-only motion. No clones or delayed mounting. */
export function useOverlayMotion({ open, surfaceRef, backdropRef, onClose }: {
  open: boolean;
  surfaceRef: RefObject<HTMLElement | null>;
  backdropRef: RefObject<HTMLElement | null>;
  onClose: () => void;
}) {
  const animations = useRef<Animation[]>([]);
  const closing = useRef(false);
  const generation = useRef(0);
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const closeCallback = useRef(onClose);
  useLayoutEffect(() => { closeCallback.current = onClose; }, [onClose]);
  const cancel = useCallback(() => {
    generation.current += 1;
    closing.current = false;
    clearTimeout(timeout.current);
    for (const animation of animations.current) animation.cancel();
    animations.current = [];
  }, []);

  useLayoutEffect(() => {
    cancel();
    const surface = surfaceRef.current;
    const backdrop = backdropRef.current;
    if (!open || !surface || typeof surface.animate !== "function" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return cancel;
    animations.current = [surface.animate([
      { opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "translateY(0)" },
    ], { duration: 180, easing: "cubic-bezier(.2,.8,.2,1)" })];
    if (backdrop && typeof backdrop.animate === "function") animations.current.push(backdrop.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: "ease-out" }));
    // Cancelling Web Animations rejects `finished`; entry motion never blocks use.
    for (const animation of animations.current) void animation.finished.catch(() => undefined);
    return cancel;
  }, [open, surfaceRef, backdropRef, cancel]);

  const requestClose = useCallback(() => {
    if (closing.current) return;
    const surface = surfaceRef.current;
    const backdrop = backdropRef.current;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    // Read the current frame before cancelling an in-flight entrance.
    const current = surface && !reduced && typeof surface.animate === "function" ? window.getComputedStyle(surface) : undefined;
    const from = { opacity: current?.opacity || "1", transform: current?.transform || "none" };
    const backdropOpacity = backdrop && !reduced && typeof backdrop.animate === "function" ? window.getComputedStyle(backdrop).opacity || "1" : "1";
    cancel();
    if (!surface || typeof surface.animate !== "function" || reduced) { closeCallback.current(); return; }
    closing.current = true;
    const token = generation.current;
    animations.current = [surface.animate([from, { opacity: 0, transform: "translateY(6px)" }], { duration: 130, easing: "cubic-bezier(.4,0,1,1)", fill: "forwards" })];
    if (backdrop && typeof backdrop.animate === "function") animations.current.push(backdrop.animate([{ opacity: backdropOpacity }, { opacity: 0 }], { duration: 130, easing: "ease-in", fill: "forwards" }));
    const finish = () => {
      if (generation.current !== token || !closing.current) return;
      clearTimeout(timeout.current);
      closing.current = false;
      closeCallback.current();
    };
    void Promise.all(animations.current.map((animation) => animation.finished)).then(finish, () => undefined);
    // A defensive bound for interrupted/background animations; no dependency on
    // animationend bubbling or on a child chart finishing its own animation.
    timeout.current = setTimeout(finish, 200);
  }, [surfaceRef, backdropRef, cancel]);

  return { requestClose, cancel };
}
