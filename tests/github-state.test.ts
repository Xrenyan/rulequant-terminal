import { afterEach, describe, expect, it, vi } from "vitest";
import { saveGitHubStatePatch } from "@/lib/cloud/github-state";
import type { RuleQuantCloudState } from "@/lib/cloud/cloud-state";
import type { RuleRecord } from "@/types/domain";

function rule(id: string, sourceType: RuleRecord["sourceType"]): RuleRecord {
  return {
    id,
    name: id,
    category: "kill_zodiac",
    orderMode: "L",
    formula: "平1",
    normalizer: "auto",
    target: "special_zodiac",
    verifyMode: "next_special",
    positionPattern: [],
    periodSpan: 1,
    enabled: true,
    participatesInReference: true,
    sourceType,
    tags: [],
    description: "",
    sourceFile: "test",
    examples: [],
    createdAt: "2026-08-13T00:00:00.000Z",
    updatedAt: "2026-08-13T00:00:00.000Z",
  };
}

function contentResponse(state: RuleQuantCloudState, sha: string) {
  return new Response(JSON.stringify({
    sha,
    content: Buffer.from(JSON.stringify(state), "utf8").toString("base64"),
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

const emptyState: RuleQuantCloudState = {
  draws: [],
  rules: [],
  samples: [],
  logs: [],
  backups: [],
  referenceHistory: [],
  meta: { enabled: true, source: "github" },
};

describe("GitHub cloud state concurrency", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.RULEQUANT_GITHUB_TOKEN;
    delete process.env.RULEQUANT_GITHUB_REPO;
  });

  it("refetches and merges when another device wins the first write", async () => {
    process.env.RULEQUANT_GITHUB_TOKEN = "test-token";
    process.env.RULEQUANT_GITHUB_REPO = "owner/repo";
    const remoteRule = rule("remote-manual", "manual");
    const incomingRule = rule("incoming-canonical", "user_provided");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(contentResponse(emptyState, "sha-1"))
      .mockResolvedValueOnce(new Response("conflict", { status: 409 }))
      .mockResolvedValueOnce(contentResponse({ ...emptyState, rules: [remoteRule] }, "sha-2"))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const saved = await saveGitHubStatePatch({ rules: [incomingRule] });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(saved.rules.map((item) => item.id)).toEqual([incomingRule.id, remoteRule.id]);
    const finalWrite = JSON.parse(String(fetchMock.mock.calls[3][1]?.body));
    expect(finalWrite.sha).toBe("sha-2");
  });

  it("does not overwrite cloud state when the current file cannot be read", async () => {
    process.env.RULEQUANT_GITHUB_TOKEN = "test-token";
    process.env.RULEQUANT_GITHUB_REPO = "owner/repo";
    const fetchMock = vi.fn().mockResolvedValue(new Response("unavailable", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(saveGitHubStatePatch({ rules: [rule("incoming", "manual")] }))
      .rejects.toThrow("GitHub state read failed: HTTP 503");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
