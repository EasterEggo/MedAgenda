import type { Locale } from "@medagenda/shared";
import type { MailMessage } from "../../lib/mailer.js";

// Minimal bilingual transactional templates. Full email i18n (shared catalogs) is Phase 8.
type Kind = "verify" | "reset" | "alreadyRegistered";

const TEXT: Record<Locale, Record<Kind, { subject: string; body: (link: string) => string }>> = {
  "pt-BR": {
    verify: {
      subject: "Confirme seu e-mail - MedAgenda",
      body: (l) => `Confirme seu e-mail acessando o link (valido por 24 horas):\n\n${l}\n`,
    },
    reset: {
      subject: "Redefinicao de senha - MedAgenda",
      body: (l) =>
        `Para redefinir sua senha acesse o link (valido por 1 hora):\n\n${l}\n\nSe nao foi voce, ignore esta mensagem.\n`,
    },
    alreadyRegistered: {
      subject: "Voce ja tem uma conta - MedAgenda",
      body: (l) =>
        `Alguem tentou criar uma conta com este e-mail, mas ele ja esta cadastrado.\nSe foi voce, entre ou redefina sua senha: ${l}\n`,
    },
  },
  en: {
    verify: {
      subject: "Confirm your email - MedAgenda",
      body: (l) => `Confirm your email using this link (valid for 24 hours):\n\n${l}\n`,
    },
    reset: {
      subject: "Password reset - MedAgenda",
      body: (l) =>
        `To reset your password use this link (valid for 1 hour):\n\n${l}\n\nIf this was not you, ignore this message.\n`,
    },
    alreadyRegistered: {
      subject: "You already have an account - MedAgenda",
      body: (l) =>
        `Someone tried to create an account with this email, but it is already registered.\nIf it was you, sign in or reset your password: ${l}\n`,
    },
  },
};

export function buildEmail(kind: Kind, locale: Locale, to: string, link: string): MailMessage {
  const t = TEXT[locale][kind];
  return { to, subject: t.subject, text: t.body(link) };
}
