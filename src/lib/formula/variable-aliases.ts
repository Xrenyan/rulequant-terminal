/** Shared by evaluation and duplicate detection; keep the author's spelling in traces. */
const VARIABLE_ALIASES: Readonly<Record<string, string>> = {
  总分: "总数",
  总分和: "总数",
  总和: "总数",
  总分尾: "总数尾",
  总分合: "总数合",
  总和合: "总数合",
  总分合尾: "总数合尾",
  总和合尾: "总数合尾",
  总合尾: "总数合尾",
  期数头: "期头",
  期号头: "期头",
  期数合: "期合",
  期号合: "期合",
  期数合尾: "期合尾",
  期号合尾: "期合尾",
};

export function canonicalVariableName(name: string): string {
  return Object.hasOwn(VARIABLE_ALIASES, name) ? VARIABLE_ALIASES[name] : name;
}
