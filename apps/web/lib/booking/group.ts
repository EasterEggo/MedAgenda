import type { Slot } from "@/lib/api/endpoints";
import { dayKey, formatDayHeading, formatTime } from "@/lib/datetime";

export interface SlotOption {
  /** Start instant, unique within a day. */
  key: string;
  slot: Slot;
  time: string;
  providerName: string;
}

export interface SlotDay {
  key: string;
  heading: string;
  options: SlotOption[];
}

/**
 * Groups open slots by calendar day in each clinic's timezone. Times are unique per day:
 * with "any professional", the first professional (by name) at a given time is the option.
 */
export function groupSlotsByDay(slots: Slot[], locale: string): SlotDay[] {
  const sorted = [...slots].sort(
    (a, b) =>
      a.startsAt.localeCompare(b.startsAt) || a.provider.name.localeCompare(b.provider.name),
  );
  const days = new Map<string, SlotDay>();
  for (const slot of sorted) {
    const timeZone = slot.clinic.timezone;
    const key = dayKey(slot.startsAt, timeZone);
    let day = days.get(key);
    if (!day) {
      day = {
        key,
        heading: formatDayHeading(slot.startsAt, { locale, timeZone }),
        options: [],
      };
      days.set(key, day);
    }
    if (day.options.some((o) => o.key === slot.startsAt)) continue;
    day.options.push({
      key: slot.startsAt,
      slot,
      time: formatTime(slot.startsAt, { locale, timeZone }),
      providerName: slot.provider.name,
    });
  }
  return [...days.values()];
}
