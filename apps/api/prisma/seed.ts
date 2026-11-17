// Idempotent development seed: catalog, clinics, providers, 60 days of slots, one admin and one demo patient.
// Run with `pnpm db:seed` (root) or `pnpm --filter @medagenda/api db:seed`.
// Never logs passwords, emails or other decrypted data: only counts are printed.
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PasswordSchema } from "@medagenda/shared";
import type { Prisma } from "@prisma/client";
import { isCommonPassword } from "../src/lib/common-passwords.js";
import { blindIndex, initCrypto } from "../src/lib/crypto.js";
import { hashSecret } from "../src/lib/password.js";
import { createPrisma, type PrismaClient } from "../src/lib/prisma.js";
import { toDbProfile, toDbUser } from "../src/modules/auth/mappers.js";
import { zonedToUtc } from "../src/lib/timezone.js";

export const ADMIN_EMAIL = "admin@medagenda.local";
export const DEMO_EMAIL = "paciente.demo@medagenda.local";
const TZ = "America/Sao_Paulo";
const DAY_MS = 24 * 60 * 60 * 1000;
const CONSULTATION_MIN = 30;
const WORK_START_MIN = 8 * 60;
const WORK_END_MIN = 18 * 60;
const CHUNK = 1000;

export interface SeedOptions {
  adminPassword: string;
  /** Optional. When omitted the demo patient gets a random password that is never printed. */
  demoPassword?: string | undefined;
  /** Days of slots to generate from today (clinic timezone). Default 60. */
  days?: number;
  now?: Date;
}

export interface SeedSummary {
  specialties: number;
  examTypes: number;
  clinics: number;
  providers: number;
  providerLinks: number;
  slotsCreated: number;
  slotsExisting: number;
  users: number;
}

const SPECIALTIES = [
  { slug: "clinico-geral", namePt: "Clínico Geral", nameEn: "General Practice" },
  { slug: "cardiologia", namePt: "Cardiologia", nameEn: "Cardiology" },
  { slug: "dermatologia", namePt: "Dermatologia", nameEn: "Dermatology" },
  { slug: "ginecologia", namePt: "Ginecologia", nameEn: "Gynecology" },
  { slug: "ortopedia", namePt: "Ortopedia", nameEn: "Orthopedics" },
  { slug: "pediatria", namePt: "Pediatria", nameEn: "Pediatrics" },
  { slug: "oftalmologia", namePt: "Oftalmologia", nameEn: "Ophthalmology" },
  { slug: "psiquiatria", namePt: "Psiquiatria", nameEn: "Psychiatry" },
  { slug: "endocrinologia", namePt: "Endocrinologia", nameEn: "Endocrinology" },
  { slug: "neurologia", namePt: "Neurologia", nameEn: "Neurology" },
  { slug: "otorrinolaringologia", namePt: "Otorrinolaringologia", nameEn: "Otolaryngology (ENT)" },
  { slug: "urologia", namePt: "Urologia", nameEn: "Urology" },
] as const;

