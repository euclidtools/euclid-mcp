# Euclid MCP Tool Expansion Design

**Date:** 2026-03-12
**Status:** Approved
**Scope:** 15 new math domain tools across 3 implementation waves

## Vision

Euclid MCP will become the universal deterministic math layer for any LLM agent. Any user can plug it into any industry-specific agent and be confident that the LLM will know which tools to use and when. The tool boundaries match math domains, not end-user problems — LLMs handle composition across tools.

## Design Principles

1. **Umbrella tools with operation enums** — Each tool represents one math domain. An `operation` enum selects the specific calculation (same pattern as the existing `statistics` tool). This keeps tool count manageable for LLM tool selection (18 total) while offering ~161 operations.
2. **LLM-first descriptions** — Every tool description is a prompt that teaches the model: what the tool does, when to use it vs. alternatives, available operations, and example calls.
3. **Deterministic only** — No randomness, no external data, no network calls. Same input always produces the same output.
4. **Composition over coverage** — General tools that chain well beat domain-specific shortcuts. LLMs compose `calculate` + `convert` + `financial` to solve complex problems.

## Architecture

### File Structure

Each new tool introduces:

```
src/tools/<domain>.ts        — Tool definition (name, description, inputSchema, handler)
src/engines/<domain>.ts      — Engine functions (pure math, validation, sandboxing)
tests/<domain>.test.ts       — Operation-level test coverage
```

Existing modules are extended (not refactored):

```
src/error-hints.ts           — New hint patterns per domain
src/normalization.ts         — New normalization rules where needed
src/index.ts                 — New tool registrations
```

### Engine Module Pattern

Each engine module exports pure functions following the existing `EngineResult` pattern:

```typescript
// src/engines/financial.ts
export function computeFinancial(operation: string, params: Record<string, unknown>): EngineResult {
  // Input validation
  // Computation
  // Return { result: ... } or { error: ... }
}
```

Engine modules may reuse mathjs for underlying math but add no new runtime dependencies unless absolutely necessary.

### Response Contract (Unchanged)

```typescript
// Success
{ result: string | object, note?: string }

// Error
{ error: string, hint: string, examples: string[] }
```

### Dependency Strategy

**Principle:** Use mathjs where it covers the need. Where it doesn't, prefer well-known, battle-tested, zero-transitive-dependency packages over custom implementations. Only write custom code when no suitable package exists or the algorithm is trivial (< 30 lines).

#### mathjs v15 Coverage

mathjs provides: arithmetic, linear algebra (matrix ops, eigenvalues, lusolve), unit conversion, combinatorics (factorial, combinations, permutations), basic number theory (isPrime, gcd, lcm, xgcd, invmod), trig, and the sandboxed expression evaluator.

mathjs does NOT provide: financial functions, probability distributions, date/time, regression/curve fitting, numerical definite integration, prime factorization, or advanced number theory.

#### New Runtime Dependencies

All recommended packages have **zero transitive dependencies** and are **tree-shakeable**.

| Package      | Purpose                                                               | Size (min+gz)           | Downloads/week | TypeScript        | ESM                |
| ------------ | --------------------------------------------------------------------- | ----------------------- | -------------- | ----------------- | ------------------ |
| `financial`  | TVM: PV, FV, PMT, NPV, IRR, NPER, RATE, MIRR                          | ~3 KB                   | ~24K           | Native            | Yes                |
| `date-fns`   | Date arithmetic, business days, duration math                         | ~10-14 KB (tree-shaken) | ~52M           | Native            | Yes                |
| `jstat`      | Probability distributions (normal, binomial, Poisson PDF/CDF/inverse) | ~18 KB                  | ~433K          | @types/jstat      | CJS (Node interop) |
| `geolib`     | Geodesic: haversine, bearing, destination, bounding box               | ~10 KB                  | ~451K          | Native            | Yes                |
| `regression` | Linear, polynomial, exponential, logarithmic, power regression        | ~5 KB                   | ~208K          | @types/regression | Yes                |
| **Total**    |                                                                       | **~46-50 KB**           |                |                   |                    |

**Alternative considered for distributions:** `simple-statistics` (~568K downloads) covers normal CDF/probit but lacks inverse CDF for binomial/Poisson. `jstat` provides complete `.pdf()`, `.cdf()`, `.inv()` for all needed distributions. `jstat` is CJS-only; it imports via Node's ESM-CJS interop layer (`import jStat from 'jstat'`). Tree-shaking will not apply — the full ~18 KB is bundled. This is acceptable given the package size. If ESM becomes a hard requirement, the fallback is custom implementations using well-known approximations (Abramowitz-Stegun for normal CDF, direct summation for binomial/Poisson CDF) — roughly ~80 lines total.

**Alternative considered for dates:** `dayjs` (~40M downloads, ~2 KB) lacks built-in business day support. `luxon` (~24M) is not tree-shakeable. `date-fns` has business day functions built in and tree-shakes to only what we import.

**Alternative considered for regression:** `ml-regression` (more actively maintained, May 2025) is modular but heavier. `regression` (regression-js) covers all 5 types in one small package. If `regression` becomes a maintenance concern, `ml-regression` is the fallback.

#### Custom Implementations (No Suitable Package)

| Domain             | What to implement                                                                                             | Why custom                                                                                                         | Complexity       |
| ------------------ | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------- |
| Number theory      | Prime factorization (trial division + Pollard-Rho), Euler's totient, modPow, sieve of Eratosthenes, nth prime | Best available package (`number-theory`) is unmaintained, no TS, no ESM. Algorithms are small and well-documented. | ~80 lines total  |
| Numerical calculus | Trapezoidal rule, Simpson's rule, central difference, limits                                                  | No well-known packages exist. Algorithms are straightforward. Reuses existing sandboxed evaluator.                 | ~60 lines total  |
| Boolean logic      | Recursive descent parser, truth table generator, simplification                                               | Problem is self-contained. Existing packages are unmaintained or negligible adoption.                              | ~150 lines total |
| Financial extras   | Amortization schedules, depreciation, ROI, break-even, markup                                                 | Simple formulas on top of `financial` package primitives.                                                          | ~50 lines total  |
| Regression extras  | Simple/exponential moving averages                                                                            | Trivial sliding-window arithmetic.                                                                                 | ~15 lines total  |

#### Dependency per Wave

| Wave   | New Dependencies                 |
| ------ | -------------------------------- |
| Wave 1 | `financial`, `date-fns`, `jstat` |
| Wave 2 | (none — mathjs + custom code)    |
| Wave 3 | `geolib`, `regression`           |

### Output Precision Policy

All floating-point results are formatted to 14 significant digits (matching the existing `calculate` tool default) unless the operation returns an exact integer. Individual tools do not expose a `precision` parameter — consistency across tools is more valuable than per-call configurability. If a future need arises, precision can be added as a global server config rather than per-tool schema bloat.

