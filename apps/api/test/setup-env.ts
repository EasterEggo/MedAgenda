import { randomBytes } from "node:crypto";
import { TEST_DATABASE_URL } from "./test-db.js";

// Per-run random test keys; nothing secret is committed.
const b64 = () => randomBytes(32).toString("base64");
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.DATA_KEYS = JSON.stringify({ "1": b64() });
process.env.DATA_KEY_CURRENT = "1";
process.env.BLIND_INDEX_KEY = b64();
process.env.COOKIE_SECRET = randomBytes(48).toString("base64url");
process.env.AUTH_RATE_LIMIT_MAX = "1000";
