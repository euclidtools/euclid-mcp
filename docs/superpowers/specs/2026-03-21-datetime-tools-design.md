# DateTime Tools Design Spec

**Date:** 2026-03-21
**Status:** Approved
**Scope:** Add `datetime` MCP tool + skill + error-hints registry refactor

---

## Overview

Add a `datetime` tool to the Euclid MCP server that provides deterministic calendar and duration arithmetic. No timezone database, no DST — pure calendar math. Implements the datetime section of the Wave 1 expansion plan using `date-fns`.

Alongside the new tool, refactor `src/error-hints.ts` from a monolith to a registry pattern to support scaling to future tools.

## Dependency

**`date-fns`** — tree-shakeable date arithmetic library (~10-14 KB bundled, ~52M downloads/week, native TypeScript, ESM, zero transitive dependencies).

Chosen over:
- `dayjs` (~2 KB) — lacks built-in business day support
- `luxon` — not tree-shakeable
- `mathjs` — has no date/time functionality

## Tool Definition

### `datetime`

**Purpose:** Deterministic date/time arithmetic. No timezone conversions or DST transitions — pure calendar math.

**Disambiguation prompt:** "This tool performs calendar and duration arithmetic. It does not handle timezone conversions or DST transitions. Use `calculate` for pure number arithmetic. Use `convert` for time unit conversion (hours to minutes, etc.)."

### Input Schema

Uses the same `operation` enum pattern as the existing `statistics` tool:

```typescript
z.object({
  operation: z.enum([
    'difference', 'add', 'subtract', 'business_days',
    'days_in_month', 'age', 'quarter', 'day_of_week', 'is_leap_year'
  ]).describe('The datetime operation to perform'),
  date: z.string().optional().describe('ISO 8601 date (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss)'),
  from: z.string().optional().describe('Start date (ISO 8601)'),
  to: z.string().optional().describe('End date (ISO 8601)'),
  amount: z.number().optional().describe('Number of units to add/subtract'),
  unit: z.enum(['days', 'weeks', 'months', 'years', 'hours', 'minutes', 'seconds']).optional()
    .describe('Time unit for add/subtract/difference'),
  year: z.number().optional().describe('Year (for days_in_month, is_leap_year)'),
  month: z.number().optional().describe('Month 1-12 (for days_in_month)'),
  birthDate: z.string().optional().describe('Birth date (ISO 8601, for age)'),
  asOf: z.string().optional().describe('Reference date (ISO 8601, for age)'),
  holidays: z.array(z.string()).optional()
    .describe('ISO date strings to exclude as holidays (for business_days)'),
})
```

Required fields per operation are validated in the handler/engine, not the schema (same pattern as `statistics` where `percentile` is optional at schema level but required for the percentile operation).

### Operations (9)

#### `difference`

- **Required:** `from` (ISO date string), `to` (ISO date string)
- **Optional:** `unit` (`"days"` | `"weeks"` | `"months"` | `"years"` | `"hours"` | `"minutes"`, default: returns full breakdown)
- **Returns:** `{ result: "<N> <unit>" | "<Y>y <M>m <D>d ...", breakdown: { years, months, days, hours, minutes, seconds } }`
- **Note:** Accepts `from` after `to` — returns negative values (consistent with `date-fns` behavior).

#### `add`

- **Required:** `date` (ISO date string), `amount` (number), `unit`
- **Returns:** `{ result: "<ISO date>" }`

#### `subtract`

- **Required:** `date` (ISO date string), `amount` (number), `unit`
- **Returns:** `{ result: "<ISO date>" }`

#### `business_days`

- **Required:** `from` (ISO date string), `to` (ISO date string)
- **Optional:** `holidays` (ISO date string array — additional non-business days beyond weekends)
- **Returns:** `{ result: "<N>", businessDays: <N> }`
- **Note:** Accepts `from` after `to` — returns negative count (consistent with `difference` and `date-fns` `differenceInBusinessDays`).

#### `days_in_month`

