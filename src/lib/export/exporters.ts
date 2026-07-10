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
