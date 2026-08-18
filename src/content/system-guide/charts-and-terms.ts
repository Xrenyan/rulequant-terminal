import type { GuideSection, GuideTopic } from "./types";

function chart(slug: string, title: string, summary: string, aliases: string[], axis: string, example: string, related: string[]): GuideTopic {
  const sections: GuideSection[] = [
    { kind: "purpose", anchor: "question", title: "这张图回答什么问题", paragraphs: [summary] },
    { kind: "orientation", anchor: "axes", title: "横轴、纵轴和颜色", paragraphs: [`${axis}。颜色只用于区分强弱或当前选择，精确值以文字和表格为准。`] },
    { kind: "steps", anchor: "first-look", title: "先看哪里", paragraphs: ["先看样本范围和单位，再看实际开奖标记，最后点到证据。"] },
    { kind: "example", anchor: "example", title: "完整示例", paragraphs: [`示例：${example}`] },
    { kind: "misunderstanding", anchor: "caveat", title: "不能这样理解", paragraphs: ["历史次数、位置或颜色深浅不代表下一期一定出现，也不代表官方概率。"] },
  ];
  return { slug, title, summary, group: "chart", keywords: [title, "图表", "怎么看"], aliases, sections, related };
}

export const chartAndTermTopics: GuideTopic[] = [
  chart("ranking-chart", "结果排行怎么看", "比较当前范围内各结果被公式排除或支持的次数。", ["排行", "柱状图"], "行是结果，条形长度和右侧数字是次数；先看动作和结果类型", "生肖龙显示8次，只表示8条公式产生了龙，不表示龙一定开或不开", ["formula-result-statistics", "evidence-matrix"]),
  chart("landing-trend", "实际落点趋势怎么看", "回答最近各期实际开奖落在“被几条公式排除/支持、排第几位”。", ["杀几次", "开在第几位", "落点"], "横轴是开奖期；上图纵轴是次数，下图纵轴是位置且第1位在最上方", "某期实际开马，被排除6次、并列第2位；点击该期可追到6条公式", ["formula-result-statistics", "evidence-matrix"]),
  chart("distribution-chart", "次数与位置分布怎么看", "汇总最近范围内有多少期落在0次、1次或各个名次。", ["分布", "0次"], "行是次数或位置，条形长度和右侧数字是对应期数", "0次有2期，说明这2期实际结果没有被任何当前筛选公式指向", ["landing-trend", "historical-caveat"]),
  chart("evidence-matrix", "完整结果矩阵怎么看", "同时核对期次、全部结果、次数和实际开奖位置。", ["矩阵", "热力图", "靶心"], "行是计算期，列是完整结果；颜色和格内数字表示次数，靶心表示实际开奖", "龙列某格为3且有靶心，表示该期开奖为龙并由3条公式贡献", ["landing-trend", "formula-detail"]),
  chart("health-table", "公式健康表怎么看", "比较每条公式10/30/50期表现、连续未通过和样本量。", ["健康度", "连续错"], "行是公式，列是窗口、分子/分母和连续状态；颜色表示需要检查的类型", "最近10期7/10、最近30期18/30，应同时读样本而不是只读70%", ["formula-health", "backtest"]),
  chart("pair-diagnostics", "重复与冲突怎么看", "识别经常输出相同集合的公式，以及排除和支持方向相抵的公式。", ["公式冲突", "重复公式"], "行是公式对，列出相似度、共同样本、重合期和证据期次", "共同10期相似度86%，达到80%重复阈值，可点证据期核验", ["formula-health", "formula-detail"]),
  { slug: "draw-structure", title: "六合彩6+1开奖结构", summary: "每期6个平码加1个独立特码。", group: "term", keywords: ["6+1", "平码", "特码", "49"], aliases: ["七个号码"], sections: [{ kind: "purpose", anchor: "meaning", title: "基本结构", paragraphs: ["每期必须保存平1到平6和特码，共7个互不重复的1-49整数。D序只给6个平码排序，特码始终保持原始第7个位置。"] }, { kind: "technical", anchor: "technical", title: "为什么重要", paragraphs: ["公式取平码、特尾、特肖时依赖这个结构；列错位会让全部后续计算失真。"] }], related: ["draws", "rule-terms"] },
  { slug: "rule-terms", title: "公式与号码术语", summary: "L/D序、头尾合、段位、半头、半波、门数等通俗解释。", group: "term", keywords: ["L序", "D序", "头", "尾", "合", "段位", "半头", "半波", "门数"], aliases: ["术语"], sections: [{ kind: "purpose", anchor: "order", title: "顺序", paragraphs: ["L序是原始落球顺序；D序只把6个平码从小到大排序。"] }, { kind: "technical", anchor: "attributes", title: "号码属性", paragraphs: ["头是十位，尾是个位，合是十位加个位；半头和半波再结合特码单双；门数按号码区间分组，段位按01-49的七段划分。"] }], related: ["rule-understanding", "sample-check"] },
  { slug: "action-and-success", title: "排除、支持与通过", summary: "三者不是同一个概念。", group: "term", keywords: ["杀", "排除", "支持", "成功", "通过"], aliases: ["杀对", "怎么算中"], sections: [{ kind: "purpose", anchor: "actions", title: "动作", paragraphs: ["排除表示公式给出要避开的结果；支持表示公式给出候选集合。"] }, { kind: "interpretation", anchor: "success", title: "历史通过", paragraphs: ["排除公式只有实际开奖没有落入排除集合才算通过；支持公式实际开奖落入集合才算通过。"] }], related: ["backtest", "formula-health"] },
  { slug: "calculation-vs-draw-issue", title: "计算期与开奖期", summary: "通常用N期计算，用N+1期验证。", group: "term", keywords: ["计算期", "开奖期", "N+1"], aliases: ["对应期"], sections: [{ kind: "purpose", anchor: "mapping", title: "如何对应", paragraphs: ["计算期是公式读取的那一期；开奖期是用来核验结果的下一期。页面用箭头展示对应关系，待开奖期不进入历史指标。"] }], related: ["landing-trend", "formula-detail"] },
  { slug: "historical-caveat", title: "历史统计不等于预测", summary: "样本描述、遗漏和通过率不能保证未来。", group: "term", keywords: ["历史", "预测", "概率", "保证"], aliases: ["会不会中"], sections: [{ kind: "misunderstanding", anchor: "limits", title: "必须记住", paragraphs: ["历史次数、连续、遗漏、排名和公式通过率都只描述已开奖样本，不代表下一期概率增加，也不构成投注建议。"] }], related: ["special-analysis", "formula-health"] },
  { slug: "data-health", title: "数据健康状态", summary: "解释更新时间、缺失、重复、冲突和公式异常。", group: "data", keywords: ["数据健康", "缺失期次", "重复数据", "公式异常", "更新时间"], aliases: ["数据有问题"], sections: [{ kind: "purpose", anchor: "status", title: "状态怎么看", paragraphs: ["健康表示没有发现阻断问题；需留意包括过期、冲突记录、非法号码、配置或公式错误；离线表示当前无法获取来源。"] }, { kind: "troubleshooting", anchor: "actions", title: "先做什么", paragraphs: ["先确认最新期和更新时间，再处理冲突期次，最后核对公式错误。没有权威期号序列时，系统会诚实显示缺失状态未知。"] }], related: ["draws", "troubleshooting"] },
  { slug: "formula-health", title: "公式健康度", summary: "把10/30/50期、连续表现、样本和计算异常放在一起看。", group: "data", keywords: ["公式健康", "10期", "30期", "50期", "连续未通过", "样本数量"], aliases: ["公式好不好"], sections: [{ kind: "purpose", anchor: "meaning", title: "健康度是什么", paragraphs: ["健康度是排查工具，不是把公式压成一个神秘分数。页面保留每个窗口的通过数/样本数，并标出样本不足、连续未通过、近期波动和计算错误。"] }, { kind: "interpretation", anchor: "reading", title: "怎么判断", paragraphs: ["先看能否计算，再看样本是否足够，然后看连续未通过，最后比较10期和30/50期是否明显偏离。"] }], related: ["health-table", "backtest", "formula-detail"] },
];