- **Required:** `year` (number), `month` (number, 1-12)
- **Returns:** `{ result: "<N>", days: <N> }`

#### `age`

- **Required:** `birthDate` (ISO date string), `asOf` (ISO date string)
- **Returns:** `{ result: "<Y> years, <M> months, <D> days", years: <N>, months: <N>, days: <N> }`
- **Note:** `asOf` is required (no "today" default) to maintain determinism — same inputs always produce same outputs. The LLM knows the current date from its system prompt.

#### `quarter`

- **Required:** `date` (ISO date string)
- **Returns:** `{ result: "Q<N>", quarter: <N>, quarterStart: "<ISO>", quarterEnd: "<ISO>" }`

#### `day_of_week`

- **Required:** `date` (ISO date string)
- **Returns:** `{ result: "<day name>", dayOfWeek: "<day name>", dayNumber: <N> }` (dayNumber: 1=Monday through 7=Sunday, ISO 8601 weekday numbering)

#### `is_leap_year`

- **Required:** `year` (number)
- **Returns:** `{ result: "true" | "false", isLeapYear: boolean }`

### Date Format

- **Primary:** ISO 8601 (`"2026-03-12"`, `"2026-03-12T14:30:00"`)
- **Normalization:** Attempts to parse unambiguous natural formats (`"March 12, 2026"`, `"12 March 2026"`). Ambiguous numeric formats like `"12/03/2026"` (could be MM/DD or DD/MM) are **rejected** with an error hint requesting ISO format. This preserves determinism — the tool never guesses.

## File Structure

### New Files

```
src/engines/datetime.ts        — Pure date/time functions
src/tools/datetime.ts          — Tool definition (name, description, schema, handler)
src/error-hints/index.ts       — Registry + getErrorHint() dispatcher
src/error-hints/calculate.ts   — Calculate hints (migrated from monolith)
src/error-hints/convert.ts     — Convert hints (migrated from monolith)
src/error-hints/statistics.ts  — Statistics hints (migrated from monolith)
src/error-hints/datetime.ts    — Datetime hints
tests/datetime.test.ts         — Datetime operation tests
skills/math/DATETIME.md        — Datetime tool reference for LLMs
```

### Modified Files

```
src/index.ts                   — Register datetime tool
src/normalization.ts           — Add normalizeDate() function
src/tools/calculate.ts         — Update import path for error hints
src/tools/convert.ts           — Update import path for error hints
src/tools/statistics.ts        — Update import path for error hints
tests/error-hints.test.ts      — Update import path (../src/error-hints.js → ../src/error-hints/index.js)
skills/math/SKILL.md           — Add datetime to decision table + quick reference
hooks/session-start            — Mention datetime in injected context
.claude-plugin/plugin.json     — Update description to include datetime
package.json                   — Add date-fns dependency
```

### Deleted Files

```
src/error-hints.ts             — Replaced by src/error-hints/ directory
```

## Engine Module: `src/engines/datetime.ts`

Pure functions following the existing engine pattern. Each operation function returns a result type compatible with the existing `EngineResult` pattern:

- **Return type:** `{ result: string; [key: string]: unknown; note?: string } | { error: string }`
- The `result` field is always a **string** (human-readable summary), matching the existing `EngineResult` convention. Structured data (e.g., `years`, `months`, `days` for `age`) is returned as additional fields alongside `result`.
- Input validation (date parsing, range checks) happens inside the engine
- No exceptions thrown to caller — all errors returned as values
- Uses `date-fns` functions: `differenceInDays`, `differenceInBusinessDays`, `addDays`, `addMonths`, `addYears`, `getDaysInMonth`, `startOfQuarter`, `endOfQuarter`, `isWeekend`, `getDay`, `isLeapYear`, etc.

The tool handler serializes the full return object (including `result` + structured fields) via `JSON.stringify()`, same as existing tools.

## Normalization: `normalizeDate()`

A new function in `src/normalization.ts`:

