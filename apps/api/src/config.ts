import { z } from "zod";
import { initCrypto } from "./lib/crypto.js";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_HOST: z.string().min(1).default("127.0.0.1"),
  API_PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().min(1),
  WEB_URL: z.string().url().default("http://localhost:3000"),
  PUBLIC_API_URL: z.string().url().default("http://localhost:3001"),
  CORS_ORIGINS: z.string().default("http://localhost:3000"),
  TRUST_PROXY: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  COOKIE_SECRET: z.string().min(32, "COOKIE_SECRET must be at least 32 characters"),
  SMTP_HOST: z.string().min(1).default("localhost"),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  SMTP_FROM: z.string().min(3).default("MedAgenda <no-reply@medagenda.local>"),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
});

export type ApiConfig = Omit<z.infer<typeof EnvSchema>, "CORS_ORIGINS"> & {
  CORS_ORIGINS: string[];
};

/**
 * Validates the environment and loads the field-encryption keys (DATA_KEYS, DATA_KEY_CURRENT,
 * BLIND_INDEX_KEY). Throws on any missing or malformed value so the API fails fast at startup.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const parsed = EnvSchema.parse(env);
  initCrypto(env);
  return {
    ...parsed,
    CORS_ORIGINS: parsed.CORS_ORIGINS.split(",")
      .map((o) => o.trim())
      .filter(Boolean),
  };
}
