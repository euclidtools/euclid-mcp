// src/error-hints/datetime.ts

export const EXAMPLES = [
  "datetime('difference', { from: '2026-01-01', to: '2026-03-15' })",
  "datetime('add', { date: '2026-01-01', amount: 90, unit: 'days' })",
  "datetime('age', { birthDate: '1990-06-15', asOf: '2026-03-21' })",
];

export function getHint(errorMessage: string): string {
  if (errorMessage.includes('Invalid date')) {
    return 'Date must be in ISO 8601 format: YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss';
  }
  if (errorMessage.includes('Ambiguous date format')) {
    return 'Ambiguous date format. Use ISO format YYYY-MM-DD to avoid DD/MM vs MM/DD confusion';
  }
  if (errorMessage.includes('Month must be between')) {
    return 'Month must be between 1 and 12';
  }
  if (errorMessage.includes('requires fields') || errorMessage.includes('Missing required')) {
    return errorMessage;
  }
  return 'Provide dates in ISO 8601 format (YYYY-MM-DD) and a valid operation: difference, add, subtract, business_days, days_in_month, age, quarter, day_of_week, is_leap_year.';
}
