import { addDays, format, nextMonday, isWeekend } from 'date-fns';
import type { CountryConfig, Holiday } from '../types';
import { toISO } from '../lib/dates';

export const COUNTRIES: CountryConfig[] = [
  { code: 'AE', name: 'United Arab Emirates', flag: '🇦🇪', weeklyOff: [0, 6], timezone: 'Asia/Dubai' },
  { code: 'SA', name: 'Saudi Arabia', flag: '🇸🇦', weeklyOff: [5, 6], timezone: 'Asia/Riyadh' },
  { code: 'QA', name: 'Qatar', flag: '🇶🇦', weeklyOff: [5, 6], timezone: 'Asia/Qatar' },
  { code: 'OM', name: 'Oman', flag: '🇴🇲', weeklyOff: [5, 6], timezone: 'Asia/Muscat' },
  { code: 'KW', name: 'Kuwait', flag: '🇰🇼', weeklyOff: [5, 6], timezone: 'Asia/Kuwait' },
  { code: 'BH', name: 'Bahrain', flag: '🇧🇭', weeklyOff: [5, 6], timezone: 'Asia/Bahrain' },
  { code: 'IN', name: 'India', flag: '🇮🇳', weeklyOff: [0], timezone: 'Asia/Kolkata' },
  { code: 'PK', name: 'Pakistan', flag: '🇵🇰', weeklyOff: [0], timezone: 'Asia/Karachi' },
  { code: 'US', name: 'United States', flag: '🇺🇸', weeklyOff: [0, 6], timezone: 'America/New_York' },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧', weeklyOff: [0, 6], timezone: 'Europe/London' },
  { code: 'AU', name: 'Australia (NSW)', flag: '🇦🇺', weeklyOff: [0, 6], timezone: 'Australia/Sydney' },
  { code: 'SG', name: 'Singapore', flag: '🇸🇬', weeklyOff: [0, 6], timezone: 'Asia/Singapore' },
];

export const countryByCode = (code: string) =>
  COUNTRIES.find((c) => c.code === code) ?? COUNTRIES[0];

type HolidaySeed = { date: Date; name: string };

const d = (year: number, month: number, day: number) => new Date(year, month - 1, day);

function nthWeekday(year: number, month: number, weekday: number, nth: number) {
  const first = d(year, month, 1);
  const offset = (weekday - first.getDay() + 7) % 7;
  return addDays(first, offset + (nth - 1) * 7);
}

function lastWeekday(year: number, month: number, weekday: number) {
  const last = d(year, month, new Date(year, month, 0).getDate());
  return addDays(last, -((last.getDay() - weekday + 7) % 7));
}

/** Anonymous Gregorian computus */
function easterSunday(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const e = Math.floor(b / 4);
  const f = b % 4;
  const g = Math.floor((b + 8) / 25);
  const h = Math.floor((b - f + g + 1) / 3);
  const i = Math.floor((19 * a + b - e - h + 15) % 30);
  const k = Math.floor(c / 4);
  const l = c % 4;
  const m = Math.floor((32 + 2 * f + 2 * k - i - l) % 7);
  const n = Math.floor((a + 11 * i + 22 * m) / 451);
  const month = Math.floor((i + m - 7 * n + 114) / 31);
  const day = ((i + m - 7 * n + 114) % 31) + 1;
  return d(year, month, day);
}

/**
 * Lunar / movable dates are "tentative" for future years: local moon-sighting
 * committees confirm them 1-2 days ahead. The portal labels them accordingly.
 */
const ISLAMIC_DATES: Record<
  number,
  { ramadan: string; eidFitr: string; arafat: string; eidAdha: string; hijri: string; ashura: string; mawlid: string; miraj: string }
