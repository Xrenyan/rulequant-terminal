import { describe, expect, it } from "vitest";
import { buildYearUrl, parseDrawHtml } from "@/lib/parsers/draw-html-parser";

const html = `
  <div class="kj-tit"><span name="type"></span><span name="record"></span> 2026年06月23日 第<span class="text-blue text-strong">174</span>期</div>
  <div class="kj-box">
    <ul class="clearfix">
      <li><dl><dt class="ball-blue">15</dt><dd>龙<font>/</font><font class="wx-shui">水</font></dd></dl></li>
      <li><dl><dt class="ball-red">08</dt><dd>猪<font>/</font><font class="wx-mu">木</font></dd></dl></li>
      <li><dl><dt class="ball-green">49</dt><dd>马<font>/</font><font class="wx-tu">土</font></dd></dl></li>
      <li><dl><dt class="ball-blue">04</dt><dd>兔<font>/</font><font class="wx-jin">金</font></dd></dl></li>
      <li><dl><dt class="ball-red">22</dt><dd>鸡<font>/</font><font class="wx-shui">水</font></dd></dl></li>
      <li><dl><dt class="ball-green">31</dt><dd>鼠<font>/</font><font class="wx-huo">火</font></dd></dl></li>
      <li class="kj-jia"><dl><dt></dt><dd></dd></dl></li>
      <li><dl><dt class="ball-blue">41</dt><dd>虎<font>/</font><font class="wx-jin">金</font></dd></dl></li>
    </ul>
  </div>
  <div class="kj-tit">2026年06月22日 第<span class="text-blue text-strong">173</span>期</div>
  <div class="kj-box">
    <ul class="clearfix">
      <li><dl><dt class="ball-red">01</dt><dd>马/火</dd></dl></li>
      <li><dl><dt class="ball-blue">14</dt><dd>蛇/水</dd></dl></li>
      <li><dl><dt class="ball-green">27</dt><dd>龙/土</dd></dl></li>
      <li><dl><dt class="ball-blue">33</dt><dd>狗/金</dd></dl></li>
      <li><dl><dt class="ball-red">40</dt><dd>兔/火</dd></dl></li>
      <li><dl><dt class="ball-green">46</dt><dd>鸡/木</dd></dl></li>
      <li class="kj-jia"><dl><dt></dt><dd></dd></dl></li>
      <li><dl><dt class="ball-red">02</dt><dd>蛇/火</dd></dl></li>
    </ul>
  </div>
`;

describe("draw html parser", () => {
  it("parses the daily draw page blocks into year-scoped draw records", () => {
    const result = parseDrawHtml(html, { sourceUrl: "https://example.test/kj/3/2026.html" });

    expect(result.errors).toEqual([]);
    expect(result.records).toHaveLength(2);
    expect(result.records[0]).toMatchObject({
      issue: "2026174",
      year: 2026,
      date: "2026-06-23",
      n1: 15,
      n2: 8,
      n3: 49,
      n4: 4,
      n5: 22,
      n6: 31,
      special: 41,
      sourceUrl: "https://example.test/kj/3/2026.html",
    });
    expect(result.records[0].rawAttributes?.pageIssue).toBe("174");
    expect(result.records[0].rawAttributes?.balls).toEqual([
      { number: 15, zodiac: "龙", element: "水", color: "蓝" },
      { number: 8, zodiac: "猪", element: "木", color: "红" },
      { number: 49, zodiac: "马", element: "土", color: "绿" },
      { number: 4, zodiac: "兔", element: "金", color: "蓝" },
      { number: 22, zodiac: "鸡", element: "水", color: "红" },
      { number: 31, zodiac: "鼠", element: "火", color: "绿" },
      { number: 41, zodiac: "虎", element: "金", color: "蓝" },
    ]);
  });

  it("replaces the year segment when building yearly crawl urls", () => {
    expect(buildYearUrl("https://host/kj/3/2026.html", 2024)).toBe("https://host/kj/3/2024.html");
    expect(buildYearUrl("https://host/kj/3/", 2025)).toBe("https://host/kj/3/2025.html");
  });
});
