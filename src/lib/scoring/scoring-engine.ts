import { getNumberAttributes } from "@/lib/engine/attributes";
import type {
  CandidateEvidence,
  CandidateNumber,
  CandidateZodiac,
  NumberAttributes,
  RuleQuantConfig,
  RuleSignal,
  RuleSignalTargetType,
} from "@/types/domain";

function attrValue(attributes: NumberAttributes, targetType: RuleSignalTargetType): number | string {
  switch (targetType) {
    case "number":
      return attributes.number;
    case "zodiac":
      return attributes.zodiac;
    case "color":
      return attributes.color;
    case "parity":
      return attributes.parity;
    case "size":
      return attributes.size;
    case "tail":
      return attributes.tail;
    case "head":
      return attributes.head;
    case "sum":
      return attributes.sum;
    case "element":
      return attributes.element;
    case "segment":
      return attributes.segment;
  }
}

function targetMatches(signal: RuleSignal, attributes: NumberAttributes): boolean {
  const value = attrValue(attributes, signal.targetType);
  return signal.targets.some((target) => String(target) === String(value));
}

function evidenceFromSignal(signal: RuleSignal): CandidateEvidence {
  return {
    ruleId: signal.ruleId,
    ruleName: signal.ruleName,
    category: signal.category,
    action: signal.action,
    targetType: signal.targetType,
    targets: signal.targets,
    weight: signal.weight,
    scoreDelta: signal.scoreDelta,
    successRate: signal.successRate,
    recentRate: signal.recentRate,
    currentStreak: signal.currentStreak,
    wrongStreak: signal.wrongStreak,
    formula: signal.formula,
    process: signal.process,
    sourceType: signal.sourceType,
  };
}

function safeEvidenceFromExcludeSignal(signal: RuleSignal): CandidateEvidence {
  const scoreDelta = Number((signal.weight * 0.12).toFixed(3));
  return {
    ...evidenceFromSignal(signal),
    action: "include",
    targets: [`避开${signal.targets.join("、")}`],
    scoreDelta,
  };
}

export function buildNumberCandidates(config: RuleQuantConfig, signals: RuleSignal[]): CandidateNumber[] {
  return Array.from({ length: 49 }, (_, index) => {
    const attributes = getNumberAttributes(index + 1, config);
    const supportRules: CandidateEvidence[] = [];
    const opposeRules: CandidateEvidence[] = [];
    let score = 0;

    signals.forEach((signal) => {
      const matched = targetMatches(signal, attributes);

      if (signal.action === "include") {
        if (!matched) return;
        score += signal.scoreDelta;
        supportRules.push(evidenceFromSignal(signal));
        return;
      }

      if (matched) {
        score += signal.scoreDelta;
        opposeRules.push(evidenceFromSignal(signal));
        return;
      }

      const safeEvidence = safeEvidenceFromExcludeSignal(signal);
      score += safeEvidence.scoreDelta;
      supportRules.push(safeEvidence);
    });

    return {
      ...attributes,
      score: Number(score.toFixed(3)),
      supportCount: supportRules.length,
      opposeCount: opposeRules.length,
      supportRules,
      opposeRules,
    };
  }).sort((a, b) => b.score - a.score || b.supportCount - a.supportCount || a.opposeCount - b.opposeCount || a.number - b.number);
}

function uniqueEvidence(items: CandidateEvidence[]): CandidateEvidence[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.ruleId}-${item.action}-${item.targetType}-${item.targets.join("/")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function aggregateZodiacCandidates(config: RuleQuantConfig, numbers: CandidateNumber[]): CandidateZodiac[] {
  return config.zodiacOrder
    .map((zodiac) => {
      const zodiacNumbers = numbers.filter((number) => number.zodiac === zodiac).sort((a, b) => a.number - b.number);
      const supportRules = uniqueEvidence(zodiacNumbers.flatMap((number) => number.supportRules));
      const opposeRules = uniqueEvidence(zodiacNumbers.flatMap((number) => number.opposeRules));
      const score = zodiacNumbers.length ? zodiacNumbers.reduce((sum, number) => sum + number.score, 0) / zodiacNumbers.length : 0;
      return {
        zodiac,
        score: Number(score.toFixed(3)),
        numbers: zodiacNumbers,
        supportCount: supportRules.length,
        opposeCount: opposeRules.length,
        supportRules,
        opposeRules,
      };
    })
    .sort((a, b) => b.score - a.score || b.supportCount - a.supportCount || a.opposeCount - b.opposeCount || config.zodiacOrder.indexOf(a.zodiac) - config.zodiacOrder.indexOf(b.zodiac));
}
