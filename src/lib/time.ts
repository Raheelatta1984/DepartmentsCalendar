const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Minutes after midnight for a validated HH:mm value. */
export function timeToMinutes(value: string | undefined): number | null {
  if (!value) return null;
  const match = TIME_PATTERN.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * Elapsed hours in a same-day work window. Overnight entries are deliberately
 * rejected: they need two dated rows so daily capacity remains unambiguous.
 */
export function elapsedHours(startTime?: string, endTime?: string): number | null {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  if (start === null || end === null || end <= start) return null;
  return Math.round(((end - start) / 60) * 100) / 100;
}

/** Compare in minutes so a displayed 0.33h matches a twenty-minute window. */
export function hoursMatchTimeWindow(hours: number, startTime?: string, endTime?: string): boolean {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  if (start === null || end === null || end <= start || !Number.isFinite(hours)) return false;
  return Math.abs(hours * 60 - (end - start)) <= 1;
}

/**
 * A blank window is allowed for legacy/all-day entries. As soon as either time
 * is supplied, both are required and the hours must agree before saving.
 */
export function timeWindowError(
  hours: number,
  startTime?: string,
  endTime?: string,
  { requireWindow = false }: { requireWindow?: boolean } = {},
): string | null {
  if (!startTime && !endTime) {
    return requireWindow ? 'Choose both a start and end time for this entry.' : null;
  }
  if (!startTime || !endTime) return 'Choose both a start and end time, or clear both times.';
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  if (start === null || end === null) return 'Use valid 24-hour start and end times.';
  if (end <= start) return 'End time must be after start time. Split overnight work into separate dated entries.';
  if (!hoursMatchTimeWindow(hours, startTime, endTime)) {
    const calculated = elapsedHours(startTime, endTime);
    return `Hours do not match the selected time window. ${startTime}–${endTime} is ${calculated}h; adjust the hours or times so both match.`;
  }
  return null;
}

/** Useful for consistent two-hour defaults without introducing a date timezone. */
export function addHoursToTime(startTime: string, hours: number): string {
  const start = timeToMinutes(startTime) ?? 9 * 60;
  const total = Math.min(23 * 60 + 59, start + Math.round(hours * 60));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
