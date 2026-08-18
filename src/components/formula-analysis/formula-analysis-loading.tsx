import { Activity, BarChart3, ListChecks } from "lucide-react";

export function FormulaAnalysisLoading({ message = "正在整理分析数据…" }: { message?: string }) {
  return (
    <div className="rq-analysis-loading" role="status" aria-live="polite" aria-busy="true">
      <div className="rq-analysis-loading__head">
        <span><Activity className="h-5 w-5" /></span>
        <div><strong>{message}</strong><small>系统正在自动整理数据，当前页面仍可操作。</small></div>
      </div>
      <div className="rq-analysis-loading__metrics" aria-hidden="true">
        {Array.from({ length: 4 }, (_, index) => <i key={index} />)}
      </div>
      <div className="rq-analysis-loading__canvas" aria-hidden="true">
        <span><BarChart3 /></span><span><ListChecks /></span>
      </div>
    </div>
  );
}
