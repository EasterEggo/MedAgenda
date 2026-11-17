export interface PageLike<T> {
  items: T[];
  nextCursor: string | null;
}

/** Upper bound of pages fetched by `collectAll`. Stops a runaway catalog from locking the UI. */
export const MAX_COLLECTED_PAGES = 25;

/**
 * Follows cursor pagination until the last page and returns every item.
 * Stops after `maxPages` as a safety net; the caller should not rely on more than that.
 */
export async function collectAll<T>(
  fetchPage: (cursor: string | undefined) => Promise<PageLike<T>>,
  maxPages = MAX_COLLECTED_PAGES,
): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const result = await fetchPage(cursor);
    items.push(...result.items);
    if (!result.nextCursor) break;
    cursor = result.nextCursor;
  }
  return items;
}
