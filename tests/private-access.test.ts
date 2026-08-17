import { afterEach, describe, expect, it, vi } from "vitest";

async function loadAccessModule(token: string) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_RULEQUANT_ACCESS_TOKEN", token);
  return import("@/lib/security/private-access");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("private access configuration", () => {
  it("disables token validation when no public token is configured", async () => {
    const security = await loadAccessModule("");
    const isAccessTokenConfigured = (
      security as typeof security & { isAccessTokenConfigured?: () => boolean }
    ).isAccessTokenConfigured;

    expect(isAccessTokenConfigured?.()).toBe(false);
    expect(security.isValidAccessToken("")).toBe(false);
  });

  it("accepts only the configured token after trimming", async () => {
    const security = await loadAccessModule("  configured-share-token  ");

    expect(security.isValidAccessToken("configured-share-token")).toBe(true);
    expect(security.isValidAccessToken("wrong-token")).toBe(false);
  });
});
