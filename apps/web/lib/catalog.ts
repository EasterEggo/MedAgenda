/** Name of a catalog entity in the active locale. Catalog rows carry namePt and nameEn. */
export function localizedName(entity: { namePt: string; nameEn: string }, locale: string): string {
  return locale === "en" ? entity.nameEn : entity.namePt;
}

/** Exam preparation text in the active locale. */
export function localizedPreparation(
  entity: { preparationPt: string; preparationEn: string },
  locale: string,
): string {
  return locale === "en" ? entity.preparationEn : entity.preparationPt;
}

/** Lowercase text without accents, so "cardio" matches "Cardiologia" and "raio" matches "Raio-X". */
export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/** True when every whitespace-separated word of the query appears in the name. Empty query matches all. */
export function matchesQuery(name: string, query: string): boolean {
  const haystack = normalizeText(name);
  return normalizeText(query)
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}
