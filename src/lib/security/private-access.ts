export const RULEQUANT_ACCESS_STORAGE_KEY = "rulequant:privateAccessToken";

export const RULEQUANT_ACCESS_PARAM_NAMES = ["rq", "access", "invite"] as const;

export const RULEQUANT_ACCESS_TOKEN =
  process.env.NEXT_PUBLIC_RULEQUANT_ACCESS_TOKEN?.trim() || "rq2026-friends-7kp9-mx42-qt88";

export function normalizeAccessToken(value: string | null | undefined) {
  return String(value ?? "").trim();
}

export function isValidAccessToken(value: string | null | undefined) {
  return normalizeAccessToken(value) === RULEQUANT_ACCESS_TOKEN;
}
