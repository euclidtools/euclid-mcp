# Datetime Reference — `datetime` tool

## Operations

| Operation       | Required Fields          | Optional Fields | Returns                                      |
| --------------- | ------------------------ | --------------- | -------------------------------------------- |
| `difference`    | `from`, `to`, `unit`     | —               | Signed integer count of `unit` between dates |
| `add`           | `date`, `amount`, `unit` | —               | ISO 8601 date string after adding            |
| `subtract`      | `date`, `amount`, `unit` | —               | ISO 8601 date string after subtracting       |
| `business_days` | `from`, `to`             | —               | Count of weekdays (Mon–Fri) between dates    |
| `days_in_month` | `year`, `month`          | —               | Number of days in that month                 |
| `age`           | `birthDate`, `asOf`      | —               | Age in whole years                           |
| `quarter`       | `date`                   | —               | Quarter number (1–4)                         |
| `day_of_week`   | `date`                   | —               | Day name (e.g., `"Monday"`)                  |
| `is_leap_year`  | `year`                   | —               | Boolean (`true` / `false`)                   |

## Examples

### `difference` — days between two dates

```
datetime({ operation: "difference", from: "2026-01-01", to: "2026-03-15", unit: "days" })
// → 73
```

```
datetime({ operation: "difference", from: "2026-03-15", to: "2026-01-01", unit: "days" })
// → -73  (reversed range returns a negative number)
```

### `add` — advance a date

```
datetime({ operation: "add", date: "2026-01-01", amount: 90, unit: "days" })
// → "2026-04-01"
```

```
datetime({ operation: "add", date: "2026-01-31", amount: 1, unit: "months" })
// → "2026-02-28"  (clamped to last day of month)
```

### `subtract` — move a date backwards

```
datetime({ operation: "subtract", date: "2026-03-21", amount: 2, unit: "weeks" })
// → "2026-03-07"
```

### `business_days` — weekdays between two dates

```
datetime({ operation: "business_days", from: "2026-03-16", to: "2026-03-20" })
// → 5
```

### `days_in_month` — days in a given month

```
datetime({ operation: "days_in_month", year: 2024, month: 2 })
// → 29  (2024 is a leap year)
```

```
datetime({ operation: "days_in_month", year: 2026, month: 2 })
// → 28
```

### `age` — whole years elapsed

```
datetime({ operation: "age", birthDate: "1990-06-15", asOf: "2026-03-21" })
// → 35
```

### `quarter` — calendar quarter

```
datetime({ operation: "quarter", date: "2026-03-21" })
// → 1
```

```
datetime({ operation: "quarter", date: "2026-07-04" })
// → 3
```

### `day_of_week` — name of the weekday

```
datetime({ operation: "day_of_week", date: "2026-03-21" })
// → "Saturday"
```

### `is_leap_year` — leap year check

```
datetime({ operation: "is_leap_year", year: 2024 })
// → true
```

```
datetime({ operation: "is_leap_year", year: 2026 })
// → false
```

## Date Format

**Primary format:** ISO 8601 — `YYYY-MM-DD` (e.g., `"2026-03-21"`). Always use this format
when constructing inputs.

**Natural formats accepted:** Common unambiguous forms such as `"March 21, 2026"` or
`"21 Mar 2026"` are parsed correctly.

**Ambiguous formats rejected:** Formats like `"03/04/2026"` (could be March 4 or April 3
depending on locale) are rejected with an error. Always use ISO 8601 to avoid ambiguity.

## Valid Units

Used by `difference`, `add`, and `subtract`:

| Unit      | Description       |
| --------- | ----------------- |
| `days`    | Calendar days     |
| `weeks`   | 7-day periods     |
| `months`  | Calendar months   |
| `years`   | Calendar years    |
| `hours`   | 60-minute periods |
| `minutes` | 60-second periods |
| `seconds` | SI seconds        |

## Common Errors

| Error                           | Cause                                    | Fix                                            |
| ------------------------------- | ---------------------------------------- | ---------------------------------------------- |
| `"Invalid date: ..."`           | Unparseable or non-existent date string  | Use ISO 8601 format (`YYYY-MM-DD`)             |
| `"Ambiguous date format: ..."`  | Format like `MM/DD/YYYY` or `DD/MM/YYYY` | Use ISO 8601 format (`YYYY-MM-DD`)             |
| `"Invalid month: ..."`          | Month number outside 1–12                | Use an integer from 1 (Jan) to 12 (Dec)        |
| `"Missing required field: ..."` | Required field for the operation omitted | Check the operations table for required fields |
| `"Unknown operation: ..."`      | Typo or unsupported operation name       | Use one of the 9 valid operation names         |

## Key Design Notes

**Determinism — always supply `asOf`:** Operations like `age` require an explicit `asOf`
date rather than reading the system clock. This makes results deterministic and reproducible.
When the user says "today", substitute the known current date explicitly.

**No timezone or DST handling:** All dates are treated as calendar dates with no timezone
conversion. Times-of-day and DST transitions are out of scope.

**Reversed ranges are valid:** `difference` with `from` after `to` returns a negative
number. This is intentional — it is not an error.
