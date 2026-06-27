import type { DrawRecord } from "@/types/domain";

export type HtmlDrawParseOptions = {
  year?: number;
  sourceUrl?: string;
};

export type DrawParseResult = {
  records: DrawRecord[];
  errors: string[];
};

type ParsedBall = {
  number: number;
  zodiac?: string;
  element?: string;
  color?: string;
};

const COLOR_CLASS_MAP: Record<string, string> = {
  red: "红",
  blue: "蓝",
  green: "绿",
};

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function stripTags(value: string): string {
  return decodeHtml(value.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

function parseUrlYear(sourceUrl?: string): number | undefined {
  const match = sourceUrl?.match(/(?:\/|^)(20\d{2})(?:\/\d+)?\.html(?:$|[?#])/);
  return match ? Number(match[1]) : undefined;
}

function colorFromDtAttributes(attributes: string): string | undefined {
  const match = attributes.match(/ball-(red|blue|green)/i);
  return match ? COLOR_CLASS_MAP[match[1].toLowerCase()] : undefined;
}

function parseBall(liHtml: string): ParsedBall | undefined {
  const dtMatch = liHtml.match(/<dt\b([^>]*)>([\s\S]*?)<\/dt>/i);
  const ddMatch = liHtml.match(/<dd\b[^>]*>([\s\S]*?)<\/dd>/i);
  if (!dtMatch || !ddMatch) return undefined;

  const number = Number(stripTags(dtMatch[2]).replace(/\D/g, ""));
  if (!Number.isInteger(number) || number < 1 || number > 49) return undefined;

  const attributeText = stripTags(ddMatch[1]).replace(/\s+/g, "");
  const [zodiac, element] = attributeText.split(/[\/／]/).filter(Boolean);
  return {
    number,
    zodiac,
    element,
    color: colorFromDtAttributes(dtMatch[1]),
  };
}

function collectBalls(blockHtml: string): ParsedBall[] {
  const balls: ParsedBall[] = [];
  const liRegex = /<li\b([^>]*)>[\s\S]*?<\/li>/gi;
  let match: RegExpExecArray | null;

  while ((match = liRegex.exec(blockHtml)) !== null) {
    const liHtml = match[0];
    const attributes = match[1];
    if (/\bkj-jia\b/i.test(attributes)) continue;
    const ball = parseBall(liHtml);
    if (ball) balls.push(ball);
  }

  return balls;
}

function formatDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseDrawHtml(html: string, options: HtmlDrawParseOptions = {}): DrawParseResult {
  const records: DrawRecord[] = [];
  const errors: string[] = [];
  const titleRegex = /<div\b[^>]*class=["'][^"']*\bkj-tit\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi;
  const titleMatches = [...html.matchAll(titleRegex)];

  titleMatches.forEach((titleMatch, index) => {
    const titleHtml = titleMatch[1];
    const titleText = stripTags(titleHtml).replace(/\s+/g, "");
    const dateMatch = titleText.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
    const issueMatch = titleText.match(/第(\d+)期/) ?? titleHtml.match(/<span\b[^>]*>(\d+)<\/span>\s*期/i);
    const blockStart = titleMatch.index ?? 0;
    const blockEnd = titleMatches[index + 1]?.index ?? html.length;
    const blockHtml = html.slice(blockStart, blockEnd);

    if (!dateMatch || !issueMatch) {
      errors.push(`第 ${index + 1} 个开奖区块缺少日期或期号`);
      return;
    }

    const year = options.year ?? Number(dateMatch[1]) ?? parseUrlYear(options.sourceUrl);
    const month = Number(dateMatch[2]);
    const day = Number(dateMatch[3]);
    const pageIssue = issueMatch[1];
    const balls = collectBalls(blockHtml);

    if (balls.length < 7) {
      errors.push(`${year} 年第 ${pageIssue} 期号码不足 7 个`);
      return;
    }

    const numbers = balls.slice(0, 7).map((ball) => ball.number);
    const issue = `${year}${pageIssue.padStart(3, "0")}`;
    records.push({
      issue,
      year,
      date: formatDate(year, month, day),
      n1: numbers[0],
      n2: numbers[1],
      n3: numbers[2],
      n4: numbers[3],
      n5: numbers[4],
      n6: numbers[5],
      special: numbers[6],
      sourceUrl: options.sourceUrl,
      rawAttributes: {
        pageIssue,
        balls: balls.slice(0, 7),
      },
    });
  });

  const seen = new Set<string>();
  const uniqueRecords = records.filter((record) => {
    if (seen.has(record.issue)) {
      errors.push(`重复期号：${record.issue}`);
      return false;
    }
    seen.add(record.issue);
    return true;
  });

  return {
    records: uniqueRecords,
    errors,
  };
}

export function buildYearUrl(inputUrl: string, year: number): string {
  const trimmed = inputUrl.trim();
  if (/(?:\/|^)20\d{2}(?:\/\d+)?\.html(?:$|[?#])/.test(trimmed)) {
    return trimmed.replace(/20\d{2}(?=(?:\/\d+)?\.html(?:$|[?#]))/, String(year));
  }
  if (trimmed.endsWith("/")) return `${trimmed}${year}.html`;
  return `${trimmed}/${year}.html`;
}
