import type { RuleCategory, RuleRecord } from "@/types/domain";

export type RuleTextParseResult = {
  rules: RuleRecord[];
  errors: string[];
  warnings: string[];
};

const chineseDigits: Record<string, number> = {
  "1": 1,
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
};

function normalizeFormula(value: string): string {
  return value
    .replace(/[：]/g, ":")
    .replace(/[＋]/g, "+")
    .replace(/[－]/g, "-")
    .replace(/[×]/g, "*")
    .replace(/[÷]/g, "/")
    .replace(/，.*/g, "")
    .trim();
}

function categoryFromText(text: string, formula: string): RuleCategory {
  const scope = `${text}\n${formula}`;
  if (/九肖/.test(scope)) return "nine_zodiac";
  if (/八肖管两期|管2期/.test(scope)) return "eight_zodiac_two_period";
  if (/八肖/.test(scope)) return "eight_zodiac";
  if (/七尾/.test(scope)) return "seven_tail";
  if (/杀三肖/.test(scope)) return "kill_three_as_nine";
  if (/杀一?合|合数/.test(scope)) return "kill_sum";
  if (/杀一?尾/.test(scope)) return "kill_tail";
  if (/杀半头/.test(scope)) return "kill_half_head";
  if (/杀一门|门数/.test(scope)) return "kill_door";
  if (/杀一?头/.test(scope)) return "kill_head";
  if (/杀一?行|五行/.test(scope) && !/[肖尾头合段]/.test(formula)) return "kill_element";
  if (/杀一?段/.test(scope)) return "kill_segment";
  if (/波色|杀一?波|杀色/.test(scope) && /计算类型[:：]\s*(?:波色|杀一?波|杀色)/.test(scope)) return "kill_color";
  return "kill_zodiac";
}

function normalizerFor(category: RuleCategory): string {
  switch (category) {
    case "kill_zodiac":
      return "subtract_48_to_1_49";
    case "kill_sum":
      return "subtract_13_to_1_13";
    case "kill_tail":
      return "mod_10";
    case "kill_head":
      return "subtract_5_to_0_4";
    case "kill_half_head":
      return "half_head_digit";
    case "kill_door":
      return "subtract_5_to_1_5";
    case "kill_color":
      return "mod_3";
    case "kill_element":
      return "subtract_5_to_1_5";
    case "kill_segment":
      return "subtract_7_to_1_7";
    case "seven_tail":
      return "tail_offsets";
    case "eight_zodiac":
      return "eight_zodiac";
    case "eight_zodiac_two_period":
      return "eight_zodiac_two_period";
    case "nine_zodiac":
      return "nine_zodiac_plus_1_three_clash";
    case "kill_three_as_nine":
      return "kill_three_as_nine";
    default:
      return "custom";
  }
}

function targetFor(category: RuleCategory): string {
  switch (category) {
    case "kill_zodiac":
    case "eight_zodiac":
    case "eight_zodiac_two_period":
    case "nine_zodiac":
    case "kill_three_as_nine":
      return "special_zodiac";
    case "kill_sum":
      return "special_sum";
    case "kill_tail":
    case "seven_tail":
      return "special_tail";
    case "kill_head":
      return "special_head";
    case "kill_half_head":
    case "kill_door":
      return "special_number";
    case "kill_element":
      return "special_element";
    case "kill_segment":
      return "special_segment";
    case "kill_color":
    case "include_color":
      return "special_color";
    case "kill_parity":
    case "include_parity":
      return "special_parity";
    case "kill_size":
    case "include_size":
      return "special_size";
    default:
      return "special";
  }
}

function slug(text: string): string {
  const ascii = text.replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 36);
  return ascii || Math.random().toString(36).slice(2, 8);
}

