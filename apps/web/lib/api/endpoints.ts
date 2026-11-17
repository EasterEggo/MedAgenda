import type { Locale, LoginResponse, RegisterInput } from "@medagenda/shared";
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
