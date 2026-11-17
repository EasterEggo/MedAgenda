const DAY_MS = 24 * 60 * 60 * 1000;

/** Each week view is a 7-day window, far below the API's 31-day range limit. */
export const WEEK_DAYS = 7;
/** Four weeks ahead, so a single window never comes near the API range limit. */
export const MAX_WEEK_OFFSET = 3;

export function clampWeekOffset(offset: number): number {
  return Math.min(Math.max(Math.trunc(offset), 0), MAX_WEEK_OFFSET);
}

/**
 * Rolling 7-day window `offset` weeks from `now`. The API clamps `from` to the present,
 * so offset 0 starts now and never returns past slots.
 */
export function weekWindow(offset: number, now: Date): { from: string; to: string } {
  const start = now.getTime() + clampWeekOffset(offset) * WEEK_DAYS * DAY_MS;
  return {
    from: new Date(start).toISOString(),
    to: new Date(start + WEEK_DAYS * DAY_MS).toISOString(),
  };
}
