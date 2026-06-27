export type OrderMode = "L" | "D" | "custom";

export type RuleCategory =
  | "kill_zodiac"
  | "include_zodiac"
  | "kill_color"
  | "include_color"
  | "kill_parity"
  | "include_parity"
  | "kill_size"
  | "include_size"
  | "kill_sum"
  | "kill_tail"
  | "kill_head"
  | "kill_element"
  | "kill_segment"
  | "seven_tail"
  | "eight_zodiac"
  | "eight_zodiac_two_period"
  | "nine_zodiac"
  | "kill_three_as_nine"
  | "custom_set";

export type RuleSourceType = "user_provided" | "system_recommended" | "manual" | "txt_import" | "copied" | "example";

export type RuleParseStatus = "parsed" | "partial" | "failed";

export type RuleVerifyStatus = "unchecked" | "matched" | "mismatch" | "no_sample";

export type OperationLog = {
  id: string;
  timestamp: string;
  type:
    | "sync_draws"
    | "one_click_calculate"
    | "generate_reference"
    | "rule_created"
    | "rule_updated"
    | "rule_deleted"
    | "rule_enabled"
    | "rule_disabled"
    | "rule_reference_changed"
    | "rules_imported"
    | "rules_reset"
    | "rules_restored"
    | "calculation_error";
  message: string;
  issue?: string;
  dataCount?: number;
  ruleId?: string;
  ruleName?: string;
  formulaCount?: number;
  signalCount?: number;
  details?: Record<string, unknown>;
};

export type RuleLibraryBackup = {
  id: string;
  createdAt: string;
  reason: string;
  rules: RuleRecord[];
};

export type DrawRecord = {
  issue: string;
  date?: string;
  year?: number;
  sourceUrl?: string;
  rawAttributes?: Record<string, unknown>;
  n1: number;
  n2: number;
  n3: number;
  n4: number;
  n5: number;
  n6: number;
  special: number;
};

export type NumberAttributes = {
  number: number;
  head: number;
  tail: number;
  sum: number;
  sumTail: number;
  segment: number;
  zodiac: string;
  color: string;
  colorValue: number;
  element: string;
  elementValue: number;
  parity: "单" | "双";
  size: "大" | "小";
  headParity: string;
  headParityType: "头单" | "头双";
};

export type NormalizedDraw = DrawRecord & {
  lOrder: number[];
  dOrder: number[];
  attributes: NumberAttributes[];
  specialAttributes: NumberAttributes;
  total: number;
  totalTail: number;
  totalSum: number;
  issueTail: number;
  issueSum: number;
  issueSumTail: number;
};

export type RuleRecord = {
  id: string;
  name: string;
  category: RuleCategory;
  orderMode: OrderMode;
  formula: string;
  normalizer: string;
  target: string;
  verifyMode: "next_special";
  positionPattern: number[];
  anchorIssue?: string;
  anchorPatternIndex?: number;
  positionMeaning?: string;
  periodSpan: number;
  verifyOffset?: number;
  enabled: boolean;
  manuallyConfirmed?: boolean;
  participatesInReference?: boolean;
  sourceType?: RuleSourceType;
  origin?: string;
  canCompute?: boolean;
  parseStatus?: RuleParseStatus;
  verifyStatus?: RuleVerifyStatus;
  librarySignature?: string;
  fromCandidateId?: string;
  fromTextId?: string;
  tags: string[];
  description: string;
  sourceFile: string;
  examples: string[];
  createdAt: string;
  updatedAt: string;
};

export type RuleQuantConfig = {
  zodiacTable: Record<string, number[]>;
  zodiacOrder: string[];
  zodiacClash: Record<string, string>;
  colorTable: Record<string, number[]>;
  colorValues: Record<string, number>;
  elementTable: Record<string, number[]>;
  elementValues: Record<string, number>;
  segmentRanges: Array<{ label: number; from: number; to: number }>;
  sevenTailOffsets: number[];
  eightZodiacPattern: number[];
  killThreePattern: number[];
};

export type FormulaEvaluation = {
  value: number;
  expression: string;
  variables: Record<string, number>;
  trace: string[];
};

export type RuleCalculation = {
  rawResult: number;
  normalizerSteps: number[];
  finalResult: number | number[] | string[];
  mappedResult: Array<number | string>;
  secondaryMappedResult?: Array<number | string>;
  process: string[];
};

export type FutureCheck = {
  issue: string;
  special: number;
  specialAttributes: NumberAttributes;
  success: boolean;
};

