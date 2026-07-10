/// <reference lib="webworker" />

import { discoverFormulaCandidates } from "@/lib/formula-discovery/formula-discovery";
import type { DrawRecord, RuleQuantConfig } from "@/types/domain";

type Request = {
  draws: DrawRecord[];
  config: RuleQuantConfig;
  depth: "balanced" | "deep";
};

self.onmessage = (event: MessageEvent<Request>) => {
  try {
    const candidates = discoverFormulaCandidates({
      draws: event.data.draws,
      config: event.data.config,
      limit: 18,
      maxTerms: event.data.depth === "deep" ? 4 : 3,
      combinationLimitPerTerm: event.data.depth === "deep" ? 80 : 40,
    });
    self.postMessage({ ok: true, candidates });
  } catch (error) {
    self.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
};

export {};
