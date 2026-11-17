import type {
  AppointmentStatus,
  Locale,
  LoginResponse,
  RegisterInput,
  ServiceType,
} from "@medagenda/shared";
import { apiV1Url } from "../config";
import { createApiClient } from "./client";

export const api = createApiClient({ baseUrl: apiV1Url });

export interface MeResponse {
  id: string;
  email: string;
  locale: Locale;
  role: "PATIENT" | "ADMIN";
  emailVerifiedAt: string | null;
  totpEnabled: boolean;
  createdAt: string;
  profile: Profile | null;
}

export interface Profile {
  fullName: string;
  cpf: string | null;
  birthDate: string;
  phone: string;
  healthInsurance: string | null;
  consentLgpdAt: string | null;
  consentVersion: string | null;
}

export interface UpdateProfileInput {
  fullName?: string;
  birthDate?: string;
  phone?: string;
  healthInsurance?: string | null;
}

export interface SessionInfo {
  id: string;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  userAgent: string | null;
  mfaPassed: boolean;
  current: boolean;
}

/** Cursor page as returned by every list endpoint. */
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface Specialty {
  id: string;
  slug: string;
  namePt: string;
  nameEn: string;
}

export interface ExamType {
  id: string;
  slug: string;
  namePt: string;
  nameEn: string;
  preparationPt: string;
  preparationEn: string;
  durationMin: number;
}

export interface Clinic {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  phone: string;
  timezone: string;
  lat: number | null;
  lng: number | null;
}

export interface Provider {
  id: string;
  clinicId: string;
  name: string;
  crm: string | null;
  kind: "DOCTOR" | "EXAM_RESOURCE";
  bioPt: string | null;
  bioEn: string | null;
  clinic: { id: string; name: string; city: string; timezone: string };
  specialtyIds: string[];
  examTypeIds: string[];
}

/** Open slot as returned by GET /slots. */
export interface Slot {
  id: string;
  providerId: string;
  startsAt: string;
  endsAt: string;
  serviceType: ServiceType;
  specialtyId: string | null;
  examTypeId: string | null;
  status: "OPEN" | "BOOKED" | "BLOCKED";
  provider: { id: string; name: string; kind: "DOCTOR" | "EXAM_RESOURCE" };
  clinic: { id: string; name: string; city: string; timezone: string };
}

export interface SlotsParams {
  serviceType?: ServiceType;
  specialtyId?: string;
  examTypeId?: string;
  clinicId?: string;
  providerId?: string;
  /** ISO 8601 with offset. The API rejects ranges above 31 days. */
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
}

/** Appointment DTO. `notes` is present only on GET /appointments/:id and on booking responses. */
export interface Appointment {
  id: string;
  status: AppointmentStatus;
  slotId: string;
  startsAt: string;
  endsAt: string;
  serviceType: ServiceType;
  specialty: { id: string; namePt: string; nameEn: string } | null;
  examType: {
    id: string;
    namePt: string;
    nameEn: string;
    preparationPt: string;
    preparationEn: string;
  } | null;
  provider: { id: string; name: string; kind: "DOCTOR" | "EXAM_RESOURCE" };
  clinic: {
    id: string;
    name: string;
    address: string;
    city: string;
    phone: string;
    timezone: string;
  };
  notes?: string | null;
  sequence: number;
  createdAt: string;
  cancelledAt: string | null;
}

export interface AppointmentListParams {
  from?: string;
  to?: string;
  status?: AppointmentStatus;
  cursor?: string;
  limit?: number;
}

export const authApi = {
  register: (input: RegisterInput) => api.post<{ ok: true }>("/auth/register", input),
  verifyEmail: (token: string) => api.post<{ ok: true }>("/auth/verify-email", { token }),
  resendVerification: (email: string) =>
    api.post<{ ok: true }>("/auth/resend-verification", { email }),
  async login(email: string, password: string): Promise<LoginResponse> {
    const result = await api.post<LoginResponse>("/auth/login", { email, password });
    api.setCsrfToken(result.csrfToken ?? null);
    return result;
  },
  verifyMfa: (input: { code: string } | { recoveryCode: string }) =>
    api.post<{ ok: true }>("/auth/mfa/verify", input),
  async logout() {
    await api.post<{ ok: true }>("/auth/logout");
    api.setCsrfToken(null);
  },
  forgot: (email: string) => api.post<{ ok: true }>("/auth/forgot", { email }),
  reset: (token: string, password: string) =>
    api.post<{ ok: true }>("/auth/reset", { token, password }),
};

