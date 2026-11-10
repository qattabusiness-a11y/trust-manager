import {
  addDays,
  addMonths,
  addYears,
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  format,
  getDaysInMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";

export const DEFAULT_TIMEZONE = "Africa/Kigali";

/**
 * Period boundaries computed in the household timezone and returned as UTC
 * instants, so they can be compared with stored UTC timestamps.
 */
export interface Period {
  start: Date;
  end: Date;
}

/** The household-local wall-clock representation of `now`. */
export function zonedNow(tz: string, now: Date = new Date()): Date {
  return toZonedTime(now, tz);
}

export function dayPeriod(tz: string, now: Date = new Date()): Period {
  const local = toZonedTime(now, tz);
  const startLocal = new Date(local.getFullYear(), local.getMonth(), local.getDate());
  const endLocal = addDays(startLocal, 1);
  return { start: fromZonedTime(startLocal, tz), end: fromZonedTime(endLocal, tz) };
}

/** Weeks start on Monday. */
export function weekPeriod(tz: string, now: Date = new Date()): Period {
  const local = toZonedTime(now, tz);
  const startLocal = startOfWeek(local, { weekStartsOn: 1 });
  const endLocal = addDays(endOfWeek(local, { weekStartsOn: 1 }), 0);
  const endExclusive = addDays(new Date(endLocal.getFullYear(), endLocal.getMonth(), endLocal.getDate()), 1);
  return {
    start: fromZonedTime(new Date(startLocal.getFullYear(), startLocal.getMonth(), startLocal.getDate()), tz),
    end: fromZonedTime(endExclusive, tz),
  };
}

export function monthPeriod(tz: string, now: Date = new Date()): Period {
  const local = toZonedTime(now, tz);
  const startLocal = startOfMonth(local);
  const endLocal = addDays(endOfMonth(local), 1);
  return {
    start: fromZonedTime(startLocal, tz),
    end: fromZonedTime(new Date(endLocal.getFullYear(), endLocal.getMonth(), endLocal.getDate()), tz),
  };
}

export function monthKey(tz: string, now: Date = new Date()): string {
  return formatInTimeZone(now, tz, "yyyy-MM");
}

export function daysInCurrentMonth(tz: string, now: Date = new Date()): number {
  return getDaysInMonth(toZonedTime(now, tz));
}

/** Days left in the month including today. */
export function daysLeftInMonth(tz: string, now: Date = new Date()): number {
  const local = toZonedTime(now, tz);
  return getDaysInMonth(local) - local.getDate() + 1;
}

export function inPeriod(iso: string, p: Period): boolean {
  const t = new Date(iso).getTime();
  return t >= p.start.getTime() && t < p.end.getTime();
}

/** Household-local calendar date ("yyyy-MM-dd") of a UTC instant. */
export function localDate(iso: string | Date, tz: string): string {
  return formatInTimeZone(typeof iso === "string" ? new Date(iso) : iso, tz, "yyyy-MM-dd");
}

export function todayLocal(tz: string, now: Date = new Date()): string {
  return formatInTimeZone(now, tz, "yyyy-MM-dd");
}

export function daysUntil(dateLocal: string, tz: string, now: Date = new Date()): number {
  return differenceInCalendarDays(parseISO(dateLocal), parseISO(todayLocal(tz, now)));
}

export function fmtDate(iso: string, tz: string, pattern = "d MMM yyyy"): string {
  return formatInTimeZone(new Date(iso), tz, pattern);
}

export function fmtLocalDate(dateLocal: string, pattern = "d MMM yyyy"): string {
  return format(parseISO(dateLocal), pattern);
}

/** Combine a household-local date + time ("HH:mm") into a UTC ISO string. */
export function localToUtcIso(dateLocal: string, time: string, tz: string): string {
  const [y, m, d] = dateLocal.split("-").map(Number);
  const [hh, mm] = (time || "12:00").split(":").map(Number);
  return fromZonedTime(new Date(y!, m! - 1, d!, hh ?? 12, mm ?? 0), tz).toISOString();
}

export function greeting(tz: string, now: Date = new Date()): string {
  const h = toZonedTime(now, tz).getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/** Advance a local date by a recurring frequency. */
export function advanceDate(dateLocal: string, frequency: "weekly" | "monthly" | "quarterly" | "yearly"): string {
  const d = parseISO(dateLocal);
  let next: Date;
  switch (frequency) {
    case "weekly":
      next = addDays(d, 7);
      break;
    case "monthly":
      next = addMonths(d, 1);
      break;
    case "quarterly":
      next = addMonths(d, 3);
      break;
    case "yearly":
      next = addYears(d, 1);
      break;
  }
  return format(next, "yyyy-MM-dd");
}
