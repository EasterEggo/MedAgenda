import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createCrypto } from "../src/lib/crypto.js";

const k = () => randomBytes(32).toString("base64");
const blind = k();
const key1 = k();
const key2 = k();

const c1 = createCrypto({
  DATA_KEYS: JSON.stringify({ "1": key1 }),
  DATA_KEY_CURRENT: "1",
  BLIND_INDEX_KEY: blind,
});

describe("encrypt/decrypt", () => {
  it("round trips, including unicode and empty strings", () => {
    for (const v of ["", "João da Silva", "123.456.789-09", "🩺".repeat(50)]) {
      expect(c1.decrypt(c1.encrypt(v, "User.emailEnc"), "User.emailEnc")).toBe(v);
    }
  });

  it("uses layout version|iv|ciphertext|tag and a fresh IV each time", () => {
    const a = c1.encrypt("abc", "User.emailEnc");
    const b = c1.encrypt("abc", "User.emailEnc");
    expect(a[0]).toBe(1);
    expect(a.length).toBe(1 + 12 + 3 + 16);
    expect(a.equals(b)).toBe(false);
  });

  it("throws when any byte is tampered", () => {
    const buf = c1.encrypt("secret", "User.emailEnc");
    for (const i of [5, 14, buf.length - 1]) {
      const t = Buffer.from(buf);
      t[i] = (t[i] as number) ^ 0x01;
      expect(() => c1.decrypt(t, "User.emailEnc")).toThrow();
    }
  });

  it("throws with the wrong AAD", () => {
    const buf = c1.encrypt("secret", "PatientProfile.cpfEnc");
    expect(() => c1.decrypt(buf, "PatientProfile.phoneEnc")).toThrow();
  });

  it("decrypts old key versions after rotation and encrypts with the new one", () => {
    const old = c1.encrypt("legacy", "User.emailEnc");
    const rotated = createCrypto({
      DATA_KEYS: JSON.stringify({ "1": key1, "2": key2 }),
      DATA_KEY_CURRENT: "2",
      BLIND_INDEX_KEY: blind,
    });
    expect(rotated.decrypt(old, "User.emailEnc")).toBe("legacy");
    const fresh = rotated.encrypt("new", "User.emailEnc");
    expect(fresh[0]).toBe(2);
    expect(rotated.decrypt(fresh, "User.emailEnc")).toBe("new");
    expect(() => c1.decrypt(fresh, "User.emailEnc")).toThrow(/version/);
  });

  it("rejects bad configuration", () => {
    expect(() => createCrypto({})).toThrow();
    expect(() =>
      createCrypto({
        DATA_KEYS: JSON.stringify({ "1": "c2hvcnQ=" }),
        DATA_KEY_CURRENT: "1",
        BLIND_INDEX_KEY: blind,
      }),
    ).toThrow();
    expect(() =>
      createCrypto({
        DATA_KEYS: JSON.stringify({ "1": key1 }),
        DATA_KEY_CURRENT: "9",
        BLIND_INDEX_KEY: blind,
      }),
    ).toThrow();
  });
});

describe("blindIndex", () => {
  it("is deterministic and normalizes email and CPF", () => {
    expect(c1.blindIndex("  Ana@Example.COM ", "email")).toBe(
      c1.blindIndex("ana@example.com", "email"),
    );
    expect(c1.blindIndex("123.456.789-09", "cpf")).toBe(c1.blindIndex("12345678909", "cpf"));
    expect(c1.blindIndex("a@b.co", "email")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("differs per purpose and per blind key", () => {
    expect(c1.blindIndex("12345678909", "email")).not.toBe(c1.blindIndex("12345678909", "cpf"));
    const other = createCrypto({
      DATA_KEYS: JSON.stringify({ "1": key1 }),
      DATA_KEY_CURRENT: "1",
      BLIND_INDEX_KEY: k(),
    });
    expect(other.blindIndex("a@b.co", "email")).not.toBe(c1.blindIndex("a@b.co", "email"));
  });

  it("is independent from the data keys", () => {
    const other = createCrypto({
      DATA_KEYS: JSON.stringify({ "1": key2 }),
      DATA_KEY_CURRENT: "1",
      BLIND_INDEX_KEY: blind,
    });
    expect(other.blindIndex("a@b.co", "email")).toBe(c1.blindIndex("a@b.co", "email"));
  });
});
