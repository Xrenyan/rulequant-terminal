import { describe, expect, it } from "vitest";
import { mergeRuleSnapshots, readRuleLibrarySnapshot, RULE_LIBRARY_SNAPSHOT_KEY, writeRuleLibrarySnapshot } from "@/lib/storage/rule-snapshot";
import { seedRules } from "@/lib/data/seed";

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    values,
  };
}

describe("rule library fallback snapshot", () => {
  it("writes and restores all manually added rules", () => {
    const storage = createStorage();
    const manualRules = Array.from({ length: 8 }, (_, index) => ({
      ...seedRules[0],
      id: `manual-${index}`,
      name: `人工规则 ${index + 1}`,
      sourceType: "manual" as const,
      updatedAt: `2026-07-10T00:00:0${index}.000Z`,
    }));

    expect(writeRuleLibrarySnapshot(manualRules, storage)).toBe(true);
    expect(storage.values.has(RULE_LIBRARY_SNAPSHOT_KEY)).toBe(true);
    expect(readRuleLibrarySnapshot(storage)).toHaveLength(8);
  });

  it("keeps new backup-only rules and prefers the newest matching copy", () => {
    const primary = { ...seedRules[0], id: "manual-a", sourceType: "manual" as const, updatedAt: "2026-07-10T00:00:00.000Z" };
    const newerBackup = { ...primary, name: "手机端最新修改", updatedAt: "2026-07-10T01:00:00.000Z" };
    const backupOnly = { ...seedRules[0], id: "manual-b", name: "手机端新增", sourceType: "manual" as const };

    const merged = mergeRuleSnapshots([primary], [newerBackup, backupOnly]);

    expect(merged).toHaveLength(2);
    expect(merged.find((rule) => rule.id === "manual-a")?.name).toBe("手机端最新修改");
    expect(merged.some((rule) => rule.id === "manual-b")).toBe(true);
  });

  it("ignores damaged snapshots instead of resetting the app", () => {
    const storage = createStorage();
    storage.setItem(RULE_LIBRARY_SNAPSHOT_KEY, "{broken");
    expect(readRuleLibrarySnapshot(storage)).toEqual([]);
  });

  it("merges thousands of rules without applying an artificial count limit", () => {
    const primaryRules = Array.from({ length: 1_500 }, (_, index) => ({
      ...seedRules[0],
      id: `primary-${index}`,
      name: `主库规则 ${index}`,
      sourceType: "manual" as const,
    }));
    const backupRules = Array.from({ length: 1_500 }, (_, index) => ({
      ...seedRules[0],
      id: `backup-${index}`,
      name: `备用规则 ${index}`,
      sourceType: "manual" as const,
    }));

    expect(mergeRuleSnapshots(primaryRules, backupRules)).toHaveLength(3_000);
  });
});
