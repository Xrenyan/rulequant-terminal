import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import zlib from "node:zlib";

const endpoint = process.env.RULEQUANT_CLOUD_STATE_URL || "https://rulequant-terminal.vercel.app/api/cloud/state";
const drawImportEndpoint = process.env.RULEQUANT_DRAW_IMPORT_URL || "https://rulequant-terminal.vercel.app/api/import-draws-from-url";
const drawSourceUrl = process.env.RULEQUANT_DRAW_SOURCE_URL || "https://thjffv.ag0rkv-4pnok-ljvvrg.xyz:16633/kj/3/2026.html";
const drawFromYear = Number(process.env.RULEQUANT_DRAW_FROM_YEAR || 2026);
const drawToYear = Number(process.env.RULEQUANT_DRAW_TO_YEAR || drawFromYear);
const requireLiveSource = process.env.RULEQUANT_REQUIRE_LIVE_SOURCE === "true";
const root = process.cwd();
const REQUEST_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) RuleQuant/1.0",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

function readJsonIfExists(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function issueValue(issue) {
  const value = Number(String(issue ?? "").replace(/\D/g, ""));
  return Number.isFinite(value) ? value : 0;
}

function sortDraws(draws) {
  return [...draws].sort((a, b) => issueValue(a.issue) - issueValue(b.issue));
}

function latestIssue(draws) {
  return sortDraws(draws).at(-1)?.issue ?? "";
}

function mergeByKey(localItems, remoteItems, getKey) {
  const merged = new Map();
  for (const item of localItems) {
    const key = getKey(item);
    if (key) merged.set(key, item);
  }
  for (const item of remoteItems) {
    const key = getKey(item);
    if (key) merged.set(key, item);
  }
  return [...merged.values()];
}

function canonicalRuleAttribute(attribute) {
  switch (attribute) {
    case "合数":
      return "合";
    case "合数尾":
      return "合尾";
    case "波":
    case "波色":
    case "波色值":
      return "波色值";
    case "行":
    case "五行":
    case "五行值":
      return "五行值";
    case "奇偶":
      return "单双";
    default:
      return attribute;
  }
}

function canonicalRuleFormula(value) {
  let formula = String(value ?? "")
    .trim()
    .normalize("NFKC")
    .replace(/([1-7])\uFE0F?\u20E3/g, "$1")
    .replace(/[，、；;]/g, "+")
    .replace(/\s+/g, "")
    .replace(/落([1-6])/g, "平$1")
    .replace(/(?:落7|平7|特号)/g, "特码")
    .replace(/(^|[+\-*/(])特(?=$|[+\-*/)])/g, "$1特码")
    .replace(/特(?=(?:头|尾|合|合数|合尾|合数尾|段|波|波色|波色值|行|五行|五行值|单双|奇偶|大小|位))/g, "特码")
    .replace(/总分尾/g, "总数尾")
    .replace(/总分合/g, "总数合")
    .replace(/总分/g, "总数")
    .replace(/特(?:肖位|码位|位)/g, "特码位")
    .replace(/肖位/g, "位")
    .replace(/期(?:号|数)尾/g, "期尾")
    .replace(
      /(合数尾|合尾|合数|合|波色值|波色|波|五行值|五行|行|头|尾|段|单双|奇偶|大小|位)\((平[1-6]|特码)\)/g,
      (_, attribute, position) => `${position}${canonicalRuleAttribute(attribute)}`,
    )
    .replace(
      /(平[1-6]|特码)(合数尾|合尾|合数|合|波色值|波色|波|五行值|五行|行|头|尾|段|单双|奇偶|大小|位)/g,
      (_, position, attribute) => `${position}${canonicalRuleAttribute(attribute)}`,
    );

  if (formula.includes("+") && !/[\-*/]/.test(formula)) {
    formula = formula.split("+").filter(Boolean).sort((a, b) => a.localeCompare(b, "zh-CN", { numeric: true })).join("+");
  }
  return formula;
}

function ruleSignature(rule) {
  return [
    rule.category ?? rule.type ?? "",
    rule.target ?? "",
    rule.orderMode ?? rule.orderType ?? "",
    canonicalRuleFormula(rule.formula ?? rule.expression),
    String(rule.normalizer ?? rule.normalizeMode ?? "").trim(),
    (rule.positionPattern ?? []).map(Number).filter(Number.isFinite).join(","),
    String(rule.anchorIssue ?? "").trim(),
    String(rule.anchorPatternIndex ?? 0),
    String(rule.periodSpan ?? 1),
    String(rule.verifyOffset ?? rule.periodSpan ?? 1),
  ].join("|");
}

function ruleSourcePriority(rule) {
  return {
    user_provided: 50,
    manual: 40,
    txt_import: 30,
    system_recommended: 20,
    copied: 10,
    example: 0,
  }[rule.sourceType ?? ""] ?? 0;
}

function mergeRuleLibraries(libraries, preferredRuleIds = new Set()) {
  const byId = new Map();
  libraries.forEach((rules) => (Array.isArray(rules) ? rules : []).forEach((rule) => {
    if (rule?.id) byId.set(String(rule.id), rule);
  }));

  const unique = [];
  const signatureIndexes = new Map();
  for (const rule of byId.values()) {
    const signature = ruleSignature(rule);
    const duplicateIndex = signatureIndexes.get(signature);
    if (duplicateIndex === undefined) {
      signatureIndexes.set(signature, unique.length);
      unique.push(rule);
      continue;
    }
    const existing = unique[duplicateIndex];
    const shouldReplace =
      ruleSourcePriority(rule) > ruleSourcePriority(existing)
      || (ruleSourcePriority(rule) === ruleSourcePriority(existing)
        && preferredRuleIds.has(String(rule.id))
        && !preferredRuleIds.has(String(existing.id)));
    if (shouldReplace) unique[duplicateIndex] = rule;
  }
  return unique;
}

function decodeHtml(value) {
  return String(value ?? "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function stripTags(value) {
  return decodeHtml(String(value ?? "").replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

function parseUrlYear(sourceUrl) {
  const match = String(sourceUrl ?? "").match(/(?:\/|^)(20\d{2})(?:\/\d+)?\.html(?:$|[?#])/);
  return match ? Number(match[1]) : undefined;
}

function buildYearUrl(inputUrl, year) {
  const trimmed = String(inputUrl ?? "").trim();
  if (/(?:\/|^)20\d{2}(?:\/\d+)?\.html(?:$|[?#])/.test(trimmed)) {
    return trimmed.replace(/20\d{2}(?=(?:\/\d+)?\.html(?:$|[?#]))/, String(year));
  }
  if (trimmed.endsWith("/")) return `${trimmed}${year}.html`;
  return `${trimmed}/${year}.html`;
}

function normalizeYears(fromYear, toYear) {
  const start = Math.min(Number(fromYear), Number(toYear));
  const end = Math.max(Number(fromYear), Number(toYear));
  return Array.from({ length: end - start + 1 }, (_, index) => start + index)
    .filter((year) => Number.isInteger(year) && year >= 2000 && year <= 2099);
}

function colorFromDtAttributes(attributes) {
  const match = String(attributes ?? "").match(/ball-(red|blue|green)/i);
  if (!match) return undefined;
  return { red: "\u7ea2", blue: "\u84dd", green: "\u7eff" }[match[1].toLowerCase()];
}

function parseBall(liHtml) {
  const dtMatch = liHtml.match(/<dt\b([^>]*)>([\s\S]*?)<\/dt>/i);
  const ddMatch = liHtml.match(/<dd\b[^>]*>([\s\S]*?)<\/dd>/i);
  if (!dtMatch || !ddMatch) return undefined;

  const number = Number(stripTags(dtMatch[2]).replace(/\D/g, ""));
  if (!Number.isInteger(number) || number < 1 || number > 49) return undefined;

  const attributeText = stripTags(ddMatch[1]).replace(/\s+/g, "");
  const [zodiac, element] = attributeText.split(/[\/\uff0f]/).filter(Boolean);
  return {
    number,
    zodiac,
    element,
    color: colorFromDtAttributes(dtMatch[1]),
  };
}

function collectBalls(blockHtml) {
  const balls = [];
  const liRegex = /<li\b([^>]*)>[\s\S]*?<\/li>/gi;
  let match;
  while ((match = liRegex.exec(blockHtml)) !== null) {
    if (/\bkj-jia\b/i.test(match[1])) continue;
    const ball = parseBall(match[0]);
    if (ball) balls.push(ball);
  }
  return balls;
}

function formatDate(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseDrawHtml(html, { year, sourceUrl } = {}) {
  const records = [];
  const errors = [];
  const titleRegex = /<div\b[^>]*class=["'][^"']*\bkj-tit\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi;
  const titleMatches = [...html.matchAll(titleRegex)];

  titleMatches.forEach((titleMatch, index) => {
    const titleHtml = titleMatch[1];
    const titleText = stripTags(titleHtml).replace(/\s+/g, "");
    const dateMatch = titleText.match(/(\d{4})\u5e74(\d{1,2})\u6708(\d{1,2})\u65e5/);
    const issueMatch = titleText.match(/\u7b2c(\d+)\u671f/) || titleHtml.match(/<span\b[^>]*>(\d+)<\/span>\s*\u671f/i);
    const blockStart = titleMatch.index ?? 0;
    const blockEnd = titleMatches[index + 1]?.index ?? html.length;
    const blockHtml = html.slice(blockStart, blockEnd);

    if (!dateMatch || !issueMatch) {
      errors.push(`draw block ${index + 1} missing date or issue`);
      return;
    }

    const recordYear = year ?? Number(dateMatch[1]) ?? parseUrlYear(sourceUrl);
    const month = Number(dateMatch[2]);
    const day = Number(dateMatch[3]);
    const pageIssue = issueMatch[1];
    const balls = collectBalls(blockHtml);
    if (balls.length < 7) {
      errors.push(`${recordYear} issue ${pageIssue} has fewer than 7 balls`);
      return;
    }

    const numbers = balls.slice(0, 7).map((ball) => ball.number);
    records.push({
      issue: `${recordYear}${pageIssue.padStart(3, "0")}`,
      year: recordYear,
      date: formatDate(recordYear, month, day),
      n1: numbers[0],
      n2: numbers[1],
      n3: numbers[2],
      n4: numbers[3],
      n5: numbers[4],
      n6: numbers[5],
      special: numbers[6],
      sourceUrl,
      rawAttributes: {
        pageIssue,
        balls: balls.slice(0, 7),
      },
    });
  });

  const seen = new Set();
  const uniqueRecords = records.filter((record) => {
    if (seen.has(record.issue)) {
      errors.push(`duplicate issue ${record.issue}`);
      return false;
    }
    seen.add(record.issue);
    return true;
  });
  return { records: uniqueRecords, errors };
}

function unzipIfNeeded(buffer, encoding) {
  if (/gzip/i.test(encoding ?? "")) return zlib.gunzipSync(buffer).toString("utf8");
  if (/br/i.test(encoding ?? "")) return zlib.brotliDecompressSync(buffer).toString("utf8");
  if (/deflate/i.test(encoding ?? "")) return zlib.inflateSync(buffer).toString("utf8");
  return buffer.toString("utf8");
}

async function fetchWithNodeHttps(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      { headers: REQUEST_HEADERS, rejectUnauthorized: false },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        response.on("end", () => {
          const statusCode = response.statusCode ?? 0;
          const body = unzipIfNeeded(Buffer.concat(chunks), response.headers["content-encoding"]);
          if (statusCode >= 200 && statusCode < 300) {
            resolve(body);
            return;
          }
          reject(new Error(`HTTP ${statusCode}`));
        });
      },
    );
    request.on("error", reject);
    request.setTimeout(20000, () => request.destroy(new Error("download timeout")));
  });
}

async function downloadHtml(url) {
  try {
    const response = await fetch(url, { cache: "no-store", headers: REQUEST_HEADERS });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } catch (error) {
    if (!url.startsWith("https://")) throw error;
    return fetchWithNodeHttps(url);
  }
}

async function retry(task, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1200));
      }
    }
  }
  throw lastError;
}

async function fetchDrawsDirectlyFromSource(baseUrl, fromYear, toYear) {
  const records = [];
  const errors = [];
  const years = [];
  for (const year of normalizeYears(fromYear, toYear)) {
    const url = buildYearUrl(baseUrl, year);
    try {
      const html = await retry(() => downloadHtml(url));
      const parsed = parseDrawHtml(html, { year, sourceUrl: url });
      records.push(...parsed.records);
      errors.push(...parsed.errors.map((message) => `${year}: ${message}`));
      years.push({ year, url, count: parsed.records.length });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${year}: ${message}`);
      years.push({ year, url, count: 0, error: message });
    }
  }

  const unique = new Map(records.map((record) => [record.issue, record]));
  return {
    records: [...unique.values()].sort((a, b) => issueValue(b.issue) - issueValue(a.issue)),
    years,
    errors,
    fetchedAt: new Date().toISOString(),
  };
}

async function fetchDrawsViaImportEndpoint() {
  const drawResponse = await fetch(`${drawImportEndpoint}${drawImportEndpoint.includes("?") ? "&" : "?"}t=${Date.now()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ baseUrl: drawSourceUrl, fromYear: drawFromYear, toYear: drawToYear }),
    cache: "no-store",
  });
  if (!drawResponse.ok) throw new Error(`${drawResponse.status} ${drawResponse.statusText}`);
  return drawResponse.json();
}

async function main() {
  const staticStatePath = path.join(root, "public", "static-cloud-state.json");
  const localState = readJsonIfExists(staticStatePath, {});
  const localDraws = Array.isArray(localState.draws)
    ? localState.draws
    : readJsonIfExists(path.join(root, "data", "sample-draws.json"), []);
  const bundledRules = readJsonIfExists(path.join(root, "data", "sample-rules.json"), []);
  const bundledRuleIds = new Set((Array.isArray(bundledRules) ? bundledRules : []).map((rule) => String(rule.id ?? "")));
  const localRules = mergeRuleLibraries(
    [Array.isArray(localState.rules) ? localState.rules : [], Array.isArray(bundledRules) ? bundledRules : []],
    bundledRuleIds,
  );
  let state = localState;
  try {
    const response = await fetch(`${endpoint}${endpoint.includes("?") ? "&" : "?"}t=${Date.now()}`, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Failed to refresh static data: ${response.status} ${response.statusText}`);
    }

    const cloudState = await response.json();
    if (!Array.isArray(cloudState.draws) || !Array.isArray(cloudState.rules)) {
      throw new Error("Cloud state response does not include draws/rules arrays.");
    }
    state = cloudState;
  } catch (error) {
    if (!Array.isArray(localDraws) || !Array.isArray(localRules) || localDraws.length === 0 || localRules.length === 0) {
      throw error;
    }
    console.warn(`Cloud state refresh skipped; using local static data: ${error instanceof Error ? error.message : String(error)}`);
    state = {
      ...localState,
      draws: localDraws,
      rules: localRules,
    };
  }
  const cloudDraws = Array.isArray(state.draws) ? state.draws : [];

  let sourceDraws = [];
  let sourceFetchedAt = "";
  try {
    const imported = await fetchDrawsDirectlyFromSource(drawSourceUrl, drawFromYear, drawToYear);
    if (!Array.isArray(imported.records) || imported.records.length === 0) {
      throw new Error(imported.errors?.join("; ") || "configured source returned no draw records");
    }
    if (Array.isArray(imported.records)) {
      sourceDraws = imported.records;
      sourceFetchedAt = imported.fetchedAt ?? "";
    }
  } catch (error) {
    console.warn(`Direct draw source refresh failed; trying import endpoint: ${error instanceof Error ? error.message : String(error)}`);
    try {
      const imported = await fetchDrawsViaImportEndpoint();
      if (Array.isArray(imported.records) && imported.records.length > 0) {
        sourceDraws = imported.records;
        sourceFetchedAt = imported.fetchedAt ?? "";
      }
    } catch (fallbackError) {
      console.warn(`Draw source refresh skipped: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`);
    }
  }

  if (requireLiveSource && sourceDraws.length === 0) {
    throw new Error("Live draw source verification failed after retries; keeping the previously published site unchanged.");
  }

  const mergedDraws = sortDraws(
    mergeByKey(
      mergeByKey(localDraws, cloudDraws, (draw) => String(draw.issue ?? "")),
      sourceDraws,
      (draw) => String(draw.issue ?? ""),
    ),
  );
  const mergedRules = mergeRuleLibraries(
    [Array.isArray(state.rules) ? state.rules : [], localRules, Array.isArray(bundledRules) ? bundledRules : []],
    bundledRuleIds,
  );
  const localLatest = latestIssue(localDraws);
  const cloudLatest = latestIssue(cloudDraws);
  const sourceLatest = latestIssue(sourceDraws);
  const mergedLatest = latestIssue(mergedDraws);
  const localIsNewest =
    issueValue(localLatest) >= issueValue(cloudLatest) &&
    issueValue(localLatest) >= issueValue(sourceLatest);

  const nextState = {
    ...localState,
    ...state,
    draws: mergedDraws,
    rules: mergedRules,
    samples: Array.isArray(state.samples) ? state.samples : (localState.samples ?? []),
    logs: Array.isArray(state.logs) ? state.logs : (localState.logs ?? []),
    backups: Array.isArray(state.backups) ? state.backups : (localState.backups ?? []),
    referenceHistory: Array.isArray(state.referenceHistory) ? state.referenceHistory : (localState.referenceHistory ?? []),
    meta: {
      ...(localState.meta ?? {}),
      ...(state.meta ?? {}),
      latestIssue: mergedLatest,
      recordCount: mergedDraws.length,
      updatedAt: localIsNewest
        ? (localState.meta?.updatedAt ?? state.meta?.updatedAt)
        : (sourceFetchedAt || state.meta?.updatedAt || localState.meta?.updatedAt),
      message: "Static data refreshed without rolling back newer local draws",
    },
  };

  fs.writeFileSync(path.join(root, "data", "sample-draws.json"), `${JSON.stringify(mergedDraws, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(root, "data", "sample-rules.json"), `${JSON.stringify(mergedRules, null, 2)}\n`, "utf8");
  fs.mkdirSync(path.join(root, "public"), { recursive: true });
  fs.writeFileSync(staticStatePath, `${JSON.stringify(nextState, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        cloudLatestIssue: cloudLatest,
        localLatestIssue: localLatest,
        sourceLatestIssue: sourceLatest,
        latestIssue: mergedLatest,
        draws: mergedDraws.length,
        rules: mergedRules.length,
        updatedAt: nextState.meta?.updatedAt,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
