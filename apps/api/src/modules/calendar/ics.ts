import { createEvents, type EventAttributes } from "ics";

/**
 * The ICS leaves our encryption boundary (downloads, public feed). Only the fields below may be
 * passed in: no CPF, notes, health-insurance data or any user identity.
 */
export interface IcsAppointment {
  icsUid: string;
  sequence: number;
  status: "SCHEDULED" | "CANCELLED" | "COMPLETED" | "NO_SHOW";
  startsAt: Date;
  endsAt: Date;
  serviceType: "CONSULTATION" | "EXAM";
  specialty: { namePt: string; nameEn: string } | null;
  examType: {
    namePt: string;
    nameEn: string;
    preparationPt: string | null;
    preparationEn: string | null;
  } | null;
  providerName: string;
  clinic: { name: string; address: string; phone: string; timezone: string };
}

export type IcsLocale = "pt-BR" | "en";

const TEXT = {
  "pt-BR": {
    CONSULTATION: "Consulta",
    EXAM: "Exame",
    phone: "Telefone da clínica",
    prep: "Preparo",
    reminder: "Lembrete de consulta",
    calName: "MedAgenda – Consultas e exames",
  },
  en: {
    CONSULTATION: "Appointment",
    EXAM: "Exam",
    phone: "Clinic phone",
    prep: "Preparation",
    reminder: "Appointment reminder",
    calName: "MedAgenda – Appointments and exams",
  },
} as const;

export function buildSummary(a: IcsAppointment, locale: IcsLocale): string {
  const t = TEXT[locale];
  const entity = a.serviceType === "EXAM" ? a.examType : a.specialty;
  const name = entity ? (locale === "en" ? entity.nameEn : entity.namePt) : "";
  return `${t[a.serviceType]}${name ? ` – ${name}` : ""} (${a.providerName})`;
}

function toEvent(a: IcsAppointment, locale: IcsLocale): EventAttributes {
  const t = TEXT[locale];
  const prep = a.examType
    ? locale === "en"
      ? a.examType.preparationEn
      : a.examType.preparationPt
    : null;
  const description = [prep ? `${t.prep}: ${prep}` : null, `${t.phone}: ${a.clinic.phone}`]
    .filter(Boolean)
    .join("\n");
  const summary = buildSummary(a, locale);
  return {
    uid: `${a.icsUid}@medagenda`,
    sequence: a.sequence,
    start: a.startsAt.getTime(),
    startInputType: "utc",
    startOutputType: "utc",
    end: a.endsAt.getTime(),
    endInputType: "utc",
    endOutputType: "utc",
    title: summary,
    location: `${a.clinic.name}, ${a.clinic.address}`,
    description,
    status: a.status === "CANCELLED" ? "CANCELLED" : "CONFIRMED",
    productId: "medagenda",
    alarms: [
      { action: "display", description: t.reminder, trigger: { hours: 24, before: true } },
      { action: "display", description: t.reminder, trigger: { hours: 2, before: true } },
    ],
  };
}

/** Builds a VCALENDAR with one VEVENT per appointment. */
export function buildIcs(
  appointments: IcsAppointment[],
  locale: IcsLocale,
  opts: { calendarName?: boolean } = {},
): string {
  const { error, value } = createEvents(
    appointments.map((a) => toEvent(a, locale)),
    {
      calName: opts.calendarName ? TEXT[locale].calName : undefined,
    },
  );
  if (error || !value) throw new Error("ICS generation failed");
  return value;
}

/** Local calendar date (YYYY-MM-DD) of the appointment in the clinic timezone. */
export function icsFileDate(startsAt: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(startsAt);
}
