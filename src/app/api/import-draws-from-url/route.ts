import { NextResponse } from "next/server";
import { fetchDrawsFromUrl } from "@/lib/server/draw-sync";

export const runtime = "nodejs";

type ImportDrawsBody = {
  url?: string;
  baseUrl?: string;
  fromYear?: number;
  toYear?: number;
  years?: number[];
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ImportDrawsBody;
    const baseUrl = String(body.baseUrl || body.url || "").trim();
    if (!baseUrl) {
      return NextResponse.json({ records: [], years: [], errors: ["missing url"] }, { status: 400 });
    }

    const result = await fetchDrawsFromUrl({
      baseUrl,
      fromYear: body.fromYear,
      toYear: body.toYear,
      years: body.years,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ records: [], years: [], errors: [error instanceof Error ? error.message : String(error)] }, { status: 500 });
  }
}