const EXAM_TYPES = [
  {
    slug: "hemograma",
    namePt: "Hemograma",
    nameEn: "Complete blood count (CBC)",
    preparationPt:
      "Jejum não é obrigatório, salvo orientação médica. Traga documento com foto e o pedido médico, se houver.",
    preparationEn:
      "Fasting is not required unless your doctor says otherwise. Bring photo ID and your medical request, if you have one.",
    durationMin: 15,
  },
  {
    slug: "raio-x",
    namePt: "Raio-X",
    nameEn: "X-ray",
    preparationPt:
      "Retire objetos metálicos e joias da região examinada. Use roupas confortáveis e traga exames anteriores.",
    preparationEn:
      "Remove metal objects and jewelry from the area being examined. Wear comfortable clothes and bring previous exams.",
    durationMin: 20,
  },
  {
    slug: "ultrassom",
    namePt: "Ultrassom",
    nameEn: "Ultrasound",
    preparationPt:
      "Para ultrassom abdominal, jejum de 6 horas. Quando solicitado, chegue com a bexiga cheia. Confirme as instruções com a clínica.",
    preparationEn:
      "For abdominal ultrasound, fast for 6 hours. When requested, arrive with a full bladder. Confirm instructions with the clinic.",
    durationMin: 45,
  },
  {
    slug: "ressonancia-magnetica",
    namePt: "Ressonância magnética",
    nameEn: "Magnetic resonance imaging (MRI)",
    preparationPt:
      "Informe se possui marca-passo, implantes metálicos ou claustrofobia. Não use objetos metálicos. Traga o pedido médico.",
    preparationEn:
      "Tell us if you have a pacemaker, metal implants or claustrophobia. Do not wear metal objects. Bring your medical request.",
    durationMin: 60,
  },
  {
    slug: "eletrocardiograma",
    namePt: "Eletrocardiograma",
    nameEn: "Electrocardiogram (ECG)",
    preparationPt:
      "Não é necessário jejum. Evite cremes ou óleos no peito e use roupas que permitam acesso ao tórax.",
    preparationEn:
      "No fasting needed. Avoid creams or oils on the chest and wear clothes that allow access to the chest.",
    durationMin: 20,
  },
  {
    slug: "tomografia",
    namePt: "Tomografia computadorizada",
    nameEn: "Computed tomography (CT scan)",
    preparationPt:
      "Pode ser necessário jejum de 4 horas e uso de contraste. Informe alergias e problemas renais.",
    preparationEn:
      "Fasting for 4 hours and contrast may be required. Tell us about allergies and kidney problems.",
    durationMin: 45,
  },
  {
    slug: "glicemia-jejum",
    namePt: "Glicemia de jejum",
    nameEn: "Fasting blood glucose",
    preparationPt:
      "Jejum de 8 a 12 horas, somente água. Não interrompa medicamentos sem orientação médica.",
    preparationEn:
      "Fast for 8 to 12 hours, water only. Do not stop medication without medical advice.",
    durationMin: 15,
  },
  {
    slug: "perfil-lipidico",
    namePt: "Perfil lipídico",
    nameEn: "Lipid panel",
    preparationPt:
      "Jejum de 12 horas, somente água. Evite bebidas alcoólicas nas 24 horas anteriores.",
    preparationEn: "Fast for 12 hours, water only. Avoid alcohol in the 24 hours before.",
    durationMin: 15,
  },
  {
    slug: "espirometria",
    namePt: "Espirometria",
    nameEn: "Spirometry",
    preparationPt:
      "Não fume nas 4 horas anteriores e não use broncodilatadores sem orientação. Use roupas leves.",
    preparationEn:
      "Do not smoke for 4 hours before and do not use bronchodilators unless instructed. Wear light clothing.",
    durationMin: 40,
  },
  {
    slug: "audiometria",
    namePt: "Audiometria",
    nameEn: "Audiometry",
    preparationPt:
      "Evite ruídos intensos no dia anterior e não use fones de ouvido antes do exame.",
    preparationEn: "Avoid loud noise the day before and do not use headphones before the test.",
    durationMin: 40,
  },
] as const;

const CLINICS = [
  {
    name: "Clínica Demo Paulista",
    address: "Av. Paulista, 1000 - Bela Vista",
    city: "São Paulo",
    state: "SP",
    phone: "+55 11 4000-1000",
    lat: -23.5614,
    lng: -46.6559,
  },
  {
    name: "Clínica Demo Vila Mariana",
    address: "Rua Domingos de Morais, 2100 - Vila Mariana",
    city: "São Paulo",
    state: "SP",
    phone: "+55 11 4000-2000",
    lat: -23.5894,
    lng: -46.637,
  },
  {
    name: "Clínica Demo Copacabana",
    address: "Av. Nossa Senhora de Copacabana, 500 - Copacabana",
    city: "Rio de Janeiro",
    state: "RJ",
    phone: "+55 21 4000-3000",
    lat: -22.9836,
    lng: -43.1907,
  },
  {
    name: "Clínica Demo Savassi",
    address: "Rua Pernambuco, 1000 - Savassi",
    city: "Belo Horizonte",
    state: "MG",
    phone: "+55 31 4000-4000",
    lat: -19.935,
    lng: -43.938,
  },
] as const;

