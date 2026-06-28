import {
  calculateRule,
  calculateRuleDetail,
  checkRuleSuccess,
  clearFormulaEngineCache,
  getFormulaEngineCacheSize,
  type CalculateRuleContext,
} from "@/lib/formula-engine/formula-engine";

export type RuleCalculation = ReturnType<typeof calculateRule>;
export type { CalculateRuleContext };

export const runRuleCalculation = calculateRule;
export const runRuleCalculationDetail = calculateRuleDetail;
export const evaluateRuleSuccess = checkRuleSuccess;
export { clearFormulaEngineCache, getFormulaEngineCacheSize };
