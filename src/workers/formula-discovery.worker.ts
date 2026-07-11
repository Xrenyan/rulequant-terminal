/// <reference lib="webworker" />

import { discoverFormulaCandidates } from "@/lib/formula-discovery/formula-discovery";
import type { DrawRecord, RuleQuantConfig } from "@/types/domain";

type Request = {
  draws: DrawRecord[];
  config: RuleQuantConfig;
  depth: "balanced" | "deep" | "advanced";
};

self.onmessage = (event: MessageEvent<Request>) => {
  try {
    const depth = event.data.depth;
    const candidates = discoverFormulaCandidates({
      draws: event.data.draws,
      config: event.data.config,
      limit: 18,
      maxTerms: depth === "advanced" ? 5 : depth === "deep" ? 4 : 3,
      trainRatio: 0.6,
      validationRatio: 0.2,
      orderModes: depth === "balanced" ? ["L"] : ["L", "D"],
      formulaStyles: depth === "advanced"
        ? ["sum", "alternating", "subtract_last", "constant_adjusted"]
        : depth === "deep"
          ? ["sum", "alternating"]
          : ["sum"],
      combinationLimitPerTerm: depth === "advanced" ? 18 : depth === "deep" ? 28 : 36,
      minTrainingRate: depth === "advanced" ? 68 : 62,
      minValidationRate: depth === "advanced" ? 68 : 62,
      minHoldoutRate: depth === "advanced" ? 68 : 62,
      minRecentRate: depth === "advanced" ? 70 : 60,
      maxTrainValidationGap: depth === "advanced" ? 16 : depth === "deep" ? 20 : 24,
    });
    self.postMessage({ ok: true, candidates });
  } catch (error) {
    self.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
};

export {};