// Doctors are assigned to clinics round-robin (index % 4). CRMs are fictitious demo numbers.
const DOCTORS: ReadonlyArray<{ name: string; specialty: (typeof SPECIALTIES)[number]["slug"] }> = [
  { name: "Helena Duarte", specialty: "clinico-geral" },
  { name: "Rafael Menezes", specialty: "clinico-geral" },
  { name: "Bruno Teixeira", specialty: "cardiologia" },
  { name: "Camila Rocha", specialty: "cardiologia" },
  { name: "Juliana Prado", specialty: "dermatologia" },
  { name: "Patrícia Lima", specialty: "ginecologia" },
  { name: "Marcelo Nunes", specialty: "ortopedia" },
  { name: "Fernanda Alves", specialty: "pediatria" },
  { name: "Gustavo Ribeiro", specialty: "pediatria" },
  { name: "Renata Souza", specialty: "oftalmologia" },
  { name: "André Mendes", specialty: "psiquiatria" },
  { name: "Larissa Costa", specialty: "endocrinologia" },
  { name: "Thiago Barros", specialty: "neurologia" },
  { name: "Carolina Dias", specialty: "otorrinolaringologia" },
  { name: "Eduardo Martins", specialty: "urologia" },
];

const BIO: Record<string, { pt: string; en: string }> = {
  "clinico-geral": {
    pt: "Atendimento clínico para adultos, com foco em prevenção e acompanhamento contínuo.",
    en: "Adult primary care, focused on prevention and ongoing follow-up.",
  },
  cardiologia: {
    pt: "Avaliação e acompanhamento do coração e do sistema circulatório.",
    en: "Assessment and follow-up of the heart and circulatory system.",
  },
  dermatologia: {
    pt: "Diagnóstico e tratamento de doenças da pele, cabelos e unhas.",
    en: "Diagnosis and treatment of skin, hair and nail conditions.",
  },
  ginecologia: {
    pt: "Saúde da mulher, consultas preventivas e acompanhamento ginecológico.",
    en: "Women's health, preventive visits and gynecological follow-up.",
  },
  ortopedia: {
    pt: "Tratamento de lesões e doenças do sistema músculo-esquelético.",
    en: "Treatment of musculoskeletal injuries and conditions.",
  },
  pediatria: {
    pt: "Cuidado integral da saúde de bebês, crianças e adolescentes.",
    en: "Comprehensive care for infants, children and adolescents.",
  },
  oftalmologia: {
    pt: "Exames de visão e tratamento de doenças dos olhos.",
    en: "Vision examinations and treatment of eye conditions.",
  },
  psiquiatria: {
    pt: "Avaliação e tratamento de transtornos mentais e emocionais.",
    en: "Assessment and treatment of mental and emotional disorders.",
  },
  endocrinologia: {
    pt: "Diabetes, tireoide e outras alterações hormonais e metabólicas.",
    en: "Diabetes, thyroid and other hormonal and metabolic conditions.",
  },
  neurologia: {
    pt: "Avaliação de cefaleias, convulsões e outras doenças do sistema nervoso.",
    en: "Evaluation of headaches, seizures and other nervous system conditions.",
  },
  otorrinolaringologia: {
    pt: "Tratamento de doenças do ouvido, nariz e garganta.",
    en: "Treatment of ear, nose and throat conditions.",
  },
  urologia: {
    pt: "Saúde do trato urinário e do sistema reprodutor masculino.",
    en: "Urinary tract and male reproductive health.",
  },
};

