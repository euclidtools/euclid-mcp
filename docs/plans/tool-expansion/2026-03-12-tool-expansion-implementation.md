# Euclid MCP Tool Expansion Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 15 new math domain tools to euclid-mcp across 3 waves, starting with Wave 1 (financial, datetime, proportion, geometry, probability).

**Architecture:** Each tool follows the existing umbrella pattern (see `statistics` tool): a tool definition in `src/tools/`, an engine module in `src/engines/`, error hints in `src/error-hints/`, and tests in `tests/`. All tools use operation enums to select specific calculations within their domain.

**Tech Stack:** TypeScript (strict, ESM), mathjs v15, Zod v4, vitest, pnpm. New deps for Wave 1: `financial`, `date-fns`, `jstat`.

**Design spec:** `docs/plans/2026-03-12-tool-expansion-design.md`

**Engine result types:** The existing `EngineResult` returns `{ result: string }`. New engines return structured objects (`{ result: Record<string, unknown> }`) since financial/geometry/etc. operations return multiple values. Each engine defines its own `DomainResult` type following the same union pattern: `{ result: T; note?: string } | { error: string }`.

---

## Chunk 1: Infrastructure & First Tool (financial)

### Task 0: Infrastructure — Error Hints Registry Refactor

The design spec requires migrating from a monolithic `error-hints.ts` to a per-domain registry pattern. This must happen first so all new tools use the new pattern.

**Files:**

- Create: `src/error-hints/index.ts`
- Create: `src/error-hints/calculate.ts`
- Create: `src/error-hints/convert.ts`
- Create: `src/error-hints/statistics.ts`
- Modify: `src/tools/calculate.ts` (update import path)
- Modify: `src/tools/convert.ts` (update import path)
- Modify: `src/tools/statistics.ts` (update import path)
- Delete: `src/error-hints.ts` (after migration)
- Test: `tests/error-hints.test.ts` (existing — must still pass)

- [ ] **Step 1: Create the error-hints registry module**

Create `src/error-hints/index.ts`:

```typescript
// src/error-hints/index.ts

export type ErrorHint = {
  hint: string;
  examples: string[];
};

type HintProvider = (errorMessage: string) => string;

const registry = new Map<string, { provider: HintProvider; examples: string[] }>();

export function registerHints(tool: string, provider: HintProvider, examples: string[]): void {
  registry.set(tool, { provider, examples });
}

export function getErrorHint(tool: string, errorMessage: string): ErrorHint {
  const entry = registry.get(tool);
  if (!entry) {
    return {
      hint: `No error hints registered for tool '${tool}'. An error occurred.`,
      examples: [],
    };
  }
  return { hint: entry.provider(errorMessage), examples: entry.examples };
}
```

- [ ] **Step 2: Migrate calculate hints to their own file**

Create `src/error-hints/calculate.ts`:

```typescript
// src/error-hints/calculate.ts
import { registerHints } from './index.js';

const EXAMPLES = ['2 * 3', 'sqrt(16)', 'sin(pi / 4)', 'log(100, 10)', '12! / (4! * 8!)'];

function getHint(errorMessage: string): string {
  if (
    errorMessage.includes('Unexpected') ||
    errorMessage.includes('Parenthesis') ||
    errorMessage.includes('Value expected')
  ) {
    return 'Check expression syntax. Use * for multiplication, / for division, ^ for exponents, and ensure parentheses are balanced.';
  }
  if (errorMessage.includes('Undefined symbol') || errorMessage.includes('Undefined function')) {
    return 'Unknown variable or function. Supported functions include: sqrt, sin, cos, tan, log, exp, abs, ceil, floor, round.';
  }
  if (errorMessage.includes('is disabled')) {
    return 'This function is disabled for security. Use basic arithmetic and math functions only.';
  }
  return 'Invalid expression. Use standard mathematical notation with operators: +, -, *, /, ^.';
}

registerHints('calculate', getHint, EXAMPLES);
```

- [ ] **Step 3: Migrate convert and statistics hints**

Create `src/error-hints/convert.ts`:

```typescript
// src/error-hints/convert.ts
import { registerHints } from './index.js';

const EXAMPLES = [
  "convert(5, 'km', 'mile')",
  "convert(100, 'degF', 'degC')",
  "convert(1, 'lb', 'kg')",
];

function getHint(errorMessage: string): string {
  if (errorMessage.includes('not found')) {
    return 'Unit not recognized. Use standard abbreviations: km, m, ft, mile, lb, kg, degC, degF, mph, kph.';
  }
  if (errorMessage.includes('do not match')) {
    return 'Units are incompatible. Ensure both measure the same quantity (e.g., length to length, weight to weight).';
  }
  return 'Invalid conversion. Provide a numeric value with valid source and target units.';
}

registerHints('convert', getHint, EXAMPLES);
```

Create `src/error-hints/statistics.ts`:

```typescript
// src/error-hints/statistics.ts
import { registerHints } from './index.js';

const EXAMPLES = ["statistics('mean', [1, 2, 3])", "statistics('percentile', [10, 20, 30], 90)"];

function getHint(errorMessage: string): string {
  if (errorMessage.includes('Unknown operation')) {
    return 'Valid operations: mean, median, mode, std, variance, min, max, sum, percentile.';
  }
  if (errorMessage.includes('Percentile')) {
    return 'The percentile parameter is required and must be between 0 and 100.';
  }
  if (errorMessage.includes('empty')) {
    return 'Data array must contain at least one number.';
  }
  return 'Provide a valid operation and a non-empty array of numbers.';
}

registerHints('statistics', getHint, EXAMPLES);
```

- [ ] **Step 4: Update imports in existing tool files**

In `src/tools/calculate.ts`, `src/tools/convert.ts`, and `src/tools/statistics.ts`, change:

```typescript
// OLD
import { getErrorHint } from '../error-hints.js';
// NEW
import '../error-hints/calculate.js'; // registers hints (only in calculate.ts)
import '../error-hints/convert.js'; // registers hints (only in convert.ts)
import '../error-hints/statistics.js'; // registers hints (only in statistics.ts)
import { getErrorHint } from '../error-hints/index.js';
```

Each tool file imports its own hint registration module (side-effect import) plus the `getErrorHint` function from the registry.

- [ ] **Step 5: Delete the old monolithic error-hints.ts**

Remove `src/error-hints.ts`.

- [ ] **Step 6: Run existing tests to verify no regression**

Run: `cd /c/Code/euclid/euclid-mcp && pnpm test`
Expected: All existing tests pass. The `error-hints.test.ts` tests call `getErrorHint` — update its imports to match:

```typescript
// tests/error-hints.test.ts — update imports
import '../src/error-hints/calculate.js';
import '../src/error-hints/convert.js';
import '../src/error-hints/statistics.js';
import { getErrorHint } from '../src/error-hints/index.js';
```

- [ ] **Step 7: Commit**

```bash
git add src/error-hints/ src/tools/calculate.ts src/tools/convert.ts src/tools/statistics.ts tests/error-hints.test.ts
git rm src/error-hints.ts
git commit -m "refactor: migrate error-hints to per-domain registry pattern"
```

---

### Task 1: Install Wave 1 Dependencies

**Files:**

- Modify: `euclid-mcp/package.json`

- [ ] **Step 1: Install financial, date-fns, and jstat**

```bash
cd /c/Code/euclid/euclid-mcp && pnpm add financial date-fns jstat
```

- [ ] **Step 2: Install TypeScript types for jstat**

```bash
cd /c/Code/euclid/euclid-mcp && pnpm add -D @types/jstat
```

