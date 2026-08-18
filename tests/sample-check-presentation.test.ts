import { describe, expect, test } from "vitest";
import { sampleDifferenceCopy } from "@/lib/sample-check/presentation";

describe("sample check presentation", () => {
  test("turns engine difference keys into plain Chinese business copy", () => {
    expect(sampleDifferenceCopy("formula_result", 115, 107)).toBe("原始计算结果：手算 115，系统计算 107");
    expect(sampleDifferenceCopy("normalized_result", 19, 11)).toBe("归一化结果：手算 19，系统计算 11");
    expect(sampleDifferenceCopy("zodiac_mapping", ["鼠"], ["猴"])).toBe("结果映射：手算 鼠，系统计算 猴");
    expect(sampleDifferenceCopy("verification_result", true, false)).toBe("下期验证：手算 通过，系统计算 未通过");
    expect(sampleDifferenceCopy("variable_value", "有数据", "缺少数据")).toBe("公式所需数据：手算 有数据，系统计算 缺少数据");
  });
});
