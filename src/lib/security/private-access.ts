export const RULEQUANT_ACCESS_STORAGE_KEY = "rulequant:privateAccessToken";

export const RULEQUANT_ACCESS_PARAM_NAMES = ["rq", "access", "invite"] as const;

export const RULEQUANT_ACCESS_TOKEN =
  process.env.NEXT_PUBLIC_RULEQUANT_ACCESS_TOKEN?.trim() ?? "";

export function normalizeAccessToken(value: string | null | undefined) {
  return String(value ?? "").trim();
}

export function isAccessTokenConfigured() {
  return RULEQUANT_ACCESS_TOKEN.length > 0;
}

export function isValidAccessToken(value: string | null | undefined) {
  return isAccessTokenConfigured() && normalizeAccessToken(value) === RULEQUANT_ACCESS_TOKEN;
}
