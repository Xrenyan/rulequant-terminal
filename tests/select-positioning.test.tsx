// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { Select } from "@/components/ui/field";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let host: HTMLDivElement;
afterEach(async () => { await act(async () => root?.unmount()); host?.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function openAt(top: number, width = 1440) {
  vi.stubGlobal("innerWidth", width);
  vi.stubGlobal("innerHeight", 1000);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<Select aria-label="期数">{Array.from({ length: 20 }, (_, i) => <option key={i} value={(i + 1) * 10}>最近 {(i + 1) * 10} 期</option>)}</Select>));
  const trigger = host.querySelector("button")!;
  vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue(new DOMRect(293, top, 367, 44));
  await act(async () => trigger.click());
  return document.querySelector<HTMLDivElement>('[role="listbox"]')!;
}
it("clears inherited top positioning when opening above a bottom-edge trigger", async () => {
  const menu = await openAt(898);
  expect(menu.style.top).toBe("auto");
  expect(menu.style.bottom).toBe("110px");
  expect(Number.parseFloat(menu.style.maxHeight)).toBeLessThanOrEqual(880);
});
it("limits a below-opening menu to the available space on that side", async () => {
  const menu = await openAt(650);
  expect(menu.style.top).toBe("702px");
  expect(Number.parseFloat(menu.style.maxHeight)).toBeLessThanOrEqual(288);
  expect(menu.style.bottom).toBe("auto");
});
it("keeps all twenty options selectable in the mobile sheet", async () => {
  const menu = await openAt(700, 390);
  expect(menu.classList.contains("rq-select__menu--sheet")).toBe(true);
  const options = menu.querySelectorAll<HTMLButtonElement>('[role="option"]');
  expect(options).toHaveLength(20);
  await act(async () => options[19].click());
  expect(host.querySelector("button")?.textContent).toContain("最近 200 期");
  expect(document.querySelector('[role="listbox"]')).toBeNull();
});
