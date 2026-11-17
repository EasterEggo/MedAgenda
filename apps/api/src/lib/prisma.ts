import { PrismaClient } from "@prisma/client";

export type { Prisma } from "@prisma/client";
export { PrismaClient };

export function createPrisma(databaseUrl: string): PrismaClient {
  return new PrismaClient({ datasourceUrl: databaseUrl });
}
