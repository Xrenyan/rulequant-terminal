import type { RuleQuantConfig } from "@/types/domain";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function validateNumberPartition(table: Record<string, number[]>, keys: string[], label: string) {
  const seen = new Set<number>();
  keys.forEach((key) => {
    const values = table[key];
    assert(Array.isArray(values) && values.length > 0, `${label}“${key}”缺少号码`);
    values.forEach((number) => {
      assert(Number.isInteger(number) && number >= 1 && number <= 49, `${label}“${key}”包含无效号码：${number}`);
      assert(!seen.has(number), `${label}号码 ${number} 重复出现`);
      seen.add(number);
    });
  });
  assert(seen.size === 49, `${label}必须完整覆盖 1-49，当前覆盖 ${seen.size} 个号码`);
}

function validateIntegerArray(values: unknown, label: string, options: { min: number; max: number; maxLength?: number }) {
  assert(Array.isArray(values) && values.length > 0, `${label}不能为空`);
  assert(values.length <= (options.maxLength ?? 100), `${label}项目过多`);
  values.forEach((value) => assert(Number.isInteger(value) && value >= options.min && value <= options.max, `${label}包含无效值：${value}`));
}

export function validateRuleQuantConfig(value: unknown): RuleQuantConfig {
  assert(value && typeof value === "object" && !Array.isArray(value), "配置必须是一个JSON对象");
  const config = value as RuleQuantConfig;
  assert(Array.isArray(config.zodiacOrder) && config.zodiacOrder.length === 12, "生肖顺序必须正好包含12个生肖");
  assert(new Set(config.zodiacOrder).size === 12 && config.zodiacOrder.every((item) => typeof item === "string" && item.trim()), "生肖顺序存在重复或空值");
  assert(config.zodiacTable && typeof config.zodiacTable === "object", "缺少生肖号码表");
  validateNumberPartition(config.zodiacTable, config.zodiacOrder, "生肖表");

  assert(config.zodiacClash && typeof config.zodiacClash === "object", "缺少生肖对冲表");
  config.zodiacOrder.forEach((zodiac) => {
    const clash = config.zodiacClash[zodiac];
    assert(config.zodiacOrder.includes(clash), `生肖“${zodiac}”的对冲值无效`);
    assert(config.zodiacClash[clash] === zodiac, `生肖“${zodiac}”与“${clash}”的对冲关系不对称`);
  });

  const colorKeys = Object.keys(config.colorValues ?? {});
  assert(colorKeys.length === 3 && new Set(Object.values(config.colorValues)).size === 3, "波色值必须包含3个不重复的值");
  validateNumberPartition(config.colorTable, colorKeys, "波色表");

  const elementKeys = Object.keys(config.elementValues ?? {});
  assert(elementKeys.length === 5 && new Set(Object.values(config.elementValues)).size === 5, "五行值必须包含5个不重复的值");
  validateNumberPartition(config.elementTable, elementKeys, "五行表");

  assert(Array.isArray(config.segmentRanges) && config.segmentRanges.length > 0, "段位表不能为空");
  const segmentNumbers = new Set<number>();
  config.segmentRanges.forEach((range) => {
    assert(Number.isInteger(range.label) && Number.isInteger(range.from) && Number.isInteger(range.to) && range.from >= 1 && range.to <= 49 && range.from <= range.to, `段位 ${range.label} 的范围无效`);
    for (let number = range.from; number <= range.to; number += 1) {
      assert(!segmentNumbers.has(number), `段位号码 ${number} 重复出现`);
      segmentNumbers.add(number);
    }
  });
  assert(segmentNumbers.size === 49, `段位表必须完整覆盖 1-49，当前覆盖 ${segmentNumbers.size} 个号码`);

  validateIntegerArray(config.sevenTailOffsets, "七尾偏移", { min: -49, max: 49 });
  validateIntegerArray(config.eightZodiacPattern, "八肖取位序列", { min: 1, max: 7 });
  validateIntegerArray(config.killThreePattern, "杀三肖取位序列", { min: 1, max: 7 });
  return config;
}
