import ptBR from "../i18n/pt-BR.json" with { type: "json" };
import en from "../i18n/en.json" with { type: "json" };
import type { Locale } from "./auth.js";

/** The shared catalogs, for server-side text (emails, ICS). The web app loads them through i18n/messages. */
export const catalogs: Record<Locale, Record<string, unknown>> = { "pt-BR": ptBR, en };

/**
 * Looks up a dotted catalog key (for example `auth.emails.verify.subject`) in one locale and fills
 * `{name}` placeholders from `values`. Throws on a missing key, so a typo fails tests instead of
 * reaching a user. Keys are checked by `pnpm i18n:check`.
 */
export function translateCatalog(
  locale: Locale,
  key: string,
  values: Record<string, string | number> = {},
): string {
  let node: unknown = catalogs[locale];
  for (const part of key.split(".")) {
    node = (node as Record<string, unknown> | undefined)?.[part];
  }
  if (typeof node !== "string") throw new Error(`Missing i18n key: ${key}`);
  return node.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match,
  );
}
