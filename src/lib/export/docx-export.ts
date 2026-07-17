import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";
import type { ReferenceHistoryItem, RuleRecord } from "@/types/domain";

export type ReferenceHistoryDocxItem = ReferenceHistoryItem & {
  actualNextIssue?: string;
  actualSpecial?: number;
  actualZodiac?: string;
  hitTop8?: boolean;
  hitTop12?: boolean;
  hitTop18?: boolean;
  hitZodiac7?: boolean;
  hitZodiac9?: boolean;
};

const colors = {
  ink: "172033",
  muted: "66758A",
  blue: "2F67C7",
  blueDark: "17345D",
  blueSoft: "EDF3FC",
  teal: "19766F",
  tealSoft: "EAF8F6",
  line: "CFD9E7",
  white: "FFFFFF",
};

const ruleSourceLabels: Record<string, string> = {
  user_provided: "用户提供公式",
  manual: "人工新增公式",
  system_recommended: "系统推荐公式",
  txt_import: "TXT 导入公式",
  copied: "复制公式",
  example: "示例公式",
};

const ruleCategoryLabels: Record<string, string> = {
  kill_zodiac: "杀一肖",
  include_zodiac: "选生肖",
  kill_color: "杀一波",
  include_color: "参考波色",
  kill_parity: "杀单双",
  include_parity: "参考单双",
  kill_size: "杀大小",
  include_size: "参考大小",
  kill_sum: "杀一合",
  kill_tail: "杀一尾",
  kill_head: "杀一头",
  kill_half_head: "杀半头",
  kill_door: "杀一门",
  kill_element: "杀一行",
  kill_segment: "杀一段",
  seven_tail: "七尾",
  six_zodiac: "取六肖",
  eight_zodiac: "八肖",
  eight_zodiac_two_period: "八肖管两期",
  nine_zodiac: "九肖",
  kill_three_as_nine: "杀三肖 / 九肖",
  custom_set: "自定义集合",
};

function run(text: string, options: { size?: number; bold?: boolean; color?: string; font?: string } = {}) {
  return new TextRun({
    text,
    size: options.size ?? 22,
    bold: options.bold,
    color: options.color ?? colors.ink,
    font: options.font
      ? { ascii: options.font, hAnsi: options.font, eastAsia: "Microsoft YaHei" }
      : { ascii: "Aptos", hAnsi: "Aptos", eastAsia: "Microsoft YaHei" },
  });
}

function bodyParagraph(text: string, options: { bold?: boolean; color?: string; spacingAfter?: number; keepNext?: boolean } = {}) {
  return new Paragraph({
    children: [run(text, { bold: options.bold, color: options.color })],
    spacing: { after: options.spacingAfter ?? 100, line: 340 },
    keepNext: options.keepNext,
  });
}

function labelValueRow(label: string, value: string, shade = false) {
  return new TableRow({
    cantSplit: true,
    children: [
      new TableCell({
        width: { size: 22, type: WidthType.PERCENTAGE },
        shading: { fill: shade ? colors.blueSoft : "F6F8FB", type: ShadingType.CLEAR },
        verticalAlign: VerticalAlign.CENTER,
        margins: { top: 110, bottom: 110, left: 140, right: 140 },
        children: [new Paragraph({ children: [run(label, { bold: true, color: colors.muted })] })],
      }),
      new TableCell({
        width: { size: 78, type: WidthType.PERCENTAGE },
        verticalAlign: VerticalAlign.CENTER,
        margins: { top: 110, bottom: 110, left: 140, right: 140 },
        children: [new Paragraph({ children: [run(value)] })],
      }),
    ],
  });
}

function infoTable(rows: Array<[string, string]>) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: colors.line },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: colors.line },
      left: { style: BorderStyle.SINGLE, size: 4, color: colors.line },
      right: { style: BorderStyle.SINGLE, size: 4, color: colors.line },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: colors.line },
      insideVertical: { style: BorderStyle.SINGLE, size: 2, color: colors.line },
    },
    rows: rows.map(([label, value], index) => labelValueRow(label, value, index % 2 === 0)),
  });
}

function summaryCell(value: string, label: string) {
  return new TableCell({
    width: { size: 33, type: WidthType.PERCENTAGE },
    shading: { fill: colors.blueSoft, type: ShadingType.CLEAR },
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 150, bottom: 150, left: 90, right: 90 },
    children: [
      new Paragraph({ alignment: AlignmentType.CENTER, children: [run(value, { size: 30, bold: true, color: colors.blueDark })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 40 }, children: [run(label, { size: 18, color: colors.muted })] }),
    ],
  });
}

