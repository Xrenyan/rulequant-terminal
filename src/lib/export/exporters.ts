import * as XLSX from "xlsx";
import type { BacktestResult, CandidatePoolReport, DrawRecord, RuleQuantConfig, RuleRecord, SampleCheckResult } from "@/types/domain";

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

export function exportDrawsCsv(draws: DrawRecord[]) {
  const worksheet = XLSX.utils.json_to_sheet(draws);
  const csv = XLSX.utils.sheet_to_csv(worksheet);
  downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), "rulequant-draws.csv");
}

export function exportWorkbook(sheets: Record<string, unknown[]>, filename: string) {
  const workbook = XLSX.utils.book_new();
  Object.entries(sheets).forEach(([name, rows]) => {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), name.slice(0, 31));
  });
  const array = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
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
