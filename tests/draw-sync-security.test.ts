import { describe, expect, it } from "vitest";
import { isPrivateNetworkAddress, normalizeYears, validateDrawSourceUrl } from "@/lib/server/draw-sync";

describe("draw sync security", () => {
  it("blocks local and private network source addresses", () => {
    expect(() => validateDrawSourceUrl("http://example.com/2026.html")).toThrow(/HTTPS/);
    expect(() => validateDrawSourceUrl("https://localhost/2026.html")).toThrow(/内网/);
    expect(() => validateDrawSourceUrl("https://127.0.0.1/2026.html")).toThrow(/内网/);
    expect(isPrivateNetworkAddress("192.168.1.2")).toBe(true);
    expect(isPrivateNetworkAddress("8.8.8.8")).toBe(false);
  });

  it("limits the number of years fetched in one request", () => {
    expect(normalizeYears({ fromYear: 2024, toYear: 2026 })).toEqual([2024, 2025, 2026]);
    expect(() => normalizeYears({ fromYear: 2020, toYear: 2026 })).toThrow(/最多同步 5 个年份/);
  });
});