Note: `financial` and `date-fns` have native TypeScript types. Only `jstat` needs `@types`.

- [ ] **Step 3: Verify build still works**

```bash
cd /c/Code/euclid/euclid-mcp && pnpm build
```

- [ ] **Step 4: Commit**

```bash
cd /c/Code/euclid/euclid-mcp
git add package.json pnpm-lock.yaml
git commit -m "deps: add financial, date-fns, jstat for Wave 1 tools"
```

---

### Task 2: Create `src/engines/` Directory Structure

**Files:**

- Create: `src/engines/financial.ts`

This task creates only the financial engine. Subsequent tasks create the remaining engines. The existing `engine.ts` stays untouched — it continues to serve calculate, convert, and statistics.

- [ ] **Step 1: Create engines directory**

```bash
mkdir -p /c/Code/euclid/euclid-mcp/src/engines
```

No commit yet — we'll commit with the first engine file.

---

### Task 3: Financial Engine — Core TVM Operations

**Files:**

- Create: `src/engines/financial.ts`
- Test: `tests/financial-engine.test.ts`

This task implements the core time-value-of-money operations: simple_interest, compound_interest, present_value, future_value, roi, markup, discount.

- [ ] **Step 1: Write failing tests for simple_interest and compound_interest**

Create `tests/financial-engine.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { computeFinancial } from '../src/engines/financial.js';

describe('financial engine', () => {
  describe('simple_interest', () => {
    it('computes interest and total', () => {
      const result = computeFinancial('simple_interest', {
        principal: 10000,
        rate: 0.05,
        time: 3,
      });
      expect(result).not.toHaveProperty('error');
      const r = result as { result: Record<string, unknown> };
      expect(r.result).toMatchObject({ interest: 1500, total: 11500 });
    });

    it('returns error for rate > 1 (likely percentage mistake)', () => {
      const result = computeFinancial('simple_interest', {
        principal: 10000,
        rate: 5,
        time: 3,
      });
      expect(result).toHaveProperty('error');
      expect((result as { error: string }).error).toContain('decimal');
    });
  });

  describe('compound_interest', () => {
    it('computes monthly compounding', () => {
      const result = computeFinancial('compound_interest', {
        principal: 10000,
        rate: 0.065,
        time: 5,
        frequency: 12,
      });
      expect(result).not.toHaveProperty('error');
      const r = (result as { result: Record<string, number> }).result;
      expect(r.total).toBeCloseTo(13828.17, 0);
      expect(r.interest).toBeCloseTo(3828.17, 0);
      expect(r.effectiveRate).toBeCloseTo(0.06697, 4);
      expect(r.effectiveRatePercent).toMatch(/6\.69/);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /c/Code/euclid/euclid-mcp && pnpm test -- tests/financial-engine.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the financial engine with core TVM operations**

Create `src/engines/financial.ts`:

```typescript
// src/engines/financial.ts

const MAX_RATE = 1;

export type FinancialResult =
  | { result: Record<string, unknown>; note?: string }
  | { error: string };

function validateRate(rate: number): string | null {
  if (rate > MAX_RATE) {
    return `Rate ${rate} appears to be a percentage. Financial tool uses decimals: 0.065 for 6.5%, not 6.5`;
  }
  if (rate < 0) {
    return 'Rate must be non-negative';
  }
  return null;
}

function formatPercent(decimal: number): string {
  return `${(decimal * 100).toFixed(4).replace(/\.?0+$/, '')}%`;
}

function toYears(time: number, timeUnit: string = 'year'): number {
  switch (timeUnit) {
    case 'year':
      return time;
    case 'month':
      return time / 12;
    case 'day':
      return time / 365;
    case 'week':
      return time / 52;
    default:
      return time; // assume years
  }
}

function simpleInterest(params: Record<string, unknown>): FinancialResult {
  const {
    principal,
    rate,
    time,
    timeUnit = 'year',
  } = params as {
    principal: number;
    rate: number;
    time: number;
    timeUnit?: string;
  };
  const rateErr = validateRate(rate);
  if (rateErr) return { error: rateErr };
  if (principal < 0) return { error: 'Principal must be non-negative' };

  const years = toYears(time, timeUnit);
  const interest = principal * rate * years;
  return { result: { interest, total: principal + interest } };
}

function compoundInterest(params: Record<string, unknown>): FinancialResult {
  const {
    principal,
    rate,
    time,
    timeUnit = 'year',
    frequency = 12,
  } = params as {
    principal: number;
    rate: number;
    time: number;
    timeUnit?: string;
    frequency?: number;
  };
  const rateErr = validateRate(rate);
  if (rateErr) return { error: rateErr };
  if (principal < 0) return { error: 'Principal must be non-negative' };

  const years = toYears(time, timeUnit);
  const total = principal * Math.pow(1 + rate / frequency, frequency * years);
  const interest = total - principal;
  const effectiveRate = Math.pow(1 + rate / frequency, frequency) - 1;

  return {
    result: {
      interest: Math.round(interest * 100) / 100,
      total: Math.round(total * 100) / 100,
      effectiveRate,
      effectiveRatePercent: formatPercent(effectiveRate),
    },
  };
}

function presentValue(params: Record<string, unknown>): FinancialResult {
  const {
    futureValue,
    rate,
    periods,
    frequency = 1,
  } = params as {
    futureValue: number;
    rate: number;
    periods: number;
    frequency?: number;
  };
  const rateErr = validateRate(rate);
  if (rateErr) return { error: rateErr };

  const pv = futureValue / Math.pow(1 + rate / frequency, frequency * periods);
  return { result: { presentValue: Math.round(pv * 100) / 100 } };
}

function futureValue(params: Record<string, unknown>): FinancialResult {
  const {
    presentValue,
    rate,
    periods,
    frequency = 1,
  } = params as {
    presentValue: number;
    rate: number;
    periods: number;
    frequency?: number;
  };
  const rateErr = validateRate(rate);
  if (rateErr) return { error: rateErr };

  const fv = presentValue * Math.pow(1 + rate / frequency, frequency * periods);
  return { result: { futureValue: Math.round(fv * 100) / 100 } };
}

function roi(params: Record<string, unknown>): FinancialResult {
  const { gain, cost } = params as { gain: number; cost: number };
  if (cost === 0) return { error: 'Cost cannot be zero' };

  const roiDecimal = (gain - cost) / cost;
  return {
    result: {
      roi: roiDecimal,
      roiPercent: formatPercent(roiDecimal),
    },
  };
}

function markup(params: Record<string, unknown>): FinancialResult {
  const { cost, sellingPrice } = params as { cost: number; sellingPrice: number };
  if (cost === 0) return { error: 'Cost cannot be zero' };
  if (sellingPrice === 0) return { error: 'Selling price cannot be zero' };

  const markupDecimal = (sellingPrice - cost) / cost;
  const marginDecimal = (sellingPrice - cost) / sellingPrice;
  return {
    result: {
      markup: markupDecimal,
      markupPercent: formatPercent(markupDecimal),
      margin: marginDecimal,
      marginPercent: formatPercent(marginDecimal),
    },
  };
}

function discount(params: Record<string, unknown>): FinancialResult {
  const { originalPrice, discountPercent, taxPercent } = params as {
    originalPrice: number;
    discountPercent: number;
    taxPercent?: number;
  };

  const savings = originalPrice * (discountPercent / 100);
  const discountedPrice = originalPrice - savings;
  const finalPrice = taxPercent ? discountedPrice * (1 + taxPercent / 100) : discountedPrice;

  return {
    result: {
      discountedPrice: Math.round(discountedPrice * 100) / 100,
      savings: Math.round(savings * 100) / 100,
      finalPrice: Math.round(finalPrice * 100) / 100,
    },
  };
}

