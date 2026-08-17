import { afterEach, describe, expect, it, vi } from "vitest";
import { clearSessionJsonCache, fetchJsonWithSessionCache } from "@/lib/network/urls";

afterEach(() => {
  clearSessionJsonCache();
  vi.restoreAllMocks();
});

describe("session JSON cache", () => {
  it("shares one request across callers that resolve to the same URL", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ latestIssue: "2026212" }), { status: 200 }));

    const [first, second] = await Promise.all([
      fetchJsonWithSessionCache<{ latestIssue: string }>("/static-cloud-state.json", {
        baseUrl: "https://example.com/dashboard/",
        fetcher,
      }),
      fetchJsonWithSessionCache<{ latestIssue: string }>("../static-cloud-state.json", {
        baseUrl: "https://example.com/dashboard/",
        fetcher,
      }),
    ]);

    expect(first.latestIssue).toBe("2026212");
    expect(second.latestIssue).toBe("2026212");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("allows an explicit refresh to bypass the short-lived cache", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const options = { baseUrl: "https://example.com/", fetcher };

    await fetchJsonWithSessionCache("/static-cloud-state.json", options);
    await fetchJsonWithSessionCache("/static-cloud-state.json", { ...options, force: true });

    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
