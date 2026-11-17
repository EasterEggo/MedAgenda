import { randomBytes } from "node:crypto";

const b64 = () => randomBytes(32).toString("base64");

// Intentionally prints fresh secrets to stdout so they can be pasted into .env.
console.log(`DATA_KEYS={"1":"${b64()}"}`);
console.log("DATA_KEY_CURRENT=1");
console.log(`BLIND_INDEX_KEY=${b64()}`);
