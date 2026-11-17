import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { TEST_DATABASE_URL } from "./test-db.js";

export default async function setup(): Promise<void> {
  const schema = new URL(TEST_DATABASE_URL).searchParams.get("schema");
  if (!schema || !/^[a-z_][a-z0-9_]*$/.test(schema) || schema === "public") {
    throw new Error(
      "TEST_DATABASE_URL must use a dedicated non-public schema, e.g. ?schema=medagenda_test",
    );
  }
  const prisma = new PrismaClient({ datasourceUrl: TEST_DATABASE_URL });
  try {
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  } finally {
    await prisma.$disconnect();
  }
  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    cwd: new URL("..", import.meta.url).pathname,
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: "pipe",
  });
}