### Error Hints Module Strategy

Rather than extending the existing `src/error-hints.ts` monolith to 18 tools, adopt a registry pattern:

```
src/error-hints/index.ts       — registry + getErrorHint() dispatcher
src/error-hints/calculate.ts   — calculate hints (migrated from current file)
src/error-hints/financial.ts   — financial hints
src/error-hints/datetime.ts    — datetime hints
...
```

Each engine module registers its own hints. The dispatcher routes by tool name. This aligns with the per-domain engine module pattern.

### Array Size Limits Policy

All operations accepting arrays enforce a default maximum of 10,000 elements (matching the existing `statistics` tool limit) unless the operation-specific section states otherwise. For set operations, individual set sizes are limited to 100,000 and total combined elements to 1,000,000.

### Cross-Tool Overlap Resolution

Several operations exist in multiple tools by design. The resolution policy:

| Overlap                                            | Resolution                                                                                                                                                                                                                                                                       |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `factorial` in `probability` vs `calculate` (`n!`) | `probability.factorial` is a convenience alias. Description says: "Equivalent to calculate('n!'). Use whichever tool you are already calling."                                                                                                                                   |
| `linear_system` in `solve` vs `matrix.solve`       | `solve.linear_system` is the preferred interface for "solve these equations." `matrix.solve` is for users already working with matrices. Description says: "Preferred for solving systems of equations. Use matrix.solve only when you need the raw matrix result."              |
| `markup`/`margin` in `financial` vs `proportion`   | `financial.markup` computes both from cost + selling price. `proportion.markup_to_margin`/`margin_to_markup` converts between the two formats. Description says: "Use financial.markup to compute from prices. Use proportion to convert between markup and margin percentages." |
| `midpoint` in `geometry` vs `navigation`           | Different domains: Cartesian vs geodesic. Descriptions reference each other: "For lat/lon coordinates, use navigation.midpoint instead."                                                                                                                                         |
| `weighted_average` in `proportion`                 | Lives only in `proportion`. Not added to `statistics` to avoid overlap. Description says: "For weighted averages, use proportion.weighted_average."                                                                                                                              |

### Testing Strategy

Each tool gets a dedicated test file with:

- Every operation tested with known-value assertions
- Edge cases (division by zero, empty inputs, boundary values)
- Error hint coverage (invalid operation, bad params)
- Normalization coverage where applicable

---

## Tool Summary

| Wave | Tool           | Operations | Description                                |
| ---- | -------------- | ---------- | ------------------------------------------ |
| —    | `calculate`    | (existing) | Expression evaluation                      |
| —    | `convert`      | (existing) | Unit conversion                            |
| —    | `statistics`   | (existing) | Descriptive statistics                     |
| 1    | `financial`    | 13         | Time value of money, loans, business math  |
| 1    | `datetime`     | 9          | Date/time arithmetic                       |
| 1    | `proportion`   | 10         | Percentages, ratios, weighted averages     |
| 1    | `geometry`     | 13         | Shapes, solids, coordinate geometry        |
| 1    | `probability`  | 11         | Combinatorics, events, distributions       |
| 2    | `numbertheory` | 12         | Primes, divisibility, modular arithmetic   |
| 2    | `matrix`       | 14         | Linear algebra, vectors                    |
| 2    | `base`         | 13         | Number systems, bitwise operations         |
| 2    | `sequence`     | 10         | Arithmetic/geometric series, summation     |
| 2    | `solve`        | 5          | Equation solving, root finding             |
| 3    | `navigation`   | 8          | Geodesic distance, bearing, coordinates    |
| 3    | `regression`   | 8          | Curve fitting, interpolation, prediction   |
| 3    | `calculus`     | 5          | Numerical integration, derivatives, limits |
| 3    | `sets`         | 10         | Set-theoretic operations                   |
| 3    | `logic`        | 4          | Boolean algebra, truth tables              |
|      | **Total**      | **~160**   |                                            |

---

## Wave 1 — Tier 1 (High Demand, Broadly Useful)

### 1.1 `financial`

**Purpose:** Time value of money, loan/investment math, business profitability calculations.

**Disambiguation:** "Use `financial` for time-value-of-money, loans, investments, and business profitability. Use `calculate` for basic arithmetic. Use `proportion` for simple percentage calculations."

#### Operations

**`simple_interest`**

- Required: `principal` (number), `rate` (number), `time` (number)
- Optional: `timeUnit` (string, default: "year")
- Returns: `{ interest, total }`
- Formula: I = P × r × t

**`compound_interest`**

- Required: `principal` (number), `rate` (number), `time` (number)
- Optional: `timeUnit` (string, default: "year"), `frequency` (number, default: 12)
- Returns: `{ interest, total, effectiveRate }`
- Formula: A = P(1 + r/n)^(nt)

**`present_value`**

- Required: `futureValue` (number), `rate` (number), `periods` (number)
- Optional: `frequency` (number, default: 1)
- Returns: `{ presentValue }`
- Formula: PV = FV / (1 + r/n)^(nt)

**`future_value`**

- Required: `presentValue` (number), `rate` (number), `periods` (number)
- Optional: `frequency` (number, default: 1)
- Returns: `{ futureValue }`
- Formula: FV = PV × (1 + r/n)^(nt)

**`npv`**

- Required: `rate` (number), `cashFlows` (number[])
- Optional: `initialInvestment` (number, default: 0)
- Returns: `{ npv }`
- Formula: NPV = -I + Σ(CFt / (1 + r)^t)

**`irr`**

- Required: `cashFlows` (number[], first element typically negative as initial investment)
- Optional: `guess` (number, default: 0.1)
- Returns: `{ irr }`
- Implementation: Newton's method on NPV equation

**`loan_payment`**

- Required: `principal` (number), `rate` (number), `periods` (number)
- Optional: `frequency` (number, default: 12)
- Returns: `{ payment, totalPaid, totalInterest }`
- Formula: PMT = P × (r/n) / (1 - (1 + r/n)^(-periods))

**`amortization`**

- Required: `principal` (number), `rate` (number), `periods` (number)
- Optional: `frequency` (number, default: 12)
- Returns: `{ payment, schedule[] }` where each entry: `{ period, payment, principal, interest, balance }`
- Limit: Max 600 periods (50 years monthly). Returns error if exceeded.

**`depreciation`**

- Required: `cost` (number), `salvageValue` (number), `lifespan` (number)
- Optional: `method` ("straight_line" | "declining_balance", default: "straight_line")
- Returns: `{ annualDepreciation, schedule[] }` where each entry: `{ year, depreciation, bookValue }`

**`roi`**

- Required: `gain` (number), `cost` (number)
- Returns: `{ roi, roiPercent }` (decimal + display string, per Rate Convention)
- Formula: ROI = (gain - cost) / cost

**`break_even`**