function patternFromText(text: string): number[] {
  if (/1234567\.1234567/.test(text)) return [1, 2, 3, 4, 5, 6, 7, 1, 2, 3, 4, 5, 6, 7];
  if (/7654321\.7654321/.test(text)) return [7, 6, 5, 4, 3, 2, 1, 7, 6, 5, 4, 3, 2, 1];
  if (/7654321\.23456/.test(text)) return [7, 6, 5, 4, 3, 2, 1, 2, 3, 4, 5, 6];
  if (/123456\.5432\.123456\.5432/.test(text)) return [1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1, 2, 3, 4, 5, 6, 5, 4, 3, 2];
  if (/123456\.5432/.test(text)) return [1, 2, 3, 4, 5, 6, 5, 4, 3, 2];
  if (/4455/.test(text)) return [4, 4, 5, 5];
  return [];
}

function issuePositionPairs(text: string): Array<{ issue: number; position: number }> {
  return [...text.matchAll(/(?:20)?(\d{3})\s*平([1-7一二三四五六七])/g)]
    .map((match) => ({ issue: Number(match[1]), position: chineseDigits[match[2]] }))
    .filter((item) => Number.isFinite(item.issue) && Number.isFinite(item.position));
}

function inferAnchor(text: string, pattern: number[]): { anchorIssue?: string; anchorPatternIndex?: number } {
  if (!pattern.length) return {};
  const pairs = issuePositionPairs(text);
  const first = pairs[0];
  if (!first) return {};
  for (let index = 0; index < pattern.length; index += 1) {
    if (pattern[index] !== first.position) continue;
    const matchesAll = pairs.every((pair) => pattern[((pair.issue - first.issue + index) % pattern.length + pattern.length) % pattern.length] === pair.position);
    if (matchesAll) return { anchorIssue: `2026${String(first.issue).padStart(3, "0")}`, anchorPatternIndex: index };
  }
  return { anchorIssue: `2026${String(first.issue).padStart(3, "0")}` };
}

function formulaLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.match(/公式[:：]\s*(.+)$/)?.[1])
    .filter((line): line is string => Boolean(line))
    .map(normalizeFormula);
}

export function parseRuleTextFile(text: string, fileName: string): RuleTextParseResult {
  const warnings: string[] = [];
  const formulas = formulaLines(text);
  const pattern = patternFromText(text);
  const anchor = inferAnchor(text, pattern);
  const now = new Date().toISOString();

  if (!formulas.length && /九肖/.test(text)) {
    formulas.push("平1");
  }
  if (!formulas.length) {
    return { rules: [], errors: ["没有识别到“公式：...”行，也没有识别到可自动结构化的九肖文本。"], warnings };
  }

  const rules = formulas.map((formula, index): RuleRecord => {
    const category = categoryFromText(text, formula);
    const orderMode = /D序|D\s*序/.test(text) ? "D" : "L";
    return {
      id: `txt-${slug(fileName)}-${Date.now()}-${index}`,
      name: `${fileName.replace(/\.[^.]+$/, "")}${formulas.length > 1 ? ` - ${index + 1}` : ""}`,
      category,
      orderMode,
      formula,
      normalizer: normalizerFor(category),
      target: targetFor(category),
      verifyMode: "next_special",
      positionPattern: ["eight_zodiac", "nine_zodiac", "kill_three_as_nine", "include_parity", "kill_parity"].includes(category) ? pattern : [],
      anchorIssue: anchor.anchorIssue,
      anchorPatternIndex: anchor.anchorPatternIndex,
      positionMeaning: pattern.length ? `从 TXT 自动识别取位序列：${pattern.join("")}` : undefined,
      periodSpan: category === "eight_zodiac_two_period" ? 2 : 1,
      enabled: true,
      participatesInReference: true,
      sourceType: "txt_import",
      origin: fileName,
      fromTextId: fileName,
      parseStatus: "parsed",
      verifyStatus: "unchecked",
      tags: ["TXT导入", category],
      description: `从 TXT 文件“${fileName}”识别导入。导入后请打开逐期明细核对手算样例。`,
      sourceFile: fileName,
      examples: [],
      createdAt: now,
      updatedAt: now,
    };
  });

  if (pattern.length && !anchor.anchorIssue) warnings.push("识别到取位序列，但没有找到可作为锚点的期号样例，请在公式编辑器里补锚点。");
  return { rules, errors: [], warnings };
}
