// tests/error-hints.test.ts
import { describe, it, expect } from 'vitest';
import { getErrorHint } from '../src/error-hints/index.js';

describe('getErrorHint', () => {
  describe('calculate', () => {
    it('returns syntax hint for Unexpected token errors', () => {
      const { hint, examples } = getErrorHint('calculate', 'Unexpected operator +');
      expect(hint).toContain('syntax');
      expect(examples.length).toBeGreaterThan(0);
    });

    it('returns syntax hint for Parenthesis errors', () => {
      const { hint } = getErrorHint('calculate', 'Parenthesis ) unexpected');
      expect(hint).toContain('parenthes');
    });

    it('returns function hint for Undefined symbol errors', () => {
      const { hint } = getErrorHint('calculate', 'Undefined symbol foo');
      expect(hint).toContain('function');
    });

    it('returns security hint for disabled function errors', () => {
      const { hint } = getErrorHint('calculate', 'Function simplify is disabled');
      expect(hint).toContain('disabled');
    });

    it('returns syntax hint for Value expected errors', () => {
      const { hint } = getErrorHint('calculate', 'Value expected (char 1)');
      expect(hint).toContain('syntax');
    });

    it('returns fallback hint for unknown errors', () => {
      const { hint, examples } = getErrorHint('calculate', 'Something weird happened');
      expect(hint).toBeTruthy();
      expect(examples.length).toBeGreaterThan(0);
    });

    it('always includes examples', () => {
      const { examples } = getErrorHint('calculate', 'any error');
      expect(examples.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('convert', () => {
    it('returns unit hint for not-found unit errors', () => {
      const { hint } = getErrorHint('convert', 'Unit "foobar" not found.');
      expect(hint).toContain('not recognized');
    });

    it('returns incompatible hint for unit mismatch errors', () => {
      const { hint } = getErrorHint('convert', "Units do not match ('m' != '5 kg')");
      expect(hint).toContain('incompatible');
    });

    it('returns fallback hint for unknown errors', () => {
      const { hint, examples } = getErrorHint('convert', 'Something weird happened');
      expect(hint).toBeTruthy();
      expect(examples.length).toBeGreaterThan(0);
    });

    it('always includes examples', () => {
      const { examples } = getErrorHint('convert', 'any error');
      expect(examples.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('statistics', () => {
    it('returns operation hint for Unknown operation errors', () => {
      const { hint } = getErrorHint('statistics', 'Unknown operation: foo');
      expect(hint).toContain('operation');
    });

    it('returns percentile hint for Percentile errors', () => {
      const { hint } = getErrorHint('statistics', 'Percentile must be between 0 and 100');
      expect(hint).toContain('percentile');
    });

    it('returns empty data hint for empty errors', () => {
      const { hint } = getErrorHint('statistics', 'Data array is empty');
      expect(hint).toContain('at least one');
    });

    it('returns fallback hint for unknown errors', () => {
      const { hint, examples } = getErrorHint('statistics', 'Something weird happened');
      expect(hint).toBeTruthy();
      expect(examples.length).toBeGreaterThan(0);
    });

    it('always includes examples', () => {
      const { examples } = getErrorHint('statistics', 'any error');
      expect(examples.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('datetime', () => {
    it('returns ISO format hint for invalid date errors', () => {
      const { hint } = getErrorHint('datetime', "Invalid date 'abc'");
      expect(hint).toContain('ISO');
    });

    it('returns ambiguous hint for ambiguous date format errors', () => {
      const { hint } = getErrorHint('datetime', "Ambiguous date format '12/03/2026'");
      expect(hint).toContain('YYYY-MM-DD');
    });

    it('returns month hint for invalid month errors', () => {
      const { hint } = getErrorHint('datetime', 'Month must be between 1 and 12');
      expect(hint).toContain('1 and 12');
    });

    it('returns missing fields hint for required field errors', () => {
      const { hint } = getErrorHint('datetime', "Operation 'add' requires fields: date, amount");
      expect(hint).toContain('requires');
    });

    it('returns fallback hint for unknown errors', () => {
      const { hint, examples } = getErrorHint('datetime', 'Something weird happened');
      expect(hint).toBeTruthy();
      expect(examples.length).toBeGreaterThan(0);
    });

    it('always includes examples', () => {
      const { examples } = getErrorHint('datetime', 'any error');
      expect(examples.length).toBeGreaterThanOrEqual(2);
    });
  });
});
