import { describe, expect, it } from "vitest";
import { buildBookingConfirmation } from "../src/modules/appointments/emails.js";
import { buildEmail } from "../src/modules/auth/emails.js";
import { buildIcs, type IcsAppointment } from "../src/modules/calendar/ics.js";

const LINK = "https://web.example.test/pt-BR/verify-email?token=abc123";

describe("auth email templates", () => {
  const cases = [
    { kind: "verify", pt: "Confirme seu e-mail", en: "Confirm your email" },
    { kind: "reset", pt: "Redefinição de senha", en: "Password reset" },
    { kind: "alreadyRegistered", pt: "Você já tem uma conta", en: "You already have an account" },
  ] as const;

  for (const { kind, pt, en } of cases) {
    it(`${kind}: subjects and bodies are translated per locale`, () => {
      const ptMail = buildEmail(kind, "pt-BR", "ana@example.test", LINK);
      const enMail = buildEmail(kind, "en", "ana@example.test", LINK);
      expect(ptMail.subject).toContain(pt);
      expect(enMail.subject).toContain(en);
      expect(ptMail.subject).toContain("MedAgenda");
      expect(enMail.subject).toContain("MedAgenda");
      expect(ptMail.text).toContain(LINK);
      expect(enMail.text).toContain(LINK);
      expect(ptMail.text).not.toEqual(enMail.text);
    });

    it(`${kind}: no unfilled placeholders in either locale`, () => {
      for (const locale of ["pt-BR", "en"] as const) {
        const mail = buildEmail(kind, locale, "ana@example.test", LINK);
        expect(`${mail.subject}\n${mail.text}`).not.toMatch(/\{\w+\}/);
      }
    });
  }

  it("uses the requested recipient", () => {
    expect(buildEmail("verify", "en", "to@example.test", LINK).to).toBe("to@example.test");
  });
});

describe("booking confirmation template", () => {
  const base = {
    serviceType: "CONSULTATION" as const,
    serviceName: "Cardiologia",
    providerName: "Dr. Carlos Lima",
    clinicName: "Clínica Vida",
    clinicAddress: "Rua A, 100, São Paulo",
    timezone: "America/Sao_Paulo",
    // 13:00 UTC on a Tuesday is 10:00 in São Paulo.
    startsAt: new Date("2026-12-01T13:00:00Z"),
    preparation: null,
  };

  it("pt-BR: subject, service, local time and clinic", () => {
    const mail = buildBookingConfirmation("pt-BR", "ana@example.test", base, LINK);
    expect(mail.subject).toBe("Seu agendamento está confirmado – MedAgenda");
    expect(mail.text).toContain("Consulta – Cardiologia (Dr. Carlos Lima)");
    expect(mail.text).toContain("terça-feira, 1 de dezembro de 2026");
    expect(mail.text).toContain("10:00");
    expect(mail.text).toContain("Clínica Vida, Rua A, 100, São Paulo");
    expect(mail.text).toContain(LINK);
    expect(mail.text).not.toMatch(/\{\w+\}/);
  });

  it("en: subject, service, local time and clinic", () => {
    const mail = buildBookingConfirmation(
      "en",
      "ana@example.test",
      { ...base, serviceName: "Cardiology" },
      LINK,
    );
    expect(mail.subject).toBe("Your appointment is confirmed – MedAgenda");
    expect(mail.text).toContain("Consultation – Cardiology (Dr. Carlos Lima)");
    expect(mail.text).toContain("Tuesday, December 1, 2026");
    expect(mail.text).toContain("10:00");
    expect(mail.text).toContain("Clínica Vida, Rua A, 100, São Paulo");
    expect(mail.text).toContain(LINK);
    expect(mail.text).not.toMatch(/\{\w+\}/);
  });

  it("exam with preparation: the preparation line uses the locale", () => {
    const exam = {
      ...base,
      serviceType: "EXAM" as const,
      serviceName: "Hemograma",
      preparation: "Jejum de 8 horas.",
    };
    const pt = buildBookingConfirmation("pt-BR", "a@example.test", exam, LINK);
    expect(pt.text).toContain("Exame – Hemograma (Dr. Carlos Lima)");
    expect(pt.text).toContain("Preparo: Jejum de 8 horas.");
    const en = buildBookingConfirmation(
      "en",
      "a@example.test",
      {
        ...exam,
        serviceName: "Blood count",
        preparation: "Fast for 8 hours.",
      },
      LINK,
    );
    expect(en.text).toContain("Exam – Blood count (Dr. Carlos Lima)");
    expect(en.text).toContain("Preparation: Fast for 8 hours.");
  });

  it("without a service name it falls back to the type and professional", () => {
    const pt = buildBookingConfirmation(
      "pt-BR",
      "a@example.test",
      { ...base, serviceName: null },
      LINK,
    );
    const en = buildBookingConfirmation(
      "en",
      "a@example.test",
      { ...base, serviceName: null },
      LINK,
    );
    expect(pt.text).toContain("Consulta (Dr. Carlos Lima)");
    expect(en.text).toContain("Consultation (Dr. Carlos Lima)");
  });

  it("omits the preparation line when there is none", () => {
    const en = buildBookingConfirmation("en", "a@example.test", base, LINK);
    expect(en.text).not.toContain("Preparation:");
  });
});

describe("ICS summaries use the shared ics catalog", () => {
  const appt: IcsAppointment = {
    icsUid: "11111111-2222-3333-4444-555555555555",
    sequence: 0,
    status: "SCHEDULED",
    startsAt: new Date("2030-03-04T17:30:00Z"),
    endsAt: new Date("2030-03-04T18:00:00Z"),
    serviceType: "EXAM",
    specialty: null,
    examType: {
      namePt: "Hemograma",
      nameEn: "Blood count",
      preparationPt: "Jejum de 8 horas.",
      preparationEn: "Fast for 8 hours.",
    },
    providerName: "Lab Central",
    clinic: {
      name: "Clínica Vida",
      address: "Rua A, 100, São Paulo",
      phone: "11 5555-0000",
      timezone: "America/Sao_Paulo",
    },
  };

  it("localises the summary, description and reminders", () => {
    const pt = buildIcs([appt], "pt-BR");
    expect(pt).toContain("SUMMARY:Exame – Hemograma (Lab Central)");
    expect(pt).toContain("Preparo: Jejum de 8 horas.");
    expect(pt).toContain("Telefone da clínica: 11 5555-0000");
    expect(pt).toContain("DESCRIPTION:Lembrete de consulta");
    const en = buildIcs([appt], "en");
    expect(en).toContain("SUMMARY:Exam – Blood count (Lab Central)");
    expect(en).toContain("Preparation: Fast for 8 hours.");
    expect(en).toContain("Clinic phone: 11 5555-0000");
    expect(en).toContain("DESCRIPTION:Appointment reminder");
  });
});
