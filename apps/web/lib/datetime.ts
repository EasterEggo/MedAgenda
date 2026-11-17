import { DEFAULT_TIMEZONE } from "./config";

export interface FormatOptions {
  /** Active UI locale, e.g. "pt-BR" or "en". */
  locale: string;
  /** IANA timezone of the clinic. Defaults to America/Sao_Paulo. */
  timeZone?: string;
}

type Input = Date | string | number;

function partsToMap(parts: Intl.DateTimeFormatPart[]): string {
  return parts.map((p) => p.value).join("");
}

/** Date only, e.g. pt-BR "16/11/2026", en "11/16/2026". */
export function formatDate(
  value: Input,
  { locale, timeZone = DEFAULT_TIMEZONE }: FormatOptions,
): string {
  return partsToMap(
    new Intl.DateTimeFormat(locale, {
      timeZone,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).formatToParts(new Date(value)),
  );
}

/** Time only, e.g. pt-BR "14:30", en "2:30 PM". */
export function formatTime(
  value: Input,
  { locale, timeZone = DEFAULT_TIMEZONE }: FormatOptions,
): string {
  return partsToMap(
    new Intl.DateTimeFormat(locale, {
      timeZone,
      hour: locale === "pt-BR" ? "2-digit" : "numeric",
      minute: "2-digit",
      hour12: locale !== "pt-BR",
    }).formatToParts(new Date(value)),
  );
}

/** Date and time in the clinic timezone with the active locale, e.g. pt-BR "16/11/2026 14:30". */
export function formatDateTime(value: Input, options: FormatOptions): string {
  return `${formatDate(value, options)} ${formatTime(value, options)}`;
}
