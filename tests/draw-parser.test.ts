import { describe, expect, it } from "vitest";
import { parseDrawFile, parseDrawText } from "@/lib/parsers/draw-parser";

const header = "issue,n1,n2,n3,n4,n5,n6,special";

describe("draw import validation", () => {
  it("keeps the first record and reports a duplicate issue", () => {
    const result = parseDrawText(`${header}\n2026001,1,2,3,4,5,6,7\n2026001,8,9,10,11,12,13,14`);

    expect(result.records).toHaveLength(1);
    expect(result.errors).toContain("重复期号：2026001");
  });

  it("rejects duplicate numbers within one draw", () => {
    const result = parseDrawText(`${header}\n2026001,1,2,3,4,5,6,6`);

    expect(result.records).toHaveLength(0);
    expect(result.errors[0]).toContain("重复号码");
  });

  it("rejects oversized files before parsing", async () => {
    const file = new File([new Uint8Array(8 * 1024 * 1024 + 1)], "too-large.xlsx");
    const result = await parseDrawFile(file);

    expect(result.records).toHaveLength(0);
    expect(result.errors[0]).toContain("超过 8MB");
  });

  it("returns a readable error instead of crashing on a broken Excel file", async () => {
    const result = await parseDrawFile(new File(["not-an-excel-workbook"], "broken.xlsx"));

    expect(result.records).toHaveLength(0);
    expect(result.errors[0]).toMatch(/文件解析失败|没有可读取的工作表|没有可识别的开奖数据/);
  });
});
