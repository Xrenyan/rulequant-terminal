import type { BacktestResult, CandidatePoolReport, DrawRecord, ReferenceHistoryItem, RuleQuantConfig, RuleRecord, SampleCheckResult } from "@/types/domain";

type XlsxModule = typeof import("xlsx");

let xlsxPromise: Promise<XlsxModule> | undefined;

function loadXlsx() {
  xlsxPromise ??= import("xlsx");
  return xlsxPromise;
}

type ReferenceHistoryExportItem = ReferenceHistoryItem & {
  actualNextIssue?: string;
  actualSpecial?: number;
  actualZodiac?: string;
  hitTop8?: boolean;
  hitTop12?: boolean;
  hitTop18?: boolean;
  hitZodiac7?: boolean;
  hitZodiac9?: boolean;
};

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function exportJson(data: unknown, filename: string) {
  downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" }), filename);
}

const ruleSourceLabels: Record<string, string> = {
  user_provided: "用户提供公式",
  manual: "人工新增公式",
  system_recommended: "系统推荐公式",
  txt_import: "TXT 导入公式",
  copied: "复制公式",
  example: "示例公式",
};

const ruleCategoryLabels: Record<string, string> = {
  kill_zodiac: "杀一肖",
  include_zodiac: "选生肖",
  kill_color: "杀一波",
  include_color: "参考波色",
  kill_parity: "杀单双",
  include_parity: "参考单双",
  kill_size: "杀大小",
  include_size: "参考大小",
  kill_sum: "杀一合",
  kill_tail: "杀一尾",
  kill_head: "杀一头",
  kill_half_head: "杀半头",
  kill_door: "杀一门",
  kill_element: "杀一行",
  kill_segment: "杀一段",
  seven_tail: "七尾",
  six_zodiac: "取六肖",
  eight_zodiac: "八肖",
  eight_zodiac_two_period: "八肖管两期",
  nine_zodiac: "九肖",
  kill_three_as_nine: "杀三肖 / 九肖",
  custom_set: "自定义集合",
};

