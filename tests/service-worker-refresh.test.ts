import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const workerSource = readFileSync(join(process.cwd(), "public", "sw.js"), "utf8");
const clientSource = readFileSync(
  join(process.cwd(), "src", "components", "network-resilience.tsx"),
  "utf8",
);

describe("mobile stale-cache migration", () => {
  it("retires the legacy worker and forces open pages onto the current shell", () => {
    expect(workerSource).toContain('const CLEANUP_VERSION = "20260717-1"');
    expect(workerSource).toContain("removeLegacyCaches");
    expect(workerSource).toContain("client.navigate");
    expect(workerSource).toContain("self.registration.unregister");
  });

  it("cleans old workers and caches after the migrated page opens", () => {
    expect(clientSource).toContain('const CACHE_CLEANUP_VERSION = "20260717-1"');
    expect(clientSource).toContain("navigator.serviceWorker.getRegistrations");
    expect(clientSource).toContain("window.caches.delete");
    expect(clientSource).toContain("updateViaCache: \"none\"");
  });
});