- Required: `fixedCosts` (number), `pricePerUnit` (number), `variableCostPerUnit` (number)
- Returns: `{ breakEvenUnits, breakEvenRevenue }`
- Formula: Units = fixedCosts / (pricePerUnit - variableCostPerUnit)

**`markup`**

- Required: `cost` (number), `sellingPrice` (number)
- Returns: `{ markup, markupPercent, margin, marginPercent }` (decimal + display string, per Rate Convention)
- Formulas: Markup = (sell - cost) / cost; Margin = (sell - cost) / sell

**`discount`**

- Required: `originalPrice` (number), `discountPercent` (number)
- Optional: `taxPercent` (number)
- Returns: `{ discountedPrice, savings, finalPrice }`

#### Rate Convention

**Input:** All rates as decimals: 0.065 = 6.5%. The tool description states this explicitly with examples. Rates are validated as `z.number()` in the Zod schema — string inputs are rejected at the schema level.

**Output:** All rate/percentage outputs include BOTH formats to eliminate ambiguity:

- `effectiveRate: 0.0672` (decimal) + `effectiveRatePercent: "6.72%"` (display string)
- `roi: 0.15` (decimal) + `roiPercent: "15%"` (display string)
- `irr: 0.0834` (decimal) + `irrPercent: "8.34%"` (display string)

This ensures LLMs never have to guess the format when chaining `financial` output into `proportion` (which expects human-readable percentages).

#### Error Hints

- Rate > 1 warning: "Rate appears to be a percentage. Financial tool uses decimals: 0.065 for 6.5%, not 6.5"
- Negative principal/periods: "Principal and periods must be positive"
- IRR no convergence: "IRR did not converge. Cash flows may not have a real IRR (need at least one sign change)"
- Division by zero in break-even: "Price per unit must be greater than variable cost per unit"

---

### 1.2 `datetime`

**Purpose:** Deterministic date/time arithmetic. No timezone database, no DST — pure calendar math.

**Disambiguation:** "This tool performs calendar and duration arithmetic. It does not handle timezone conversions or DST transitions. Use `calculate` for pure number arithmetic."

#### Operations

**`difference`**

- Required: `from` (ISO date string), `to` (ISO date string)
- Optional: `unit` ("days" | "weeks" | "months" | "years" | "hours" | "minutes", default: returns breakdown)
- Returns: `{ difference, breakdown: { years, months, days, hours, minutes, seconds } }`

**`add`**

- Required: `date` (ISO date string), `amount` (number), `unit` ("days" | "weeks" | "months" | "years" | "hours" | "minutes" | "seconds")
- Returns: `{ result }` (ISO date string)

**`subtract`**

- Required: `date` (ISO date string), `amount` (number), `unit` (same as add)
- Returns: `{ result }` (ISO date string)

**`business_days`**

- Required: `from` (ISO date string), `to` (ISO date string)
- Optional: `holidays` (ISO date string[])
- Returns: `{ businessDays }`
- Excludes Saturdays, Sundays, and any dates in `holidays`

**`day_of_week`**

- Required: `date` (ISO date string)
- Returns: `{ dayOfWeek, dayNumber }` (dayNumber: 0=Monday through 6=Sunday)

**`is_leap_year`**

- Required: `year` (number)
- Returns: `{ isLeapYear }`

**`days_in_month`**

- Required: `year` (number), `month` (number, 1-12)
- Returns: `{ days }`

**`age`**

- Required: `birthDate` (ISO date string), `asOf` (ISO date string)
- Returns: `{ years, months, days }`
- Note: `asOf` is required (not defaulting to "today") to maintain determinism — same inputs always produce same outputs. The LLM knows the current date from its system prompt.

**`quarter`**

- Required: `date` (ISO date string)
- Returns: `{ quarter, quarterStart, quarterEnd }`

#### Date Format

Primary: ISO 8601 (`"2026-03-12"`, `"2026-03-12T14:30:00"`). Normalization attempts to parse common natural formats (`"March 12, 2026"`, `"12/03/2026"`) but the description recommends ISO.

#### Implementation

Uses `date-fns` for date arithmetic, business day calculations, and duration math. Key functions: `differenceInDays`, `differenceInBusinessDays`, `addDays`, `addMonths`, `addYears`, `isLeapYear`, `getDay`, `eachDayOfInterval`, `isWeekend`. Native `Date` for ISO parsing. `date-fns` is tree-shakeable so only imported functions are bundled.

#### Error Hints

- Invalid date: "Date must be in ISO 8601 format: YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss"
- Invalid month: "Month must be between 1 and 12"
- Business days from > to: "Start date must be before end date"

---

### 1.3 `proportion`

**Purpose:** Percentage and ratio calculations — the most common source of LLM arithmetic errors.

**Disambiguation:** "Use `proportion` for percentage and ratio math. Use `financial` for interest, loans, and investment returns. Use `statistics` for mean, median, and statistical analysis of datasets."

#### Operations

**`percentage_of`**

- Required: `percent` (number), `total` (number)
- Returns: `{ result }`
- Formula: result = (percent / 100) × total

**`percentage_change`**

- Required: `from` (number), `to` (number)
- Returns: `{ change, direction }` (direction: "increase" | "decrease" | "none")
- Formula: change = ((to - from) / |from|) × 100

**`percentage_difference`**

- Required: `a` (number), `b` (number)
- Returns: `{ difference }`
- Formula: difference = (|a - b| / ((a + b) / 2)) × 100

**`what_percent`**

- Required: `part` (number), `whole` (number)
- Returns: `{ percent }`
- Formula: percent = (part / whole) × 100

**`ratio_simplify`**

- Required: `values` (number[])
- Returns: `{ simplified, ratio }` (ratio as string e.g. "3:2:1")
- Implementation: Divide all values by their GCD

**`ratio_scale`**

- Required: `ratio` (number[]), `targetSum` (number)
- Returns: `{ scaled }`
- Formula: Each value × (targetSum / sum of ratio values)

**`compound_change`**

- Required: `changes` (number[], each as percentage)
- Returns: `{ netChange, finalMultiplier }`
- Formula: multiplier = Π((100 + change) / 100); netChange = (multiplier - 1) × 100

**`weighted_average`**

- Required: `values` (number[]), `weights` (number[])
- Returns: `{ result }`
- Formula: Σ(value × weight) / Σ(weights)

**`markup_to_margin`**

- Required: `markup` (number, percentage)
- Returns: `{ margin }`
- Formula: margin = markup / (100 + markup) × 100

**`margin_to_markup`**

- Required: `margin` (number, percentage)
- Returns: `{ markup }`
- Formula: markup = margin / (100 - margin) × 100

#### Percentage Convention

Percentages as human-readable numbers: 25 = 25%, NOT 0.25. This is the opposite of `financial` (which uses decimals for rates). The description is explicit about this. Normalization strips trailing `%` signs.

