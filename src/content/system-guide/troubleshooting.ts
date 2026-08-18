import type { GuideTopic } from "./types";

export const troubleshootingTopics: GuideTopic[] = [{
  slug: "troubleshooting",
  title: "常见问题排查",
  summary: "按现象找到原因和安全处理方法。",
  group: "troubleshooting",
  keywords: ["错误", "打不开", "空白", "过期", "离线", "导入失败", "恢复"],
  aliases: ["打不开", "没反应", "没有数据", "报错"],
  sections: [
    { kind: "troubleshooting", anchor: "stale", title: "数据过期或最新期不对", paragraphs: ["先到开奖数据确认来源、更新时间和最新期；重新同步后再计算。离线时系统可以显示最后可用数据，但必须留意时间。"] },
    { kind: "troubleshooting", anchor: "duplicates", title: "重复或冲突期次", paragraphs: ["完全相同的重复可去重；同一期号码不同是冲突，必须对照可靠来源人工决定，不能自动猜。"] },
    { kind: "troubleshooting", anchor: "invalid", title: "号码或导入异常", paragraphs: ["每期7个号码必须是1-49整数且互不重复；表格请按期号、平码1到平码6、特码的顺序填写。"] },
    { kind: "troubleshooting", anchor: "formula", title: "公式计算异常", paragraphs: ["打开逐期明细核对变量、L/D序、特码、归一化和属性表；不确定就停用并标记，不要猜。"] },
    { kind: "troubleshooting", anchor: "calculation", title: "计算一直整理中", paragraphs: ["系统会自动切换可用的计算方式。若仍无结果，请刷新页面，并暂时减少期数或高级筛选条件后重试。"] },
    { kind: "troubleshooting", anchor: "storage", title: "本机视图或数据消失", paragraphs: ["浏览器清理站点数据会删除本机保存视图和未同步数据。重置或清理前先导出规则库、配置和开奖记录。"] },
  ],
  related: ["getting-started", "draws", "data-health", "reports"],
}];
