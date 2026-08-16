export interface QuietHoursConfiguration {
  enabled: boolean;
  start: string | null;
  end: string | null;
  timeZone: string;
}

export function isValidClockTime(value: string | null | undefined): value is string {
  return typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function isValidTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export function isQuietHoursActive(date: Date, configuration: QuietHoursConfiguration) {
  if (
    !configuration.enabled ||
    !isValidClockTime(configuration.start) ||
    !isValidClockTime(configuration.end) ||
    !isValidTimeZone(configuration.timeZone)
  ) {
    return false;
  }

  const currentMinutes = getLocalMinutes(date, configuration.timeZone);
  const startMinutes = clockTimeToMinutes(configuration.start);
  const endMinutes = clockTimeToMinutes(configuration.end);

  if (startMinutes < endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }

  return currentMinutes >= startMinutes || currentMinutes < endMinutes;
}

export function getCurrentLocalDayStart(date: Date, timeZone: string) {
  return findLocalBoundary(date, timeZone, 0, 0, -1);
}

export function getNextLocalDayStart(date: Date, timeZone: string) {
  return findLocalBoundary(new Date(date.getTime() + 60_000), timeZone, 0, 0, 1);
}

export function getNextQuietHoursEnd(date: Date, configuration: QuietHoursConfiguration) {
  if (!isQuietHoursActive(date, configuration) || !isValidClockTime(configuration.end)) {
    return null;
  }

  const [hour, minute] = configuration.end.split(":").map(Number);
  return findLocalBoundary(
    new Date(date.getTime() + 60_000),
    configuration.timeZone,
    hour,
    minute,
    1,
  );
}

function findLocalBoundary(
  date: Date,
  timeZone: string,
  targetHour: number,
  targetMinute: number,
  direction: -1 | 1,
) {
  if (!isValidTimeZone(timeZone)) {
    return new Date(date);
  }

  for (let offsetMinutes = 0; offsetMinutes <= 2 * 24 * 60; offsetMinutes += 1) {
    const candidate = new Date(date.getTime() + direction * offsetMinutes * 60_000);
    const local = getLocalTime(candidate, timeZone);
    if (local.hour === targetHour && local.minute === targetMinute) {
      return candidate;
    }
  }

  return new Date(date.getTime() + direction * 24 * 60 * 60_000);
}

function getLocalMinutes(date: Date, timeZone: string) {
  const local = getLocalTime(date, timeZone);
  return local.hour * 60 + local.minute;
}

function getLocalTime(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    timeZone,
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);

  return { hour: hour === 24 ? 0 : hour, minute };
}

function clockTimeToMinutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}