function summaryTable(items: Array<[string, string]>) {
  const rows: TableRow[] = [];
  for (let index = 0; index < items.length; index += 3) {
    const rowItems = items.slice(index, index + 3);
    while (rowItems.length < 3) rowItems.push(["-", ""]);
    rows.push(new TableRow({ cantSplit: true, children: rowItems.map(([value, label]) => summaryCell(value, label)) }));
  }
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows,
    borders: {
      top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
      left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 8, color: colors.white },
      insideVertical: { style: BorderStyle.SINGLE, size: 8, color: colors.white },
    },
  });
}

function documentFooter() {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          run("RuleQuant · 公式研究与历史复盘 · 第 ", { size: 17, color: colors.muted }),
          new TextRun({ children: [PageNumber.CURRENT], size: 17, color: colors.muted, font: "Aptos" }),
          run(" 页", { size: 17, color: colors.muted }),
        ],
      }),
    ],
  });
}

function documentStyles() {
  return {
    default: {
      document: { run: { size: 22, color: colors.ink, font: "Microsoft YaHei" }, paragraph: { spacing: { line: 340 } } },
      heading1: { run: { size: 34, bold: true, color: colors.blueDark, font: "Microsoft YaHei" }, paragraph: { spacing: { before: 260, after: 140 }, keepNext: true } },
      heading2: { run: { size: 28, bold: true, color: colors.blueDark, font: "Microsoft YaHei" }, paragraph: { spacing: { before: 220, after: 100 }, keepNext: true } },
      heading3: { run: { size: 23, bold: true, color: colors.teal, font: "Microsoft YaHei" }, paragraph: { spacing: { before: 150, after: 70 }, keepNext: true } },
    },
  };
}

