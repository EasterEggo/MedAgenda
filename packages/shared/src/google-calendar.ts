export interface GoogleEventInput {
  title: string;
  startsAt: Date;
  endsAt: Date;
  location?: string | undefined;
  details?: string | undefined;
}

const GOOGLE_CALENDAR = "https://calendar.google.com/calendar";

/** Converts an https(s) feed URL into its webcal:// form. */
export function toWebcalUrl(feedUrl: string): string {
  return feedUrl.replace(/^https?:\/\//i, "webcal://");
}

/** "Subscribe in Google Calendar" link for a feed URL. */
export function googleSubscribeUrl(feedUrl: string): string {
  return `${GOOGLE_CALENDAR}/r?cid=${encodeURIComponent(toWebcalUrl(feedUrl))}`;
}

/** Google TEMPLATE date format: YYYYMMDDTHHmmssZ (UTC). */
export function toGoogleDate(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

/** "Add this event" link. Never pass notes or other personal data in `details`. */
export function googleAddEventUrl(event: GoogleEventInput): string {
  const params: [string, string][] = [
    ["action", "TEMPLATE"],
    ["text", event.title],
    ["dates", `${toGoogleDate(event.startsAt)}/${toGoogleDate(event.endsAt)}`],
  ];
  if (event.location) params.push(["location", event.location]);
  if (event.details) params.push(["details", event.details]);
  const query = params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
  return `${GOOGLE_CALENDAR}/render?${query}`;
}