**Important:** The tool description will include: "This tool uses whole-number percentages (25 = 25%). If you have a decimal rate from the financial tool (e.g., 0.065), multiply by 100 first."

#### Error Hints

- Division by zero in percentage_change: "Cannot calculate percentage change from zero"
- Mismatched array lengths: "Values and weights arrays must have the same length"
- Margin >= 100: "Margin cannot be 100% or greater"
- Value < 1 warning for percentage inputs: "Value {v} appears to be a decimal rate, not a percentage. Use 6.5 for 6.5%, not 0.065"

---

### 1.4 `geometry`

**Purpose:** Shape measurements, solid volumes, and coordinate geometry.

**Disambiguation:** "Use `geometry` for area, perimeter, volume, and coordinate calculations with abstract shapes. Use `navigation` for real-world distance/bearing with latitude/longitude. Use `calculate` for general trigonometry."

#### Operations

**`circle`**

- Required: `radius` (number)
- Optional: `property` ("area" | "circumference" | "diameter" | "all", default: "all")
- Returns: requested properties
- Formulas: A = πr², C = 2πr, d = 2r

**`rectangle`**

- Required: `width` (number), `height` (number)
- Optional: `property` ("area" | "perimeter" | "diagonal" | "all", default: "all")
- Returns: requested properties
- Formulas: A = w×h, P = 2(w+h), d = √(w²+h²)

**`triangle`**

- Required: One of:
  - `base` + `height` (fast-path: area only)
  - Any 3 of: `sideA`, `sideB`, `sideC`, `angleA`, `angleB`, `angleC` (general solver)
- Optional: `property` ("area" | "perimeter" | "all", default: "all"), `angleUnit` ("degrees" | "radians", default: "degrees")
- Returns: All computable values (sides, angles, area, perimeter)
- Implementation: Law of sines, law of cosines, Heron's formula, angle sum = 180°
- Note: Subsumes the previously separate `triangle_solve` operation — one unified triangle operation handles all cases.

**`polygon`**

- Required: `sides` (number, >= 3), `sideLength` (number)
- Optional: `property` ("area" | "perimeter" | "all")
- Returns: area (regular polygon formula), perimeter
- Formula: A = (n × s² × cot(π/n)) / 4

**`ellipse`**

- Required: `semiMajor` (number), `semiMinor` (number)
- Optional: `property` ("area" | "circumference" | "all")
- Returns: area (πab), circumference (Ramanujan approximation)

**`sphere`**

- Required: `radius` (number)
- Optional: `property` ("volume" | "surfaceArea" | "all")
- Returns: V = (4/3)πr³, SA = 4πr²

**`cylinder`**

- Required: `radius` (number), `height` (number)
- Optional: `property` ("volume" | "surfaceArea" | "lateralArea" | "all")
- Returns: V = πr²h, SA = 2πr(r+h), LA = 2πrh

**`cone`**

- Required: `radius` (number), `height` (number)
- Optional: `property` ("volume" | "surfaceArea" | "slantHeight" | "all")
- Returns: V = (1/3)πr²h, slant = √(r²+h²), SA = πr(r+slant)

**`prism`**

- Required: `baseArea` (number), `height` (number)
- Returns: `{ volume }` (V = baseArea × height)

**`distance`**

- Required: `point1` (number[], 2D or 3D), `point2` (number[], same dimension)
- Returns: `{ distance }`
- Formula: Euclidean distance

**`midpoint`**

- Required: `point1` (number[]), `point2` (number[])
- Returns: `{ midpoint }` (number[])

**`slope`**

- Required: `point1` ([x, y]), `point2` ([x, y])
- Returns: `{ slope, yIntercept, equation }` (equation as string "y = mx + b")
- Handles vertical lines (undefined slope)

#### Angle Convention

Degrees by default. Optional `angleUnit: "radians"` on operations involving angles (currently `triangle`).

#### Error Hints

- Negative dimensions: "Dimensions must be positive numbers"
- Triangle inequality violation: "Side lengths must satisfy the triangle inequality (sum of any two sides > third side)"
- Triangle solve insufficient data: "Provide exactly 3 of the 6 values (3 sides, 3 angles). At least one must be a side."
- Mismatched point dimensions: "Both points must have the same number of dimensions (2D or 3D)"

---

### 1.5 `probability`

**Purpose:** Combinatorics, event probability, and statistical distributions.

**Disambiguation:** "Use `probability` for counting (permutations, combinations), event likelihood, and distribution calculations. Use `statistics` for analyzing datasets (mean, median, standard deviation). Use `calculate` for general factorial expressions."

#### Operations

**`permutations`**

- Required: `n` (number), `r` (number)
- Returns: `{ result }`
- Formula: P(n,r) = n! / (n-r)!

**`combinations`**

- Required: `n` (number), `r` (number)
- Returns: `{ result }`
- Formula: C(n,r) = n! / (r!(n-r)!)

**`factorial`**

- Required: `n` (number)
- Returns: `{ result }`
- Note: Also available via `calculate` as `n!`

**`binomial_coeff`**

- Required: `n` (number), `k` (number)
- Returns: `{ result }`
- Same as combinations; included for LLMs that use different terminology

**`event_probability`**

- Required: `favorable` (number), `total` (number)
- Returns: `{ probability, odds, percentage }`
- Formula: P = favorable / total; odds = favorable : (total - favorable)

**`independent_events`**

- Required: `probabilities` (number[], each 0-1)
- Optional: `type` ("all" | "any", default: "all")
- Returns: `{ probability }`
- Formulas: all = Π(p); any = 1 - Π(1 - p)

**`conditional`**

- Required: `pA` (number), `pBgivenA` (number), `pB` (number)
- Returns: `{ pAgivenB }`
- Formula: Bayes' theorem: P(A|B) = P(B|A) × P(A) / P(B)

**`normal_dist`**

- Required: `x` (number)
- Optional: `mean` (number, default: 0), `stdDev` (number, default: 1), `type` ("pdf" | "cdf" | "inverse", default: "cdf")
- Returns: `{ result }`
- Implementation: For CDF, use the error function approximation (Abramowitz and Stegun or similar). For inverse CDF, use rational approximation (Beasley-Springer-Moro or similar).

**`binomial_dist`**

- Required: `n` (number), `k` (number), `p` (number, 0-1)
- Optional: `type` ("pmf" | "cdf", default: "pmf")
- Returns: `{ result }`
- Formula: PMF = C(n,k) × p^k × (1-p)^(n-k)

**`poisson_dist`**

- Required: `k` (number), `lambda` (number)
- Optional: `type` ("pmf" | "cdf", default: "pmf")
- Returns: `{ result }`
- Formula: PMF = (λ^k × e^(-λ)) / k!

**`expected_value`**