export function computeFinancial(
  operation: string,
  params: Record<string, unknown>,
): FinancialResult {
  switch (operation) {
    case 'simple_interest':
      return simpleInterest(params);
    case 'compound_interest':
      return compoundInterest(params);
    case 'present_value':
      return presentValue(params);
    case 'future_value':
      return futureValue(params);
    case 'roi':
      return roi(params);
    case 'markup':
      return markup(params);
    case 'discount':
      return discount(params);
    default:
      return { error: `Unknown operation: ${operation}` };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /c/Code/euclid/euclid-mcp && pnpm test -- tests/financial-engine.test.ts
```

Expected: PASS

- [ ] **Step 5: Add tests for present_value, future_value, roi, markup, discount**

Append to `tests/financial-engine.test.ts`:

```typescript
describe('present_value', () => {
  it('discounts future value to present', () => {
    const result = computeFinancial('present_value', {
      futureValue: 10000,
      rate: 0.05,
      periods: 10,
    });
    const r = (result as { result: Record<string, number> }).result;
    expect(r.presentValue).toBeCloseTo(6139.13, 0);
  });
});

describe('future_value', () => {
  it('compounds present value forward', () => {
    const result = computeFinancial('future_value', {
      presentValue: 10000,
      rate: 0.05,
      periods: 10,
    });
    const r = (result as { result: Record<string, number> }).result;
    expect(r.futureValue).toBeCloseTo(16288.95, 0);
  });
});

describe('roi', () => {
  it('computes return on investment', () => {
    const result = computeFinancial('roi', { gain: 15000, cost: 10000 });
    const r = (result as { result: Record<string, unknown> }).result;
    expect(r.roi).toBeCloseTo(0.5, 5);
    expect(r.roiPercent).toBe('50%');
  });
});

describe('markup', () => {
  it('computes markup and margin', () => {
    const result = computeFinancial('markup', { cost: 40, sellingPrice: 60 });
    const r = (result as { result: Record<string, unknown> }).result;
    expect(r.markup).toBeCloseTo(0.5, 5);
    expect(r.markupPercent).toBe('50%');
    expect(r.margin).toBeCloseTo(0.3333, 3);
  });
});

describe('discount', () => {
  it('computes discounted price with tax', () => {
    const result = computeFinancial('discount', {
      originalPrice: 100,
      discountPercent: 20,
      taxPercent: 10,
    });
    const r = (result as { result: Record<string, number> }).result;
    expect(r.discountedPrice).toBe(80);
    expect(r.savings).toBe(20);
    expect(r.finalPrice).toBe(88);
  });
});

describe('depreciation declining_balance', () => {
  it('computes double-declining depreciation', () => {
    const result = computeFinancial('depreciation', {
      cost: 50000,
      salvageValue: 5000,
      lifespan: 5,
      method: 'declining_balance',
    });
    const r = (result as { result: Record<string, unknown> }).result;
    const schedule = r.schedule as Array<Record<string, number>>;
    expect(schedule).toHaveLength(5);
    expect(schedule[0].depreciation).toBe(20000); // 50000 * (2/5)
    expect(schedule[4].bookValue).toBeGreaterThanOrEqual(5000);
  });

  it('returns error for unknown depreciation method', () => {
    const result = computeFinancial('depreciation', {
      cost: 50000,
      salvageValue: 5000,
      lifespan: 5,
      method: 'bogus',
    });
    expect(result).toHaveProperty('error');
  });
});

describe('discount without tax', () => {
  it('computes discounted price without tax', () => {
    const result = computeFinancial('discount', {
      originalPrice: 100,
      discountPercent: 20,
    });
    const r = (result as { result: Record<string, number> }).result;
    expect(r.discountedPrice).toBe(80);
    expect(r.finalPrice).toBe(80);
  });
});

describe('validation errors', () => {
  it('rejects negative principal on simple_interest', () => {
    const result = computeFinancial('simple_interest', {
      principal: -1000,
      rate: 0.05,
      time: 3,
    });
    expect(result).toHaveProperty('error');
  });

  it('rejects negative rate', () => {
    const result = computeFinancial('simple_interest', {
      principal: 1000,
      rate: -0.05,
      time: 3,
    });
    expect(result).toHaveProperty('error');
  });

  it('rejects zero cost on roi', () => {
    const result = computeFinancial('roi', { gain: 1000, cost: 0 });
    expect(result).toHaveProperty('error');
  });

  it('rejects zero cost on markup', () => {
    const result = computeFinancial('markup', { cost: 0, sellingPrice: 50 });
    expect(result).toHaveProperty('error');
  });
});

describe('unknown operation', () => {
  it('returns error', () => {
    const result = computeFinancial('bogus', {});
    expect(result).toHaveProperty('error');
  });
});
```

- [ ] **Step 6: Run all financial engine tests**

```bash
cd /c/Code/euclid/euclid-mcp && pnpm test -- tests/financial-engine.test.ts
```

Expected: All PASS

- [ ] **Step 7: Commit**

```bash
cd /c/Code/euclid/euclid-mcp
git add src/engines/financial.ts tests/financial-engine.test.ts
git commit -m "feat: add financial engine — core TVM operations"
```

---

### Task 4: Financial Engine — Loan & Advanced Operations (NPV, IRR, loan_payment, amortization, depreciation, break_even)

**Files:**

- Modify: `src/engines/financial.ts`
- Modify: `tests/financial-engine.test.ts`

These operations use the `financial` npm package for NPV and IRR. The rest are pure formulas.

- [ ] **Step 1: Write failing tests for npv, irr, loan_payment**

Add to `tests/financial-engine.test.ts`:

```typescript
describe('npv', () => {
  it('computes net present value', () => {
    const result = computeFinancial('npv', {
      rate: 0.1,
      cashFlows: [-1000, 300, 400, 500, 600],
    });
    const r = (result as { result: Record<string, number> }).result;
    expect(r.npv).toBeCloseTo(399.44, 0);
  });

  it('computes npv with separate initial investment', () => {
    const result = computeFinancial('npv', {
      rate: 0.1,
      cashFlows: [300, 400, 500, 600],
      initialInvestment: 1000,
    });
    const r = (result as { result: Record<string, number> }).result;
    expect(r.npv).toBeCloseTo(399.44, 0);
  });
});

describe('irr', () => {
  it('computes internal rate of return', () => {
    const result = computeFinancial('irr', {
      cashFlows: [-1000, 300, 400, 500, 600],
    });
    const r = (result as { result: Record<string, unknown> }).result;
    expect(r.irr).toBeCloseTo(0.2285, 2);
    expect(r.irrPercent).toMatch(/22\.8/);
  });
});

describe('loan_payment', () => {
  it('computes monthly mortgage payment', () => {
    // $200,000 at 6% over 30 years (360 months)
    const result = computeFinancial('loan_payment', {
      principal: 200000,
      rate: 0.06,
      periods: 360,
      frequency: 12,
    });
    const r = (result as { result: Record<string, number> }).result;
    expect(r.payment).toBeCloseTo(1199.1, 0);
    expect(r.totalPaid).toBeCloseTo(431676, -2);
    expect(r.totalInterest).toBeCloseTo(231676, -2);
  });
});

describe('amortization', () => {
  it('generates amortization schedule', () => {
    const result = computeFinancial('amortization', {
      principal: 10000,
      rate: 0.06,
      periods: 12,
      frequency: 12,
    });
    const r = (result as { result: Record<string, unknown> }).result;
    expect(r.payment).toBeDefined();
    const schedule = r.schedule as Array<Record<string, number>>;
    expect(schedule).toHaveLength(12);
    expect(schedule[0].period).toBe(1);
    expect(schedule[11].balance).toBeCloseTo(0, 0);
  });

  it('returns error for periods > 600', () => {
    const result = computeFinancial('amortization', {
      principal: 200000,
      rate: 0.06,
      periods: 601,
      frequency: 12,
    });
    expect(result).toHaveProperty('error');
  });
});

describe('depreciation', () => {
  it('computes straight-line depreciation', () => {
    const result = computeFinancial('depreciation', {
      cost: 50000,
      salvageValue: 5000,
      lifespan: 5,
    });
    const r = (result as { result: Record<string, unknown> }).result;
    expect(r.annualDepreciation).toBe(9000);
    const schedule = r.schedule as Array<Record<string, number>>;
    expect(schedule).toHaveLength(5);
  });
});

describe('break_even', () => {
  it('computes break-even point', () => {
    const result = computeFinancial('break_even', {
      fixedCosts: 50000,
      pricePerUnit: 25,
      variableCostPerUnit: 10,
    });
    const r = (result as { result: Record<string, number> }).result;
    expect(r.breakEvenUnits).toBeCloseTo(3333.33, 0);
    expect(r.breakEvenRevenue).toBeCloseTo(83333.33, 0);
  });

  it('returns error when price equals variable cost', () => {
    const result = computeFinancial('break_even', {
      fixedCosts: 50000,
      pricePerUnit: 10,
      variableCostPerUnit: 10,
    });
    expect(result).toHaveProperty('error');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /c/Code/euclid/euclid-mcp && pnpm test -- tests/financial-engine.test.ts
```

Expected: New tests FAIL

- [ ] **Step 3: Implement NPV, IRR, loan_payment, amortization, depreciation, break_even**

Add to `src/engines/financial.ts` — the NPV/IRR functions using the `financial` package:

```typescript
import { irr as calcIrr, npv as calcNpv, pmt } from 'financial';

function npvCalc(params: Record<string, unknown>): FinancialResult {
  const { rate, cashFlows, initialInvestment } = params as {
    rate: number;
    cashFlows: number[];
    initialInvestment?: number;
  };
  const rateErr = validateRate(rate);
  if (rateErr) return { error: rateErr };

  let flows = cashFlows;
  if (initialInvestment !== undefined) {
    flows = [-initialInvestment, ...cashFlows];
  }

  // financial package npv expects rate and array of cash flows (period 1+)
  // NPV = sum of CF_t / (1+r)^t for t=1..n, plus CF_0
  const npvValue = flows[0] + calcNpv(rate, flows.slice(1));
  return { result: { npv: Math.round(npvValue * 100) / 100 } };
}

function irrCalc(params: Record<string, unknown>): FinancialResult {
  const { cashFlows, guess = 0.1 } = params as {
    cashFlows: number[];
    guess?: number;
  };

  try {
    const irrValue = calcIrr(cashFlows, guess);
    return {
      result: {
        irr: irrValue,
        irrPercent: formatPercent(irrValue),
      },
    };
  } catch {
    return {
      error:
        'IRR did not converge. Cash flows may not have a real IRR (need at least one sign change)',
    };
  }
}

function loanPayment(params: Record<string, unknown>): FinancialResult {
  const {
    principal,
    rate,
    periods,
    frequency = 12,
  } = params as {
    principal: number;
    rate: number;
    periods: number;
    frequency?: number;
  };
  const rateErr = validateRate(rate);
  if (rateErr) return { error: rateErr };

  const periodicRate = rate / frequency;
  const payment = -pmt(periodicRate, periods, principal);
  const totalPaid = payment * periods;
  const totalInterest = totalPaid - principal;

  return {
    result: {
      payment: Math.round(payment * 100) / 100,
      totalPaid: Math.round(totalPaid * 100) / 100,
      totalInterest: Math.round(totalInterest * 100) / 100,
    },
  };
}

function amortization(params: Record<string, unknown>): FinancialResult {
  const {
    principal,
    rate,
    periods,
    frequency = 12,
  } = params as {
    principal: number;
    rate: number;
    periods: number;
    frequency?: number;
  };
  if (periods > 600) return { error: 'Maximum 600 periods (50 years monthly)' };
  const rateErr = validateRate(rate);
  if (rateErr) return { error: rateErr };

  const periodicRate = rate / frequency;
  const payment = -pmt(periodicRate, periods, principal);
  const schedule: Array<Record<string, number>> = [];
  let balance = principal;

  for (let i = 1; i <= periods; i++) {
    const interestPayment = balance * periodicRate;
    const principalPayment = payment - interestPayment;
    balance -= principalPayment;
    schedule.push({
      period: i,
      payment: Math.round(payment * 100) / 100,
      principal: Math.round(principalPayment * 100) / 100,
      interest: Math.round(interestPayment * 100) / 100,
      balance: Math.round(Math.max(balance, 0) * 100) / 100,
    });
  }

  return {
    result: {
      payment: Math.round(payment * 100) / 100,
      schedule,
    },
  };
}

function depreciationCalc(params: Record<string, unknown>): FinancialResult {
  const {
    cost,
    salvageValue,
    lifespan,
    method = 'straight_line',
  } = params as {
    cost: number;
    salvageValue: number;
    lifespan: number;
    method?: string;
  };

  const schedule: Array<Record<string, number>> = [];

  if (method === 'straight_line') {
    const annual = (cost - salvageValue) / lifespan;
    let bookValue = cost;
    for (let year = 1; year <= lifespan; year++) {
      bookValue -= annual;
      schedule.push({
        year,
        depreciation: Math.round(annual * 100) / 100,
        bookValue: Math.round(bookValue * 100) / 100,
      });
    }
    return { result: { annualDepreciation: annual, schedule } };
  }

  if (method === 'declining_balance') {
    const rate = 2 / lifespan; // double-declining
    let bookValue = cost;
    for (let year = 1; year <= lifespan; year++) {
      const depreciation = Math.min(bookValue * rate, bookValue - salvageValue);
      bookValue -= depreciation;
      schedule.push({
        year,
        depreciation: Math.round(depreciation * 100) / 100,
        bookValue: Math.round(bookValue * 100) / 100,
      });
    }
    return { result: { annualDepreciation: schedule[0].depreciation, schedule } };
  }

  return {
    error: `Unknown depreciation method: ${method}. Use "straight_line" or "declining_balance"`,
  };
}

function breakEven(params: Record<string, unknown>): FinancialResult {
  const { fixedCosts, pricePerUnit, variableCostPerUnit } = params as {
    fixedCosts: number;
    pricePerUnit: number;
    variableCostPerUnit: number;
  };

  if (pricePerUnit <= variableCostPerUnit) {
    return { error: 'Price per unit must be greater than variable cost per unit' };
  }

  const units = fixedCosts / (pricePerUnit - variableCostPerUnit);
  return {
    result: {
      breakEvenUnits: Math.round(units * 100) / 100,
      breakEvenRevenue: Math.round(units * pricePerUnit * 100) / 100,
    },
  };
}
```

Add these cases to the `computeFinancial` switch:

```typescript
    case 'npv':
      return npvCalc(params);
    case 'irr':
      return irrCalc(params);
    case 'loan_payment':
      return loanPayment(params);
    case 'amortization':
      return amortization(params);
    case 'depreciation':
      return depreciationCalc(params);
    case 'break_even':
      return breakEven(params);
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /c/Code/euclid/euclid-mcp && pnpm test -- tests/financial-engine.test.ts
```

Expected: All PASS

- [ ] **Step 5: Commit**

```bash
cd /c/Code/euclid/euclid-mcp
git add src/engines/financial.ts tests/financial-engine.test.ts
git commit -m "feat: add financial engine — NPV, IRR, loans, amortization, depreciation, break-even"
```

---

### Task 5: Financial Tool Definition, Error Hints, and Registration

**Files:**

- Create: `src/tools/financial.ts`
- Create: `src/error-hints/financial.ts`
- Modify: `src/index.ts`
- Test: `tests/financial.test.ts`

- [ ] **Step 1: Write failing tool-level tests**

Create `tests/financial.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { financialTool } from '../src/tools/financial.js';

describe('financialTool', () => {
  it('has correct tool name', () => {
    expect(financialTool.name).toBe('financial');
  });

  it('has a description', () => {
    expect(financialTool.description).toBeTruthy();
  });

  it('handler computes simple interest', async () => {
    const response = await financialTool.handler({
      operation: 'simple_interest',
      principal: 10000,
      rate: 0.05,
      time: 3,
    });
    expect(response.isError).toBeUndefined();
    const content = JSON.parse(response.content[0].text);
    expect(content.result.interest).toBe(1500);
    expect(content.operation).toBe('simple_interest');
  });

  it('returns error with hint and examples', async () => {
    const response = await financialTool.handler({
      operation: 'simple_interest',
      principal: 10000,
      rate: 5,
      time: 3,
    });
    expect(response.isError).toBe(true);
    const content = JSON.parse(response.content[0].text);
    expect(content.hint).toBeTruthy();
    expect(content.examples).toBeInstanceOf(Array);
  });
});
```

- [ ] **Step 2: Create the error hints for financial**

Create `src/error-hints/financial.ts`:

```typescript
// src/error-hints/financial.ts
import { registerHints } from './index.js';

const EXAMPLES = [
  "financial('simple_interest', { principal: 10000, rate: 0.05, time: 3 })",
  "financial('compound_interest', { principal: 10000, rate: 0.065, time: 5, frequency: 12 })",
  "financial('loan_payment', { principal: 200000, rate: 0.06, periods: 360 })",
  "financial('npv', { rate: 0.1, cashFlows: [-1000, 300, 400, 500] })",
];

function getHint(errorMessage: string): string {
  if (errorMessage.includes('decimal') || errorMessage.includes('percentage')) {
    return 'Rate appears to be a percentage. Financial tool uses decimals: 0.065 for 6.5%, not 6.5.';
  }
  if (errorMessage.includes('non-negative') || errorMessage.includes('must be')) {
    return 'Check that numeric inputs are positive. Principal and periods must be non-negative.';
  }
  if (errorMessage.includes('IRR') || errorMessage.includes('converge')) {
    return 'IRR did not converge. Ensure cash flows have at least one sign change (e.g., initial negative investment followed by positive returns).';
  }
  if (errorMessage.includes('Unknown operation')) {
    return 'Valid operations: simple_interest, compound_interest, present_value, future_value, npv, irr, loan_payment, amortization, depreciation, roi, break_even, markup, discount.';
  }
  return 'Check your inputs. Use decimal rates (0.065 for 6.5%) and positive numeric values.';
}

registerHints('financial', getHint, EXAMPLES);
```

- [ ] **Step 3: Create the tool definition**

Create `src/tools/financial.ts`:

```typescript
// src/tools/financial.ts
import { z } from 'zod/v4';
import { computeFinancial } from '../engines/financial.js';
import '../error-hints/financial.js';
import { getErrorHint } from '../error-hints/index.js';

export const financialTool = {
  name: 'financial',

  description: `Performs financial and business math calculations deterministically. Use this tool for time-value-of-money, loans, investments, and business profitability calculations.

All rates are DECIMALS: use 0.065 for 6.5%, NOT 6.5. Outputs include both decimal and display formats (e.g., roi: 0.15 and roiPercent: "15%").

Use \`calculate\` for basic arithmetic. Use \`proportion\` for simple percentage calculations.

Operations:
- simple_interest: I = P × r × t
- compound_interest: A = P(1 + r/n)^(nt), returns effectiveRate
- present_value: PV = FV / (1 + r/n)^(nt)
- future_value: FV = PV × (1 + r/n)^(nt)
- npv: Net present value of cash flows
- irr: Internal rate of return
- loan_payment: Monthly/periodic payment amount
- amortization: Full payment schedule
- depreciation: Straight-line or declining balance
- roi: Return on investment
- break_even: Units and revenue to break even
- markup: Markup and margin from cost + selling price
- discount: Discounted price with optional tax

Examples:
- "Monthly mortgage payment" → financial("loan_payment", { principal: 350000, rate: 0.065, periods: 360 })
- "NPV of investment" → financial("npv", { rate: 0.1, cashFlows: [-50000, 15000, 20000, 25000] })
- "Effective annual rate" → financial("compound_interest", { principal: 1, rate: 0.065, time: 1, frequency: 12 })`,

  inputSchema: z.object({
    operation: z
      .enum([
        'simple_interest',
        'compound_interest',
        'present_value',
        'future_value',
        'npv',
        'irr',
        'loan_payment',
        'amortization',
        'depreciation',
        'roi',
        'break_even',
        'markup',
        'discount',
      ])
      .describe('The financial operation to perform'),
    principal: z.number().optional().describe('Principal amount or initial investment'),
    rate: z.number().optional().describe('Interest rate as decimal (0.065 = 6.5%)'),
    time: z.number().optional().describe('Time period (default unit: years)'),
    timeUnit: z
      .enum(['year', 'month', 'week', 'day'])
      .optional()
      .describe('Unit for time parameter (default: year)'),
    periods: z.number().optional().describe('Number of payment periods'),
    frequency: z.number().optional().describe('Compounding frequency per year (default: 12)'),
    futureValue: z.number().optional().describe('Future value amount'),
    presentValue: z.number().optional().describe('Present value amount'),
    cashFlows: z.array(z.number()).optional().describe('Array of cash flows (negative = outflow)'),
    initialInvestment: z
      .number()
      .optional()
      .describe('Initial investment (positive number, will be negated)'),
    guess: z.number().optional().describe('Initial guess for IRR (default: 0.1)'),
    gain: z.number().optional().describe('Total gain/revenue for ROI'),
    cost: z.number().optional().describe('Cost amount'),
    sellingPrice: z.number().optional().describe('Selling price for markup calculation'),
    salvageValue: z.number().optional().describe('Salvage value for depreciation'),
    lifespan: z.number().optional().describe('Asset lifespan in years'),
    method: z
      .string()
      .optional()
      .describe('Depreciation method: "straight_line" or "declining_balance"'),
    fixedCosts: z.number().optional().describe('Total fixed costs for break-even'),
    pricePerUnit: z.number().optional().describe('Price per unit for break-even'),
    variableCostPerUnit: z.number().optional().describe('Variable cost per unit for break-even'),
    originalPrice: z.number().optional().describe('Original price for discount'),
    discountPercent: z.number().optional().describe('Discount percentage (25 = 25%)'),
    taxPercent: z.number().optional().describe('Tax percentage to apply after discount'),
  }),

  handler: async (args: Record<string, unknown>) => {
    const { operation, ...params } = args;
    const result = computeFinancial(operation as string, params);

    if ('error' in result) {
      const { hint, examples } = getErrorHint('financial', result.error);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ error: result.error, operation, hint, examples }),
          },
        ],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            result: result.result,
            operation,
            ...(result.note && { note: result.note }),
          }),
        },
      ],
    };
  },
};
```

- [ ] **Step 4: Register the tool in index.ts**

Add to `src/index.ts`:

```typescript
import { financialTool } from './tools/financial.js';

