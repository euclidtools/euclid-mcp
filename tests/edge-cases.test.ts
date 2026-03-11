// tests/edge-cases.test.ts
import { describe, it, expect } from 'vitest';
import { evaluateExpression } from '../src/engine.js';

describe('edge cases', () => {
  it('handles division by zero', () => {
    const result = evaluateExpression('1/0');
    expect(result).toHaveProperty('result');
    expect((result as { result: string }).result).toBe('Infinity');
  });

  it('handles negative division by zero', () => {
    const result = evaluateExpression('-1/0');
    expect(result).toHaveProperty('result');
    expect((result as { result: string }).result).toBe('-Infinity');
  });

  it('handles 0/0 (NaN)', () => {
    const result = evaluateExpression('0/0');
    expect(result).toHaveProperty('result');
    expect((result as { result: string }).result).toBe('NaN');
  });

  it('handles very large numbers', () => {
    const result = evaluateExpression('2^64');
    expect(result).toEqual({ result: '1.844674407371e+19' });
  });

  it('handles complex numbers', () => {
    const result = evaluateExpression('sqrt(-1)');
    expect(result).toHaveProperty('result');
    expect((result as { result: string }).result).toBe('i');
  });

  it('handles Euler identity', () => {
    const result = evaluateExpression('e^(i * pi) + 1');
    expect(result).toHaveProperty('result');
    // Should be approximately 0 (floating point may give very small number)
    const val = (result as { result: string }).result;
    expect(Number(val) === 0 || Math.abs(Number(val)) < 1e-12 || val.includes('e-')).toBe(true);
  });

  it('handles constants', () => {
    const pi = evaluateExpression('pi');
    expect(Number((pi as { result: string }).result)).toBeCloseTo(Math.PI, 10);

    const e = evaluateExpression('e');
    expect(Number((e as { result: string }).result)).toBeCloseTo(Math.E, 10);
  });

  it('handles nested parentheses', () => {
    const result = evaluateExpression('((((1 + 2) * 3) + 4) * 5)');
    expect(result).toEqual({ result: '65' });
  });

  it('handles whitespace in expressions', () => {
    const result = evaluateExpression('  2  +  3  ');
    expect(result).toEqual({ result: '5' });
  });

  it('rejects empty expression', () => {
    const result = evaluateExpression('');
    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toBe('Expression is empty');
  });

  it('rejects whitespace-only expression', () => {
    const result = evaluateExpression('   ');
    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toBe('Expression is empty');
  });

  it('blocks createUnit', () => {
    const result = evaluateExpression('createUnit("foo")');
    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toContain('disabled');
  });

  it('blocks simplify', () => {
    const result = evaluateExpression('simplify("x^2 + x")');
    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toContain('disabled');
  });

  it('blocks derivative', () => {
    const result = evaluateExpression('derivative("x^2", "x")');
    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toContain('disabled');
  });

  it('handles logarithms', () => {
    const result = evaluateExpression('log(1000, 10)');
    expect(Number((result as { result: string }).result)).toBeCloseTo(3, 10);
  });

  it('handles natural log', () => {
    const result = evaluateExpression('log(e^5)');
    expect(Number((result as { result: string }).result)).toBeCloseTo(5, 10);
  });
});
