// src/engines/datetime.ts
import {
  addDays,
  addWeeks,
  addMonths,
  addYears,
  addHours,
  addMinutes,
  addSeconds,
  differenceInDays,
  differenceInWeeks,
  differenceInMonths,
  differenceInYears,
  differenceInHours,
  differenceInMinutes,
  differenceInSeconds,
  differenceInBusinessDays,
  getDaysInMonth,
  getQuarter,
  startOfQuarter,
  endOfQuarter,
  getDay,
  isLeapYear,
  parseISO,
  isValid,
  format,
  eachDayOfInterval,
  isWeekend,
} from 'date-fns';
import { normalizeDate, type NormalizeResult } from '../normalization.js';

export type DatetimeOperation =
  | 'difference'
  | 'add'
  | 'subtract'
  | 'business_days'
  | 'days_in_month'
  | 'age'
  | 'quarter'
  | 'day_of_week'
  | 'is_leap_year';

type DatetimeResult = { result: string; note?: string; [key: string]: unknown } | { error: string };

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const TIME_UNITS = new Set(['hours', 'minutes', 'seconds']);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseDate(input: unknown): { date: Date; norm: NormalizeResult } | { error: string } {
  if (typeof input !== 'string' || input.trim().length === 0) {
    return { error: 'A valid date string is required' };
  }

  const norm = normalizeDate(input);
  const value = norm.value;

  // Reject ambiguous numeric formats containing slashes (e.g. 12/03/2026)
  if (value.includes('/')) {
    return {
      error:
        'Date format is ambiguous (contains "/"). Please use ISO 8601 format (YYYY-MM-DD) or a named-month format (e.g. "March 15, 2026").',
    };
  }

  // Reject non-ISO dash formats (e.g. DD-MM-YYYY) — ISO requires YYYY first
  if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(value)) {
    return {
      error:
        'Date format is ambiguous. Please use ISO 8601 format (YYYY-MM-DD) or a named-month format (e.g. "15 March 2026").',
    };
  }

  const date = parseISO(value);
  if (!isValid(date)) {
    return { error: `Invalid date: "${input}"` };
  }

  return { date, norm };
}

function hasTimeComponent(input: string): boolean {
  return /T\d{2}:\d{2}/.test(input.trim());
}

function formatDate(date: Date, includeTime: boolean): string {
  if (includeTime) {
    return format(date, "yyyy-MM-dd'T'HH:mm:ss");
  }
  return format(date, 'yyyy-MM-dd');
}

