// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { AnnotatedScreenshot } from "@/components/system-guide/annotated-screenshot";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
it("keeps guide images inside the project subdirectory in normal and zoomed views", async () => {
  vi.stubEnv("NEXT_PUBLIC_BASE_PATH", "/rulequant-terminal-pages");
  const host = document.createElement("div"); document.body.appendChild(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<AnnotatedScreenshot screenshot={{src:"/help/screens/formula-groups.png",width:1148,height:778,alt:"公式组合图",caption:"界面",callouts:[]}}/>));
    expect(new URL(host.querySelector("img")!.src).pathname).toBe("/rulequant-terminal-pages/help/screens/formula-groups.png");
    await act(async () => host.querySelector<HTMLButtonElement>(".rq-guide-shot__zoom")!.click());
    expect(new URL(document.querySelector<HTMLImageElement>('[role="dialog"] img')!.src).pathname).toBe("/rulequant-terminal-pages/help/screens/formula-groups.png");
  } finally { await act(async () => root.unmount()); host.remove(); vi.unstubAllEnvs(); }
});
