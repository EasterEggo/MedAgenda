export const ADMIN_SECTIONS = ["specialties", "exams", "clinics", "providers", "slots"] as const;
export type AdminSection = (typeof ADMIN_SECTIONS)[number];
