// Add-only import: existing objects and draw/config metadata must remain untouched.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { registerHooks } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Only the add-only importer uses this wider alias check. Do not migrate old
// library IDs/signatures or collapse existing user-authored records in place.
export function importRuleSignature(rule, signatureFor) {
  const formula = rule.formula.replace(/[^+\-*/()（）\s]+/g, (token) => {
    if (/^\d+$/.test(token)) return String(Number(token));
    const position = token.match(/^(平|落)(?:码)?([1-7一二三四五六七])(.*)$/);
    if (position) {
      const digit = /^[1-7]$/.test(position[2]) ? position[2] : String("一二三四五六七".indexOf(position[2]) + 1);
      const suffix = /^(码|号码)$/.test(position[3]) ? "" : position[3];
      return `${position[1]}${digit}${suffix}`;
    }
    return token;
  });
  return signatureFor({ ...rule, formula });
}

export function appendMissingRules(existing, candidates, signatureFor) {
  const rules = [...existing];
  const bySignature = new Map(existing.map((rule) => [signatureFor(rule), rule]));
  const ids = new Set(existing.map((rule) => rule.id));
  const added = [];
  const entries = [];
  for (const [offset, candidate] of candidates.entries()) {
    const signature = signatureFor(candidate);
    const match = bySignature.get(signature);
    if (match) {
      entries.push({ index: offset + 1, sourceName: candidate.name, ruleId: match.id, signature, status: "already-present" });
      continue;
    }
    if (ids.has(candidate.id)) throw new Error(`ID collision with different calculation: ${candidate.id}`);
    rules.push(candidate);
    added.push(candidate);
    ids.add(candidate.id);
    bySignature.set(signature, candidate);
    entries.push({ index: offset + 1, sourceName: candidate.name, ruleId: candidate.id, signature, status: "added" });
  }
  return { rules, added, entries };
}

async function main() {
  const document = process.argv[2];
  if (!document) throw new Error("Usage: node scripts/append-rule-library-docx.mjs document.docx [--write] (Node 22.15+)");
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  // Reuse the application's signature and evaluator, not a second approximation.
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier.startsWith("@/")) {
        const stem = resolve(root, "src", specifier.slice(2));
        const path = [stem, `${stem}.ts`, `${stem}/index.ts`].find((candidate) => existsSync(candidate));
        if (!path) throw new Error(`Cannot resolve ${specifier}`);
        return { url: pathToFileURL(path).href, shortCircuit: true };
      }
      return nextResolve(specifier, context);
    },
  });
  const { buildRuleSignature } = await import(pathToFileURL(resolve(root, "src/lib/rules/rule-library.ts")).href);
  const { normalizeDraw } = await import(pathToFileURL(resolve(root, "src/lib/engine/attributes.ts")).href);
  const { runRuleCalculation } = await import(pathToFileURL(resolve(root, "src/lib/rule-engine/rule-engine.ts")).href);
  const extraction = spawnSync(process.env.RULEQUANT_PYTHON || "python", [resolve(root, "scripts/sync-rule-library-docx.py"), document, "--candidates-json"], {
    encoding: "utf8", env: { ...process.env, PYTHONIOENCODING: "utf-8" }, maxBuffer: 16 * 1024 * 1024,
  });
  if (extraction.status !== 0) throw new Error(extraction.stderr || String(extraction.error));
  const source = JSON.parse(extraction.stdout);
  const rulesPath = resolve(root, "data/sample-rules.json");
  const cloudPath = resolve(root, "public/static-cloud-state.json");
  const original = JSON.parse(readFileSync(rulesPath, "utf8"));
  const cloud = JSON.parse(readFileSync(cloudPath, "utf8"));
  const auditPath = resolve(root, `docs/rule-import-${source.snapshotDate}.json`);
  const previousAudit = process.argv.includes("--refresh-audit") ? JSON.parse(readFileSync(auditPath, "utf8")) : undefined;
  const baseline = previousAudit ? original.slice(0, previousAudit.previousTotal) : original;
  if (previousAudit && (createHash("sha256").update(JSON.stringify(baseline)).digest("hex") !== previousAudit.previousRulesSha256
      || createHash("sha256").update(readFileSync(document)).digest("hex") !== previousAudit.documentSha256)) {
    throw new Error("Audit inputs have changed; refusing to regenerate provenance.");
  }
  const signatureFor = (rule) => importRuleSignature(rule, buildRuleSignature);
  const result = appendMissingRules(baseline, source.rules, signatureFor);
  if (previousAudit && JSON.stringify(result.rules) !== JSON.stringify(original)) {
    const expectedIds = new Set(result.rules.map((rule) => rule.id));
    throw new Error(`Audit reconstruction differs from the library: expected ${result.rules.length}; extra IDs ${original.filter((rule) => !expectedIds.has(rule.id)).map((rule) => rule.id).join(", ")}`);
  }
  const cloudResult = appendMissingRules(cloud.rules, result.rules, signatureFor);
  if (JSON.stringify(cloudResult.rules) !== JSON.stringify(result.rules)) {
    throw new Error("Seed and cloud libraries differ; reconcile explicitly before importing.");
  }
  const draws = cloud.draws;
  const latest = normalizeDraw(draws.at(-1), cloud.config);
  // Validate all source entries, including duplicates, before writing either file.
  for (const candidate of source.rules) {
    const calculation = runRuleCalculation(candidate, latest, cloud.config);
    if (!Number.isFinite(calculation.rawResult) || !calculation.mappedResult.length) {
      throw new Error(`Empty calculation: ${candidate.id} ${candidate.name}`);
    }
  }
  const report = {
    document: source.document,
    documentSha256: createHash("sha256").update(readFileSync(document)).digest("hex"),
    sourceTotal: source.sourceTotal,
    previousTotal: baseline.length,
    previousRulesSha256: createHash("sha256").update(JSON.stringify(baseline)).digest("hex"),
    added: result.added.length,
    alreadyPresent: result.entries.filter((entry) => entry.status === "already-present").length,
    total: result.rules.length,
    entries: result.entries,
  };
  if (process.argv.includes("--write")) {
    if (!result.added.length) throw new Error("Nothing to add; existing audit report preserved.");
    const output = (path, data) => writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    output(rulesPath, result.rules);
    output(cloudPath, { ...cloud, rules: cloudResult.rules });
    output(auditPath, report);
  }
  if (previousAudit) writeFileSync(auditPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ...report, entries: undefined, addedRules: result.added.map(({ id, name, formula }) => ({ id, name, formula })) }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