> = {
  2025: { ramadan: '2025-03-01', eidFitr: '2025-03-30', arafat: '2025-06-05', eidAdha: '2025-06-06', hijri: '2025-06-26', ashura: '2025-07-05', mawlid: '2025-09-04', miraj: '2025-01-27' },
  2026: { ramadan: '2026-02-18', eidFitr: '2026-03-20', arafat: '2026-05-26', eidAdha: '2026-05-27', hijri: '2026-06-16', ashura: '2026-06-25', mawlid: '2026-08-25', miraj: '2026-01-16' },
  2027: { ramadan: '2027-02-08', eidFitr: '2027-03-10', arafat: '2027-05-16', eidAdha: '2027-05-17', hijri: '2027-06-06', ashura: '2027-06-15', mawlid: '2027-08-14', miraj: '2027-01-06' },
  2028: { ramadan: '2028-01-28', eidFitr: '2028-02-27', arafat: '2028-05-04', eidAdha: '2028-05-05', hijri: '2028-05-25', ashura: '2028-06-03', mawlid: '2028-08-03', miraj: '2028-12-25' },
  2029: { ramadan: '2029-01-16', eidFitr: '2029-02-15', arafat: '2029-04-23', eidAdha: '2029-04-24', hijri: '2029-05-14', ashura: '2029-05-23', mawlid: '2029-07-23', miraj: '2029-12-14' },
  2030: { ramadan: '2030-01-06', eidFitr: '2030-02-05', arafat: '2030-04-13', eidAdha: '2030-04-14', hijri: '2030-05-04', ashura: '2030-05-13', mawlid: '2030-07-13', miraj: '2030-12-04' },
  2031: { ramadan: '2030-12-26', eidFitr: '2031-01-25', arafat: '2031-04-02', eidAdha: '2031-04-03', hijri: '2031-04-23', ashura: '2031-05-02', mawlid: '2031-07-02', miraj: '2031-11-23' },
};

const DIWALI: Record<number, string> = {
  2025: '2025-10-20',
  2026: '2026-11-08',
  2027: '2027-10-29',
  2028: '2028-10-17',
  2029: '2029-11-05',
  2030: '2030-10-26',
};

const HOLI: Record<number, string> = {
  2025: '2025-03-14',
  2026: '2026-03-04',
  2027: '2027-03-22',
  2028: '2028-03-11',
  2029: '2029-03-01',
  2030: '2030-03-20',
};

const CNY: Record<number, string> = {
  2025: '2025-01-29',
  2026: '2026-02-17',
  2027: '2027-02-06',
  2028: '2028-01-26',
  2029: '2029-02-13',
  2030: '2030-02-03',
};

const VESAK: Record<number, string> = {
  2025: '2025-05-12',
  2026: '2026-05-31',
  2027: '2027-05-20',
  2028: '2028-05-09',
  2029: '2029-05-27',
  2030: '2030-05-17',
};

/**
 * Islamic dates move ~10.875 days earlier each Gregorian year. For years we
 * have published projections for we use them; beyond that we project from
 * 2026 so a 5-year horizon still renders (flagged tentative in the UI).
 */
const islamic = (year: number, key: keyof (typeof ISLAMIC_DATES)[number], offset = 0) => {
  const exact = ISLAMIC_DATES[year];
  if (exact) return addDays(new Date(exact[key]), offset);
  const base = new Date(ISLAMIC_DATES[2026][key]);
  return addDays(base, offset - Math.round((year - 2026) * 10.875));
};

function gulfHolidays(year: number, country: 'AE' | 'SA' | 'QA' | 'OM' | 'KW' | 'BH'): HolidaySeed[] {
  const list: HolidaySeed[] = [];
  const fitrDays = country === 'SA' ? 4 : 3;
  const adhaDays = country === 'SA' ? 4 : 3;
  for (let i = 0; i < fitrDays; i++) list.push({ date: islamic(year, 'eidFitr', i), name: i === 0 ? 'Eid al-Fitr' : `Eid al-Fitr Holiday (day ${i + 1})` });
  list.push({ date: islamic(year, 'arafat'), name: 'Arafat Day' });
  for (let i = 0; i < adhaDays; i++) list.push({ date: islamic(year, 'eidAdha', i), name: i === 0 ? 'Eid al-Adha' : `Eid al-Adha Holiday (day ${i + 1})` });
  list.push({ date: islamic(year, 'hijri'), name: 'Islamic New Year' });
  list.push({ date: islamic(year, 'mawlid'), name: "Prophet Muhammad's Birthday" });

  if (country === 'AE') {
    list.push({ date: d(year, 1, 1), name: "New Year's Day" });
    list.push({ date: islamic(year, 'miraj'), name: 'Isra & Mi’raj' });
    list.push({ date: islamic(year, 'ashura'), name: 'Ashura (optional observance)' });
    list.push({ date: d(year, 12, 1), name: 'Commemoration Day' });
    list.push({ date: d(year, 12, 2), name: 'UAE National Day' });
    list.push({ date: d(year, 12, 3), name: 'UAE National Day Holiday' });
  }
  if (country === 'SA') {
    list.push({ date: d(year, 2, 22), name: 'Founding Day' });
    list.push({ date: d(year, 9, 23), name: 'Saudi National Day' });
  }
  if (country === 'QA') {
    list.push({ date: d(year, 12, 18), name: 'Qatar National Day' });
    list.push({ date: d(year, 2, 11), name: 'National Sports Day' });
  }
  if (country === 'OM') {
    list.push({ date: d(year, 11, 18), name: 'Oman National Day' });
    list.push({ date: d(year, 7, 23), name: 'Renaissance Day' });
  }
  if (country === 'KW') {
    list.push({ date: d(year, 2, 25), name: 'National Day' });
    list.push({ date: d(year, 2, 26), name: 'Liberation Day' });
  }
  if (country === 'BH') {
    list.push({ date: d(year, 12, 16), name: 'Bahrain National Day' });
    list.push({ date: d(year, 12, 17), name: 'Accession Day' });
  }
  return list;
}

