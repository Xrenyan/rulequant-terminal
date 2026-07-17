import fs from "node:fs";
import path from "node:path";
import { JSDOM } from "jsdom";

const CATEGORY_BY_LABEL = {
  "杀一肖": "kill_zodiac",
  "选一肖": "include_zodiac",
  "杀一波": "kill_color",
  "参考波色": "include_color",
  "杀单双": "kill_parity",
  "参考单双": "include_parity",
  "杀大小": "kill_size",
  "参考大小": "include_size",
  "杀一合": "kill_sum",
  "杀一尾": "kill_tail",
  "杀一头": "kill_head",
  "杀半头": "kill_half_head",
  "杀一门": "kill_door",
  "杀一行": "kill_element",
  "杀一段": "kill_segment",
  "七尾": "seven_tail",
  "取六肖": "six_zodiac",
  "八肖": "eight_zodiac",
  "八肖管两期": "eight_zodiac_two_period",
  "九肖": "nine_zodiac",
  "杀三肖 / 九肖": "kill_three_as_nine",
};

const SOURCE_BY_LABEL = {
  "用户提供公式": "user_provided",
  "人工新增公式": "manual",
  "系统推荐公式": "system_recommended",
  "TXT 导入公式": "txt_import",
  "复制公式": "copied",
  "示例公式": "example",
};

