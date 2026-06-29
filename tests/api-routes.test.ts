import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchDrawsFromUrl = vi.fn();
const syncDrawsToCloud = vi.fn();
const hasDrawWriteAuthorization = vi.fn();
const isConfiguredDrawSourceUrl = vi.fn();

vi.mock("@/lib/server/draw-sync", () => ({
  fetchDrawsFromUrl,
}));

vi.mock("@/lib/server/sync-draws-to-cloud", () => ({
  configuredDrawSourceUrl: () => "https://source.example/2026.html",
  hasDrawWriteAuthorization,
  isConfiguredDrawSourceUrl,
  syncDrawsToCloud,
}));

const sampleFetchResult = {
  records: [{
    issue: "2026179",
    year: 2026,
    date: "2026-06-28",
    n1: 10,
    n2: 11,
    n3: 26,
    n4: 6,
    n5: 31,
    n6: 9,
    special: 15,
    sourceUrl: "https://source.example/2026.html",
  }],
  years: [{ year: 2026, url: "https://source.example/2026.html", count: 1 }],
  errors: [],
};

describe("draw sync API write guards", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.RULEQUANT_PUBLIC_DRAW_SYNC;
    fetchDrawsFromUrl.mockResolvedValue(sampleFetchResult);
    syncDrawsToCloud.mockResolvedValue({ ...sampleFetchResult, ok: true, latestIssue: "2026179", recordCount: 1, state: { latestIssue: "2026179", recordCount: 1 } });
    hasDrawWriteAuthorization.mockReturnValue(false);
    isConfiguredDrawSourceUrl.mockReturnValue(true);
  });

  it("does not persist imported draw data without authorization", async () => {
    const { POST } = await import("@/app/api/import-draws-from-url/route");
    const response = await POST(new Request("https://rulequant.test/api/import-draws-from-url", {
      method: "POST",
      body: JSON.stringify({
        baseUrl: "https://source.example/2026.html",
        fromYear: 2026,
        toYear: 2026,
        persist: true,
      }),
    }));

    expect(response.status).toBe(403);
    expect(syncDrawsToCloud).not.toHaveBeenCalled();
    expect(fetchDrawsFromUrl).not.toHaveBeenCalled();
  });

  it("still allows read-only draw imports for public pages", async () => {
    const { POST } = await import("@/app/api/import-draws-from-url/route");
    const response = await POST(new Request("https://rulequant.test/api/import-draws-from-url", {
      method: "POST",
      body: JSON.stringify({
        baseUrl: "https://source.example/2026.html",
        fromYear: 2026,
        toYear: 2026,
        persist: false,
      }),
    }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.records).toHaveLength(1);
    expect(data.persisted).toBe(false);
    expect(fetchDrawsFromUrl).toHaveBeenCalledOnce();
    expect(syncDrawsToCloud).not.toHaveBeenCalled();
  });

  it("rejects public cloud-writing cron sync by default", async () => {
    const { GET } = await import("@/app/api/cron/sync-draws/route");
    const response = await GET(new Request("https://rulequant.test/api/cron/sync-draws?fromYear=2026&toYear=2026"));

    expect(response.status).toBe(401);
    expect(syncDrawsToCloud).not.toHaveBeenCalled();
  });

  it("does not allow public cron writes even if a legacy public flag is set", async () => {
    process.env.RULEQUANT_PUBLIC_DRAW_SYNC = "true";
    const { GET } = await import("@/app/api/cron/sync-draws/route");
    const response = await GET(new Request("https://rulequant.test/api/cron/sync-draws?fromYear=2026&toYear=2026"));

    expect(response.status).toBe(401);
    expect(syncDrawsToCloud).not.toHaveBeenCalled();
  });
});
