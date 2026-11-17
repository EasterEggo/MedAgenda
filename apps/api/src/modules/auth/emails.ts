import { translateCatalog, type Locale } from "@medagenda/shared";
import type { MailMessage } from "../../lib/mailer.js";

type Kind = "verify" | "reset" | "alreadyRegistered";

// Catalog keys per email. Keys are spelled out in full so `pnpm i18n:check` can see them.
const KEYS: Record<Kind, { subject: string; body: string }> = {
  verify: { subject: "auth.emails.verify.subject", body: "auth.emails.verify.body" },
  reset: { subject: "auth.emails.reset.subject", body: "auth.emails.reset.body" },
  alreadyRegistered: {
    subject: "auth.emails.alreadyRegistered.subject",
    body: "auth.emails.alreadyRegistered.body",
  },
};

/** Builds an auth email in the recipient's stored locale. The link is the only variable part. */
export function buildEmail(kind: Kind, locale: Locale, to: string, link: string): MailMessage {
  const keys = KEYS[kind];
  return {
    to,
    subject: translateCatalog(locale, keys.subject),
    text: translateCatalog(locale, keys.body, { link }),
  };
}
