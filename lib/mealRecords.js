function mealMemberId(row) {
  return String(row?.userId || row?.memberId || row?.uid || '').trim();
}

export function mealDocumentId(month, date, userId) {
  return `${month}_${date}_${userId}`.replace(/[^a-zA-Z0-9_-]/g, '_');
}

const MEAL_SYSTEM_RECORD_TYPES = new Set([
  'admin_activity',
  'meal_rate_period',
]);

export function isMealSystemRecord(row) {
  return Boolean(row?.isSystemRecord) || MEAL_SYSTEM_RECORD_TYPES.has(String(row?.recordType || ''));
}

function timestampMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (Number.isFinite(value.seconds)) return value.seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

export function isCurrentMealRecord(row) {
  return Boolean(row) &&
    !isMealSystemRecord(row) &&
    row.isDeleted !== true &&
    String(row.status || '').toLowerCase() !== 'deleted';
}

export function mealRecordKey(row) {
  return `${mealMemberId(row)}::${String(row?.date || '').trim()}`;
}

export function currentMealRecords(rows = [], { month = '' } = {}) {
  return (Array.isArray(rows) ? rows : []).filter((row) => (
    isCurrentMealRecord(row) &&
    (!month || String(row.month || String(row.date || '').slice(0, 7)) === month)
  ));
}

export function dedupeMealRecords(rows = [], options = {}) {
  const groups = new Map();
  currentMealRecords(rows, options).forEach((row) => {
    const key = mealRecordKey(row);
    if (key.startsWith('::') || key.endsWith('::')) return;
    const current = groups.get(key);
    if (!current) {
      groups.set(key, row);
      return;
    }
    const currentTime = timestampMillis(current.updatedAt) || timestampMillis(current.createdAt);
    const rowTime = timestampMillis(row.updatedAt) || timestampMillis(row.createdAt);
    const currentVersion = Number(current.version || 0);
    const rowVersion = Number(row.version || 0);
    if (rowVersion > currentVersion || (rowVersion === currentVersion && rowTime >= currentTime)) {
      groups.set(key, row);
    }
  });
  return [...groups.values()];
}

export function duplicateMealGroups(rows = [], options = {}) {
  const groups = new Map();
  currentMealRecords(rows, options).forEach((row) => {
    const key = mealRecordKey(row);
    if (key.startsWith('::') || key.endsWith('::')) return;
    groups.set(key, [...(groups.get(key) || []), row]);
  });
  return [...groups.entries()]
    .filter(([, items]) => items.length > 1)
    .map(([key, items]) => ({ key, rows: items }));
}
