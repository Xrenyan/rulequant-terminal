const DIFFERENCE_LABELS: Record<string, string> = {
  variable_value: "公式所需数据",
  formula_result: "原始计算结果",
  normalized_result: "归一化结果",
  zodiac_mapping: "结果映射",
  verification_result: "下期验证",
};

function readableValue(value: unknown): string {
  if (typeof value === "boolean") return value ? "通过" : "未通过";
  if (Array.isArray(value)) return value.map(readableValue).join("、");
  if (value === null || value === undefined || value === "") return "未填写";
  return String(value);
}

export function sampleDifferenceCopy(type: string, expected: unknown, actual: unknown): string {
  const label = DIFFERENCE_LABELS[type] ?? "校验结果";
  return `${label}：手算 ${readableValue(expected)}，系统计算 ${readableValue(actual)}`;
}
