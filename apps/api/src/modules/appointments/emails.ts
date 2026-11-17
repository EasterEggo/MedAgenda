import { translateCatalog, type Locale } from "@medagenda/shared";
import type { MailMessage } from "../../lib/mailer.js";

export interface BookingConfirmationDetails {
  serviceType: "CONSULTATION" | "EXAM";
  /** Specialty or exam name in the recipient's language. */
  serviceName: string | null;
  providerName: string;
  clinicName: string;
  clinicAddress: string;
  timezone: string;
  startsAt: Date;
  /** Preparation text in the recipient's language, for exams. */
  preparation: string | null;
}

const SERVICE_KEY = {
  CONSULTATION: "common.serviceType.CONSULTATION",
  EXAM: "common.serviceType.EXAM",
} as const;

const DATE_LOCALE: Record<Locale, string> = { "pt-BR": "pt-BR", en: "en-US" };

/**
 * Booking confirmation in the user's stored locale. It names the service, the professional, the
 * time and the clinic. It never includes the patient's name, CPF or notes.
 */
export function buildBookingConfirmation(
  locale: Locale,
  to: string,
  details: BookingConfirmationDetails,
  link: string,
): MailMessage {
  const when = new Intl.DateTimeFormat(DATE_LOCALE[locale], {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: details.timezone,
  }).format(details.startsAt);
  const type = translateCatalog(locale, SERVICE_KEY[details.serviceType]);
  const service = details.serviceName
    ? translateCatalog(locale, "booking.emails.confirmation.service", {
        type,
        name: details.serviceName,
        provider: details.providerName,
      })
    : translateCatalog(locale, "booking.emails.confirmation.serviceNoName", {
        type,
        provider: details.providerName,
      });
  return {
    to,
    subject: translateCatalog(locale, "booking.emails.confirmation.subject"),
    text: translateCatalog(locale, "booking.emails.confirmation.body", {
      service,
      when,
      clinic: details.clinicName,
      address: details.clinicAddress,
      preparation: details.preparation
        ? translateCatalog(locale, "booking.emails.confirmation.preparation", {
            text: details.preparation,
          })
        : "",
      link,
    }),
  };
}