export type BacktestDetail = {
  ruleId: string;
  ruleName: string;
  currentIssue: string;
  currentNumbers: number[];
  lOrder: number[];
  dOrder: number[];
  formula: string;
  variables: Record<string, number>;
  expression: string;
  process: string[];
  rawResult: number;
  normalizerSteps: number[];
  finalResult: number | number[] | string[];
  mappedResult: Array<number | string>;
  secondaryMappedResult?: Array<number | string>;
  targetLabel: string;
  nextIssue?: string;
  nextNumbers?: number[];
  nextSpecialAttributes?: NumberAttributes;
  futureChecks: FutureCheck[];
  success: boolean;
};

export type RuleBacktestResult = {
  rule: RuleRecord;
  total: number;
  success: number;
  failed: number;
  successRate: number;
  currentStreak: number;
  maxStreak: number;
  last10: boolean[];
  failedIssues: string[];
  details: BacktestDetail[];
  error?: string;
};

export type BacktestResult = {
  generatedAt: string;
  ruleResults: RuleBacktestResult[];
};

export type SampleCase = {
  id: string;
  ruleId: string;
  issue: string;
  expectedRawResult?: number;
  expectedFinalResult?: number | number[] | string[];
  expectedMappedResult?: Array<number | string>;
  expectedSuccess?: boolean;
  sourceFile: string;
  note?: string;
};

export type SampleDifferenceType =
  | "variable_value"
  | "formula_result"
  | "normalized_result"
  | "zodiac_mapping"
  | "color_mapping"
  | "element_mapping"
  | "verification_result";

export type SampleCheckResult = {
  caseId: string;
  ruleId: string;
  issue: string;
  passed: boolean;
  differences: Array<{
    type: SampleDifferenceType;
    expected: unknown;
    actual: unknown;
  }>;
  detail?: BacktestDetail;
};

export type RuleSignalAction = "include" | "exclude";

export type RuleSignalTargetType = "number" | "zodiac" | "color" | "parity" | "size" | "tail" | "head" | "sum" | "element" | "segment";

export type RuleSignal = {
  ruleId: string;
  ruleName: string;
  category: RuleCategory;
  action: RuleSignalAction;
  targetType: RuleSignalTargetType;
  targets: Array<number | string>;
  weight: number;
  scoreDelta: number;
  successRate: number;
  recentRate: number;
  currentStreak: number;
  wrongStreak?: number;
  formula: string;
  process: string[];
  sourceType?: RuleSourceType;
};

export type CandidateEvidence = {
  ruleId: string;
  ruleName: string;
  category: RuleCategory;
  action: RuleSignalAction;
  targetType: RuleSignalTargetType;
  targets: Array<number | string>;
  weight: number;
  scoreDelta: number;
  successRate: number;
  recentRate: number;
  currentStreak: number;
  wrongStreak?: number;
  formula: string;
  process: string[];
  sourceType?: RuleSourceType;
};

export type CandidateNumber = NumberAttributes & {
  score: number;
  supportCount: number;
  opposeCount: number;
  supportRules: CandidateEvidence[];
  opposeRules: CandidateEvidence[];
};

export type CandidateZodiac = {
  zodiac: string;
  score: number;
  numbers: CandidateNumber[];
  supportCount: number;
  opposeCount: number;
  supportRules: CandidateEvidence[];
  opposeRules: CandidateEvidence[];
};

export type CandidatePoolReport = {
  generatedAt: string;
  latestIssue?: string;
  latestDate?: string;
  latestNumbers: number[];
  ruleCount: number;
  signalCount: number;
  signals: RuleSignal[];
  allNumbers: CandidateNumber[];
  allZodiacs: CandidateZodiac[];
  topNumbers8: CandidateNumber[];
  topNumbers12: CandidateNumber[];
  topNumbers16: CandidateNumber[];
  topNumbers18: CandidateNumber[];
  topZodiacs7: CandidateZodiac[];
  topZodiacs8: CandidateZodiac[];
  topZodiacs9: CandidateZodiac[];
  riskNotice: string;
};

export type ReferenceObservationItem = {
  issue: string;
  previousIssue?: string;
  special: number;
  zodiac: string;
  top8Numbers: number[];
  top12Numbers: number[];
  top18Numbers: number[];
  top7Zodiacs: string[];
  top9Zodiacs: string[];
  hitTop8: boolean;
  hitTop12: boolean;
  hitTop18: boolean;
  hitZodiac7: boolean;
  hitZodiac9: boolean;
  ruleCount: number;
  signalCount: number;
};

export type ReferenceObservationReport = {
  window: number;
  total: number;
  top8Hits: number;
  top12Hits: number;
  top18Hits: number;
  zodiac7Hits: number;
  zodiac9Hits: number;
  top8Rate: number;
  top12Rate: number;
  top18Rate: number;
  zodiac7Rate: number;
  zodiac9Rate: number;
  items: ReferenceObservationItem[];
};
