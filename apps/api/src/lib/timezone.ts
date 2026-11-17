/** Offset (ms) of `timeZone` from UTC at the given instant. */
function offsetAt(ts: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(new Date(ts));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return asUtc - Math.floor(ts / 1000) * 1000;
}

/** Converts a wall-clock time in `timeZone` to a UTC Date. `date` is YYYY-MM-DD, `minutes` since midnight. */
export function zonedToUtc(date: string, minutes: number, timeZone: string): Date {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const naive = Date.UTC(y, m - 1, d, 0, minutes);
  let ts = naive - offsetAt(naive, timeZone);
  ts = naive - offsetAt(ts, timeZone);
  return new Date(ts);
}
