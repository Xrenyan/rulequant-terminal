export type SavedFormulaGroup = { id: string; name: string; ruleIds: string[]; updatedAt: string };
export const FORMULA_GROUPS_KEY = "rulequant:formula-groups:v1";

export function parseFormulaGroups(raw: string | null): SavedFormulaGroup[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const groups = new Map<string, SavedFormulaGroup>();
    for (const value of parsed) {
      if (!value || typeof value !== "object") continue;
      const item = value as Partial<SavedFormulaGroup>;
      if (typeof item.id !== "string" || !item.id || typeof item.name !== "string" || !item.name.trim() || !Array.isArray(item.ruleIds)) continue;
      const ruleIds = [...new Set(item.ruleIds.filter((id): id is string => typeof id === "string" && Boolean(id.trim())))];
      if (!ruleIds.length) continue;
      groups.set(item.id, { id: item.id, name: item.name.trim().slice(0, 60), ruleIds, updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : "" });
    }
    return [...groups.values()].slice(0, 40);
  } catch { return []; }
}

export function saveFormulaGroup(groups: SavedFormulaGroup[], group: SavedFormulaGroup): SavedFormulaGroup[] {
  const name = group.name.trim();
  const ruleIds = [...new Set(group.ruleIds.filter(Boolean))];
  if (!name) throw new Error("请给这组公式起个名字。");
  if (!ruleIds.length) throw new Error("请至少选择一条公式。");
  if (!groups.some((item) => item.id === group.id) && groups.length >= 40) throw new Error("已保存40组，请先整理不再使用的组合。");
  return [{ ...group, name: name.slice(0, 60), ruleIds }, ...groups.filter((item) => item.id !== group.id)];
}