export const meApi = {
  get: () => api.get<MeResponse>("/me"),
  update: (input: UpdateProfileInput) => api.patch<MeResponse>("/me", input),
  updateLocale: (locale: Locale) => api.patch<{ locale: Locale }>("/me/locale", { locale }),
  /** LGPD export (decrypted JSON), as a downloadable blob. */
  exportData: () => api.download("/me/export"),
  deleteAccount: (password: string) => api.delete<{ ok: true }>("/me", { password }),
};

export const mfaApi = {
  setup: () => api.post<{ otpauthUri: string; qrDataUrl: string }>("/auth/mfa/setup"),
  enable: (code: string) => api.post<{ recoveryCodes: string[] }>("/auth/mfa/enable", { code }),
  disable: (input: { password: string; code: string }) =>
    api.post<{ ok: true }>("/auth/mfa/disable", input),
};

export const sessionsApi = {
  list: () => api.get<{ sessions: SessionInfo[] }>("/auth/sessions"),
  revoke: (id: string) => api.delete<{ ok: true }>(`/auth/sessions/${encodeURIComponent(id)}`),
};

export const catalogApi = {
  specialties: (cursor?: string) =>
    api.get<Page<Specialty>>("/catalog/specialties", { query: { cursor, limit: 200 } }),
  exams: (cursor?: string) =>
    api.get<Page<ExamType>>("/catalog/exams", { query: { cursor, limit: 200 } }),
  clinics: (cursor?: string) =>
    api.get<Page<Clinic>>("/catalog/clinics", { query: { cursor, limit: 200 } }),
  providers: (params: {
    specialtyId?: string;
    examTypeId?: string;
    clinicId?: string;
    cursor?: string;
  }) => api.get<Page<Provider>>("/catalog/providers", { query: { ...params, limit: 200 } }),
  slots: (params: SlotsParams) => api.get<Page<Slot>>("/slots", { query: { ...params } }),
};

export const appointmentsApi = {
  list: (params: AppointmentListParams = {}) =>
    api.get<Page<Appointment>>("/appointments", { query: { ...params } }),
  get: (id: string) => api.get<Appointment>(`/appointments/${encodeURIComponent(id)}`),
  book: (input: { slotId: string; notes?: string }) =>
    api.post<Appointment>("/appointments", input),
  reschedule: (id: string, newSlotId: string) =>
    api.patch<Appointment>(`/appointments/${encodeURIComponent(id)}/reschedule`, { newSlotId }),
  cancel: (id: string) => api.post<Appointment>(`/appointments/${encodeURIComponent(id)}/cancel`),
  downloadIcs: (id: string) => api.download(`/appointments/${encodeURIComponent(id)}/ics`),
};

export const calendarApi = {
  /** Creates the subscription URL. Calling it again rotates the token and invalidates the old URL. */
  createFeed: () => api.post<{ url: string }>("/calendar/feed"),
  revokeFeed: () => api.delete<void>("/calendar/feed"),
};

export type AdminEntity = "specialties" | "exams" | "clinics" | "providers";

export interface AdminSlot {
  id: string;
  providerId: string;
  startsAt: string;
  endsAt: string;
  serviceType: ServiceType;
  specialtyId: string | null;
  examTypeId: string | null;
  status: "OPEN" | "BOOKED" | "BLOCKED";
}

export interface GenerateSlotsInput {
  providerId: string;
  weekdays: number[];
  startTime: string;
  endTime: string;
  durationMin: number;
  from: string;
  to: string;
  serviceType: ServiceType;
  specialtyId?: string;
  examTypeId?: string;
}

export const adminApi = {
  create: (entity: AdminEntity, body: unknown) =>
    api.post<{ id: string }>(`/admin/${entity}`, body),
  update: (entity: AdminEntity, id: string, body: unknown) =>
    api.patch<{ id: string }>(`/admin/${entity}/${encodeURIComponent(id)}`, body),
  remove: (entity: AdminEntity, id: string) =>
    api.delete<void>(`/admin/${entity}/${encodeURIComponent(id)}`),
  generateSlots: (input: GenerateSlotsInput) =>
    api.post<{ requested: number; created: number; skipped: number }>(
      "/admin/slots/generate",
      input,
    ),
  slots: (params: { providerId: string; from: string; to: string; cursor?: string }) =>
    api.get<Page<AdminSlot>>("/admin/slots", { query: { ...params, limit: 200 } }),
  setSlotStatus: (id: string, status: "OPEN" | "BLOCKED") =>
    api.patch<AdminSlot>(`/admin/slots/${encodeURIComponent(id)}`, { status }),
};
