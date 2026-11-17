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

function clinicParts(value: Input, timeZone: string): Record<string, string> {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  return Object.fromEntries(parts.map((p) => [p.type, p.value]));
}

/**
 * Wall-clock time of an instant in a timezone, as a local ISO string without offset
 * (e.g. "2026-11-16T14:30:00"). FullCalendar shows such strings as typed, so events
 * appear at the clinic's time even when the browser lives in another timezone.
 */
export function toWallClockIso(value: Input, timeZone: string = DEFAULT_TIMEZONE): string {
  const p = clinicParts(value, timeZone);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}

/** Calendar day of an instant in a timezone, as "YYYY-MM-DD". */
export function dayKey(value: Input, timeZone: string = DEFAULT_TIMEZONE): string {
  return toWallClockIso(value, timeZone).slice(0, 10);
}

/** Weekday and date for day headings, e.g. pt-BR "segunda-feira, 16/11" and en "Monday, 11/16". */
export function formatDayHeading(
  value: Input,
  { locale, timeZone = DEFAULT_TIMEZONE }: FormatOptions,
): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(value));
}
