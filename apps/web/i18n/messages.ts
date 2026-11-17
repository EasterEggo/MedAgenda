import ptBR from "@medagenda/shared/i18n/pt-BR.json";
import en from "@medagenda/shared/i18n/en.json";
import type { AppLocale } from "./routing";

const catalogs = { "pt-BR": ptBR, en } as const;

/** Messages come from the shared catalogs (also used by the mobile app). */
export function loadMessages(locale: AppLocale) {
  return catalogs[locale];
}
