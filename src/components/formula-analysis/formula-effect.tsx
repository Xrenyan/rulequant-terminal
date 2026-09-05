import type { FormulaEffect as FormulaEffectResult } from "@/lib/formula-analysis/formula-effect";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function FormulaEffect({ effect, onOpenIssue }: { effect: FormulaEffectResult; onOpenIssue?: (issue: string) => void }) {
  const percentage = (value: number | null) => value === null ? "暂无" : `${value.toFixed(1)}%`;
  return <section className="rq-formula-effect" aria-label="这条公式表现怎么样">
    <h3>这条公式表现怎么样</h3>
    <Badge tone="slate">已统计 {effect.sampleCount} 期</Badge>
    <p>{effect.successLabel} {effect.successes} 次 · 实际比例 {percentage(effect.actualRate)}</p>
    {effect.expectedRate !== null && <p>同条件随机参考 {percentage(effect.expectedRate)} · 相差 {effect.differencePoints!.toFixed(1)} 个百分点</p>}
    <p>{effect.interpretation}</p>
    {effect.skippedCount > 0 && <p>另有 {effect.skippedCount} 期因数据不完整、重复或无法核对未计入。</p>}
    <details><summary>怎么看这个比较</summary>
      <p>随机参考假设每期 1—49 号机会相同，按这条公式实际覆盖的号码和验证方式计算。同一个号码只算一次；这不是推荐分数，也不是未来命中概率。</p>
      {effect.actualInterval && <p>实际比例的粗略波动范围：{effect.actualInterval[0].toFixed(1)}%—{effect.actualInterval[1].toFixed(1)}%（95% Wilson 区间，假设记录独立；相邻验证有重叠时仅作描述，不用于证明优势）。</p>}
    </details>
    <details><summary>查看出错期次（{effect.failureIssues.length}）</summary>
      {effect.failureIssues.length ? effect.failureIssues.map((issue) => onOpenIssue
        ? <Button key={issue} size="sm" variant="ghost" onClick={() => onOpenIssue(issue)}>{issue}</Button>
        : <span key={issue}>{issue} </span>) : <p>已统计期次中暂无错误记录。</p>}
    </details>
  </section>;
}
