/**
 * i18n completeness check (`pnpm i18n:check`). Fails when:
 *  - the two catalogs (packages/shared/i18n/{pt-BR,en}.json) have different key sets, empty values
 *    or different `{placeholders}`;
 *  - the top-level namespaces are not exactly the allowed list;
 *  - the `errors` namespace does not match the shared ErrorCodes enum (plus client-only codes);
 *  - a catalog key is never referenced from apps/web, apps/api or packages/shared;
 *  - a template-literal key (`t(\`x.${y}\`)`) uses a prefix that is not in DYNAMIC_PREFIXES.
 *
 * Usage detection is namespace-aware: each file's `useTranslations("ns")` / `getTranslations(...)`
 * calls (or the root namespace when called with no argument) are combined with every string literal
 * in the file, so `t("title")` inside `useTranslations("settings.profile")` counts as
 * `settings.profile.title`. The matching is deliberately permissive for literals (a literal that
 * matches a key marks it used) so the check does not report false positives.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ErrorCodes } from "../packages/shared/src/errors.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CATALOG_DIR = join(ROOT, "packages/shared/i18n");
const LOCALES = ["pt-BR", "en"] as const;
const NAMESPACES = [
  "common",
  "auth",
  "booking",
  "calendar",
  "settings",
  "errors",
  "admin",
  "ics",
] as const;
/** Client-only codes that `errorMessageKey` maps to `errors.<code>` besides the API enum. */
const CLIENT_ERROR_CODES = ["NETWORK_ERROR", "UNKNOWN"] as const;

const SCAN_PATHS = [
  "apps/web/app",
  "apps/web/components",
  "apps/web/lib",
  "apps/web/i18n",
  "apps/web/e2e",
  "apps/web/middleware.ts",
  "apps/api/src",
  "apps/api/test",
  "apps/api/prisma",
  "packages/shared/src",
];

/**
 * Keys built at runtime from a template literal, e.g. t(`admin.fields.${name}`). Each entry is the
 * full catalog path of the prefix; every leaf under it counts as used. A template whose prefix is
 * not listed here fails the check, so dynamic keys have to be declared on purpose.
 */
const DYNAMIC_PREFIXES: Record<string, string> = {
  "errors.": "API error codes (errorMessageKey, validation.ts); checked against ErrorCodes below",
  "common.languages.": "language names, keyed by locale code",
  "common.serviceType.": "CONSULTATION / EXAM service type labels",
  "auth.register.steps.": "register wizard step names (account, personal, consent)",
  "booking.steps.": "booking wizard step names",
  "calendar.appointments.filters.": "appointment list filters (upcoming, past, cancelled)",
  "calendar.appointments.empty.": "appointment list empty states, keyed by filter",
  "calendar.appointments.status.": "appointment status labels (SCHEDULED, CANCELLED, ...)",
  "admin.sections.": "admin section titles, keyed by entity",
  "admin.fields.": "admin entity form field labels, keyed by field name",
  "admin.hints.": "admin form hints",
  "admin.kinds.": "provider kinds (DOCTOR, EXAM_RESOURCE)",
  "admin.weekdays.": "weekday names keyed by getDay() index 0-6",
  "admin.slots.statuses.": "slot statuses (OPEN, BOOKED, BLOCKED)",
};

interface Problem {
  kind: string;
  detail: string;
}
const problems: Problem[] = [];
const fail = (kind: string, detail: string) => problems.push({ kind, detail });

type Json = { [key: string]: Json | string } | string;

function readCatalog(locale: string): Record<string, Json> {
  return JSON.parse(readFileSync(join(CATALOG_DIR, `${locale}.json`), "utf8")) as Record<
    string,
    Json
  >;
}

/** Flattens a catalog into dotted leaf paths. */
function flatten(node: Record<string, Json>, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") out.set(path, value);
    else for (const [p, v] of flatten(value, path)) out.set(p, v);
  }
  return out;
}

function listSourceFiles(path: string): string[] {
  const full = join(ROOT, path);
  const stat = statSync(full);
  if (stat.isFile()) return /\.(ts|tsx)$/.test(full) ? [full] : [];
  return readdirSync(full, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) return [];
    const child = join(full, entry.name);
    if (entry.isDirectory()) return listSourceFiles(relative(ROOT, child));
    return /\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".d.ts") ? [child] : [];
  });
}

/** Namespaces that the hook calls of one file bind `t` to ("" is the root). */
function namespacesOf(source: string): string[] {
  const found = new Set<string>();
  const hook = /\b(?:useTranslations|getTranslations)\(\s*(\{[^}]*\}|"[^"]*"|'[^']*')?\s*\)/g;
  for (const match of source.matchAll(hook)) {
    const arg = match[1];
    if (!arg) found.add("");
    else if (arg.startsWith("{")) {
      found.add(/namespace:\s*["']([^"']+)["']/.exec(arg)?.[1] ?? "");
    } else found.add(arg.slice(1, -1));
  }
  return [...found];
}

