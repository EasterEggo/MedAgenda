import type { Session, User } from "@prisma/client";
import type { ApiConfig } from "./config.js";
import type { Mailer } from "./lib/mailer.js";
import type { PrismaClient } from "./lib/prisma.js";

export interface AuthContext {
  session: Session;
  user: User;
  via: "cookie" | "bearer";
}

declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClient;
    mailer: Mailer;
    config: ApiConfig;
  }
  interface FastifyRequest {
    auth?: AuthContext;
  }
}