function observed(date: Date): Date {
  return isWeekend(date) ? nextMonday(date) : date;
}

export function generateCountryHolidays(countryCode: string, year: number): HolidaySeed[] {
  const easter = easterSunday(year);
  const goodFriday = addDays(easter, -2);
  const easterMonday = addDays(easter, 1);
  switch (countryCode) {
    case 'AE':
    case 'SA':
    case 'QA':
    case 'OM':
    case 'KW':
    case 'BH':
      return gulfHolidays(year, countryCode);
    case 'IN':
      return [
        { date: d(year, 1, 1), name: "New Year's Day" },
        { date: d(year, 1, 26), name: 'Republic Day' },
        { date: new Date(HOLI[year] ?? `${year}-03-14`), name: 'Holi' },
        { date: goodFriday, name: 'Good Friday' },
        { date: islamic(year, 'eidFitr'), name: 'Eid al-Fitr' },
        { date: islamic(year, 'eidAdha'), name: 'Eid al-Adha (Bakrid)' },
        { date: d(year, 8, 15), name: 'Independence Day' },
        { date: d(year, 10, 2), name: 'Gandhi Jayanti' },
        { date: new Date(DIWALI[year] ?? `${year}-10-20`), name: 'Diwali' },
        { date: d(year, 12, 25), name: 'Christmas Day' },
      ];
    case 'PK':
      return [
        { date: d(year, 2, 5), name: 'Kashmir Solidarity Day' },
        { date: d(year, 3, 23), name: 'Pakistan Day' },
        { date: d(year, 5, 1), name: 'Labour Day' },
        { date: islamic(year, 'eidFitr'), name: 'Eid al-Fitr' },
        { date: islamic(year, 'eidFitr', 1), name: 'Eid al-Fitr Holiday' },
        { date: islamic(year, 'eidFitr', 2), name: 'Eid al-Fitr Holiday' },
        { date: islamic(year, 'eidAdha'), name: 'Eid al-Adha' },
        { date: islamic(year, 'eidAdha', 1), name: 'Eid al-Adha Holiday' },
        { date: islamic(year, 'eidAdha', 2), name: 'Eid al-Adha Holiday' },
        { date: islamic(year, 'ashura'), name: 'Ashura' },
        { date: islamic(year, 'ashura', 1), name: 'Ashura Holiday' },
        { date: d(year, 8, 14), name: 'Independence Day' },
        { date: d(year, 11, 9), name: 'Iqbal Day' },
        { date: d(year, 12, 25), name: 'Quaid-e-Azam Day' },
      ];
    case 'US':
      return [
        { date: observed(d(year, 1, 1)), name: "New Year's Day" },
        { date: nthWeekday(year, 1, 1, 3), name: 'Martin Luther King Jr. Day' },
        { date: nthWeekday(year, 2, 1, 3), name: "Presidents' Day" },
        { date: lastWeekday(year, 5, 1), name: 'Memorial Day' },
        { date: observed(d(year, 6, 19)), name: 'Juneteenth' },
        { date: observed(d(year, 7, 4)), name: 'Independence Day' },
        { date: nthWeekday(year, 9, 1, 1), name: 'Labor Day' },
        { date: nthWeekday(year, 10, 1, 2), name: 'Columbus Day' },
        { date: observed(d(year, 11, 11)), name: 'Veterans Day' },
        { date: nthWeekday(year, 11, 4, 4), name: 'Thanksgiving' },
        { date: addDays(nthWeekday(year, 11, 4, 4), 1), name: 'Day after Thanksgiving' },
        { date: observed(d(year, 12, 25)), name: 'Christmas Day' },
      ];
    case 'GB':
      return [
        { date: observed(d(year, 1, 1)), name: "New Year's Day" },
        { date: goodFriday, name: 'Good Friday' },
        { date: easterMonday, name: 'Easter Monday' },
        { date: nthWeekday(year, 5, 1, 1), name: 'Early May Bank Holiday' },
        { date: lastWeekday(year, 5, 1), name: 'Spring Bank Holiday' },
        { date: lastWeekday(year, 8, 1), name: 'Summer Bank Holiday' },
        { date: observed(d(year, 12, 25)), name: 'Christmas Day' },
        { date: observed(d(year, 12, 26)), name: 'Boxing Day' },
      ];
    case 'AU':
      return [
        { date: observed(d(year, 1, 1)), name: "New Year's Day" },
        { date: observed(d(year, 1, 26)), name: 'Australia Day' },
        { date: goodFriday, name: 'Good Friday' },
        { date: addDays(easter, -1), name: 'Easter Saturday' },
        { date: easterMonday, name: 'Easter Monday' },
        { date: d(year, 4, 25), name: 'Anzac Day' },
        { date: nthWeekday(year, 6, 1, 2), name: "King's Birthday (NSW)" },
        { date: nthWeekday(year, 10, 1, 1), name: 'Labour Day (NSW)' },
        { date: observed(d(year, 12, 25)), name: 'Christmas Day' },
        { date: observed(d(year, 12, 26)), name: 'Boxing Day' },
      ];
    case 'SG':
      return [
        { date: observed(d(year, 1, 1)), name: "New Year's Day" },
        { date: new Date(CNY[year] ?? `${year}-01-29`), name: 'Chinese New Year' },
        { date: addDays(new Date(CNY[year] ?? `${year}-01-29`), 1), name: 'Chinese New Year Holiday' },
        { date: goodFriday, name: 'Good Friday' },
        { date: d(year, 5, 1), name: 'Labour Day' },
        { date: new Date(VESAK[year] ?? `${year}-05-12`), name: 'Vesak Day' },
        { date: islamic(year, 'eidFitr'), name: 'Hari Raya Puasa' },
        { date: islamic(year, 'eidAdha'), name: 'Hari Raya Haji' },
        { date: d(year, 8, 9), name: 'National Day' },
        { date: new Date(DIWALI[year] ?? `${year}-10-20`), name: 'Deepavali' },
        { date: d(year, 12, 25), name: 'Christmas Day' },
      ];
    default:
      return [];
  }
}

