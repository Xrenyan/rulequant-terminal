import { describe, expect, it } from "vitest";
import { defaultConfig } from "@/lib/config/default-config";
import { validateRuleQuantConfig } from "@/lib/config/validate-config";

describe("RuleQuant config validation", () => {
  it("accepts the built-in complete configuration", () => {
    expect(validateRuleQuantConfig(structuredClone(defaultConfig))).toEqual(defaultConfig);
  });

  it("rejects duplicated numbers in a zodiac partition", () => {
    const config = structuredClone(defaultConfig);
    config.zodiacTable.马[0] = config.zodiacTable.蛇[0];

    expect(() => validateRuleQuantConfig(config)).toThrow(/重复出现/);
  });

  it("rejects a segment table that does not cover all 49 numbers", () => {
    const config = structuredClone(defaultConfig);
    config.segmentRanges.at(-1)!.to = 48;

    expect(() => validateRuleQuantConfig(config)).toThrow(/完整覆盖 1-49/);
  });
});