export async function buildRuleLibraryDocxBlob(rules: RuleRecord[]) {
  const generatedAt = new Date().toLocaleString("zh-CN", { hour12: false });
  const enabledCount = rules.filter((rule) => rule.enabled).length;
  const referenceCount = rules.filter((rule) => rule.enabled && rule.participatesInReference !== false).length;
  const manualCount = rules.filter((rule) => rule.sourceType === "manual").length;
  const txtCount = rules.filter((rule) => rule.sourceType === "txt_import").length;
  const recommendedCount = rules.filter((rule) => rule.sourceType === "system_recommended").length;

  const overviewHeader = new TableRow({
    tableHeader: true,
    children: ["序号", "公式名称", "类型 / 序列", "来源 / 状态"].map((text, index) => new TableCell({
      width: { size: index === 1 ? 40 : 20, type: WidthType.PERCENTAGE },
      shading: { fill: colors.blueDark, type: ShadingType.CLEAR },
      verticalAlign: VerticalAlign.CENTER,
      margins: { top: 100, bottom: 100, left: 100, right: 100 },
      children: [new Paragraph({ alignment: index === 0 ? AlignmentType.CENTER : AlignmentType.LEFT, children: [run(text, { size: 19, bold: true, color: colors.white })] })],
    })),
  });
  const overviewRows = rules.map((rule, index) => new TableRow({
    cantSplit: true,
    children: [
      String(index + 1),
      rule.name,
      `${ruleCategoryLabels[rule.category] ?? rule.category} · ${rule.orderMode}序`,
      `${ruleSourceLabels[rule.sourceType ?? "user_provided"] ?? rule.sourceType ?? "用户提供公式"} · ${rule.enabled ? "启用" : "停用"}`,
    ].map((text, cellIndex) => new TableCell({
      width: { size: cellIndex === 1 ? 40 : 20, type: WidthType.PERCENTAGE },
      shading: index % 2 ? { fill: "F7F9FC", type: ShadingType.CLEAR } : undefined,
      verticalAlign: VerticalAlign.CENTER,
      margins: { top: 90, bottom: 90, left: 100, right: 100 },
      children: [new Paragraph({ alignment: cellIndex === 0 ? AlignmentType.CENTER : AlignmentType.LEFT, children: [run(text, { size: 18 })] })],
    })),
  }));

  const details = rules.flatMap((rule, index) => {
    const sourceLabel = ruleSourceLabels[rule.sourceType ?? "user_provided"] ?? rule.sourceType ?? "用户提供公式";
    const pattern = rule.positionPattern?.length ? rule.positionPattern.join(" → ") : "无固定取位循环";
    const examples = rule.examples?.length ? rule.examples : ["暂无手算样例"];
    return [
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        pageBreakBefore: index > 0 && index % 4 === 0,
        children: [run(`${String(index + 1).padStart(2, "0")}  ${rule.name}`, { size: 28, bold: true, color: colors.blueDark })],
      }),
      bodyParagraph(`${ruleCategoryLabels[rule.category] ?? rule.category} · ${rule.orderMode}序 · ${sourceLabel}`, { color: colors.muted, keepNext: true }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [new TableRow({ cantSplit: true, children: [new TableCell({
          shading: { fill: colors.blueSoft, type: ShadingType.CLEAR },
          margins: { top: 160, bottom: 160, left: 180, right: 180 },
          borders: { top: { style: BorderStyle.SINGLE, size: 6, color: "AFC4E7" }, bottom: { style: BorderStyle.SINGLE, size: 6, color: "AFC4E7" }, left: { style: BorderStyle.SINGLE, size: 6, color: "AFC4E7" }, right: { style: BorderStyle.SINGLE, size: 6, color: "AFC4E7" } },
          children: [new Paragraph({ children: [run("公式  ", { bold: true, color: colors.muted }), run(rule.formula, { size: 23, bold: true, color: "0C5E78", font: "Consolas" })] })],
        })] })],
      }),
      new Paragraph({ heading: HeadingLevel.HEADING_3, children: [run("规则状态与配置", { size: 23, bold: true, color: colors.teal })] }),
      infoTable([
        ["运行状态", `${rule.enabled ? "已启用" : "已停用"}；${rule.canCompute === false ? "计算异常" : "可计算"}；${rule.participatesInReference !== false ? "参与综合参考" : "不参与综合参考"}`],
        ["输出配置", `归一化：${rule.normalizer || "auto"}；目标：${rule.target}`],
        ["取位循环", pattern],
        ["锚点与管期", `锚点期号：${rule.anchorIssue ?? "无"}；锚点位置：${rule.anchorPatternIndex ?? "无"}；管 ${rule.periodSpan || 1} 期；验证偏移 ${rule.verifyOffset || 1} 期`],
        ["来源记录", rule.sourceFile || rule.origin || "未记录"],
      ]),
      new Paragraph({ heading: HeadingLevel.HEADING_3, children: [run("规则说明", { size: 23, bold: true, color: colors.teal })] }),
      bodyParagraph(rule.description || "暂无说明"),
      new Paragraph({ heading: HeadingLevel.HEADING_3, children: [run("手算样例", { size: 23, bold: true, color: colors.teal })] }),
      ...examples.map((example) => new Paragraph({ bullet: { level: 0 }, children: [run(example)], spacing: { after: 70, line: 330 } })),
    ];
  });

  const document = new Document({
    creator: "RuleQuant",
    title: "RuleQuant 全部公式",
    description: "RuleQuant 统一公式库完整备查文档",
    styles: documentStyles(),
    sections: [{
      properties: {
        page: {
          margin: { top: 900, right: 850, bottom: 900, left: 850 },
        },
      },
      footers: { default: documentFooter() },
      children: [
        new Paragraph({ alignment: AlignmentType.LEFT, spacing: { after: 80 }, children: [run("RULEQUANT / 公式档案", { size: 18, bold: true, color: colors.blue })] }),
        new Paragraph({ spacing: { after: 120 }, children: [run("RuleQuant 全部公式", { size: 44, bold: true, color: colors.blueDark })] }),
        bodyParagraph(`统一公式库完整备查文档 · 导出时间：${generatedAt}`, { color: colors.muted, spacingAfter: 220 }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [new TableRow({ children: [new TableCell({
            shading: { fill: colors.tealSoft, type: ShadingType.CLEAR },
            margins: { top: 140, bottom: 140, left: 160, right: 160 },
            borders: { left: { style: BorderStyle.SINGLE, size: 16, color: colors.teal }, top: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE } },
            children: [bodyParagraph("本文件包含当前设备保存的全部公式，包括内置、人工新增、TXT 导入、系统推荐后加入和复制公式。仅用于历史公式研究与规则核对。", { color: "315B5A", spacingAfter: 0 })],
          })] })],
        }),
        new Paragraph({ spacing: { after: 140 } }),
        summaryTable([
          [String(rules.length), "全部公式"], [String(enabledCount), "已启用"], [String(referenceCount), "参与参考"],
          [String(manualCount), "人工新增"], [String(txtCount), "TXT 导入"], [String(recommendedCount), "系统推荐"],
        ]),
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [run("公式总览", { size: 34, bold: true, color: colors.blueDark })] }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [overviewHeader, ...overviewRows],
          borders: {
            top: { style: BorderStyle.SINGLE, size: 3, color: colors.line }, bottom: { style: BorderStyle.SINGLE, size: 3, color: colors.line },
            left: { style: BorderStyle.SINGLE, size: 3, color: colors.line }, right: { style: BorderStyle.SINGLE, size: 3, color: colors.line },
            insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: colors.line }, insideVertical: { style: BorderStyle.SINGLE, size: 2, color: colors.line },
          },
        }),
        new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, children: [run("逐条公式详情", { size: 34, bold: true, color: colors.blueDark })] }),
        ...details,
      ],
    }],
  });

  return Packer.toBlob(document);
}

