import { randomBytes } from "node:crypto";
import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from "fastify";
import { generateSync } from "otplib";
import { buildApp } from "../src/app.js";
import { blindIndex } from "../src/lib/crypto.js";
import { loadConfig, type ApiConfig } from "../src/config.js";
import { createMemoryMailer } from "../src/lib/mailer.js";
import { createPrisma, type PrismaClient } from "../src/lib/prisma.js";

export const PASSWORD = "correct horse battery staple";

export interface TestEnv {
  app: FastifyInstance;
  prisma: PrismaClient;
  mailer: ReturnType<typeof createMemoryMailer>;
  config: ApiConfig;
  close(): Promise<void>;
}

export async function createTestEnv(
  overrides: Partial<NodeJS.ProcessEnv> = {},
  configure?: (app: FastifyInstance) => void | Promise<void>,
  logStream?: { write(line: string): void },
): Promise<TestEnv> {
  const config = loadConfig({ ...process.env, ...overrides });
  const prisma = createPrisma(config.DATABASE_URL);
  const mailer = createMemoryMailer();
  const app = await buildApp({
    logger: false,
    config,
    prisma,
    mailer,
    ...(logStream ? { logStream } : {}),
  });
  await configure?.(app);
  await app.ready();
  return {
    app,
    prisma,
    mailer,
    config,
    async close() {
      await app.close();
      await prisma.$disconnect();
    },
  };
}

export const uniqueEmail = () => `user-${randomBytes(6).toString("hex")}@example.com`;

export function registerBody(email: string, extra: Record<string, unknown> = {}) {
  return {
    email,
    password: PASSWORD,
    fullName: "Ana Silva",
    birthDate: "1990-05-01",
    phone: "+55 11 99999-0000",
    locale: "en",
    consentLgpd: true,
    ...extra,
  };
}

/** Minimal cookie-jar client around fastify.inject. */
export class Client {
  cookies = new Map<string, string>();
  csrf: string | undefined;
  bearer: string | undefined;
  constructor(
    private env: TestEnv,
    public ip = `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
  ) {}

  async request(
    method: InjectOptions["method"],
    url: string,
    body?: unknown,
    opts: { csrf?: boolean; headers?: Record<string, string> } = {},
  ): Promise<LightMyRequestResponse> {
    const headers: Record<string, string> = { ...opts.headers };
    if (this.cookies.size > 0) {
      headers.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    }
    if (this.bearer) headers.authorization = `Bearer ${this.bearer}`;
    if (this.csrf && opts.csrf !== false) headers["x-csrf-token"] = this.csrf;
    const res = await this.env.app.inject({
      method,
      url: `/api/v1${url}`,
      payload: body as object | undefined,
      headers,
      remoteAddress: this.ip,
    });
    for (const c of res.cookies) {
      if (c.value === "" || (c.maxAge !== undefined && c.maxAge <= 0)) this.cookies.delete(c.name);
      else this.cookies.set(c.name, c.value);
    }
    return res;
  }

  post(url: string, body?: unknown, opts?: { csrf?: boolean; headers?: Record<string, string> }) {
    return this.request("POST", url, body ?? {}, opts);
  }
  get(url: string) {
    return this.request("GET", url);
  }
  delete(url: string, body?: unknown, opts?: { csrf?: boolean }) {
    return this.request("DELETE", url, body, opts);
  }

  /** Logs in as a web client and stores the CSRF token. */
  async login(email: string, password = PASSWORD) {
    const res = await this.post("/auth/login", { email, password }, { csrf: false });
    if (res.statusCode === 200) this.csrf = res.json().csrfToken;
    return res;
  }
}

/** Registers + verifies a user using the memory mailer; returns the email. */
export async function createVerifiedUser(env: TestEnv, extra: Record<string, unknown> = {}) {
  const email = uniqueEmail();
  const c = new Client(env);
  const res = await c.post("/auth/register", registerBody(email, extra));
  if (res.statusCode !== 202) throw new Error(`register failed ${res.statusCode}`);
  const token = lastToken(env, email);
  const v = await c.post("/auth/verify-email", { token });
  if (v.statusCode !== 200) throw new Error("verify failed");
  return { email };
}

export function lastToken(env: TestEnv, email: string): string {
  const msgs = env.mailer.outbox.filter((m) => m.to === email);
  const last = msgs[msgs.length - 1];
  const match = last && /token=([^\s&]+)/.exec(last.text);
  if (!match?.[1]) throw new Error("no token email found");
  return decodeURIComponent(match[1]);
}

export const totp = (secret: string, offsetSeconds = 0) =>
  generateSync({ secret, epoch: Math.floor(Date.now() / 1000) + offsetSeconds });

/**
 * Enables TOTP for a logged-in client. Afterwards the replay guard is rewound so tests can reuse
 * the current code for a fresh login (real users would wait for the next 30 s step).
 */
export async function enableMfa(env: TestEnv, c: Client, email: string) {
  const setup = await c.post("/auth/mfa/setup");
  expectStatus(setup, 200);
  const uri = new URL(setup.json().otpauthUri as string);
  const secret = uri.searchParams.get("secret") as string;
  const enable = await c.post("/auth/mfa/enable", { code: totp(secret) });
  expectStatus(enable, 200);
  await rewindReplayGuard(env, email);
  return { secret, recoveryCodes: enable.json().recoveryCodes as string[] };
}

export async function rewindReplayGuard(env: TestEnv, email: string) {
  await env.prisma.user.update({
    where: { emailHash: blindIndex(email, "email") },
    data: { totpLastStep: null },
  });
}

export const findUser = (env: TestEnv, email: string) =>
  env.prisma.user.findUniqueOrThrow({ where: { emailHash: blindIndex(email, "email") } });

export function expectStatus(res: LightMyRequestResponse, status: number) {
  if (res.statusCode !== status)
    throw new Error(`expected ${status} got ${res.statusCode}: ${res.body}`);
}

export const errorCode = (res: LightMyRequestResponse): string => res.json().error.code;
