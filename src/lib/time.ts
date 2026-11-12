// All stored timestamps are UTC (timestamptz). Anything a person reads, on
// screen or in a generated document, is shown in Central Time.

export const CENTRAL_TIME_ZONE = "America/Chicago";

const dateTimeFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: CENTRAL_TIME_ZONE,
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  timeZoneName: "short",
});

const longDateFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: CENTRAL_TIME_ZONE,
  year: "numeric",
  month: "long",
  day: "numeric",
});

export function formatCentralDateTime(value: Date | string): string {
  return dateTimeFormat.format(new Date(value));
}

export function formatCentralDate(value: Date | string): string {
  return longDateFormat.format(new Date(value));
}

export function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}