function padNumber(value: number) {
  return String(value).padStart(2, "0");
}

function numberList(items: ReferenceHistoryItem["topNumbers18"]) {
  return items.map((item, index) => `${index + 1}. ${padNumber(item.number)} ${item.zodiac}`).join("　");
}

function zodiacList(items: ReferenceHistoryItem["topZodiacs9"]) {
  return items.map((item, index) => `${index + 1}. ${item.zodiac}`).join("　");
}

export async function buildReferenceHistoryDocxBlob(records: ReferenceHistoryDocxItem[]) {
  const children = records.flatMap((record, index) => {
    const numberRows = record.topNumbers18.map((item, rank) => new TableRow({
      cantSplit: true,
      children: [String(rank + 1), padNumber(item.number), item.zodiac, String(item.score), String(item.supportCount), String(item.opposeCount), record.actualSpecial === item.number ? "命中" : ""].map((text, cellIndex) => new TableCell({
        shading: rank % 2 ? { fill: "F7F9FC", type: ShadingType.CLEAR } : undefined,
        margins: { top: 80, bottom: 80, left: 80, right: 80 },
        children: [new Paragraph({ alignment: cellIndex === 2 ? AlignmentType.LEFT : AlignmentType.CENTER, children: [run(text, { size: 18, bold: text === "命中", color: text === "命中" ? colors.teal : colors.ink })] })],
      })),
    }));
    const numberHeader = new TableRow({
      tableHeader: true,
      children: ["排名", "号码", "生肖", "分数", "支持", "反对", "命中"].map((text) => new TableCell({
        shading: { fill: colors.blueDark, type: ShadingType.CLEAR },
        margins: { top: 80, bottom: 80, left: 70, right: 70 },
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [run(text, { size: 18, bold: true, color: colors.white })] })],
      })),
    });
    return [
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        pageBreakBefore: index > 0,
        children: [run(`${record.baseIssue ?? "-"} 期综合推荐记录`, { size: 34, bold: true, color: colors.blueDark })],
      }),
      bodyParagraph(`保存时间：${record.savedAt}　生成时间：${record.generatedAt}`, { color: colors.muted }),
      infoTable([
        ["本期开奖", record.latestNumbers.map(padNumber).join("、") || "-"],
        ["计算规模", `参与公式 ${record.ruleCount} 条；生成证据 ${record.signalCount} 条`],
        ["下期开奖", `${record.actualNextIssue ?? "待开奖"}${record.actualSpecial ? `　${padNumber(record.actualSpecial)} ${record.actualZodiac ?? ""}` : ""}`],
        ["数据来源", record.dataSourceLabel ?? "未记录"],
      ]),
      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [run("重点结果", { size: 28, bold: true, color: colors.blueDark })] }),
      bodyParagraph(`号码 Top8：${numberList(record.topNumbers8) || "-"}`),
      bodyParagraph(`号码 Top12：${numberList(record.topNumbers12) || "-"}`),
      bodyParagraph(`生肖 Top7：${zodiacList(record.topZodiacs7) || "-"}`),
      bodyParagraph(`生肖 Top9：${zodiacList(record.topZodiacs9) || "-"}`),
      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [run("号码 Top18 明细", { size: 28, bold: true, color: colors.blueDark })] }),
      new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [numberHeader, ...numberRows] }),
    ];
  });

  const document = new Document({
    creator: "RuleQuant",
    title: "RuleQuant 综合推荐历史记录",
    description: "综合推荐完整复盘档案",
    styles: documentStyles(),
    sections: [{
      properties: { page: { margin: { top: 900, right: 780, bottom: 900, left: 780 } } },
      footers: { default: documentFooter() },
      children: [
        new Paragraph({ children: [run("RuleQuant 综合推荐历史记录", { size: 42, bold: true, color: colors.blueDark })], spacing: { after: 100 } }),
        bodyParagraph("完整保存每次生成的号码、生肖、公式数量、证据数量和后续命中结果。仅用于公式研究和参考排序复盘。", { color: colors.muted, spacingAfter: 200 }),
        summaryTable([[String(records.length), "历史记录"], [String(records.filter((item) => item.actualSpecial).length), "已开奖核对"], [String(records.filter((item) => item.hitTop18).length), "Top18 命中"]]),
        ...children,
      ],
    }],
  });
  return Packer.toBlob(document);
}