const LITERAL = /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`([^`$\\\n]*)`/g;
const TEMPLATE = /`([^`\n]*\$\{[^`\n]*)`/g;
const KEY_SHAPE = /^[A-Za-z][\w-]*(\.[\w-]+)*\.?$/;

function scanFile(
  file: string,
  used: Set<string>,
  leaves: Set<string>,
  dynamicHits: Map<string, string>,
) {
  const source = readFileSync(file, "utf8");
  const rel = relative(ROOT, file);
  const namespaces = namespacesOf(source);
  if (namespaces.length === 0) namespaces.push("");

  const candidates = (literal: string) => [
    literal,
    ...namespaces.filter(Boolean).map((ns) => `${ns}.${literal}`),
  ];

  for (const match of source.matchAll(LITERAL)) {
    const literal = match[1] ?? match[2] ?? match[3] ?? "";
    if (!KEY_SHAPE.test(literal)) continue;
    for (const candidate of candidates(literal)) {
      if (leaves.has(candidate)) used.add(candidate);
    }
  }

  for (const match of source.matchAll(TEMPLATE)) {
    const text = match[1] ?? "";
    const prefix = text.slice(0, text.indexOf("${"));
    if (!prefix.endsWith(".") || !KEY_SHAPE.test(prefix)) continue; // a DOM id, URL or test value
    // Only templates that land in a catalog namespace are keys (`field-${x}` is a DOM id).
    const keyed = candidates(prefix).filter((c) => NAMESPACES.includes(c.split(".")[0] as never));
    if (keyed.length === 0) continue;
    const matched = keyed.find((c) => c in DYNAMIC_PREFIXES);
    if (matched) dynamicHits.set(matched, rel);
    else
      fail(
        "dynamic-key",
        `${rel}: t(\`${text}\`) is not in DYNAMIC_PREFIXES (prefix "${keyed[0]}")`,
      );
  }
}

// 1. Catalogs: same key sets, non-empty values, same placeholders, allowed namespaces.
const catalogs = Object.fromEntries(LOCALES.map((l) => [l, readCatalog(l)]));
const leaves = Object.fromEntries(LOCALES.map((l) => [l, flatten(catalogs[l]!)]));
const [basis, ...others] = LOCALES;
const basisKeys = new Set(leaves[basis!]!.keys());

for (const locale of LOCALES) {
  const top = Object.keys(catalogs[locale]!).sort();
  const expected = [...NAMESPACES].sort();
  if (top.join(",") !== expected.join(",")) {
    fail(
      "namespace",
      `${locale}: top-level namespaces are [${top.join(", ")}], expected [${expected.join(", ")}]`,
    );
  }
  for (const [path, value] of leaves[locale]!) {
    if (value.trim() === "") fail("empty", `${locale}: ${path} is empty`);
  }
}
for (const locale of others) {
  for (const key of basisKeys) {
    if (!leaves[locale]!.has(key)) fail("missing", `${locale} is missing ${key}`);
  }
  for (const key of leaves[locale]!.keys()) {
    if (!basisKeys.has(key)) fail("missing", `${basis} is missing ${key}`);
  }
}
for (const key of basisKeys) {
  const placeholders = (text: string) =>
    [...text.matchAll(/\{(\w+)\}/g)]
      .map((m) => m[1])
      .sort()
      .join(",");
  const expected = placeholders(leaves[basis!]!.get(key)!);
  for (const locale of others) {
    const other = leaves[locale]!.get(key);
    if (other !== undefined && placeholders(other) !== expected) {
      fail("placeholder", `${key}: placeholders differ between ${basis} and ${locale}`);
    }
  }
}

// 2. Errors namespace mirrors the shared error-code enum.
const expectedErrors = new Set<string>([...ErrorCodes, ...CLIENT_ERROR_CODES]);
for (const locale of LOCALES) {
  for (const key of leaves[locale]!.keys()) {
    if (!key.startsWith("errors.")) continue;
    const code = key.slice("errors.".length);
    if (!expectedErrors.has(code)) fail("errors", `${locale}: ${key} is not an ErrorCodes member`);
  }
  for (const code of expectedErrors) {
    if (!leaves[locale]!.has(`errors.${code}`))
      fail("errors", `${locale}: errors.${code} is missing`);
  }
}

// 3. Usage in code.
const used = new Set<string>();
const dynamicHits = new Map<string, string>();
const files = SCAN_PATHS.flatMap(listSourceFiles);
for (const file of files) scanFile(file, used, basisKeys_(), dynamicHits);

function basisKeys_(): Set<string> {
  return basisKeys;
}

for (const prefix of Object.keys(DYNAMIC_PREFIXES)) {
  if (!dynamicHits.has(prefix)) {
    fail("stale-prefix", `DYNAMIC_PREFIXES lists "${prefix}" but no code uses it`);
    continue;
  }
  for (const key of basisKeys) if (key.startsWith(prefix)) used.add(key);
}

const unused = [...basisKeys].filter((key) => !used.has(key)).sort();
for (const key of unused)
  fail("unused", `${key} is not used in apps/web, apps/api or packages/shared`);

// 4. Report.
if (problems.length > 0) {
  console.error(`i18n check failed with ${problems.length} problem(s):`);
  for (const p of problems) console.error(`  [${p.kind}] ${p.detail}`);
  process.exit(1);
}
console.log(
  `i18n check passed: ${basisKeys.size} keys in ${LOCALES.join(" and ")}, ` +
    `${used.size} referenced, ${files.length} source files scanned, ` +
    `${dynamicHits.size} dynamic prefixes.`,
);
