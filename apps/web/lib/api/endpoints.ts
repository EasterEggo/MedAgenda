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
  profile: Record<string, unknown> | null;
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
  updateLocale: (locale: Locale) => api.patch<{ locale: Locale }>("/me/locale", { locale }),
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
};