function clean(value) {
  return String(value ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function canonicalAttribute(attribute) {
  switch (attribute) {
    case "合数":
      return "合";
    case "合数尾":
      return "合尾";
    case "波":
    case "波色":
    case "波色值":
      return "波色值";
    case "行":
    case "五行":
    case "五行值":
      return "五行值";
    case "奇偶":
      return "单双";
    default:
      return attribute;
  }
}

function compactFormula(value) {
  let normalized = clean(value)
    .normalize("NFKC")
    .replace(/([1-7])\uFE0F?\u20E3/g, "$1")
    .replace(/[，、；;]/g, "+")
    .replace(/\s+/g, "")
    .replace(/落([1-6])/g, "平$1")
    .replace(/(?:落7|平7|特号)/g, "特码")
    .replace(/(^|[+\-*/(])特(?=$|[+\-*/)])/g, "$1特码")
    .replace(/特(?=(?:头|尾|合|合数|合尾|合数尾|段|波|波色|波色值|行|五行|五行值|单双|奇偶|大小|位))/g, "特码")
    .replace(/期(?:号|数)尾/g, "期尾")
    .replace(
      /(合数尾|合尾|合数|合|波色值|波色|波|五行值|五行|行|头|尾|段|单双|奇偶|大小|位)\((平[1-6]|特码)\)/g,
      (_, attribute, position) => `${position}${canonicalAttribute(attribute)}`,
    )
    .replace(
      /(平[1-6]|特码)(合数尾|合尾|合数|合|波色值|波色|波|五行值|五行|行|头|尾|段|单双|奇偶|大小|位)/g,
      (_, position, attribute) => `${position}${canonicalAttribute(attribute)}`,
    );

  if (normalized.includes("+") && !/[\-*/]/.test(normalized)) {
    normalized = normalized.split("+").filter(Boolean).sort((a, b) => a.localeCompare(b, "zh-CN", { numeric: true })).join("+");
  }
  return normalized;
}

function logicalSignature(rule) {
  return [
    rule.category,
    rule.target,
    rule.orderMode,
    compactFormula(rule.formula),
    clean(rule.normalizer),
    (rule.positionPattern ?? []).map(Number).filter(Number.isFinite).join(","),
    clean(rule.anchorIssue),
    String(rule.anchorPatternIndex ?? 0),
    String(rule.periodSpan ?? 1),
    String(rule.verifyOffset ?? rule.periodSpan ?? 1),
  ].join("|");
}

function rowValues(row) {
  return [...row.cells].map((cell) => clean(cell.textContent));
}

function parseNumber(value, fallback) {
  const match = clean(value).match(/\d+/);
  return match ? Number(match[0]) : fallback;
}

function nextTextSibling(node, tagName) {
  let current = node?.nextElementSibling;
  while (current) {
    if (current.tagName === tagName) return current;
    current = current.nextElementSibling;
  }
  return undefined;
}

function parseDescriptionAndExamples(table) {
  const descriptionHeading = nextTextSibling(table, "H3");
  const description = clean(descriptionHeading?.nextElementSibling?.textContent);
  const sampleHeading = nextTextSibling(descriptionHeading, "H3");
  const examples = [];
  let current = sampleHeading?.nextElementSibling;
  while (current && current.tagName === "P") {
    const value = clean(current.textContent).replace(/^·\s*/, "");
    if (/^\d{2}$/.test(value)) break;
    if (value && value !== "暂无手算样例") examples.push(value);
    current = current.nextElementSibling;
  }
  return { description, examples };
}

function parseExportedRules(htmlFile) {
  const bytes = fs.readFileSync(htmlFile);
  const html = new TextDecoder("gb18030").decode(bytes);
  const document = new JSDOM(html).window.document;
  const tables = [...document.querySelectorAll("table")];
  if (tables.length < 3) throw new Error("没有找到公式详情表格");

  const overviewRows = [...tables[1].rows].slice(1).map(rowValues);
  const detailTables = tables.slice(2);
  if (overviewRows.length !== detailTables.length) {
    throw new Error(`总览 ${overviewRows.length} 条与详情 ${detailTables.length} 条不一致`);
  }

  const exportedAt = "2026-07-16T16:38:37.000Z";
  return overviewRows.map((overview, index) => {
    const [, name, categoryLabel, orderLabel, sourceLabel, statusLabel, participationLabel] = overview;
    const category = CATEGORY_BY_LABEL[categoryLabel];
    const sourceType = SOURCE_BY_LABEL[sourceLabel];
    if (!category) throw new Error(`第 ${index + 1} 条存在未知类型：${categoryLabel}`);
    if (!sourceType) throw new Error(`第 ${index + 1} 条存在未知来源：${sourceLabel}`);

    const table = detailTables[index];
    const rows = [...table.rows].map(rowValues);
    const config = new Map();
    rows.forEach((cells) => {
      for (let cellIndex = 0; cellIndex + 1 < cells.length; cellIndex += 2) {
        config.set(cells[cellIndex], cells[cellIndex + 1]);
      }
    });
    const formula = clean(table.previousElementSibling?.textContent);
    const positionPatternText = config.get("取位循环") ?? "";
    const positionPattern = /无固定取位循环/.test(positionPatternText)
      ? []
      : [...positionPatternText.matchAll(/\d+/g)].map((match) => Number(match[0]));
    const anchorIssueText = config.get("锚点期号");
    const anchorIndexText = config.get("锚点位置");
    const { description, examples } = parseDescriptionAndExamples(table);
    const sourcePrefix = sourceType === "system_recommended" ? "rq-system-html" : "rq-manual-html";

    const rule = {
      id: `${sourcePrefix}-20260716-${String(index + 1).padStart(3, "0")}`,
      name,
      category,
      orderMode: orderLabel === "D序" ? "D" : "L",
      formula,
      normalizer: config.get("归一化") || "auto",
      target: config.get("目标") || "special",
      verifyMode: "next_special",
      positionPattern,
      periodSpan: parseNumber(config.get("管期"), 1),
      verifyOffset: parseNumber(config.get("验证偏移"), 1),
      enabled: statusLabel === "启用",
      manuallyConfirmed: sourceType === "system_recommended",
      participatesInReference: participationLabel === "参与",
      sourceType,
      origin: "RuleQuant-全部公式-68条-20260716.html",
      canCompute: true,
      parseStatus: "parsed",
      verifyStatus: "unchecked",
      tags: [categoryLabel, orderLabel, sourceLabel],
      description,
      sourceFile: config.get("来源文件") || "RuleQuant-全部公式-68条-20260716.html",
      examples,
      createdAt: exportedAt,
      updatedAt: exportedAt,
    };
    if (anchorIssueText && anchorIssueText !== "无") rule.anchorIssue = anchorIssueText;
    if (anchorIndexText && anchorIndexText !== "无") rule.anchorPatternIndex = parseNumber(anchorIndexText, 0);
    rule.librarySignature = logicalSignature(rule);
    return rule;
  });
}

const htmlFile = process.argv[2];
const write = process.argv.includes("--write");
if (!htmlFile) {
  console.error("用法：node scripts/import-rule-library-html.mjs <公式导出.html> [--write]");
  process.exit(1);
}

const rulesFile = path.resolve("data/sample-rules.json");
const existingRules = JSON.parse(fs.readFileSync(rulesFile, "utf8"));
const exportedRules = parseExportedRules(path.resolve(htmlFile));
const existingSignatures = new Set(existingRules.map(logicalSignature));
const existingByName = new Map(existingRules.map((rule) => [rule.name, rule]));
const renamedRuleMatches = new Map([
  ["D序杀一行 - 样例核心", "L序杀一行 - 样例核心"],
  ["澳门七尾 - 平1尾平2段", "澳门七尾规公式2"],
]);
const matchingExistingRule = (rule) => {
  const canonicalName = renamedRuleMatches.get(rule.name) ?? rule.name;
  return existingByName.get(canonicalName);
};
const missing = exportedRules.filter((rule) => {
  return !existingSignatures.has(logicalSignature(rule)) && !matchingExistingRule(rule);
});
const modified = exportedRules.flatMap((rule) => {
  const existing = matchingExistingRule(rule);
  if (!existing || logicalSignature(existing) === logicalSignature(rule)) return [];
  return [{ rule, existing }];
});

const report = {
  exported: exportedRules.length,
  existing: existingRules.length,
  matched: exportedRules.length - missing.length,
  missing: missing.length,
  modifiedExisting: modified.length,
  modifiedRules: modified.map(({ rule, existing }) => ({
    currentName: existing.name,
    exportedName: rule.name,
    currentFormula: existing.formula,
    exportedFormula: rule.formula,
    currentOrderMode: existing.orderMode,
    exportedOrderMode: rule.orderMode,
  })),
  missingRules: missing.map((rule) => ({
    id: rule.id,
    name: rule.name,
    sourceType: rule.sourceType,
    enabled: rule.enabled,
    participatesInReference: rule.participatesInReference,
    formula: rule.formula,
  })),
};
console.log(JSON.stringify(report, null, 2));

if (write && missing.length) {
  const next = [...existingRules, ...missing];
  fs.writeFileSync(rulesFile, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  console.error(`已写入 ${missing.length} 条，公式库现在共 ${next.length} 条。`);
}
