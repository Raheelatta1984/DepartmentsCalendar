import {
  addDays,
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfMonth,
  endOfQuarter,
  endOfWeek,
  endOfYear,
  format,
  getISOWeek,
  getQuarter,
  isWithinInterval,
  parseISO,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  startOfYear,
} from 'date-fns';
import type { Holiday, PeriodKey } from '../types';

export const ISO = 'yyyy-MM-dd';

export const toISO = (d: Date) => format(d, ISO);
export const fromISO = (s: string) => parseISO(s);
export const prettyDate = (s: string) => format(parseISO(s), 'dd MMM yyyy');
export const shortDate = (s: string) => format(parseISO(s), 'dd MMM');
export const monthName = (d: Date) => format(d, 'MMMM yyyy');

export const isoWeek = (d: Date) => getISOWeek(d);
export const quarterOf = (d: Date) => getQuarter(d);

export function weekRange(d: Date, weekStartsOn: 0 | 1 | 6 = 1) {
  return {
    start: startOfWeek(d, { weekStartsOn }),
    end: endOfWeek(d, { weekStartsOn }),
  };
}

export function periodRange(anchor: Date, period: PeriodKey, weekStartsOn: 0 | 1 | 6 = 1) {
  switch (period) {
    case 'day':
      return { start: anchor, end: anchor };
    case 'week': {
      const { start, end } = weekRange(anchor, weekStartsOn);
      return { start, end };
    }
    case 'month':
      return { start: startOfMonth(anchor), end: endOfMonth(anchor) };
    case 'quarter':
      return { start: startOfQuarter(anchor), end: endOfQuarter(anchor) };
    default:
      return { start: startOfYear(anchor), end: endOfYear(anchor) };
  }
}

export function shiftPeriod(anchor: Date, period: PeriodKey, direction: -1 | 1) {
  switch (period) {
    case 'day':
      return addDays(anchor, direction);
    case 'week':
      return addDays(anchor, direction * 7);
    case 'month': {
      const d = new Date(anchor);
      d.setMonth(d.getMonth() + direction);
      return d;
    }
    case 'quarter':
      return addDays(anchor, direction * 91);
    default:
      return addDays(anchor, direction * 365);
  }
}

export function periodLabel(anchor: Date, period: PeriodKey) {
  switch (period) {
    case 'day':
      return format(anchor, 'EEE dd MMM yyyy');
    case 'week':
      return `Week ${getISOWeek(anchor)} · ${format(startOfWeek(anchor, { weekStartsOn: 1 }), 'dd MMM')} – ${format(
        endOfWeek(anchor, { weekStartsOn: 1 }),
        'dd MMM yyyy',
      )}`;
    case 'month':
      return format(anchor, 'MMMM yyyy');
    case 'quarter':
      return `Q${getQuarter(anchor)} ${format(anchor, 'yyyy')}`;
    default:
      return format(anchor, 'yyyy');
  }
}

export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return fromISO(aStart) <= fromISO(bEnd) && fromISO(bStart) <= fromISO(aEnd);
}

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export function daysBetweenInclusive(start: string | Date, end: string | Date) {
  const s = typeof start === 'string' ? fromISO(start) : start;
  const e = typeof end === 'string' ? fromISO(end) : end;
  return eachDayOfInterval({ start: s, end: e });
}

export interface DayMeta {
  date: Date;
  iso: string;
  isWeekend: boolean;
  holiday?: Holiday;
}

export function buildDayMeta(
  start: Date,
  end: Date,
  weeklyOff: number[],
  holidays: Holiday[],
  countryCode?: string,
): DayMeta[] {
  const byDate = new Map<string, Holiday>();
  holidays
    .filter((h) => !countryCode || h.countryCode === countryCode)
    .forEach((h) => byDate.set(h.date, h));
  return eachDayOfInterval({ start, end }).map((d) => ({
    date: d,
    iso: toISO(d),
    isWeekend: weeklyOff.includes(d.getDay()),
    holiday: byDate.get(toISO(d)),
  }));
}

/** Number of working days inside [start, end] given a country's weekend and holidays. */
export function workingDays(
  start: string | Date,
  end: string | Date,
  weeklyOff: number[],
  holidays: Holiday[],
  countryCode: string,
) {
  return buildDayMeta(
    typeof start === 'string' ? fromISO(start) : start,
    typeof end === 'string' ? fromISO(end) : end,
    weeklyOff,
    holidays,
    countryCode,
  ).filter((d) => !d.isWeekend && !d.holiday).length;
}

export function isHoliday(dateISO: string, holidays: Holiday[], countryCode: string) {
  return holidays.some((h) => h.countryCode === countryCode && h.date === dateISO);
}

export function within(dateISO: string, start: string, end: string) {
  return isWithinInterval(fromISO(dateISO), { start: fromISO(start), end: fromISO(end) });
}

export function durationDays(start: string, end: string) {
  return differenceInCalendarDays(fromISO(end), fromISO(start)) + 1;
}

export function pct(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 100);
}

export function clamp(n: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, n));
}

export function humanHours(h: number) {
  return `${Number.isInteger(h) ? h : h.toFixed(1)}h`;
}

export function formatTimeRange(startTime: string, endTime: string) {
  const to12 = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    const suffix = h >= 12 ? 'PM' : 'AM';
    const hour = h % 12 === 0 ? 12 : h % 12;
    return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
  };
  return `${to12(startTime)} – ${to12(endTime)}`;
}

/** Build the ISO strings for a five-year holiday horizon starting this year. */
export function horizonYears(years: number) {
  const y = new Date().getFullYear();
  return Array.from({ length: years }, (_, i) => y + i);
}