// Each exam resource offers two exam types. Its single timeline is split: the first exam type
// takes 08:00-13:00 and the second 13:00-18:00, because slots are unique per (provider, startsAt).
const EXAM_RESOURCES: ReadonlyArray<{ name: string; exams: readonly [number, number] }> = [
  { name: "Laboratório Demo Paulista", exams: [0, 1] },
  { name: "Laboratório Demo Vila Mariana", exams: [2, 3] },
  { name: "Centro de Diagnóstico Demo Copacabana", exams: [4, 5] },
  { name: "Laboratório Demo Savassi", exams: [6, 7] },
  { name: "Laboratório Demo Copacabana II", exams: [8, 9] },
];

const SEED_CPF = "52998224725"; // sample CPF with valid check digits, used only for the demo patient

interface Window {
  examTypeId: string | null;
  specialtyId: string | null;
  serviceType: "CONSULTATION" | "EXAM";
  fromMin: number;
  toMin: number;
  durationMin: number;
}

interface PlannedProvider {
  providerId: string;
  timezone: string;
  windows: Window[];
}

/** Dates (YYYY-MM-DD, Mon-Fri) from today in `tz` for `days` calendar days. */
function businessDays(now: Date, days: number, tz: string): string[] {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const start = Date.parse(`${ymd}T00:00:00Z`);
  const out: string[] = [];
  for (let i = 0; i < days; i++) {
    const t = start + i * DAY_MS;
    const dow = new Date(t).getUTCDay();
    if (dow !== 0 && dow !== 6) out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

function planSlots(
  providers: PlannedProvider[],
  dates: string[],
  now: Date,
): Prisma.SlotCreateManyInput[] {
  const rows: Prisma.SlotCreateManyInput[] = [];
  for (const p of providers) {
    for (const date of dates) {
      for (const w of p.windows) {
        for (let m = w.fromMin; m + w.durationMin <= w.toMin; m += w.durationMin) {
          const startsAt = zonedToUtc(date, m, p.timezone);
          if (startsAt <= now) continue; // only future slots are bookable
          rows.push({
            providerId: p.providerId,
            startsAt,
            endsAt: zonedToUtc(date, m + w.durationMin, p.timezone),
            serviceType: w.serviceType,
            specialtyId: w.specialtyId,
            examTypeId: w.examTypeId,
          });
        }
      }
    }
  }
  return rows;
}

async function upsertCatalog(prisma: PrismaClient) {
  const specialtyIds = new Map<string, string>();
  for (const s of SPECIALTIES) {
    const row = await prisma.specialty.upsert({
      where: { slug: s.slug },
      create: s,
      update: { namePt: s.namePt, nameEn: s.nameEn },
    });
    specialtyIds.set(s.slug, row.id);
  }
  const examIds: string[] = [];
  for (const e of EXAM_TYPES) {
    const row = await prisma.examType.upsert({
      where: { slug: e.slug },
      create: e,
      update: { ...e },
    });
    examIds.push(row.id);
  }
  return { specialtyIds, examIds };
}

async function upsertClinics(prisma: PrismaClient): Promise<{ id: string; timezone: string }[]> {
  const out: { id: string; timezone: string }[] = [];
  for (const c of CLINICS) {
    const existing = await prisma.clinic.findFirst({ where: { name: c.name, city: c.city } });
    if (existing) {
      await prisma.clinic.update({ where: { id: existing.id }, data: { ...c, timezone: TZ } });
      out.push({ id: existing.id, timezone: TZ });
    } else {
      const created = await prisma.clinic.create({ data: { ...c, timezone: TZ } });
      out.push({ id: created.id, timezone: TZ });
    }
  }
  return out;
}

async function upsertProvider(
  prisma: PrismaClient,
  data: {
    clinicId: string;
    name: string;
    kind: "DOCTOR" | "EXAM_RESOURCE";
    bioPt: string;
    bioEn: string;
    crm?: string;
  },
): Promise<string> {
  const existing = await prisma.provider.findFirst({
    where: { clinicId: data.clinicId, name: data.name },
  });
  if (existing) {
    await prisma.provider.update({ where: { id: existing.id }, data });
    return existing.id;
  }
  return (await prisma.provider.create({ data })).id;
}

async function upsertProviders(
  prisma: PrismaClient,
  clinics: { id: string; timezone: string }[],
  specialtyIds: Map<string, string>,
  examIds: string[],
): Promise<{ planned: PlannedProvider[]; links: number; count: number }> {
  const planned: PlannedProvider[] = [];
  let links = 0;
  let count = 0;

  for (let i = 0; i < DOCTORS.length; i++) {
    const doc = DOCTORS[i] as (typeof DOCTORS)[number];
    const clinic = clinics[i % clinics.length] as { id: string; timezone: string };
    const specialtyId = specialtyIds.get(doc.specialty);
    if (!specialtyId) throw new Error(`unknown specialty ${doc.specialty}`);
    const bio = BIO[doc.specialty] as { pt: string; en: string };
    const providerId = await upsertProvider(prisma, {
      clinicId: clinic.id,
      name: doc.name,
      kind: "DOCTOR",
      crm: `DEMO-${String(i + 1).padStart(4, "0")}`,
      bioPt: bio.pt,
      bioEn: bio.en,
    });
    await prisma.providerSpecialty.createMany({
      data: [{ providerId, specialtyId }],
      skipDuplicates: true,
    });
    links += 1;
    count += 1;
    planned.push({
      providerId,
      timezone: clinic.timezone,
      windows: [
        {
          examTypeId: null,
          specialtyId,
          serviceType: "CONSULTATION",
          fromMin: WORK_START_MIN,
          toMin: WORK_END_MIN,
          durationMin: CONSULTATION_MIN,
        },
      ],
    });
  }

  for (let i = 0; i < EXAM_RESOURCES.length; i++) {
    const res = EXAM_RESOURCES[i] as (typeof EXAM_RESOURCES)[number];
    const clinic = clinics[i % clinics.length] as { id: string; timezone: string };
    const providerId = await upsertProvider(prisma, {
      clinicId: clinic.id,
      name: res.name,
      kind: "EXAM_RESOURCE",
      bioPt: "Unidade de exames com equipamentos de diagnóstico.",
      bioEn: "Diagnostic exam unit with imaging and lab equipment.",
    });
    const examTypeIds = res.exams.map((idx) => examIds[idx] as string);
    await prisma.providerExam.createMany({
      data: examTypeIds.map((examTypeId) => ({ providerId, examTypeId })),
      skipDuplicates: true,
    });
    links += examTypeIds.length;
    count += 1;

    const mid = (WORK_START_MIN + WORK_END_MIN) / 2;
    const halves: [number, number][] = [
      [WORK_START_MIN, mid],
      [mid, WORK_END_MIN],
    ];
    const windows: Window[] = examTypeIds.map((examTypeId, idx) => {
      const exam = EXAM_TYPES[res.exams[idx] as number] as (typeof EXAM_TYPES)[number];
      const [fromMin, toMin] = halves[idx] as [number, number];
      return {
        examTypeId,
        specialtyId: null,
        serviceType: "EXAM",
        fromMin,
        toMin,
        durationMin: exam.durationMin,
      };
    });
    planned.push({ providerId, timezone: clinic.timezone, windows });
  }

  return { planned, links, count };
}

async function ensureAdmin(prisma: PrismaClient, password: string, now: Date): Promise<void> {
  const emailHash = blindIndex(ADMIN_EMAIL, "email");
  const existing = await prisma.user.findUnique({
    where: { emailHash },
    select: { id: true, emailVerifiedAt: true },
  });
  if (existing) {
    // Password is never rotated by the seed; only the role and verification state are enforced.
    await prisma.user.update({
      where: { id: existing.id },
      data: { role: "ADMIN", emailVerifiedAt: existing.emailVerifiedAt ?? now },
    });
    return;
  }
  // TOTP is deliberately not seeded: requireRole('ADMIN') needs the admin to enroll 2FA (see README).
  await prisma.user.create({
    data: {
      ...toDbUser({
        email: ADMIN_EMAIL,
        passwordHash: await hashSecret(password),
        locale: "pt-BR",
      }),
      role: "ADMIN",
      emailVerifiedAt: now,
    },
  });
}

async function ensureDemoPatient(prisma: PrismaClient, password: string, now: Date): Promise<void> {
  const emailHash = blindIndex(DEMO_EMAIL, "email");
  const existing = await prisma.user.findUnique({
    where: { emailHash },
    select: { id: true, emailVerifiedAt: true },
  });
  let userId: string;
  if (existing) {
    userId = existing.id;
    await prisma.user.update({
      where: { id: userId },
      data: { emailVerifiedAt: existing.emailVerifiedAt ?? now },
    });
  } else {
    const user = await prisma.user.create({
      data: {
        ...toDbUser({
          email: DEMO_EMAIL,
          passwordHash: await hashSecret(password),
          locale: "pt-BR",
        }),
        emailVerifiedAt: now,
      },
    });
    userId = user.id;
  }
  const profile = toDbProfile(
    {
      fullName: "Paciente Demonstração",
      cpf: SEED_CPF,
      birthDate: "1990-05-01",
      phone: "+55 11 99999-0000",
    },
    now,
  );
  await prisma.patientProfile.upsert({
    where: { userId },
    create: { ...profile, user: { connect: { id: userId } } },
    update: {},
  });
}

/**
 * Seeds the database. Safe to run repeatedly: catalog rows are upserted by slug, clinics and
 * providers are matched by name, links use skipDuplicates and slots are unique per (provider, startsAt).
 */
export async function seed(prisma: PrismaClient, opts: SeedOptions): Promise<SeedSummary> {
  const now = opts.now ?? new Date();
  const days = opts.days ?? 60;

  const { specialtyIds, examIds } = await upsertCatalog(prisma);
  const clinics = await upsertClinics(prisma);
  const providers = await upsertProviders(prisma, clinics, specialtyIds, examIds);

  const rows = planSlots(providers.planned, businessDays(now, days, TZ), now);
  let slotsCreated = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const res = await prisma.slot.createMany({
      data: rows.slice(i, i + CHUNK),
      skipDuplicates: true,
    });
    slotsCreated += res.count;
  }

  await ensureAdmin(prisma, opts.adminPassword, now);
  const demoPassword = opts.demoPassword ?? randomBytes(24).toString("base64url");
  await ensureDemoPatient(prisma, demoPassword, now);

  return {
    specialties: await prisma.specialty.count(),
    examTypes: await prisma.examType.count(),
    clinics: await prisma.clinic.count(),
    providers: await prisma.provider.count(),
    providerLinks: providers.links,
    slotsCreated,
    slotsExisting: rows.length - slotsCreated,
    users: await prisma.user.count(),
  };
}

function requirePassword(name: string, value: string | undefined): string {
  if (!value) throw new Error(`${name} is required (see .env.example)`);
  // Same policy as registration. The value itself is never echoed in errors.
  if (!PasswordSchema.safeParse(value).success || isCommonPassword(value)) {
    throw new Error(`${name} must be at least 10 characters and not a common password`);
  }
  return value;
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");
  const adminPassword = requirePassword("SEED_ADMIN_PASSWORD", process.env.SEED_ADMIN_PASSWORD);
  const demoPassword = process.env.SEED_DEMO_PASSWORD
    ? requirePassword("SEED_DEMO_PASSWORD", process.env.SEED_DEMO_PASSWORD)
    : undefined;
  initCrypto(process.env); // fail fast on missing or malformed encryption keys

  const prisma = createPrisma(databaseUrl);
  try {
    const s = await seed(prisma, { adminPassword, demoPassword });
    console.log(
      `Seed complete: specialties=${s.specialties} examTypes=${s.examTypes} clinics=${s.clinics} ` +
        `providers=${s.providers} providerLinks=${s.providerLinks} users=${s.users} ` +
        `slotsCreated=${s.slotsCreated} slotsAlreadyPresent=${s.slotsExisting}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

// Run only when executed directly (not when imported by tests).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err: unknown) => {
    // Print the error message only: it never contains the passwords (they are not interpolated).
    console.error(err instanceof Error ? err.message : "seed failed");
    process.exit(1);
  });
}
