export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/** Cursor pagination helper: query with `take: limit + 1`, then pass the rows here. */
export function toPage<T extends { id: string }, U = T>(
  rows: T[],
  limit: number,
  map: (row: T) => U = (r) => r as unknown as U,
): Page<U> {
  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  return {
    items: slice.map(map),
    nextCursor: hasMore ? (slice[slice.length - 1]?.id ?? null) : null,
  };
}

/** Prisma args for cursor pagination on `id`. */
export function pageArgs(p: { limit: number; cursor?: string | undefined }) {
  return {
    take: p.limit + 1,
    ...(p.cursor ? { cursor: { id: p.cursor }, skip: 1 } : {}),
  };
}
