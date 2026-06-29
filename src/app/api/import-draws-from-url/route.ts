import { NextResponse } from "next/server";
import { fetchDrawsFromUrl } from "@/lib/server/draw-sync";
import {
  hasDrawWriteAuthorization,
  isConfiguredDrawSourceUrl,
  syncDrawsToCloud,
} from "@/lib/server/sync-draws-to-cloud";

export const runtime = "nodejs";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
};

type ImportDrawsBody = {
  url?: string;
  baseUrl?: string;
  fromYear?: number;
  toYear?: number;
  years?: number[];
  persist?: boolean;
};

function canPersistDraws(request: Request, baseUrl: string) {
  return isConfiguredDrawSourceUrl(baseUrl) || hasDrawWriteAuthorization(request);
}

export async function OPTIONS() {
  return new NextResponse(null, { headers: CORS_HEADERS });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ImportDrawsBody;
    const baseUrl = String(body.baseUrl || body.url || "").trim();
    if (!baseUrl) {
      return NextResponse.json({ records: [], years: [], errors: ["missing url"] }, { status: 400, headers: CORS_HEADERS });
    }

    const input = {
      baseUrl,
      fromYear: body.fromYear,
      toYear: body.toYear,
      years: body.years,
    };
    if (body.persist === true && !canPersistDraws(request, baseUrl)) {
      return NextResponse.json(
        {
          records: [],
          years: [],
          errors: ["custom source cannot persist without authorization"],
          persisted: false,
        },
        { status: 403, headers: CORS_HEADERS },
      );
    }

    const result = body.persist === true ? await syncDrawsToCloud(input) : await fetchDrawsFromUrl(input);

    return NextResponse.json({ ...result, persisted: body.persist === true }, { headers: CORS_HEADERS });
  } catch (error) {
    return NextResponse.json({ records: [], years: [], errors: [error instanceof Error ? error.message : String(error)] }, { status: 500, headers: CORS_HEADERS });
  }
}
