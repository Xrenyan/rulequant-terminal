import { afterEach, describe, expect, it, vi } from "vitest";
import { readBrowserLocalStorage, writeBrowserLocalStorage } from "@/lib/storage/safe-browser-storage";

afterEach(() => vi.unstubAllGlobals());

describe("可选浏览器记录不能阻断页面和开奖接纳", () => {
  it("服务端没有window时安全回退，不声称已保存", () => {
    vi.stubGlobal("window", undefined);
    expect(readBrowserLocalStorage("key", "fallback")).toBe("fallback");
    expect(writeBrowserLocalStorage("key", "value")).toBe(false);
  });
  it("连localStorage getter都抛SecurityError时仍可读写降级", () => {
    vi.stubGlobal("window", Object.defineProperty({}, "localStorage", { get() { throw new Error("SecurityError"); } }));
    expect(readBrowserLocalStorage("rulequant:adminToken")).toBe("");
    expect(readBrowserLocalStorage("rulequant:lastSyncAt", "未保存")).toBe("未保存");
    expect(writeBrowserLocalStorage("rulequant:lastSyncAt", "now")).toBe(false);
  });
  it("getItem失败或键不存在都提供默认值", () => {
    vi.stubGlobal("window", { localStorage: { getItem: () => { throw new Error("SecurityError"); } } });
    expect(readBrowserLocalStorage("key", "fallback")).toBe("fallback");
    vi.stubGlobal("window", { localStorage: { getItem: () => null } });
    expect(readBrowserLocalStorage("key", "fallback")).toBe("fallback");
  });
  it("容量写满返回失败、不抛异常，后续内存更新仍执行", () => {
    vi.stubGlobal("window", { localStorage: { setItem: () => { throw new Error("QuotaExceededError"); } } });
    let acceptedDraw = false;
    let persisted = true;
    expect(() => {
      persisted = writeBrowserLocalStorage("rulequant:lastCheckedAt", "now");
      acceptedDraw = true;
    }).not.toThrow();
    expect(persisted).toBe(false);
    expect(acceptedDraw).toBe(true);
  });
  it("正常浏览器正确读取与保存，包括空字符串", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("window", { localStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } } });
    expect(writeBrowserLocalStorage("key", "value")).toBe(true);
    expect(readBrowserLocalStorage("key")).toBe("value");
    expect(writeBrowserLocalStorage("key", "")).toBe(true);
    expect(readBrowserLocalStorage("key", "fallback")).toBe("");
  });
});
