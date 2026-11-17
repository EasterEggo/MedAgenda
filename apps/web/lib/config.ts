export const apiOrigin = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
/** @deprecated use apiOrigin */
export const apiBaseUrl = apiOrigin;
export const apiV1Url = `${apiOrigin}/api/v1`;
/** Default clinic timezone, used when an appointment has no clinic timezone to hand. */
export const DEFAULT_TIMEZONE = "America/Sao_Paulo";
