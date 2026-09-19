export type PeriodInfo = {
  billingPeriod: string;
  currentPeriod: string;
  year: number;
  month: number;
  day: number;
  today: string;
  dueDate: string;
  daysUntilDue: number;
  isPastDue: boolean;
};

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function localDateParts(
  now: Date,
  timezone: string
): { year: number; month: number; day: number; today: string } {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "00";
  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));
  return { year, month, day, today: `${year}-${pad(month)}-${pad(day)}` };
}

function diffInDays(fromISO: string, toISO: string): number {
  const from = Date.UTC(
    Number(fromISO.slice(0, 4)),
    Number(fromISO.slice(5, 7)) - 1,
    Number(fromISO.slice(8, 10))
  );
  const to = Date.UTC(
    Number(toISO.slice(0, 4)),
    Number(toISO.slice(5, 7)) - 1,
    Number(toISO.slice(8, 10))
  );
  return Math.round((to - from) / 86_400_000);
}

export function getPeriodInfo(
  now: Date = new Date(),
  timezone: string,
  dueDay = 10
): PeriodInfo {
  const { year, month, day, today } = localDateParts(now, timezone);
  const currentPeriod = `${year}-${pad(month)}`;
  const billingPeriod = addMonths(currentPeriod, -1);
  const dueDate = `${currentPeriod}-${pad(dueDay)}`;
  const daysUntilDue = diffInDays(today, dueDate);
  return {
    billingPeriod,
    currentPeriod,
    year,
    month,
    day,
    today,
    dueDate,
    daysUntilDue,
    isPastDue: daysUntilDue < 0,
  };
}

export function periodOf(date: Date, timezone: string): string {
  const { year, month } = localDateParts(date, timezone);
  return `${year}-${pad(month)}`;
}

function tzOffsetMs(date: Date, timezone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  const asUTC = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second")
  );
  return asUTC - date.getTime();
}

export function startOfLocalMonthISO(now: Date, timezone: string): string {
  const { year, month } = localDateParts(now, timezone);
  const utcMidnight = Date.UTC(year, month - 1, 1);
  const offset = tzOffsetMs(new Date(utcMidnight), timezone);
  return new Date(utcMidnight - offset).toISOString();
}

export function dueDateForPeriod(period: string, dueDay = 10): string {
  return `${addMonths(period, 1)}-${pad(dueDay)}`;
}

export function addMonths(period: string, delta: number): string {
  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(5, 7));
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;
}

export function formatPeriodLabel(period: string): string {
  const months = [
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
  ];
  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(5, 7));
  return `${months[month - 1] ?? period} ${year}`;
}
