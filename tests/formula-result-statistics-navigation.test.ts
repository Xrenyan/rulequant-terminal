import { describe, expect, it } from "vitest";
import FormulaResultStatisticsPage from "@/app/formula-result-statistics/page";

describe("formula result statistics route", () => {
  it("binds the page to the formula-result-statistics terminal view", () => {
    const element = FormulaResultStatisticsPage();
    expect(element.props.activeView).toBe("formula-result-statistics");
  });
});