export function buildRuleLibraryWordHtml(rules: RuleRecord[]) {
  const generatedAt = new Date().toLocaleString("zh-CN", { hour12: false });
  const enabledCount = rules.filter((rule) => rule.enabled).length;
  const referenceCount = rules.filter((rule) => rule.enabled && rule.participatesInReference !== false).length;
  const manualCount = rules.filter((rule) => rule.sourceType === "manual").length;
  const txtCount = rules.filter((rule) => rule.sourceType === "txt_import").length;
  const recommendedCount = rules.filter((rule) => rule.sourceType === "system_recommended").length;
  const overviewRows = rules.map((rule, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHtml(rule.name)}</td>
      <td>${escapeHtml(ruleCategoryLabels[rule.category] ?? rule.category)}</td>
      <td>${escapeHtml(rule.orderMode)}序</td>
      <td>${escapeHtml(ruleSourceLabels[rule.sourceType ?? "user_provided"] ?? rule.sourceType ?? "用户提供公式")}</td>
      <td>${rule.enabled ? "启用" : "停用"}</td>
      <td>${rule.participatesInReference !== false ? "参与" : "不参与"}</td>
    </tr>`).join("");
  const detailSections = rules.map((rule, index) => {
    const sourceLabel = ruleSourceLabels[rule.sourceType ?? "user_provided"] ?? rule.sourceType ?? "用户提供公式";
    const pattern = rule.positionPattern?.length ? rule.positionPattern.join(" → ") : "无固定取位循环";
    const examples = rule.examples?.length ? rule.examples.map((item) => `<li>${escapeHtml(item)}</li>`).join("") : "<li>暂无手算样例</li>";
    return `
      <section class="rule-card">
        <div class="rule-heading">
          <span class="rule-index">${String(index + 1).padStart(2, "0")}</span>
          <div><h2>${escapeHtml(rule.name)}</h2><p>${escapeHtml(ruleCategoryLabels[rule.category] ?? rule.category)} · ${escapeHtml(rule.orderMode)}序 · ${escapeHtml(sourceLabel)}</p></div>
        </div>
        <div class="status-row">
          <span>${rule.enabled ? "已启用" : "已停用"}</span>
          <span>${rule.participatesInReference !== false ? "参与综合参考" : "不参与综合参考"}</span>
          <span>${rule.canCompute === false ? "计算异常" : "可计算"}</span>
          <span>${escapeHtml(rule.verifyStatus ?? "unchecked")}</span>
        </div>
        <h3>公式</h3>
        <div class="formula">${escapeHtml(rule.formula)}</div>
        <table class="property-table"><tbody>
          <tr><th>归一化</th><td>${escapeHtml(rule.normalizer || "auto")}</td><th>目标</th><td>${escapeHtml(rule.target)}</td></tr>
          <tr><th>取位循环</th><td colspan="3">${escapeHtml(pattern)}</td></tr>
          <tr><th>锚点期号</th><td>${escapeHtml(rule.anchorIssue ?? "无")}</td><th>锚点位置</th><td>${escapeHtml(rule.anchorPatternIndex ?? "无")}</td></tr>
          <tr><th>管期</th><td>${rule.periodSpan || 1}期</td><th>验证偏移</th><td>${rule.verifyOffset || 1}期</td></tr>
          <tr><th>来源文件</th><td colspan="3">${escapeHtml(rule.sourceFile || rule.origin || "未记录")}</td></tr>
        </tbody></table>
        <h3>规则说明</h3><p class="description">${escapeHtml(rule.description || "暂无说明")}</p>
        <h3>样例</h3><ul>${examples}</ul>
      </section>`;
  }).join("");

  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>RuleQuant 全部公式</title>
<style>
  @page { size: A4; margin: 16mm; }
  body { margin: 0; color: #172033; background: #fff; font-family: "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", Arial, sans-serif; font-size: 11pt; line-height: 1.65; }
  h1 { margin: 0; color: #10213d; font-size: 25pt; letter-spacing: 0; }
  h2 { margin: 0; color: #10213d; font-size: 16pt; }
  h3 { margin: 13px 0 5px; color: #36506f; font-size: 10.5pt; }
  .cover { padding: 12px 0 22px; border-bottom: 3px solid #3e70c9; }
  .cover p { margin: 6px 0 0; color: #65758d; }
  .notice { margin: 16px 0; padding: 10px 13px; border-left: 4px solid #2aa7a0; background: #edf9f8; color: #315b5a; }
  .summary { width: 100%; margin: 16px 0 22px; border-collapse: separate; border-spacing: 7px; }
  .summary td { width: 16.66%; padding: 10px; border: 1px solid #cfd9e7; background: #f5f8fc; text-align: center; }
  .summary strong { display: block; color: #17345d; font-size: 18pt; }.summary span { color: #68788f; font-size: 9pt; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 6px 8px; border: 1px solid #cfd9e7; text-align: left; vertical-align: top; }
  thead th { background: #17345d; color: #fff; font-weight: 600; }
  .overview { font-size: 9pt; }.overview tr:nth-child(even) td { background: #f7f9fc; }
  .section-title { margin: 26px 0 10px; color: #17345d; font-size: 18pt; page-break-after: avoid; }
  .rule-card { margin: 0 0 18px; padding: 14px; border: 1px solid #c9d5e5; border-radius: 8px; page-break-inside: avoid; }
  .rule-heading { display: table; width: 100%; }.rule-heading > * { display: table-cell; vertical-align: middle; }
  .rule-index { width: 42px; color: #3e70c9; font-family: Consolas, monospace; font-size: 17pt; font-weight: 700; }
  .rule-heading p { margin: 2px 0 0; color: #728198; font-size: 9.5pt; }
  .status-row { margin: 10px 0; }.status-row span { display: inline-block; margin: 0 5px 5px 0; padding: 3px 8px; border: 1px solid #b8d9d5; background: #eef9f7; color: #256d66; font-size: 8.5pt; }
  .formula { padding: 10px 12px; border: 1px solid #bfcce0; background: #f2f6fc; color: #0c5e78; font-family: Consolas, "Microsoft YaHei", monospace; font-size: 10.5pt; font-weight: 700; word-break: break-all; }
  .property-table { font-size: 9pt; }.property-table th { width: 82px; background: #f1f5fa; color: #52647c; }.property-table td { color: #25364e; }
  .description, ul { margin: 0; color: #42536b; } ul { padding-left: 20px; }
  .footer { margin-top: 24px; padding-top: 10px; border-top: 1px solid #d7e0ec; color: #7d8999; font-size: 8.5pt; }
</style></head><body>
  <header class="cover"><h1>RuleQuant 全部公式</h1><p>统一公式库完整备查文档 · 导出时间：${escapeHtml(generatedAt)}</p></header>
  <div class="notice">本文件包含导出设备当前已保存的全部公式，包括内置、人工新增、TXT 导入、系统推荐后加入和复制公式。仅用于历史公式研究与规则核对。</div>
  <table class="summary"><tr><td><strong>${rules.length}</strong><span>全部公式</span></td><td><strong>${enabledCount}</strong><span>已启用</span></td><td><strong>${referenceCount}</strong><span>参与参考</span></td><td><strong>${manualCount}</strong><span>人工新增</span></td><td><strong>${txtCount}</strong><span>TXT导入</span></td><td><strong>${recommendedCount}</strong><span>系统推荐</span></td></tr></table>
  <h2 class="section-title">公式总览</h2>
  <table class="overview"><thead><tr><th>序号</th><th>公式名称</th><th>类型</th><th>序列</th><th>来源</th><th>状态</th><th>综合参考</th></tr></thead><tbody>${overviewRows}</tbody></table>
  <h2 class="section-title">逐条公式详情</h2>${detailSections || "<p>当前公式库为空。</p>"}
  <p class="footer">RuleQuant 公式库导出 · 文档中的状态以导出时设备保存内容为准。</p>
</body></html>`;
}

export function exportRuleLibraryWord(rules: RuleRecord[]) {
  const html = buildRuleLibraryWordHtml(rules);
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  downloadBlob(new Blob([`\ufeff${html}`], { type: "application/msword;charset=utf-8" }), `RuleQuant-全部公式-${rules.length}条-${date}.doc`);
}

export async function exportDrawsCsv(draws: DrawRecord[]) {
  const XLSX = await loadXlsx();
  const worksheet = XLSX.utils.json_to_sheet(draws);
  const csv = XLSX.utils.sheet_to_csv(worksheet);
  downloadBlob(new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" }), "rulequant-draws.csv");
}

function displayLength(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (Array.isArray(value)) return value.reduce((total, item) => total + displayLength(item) + 2, 0);
  if (typeof value === "object") return JSON.stringify(value).length;
  return String(value).replace(/\r?\n/g, " ").length;
}

function worksheetFromRows(XLSX: XlsxModule, rows: unknown[]) {
  const normalizedRows = rows as Record<string, unknown>[];
  const worksheet = XLSX.utils.json_to_sheet(normalizedRows);
  const keys = Array.from(normalizedRows.reduce((set, row) => {
    if (row && typeof row === "object" && !Array.isArray(row)) {
      Object.keys(row).forEach((key) => set.add(key));
    }
    return set;
  }, new Set<string>()));

  worksheet["!cols"] = keys.map((key) => {
    const maxValueLength = normalizedRows.reduce((max, row) => Math.max(max, displayLength(row?.[key])), displayLength(key));
    return { wch: Math.min(48, Math.max(10, maxValueLength + 2)) };
  });
  return worksheet;
}

export async function exportWorkbook(sheets: Record<string, unknown[]>, filename: string) {
  const XLSX = await loadXlsx();
  const workbook = XLSX.utils.book_new();
  Object.entries(sheets).forEach(([name, rows]) => {
    XLSX.utils.book_append_sheet(workbook, worksheetFromRows(XLSX, rows), name.slice(0, 31));
  });
  const array = XLSX.write(workbook, { bookType: "xlsx", type: "array", compression: true });
  downloadBlob(new Blob([array], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), filename);
}

export function exportBacktestExcel(result: BacktestResult) {
  const rows = result.ruleResults.flatMap((ruleResult) =>
    ruleResult.details.map((detail) => ({
      rule: detail.ruleName,
      issue: detail.currentIssue,
      formula: detail.formula,
      rawResult: detail.rawResult,
      finalResult: Array.isArray(detail.finalResult) ? detail.finalResult.join("、") : detail.finalResult,
      mappedResult: detail.mappedResult.join("、"),
      nextIssue: detail.nextIssue,
      success: detail.success ? "通过" : "失败",
      process: detail.process.join(" | "),
    })),
  );
  exportWorkbook({ backtest: rows }, "rulequant-backtest.xlsx");
}

export function exportSampleReport(results: SampleCheckResult[]) {
  exportWorkbook(
    {
      sample_check: results.map((item) => ({
        caseId: item.caseId,
        ruleId: item.ruleId,
        issue: item.issue,
        passed: item.passed ? "通过" : "不一致",
        differences: item.differences.map((diff) => `${diff.type}: ${diff.expected} -> ${diff.actual}`).join(" | "),
      })),
    },
    "rulequant-sample-check.xlsx",
  );
}

export function exportCandidatePoolExcel(report: CandidatePoolReport) {
  exportWorkbook(
    {
      top_numbers_8: report.topNumbers8.map((item, index) => ({
        rank: index + 1,
        number: item.number,
        zodiac: item.zodiac,
        tail: item.tail,
        head: item.head,
        sum: item.sum,
        element: item.element,
        color: item.color,
        score: item.score,
        supportCount: item.supportCount,
        opposeCount: item.opposeCount,
        supportRules: item.supportRules.map((rule) => rule.ruleName).join(" | "),
        opposeRules: item.opposeRules.map((rule) => rule.ruleName).join(" | "),
      })),
      top_numbers_12: report.topNumbers12.map((item, index) => ({
        rank: index + 1,
        number: item.number,
        zodiac: item.zodiac,
        tail: item.tail,
        head: item.head,
        sum: item.sum,
        element: item.element,
        color: item.color,
        score: item.score,
        supportCount: item.supportCount,
        opposeCount: item.opposeCount,
        supportRules: item.supportRules.map((rule) => rule.ruleName).join(" | "),
        opposeRules: item.opposeRules.map((rule) => rule.ruleName).join(" | "),
      })),
      top_numbers_18: report.topNumbers18.map((item, index) => ({
        rank: index + 1,
        number: item.number,
        zodiac: item.zodiac,
        tail: item.tail,
        head: item.head,
        sum: item.sum,
        element: item.element,
        color: item.color,
        score: item.score,
        supportCount: item.supportCount,
        opposeCount: item.opposeCount,
        supportRules: item.supportRules.map((rule) => rule.ruleName).join(" | "),
        opposeRules: item.opposeRules.map((rule) => rule.ruleName).join(" | "),
      })),
      top_zodiacs_9: report.topZodiacs9.map((item, index) => ({
        rank: index + 1,
        zodiac: item.zodiac,
        numbers: item.numbers.map((number) => number.number).join("、"),
        score: item.score,
        supportCount: item.supportCount,
        opposeCount: item.opposeCount,
        supportRules: item.supportRules.map((rule) => rule.ruleName).join(" | "),
        opposeRules: item.opposeRules.map((rule) => rule.ruleName).join(" | "),
      })),
      rule_signals: report.signals.map((signal) => ({
        rule: signal.ruleName,
        category: signal.category,
        action: signal.action === "include" ? "支持" : "排除",
        targetType: signal.targetType,
        targets: signal.targets.join("、"),
        weight: signal.weight,
        successRate: signal.successRate,
        recentRate: signal.recentRate,
        currentStreak: signal.currentStreak,
        formula: signal.formula,
        process: signal.process.join(" | "),
      })),
    },
    "rulequant-candidate-pool.xlsx",
  );
}

function padNumber(value: number): string {
  return String(value).padStart(2, "0");
}

function historyNumberList(items: ReferenceHistoryExportItem["topNumbers8"]) {
  return items.map((item) => `${padNumber(item.number)} ${item.zodiac}`).join("、");
}

function historyZodiacList(items: ReferenceHistoryExportItem["topZodiacs9"]) {
  return items.map((item) => `${item.zodiac}(${item.numbers.map((number) => padNumber(number.number)).join("、")})`).join("、");
}

function compactEvidenceText(items: ReferenceHistoryExportItem["topNumbers8"][number]["supportEvidence"]) {
  return (items ?? [])
    .slice(0, 6)
    .map((item) => `${item.ruleName}(${item.action === "include" ? "支持" : "排除"} ${item.scoreDelta > 0 ? "+" : ""}${item.scoreDelta})`)
    .join(" | ");
}

function hitText(value?: boolean) {
  if (value === undefined) return "待开奖";
  return value ? "命中" : "未中";
}

function historySummaryRows(records: ReferenceHistoryExportItem[]) {
  return records.map((record) => ({
    保存时间: record.savedAt,
    生成时间: record.generatedAt,
    使用期号: record.baseIssue ?? "-",
    最新开奖: record.latestNumbers.map(padNumber).join("、"),
    数据来源: record.dataSourceLabel ?? "-",
    记录期数: record.recordCount,
    公式数量: record.ruleCount,
    证据数量: record.signalCount,
    支持证据: record.supportSignalCount ?? 0,
    排除证据: record.opposeSignalCount ?? 0,
    命中排名: record.outcome?.hitNumberRank ?? "",
    命中分区: record.outcome?.hitBand ?? "",
    下期开奖期号: record.actualNextIssue ?? "待开奖",
    下期特码: record.actualSpecial ? `${padNumber(record.actualSpecial)} ${record.actualZodiac ?? ""}` : "待开奖",
    Top8结果: hitText(record.hitTop8),
    Top12结果: hitText(record.hitTop12),
    Top18结果: hitText(record.hitTop18),
    生肖Top7结果: hitText(record.hitZodiac7),
    生肖Top9结果: hitText(record.hitZodiac9),
    Top8号码: historyNumberList(record.topNumbers8),
    Top12号码: historyNumberList(record.topNumbers12),
    Top16号码: historyNumberList(record.topNumbers16),
    Top18号码: historyNumberList(record.topNumbers18),
    生肖Top7: historyZodiacList(record.topZodiacs7),
    生肖Top8: historyZodiacList(record.topZodiacs8),
    生肖Top9: historyZodiacList(record.topZodiacs9),
    备注: record.note ?? "",
  }));
}

function historyNumberRows(records: ReferenceHistoryExportItem[], key: "topNumbers8" | "topNumbers12" | "topNumbers16" | "topNumbers18") {
  return records.flatMap((record) =>
    record[key].map((item, index) => ({
      使用期号: record.baseIssue ?? "-",
      保存时间: record.savedAt,
      分组: key === "topNumbers8" ? "Top8" : key === "topNumbers12" ? "Top12" : key === "topNumbers16" ? "Top16" : "Top18",
      排名: item.rank ?? index + 1,
      号码: padNumber(item.number),
      生肖: item.zodiac,
      分数: item.score,
      支持公式: item.supportCount,
      反对公式: item.opposeCount,
      波色: item.color ?? "",
      五行: item.element ?? "",
      尾: item.tail ?? "",
      合: item.sum ?? "",
      段: item.segment ?? "",
      下期特码: record.actualSpecial ? padNumber(record.actualSpecial) : "待开奖",
      是否命中: record.actualSpecial === undefined ? "待开奖" : item.number === record.actualSpecial ? "命中" : "",
      支持规则: item.supportRuleNames?.join(" | ") ?? "",
      反对规则: item.opposeRuleNames?.join(" | ") ?? "",
      支持证据: compactEvidenceText(item.supportEvidence),
      反对证据: compactEvidenceText(item.opposeEvidence),
    })),
  );
}

function historyAllNumberRows(records: ReferenceHistoryExportItem[]) {
  return records.flatMap((record) =>
    (record.allNumbers ?? record.topNumbers18).map((item, index) => ({
      使用期号: record.baseIssue ?? "-",
      保存时间: record.savedAt,
      排名: item.rank ?? index + 1,
      号码: padNumber(item.number),
      生肖: item.zodiac,
      分数: item.score,
      支持公式: item.supportCount,
      反对公式: item.opposeCount,
      是否Top8: item.inTop8 ? "是" : "",
      是否Top12: item.inTop12 ? "是" : "",
      是否Top16: item.inTop16 ? "是" : "",
      是否Top18: item.inTop18 ? "是" : "",
      下期特码: record.actualSpecial ? padNumber(record.actualSpecial) : "待开奖",
      是否命中: record.actualSpecial === undefined ? "待开奖" : item.number === record.actualSpecial ? "命中" : "",
      波色: item.color ?? "",
      五行: item.element ?? "",
      尾: item.tail ?? "",
      合: item.sum ?? "",
      段: item.segment ?? "",
      支持规则: item.supportRuleNames?.join(" | ") ?? "",
      反对规则: item.opposeRuleNames?.join(" | ") ?? "",
      支持证据: compactEvidenceText(item.supportEvidence),
      反对证据: compactEvidenceText(item.opposeEvidence),
    })),
  );
}

function historyZodiacRows(records: ReferenceHistoryExportItem[]) {
  return records.flatMap((record) =>
    (record.allZodiacs ?? record.topZodiacs9).map((item, index) => ({
      使用期号: record.baseIssue ?? "-",
      保存时间: record.savedAt,
      分组: item.inTop7 ? "Top7/Top8/Top9" : item.inTop8 ? "Top8/Top9" : item.inTop9 ? "Top9" : "全量生肖",
      排名: item.rank ?? index + 1,
      生肖: item.zodiac,
      对应号码: item.numbers.map((number) => `${padNumber(number.number)} ${number.zodiac}`).join("、"),
      分数: item.score,
      支持公式: item.supportCount,
      反对公式: item.opposeCount,
      下期生肖: record.actualZodiac ?? "待开奖",
      是否命中: record.actualZodiac === undefined ? "待开奖" : item.zodiac === record.actualZodiac ? "命中" : "",
      支持规则: item.supportRuleNames?.join(" | ") ?? "",
      反对规则: item.opposeRuleNames?.join(" | ") ?? "",
      支持证据: compactEvidenceText(item.supportEvidence),
      反对证据: compactEvidenceText(item.opposeEvidence),
    })),
  );
}

function historyEvidenceRows(records: ReferenceHistoryExportItem[]) {
  return records.flatMap((record) => {
    const summaryRows = (record.evidenceSummary ?? []).map((item, index) => ({
      使用期号: record.baseIssue ?? "-",
      保存时间: record.savedAt,
      对象类型: "全局摘要",
      对象: "-",
      排名: "",
      序号: index + 1,
      规则: item.ruleName,
      动作: item.action === "include" ? "支持" : "排除",
      目标类型: item.targetType,
      目标: item.targets.join("、"),
      分值: item.scoreDelta,
      权重: item.weight,
      历史成功率: item.successRate,
      最近表现: item.recentRate,
      当前连对: item.currentStreak,
      当前连错: item.wrongStreak ?? 0,
      来源: item.sourceType ?? "user_provided",
      公式: item.formula ?? "",
      过程摘要: item.process?.join(" | ") ?? "",
    }));
    const numberRows = record.topNumbers18.flatMap((candidate) =>
      [...(candidate.supportEvidence ?? []), ...(candidate.opposeEvidence ?? [])].map((item, index) => ({
        使用期号: record.baseIssue ?? "-",
        保存时间: record.savedAt,
        对象类型: "号码",
        对象: `${padNumber(candidate.number)} ${candidate.zodiac}`,
        排名: candidate.rank,
        序号: index + 1,
        规则: item.ruleName,
        动作: item.action === "include" ? "支持" : "排除",
        目标类型: item.targetType,
        目标: item.targets.join("、"),
        分值: item.scoreDelta,
        权重: item.weight,
        历史成功率: item.successRate,
        最近表现: item.recentRate,
        当前连对: item.currentStreak,
        当前连错: item.wrongStreak ?? 0,
        来源: item.sourceType ?? "user_provided",
        公式: item.formula ?? "",
        过程摘要: item.process?.join(" | ") ?? "",
      })),
    );
    const zodiacRows = record.topZodiacs9.flatMap((candidate) =>
      [...(candidate.supportEvidence ?? []), ...(candidate.opposeEvidence ?? [])].map((item, index) => ({
        使用期号: record.baseIssue ?? "-",
        保存时间: record.savedAt,
        对象类型: "生肖",
        对象: candidate.zodiac,
        排名: candidate.rank,
        序号: index + 1,
        规则: item.ruleName,
        动作: item.action === "include" ? "支持" : "排除",
        目标类型: item.targetType,
        目标: item.targets.join("、"),
        分值: item.scoreDelta,
        权重: item.weight,
        历史成功率: item.successRate,
        最近表现: item.recentRate,
        当前连对: item.currentStreak,
        当前连错: item.wrongStreak ?? 0,
        来源: item.sourceType ?? "user_provided",
        公式: item.formula ?? "",
        过程摘要: item.process?.join(" | ") ?? "",
      })),
    );
    return [...summaryRows, ...numberRows, ...zodiacRows];
  });
}

export function exportReferenceHistoryExcel(records: ReferenceHistoryExportItem[]) {
  exportWorkbook(
    {
      综合推荐总览: historySummaryRows(records),
      Top号码: [
        ...historyNumberRows(records, "topNumbers8"),
        ...historyNumberRows(records, "topNumbers12"),
        ...historyNumberRows(records, "topNumbers16"),
        ...historyNumberRows(records, "topNumbers18"),
      ],
      全量号码49: historyAllNumberRows(records),
      生肖排名: historyZodiacRows(records),
      证据摘要: historyEvidenceRows(records),
    },
    "rulequant-reference-history.xlsx",
  );
}

export function exportReferenceHistoryText(records: ReferenceHistoryExportItem[]) {
  const lines = records.flatMap((record) => [
    `【${record.baseIssue ?? "-"}期综合推荐记录】`,
    `保存时间：${record.savedAt}`,
    `生成时间：${record.generatedAt}`,
    `最新开奖：${record.latestNumbers.map(padNumber).join("、")}`,
    `参与公式：${record.ruleCount} 条；证据：${record.signalCount} 条；数据来源：${record.dataSourceLabel ?? "-"}`,
    `下期开奖：${record.actualNextIssue ?? "待开奖"} ${record.actualSpecial ? `${padNumber(record.actualSpecial)} ${record.actualZodiac ?? ""}` : ""}`,
    `Top8：${historyNumberList(record.topNumbers8)}（${hitText(record.hitTop8)}）`,
    `Top12：${historyNumberList(record.topNumbers12)}（${hitText(record.hitTop12)}）`,
    `Top16：${historyNumberList(record.topNumbers16)}（命中排名：${record.outcome?.hitNumberRank ?? "待开奖"}）`,
    `Top18：${historyNumberList(record.topNumbers18)}（${hitText(record.hitTop18)}）`,
    `生肖Top7：${historyZodiacList(record.topZodiacs7)}（${hitText(record.hitZodiac7)}）`,
    `生肖Top8：${historyZodiacList(record.topZodiacs8)}`,
    `生肖Top9：${historyZodiacList(record.topZodiacs9)}（${hitText(record.hitZodiac9)}）`,
    `全量49号码：${historyNumberList(record.allNumbers ?? [])}`,
    "",
  ]);
  downloadBlob(new Blob([`\ufeff${lines.join("\r\n")}`], { type: "text/plain;charset=utf-8" }), "rulequant-reference-history.txt");
}

export function exportReferenceHistoryWord(records: ReferenceHistoryExportItem[]) {
  const sections = records.map((record) => {
    const numberRows = record.topNumbers18.map((item, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${padNumber(item.number)}</td>
        <td>${escapeHtml(item.zodiac)}</td>
        <td>${item.score}</td>
        <td>${item.supportCount}</td>
        <td>${item.opposeCount}</td>
        <td>${record.actualSpecial === item.number ? "命中" : ""}</td>
      </tr>`).join("");
    const zodiacRows = record.topZodiacs9.map((item, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(item.zodiac)}</td>
        <td>${escapeHtml(item.numbers.map((number) => `${padNumber(number.number)} ${number.zodiac}`).join("、"))}</td>
        <td>${item.score}</td>
        <td>${record.actualZodiac === item.zodiac ? "命中" : ""}</td>
      </tr>`).join("");
    return `
      <section class="record">
        <h2>${escapeHtml(record.baseIssue ?? "-")}期综合推荐记录</h2>
        <p class="meta">保存时间：${escapeHtml(record.savedAt)}　生成时间：${escapeHtml(record.generatedAt)}</p>
        <p class="meta">最新开奖：${escapeHtml(record.latestNumbers.map(padNumber).join("、"))}　参与公式：${record.ruleCount} 条　证据：${record.signalCount} 条</p>
        <p class="meta">下期开奖：${escapeHtml(record.actualNextIssue ?? "待开奖")} ${record.actualSpecial ? `${padNumber(record.actualSpecial)} ${escapeHtml(record.actualZodiac ?? "")}` : ""}</p>
        <div class="chips"><b>Top8</b> ${escapeHtml(historyNumberList(record.topNumbers8))}</div>
        <div class="chips"><b>Top12</b> ${escapeHtml(historyNumberList(record.topNumbers12))}</div>
        <div class="chips"><b>生肖Top7</b> ${escapeHtml(historyZodiacList(record.topZodiacs7))}</div>
        <h3>号码 Top18 明细</h3>
        <table><thead><tr><th>排名</th><th>号码</th><th>生肖</th><th>分数</th><th>支持</th><th>反对</th><th>命中</th></tr></thead><tbody>${numberRows}</tbody></table>
        <h3>生肖 Top9 明细</h3>
        <table><thead><tr><th>排名</th><th>生肖</th><th>对应号码</th><th>分数</th><th>命中</th></tr></thead><tbody>${zodiacRows}</tbody></table>
      </section>`;
  }).join("");
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>RuleQuant 综合推荐历史记录</title>
  <style>
    body { font-family: "Microsoft YaHei", "PingFang SC", Arial, sans-serif; color: #111827; line-height: 1.55; padding: 28px; }
    h1 { font-size: 26px; margin: 0 0 8px; }
    h2 { font-size: 20px; margin: 24px 0 8px; color: #0f766e; }
    h3 { font-size: 15px; margin: 18px 0 8px; }
    .sub { color: #64748b; font-size: 12px; margin-bottom: 18px; }
    .meta { font-size: 12px; color: #334155; margin: 4px 0; }
    .chips { background: #ecfeff; border: 1px solid #a5f3fc; border-radius: 6px; padding: 8px 10px; margin: 8px 0; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px; }
    th { background: #0f172a; color: #fff; }
    th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; }
    .record { page-break-inside: avoid; margin-bottom: 28px; }
  </style>
</head>
<body>
  <h1>RuleQuant 综合推荐历史记录</h1>
  <p class="sub">本报告用于公式研究和参考排序复盘，不代表一定正确。</p>
  ${sections || "<p>暂无综合推荐历史记录。</p>"}
</body>
</html>`;
  downloadBlob(new Blob([`\ufeff${html}`], { type: "application/msword;charset=utf-8" }), "rulequant-reference-history.doc");
}

export function exportHtmlReport(result: BacktestResult, rules: RuleRecord[], config: RuleQuantConfig) {
  const rows = result.ruleResults
    .map(
      (item) =>
        `<tr><td>${item.rule.name}</td><td>${item.total}</td><td>${item.success}</td><td>${item.failed}</td><td>${item.successRate}%</td><td>${item.currentStreak}</td></tr>`,
    )
    .join("");
  const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>RuleQuant 回测报告</title><body style="font-family:Arial,sans-serif;background:#05070d;color:#eef;padding:32px"><h1>RuleQuant 回测报告</h1><p>规则数：${rules.length}，生肖配置：${config.zodiacOrder.join("、")}</p><table border="1" cellspacing="0" cellpadding="8"><thead><tr><th>规则</th><th>总期数</th><th>成功</th><th>失败</th><th>成功率</th><th>当前连对</th></tr></thead><tbody>${rows}</tbody></table><p style="opacity:.7">仅为历史规则回测输出，不作为任何资金决策依据。</p></body></html>`;
  downloadBlob(new Blob([html], { type: "text/html;charset=utf-8" }), "rulequant-report.html");
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function exportCandidatePoolHtml(report: CandidatePoolReport) {
  const focusedNumberRows = report.topNumbers8
    .map(
      (item, index) =>
        `<tr><td>${index + 1}</td><td>${String(item.number).padStart(2, "0")}</td><td>${escapeHtml(item.zodiac)}</td><td>${item.score}</td><td>${item.supportCount}</td><td>${item.opposeCount}</td><td>${escapeHtml(item.supportRules.map((rule) => rule.ruleName).join("、"))}</td><td>${escapeHtml(item.opposeRules.map((rule) => rule.ruleName).join("、"))}</td></tr>`,
    )
    .join("");
  const numberRows = report.topNumbers18
    .map(
      (item, index) =>
        `<tr><td>${index + 1}</td><td>${String(item.number).padStart(2, "0")}</td><td>${escapeHtml(item.zodiac)}</td><td>${item.score}</td><td>${item.supportCount}</td><td>${item.opposeCount}</td><td>${escapeHtml(item.supportRules.map((rule) => rule.ruleName).join("、"))}</td><td>${escapeHtml(item.opposeRules.map((rule) => rule.ruleName).join("、"))}</td></tr>`,
    )
    .join("");
  const zodiacRows = report.topZodiacs9
    .map(
      (item, index) =>
        `<tr><td>${index + 1}</td><td>${escapeHtml(item.zodiac)}</td><td>${item.score}</td><td>${escapeHtml(item.numbers.map((number) => String(number.number).padStart(2, "0")).join("、"))}</td><td>${item.supportCount}</td><td>${item.opposeCount}</td></tr>`,
    )
    .join("");
  const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>RuleQuant 规则共识候选池</title><body style="font-family:Arial,'Microsoft YaHei',sans-serif;background:#05070d;color:#eef;padding:32px"><h1>RuleQuant 规则共识候选池</h1><p>生成时间：${escapeHtml(report.generatedAt)}，最新期：${escapeHtml(report.latestIssue ?? "-")}，启用规则：${report.ruleCount}，信号：${report.signalCount}</p><h2>重点精筛号码 Top 8</h2><p>优先看这里；Top 18 只是宽参考。</p><table border="1" cellspacing="0" cellpadding="8"><thead><tr><th>排名</th><th>号码</th><th>生肖</th><th>评分</th><th>支持</th><th>反对</th><th>支持规则</th><th>反对规则</th></tr></thead><tbody>${focusedNumberRows}</tbody></table><h2>综合评分候选号码 Top 18</h2><table border="1" cellspacing="0" cellpadding="8"><thead><tr><th>排名</th><th>号码</th><th>生肖</th><th>评分</th><th>支持</th><th>反对</th><th>支持规则</th><th>反对规则</th></tr></thead><tbody>${numberRows}</tbody></table><h2>综合评分候选生肖 Top 9</h2><table border="1" cellspacing="0" cellpadding="8"><thead><tr><th>排名</th><th>生肖</th><th>评分</th><th>号码</th><th>支持</th><th>反对</th></tr></thead><tbody>${zodiacRows}</tbody></table><p style="opacity:.7">${escapeHtml(report.riskNotice)}</p></body></html>`;
  downloadBlob(new Blob([html], { type: "text/html;charset=utf-8" }), "rulequant-candidate-pool.html");
}