function buildNote(norms: NormalizeResult[]): string | undefined {
  const notes: string[] = [];
  for (const n of norms) {
    if (n.wasTransformed) {
      notes.push(`'${n.original}' was interpreted as '${n.value}'`);
    }
  }
  return notes.length > 0 ? notes.join('; ') : undefined;
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

function opDifference(args: Record<string, unknown>): DatetimeResult {
  if (!args.from) return { error: 'Missing required parameter: from' };
  if (!args.to) return { error: 'Missing required parameter: to' };

  const parsedFrom = parseDate(args.from);
  if ('error' in parsedFrom) return parsedFrom;
  const parsedTo = parseDate(args.to);
  if ('error' in parsedTo) return parsedTo;

  const { date: fromDate, norm: normFrom } = parsedFrom;
  const { date: toDate, norm: normTo } = parsedTo;
  const note = buildNote([normFrom, normTo]);
  const unit = typeof args.unit === 'string' ? args.unit.toLowerCase() : undefined;

  // If a specific unit is requested, return a single value
  if (unit) {
    let diff: number;
    switch (unit) {
      case 'years':
        diff = differenceInYears(toDate, fromDate);
        break;
      case 'months':
        diff = differenceInMonths(toDate, fromDate);
        break;
      case 'weeks':
        diff = differenceInWeeks(toDate, fromDate);
        break;
      case 'days':
        diff = differenceInDays(toDate, fromDate);
        break;
      case 'hours':
        diff = differenceInHours(toDate, fromDate);
        break;
      case 'minutes':
        diff = differenceInMinutes(toDate, fromDate);
        break;
      case 'seconds':
        diff = differenceInSeconds(toDate, fromDate);
        break;
      default:
        return {
          error: `Unknown unit: "${unit}". Use years, months, weeks, days, hours, minutes, or seconds.`,
        };
    }
    const base: DatetimeResult = { result: `${diff} ${unit}`, [unit]: diff };
    if (note) (base as Record<string, unknown>).note = note;
    return base;
  }

  // Full breakdown: years → months → days → hours → minutes → seconds
  const negative = toDate < fromDate;
  let earlier = negative ? toDate : fromDate;
  const later = negative ? fromDate : toDate;
  const sign = negative ? -1 : 1;

  const years = differenceInYears(later, earlier);
  earlier = addYears(earlier, years);

  const months = differenceInMonths(later, earlier);
  earlier = addMonths(earlier, months);

  const days = differenceInDays(later, earlier);
  earlier = addDays(earlier, days);

  const hours = differenceInHours(later, earlier);
  earlier = addHours(earlier, hours);

  const minutes = differenceInMinutes(later, earlier);
  earlier = addMinutes(earlier, minutes);

  const seconds = differenceInSeconds(later, earlier);

  // Build human-readable result
  const parts: string[] = [];
  if (years > 0) parts.push(`${years} year${years !== 1 ? 's' : ''}`);
  if (months > 0) parts.push(`${months} month${months !== 1 ? 's' : ''}`);
  if (days > 0) parts.push(`${days} day${days !== 1 ? 's' : ''}`);
  if (hours > 0) parts.push(`${hours} hour${hours !== 1 ? 's' : ''}`);
  if (minutes > 0) parts.push(`${minutes} minute${minutes !== 1 ? 's' : ''}`);
  if (seconds > 0) parts.push(`${seconds} second${seconds !== 1 ? 's' : ''}`);

  const resultStr = parts.length > 0 ? (negative ? '-' : '') + parts.join(', ') : '0 days';

  const base: DatetimeResult = {
    result: resultStr,
    breakdown: {
      years: sign * years,
      months: sign * months,
      days: sign * days,
      hours: sign * hours,
      minutes: sign * minutes,
      seconds: sign * seconds,
    },
  };
  if (note) (base as Record<string, unknown>).note = note;
  return base;
}

function opAdd(args: Record<string, unknown>): DatetimeResult {
  if (!args.date) return { error: 'Missing required parameter: date' };
  if (args.amount === undefined || args.amount === null) {
    return { error: 'Missing required parameter: amount' };
  }
  if (!args.unit) return { error: 'Missing required parameter: unit' };

  const parsed = parseDate(args.date);
  if ('error' in parsed) return parsed;
  const { date, norm } = parsed;

  const amount = Number(args.amount);
  if (isNaN(amount)) return { error: `Invalid amount: "${args.amount}"` };

  const unit = String(args.unit).toLowerCase();
  let result: Date;

  switch (unit) {
    case 'days':
      result = addDays(date, amount);
      break;
    case 'weeks':
      result = addWeeks(date, amount);
      break;
    case 'months':
      result = addMonths(date, amount);
      break;
    case 'years':
      result = addYears(date, amount);
      break;
    case 'hours':
      result = addHours(date, amount);
      break;
    case 'minutes':
      result = addMinutes(date, amount);
      break;
    case 'seconds':
      result = addSeconds(date, amount);
      break;
    default:
      return {
        error: `Unknown unit: "${unit}". Use years, months, weeks, days, hours, minutes, or seconds.`,
      };
  }

  const includeTime = hasTimeComponent(String(args.date)) || TIME_UNITS.has(unit);
  const note = buildNote([norm]);
  const base: DatetimeResult = { result: formatDate(result, includeTime) };
  if (note) (base as Record<string, unknown>).note = note;
  return base;
}

function opSubtract(args: Record<string, unknown>): DatetimeResult {
  const amount = Number(args.amount);
  if (isNaN(amount)) return { error: `Invalid amount: "${args.amount}"` };
  return opAdd({ ...args, amount: -amount });
}

function opBusinessDays(args: Record<string, unknown>): DatetimeResult {
  if (!args.from) return { error: 'Missing required parameter: from' };
  if (!args.to) return { error: 'Missing required parameter: to' };

  const parsedFrom = parseDate(args.from);
  if ('error' in parsedFrom) return parsedFrom;
  const parsedTo = parseDate(args.to);
  if ('error' in parsedTo) return parsedTo;

  const { date: fromDate, norm: normFrom } = parsedFrom;
  const { date: toDate, norm: normTo } = parsedTo;
  const note = buildNote([normFrom, normTo]);

  // Base business days count from date-fns (excludes weekends)
  let bizDays = differenceInBusinessDays(toDate, fromDate);

  // Process holidays
  const holidays = Array.isArray(args.holidays) ? args.holidays : [];
  if (holidays.length > 0) {
    const negative = toDate < fromDate;
    const rangeStart = negative ? toDate : fromDate;
    const rangeEnd = negative ? fromDate : toDate;

    // Build the interval for iteration (inclusive of start, inclusive of end)
    const allDays = eachDayOfInterval({ start: rangeStart, end: rangeEnd });

    // Parse holiday dates into a set of date strings for fast lookup
    const holidaySet = new Set<string>();
    for (const h of holidays) {
      const parsedH = parseDate(h);
      if (!('error' in parsedH)) {
        holidaySet.add(format(parsedH.date, 'yyyy-MM-dd'));
      }
    }

    // Count holidays that fall on weekdays within the range.
    // differenceInBusinessDays counts weekdays from start (exclusive-ish) to end.
    // We need to match that behavior: iterate all days in range and subtract
    // holidays that are weekdays. differenceInBusinessDays for positive ranges
    // excludes the start date and includes the end date — but actually
    // differenceInBusinessDays(Fri, Mon) = 4 for Mon-Fri which means it counts
    // Tue, Wed, Thu, Fri (start excluded, end included). So holidays should
    // be checked on the same set: exclude start, include end.
    // For simplicity, we iterate the range (start+1 to end inclusive) and
    // subtract holidays that are weekdays.
    let holidayCount = 0;
    for (const day of allDays) {
      const dayStr = format(day, 'yyyy-MM-dd');
      if (holidaySet.has(dayStr) && !isWeekend(day)) {
        holidayCount++;
      }
    }

    // Apply holiday subtraction with correct sign
    if (negative) {
      bizDays += holidayCount;
    } else {
      bizDays -= holidayCount;
    }
  }

  const base: DatetimeResult = {
    result: `${bizDays} business days`,
    businessDays: bizDays,
  };
  if (note) (base as Record<string, unknown>).note = note;
  return base;
}

function opDaysInMonth(args: Record<string, unknown>): DatetimeResult {
  const year = Number(args.year);
  const month = Number(args.month);

  if (isNaN(year)) return { error: 'Missing required parameter: year' };
  if (isNaN(month)) return { error: 'Missing required parameter: month' };
  if (month < 1 || month > 12)
    return { error: `Invalid month: ${month}. Must be between 1 and 12.` };

  // month is 1-based, Date constructor uses 0-based months
  const date = new Date(year, month - 1, 1);
  const days = getDaysInMonth(date);

  return {
    result: `${days} days`,
    days,
    year,
    month,
  };
}

function opAge(args: Record<string, unknown>): DatetimeResult {
  if (!args.birthDate) return { error: 'Missing required parameter: birthDate' };
  if (!args.asOf) return { error: 'Missing required parameter: asOf' };

  const parsedBirth = parseDate(args.birthDate);
  if ('error' in parsedBirth) return parsedBirth;

  const norms: NormalizeResult[] = [parsedBirth.norm];
  const parsedAsOf = parseDate(args.asOf);
  if ('error' in parsedAsOf) return parsedAsOf;
  const asOfDate: Date = parsedAsOf.date;
  norms.push(parsedAsOf.norm);

  const { date: birthDate } = parsedBirth;

  // Compute age breakdown
  let cursor = birthDate;
  const years = differenceInYears(asOfDate, cursor);
  cursor = addYears(cursor, years);

  const months = differenceInMonths(asOfDate, cursor);
  cursor = addMonths(cursor, months);

  const days = differenceInDays(asOfDate, cursor);

  // Build human-readable result
  const parts: string[] = [];
  if (years > 0) parts.push(`${years} year${years !== 1 ? 's' : ''}`);
  if (months > 0) parts.push(`${months} month${months !== 1 ? 's' : ''}`);
  if (days > 0) parts.push(`${days} day${days !== 1 ? 's' : ''}`);
  const resultStr = parts.length > 0 ? parts.join(', ') : '0 days';

  const note = buildNote(norms);
  const base: DatetimeResult = { result: resultStr, years, months, days };
  if (note) (base as Record<string, unknown>).note = note;
  return base;
}

function opQuarter(args: Record<string, unknown>): DatetimeResult {
  if (!args.date) return { error: 'Missing required parameter: date' };

  const parsed = parseDate(args.date);
  if ('error' in parsed) return parsed;
  const { date, norm } = parsed;

  const q = getQuarter(date);
  const qStart = startOfQuarter(date);
  const qEnd = endOfQuarter(date);

  const note = buildNote([norm]);
  const base: DatetimeResult = {
    result: `Q${q} ${format(date, 'yyyy')}`,
    quarter: q,
    quarterStart: formatDate(qStart, false),
    quarterEnd: formatDate(qEnd, false),
  };
  if (note) (base as Record<string, unknown>).note = note;
  return base;
}

function opDayOfWeek(args: Record<string, unknown>): DatetimeResult {
  if (!args.date) return { error: 'Missing required parameter: date' };

  const parsed = parseDate(args.date);
  if ('error' in parsed) return parsed;
  const { date, norm } = parsed;

  const jsDayIndex = getDay(date); // 0=Sunday
  const dayNumber = jsDayIndex === 0 ? 7 : jsDayIndex; // ISO 8601: 1=Monday, 7=Sunday
  const dayName = DAY_NAMES[jsDayIndex];

  const note = buildNote([norm]);
  const base: DatetimeResult = {
    result: `${dayName} (day ${dayNumber})`,
    dayOfWeek: dayName,
    dayNumber,
  };
  if (note) (base as Record<string, unknown>).note = note;
  return base;
}

function opIsLeapYear(args: Record<string, unknown>): DatetimeResult {
  if (args.year === undefined || args.year === null) {
    return { error: 'Missing required parameter: year' };
  }
  const year = Number(args.year);
  if (isNaN(year)) return { error: `Invalid year: "${args.year}"` };

  const date = new Date(year, 0, 1);
  const leap = isLeapYear(date);

  return {
    result: String(leap),
    isLeapYear: leap,
    year,
  };
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

const operations: Record<DatetimeOperation, (args: Record<string, unknown>) => DatetimeResult> = {
  difference: opDifference,
  add: opAdd,
  subtract: opSubtract,
  business_days: opBusinessDays,
  days_in_month: opDaysInMonth,
  age: opAge,
  quarter: opQuarter,
  day_of_week: opDayOfWeek,
  is_leap_year: opIsLeapYear,
};

export function computeDatetime(
  operation: DatetimeOperation,
  args: Record<string, unknown>,
): DatetimeResult {
  const handler = operations[operation];
  if (!handler) {
    return { error: `Unknown operation: "${operation}"` };
  }
  try {
    return handler(args);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: message };
  }
}