- `"March 12, 2026"` → `"2026-03-12"`
- `"12 March 2026"` → `"2026-03-12"`
- Already-ISO strings pass through unchanged
- Ambiguous numeric formats (`"12/03/2026"`) are **not** normalized — returned as-is so the engine rejects them with an error hint requesting ISO format
- Returns original string if unparseable (engine catches and returns error with hint)
- When normalization occurs, the tool handler includes a `note` field (e.g., `"Interpreted 'March 12, 2026' as 2026-03-12"`) consistent with how existing tools report normalization.

## Error Hints Registry

### Architecture

- `src/error-hints/index.ts` — Exports `getErrorHint(tool: ToolName, error: string)` where `ToolName = 'calculate' | 'convert' | 'statistics' | 'datetime'`. The union grows as tools are added, preserving type safety at call sites.
- Each per-tool module exports a `getHint(error: string): ErrorHint` function and a `EXAMPLES: string[]` constant
- `index.ts` maps tool names to their modules and dispatches accordingly
- Existing consumers continue calling `getErrorHint()` with the same signature — no breaking change to the public API

### Datetime Hints

| Pattern | Hint |
|---------|------|
| Invalid date | "Date must be in ISO 8601 format: YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss" |
| Invalid month | "Month must be between 1 and 12" |
| Missing required fields | "Operation '<op>' requires fields: <list>. See tool description for details" |
| Unparseable natural date | "Could not parse date. Use ISO format: 2026-03-21" |
| Ambiguous numeric date | "Ambiguous date format. Use ISO format YYYY-MM-DD to avoid DD/MM vs MM/DD confusion" |

## Skills

### New: `skills/math/DATETIME.md`

- All 9 operations with input/output examples
- ISO 8601 format guidance
- Common patterns: "How many days between X and Y", "What date is 90 days from X", "How old is someone born on X"
- Disambiguation: datetime vs calculate vs convert

### Updated: `skills/math/SKILL.md`

- Add `datetime` to the "Which Tool to Use" decision table
- Add quick reference examples for datetime operations
- Reference `DATETIME.md` for detailed documentation

### Updated: `hooks/session-start`

- Mention `datetime` alongside existing tools in the injected context

## Testing: `tests/datetime.test.ts`

### Operation Tests

All 9 operations with expected inputs/outputs.

### Edge Cases

- Leap year handling (Feb 29, day_of_week on Feb 29, is_leap_year for century years)
- Month boundary arithmetic (Jan 31 + 1 month)
- End-of-month add behavior
- Business days spanning weekends
- Business days with custom holidays
- Year boundary crossing
- Date-only vs datetime inputs
- Negative differences (from after to)

### Error Cases

- Invalid date strings
- Ambiguous numeric date formats (e.g., `12/03/2026`)
- Invalid month numbers (0, 13)
- Missing required fields per operation
- Unparseable natural language dates

## Design Decisions

1. **`date-fns` over mathjs** — mathjs has no date/time functionality at all
2. **`date-fns` over `dayjs`** — dayjs lacks built-in business day support
3. **`date-fns` over `luxon`** — luxon is not tree-shakeable
4. **`asOf` required in `age`** — determinism: same inputs always produce same outputs
5. **No timezone/DST** — keeps the tool simple and deterministic; timezone math is a different domain
6. **Error hints registry refactor** — scales to future Wave 1 tools without growing a monolith
7. **Separate engine module** (`src/engines/datetime.ts`) — keeps existing `src/engine.ts` untouched
8. **Reject ambiguous date formats** — `12/03/2026` could be MM/DD or DD/MM; rejecting with a hint preserves determinism
9. **`result` always a string** — engine returns `{ result: string, ...structuredFields }` matching the existing `EngineResult` convention; structured data is additional fields
10. **`ToolName` union type** — error-hints registry uses a union type (`'calculate' | ... | 'datetime'`) rather than `string` to preserve type safety
11. **`difference` and `business_days` accept reversed ranges** — returns negative values rather than erroring, consistent with `date-fns` behavior and `difference` symmetry
