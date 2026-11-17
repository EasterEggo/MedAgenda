// Integration tests run in a dedicated Postgres schema so they never touch dev data.
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://medagenda:change-me-local-only@localhost:5432/medagenda?schema=medagenda_test";
