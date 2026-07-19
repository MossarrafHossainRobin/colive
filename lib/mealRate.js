import { finiteNumber } from '@/lib/spreadsheet';

export const MEAL_RATE_FORMULA_VERSION = 'transparent-v1';
export const MEAL_RATE_PERIOD_RECORD_TYPE = 'meal_rate_period';

export function mealRatePeriodDocumentId(month) {
  return `__meal_rate_period_${String(month || '').replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}

export function mealTotal(row) {
  return Math.max(0,
    finiteNumber(row?.lunch) +
    finiteNumber(row?.dinner) +
    finiteNumber(row?.guestMeal)
  );
}

export function calculateMealRateBreakdown({
  bazarCost = 0,
  previousBalance = 0,
  otherExpenses = 0,
  adjustments = 0,
  totalMeals = 0,
} = {}) {
  const normalized = {
    bazarCost: finiteNumber(bazarCost),
    previousBalance: finiteNumber(previousBalance),
    otherExpenses: finiteNumber(otherExpenses),
    adjustments: finiteNumber(adjustments),
    totalMeals: Math.max(0, finiteNumber(totalMeals)),
  };

  const totalCost =
    normalized.bazarCost -
    normalized.previousBalance +
    normalized.otherExpenses +
    normalized.adjustments;
  const mealRate = normalized.totalMeals > 0 ? totalCost / normalized.totalMeals : 0;

  return {
    ...normalized,
    totalCost,
    mealRate,
    formulaVersion: MEAL_RATE_FORMULA_VERSION,
    formula: '(Bazar cost − previous balance + other expenses + signed adjustments) ÷ total meals',
  };
}

export function formatRate(value) {
  return finiteNumber(value).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
