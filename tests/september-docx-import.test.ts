import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { appendMissingRules, importRuleSignature } from "../scripts/append-rule-library-docx.mjs";
import report from "../docs/rule-import-20260926.json";
import { seedConfig, seedDraws, seedRules } from "@/lib/data/seed";
import { normalizeDraw } from "@/lib/engine/attributes";
import { runRuleCalculation } from "@/lib/rule-engine/rule-engine";
import { buildRuleSignature } from "@/lib/rules/rule-library";
import type { RuleRecord } from "@/types/domain";

const rawRules: RuleRecord[] = JSON.parse(readFileSync(new URL("../data/sample-rules.json", import.meta.url), "utf8"));
const newRules = seedRules.filter((rule) => rule.id.startsWith("rq-docx-20260926-"));
const signatureFor = (rule: RuleRecord) => importRuleSignature(rule, buildRuleSignature);

describe("September 320-entry Word add-only sync", () => {
  it("accounts for all 320 entries and preserves all 258 existing objects exactly", () => {
    expect(report).toMatchObject({ sourceTotal: 320, previousTotal: 258, added: 73, alreadyPresent: 247, total: 331 });
    expect(report.entries.map((entry) => entry.index)).toEqual(Array.from({ length: 320 }, (_, index) => index + 1));
    expect(createHash("sha256").update(JSON.stringify(rawRules.slice(0, 258))).digest("hex")).toBe(report.previousRulesSha256);
    for (const entry of report.entries) {
      const rule = seedRules.find((candidate) => candidate.id === entry.ruleId);
      expect(rule, `document entry ${entry.index}`).toBeDefined();
      expect(signatureFor(rule!)).toBe(entry.signature);
    }
    const cloud = JSON.parse(readFileSync(new URL("../public/static-cloud-state.json", import.meta.url), "utf8"));
    expect(cloud.rules).toEqual(rawRules);
    expect(newRules).toHaveLength(73);
    // This is a historical import assertion; later batches may append more number rules.
    expect(seedRules.slice(0, report.total).filter((rule) => rule.category === "kill_number")).toHaveLength(12);
  });

  it("adds nothing on repeat and keeps local disabled/participation state", () => {
    const existing = { ...newRules[0], enabled: false, participatesInReference: false };
    const duplicate = { ...newRules[0], id: "different-document-id", name: "另一个名称" };
    const result = appendMissingRules([existing], [duplicate], signatureFor);
    expect(result.added).toEqual([]);
    expect(result.rules[0]).toBe(existing);
    expect(appendMissingRules(seedRules, newRules, signatureFor).added).toEqual([]);
  });

  it("does not silently overwrite an ID with different math", () => {
    const changed = { ...newRules[0], formula: "平1+12345" };
    expect(() => appendMissingRules([newRules[0]], [changed], signatureFor)).toThrow("ID collision");
  });

  it("retains document configuration even where its title disagrees", () => {
    expect(newRules.find((rule) => rule.id.endsWith("-293"))).toMatchObject({ category: "kill_zodiac", orderMode: "L" });
    expect(newRules.find((rule) => rule.id.endsWith("-306"))).toMatchObject({ orderMode: "D" });
    expect(newRules.find((rule) => rule.id.endsWith("-301"))?.formula).toBe("98+平3段+期数尾+总数尾+期数尾");
  });

  it("recognizes the Chinese-position spelling in entry 292 without modifying the existing rule", () => {
    const entry = report.entries[291];
    const existing = seedRules.find((rule) => rule.id === entry.ruleId)!;
    const candidate = { ...existing, id: "rq-docx-20260926-292", formula: "平二波+平六头+平三尾+落六合尾+平码四+09" };
    expect(entry.status).toBe("already-present");
    expect(signatureFor(candidate)).toBe(signatureFor(existing));
    expect(appendMissingRules([existing], [candidate], signatureFor).added).toEqual([]);
    for (const raw of seedDraws) {
      const draw = normalizeDraw(raw, seedConfig);
      expect(runRuleCalculation(candidate, draw, seedConfig).rawResult).toBe(runRuleCalculation(existing, draw, seedConfig).rawResult);
    }
  });

  it("calculates all 73 additions over every bundled draw without errors", () => {
    const failures: string[] = [];
    const normalized = seedDraws.map((draw) => normalizeDraw(draw, seedConfig));
    for (const rule of newRules) {
      for (const draw of normalized) {
        try {
          const result = runRuleCalculation(rule, draw, seedConfig);
          if (!Number.isFinite(result.rawResult) || !result.mappedResult.length) failures.push(`${rule.id}/${draw.issue}: empty result`);
        } catch (error) {
          failures.push(`${rule.id}/${draw.issue}: ${String(error)}`);
        }
      }
    }
    expect(failures).toEqual([]);
  }, 30_000);
});
