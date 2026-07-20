import { finiteNumber } from '@/lib/spreadsheet';

export const MEAL_CELL_CODES = {
  A: {
    code: 'A',
    label: 'Absent',
    description: 'No meal',
    total: 0,
    lunch: 0,
    dinner: 0,
    guestMeal: 0,
    tone: 'absent',
  },
  G: {
    code: 'G',
    label: 'Guest',
    description: 'One guest meal',
    total: 1,
    lunch: 0,
    dinner: 0,
    guestMeal: 1,
    tone: 'guest',
  },
  B: {
    code: 'B',
    label: 'Beef',
    description: 'One beef meal',
    total: 1,
    lunch: 1,
    dinner: 0,
    guestMeal: 0,
    tone: 'beef',
  },
  C: {
    code: 'C',
    label: 'Chicken',
    description: 'One chicken meal',
    total: 1,
    lunch: 1,
    dinner: 0,
    guestMeal: 0,
    tone: 'chicken',
  },
  F: {
    code: 'F',
    label: 'Fish',
    description: 'One fish meal',
    total: 1,
    lunch: 1,
    dinner: 0,
    guestMeal: 0,
    tone: 'fish',
  },
};

const CODE_ALIASES = {
  ABSENT: 'A',
  GUEST: 'G',
  BEEF: 'B',
  CHICKEN: 'C',
  FISH: 'F',
};

export function formatMealCellNumber(value) {
  const number = Math.max(0, finiteNumber(value));
  return Number(number.toFixed(2)).toString();
}

export function normalizeMealCellValue(rawValue) {
  const raw = String(rawValue ?? '').trim();
  const upper = raw.toUpperCase();
  const code = CODE_ALIASES[upper] || upper;

  if (MEAL_CELL_CODES[code]) {
    return {
      ...MEAL_CELL_CODES[code],
      display: code,
      value: code,
      valid: true,
      isCode: true,
    };
  }

  const number = raw === '' ? 0 : finiteNumber(raw, Number.NaN);
  if (!Number.isFinite(number) || number < 0) {
    return {
      display: raw,
      value: raw,
      valid: false,
      isCode: false,
      label: 'Invalid value',
      description: 'Use 0, a positive number, A, G, B, C, or F.',
      tone: 'invalid',
      total: 0,
      lunch: 0,
      dinner: 0,
      guestMeal: 0,
    };
  }

  const normalized = Math.max(0, Number(number.toFixed(2)));
  const display = formatMealCellNumber(normalized);
  return {
    display,
    value: display,
    valid: true,
    isCode: false,
    label: normalized === 0 ? 'No meal' : `${display} meal${normalized === 1 ? '' : 's'}`,
    description: normalized === 0 ? 'No meal recorded' : 'Manual meal quantity',
    tone: normalized === 0 ? 'none' : normalized === 1 ? 'one' : normalized === 2 ? 'two' : 'custom',
    total: normalized,
    lunch: normalized,
    dinner: 0,
    guestMeal: 0,
  };
}

export function mealCellValueFromRecord(record) {
  const stored = record?.mealCode ?? record?.mealCellValue;
  const lunch = Math.max(0, finiteNumber(record?.lunch));
  const dinner = Math.max(0, finiteNumber(record?.dinner));
  const guestMeal = Math.max(0, finiteNumber(record?.guestMeal));
  const total = lunch + dinner + guestMeal;

  if (stored !== undefined && stored !== null && String(stored).trim() !== '') {
    const normalized = normalizeMealCellValue(stored);
    const totalMatches = Math.abs(normalized.total - total) < 0.000001;
    const guestMatches = normalized.tone !== 'guest' || (
      guestMeal === normalized.guestMeal && lunch === 0 && dinner === 0
    );
    if (normalized.valid && totalMatches && guestMatches) return normalized.display;
  }

  // Legacy guest-only rows can be represented without losing their meaning.
  if (guestMeal === 1 && lunch === 0 && dinner === 0) return 'G';
  return formatMealCellNumber(total);
}

export function mealCellRecordPatch(rawValue) {
  const normalized = normalizeMealCellValue(rawValue);
  if (!normalized.valid) return normalized;
  return {
    ...normalized,
    mealCode: normalized.display,
    totalMeal: normalized.total,
    lunch: normalized.lunch,
    dinner: normalized.dinner,
    guestMeal: normalized.guestMeal,
  };
}

export function mealCellLegend() {
  return [
    normalizeMealCellValue('1'),
    normalizeMealCellValue('2'),
    normalizeMealCellValue('A'),
    normalizeMealCellValue('G'),
    normalizeMealCellValue('B'),
    normalizeMealCellValue('C'),
    normalizeMealCellValue('F'),
    normalizeMealCellValue('0'),
  ];
}