/**
 * Builds the multi-year holiday dataset. `weekly_off` rows are included so the
 * roadmap/calendar can shade country-specific weekends with a reason.
 */
export function buildHolidayDataset(years: number[], countryCodes: string[]): Holiday[] {
  const out: Holiday[] = [];
  countryCodes.forEach((code) => {
    const cfg = countryByCode(code);
    years.forEach((year) => {
      generateCountryHolidays(code, year)
        .sort((a, b) => a.date.getTime() - b.date.getTime())
        .forEach((h, idx) => {
          out.push({
            id: `hol-${code}-${year}-${idx}`,
            countryCode: code,
            date: format(h.date, 'yyyy-MM-dd'),
            name: h.name,
            type: 'public_holiday',
          });
        });
      // Tentative recurring company policy: local weekend definition
      out.push({
        id: `weekend-${code}-${year}`,
        countryCode: code,
        date: `${year}-01-01`,
        name: `Weekly off: ${cfg.weeklyOff.map((n) => ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][n]).join(', ')}`,
        type: 'weekly_off',
      });
    });
  });
  return out;
}

export const holidaySeedForCountry = (code: string, year: number) =>
  generateCountryHolidays(code, year)
    .map((h) => ({ date: format(h.date, 'yyyy-MM-dd'), name: h.name }))
    .sort((a, b) => a.date.localeCompare(b.date));

export const todayISO = () => toISO(new Date());
