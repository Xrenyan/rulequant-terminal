/// <reference lib="webworker" />
import { compareFormulaGroups, type GroupComparisonInput } from "@/lib/candidate-pool/group-comparison";

self.onmessage = (event: MessageEvent<{ key: string; input: GroupComparisonInput }>) => {
  const { key, input } = event.data;
  try { self.postMessage({ key, ok: true, report: compareFormulaGroups(input) }); }
  catch { self.postMessage({ key, ok: false, error: "这次比较没有完成，请检查所选公式和开奖记录后重试。" }); }
};