// After existing registrations:
server.registerTool(
  financialTool.name,
  {
    description: financialTool.description,
    inputSchema: financialTool.inputSchema,
  },
  async (args) => financialTool.handler(args as Record<string, unknown>),
);
```

- [ ] **Step 5: Run tests**

```bash
cd /c/Code/euclid/euclid-mcp && pnpm test -- tests/financial.test.ts
```

Expected: All PASS

- [ ] **Step 6: Run full test suite to ensure no regression**

```bash
cd /c/Code/euclid/euclid-mcp && pnpm test
```

Expected: All PASS

- [ ] **Step 7: Commit**

```bash
cd /c/Code/euclid/euclid-mcp
git add src/tools/financial.ts src/error-hints/financial.ts src/index.ts tests/financial.test.ts
git commit -m "feat: add financial tool with 13 operations"
```

---

## Chunk 2: datetime, proportion, geometry, probability Tools

### Task 6: datetime Engine and Tool

**Files:**

- Create: `src/engines/datetime.ts`
- Create: `src/tools/datetime.ts`
- Create: `src/error-hints/datetime.ts`
- Modify: `src/index.ts`
- Test: `tests/datetime-engine.test.ts`
- Test: `tests/datetime.test.ts`

Follow the same TDD pattern as Tasks 3-5. Key implementation details:

- [ ] **Step 1: Write failing engine tests**

Test all 9 operations: `difference`, `add`, `subtract`, `business_days`, `day_of_week`, `is_leap_year`, `days_in_month`, `age`, `quarter`.

Key test cases:

```typescript
// difference: from 2026-01-15 to 2026-03-12 = 56 days
// add: 2026-01-31 + 1 month = 2026-02-28 (month-end handling)
// business_days: 2026-03-09 (Mon) to 2026-03-13 (Fri) = 5 business days
// business_days with holiday: same range minus 1 if holiday on a weekday
// day_of_week: 2026-03-12 = Thursday
// is_leap_year: 2024 = true, 2025 = false
// days_in_month: Feb 2024 = 29, Feb 2025 = 28
// age: birthDate 1990-06-15, asOf 2026-03-12 = 35 years, 8 months, 25 days
// quarter: 2026-03-12 = Q1, quarterStart = 2026-01-01, quarterEnd = 2026-03-31
```

- [ ] **Step 2: Implement datetime engine**

Use `date-fns` functions: `differenceInDays`, `differenceInBusinessDays`, `addDays`, `addMonths`, `addYears`, `isLeapYear`, `getDay`, `getDaysInMonth`, `parseISO`, `startOfQuarter`, `endOfQuarter`, `isWeekend`, `format`.

All dates parsed via `parseISO()`. The `age` operation requires `asOf` (no default to today — determinism).

- [ ] **Step 3: Run engine tests — expect PASS**

- [ ] **Step 4: Write error hints for datetime**

```typescript
// src/error-hints/datetime.ts
// Hint patterns: invalid date format, invalid month, from > to for business_days
```

- [ ] **Step 5: Create tool definition**

Follow the `financialTool` pattern. Schema with `operation` enum + date-specific params (`date`, `from`, `to`, `amount`, `unit`, `year`, `month`, `birthDate`, `asOf`, `holidays`).

- [ ] **Step 6: Write tool-level tests**

- [ ] **Step 7: Register in index.ts**

- [ ] **Step 8: Run full test suite — expect all PASS**

- [ ] **Step 9: Commit**

```bash
git commit -m "feat: add datetime tool with 9 operations"
```

---

### Task 7: proportion Engine and Tool

**Files:**

- Create: `src/engines/proportion.ts`
- Create: `src/tools/proportion.ts`
- Create: `src/error-hints/proportion.ts`
- Modify: `src/index.ts`
- Test: `tests/proportion-engine.test.ts`
- Test: `tests/proportion.test.ts`

Follow the same TDD pattern. Key implementation details:

- [ ] **Step 1: Write failing engine tests**

Test all 10 operations: `percentage_of`, `percentage_change`, `percentage_difference`, `what_percent`, `ratio_simplify`, `ratio_scale`, `compound_change`, `weighted_average`, `markup_to_margin`, `margin_to_markup`.

Key test cases:

```typescript
// percentage_of: 25% of 200 = 50
// percentage_change: from 80 to 100 = 25% increase
// percentage_change: from 100 to 80 = -20% decrease
// percentage_difference: between 80 and 100 = 22.22%
// what_percent: 25 out of 200 = 12.5%
// ratio_simplify: [6, 4, 2] → [3, 2, 1], "3:2:1"
// ratio_scale: [3, 2, 1] scaled to 120 → [60, 40, 20]
// compound_change: [10, -5, 20] → net ~25.4%
// weighted_average: values [80, 90, 70], weights [3, 2, 1] = 80.83...
// markup_to_margin: 50% markup = 33.33% margin
// margin_to_markup: 33.33% margin ≈ 50% markup
// Error: percentage_change from 0 → error
// Error: value < 1 warning for percentage inputs
```

- [ ] **Step 2: Implement proportion engine**

Pure arithmetic — no external dependencies. Uses mathjs `gcd` for ratio simplification (via `math.gcd()`).

Note the percentage convention: inputs are whole-number percentages (25 = 25%). Add warning when value < 1 for operations where the input is clearly meant to be a percentage.

- [ ] **Step 3-9: Same pattern as financial (tests, hints, tool, register, commit)**

```bash
git commit -m "feat: add proportion tool with 10 operations"
```

---

### Task 8: geometry Engine and Tool

**Files:**

- Create: `src/engines/geometry.ts`
- Create: `src/tools/geometry.ts`
- Create: `src/error-hints/geometry.ts`
- Modify: `src/index.ts`
- Test: `tests/geometry-engine.test.ts`
- Test: `tests/geometry.test.ts`

Follow the same TDD pattern. Key implementation details:

- [ ] **Step 1: Write failing engine tests**

Test all 13 operations: `circle`, `rectangle`, `triangle`, `polygon`, `ellipse`, `sphere`, `cylinder`, `cone`, `prism`, `distance`, `midpoint`, `slope`.

Key test cases:

```typescript
// circle: radius=5 → area=78.54, circumference=31.42, diameter=10
// rectangle: 4x6 → area=24, perimeter=20, diagonal=7.21
// triangle: base+height: base=10, height=5 → area=25
// triangle: SSS: sides 3,4,5 → area=6, perimeter=12
// triangle: solve SAS: sideA=5, sideB=7, angleC=60° → compute sideC, angleA, angleB
// polygon: regular hexagon side=4 → area=41.57
// ellipse: semiMajor=5, semiMinor=3 → area=47.12
// sphere: radius=3 → volume=113.10, surfaceArea=113.10
// cylinder: radius=2, height=5 → volume=62.83
// cone: radius=3, height=4 → slantHeight=5, volume=37.70
// prism: baseArea=12, height=5 → volume=60
// distance: [0,0] to [3,4] → 5
// distance 3D: [0,0,0] to [1,2,2] → 3
// midpoint: [0,0] to [4,6] → [2,3]
// slope: [1,2] to [3,6] → slope=2, yIntercept=0, equation="y = 2x"
```

- [ ] **Step 2: Implement geometry engine**

Uses mathjs for: `Math.PI` (or `math.pi`), `Math.sqrt`, `Math.pow`, trig functions for polygon area formula and triangle solver (law of cosines, law of sines).

Triangle solver implementation:

- base + height → area = 0.5 × base × height
- SSS (3 sides) → Heron's formula: s = (a+b+c)/2, area = √(s(s-a)(s-b)(s-c))
- Any 3 of 6 values → law of cosines: c² = a² + b² - 2ab·cos(C), law of sines: a/sin(A) = b/sin(B)

Default angle unit is degrees. Convert to radians internally for trig: `rad = deg × π / 180`.

- [ ] **Step 3-9: Same pattern (tests, hints, tool, register, commit)**

```bash
git commit -m "feat: add geometry tool with 13 operations"
```

---

### Task 9: probability Engine and Tool

**Files:**

- Create: `src/engines/probability.ts`
- Create: `src/tools/probability.ts`
- Create: `src/error-hints/probability.ts`
- Modify: `src/index.ts`
- Test: `tests/probability-engine.test.ts`
- Test: `tests/probability.test.ts`

Follow the same TDD pattern. Key implementation details:

- [ ] **Step 1: Write failing engine tests**

Test all 11 operations: `permutations`, `combinations`, `factorial`, `binomial_coeff`, `event_probability`, `independent_events`, `conditional`, `normal_dist`, `binomial_dist`, `poisson_dist`, `expected_value`.

Key test cases:

```typescript
// permutations: P(5,3) = 60
// combinations: C(10,3) = 120
// factorial: 10! = 3628800
// factorial: 0! = 1
// binomial_coeff: C(10,3) = 120 (same as combinations)
// event_probability: 3 favorable out of 12 → 0.25, odds "3:9", percentage "25%"
// independent_events: all of [0.5, 0.5, 0.5] → 0.125
// independent_events: any of [0.5, 0.5, 0.5] → 0.875
// conditional (Bayes): P(A)=0.01, P(B|A)=0.9, P(B)=0.05 → P(A|B)=0.18
// normal_dist CDF: x=0, mean=0, stdDev=1 → 0.5
// normal_dist CDF: x=1.96 → ≈0.975
// normal_dist PDF: x=0, mean=0, stdDev=1 → ≈0.3989
// normal_dist inverse: x=0.975 → ≈1.96
// binomial_dist PMF: n=10, k=3, p=0.5 → ≈0.1172
// poisson_dist PMF: k=3, lambda=2 → ≈0.1804
// expected_value: outcomes [1,2,3], probabilities [0.2,0.5,0.3] → 2.1
// Error: r > n for permutations/combinations
// Error: probability out of [0,1] range
// Error: factorial n > 170
```

- [ ] **Step 2: Implement probability engine**

- Combinatorics: use mathjs `math.combinations(n, r)`, `math.permutations(n, r)`, `math.factorial(n)`
- Distributions: use `jstat`:
  ```typescript
  import jStat from 'jstat';
  // Normal: jStat.normal.pdf(x, mean, std), jStat.normal.cdf(x, mean, std), jStat.normal.inv(p, mean, std)
  // Binomial: jStat.binomial.pdf(k, n, p), jStat.binomial.cdf(k, n, p)
  // Poisson: jStat.poisson.pdf(k, lambda), jStat.poisson.cdf(k, lambda)
  ```
- Event probability, independent events, conditional (Bayes), expected value: pure arithmetic

- [ ] **Step 3-9: Same pattern (tests, hints, tool, register, commit)**

```bash
git commit -m "feat: add probability tool with 11 operations"
```

---

### Task 10: Wave 1 Integration Test & Lint/Format Pass

**Files:**

- Modify: various (lint/format fixes)

- [ ] **Step 1: Run full test suite**

```bash
cd /c/Code/euclid/euclid-mcp && pnpm test
```

Expected: All tests pass

- [ ] **Step 2: Run lint**

```bash
cd /c/Code/euclid/euclid-mcp && pnpm lint
```

Fix any issues.

- [ ] **Step 3: Run format**

```bash
cd /c/Code/euclid/euclid-mcp && pnpm format
```

- [ ] **Step 4: Run build**

```bash
cd /c/Code/euclid/euclid-mcp && pnpm build
```

Expected: Clean build, no errors.

- [ ] **Step 5: Commit any lint/format fixes**

```bash
git commit -m "chore: lint and format Wave 1 tools"
```

---

## Chunk 3: Wave 2 — Task-Level Plan (Tier 2 Tools)

Wave 2 adds 5 tools: `numbertheory`, `matrix`, `base`, `sequence`, `solve`. Dependencies: Wave 2 has no new npm dependencies — uses mathjs + custom code.

**Cross-task dependencies:** `solve` depends on `matrix` (polynomial_roots uses companion matrix eigenvalues, linear_system delegates to matrix.solve). Build `matrix` before `solve`.

### Task 11: numbertheory Engine and Tool

**Files:** `src/engines/numbertheory.ts`, `src/tools/numbertheory.ts`, `src/error-hints/numbertheory.ts`, `tests/numbertheory-engine.test.ts`, `tests/numbertheory.test.ts`

12 operations: `gcd`, `lcm`, `prime_factors`, `is_prime`, `nth_prime`, `primes_in_range`, `mod`, `mod_pow`, `mod_inverse`, `divisors`, `euler_totient`, `is_coprime`.

Implementation: mathjs for `gcd`, `lcm`, `isPrime`, `invmod`. Custom code for: prime factorization (trial division + Pollard-Rho), sieve of Eratosthenes (primes_in_range, nth_prime), Euler's totient (from prime factorization), modPow (square-and-multiply).

Limits: n <= 10^15 for primality, n <= 10^12 for factorization, range <= 10^7 for primes_in_range, n <= 1,000,000 for nth_prime.

### Task 12: matrix Engine and Tool

**Files:** `src/engines/matrix.ts`, `src/tools/matrix.ts`, `src/error-hints/matrix.ts`, `tests/matrix-engine.test.ts`, `tests/matrix.test.ts`

14 operations: `add`, `subtract`, `multiply`, `scalar_multiply`, `transpose`, `determinant`, `inverse`, `rank`, `trace`, `dot_product`, `cross_product`, `solve`, `eigenvalues`, `identity`.

Implementation: Wraps mathjs native matrix operations. Converts JS arrays ↔ mathjs matrix types. Max 50x50 matrices.

### Task 13: base Engine and Tool

**Files:** `src/engines/base.ts`, `src/tools/base.ts`, `src/error-hints/base.ts`, `tests/base-engine.test.ts`, `tests/base.test.ts`

13 operations: `change_base`, `to_binary`, `to_hex`, `to_octal`, `from_binary`, `from_hex`, `bitwise_and`, `bitwise_or`, `bitwise_xor`, `bitwise_not`, `shift_left`, `shift_right`, `twos_complement`.

Implementation: `parseInt(value, fromBase)` and `number.toString(toBase)` for base conversion. Native JS bitwise operators for bitwise ops. Returns binary string representations alongside numeric results.

### Task 14: sequence Engine and Tool

**Files:** `src/engines/sequence.ts`, `src/tools/sequence.ts`, `src/error-hints/sequence.ts`, `tests/sequence-engine.test.ts`, `tests/sequence.test.ts`

10 operations: `arithmetic_nth`, `arithmetic_sum`, `arithmetic_find`, `geometric_nth`, `geometric_sum`, `geometric_infinite_sum`, `fibonacci`, `summation`, `product`, `custom_recursive`.

Implementation: Pure formulas for arithmetic/geometric sequences. Fibonacci via iterative loop. `summation`/`product`/`custom_recursive` reuse the existing sandboxed mathjs evaluator from `engine.ts` — import `evaluateExpression` from `../engine.js` and construct a single expression evaluated in one `vm.runInNewContext` call. Limits: range <= 10,000 for summation/product, n <= 1,000 for fibonacci, n <= 10,000 for custom_recursive.

### Task 15: solve Engine and Tool

**Files:** `src/engines/solve.ts`, `src/tools/solve.ts`, `src/error-hints/solve.ts`, `tests/solve-engine.test.ts`, `tests/solve.test.ts`

**Depends on:** Task 12 (matrix) — `polynomial_roots` uses companion matrix eigenvalues, `linear_system` delegates to matrix engine.

5 operations: `quadratic`, `polynomial_roots`, `linear_system`, `bisection`, `newton`.

Implementation: Quadratic formula (closed-form). Polynomial roots via companion matrix eigenvalues (uses matrix engine). Linear system delegates to matrix.solve. Bisection and Newton's method: custom iterative solvers using sandboxed expression evaluator.

### Task 16: Wave 2 Integration Test & Lint/Format Pass

Same as Task 10 but for Wave 2. Run full test suite, lint, format, build.

---

## Chunk 4: Wave 3 — Task-Level Plan (Tier 3 Tools)

Wave 3 adds 5 tools: `navigation`, `regression`, `calculus`, `sets`, `logic`. New npm dependencies: `geolib`, `regression`.

**Cross-task dependencies:** `regression.polynomial` reuses `matrix` engine from Wave 2. `calculus` reuses sandboxed evaluator. `logic` is fully independent (custom Boolean parser).

### Task 17: Install Wave 3 Dependencies

```bash
cd /c/Code/euclid/euclid-mcp && pnpm add geolib regression && pnpm add -D @types/regression
```

### Task 18: navigation Engine and Tool

**Files:** `src/engines/navigation.ts`, `src/tools/navigation.ts`, `src/error-hints/navigation.ts`, `tests/navigation-engine.test.ts`, `tests/navigation.test.ts`

8 operations: `haversine`, `bearing`, `destination`, `midpoint`, `rhumb_distance`, `rhumb_bearing`, `coord_convert`, `bounding_box`.

Implementation: `geolib` for haversine, bearing, destination, bounding box. Custom code for rhumb line calculations and DMS ↔ decimal coordinate conversion.

### Task 19: regression Engine and Tool

**Files:** `src/engines/regression.ts`, `src/tools/regression.ts`, `src/error-hints/regression.ts`, `tests/regression-engine.test.ts`, `tests/regression.test.ts`

8 operations: `linear`, `polynomial`, `exponential`, `logarithmic`, `power`, `interpolate`, `moving_average`, `predict`.

Implementation: `regression` (regression-js) package for all 5 regression types. Custom code for interpolation (~15 lines) and moving averages (~15 lines). `predict` uses the fitted model from the regression package.

### Task 20: calculus Engine and Tool

**Files:** `src/engines/calculus.ts`, `src/tools/calculus.ts`, `src/error-hints/calculus.ts`, `tests/calculus-engine.test.ts`, `tests/calculus.test.ts`

5 operations: `integrate_expression`, `integrate_data`, `derivative_at`, `derivative_data`, `limit`.

Implementation: All custom code. Simpson's rule and trapezoidal rule for integration. Central difference for derivatives. Expression evaluation reuses sandboxed mathjs evaluator. Limits evaluated by probing decreasing distances from target.

### Task 21: sets Engine and Tool

**Files:** `src/engines/sets.ts`, `src/tools/sets.ts`, `src/error-hints/sets.ts`, `tests/sets-engine.test.ts`, `tests/sets.test.ts`

10 operations: `union`, `intersection`, `difference`, `symmetric_difference`, `is_subset`, `is_superset`, `cardinality`, `power_set`, `cartesian_product`, `is_disjoint`.

Implementation: Pure JavaScript Set operations. Auto-deduplication of inputs. Results sorted numerically. Power set limit: 20 elements. Cartesian product limit: 100,000 pairs.

### Task 22: logic Engine and Tool

**Files:** `src/engines/logic.ts`, `src/tools/logic.ts`, `src/error-hints/logic.ts`, `tests/logic-engine.test.ts`, `tests/logic.test.ts`

4 operations: `eval_expression`, `truth_table`, `equivalent`, `simplify`.

Implementation: Custom recursive descent parser for Boolean expressions (~150 lines). Grammar:

```
expr     → iff_expr
iff_expr → impl_expr ('<->' impl_expr)*
impl_expr → or_expr ('->' or_expr)*
or_expr  → and_expr (('OR' | '||' | 'NOR' | 'XOR') and_expr)*
and_expr → not_expr (('AND' | '&&' | 'NAND') not_expr)*
not_expr → 'NOT' not_expr | atom
atom     → variable | '(' expr ')'
```

AST node types: `Variable`, `Not`, `BinaryOp` (op: and/or/xor/nand/nor/implies/iff). Supports: AND/&&/∧, OR/||/∨, NOT/!/¬, XOR/⊕/^, NAND, NOR, ->/→ (implication), <->/↔ (biconditional). Truth table by enumeration (max 16 variables). Equivalence by truth table comparison. Simplification via Boolean algebra identities.

### Task 23: Wave 3 Integration Test & Lint/Format Pass

Same as Task 10 and 16. Full test suite, lint, format, build.

---

## Summary

| Task | What                                | Wave  | Dependencies   |
| ---- | ----------------------------------- | ----- | -------------- |
| 0    | Error hints registry refactor       | Infra | —              |
| 1    | Install Wave 1 deps                 | Infra | —              |
| 2    | Create engines/ directory           | Infra | —              |
| 3    | Financial engine — core TVM         | 1     | Task 2         |
| 4    | Financial engine — loans/advanced   | 1     | Task 3         |
| 5    | Financial tool, hints, registration | 1     | Task 4, 0      |
| 6    | datetime engine + tool              | 1     | Task 0, 1      |
| 7    | proportion engine + tool            | 1     | Task 0         |
| 8    | geometry engine + tool              | 1     | Task 0         |
| 9    | probability engine + tool           | 1     | Task 0, 1      |
| 10   | Wave 1 integration test             | 1     | Tasks 5-9      |
| 11   | numbertheory engine + tool          | 2     | Task 0         |
| 12   | matrix engine + tool                | 2     | Task 0         |
| 13   | base engine + tool                  | 2     | Task 0         |
| 14   | sequence engine + tool              | 2     | Task 0         |
| 15   | solve engine + tool                 | 2     | Task 12        |
| 16   | Wave 2 integration test             | 2     | Tasks 11-15    |
| 17   | Install Wave 3 deps                 | 3     | —              |
| 18   | navigation engine + tool            | 3     | Task 17, 0     |
| 19   | regression engine + tool            | 3     | Task 17, 12, 0 |
| 20   | calculus engine + tool              | 3     | Task 0         |
| 21   | sets engine + tool                  | 3     | Task 0         |
| 22   | logic engine + tool                 | 3     | Task 0         |
| 23   | Wave 3 integration test             | 3     | Tasks 18-22    |
