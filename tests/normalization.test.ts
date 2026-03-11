// tests/normalization.test.ts
import { describe, it, expect } from 'vitest';
import { normalizeExpression, normalizeUnit } from '../src/normalization.js';

describe('normalizeExpression', () => {
  it('replaces × with *', () => {
    const result = normalizeExpression('2 × 3');
    expect(result.value).toBe('2 * 3');
    expect(result.wasTransformed).toBe(true);
    expect(result.original).toBe('2 × 3');
  });

  it('replaces ÷ with /', () => {
    const result = normalizeExpression('10 ÷ 2');
    expect(result.value).toBe('10 / 2');
    expect(result.wasTransformed).toBe(true);
  });

  it('replaces ² with ^2', () => {
    const result = normalizeExpression('x²');
    expect(result.value).toBe('x^2');
    expect(result.wasTransformed).toBe(true);
  });

  it('replaces ³ with ^3', () => {
    const result = normalizeExpression('x³');
    expect(result.value).toBe('x^3');
    expect(result.wasTransformed).toBe(true);
  });

  it('replaces √( with sqrt(', () => {
    const result = normalizeExpression('√(16)');
    expect(result.value).toBe('sqrt(16)');
    expect(result.wasTransformed).toBe(true);
  });

  it('replaces bare √ followed by number', () => {
    const result = normalizeExpression('√16');
    expect(result.value).toBe('sqrt(16)');
    expect(result.wasTransformed).toBe(true);
  });

  it('replaces bare √ followed by decimal number', () => {
    const result = normalizeExpression('√2.5');
    expect(result.value).toBe('sqrt(2.5)');
    expect(result.wasTransformed).toBe(true);
  });

  it('replaces Unicode minus sign with hyphen-minus', () => {
    const result = normalizeExpression('5 − 3');
    expect(result.value).toBe('5 - 3');
    expect(result.wasTransformed).toBe(true);
  });

  it('replaces π with pi', () => {
    const result = normalizeExpression('2 * π');
    expect(result.value).toBe('2 * pi');
    expect(result.wasTransformed).toBe(true);
  });

  it('strips thousands-separator commas', () => {
    const result = normalizeExpression('3,456 + 1,000,000');
    expect(result.value).toBe('3456 + 1000000');
    expect(result.wasTransformed).toBe(true);
  });

  it('does not strip commas in function arguments', () => {
    const result = normalizeExpression('log(100, 10)');
    expect(result.value).toBe('log(100, 10)');
    expect(result.wasTransformed).toBe(false);
  });

  it('handles multiple replacements in one expression', () => {
    const result = normalizeExpression('2 × π + √(9)');
    expect(result.value).toBe('2 * pi + sqrt(9)');
    expect(result.wasTransformed).toBe(true);
  });

  it('does not strip comma-space patterns in function arguments', () => {
    const result = normalizeExpression('max(100, 200)');
    expect(result.value).toBe('max(100, 200)');
    expect(result.wasTransformed).toBe(false);
  });

  it('handles numbers with many comma groups', () => {
    const result = normalizeExpression('1,234,567,890');
    expect(result.value).toBe('1234567890');
    expect(result.wasTransformed).toBe(true);
  });

  it('handles mixed thousands commas and function arguments', () => {
    const result = normalizeExpression('max(1,000, 2,000)');
    expect(result.value).toBe('max(1000, 2000)');
    expect(result.wasTransformed).toBe(true);
  });

  it('returns wasTransformed false for clean expressions', () => {
    const result = normalizeExpression('2 * 3 + sqrt(16)');
    expect(result.value).toBe('2 * 3 + sqrt(16)');
    expect(result.wasTransformed).toBe(false);
    expect(result.original).toBe('2 * 3 + sqrt(16)');
  });
});

describe('normalizeUnit', () => {
  it('normalizes celsius to degC', () => {
    const result = normalizeUnit('celsius');
    expect(result.value).toBe('degC');
    expect(result.wasTransformed).toBe(true);
    expect(result.original).toBe('celsius');
  });

  it('normalizes fahrenheit to degF', () => {
    const result = normalizeUnit('fahrenheit');
    expect(result.value).toBe('degF');
    expect(result.wasTransformed).toBe(true);
  });

  it('normalizes "kilometers per hour" to km/hour', () => {
    const result = normalizeUnit('kilometers per hour');
    expect(result.value).toBe('km/hour');
    expect(result.wasTransformed).toBe(true);
  });

  it('normalizes "miles per hour" to mile/hour', () => {
    const result = normalizeUnit('miles per hour');
    expect(result.value).toBe('mile/hour');
    expect(result.wasTransformed).toBe(true);
  });

  it('normalizes "meters per second" to m/s', () => {
    const result = normalizeUnit('meters per second');
    expect(result.value).toBe('m/s');
    expect(result.wasTransformed).toBe(true);
  });

  it('normalizes "square meters" to m^2', () => {
    const result = normalizeUnit('square meters');
    expect(result.value).toBe('m^2');
    expect(result.wasTransformed).toBe(true);
  });

  it('normalizes "cubic feet" to ft^3', () => {
    const result = normalizeUnit('cubic feet');
    expect(result.value).toBe('ft^3');
    expect(result.wasTransformed).toBe(true);
  });

  it('normalizes "litres" to liter', () => {
    const result = normalizeUnit('litres');
    expect(result.value).toBe('liter');
    expect(result.wasTransformed).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(normalizeUnit('Celsius').value).toBe('degC');
    expect(normalizeUnit('FAHRENHEIT').value).toBe('degF');
    expect(normalizeUnit('Kilometers Per Hour').value).toBe('km/hour');
  });

  it('passes through unknown units unchanged', () => {
    const result = normalizeUnit('km');
    expect(result.value).toBe('km');
    expect(result.wasTransformed).toBe(false);
    expect(result.original).toBe('km');
  });

  it('passes through already-correct units unchanged', () => {
    const result = normalizeUnit('degC');
    expect(result.value).toBe('degC');
    expect(result.wasTransformed).toBe(false);
  });
});
