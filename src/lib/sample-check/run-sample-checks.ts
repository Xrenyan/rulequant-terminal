import { runBacktest } from "@/lib/backtest/run-backtest";
import type { DrawRecord, RuleQuantConfig, RuleRecord, SampleCase, SampleCheckResult } from "@/types/domain";

function sameValue(expected: unknown, actual: unknown): boolean {
  return JSON.stringify(expected) === JSON.stringify(actual);
}

type Input = {
  cases: SampleCase[];
  draws: DrawRecord[];
  rules: RuleRecord[];
  config: RuleQuantConfig;
};

export function runSampleChecks(input: Input): SampleCheckResult[] {
  const backtest = runBacktest({ draws: input.draws, rules: input.rules, config: input.config });

  return input.cases.map((sampleCase) => {
    const ruleResult = backtest.ruleResults.find((item) => item.rule.id === sampleCase.ruleId);
    const detail = ruleResult?.details.find((item) => item.currentIssue === sampleCase.issue);
    const differences: SampleCheckResult["differences"] = [];

    if (!detail) {
      return {
        caseId: sampleCase.id,
        ruleId: sampleCase.ruleId,
        issue: sampleCase.issue,
        passed: false,
        differences: [{ type: "variable_value", expected: "存在可计算样例", actual: "未找到对应期号或规则" }],
      };
    }

    if (sampleCase.expectedRawResult !== undefined && !sameValue(sampleCase.expectedRawResult, detail.rawResult)) {
      differences.push({ type: "formula_result", expected: sampleCase.expectedRawResult, actual: detail.rawResult });
    }
    if (sampleCase.expectedFinalResult !== undefined && !sameValue(sampleCase.expectedFinalResult, detail.finalResult)) {
      differences.push({ type: "normalized_result", expected: sampleCase.expectedFinalResult, actual: detail.finalResult });
    }
    if (sampleCase.expectedMappedResult !== undefined && !sameValue(sampleCase.expectedMappedResult, detail.mappedResult)) {
      differences.push({ type: "zodiac_mapping", expected: sampleCase.expectedMappedResult, actual: detail.mappedResult });
    }
    if (sampleCase.expectedSuccess !== undefined && !sameValue(sampleCase.expectedSuccess, detail.success)) {
      differences.push({ type: "verification_result", expected: sampleCase.expectedSuccess, actual: detail.success });
    }

    return {
      caseId: sampleCase.id,
      ruleId: sampleCase.ruleId,
      issue: sampleCase.issue,
      passed: differences.length === 0,
      differences,
      detail,
    };
  });
}