- Required: `outcomes` (number[]), `probabilities` (number[])
- Returns: `{ expectedValue, variance }`
- Formula: E = Σ(outcome × probability); Var = Σ(outcome² × probability) - E²

#### Limits

- Factorial: n <= 170 (beyond this, JavaScript's Number overflows to Infinity)
- Permutations/combinations: n <= 170
- Probabilities must be in [0, 1]; percentages are not accepted (unlike `proportion`)
- binomial_dist n: max 10,000

#### Error Hints

- r > n: "r cannot be greater than n for permutations/combinations"
- Probability out of range: "Probabilities must be between 0 and 1"
- Mismatched array lengths: "Outcomes and probabilities arrays must have the same length"
- Probabilities don't sum to 1: "Warning: probabilities sum to {sum}, expected 1.0"

---

## Wave 2 — Tier 2 (Solid Demand, Common Use Cases)

### 2.1 `numbertheory`

**Purpose:** Integer properties, divisibility, and modular arithmetic.

**Disambiguation:** "Use `numbertheory` for prime numbers, GCD/LCM, factorization, and modular arithmetic. Use `calculate` for general integer arithmetic. Use `probability` for combinatorics."

#### Operations

**`gcd`**

- Required: `values` (number[], >= 2 elements)
- Returns: `{ result }`

**`lcm`**

- Required: `values` (number[], >= 2 elements)
- Returns: `{ result }`

**`prime_factors`**

- Required: `n` (number, positive integer)
- Returns: `{ factors, factorization }` (factorization as string e.g. "2^3 x 3 x 5")
- Limit: n <= 10^12

**`is_prime`**

- Required: `n` (number, positive integer)
- Returns: `{ isPrime }`
- Limit: n <= 10^15 (Miller-Rabin deterministic for values up to this range)

**`nth_prime`**

- Required: `n` (number, positive integer)
- Returns: `{ result }`
- Limit: n <= 1,000,000 (the millionth prime is 15,485,863)

**`primes_in_range`**

- Required: `from` (number), `to` (number)
- Returns: `{ primes, count }`
- Limit: range <= 10,000,000

**`mod`**

- Required: `a` (number), `b` (number)
- Returns: `{ result }`

**`mod_pow`**

- Required: `base` (number), `exponent` (number), `modulus` (number)
- Returns: `{ result }`
- Implementation: Square-and-multiply algorithm

**`mod_inverse`**

- Required: `a` (number), `modulus` (number)
- Returns: `{ result }` (or error if no inverse exists — i.e., gcd(a, modulus) != 1)
- Implementation: Extended Euclidean algorithm

**`divisors`**

- Required: `n` (number, positive integer)
- Returns: `{ divisors, count, sum }`
- Limit: n <= 10^9

**`euler_totient`**

- Required: `n` (number, positive integer)
- Returns: `{ result }`

**`is_coprime`**

- Required: `a` (number), `b` (number)
- Returns: `{ isCoprime, gcd }`

#### Error Hints

- Non-integer input: "Number theory operations require positive integers"
- Value exceeds limit: "Value exceeds computation limit of {limit} for this operation"
- No modular inverse: "No modular inverse exists for {a} mod {modulus} (they are not coprime)"

---

### 2.2 `matrix`

**Purpose:** Linear algebra operations on matrices and vectors.

**Disambiguation:** "Use `matrix` for operations on matrices and vectors (multiply, inverse, solve systems). Use `calculate` for scalar arithmetic. Use `solve` for single-variable equation solving."

#### Operations

**`add`**

- Required: `a` (number[][]), `b` (number[][])
- Returns: `{ result }` (number[][])

**`subtract`**

- Required: `a` (number[][]), `b` (number[][])
- Returns: `{ result }` (number[][])

**`multiply`**

- Required: `a` (number[][]), `b` (number[][])
- Returns: `{ result }` (number[][])

**`scalar_multiply`**

- Required: `matrix` (number[][]), `scalar` (number)
- Returns: `{ result }` (number[][])

**`transpose`**

- Required: `matrix` (number[][])
- Returns: `{ result }` (number[][])

**`determinant`**

- Required: `matrix` (number[][])
- Returns: `{ result }` (number)

**`inverse`**

- Required: `matrix` (number[][])
- Returns: `{ result }` (number[][])

**`rank`**

- Required: `matrix` (number[][])
- Returns: `{ result }` (number)

**`trace`**

- Required: `matrix` (number[][])
- Returns: `{ result }` (number)

**`dot_product`**

- Required: `a` (number[]), `b` (number[])
- Returns: `{ result }` (number)

**`cross_product`**

- Required: `a` (number[3]), `b` (number[3])
- Returns: `{ result }` (number[3])

**`solve`**

- Required: `coefficients` (number[][]), `constants` (number[])
- Returns: `{ solution }` (number[])
- Solves Ax = b

**`eigenvalues`**

- Required: `matrix` (number[][])
- Returns: `{ values }` (number[])

**`identity`**

- Required: `size` (number)
- Returns: `{ result }` (number[][])

#### Size Limits

Max 50x50 matrices. Larger matrices exceed the 5s timeout for operations like eigenvalues.

#### Implementation

mathjs natively supports all operations: `math.add()`, `math.multiply()`, `math.det()`, `math.inv()`, `math.transpose()`, `math.eigs()`, `math.lusolve()`, etc. The engine is primarily a wrapper that validates dimensions and converts between JS arrays and mathjs matrix types.

#### Error Hints

- Dimension mismatch: "Matrix dimensions do not match for this operation. A is {m}x{n}, B is {p}x{q}"
- Singular matrix: "Matrix is singular (determinant = 0) and cannot be inverted"
- Non-square matrix: "Operation requires a square matrix. Got {m}x{n}"
- Cross product: "Cross product is only defined for 3D vectors"

---

### 2.3 `base`

**Purpose:** Number system conversion and bitwise operations.

**Disambiguation:** "Use `base` for number system conversion (binary, hex, octal) and bitwise operations. Use `calculate` for arithmetic in decimal."

#### Operations

**`change_base`**

- Required: `value` (string), `fromBase` (number, 2-36), `toBase` (number, 2-36)
- Returns: `{ result, decimal }`
- Note: Named `change_base` (not `convert`) to avoid confusion with the top-level `convert` tool for unit conversion.

**`to_binary`**

- Required: `value` (number)
- Optional: `bits` (number, pad to N bits)
- Returns: `{ result }` (string with "0b" prefix)

**`to_hex`**

- Required: `value` (number)
- Optional: `uppercase` (boolean, default: true)
- Returns: `{ result }` (string with "0x" prefix)

**`to_octal`**

- Required: `value` (number)
- Returns: `{ result }` (string with "0o" prefix)

**`from_binary`**

- Required: `value` (string, with or without "0b" prefix)
- Returns: `{ result }` (number)

**`from_hex`**

- Required: `value` (string, with or without "0x" prefix)
- Returns: `{ result }` (number)

**`bitwise_and`**

- Required: `a` (number), `b` (number)
- Returns: `{ result, binary }` (binary string showing the operation)

**`bitwise_or`**

- Required: `a` (number), `b` (number)
- Returns: `{ result, binary }`

**`bitwise_xor`**

- Required: `a` (number), `b` (number)
- Returns: `{ result, binary }`

**`bitwise_not`**

- Required: `value` (number)
- Optional: `bits` (number, default: 32)
- Returns: `{ result, binary }`

**`shift_left`**

- Required: `value` (number), `positions` (number)
- Returns: `{ result, binary }`

**`shift_right`**

- Required: `value` (number), `positions` (number)
- Returns: `{ result, binary }`

**`twos_complement`**

- Required: `value` (number), `bits` (number)
- Returns: `{ result, binary }`

#### Input Flexibility

String inputs accept common prefixes: `"0xFF"`, `"0b1010"`, `"0o77"`. Normalization strips these prefixes before processing.

#### Return Enrichment

Every operation returns both the target-format result and the decimal equivalent. Bitwise operations additionally return binary string representations.

#### Error Hints

- Invalid digit for base: "Digit '{d}' is not valid in base {base}"
- Base out of range: "Base must be between 2 and 36"
- Non-integer for bitwise: "Bitwise operations require integers"

---

### 2.4 `sequence`

**Purpose:** Arithmetic, geometric, and named sequences with summation.

**Disambiguation:** "Use `sequence` for generating, analyzing, and summing sequences and series. Use `calculate` for evaluating individual expressions. Use `statistics` for analyzing datasets."

#### Operations

**`arithmetic_nth`**

- Required: `first` (number), `commonDifference` (number), `n` (number)
- Returns: `{ result }`
- Formula: a_n = first + (n-1) × d

**`arithmetic_sum`**

- Required: `first` (number), `commonDifference` (number), `n` (number)
- Returns: `{ sum, lastTerm }`
- Formula: S = n/2 × (2a + (n-1)d)

**`arithmetic_find`**

- Required: `first` (number), `commonDifference` (number), `target` (number)
- Returns: `{ position }` (or error if target is not in the sequence)

**`geometric_nth`**

- Required: `first` (number), `commonRatio` (number), `n` (number)
- Returns: `{ result }`
- Formula: a_n = first × r^(n-1)

**`geometric_sum`**

- Required: `first` (number), `commonRatio` (number), `n` (number)
- Returns: `{ sum }`
- Formula: S = first × (1 - r^n) / (1 - r)

**`geometric_infinite_sum`**

- Required: `first` (number), `commonRatio` (number)
- Returns: `{ sum }` (or error if |r| >= 1)
- Formula: S = first / (1 - r)

**`fibonacci`**

- Required: `n` (number)
- Returns: `{ result, sequence }` (sequence: first n terms)
- Limit: n <= 1000

**`summation`**

- Required: `expression` (string), `variable` (string), `from` (number), `to` (number)
- Returns: `{ result }`
- Evaluates expression for each integer value of variable, sums results
- Implementation: Constructs a single sandboxed expression containing the loop (NOT one VM context per iteration). E.g., generates and evaluates a single expression in one `vm.runInNewContext` call.
- Limit: range <= 10,000

**`product`**

- Required: `expression` (string), `variable` (string), `from` (number), `to` (number)
- Returns: `{ result }`
- Same as summation but multiplies results
- Implementation: Same single-context loop strategy as summation
- Limit: range <= 10,000

**`custom_recursive`**

- Required: `initial` (number[]), `relation` (string), `n` (number)
- Returns: `{ result, sequence }`
- The relation string can reference `a(n-1)`, `a(n-2)`, etc.
- Uses sandboxed engine for relation evaluation
- Limit: n <= 10,000

#### Error Hints

- Geometric infinite sum diverges: "Infinite geometric series only converges when |commonRatio| < 1. Got |{r}|"
- Target not in arithmetic sequence: "{target} is not a term in this arithmetic sequence"
- Expression evaluation error: falls through to calculate error hints

---

### 2.5 `solve`

**Purpose:** Find roots and solutions to equations.

**Disambiguation:** "Use `solve` to find unknown values in equations. Use `matrix` for full matrix operations. Use `calculate` to evaluate expressions where all values are known."

#### Operations

**`quadratic`**

- Required: `a` (number), `b` (number), `c` (number)
- Returns: `{ roots, discriminant, vertex }` where vertex = { x, y }
- Handles: two real roots, one repeated root, two complex roots
- Complex roots returned as strings: "2 + 3i"

**`polynomial_roots`**

- Required: `coefficients` (number[], highest degree first)
- Returns: `{ roots, degree }`
- Implementation: Companion matrix eigenvalues for degree > 2 (reuses matrix engine)
- Limit: degree <= 20

**`linear_system`**

- Required: `equations` (number[][]), `constants` (number[])
- Returns: `{ solution }` (number[])
- Delegates to matrix `solve` internally
- Clearer interface for LLMs thinking "solve equations" rather than "matrix operations"

**`bisection`**

- Required: `expression` (string), `variable` (string), `lowerBound` (number), `upperBound` (number)
- Optional: `tolerance` (number, default: 1e-10), `maxIterations` (number, default: 100)
- Returns: `{ root, iterations, accuracy }`
- Error if f(lower) and f(upper) have same sign

**`newton`**

- Required: `expression` (string), `variable` (string), `initialGuess` (number)
- Optional: `tolerance` (number, default: 1e-10), `maxIterations` (number, default: 100)
- Returns: `{ root, iterations, accuracy }`
- Derivative computed numerically (central difference)
- Error if method does not converge

#### Error Hints

- Quadratic a=0: "Coefficient 'a' cannot be zero for a quadratic equation. Use calculate for linear equations."
- Bisection same sign: "f(lowerBound) and f(upperBound) must have opposite signs for bisection method"
- Newton no convergence: "Newton's method did not converge after {n} iterations. Try a different initial guess."
- Singular system: "The system of equations has no unique solution (singular matrix)"

---

## Wave 3 — Tier 3 (Industry-Specific & Power Users)

### 3.1 `navigation`

**Purpose:** Geodesic calculations on Earth's surface using latitude/longitude.

**Disambiguation:** "Use `navigation` for distance, bearing, and position calculations on Earth's surface using latitude/longitude coordinates. Use `geometry` for abstract 2D/3D distance and shape calculations."

#### Operations

**`haversine`**

- Required: `from` ({lat, lon}), `to` ({lat, lon})
- Optional: `unit` ("km" | "miles" | "nmi", default: "km")
- Returns: `{ distance }`

**`bearing`**

- Required: `from` ({lat, lon}), `to` ({lat, lon})
- Returns: `{ initial, final, compass }` (initial/final in degrees, compass e.g. "NNE")

**`destination`**

- Required: `from` ({lat, lon}), `bearing` (degrees), `distance` (number)
- Optional: `unit` ("km" | "miles" | "nmi", default: "km")
- Returns: `{ lat, lon }`

**`midpoint`**

- Required: `from` ({lat, lon}), `to` ({lat, lon})
- Returns: `{ lat, lon }`

**`rhumb_distance`**

- Required: `from` ({lat, lon}), `to` ({lat, lon})
- Optional: `unit` ("km" | "miles" | "nmi", default: "km")
- Returns: `{ distance }`

**`rhumb_bearing`**

- Required: `from` ({lat, lon}), `to` ({lat, lon})
- Returns: `{ bearing, compass }`

**`coord_convert`**

- Required: `value` (string or {lat, lon})
- Optional: `to` ("decimal" | "dms", default: "dms" if input is decimal, "decimal" if input is DMS)
- Returns: `{ converted }`
- Accepts: `"40°26'46\"N 79°58'56\"W"`, `{lat: 40.446, lon: -79.982}`

**`bounding_box`**

- Required: `center` ({lat, lon}), `radius` (number)
- Optional: `unit` ("km" | "miles" | "nmi", default: "km")
- Returns: `{ minLat, maxLat, minLon, maxLon }`

#### Earth Model

WGS-84 mean radius (6,371.0088 km). Spherical model — no ellipsoidal corrections. Accuracy < 0.3% vs ellipsoidal, sufficient for practical purposes. The description will state this.

#### Implementation

Uses `geolib` for haversine distance, bearing, destination point, and bounding box calculations. Coordinate conversion (DMS ↔ decimal) and rhumb line calculations use custom implementations with mathjs trig functions (geolib does not cover rhumb lines). `geolib` is TypeScript-native and handles edge cases (antipodal points, longitude wrapping) that are easy to get wrong in custom implementations.

#### Error Hints

- Invalid coordinates: "Latitude must be between -90 and 90, longitude between -180 and 180"
- Invalid DMS format: "Expected format: 40°26'46\"N or 40 26 46 N"

---

### 3.2 `regression`

**Purpose:** Curve fitting, interpolation, and trend analysis.

**Disambiguation:** "Use `regression` for finding trends, fitting curves, and predicting values. Use `statistics` for descriptive statistics (mean, median, std). Use `probability` for distribution calculations."

#### Operations

**`linear`**

- Required: `x` (number[]), `y` (number[])
- Returns: `{ slope, intercept, r, rSquared, equation }`

**`polynomial`**

- Required: `x` (number[]), `y` (number[])
- Optional: `degree` (number, default: 2, max: 10)
- Returns: `{ coefficients, rSquared, equation }`

**`exponential`**

- Required: `x` (number[]), `y` (number[], all positive)
- Returns: `{ a, b, rSquared, equation }` (y = a \* e^(bx))

**`logarithmic`**

- Required: `x` (number[], all positive), `y` (number[])
- Returns: `{ a, b, rSquared, equation }` (y = a + b \* ln(x))

**`power`**

- Required: `x` (number[], all positive), `y` (number[], all positive)
- Returns: `{ a, b, rSquared, equation }` (y = a \* x^b)

All five regression types are implemented by the `regression` (regression-js) package, which handles least-squares fitting, R-squared, and equation formatting. The package covers linear, polynomial, exponential, logarithmic, and power models in a single dependency.

**`interpolate`**

- Required: `x` (number[]), `y` (number[]), `target` (number)
- Optional: `method` ("linear" | "nearest", default: "linear")
- Returns: `{ result }`
- Error if target is outside the data range (extrapolation) unless explicitly allowed

**`moving_average`**

- Required: `data` (number[])
- Optional: `window` (number, default: 3), `type` ("simple" | "exponential", default: "simple")
- Returns: `{ result }` (number[])

**`predict`**

- Required: `x` (number[]), `y` (number[]), `targetX` (number)
- Optional: `model` ("linear" | "polynomial" | "exponential", default: "linear")
- Returns: `{ predicted, confidence }` (confidence = rSquared of underlying model)

#### Data Limits

Max 100,000 data points for linear operations. Max 10,000 for polynomial (matrix construction overhead). Polynomial degree capped at 10.

#### Error Hints

- Mismatched arrays: "x and y arrays must have the same length"
- Too few data points: "Need at least {n} data points for degree-{d} polynomial regression"
- Non-positive values for log/exp: "Exponential regression requires all y values to be positive"
- Extrapolation warning: "Target {x} is outside the data range [{min}, {max}]. Use predict for extrapolation."

---

### 3.3 `calculus`

**Purpose:** Numerical integration, differentiation, and limits. All methods are numerical — no symbolic math.

**Disambiguation:** "Use `calculus` for integration, derivatives, and limits — all computed numerically. Use `calculate` for evaluating expressions at specific values. Use `sequence` for summation of discrete series."

#### Operations

**`integrate_expression`**

- Required: `expression` (string), `variable` (string), `from` (number), `to` (number)
- Optional: `method` ("trapezoidal" | "simpson", default: "simpson"), `intervals` (number, default: 1000)
- Returns: `{ result, method, errorEstimate }`
- Error estimate: |result_N - result_N/2| (difference between N and N/2 intervals)

**`integrate_data`**

- Required: `x` (number[]), `y` (number[])
- Optional: `method` ("trapezoidal", default: "trapezoidal")
- Returns: `{ result }`
- For empirical data points, not expressions

**`derivative_at`**

- Required: `expression` (string), `variable` (string), `at` (number)
- Optional: `order` (1 | 2, default: 1)
- Returns: `{ result, method }`
- First order: central difference f'(x) = (f(x+h) - f(x-h)) / 2h
- Second order: f''(x) = (f(x+h) - 2f(x) + f(x-h)) / h²
- Step size h auto-selected: h = max(|x| × 1e-7, 1e-10)

**`derivative_data`**

- Required: `x` (number[]), `y` (number[])
- Returns: `{ derivatives }` (number[], same length)
- Central differences for interior points, forward/backward at edges

**`limit`**

- Required: `expression` (string), `variable` (string), `approaching` (number | string)
- `approaching` accepts a number or the strings `"Infinity"` / `"-Infinity"` for limits at infinity
- Optional: `direction` ("left" | "right" | "both", default: "both")
- Returns: `{ result, converges }`
- Evaluates at decreasing distances: 0.1, 0.01, 0.001, ... from target (or increasing values 10, 100, 1000, ... for infinity)
- Reports convergence (successive values stabilize) or divergence

#### Error Hints

- Expression error: falls through to calculate error hints
- Integration endpoints: "Lower bound must be less than upper bound"
- Limit diverges: "Expression does not appear to converge as {variable} approaches {value}"
- Non-monotonic data: "x values must be strictly increasing for data-based operations"

---

### 3.4 `sets`

**Purpose:** Set-theoretic operations on numerical collections.

**Disambiguation:** "Use `sets` for set-theoretic operations (union, intersection, membership) on sets of numbers. This tool operates on numerical sets only — not strings or objects. Use `statistics` for analyzing numerical data. Use `probability` for counting and combinatorics."

#### Operations

**`union`**

- Required: `sets` (number[][], >= 2 sets)
- Returns: `{ result }` (number[], sorted)

**`intersection`**

- Required: `sets` (number[][], >= 2 sets)
- Returns: `{ result }` (number[], sorted)

**`difference`**

- Required: `a` (number[]), `b` (number[])
- Returns: `{ result }` (number[], sorted) — elements in a but not in b

**`symmetric_difference`**

- Required: `a` (number[]), `b` (number[])
- Returns: `{ result }` (number[], sorted) — elements in either but not both

**`is_subset`**

- Required: `a` (number[]), `b` (number[])
- Returns: `{ isSubset, isProperSubset }`

**`is_superset`**

- Required: `a` (number[]), `b` (number[])
- Returns: `{ isSuperset, isProperSuperset }`

**`cardinality`**

- Required: `set` (number[])
- Returns: `{ result }` (number of unique elements)

**`power_set`**

- Required: `set` (number[])
- Returns: `{ result, cardinality }`
- Limit: max 20 elements (2^20 ≈ 1M subsets)

**`cartesian_product`**

- Required: `a` (number[]), `b` (number[])
- Returns: `{ result, cardinality }`
- Limit: |a| × |b| <= 100,000

**`is_disjoint`**

- Required: `a` (number[]), `b` (number[])
- Returns: `{ isDisjoint }`

#### Input Handling

All inputs are automatically deduplicated (sets have unique elements). Results sorted numerically. A `note` field reports deduplication if duplicates were found.

#### Element Types

Numbers only for v1. Keeps schema simple and aligned with math focus.

#### Error Hints

- Power set too large: "Power set of {n} elements would produce {2^n} subsets. Maximum input size is 20 elements."
- Cartesian product too large: "Cartesian product would produce {n} pairs. Maximum is 100,000."
- Empty set input: handled gracefully (empty set operations are well-defined)

---

### 3.5 `logic`

**Purpose:** Boolean algebra and propositional logic evaluation.

**Disambiguation:** "Use `logic` for Boolean algebra, truth tables, and propositional logic. Use `calculate` for arithmetic. Use `sets` for set operations."

#### Operations

**`eval_expression`**

- Required: `expression` (string)
- Optional: `variables` (object, e.g. {"A": true, "B": false})
- Returns: `{ result }` (boolean)
- Note: Named `eval_expression` (not `evaluate`) to avoid confusion with the disabled mathjs `evaluate` function.

**`truth_table`**

- Required: `expression` (string)
- Optional: `variables` (string[], auto-detected if omitted)
- Returns: `{ table, tautology, contradiction, contingency }`
- Table: array of rows, each with variable assignments + result
- Limit: max 16 variables (2^16 = 65,536 rows)

**`equivalent`**

- Required: `a` (string), `b` (string)
- Returns: `{ isEquivalent, counterexample }` (counterexample shows differing assignment if not equivalent)

**`simplify`**

- Required: `expression` (string)
- Returns: `{ simplified, method }`
- Applies Boolean algebra identities: De Morgan's, absorption, idempotent, complement, identity, etc.
- Distinct from the disabled mathjs `simplify` — this is custom Boolean-only simplification

#### Expression Syntax

Supported operators (normalization handles all variants):

- AND: `AND`, `&&`, `∧`, `&`
- OR: `OR`, `||`, `∨`, `|`
- NOT: `NOT`, `!`, `¬`, `~`
- XOR: `XOR`, `⊕`, `^`
- NAND: `NAND`
- NOR: `NOR`
- Implication: `->`, `→`, `IMPLIES`
- Biconditional: `<->`, `↔`, `IFF`

Variables: single uppercase letters (A-Z) or quoted identifiers.

#### Implementation

Custom recursive descent parser for Boolean expressions. Truth table by enumeration. Equivalence by truth table comparison. Simplification via algebraic identity matching.

#### Error Hints

- Syntax error: "Invalid Boolean expression. Supported operators: AND (&&), OR (||), NOT (!), XOR (^), ->, <->"
- Too many variables: "Truth table supports up to 16 variables. Expression has {n} variables."
- Undefined variable: "Variable '{v}' in expression but not provided in variables object"

---

## Implementation Phasing

### Wave 1 (Tier 1)

**Tools:** financial, datetime, proportion, geometry, probability
**Priority:** Highest demand, broadest audience
**Dependencies:** None — all implementable with mathjs + native JS
**Estimated scope per tool:** Engine module + tool definition + error hints + normalization extensions + tests

### Wave 2 (Tier 2)

**Tools:** numbertheory, matrix, base, sequence, solve
**Priority:** Strong demand for specific common use cases
**Dependencies:**

- `solve.polynomial_roots` reuses `matrix` engine (eigenvalues of companion matrix)
- `solve.linear_system` delegates to `matrix.solve`
- `sequence.summation/product` reuses sandboxed expression evaluator from `engine.ts`

### Wave 3 (Tier 3)

**Tools:** navigation, regression, calculus, sets, logic
**Priority:** Industry-specific and power-user features
**Dependencies:**

- `regression.polynomial` reuses `matrix` engine for normal equations
- `calculus.integrate_expression` reuses sandboxed expression evaluator
- `logic` requires a custom Boolean expression parser (independent of mathjs)

### Cross-Wave Dependencies

```
Wave 1: financial, datetime, proportion, geometry, probability
         (all independent)

Wave 2: numbertheory, matrix, base, sequence, solve
         solve depends on matrix (polynomial_roots, linear_system)
         sequence uses existing sandboxed evaluator

Wave 3: navigation, regression, calculus, sets, logic
         regression depends on matrix (polynomial fitting)
         calculus uses existing sandboxed evaluator
         logic is fully independent (custom parser)
```

## Excluded Domains (With Rationale)

| Domain                     | Rationale                                                                                                                                       |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Graph theory / pathfinding | Algorithmic, not calculator-shaped. Complex I/O (adjacency matrices, edge lists). Better as a dedicated MCP.                                    |
| Physics formulas           | Infinite scope — every formula is a new operation. LLMs compose `calculate` + `convert` to handle these.                                        |
| Signal processing / FFT    | Too niche. The audience that needs FFT needs a proper DSP library.                                                                              |
| Symbolic algebra           | Intentionally disabled for security (mathjs parse/simplify/derivative). Numerical alternatives in `calculus` and `solve` cover practical needs. |
| Cryptographic math         | Security-sensitive. Number theory covers the mathematical primitives.                                                                           |
| Dimensional analysis       | Already covered by `convert`.                                                                                                                   |
