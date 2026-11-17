import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const VERSION_BYTES = 1;

export interface CryptoEnv {
  DATA_KEYS?: string | undefined;
  DATA_KEY_CURRENT?: string | undefined;
  BLIND_INDEX_KEY?: string | undefined;
}

export type BlindIndexPurpose = "email" | "cpf" | "ip";

function decodeKey(value: unknown, label: string): Buffer {
  if (typeof value !== "string") throw new Error(`${label} must be a base64 string`);
  const key = Buffer.from(value, "base64");
  if (key.length !== KEY_BYTES) throw new Error(`${label} must decode to ${KEY_BYTES} bytes`);
  return key;
}

function parseDataKeys(raw: string | undefined): Map<number, Buffer> {
  if (!raw) throw new Error("DATA_KEYS is not set");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("DATA_KEYS must be valid JSON");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("DATA_KEYS must be a JSON object of version to base64 key");
  }
  const keys = new Map<number, Buffer>();
  for (const [version, value] of Object.entries(parsed)) {
    const v = Number(version);
    if (!Number.isInteger(v) || v < 0 || v > 255) {
      throw new Error(`DATA_KEYS version "${version}" must be an integer 0-255`);
    }
    keys.set(v, decodeKey(value, `DATA_KEYS["${version}"]`));
  }
  return keys;
}

export interface Crypto {
  encrypt(plaintext: string, aad: string): Buffer<ArrayBuffer>;
  decrypt(data: Buffer, aad: string): string;
  blindIndex(value: string, purpose: BlindIndexPurpose): string;
}

/** Builds a crypto instance from explicit env values (keeps it testable). */
export function createCrypto(env: CryptoEnv): Crypto {
  const keys = parseDataKeys(env.DATA_KEYS);
  const current = Number(env.DATA_KEY_CURRENT);
  const currentKey = keys.get(current);
  if (!Number.isInteger(current) || !currentKey) {
    throw new Error("DATA_KEY_CURRENT must reference a version present in DATA_KEYS");
  }
  if (!env.BLIND_INDEX_KEY) throw new Error("BLIND_INDEX_KEY is not set");
  const blindKey = decodeKey(env.BLIND_INDEX_KEY, "BLIND_INDEX_KEY");

  return {
    encrypt(plaintext, aad) {
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv(ALGORITHM, currentKey, iv);
      cipher.setAAD(Buffer.from(aad, "utf8"));
      const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
      return Buffer.concat([Buffer.from([current]), iv, ciphertext, cipher.getAuthTag()]);
    },

    decrypt(data, aad) {
      if (data.length < VERSION_BYTES + IV_BYTES + TAG_BYTES)
        throw new Error("Ciphertext too short");
      const version = data[0] as number;
      const key = keys.get(version);
      if (!key) throw new Error(`Unknown data key version ${version}`);
      const iv = data.subarray(VERSION_BYTES, VERSION_BYTES + IV_BYTES);
      const tag = data.subarray(data.length - TAG_BYTES);
      const ciphertext = data.subarray(VERSION_BYTES + IV_BYTES, data.length - TAG_BYTES);
      const decipher = createDecipheriv(ALGORITHM, key, iv);
      decipher.setAAD(Buffer.from(aad, "utf8"));
      decipher.setAuthTag(tag);
      // final() throws if the tag does not verify (tamper, wrong AAD or wrong key).
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    },

    blindIndex(value, purpose) {
      const normalized = normalizeForIndex(value, purpose);
      // Purpose is mixed into the MAC so the same input differs across purposes.
      return createHmac("sha256", blindKey)
        .update(`${purpose}:${normalized}`, "utf8")
        .digest("hex");
    },
  };
}

export function normalizeForIndex(value: string, purpose: BlindIndexPurpose): string {
  if (purpose === "cpf") return value.replace(/\D/g, "");
  return purpose === "email" ? value.trim().toLowerCase() : value.trim();
}

let instance: Crypto | undefined;

function getDefault(): Crypto {
  instance ??= createCrypto(process.env);
  return instance;
}

/** Validates the key material and installs it as the process-wide instance. Called from loadConfig at startup. */
export function initCrypto(env: CryptoEnv): void {
  instance = createCrypto(env);
}

/** Test helper: drop the cached instance so env changes are re-read. */
export function resetCryptoForTests(): void {
  instance = undefined;
}

export function encrypt(plaintext: string, aad: string): Buffer<ArrayBuffer> {
  return getDefault().encrypt(plaintext, aad);
}

export function decrypt(data: Buffer, aad: string): string {
  return getDefault().decrypt(data, aad);
}

export function blindIndex(value: string, purpose: BlindIndexPurpose): string {
  return getDefault().blindIndex(value, purpose);
}

/** Constant-time comparison for hex digests. */
export function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && timingSafeEqual(x, y);
}
