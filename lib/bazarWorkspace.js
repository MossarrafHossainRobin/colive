const DHAKA_TIME_ZONE = 'Asia/Dhaka';

export const BAZAR_WORKSPACE_VERSION = 'spreadsheet-v1';
export const BAZAR_DEFAULT_CATEGORY = 'Uncategorized';
export const BAZAR_CATEGORIES = [
  'Groceries',
  'Vegetables',
  'Fish & Meat',
  'Rice & Staples',
  'Cooking Supplies',
  'Household',
  'Transport',
  'Other',
  BAZAR_DEFAULT_CATEGORY,
];

function cleanText(value) {
  return String(value ?? '').trim();
}

function englishDigits(value) {
  return String(value ?? '')
    .replace(/[০-৯]/g, (digit) => String(digit.charCodeAt(0) - 0x09e6))
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660));
}

function moneyNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const normalized = englishDigits(value)
    .replace(/,/g, '')
    .replace(/[৳\s]/g, '')
    .replace(/[^\d.-]/g, '');
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

export function amountToPaisa(value) {
  return Math.round(moneyNumber(value) * 100);
}

export function paisaToAmount(value) {
  const paisa = Number(value);
  return Number.isFinite(paisa) ? paisa / 100 : 0;
}

function normalizeItems(items) {
  if (Array.isArray(items)) {
    return items.map(cleanText).filter(Boolean);
  }
  if (typeof items === 'string') {
    return items.split(',').map(cleanText).filter(Boolean);
  }
  return [];
}

function descriptionItems(description) {
  return cleanText(description).split(',').map(cleanText).filter(Boolean);
}

function attachmentObject(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    const url = cleanText(value);
    return url ? { url, name: url.split('/').pop() || 'Attachment' } : null;
  }
  if (typeof value !== 'object') return null;
  const url = cleanText(value.url || value.downloadURL || value.downloadUrl || value.path);
  const suppliedName = cleanText(value.name || value.fileName || value.filename);
  if (!url && !suppliedName) return null;
  const name = suppliedName || url.split('/').pop() || 'Attachment';
  return {
    ...value,
    name,
    url,
  };
}

function normalizeAttachments(row) {
  const values = Array.isArray(row?.attachments)
    ? row.attachments
    : [row?.attachment, row?.attachmentUrl].filter(Boolean);
  const seen = new Set();
  return values.map(attachmentObject).filter((item) => {
    if (!item) return false;
    const key = item.url || item.name;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function isValidBazarDate(value) {
  const text = cleanText(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const [year, month, day] = text.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}

export function dhakaDateId(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: DHAKA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(safeDate);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${lookup.year}-${lookup.month}-${lookup.day}`;
}

function rowPaisa(row) {
  const stored = Number(row?.amountPaisa);
  if (Number.isFinite(stored)) return Math.round(stored);
  return amountToPaisa(row?.amount);
}

function memberNameFromRow(row) {
  return cleanText(
    row?.paidByName ||
    row?.memberName ||
    row?.userName ||
    row?.payerName
  );
}

export function normalizeBazarRow(row = {}, options = {}) {
  const id = cleanText(options.id || row.id || row.docId);
  const date = cleanText(row.date || row.bazarDate);
  const month = date.slice(0, 7) || cleanText(row.month || row.monthId);
  const items = normalizeItems(row.items);
  const description = cleanText(
    row.description || row.details || items.join(', ') || row.notes || row.reason
  );
  const attachments = normalizeAttachments(row);
  const amountPaisa = rowPaisa(row);
  const isDeleted = row.isDeleted === true || row.status === 'deleted';
  const paidById = cleanText(
    row.paidById || row.paidBy || row.userId || row.memberId || row.uid
  );
  const addedById = cleanText(
    row.addedById || row.createdById || row.addedBy || row.createdBy
  );

  return {
    ...row,
    id,
    marketId: cleanText(row.marketId || row.marketID || row.market_id || id),
    date,
    month,
    description,
    category: cleanText(row.category || row.categoryName) || BAZAR_DEFAULT_CATEGORY,
    categoryId: cleanText(row.categoryId || row.categoryKey),
    amountPaisa,
    amount: paisaToAmount(amountPaisa),
    paidById,
    paidByName: memberNameFromRow(row),
    userId: cleanText(row.userId || paidById),
    addedById,
    addedByName: cleanText(
      row.addedByName || row.creatorName || row.createdByName || row.adminName
    ),
    notes: cleanText(row.notes || row.reason),
    place: cleanText(row.place || row.market || row.location),
    items,
    countInBazar: row.countInBazar !== false,
    helperMemberId: cleanText(row.helperMemberId),
    helperMemberName: cleanText(row.helperMemberName),
    attachments,
    attachment: attachments[0] || null,
    attachmentUrl: cleanText(row.attachmentUrl || attachments[0]?.url),
    isDeleted,
    status: isDeleted ? 'deleted' : cleanText(row.status) || 'active',
    version: Math.max(1, Math.floor(moneyNumber(row.version) || 1)),
  };
}

export function normalizeBazarRows(rows = []) {
  return Array.isArray(rows)
    ? rows.map((row) => normalizeBazarRow(row))
    : [];
}

function duplicateText(value) {
  return cleanText(value)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function fnv1a(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export function bazarDuplicateFingerprint(row) {
  const normalized = normalizeBazarRow(row);
  return [
    normalized.date,
    normalized.paidById,
    normalized.amountPaisa,
    duplicateText(normalized.description),
    duplicateText(normalized.place),
  ].join('|');
}

export function getBazarDuplicateKey(row) {
  return `bazar_${fnv1a(bazarDuplicateFingerprint(row))}`;
}

export const bazarDuplicateKey = getBazarDuplicateKey;

function rowIdentity(row) {
  return cleanText(row?.id || row?.__tempId || row?.marketId);
}

export function validateBazarRow(row, options = {}) {
  const value = normalizeBazarRow(row);
  const fieldErrors = {};
  const selectedMonth = cleanText(options.selectedMonth);

  if (!isValidBazarDate(value.date)) fieldErrors.date = 'Choose a valid date.';
  if (selectedMonth && value.date.slice(0, 7) !== selectedMonth) {
    fieldErrors.date = `Date must be inside ${selectedMonth}.`;
  }
  if (!value.marketId) fieldErrors.marketId = 'Market ID is required.';
  if (!value.description) fieldErrors.description = 'Description is required.';
  if (!value.category) fieldErrors.category = 'Category is required.';
  if (value.amountPaisa <= 0) fieldErrors.amount = 'Amount must be greater than zero.';
  if (!value.paidById) fieldErrors.paidById = 'Select who paid.';

  const currentIdentity = rowIdentity(value);
  const activeRows = normalizeBazarRows(options.existingRows).filter((item) => !item.isDeleted);
  const duplicateKey = getBazarDuplicateKey(value);
  const duplicate = activeRows.find((item) => (
    rowIdentity(item) !== currentIdentity && getBazarDuplicateKey(item) === duplicateKey
  ));
  if (duplicate && options.allowDuplicate !== true) {
    fieldErrors.duplicate = `Possible duplicate of ${duplicate.marketId || duplicate.id}.`;
  }

  const marketIdDuplicate = activeRows.find((item) => (
    rowIdentity(item) !== currentIdentity &&
    duplicateText(item.marketId) === duplicateText(value.marketId)
  ));
  if (marketIdDuplicate) {
    fieldErrors.marketId = 'Market ID must be unique.';
  }

  const errors = Object.values(fieldErrors);
  return {
    valid: errors.length === 0,
    isValid: errors.length === 0,
    errors,
    fieldErrors,
    duplicateKey,
    duplicate,
    value,
  };
}

function actorId(actor) {
  return cleanText(actor?.id || actor?.uid || actor?.userId);
}

function actorName(actor) {
  return cleanText(actor?.name || actor?.displayName || actor?.email);
}

export function serializeBazarRow(row, options = {}) {
  const value = normalizeBazarRow(row);
  const existing = normalizeBazarRow(options.existingRow || {});
  const editorId = actorId(options.actor);
  const editorName = actorName(options.actor);
  const addedById = value.addedById || existing.addedById || editorId;
  const addedByName = value.addedByName || existing.addedByName || editorName;
  const attachments = value.attachmentUrl && !value.attachments.length
    ? [attachmentObject(value.attachmentUrl)].filter(Boolean)
    : value.attachments;

  return {
    date: value.date,
    month: value.date.slice(0, 7) || value.month,
    marketId: value.marketId,
    description: value.description,
    category: value.category || BAZAR_DEFAULT_CATEGORY,
    categoryId: value.categoryId,
    amountPaisa: value.amountPaisa,
    amount: paisaToAmount(value.amountPaisa),
    paidById: value.paidById,
    paidByName: value.paidByName,

    // Compatibility fields consumed throughout the current dashboard.
    userId: value.paidById,
    place: value.place,
    items: descriptionItems(value.description),
    countInBazar: value.countInBazar,
    helperMemberId: value.helperMemberId,
    helperMemberName: value.helperMemberName,
    notes: value.notes,

    addedById,
    addedByName,
    updatedById: editorId || value.updatedById || '',
    updatedByName: editorName || value.updatedByName || '',
    attachmentUrl: value.attachmentUrl,
    attachment: attachments[0] || null,
    attachments,
    duplicateKey: getBazarDuplicateKey(value),
    version: value.version,
    isDeleted: value.isDeleted,
    status: value.isDeleted ? 'deleted' : 'active',
  };
}

function dateFromId(dateId) {
  if (!isValidBazarDate(dateId)) return null;
  const [year, month, day] = dateId.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function dateIdFromUtc(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function weekBounds(dateId) {
  const date = dateFromId(dateId);
  if (!date) return { start: '', end: '' };
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  const start = new Date(date);
  start.setUTCDate(start.getUTCDate() - mondayOffset);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  return { start: dateIdFromUtc(start), end: dateIdFromUtc(end) };
}

function previousMonthId(monthId) {
  if (!/^\d{4}-\d{2}$/.test(monthId)) return '';
  const [year, month] = monthId.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function amountResult(paisa) {
  return paisaToAmount(Math.round(paisa));
}

function memberLookup(members = []) {
  return new Map(members.map((member) => [
    cleanText(member.id || member.uid),
    cleanText(member.displayName || member.name || member.fullName || member.email) || 'Unknown',
  ]));
}

function activeCountedRows(rows) {
  return normalizeBazarRows(rows).filter((row) => (
    !row.isDeleted && row.status !== 'draft' && row.countInBazar !== false
  ));
}

export function calculateBazarAnalytics(rows = [], options = {}) {
  const normalized = activeCountedRows(rows);
  const selectedMonth = cleanText(options.selectedMonth);
  const names = memberLookup(options.members);
  const openingPaisa = amountToPaisa(options.openingBalance);
  const selectedRows = selectedMonth
    ? normalized.filter((row) => row.month === selectedMonth)
    : normalized;
  const dailyMap = new Map();
  const categoryMap = new Map();
  const memberMap = new Map();
  const monthlyMap = new Map();

  normalized.forEach((row) => {
    monthlyMap.set(row.month, (monthlyMap.get(row.month) || 0) + row.amountPaisa);
  });
  selectedRows.forEach((row) => {
    dailyMap.set(row.date, (dailyMap.get(row.date) || 0) + row.amountPaisa);
    const category = row.category || BAZAR_DEFAULT_CATEGORY;
    const currentCategory = categoryMap.get(category) || { amountPaisa: 0, count: 0 };
    categoryMap.set(category, {
      amountPaisa: currentCategory.amountPaisa + row.amountPaisa,
      count: currentCategory.count + 1,
    });
    const payerId = row.paidById || row.userId;
    const payerName = row.paidByName || names.get(payerId) || 'Unknown';
    const currentMember = memberMap.get(payerId || payerName) || {
      memberId: payerId,
      name: payerName,
      amountPaisa: 0,
      count: 0,
    };
    memberMap.set(payerId || payerName, {
      ...currentMember,
      amountPaisa: currentMember.amountPaisa + row.amountPaisa,
      count: currentMember.count + 1,
    });
  });

  let cumulativePaisa = 0;
  const dailyTrend = [...dailyMap.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, amountPaisa]) => {
      cumulativePaisa += amountPaisa;
      return {
        date,
        amountPaisa,
        amount: amountResult(amountPaisa),
        cumulativePaisa,
        cumulative: amountResult(cumulativePaisa),
        runningBalance: amountResult(openingPaisa - cumulativePaisa),
      };
    });
  const selectedTotalPaisa = selectedRows.reduce((sum, row) => sum + row.amountPaisa, 0);
  const categoryBreakdown = [...categoryMap.entries()]
    .map(([name, item]) => ({
      name,
      count: item.count,
      amountPaisa: item.amountPaisa,
      amount: amountResult(item.amountPaisa),
      value: amountResult(item.amountPaisa),
      percentage: selectedTotalPaisa > 0 ? item.amountPaisa / selectedTotalPaisa * 100 : 0,
    }))
    .sort((left, right) => right.amountPaisa - left.amountPaisa);
  const memberContribution = [...memberMap.values()]
    .map((item) => ({
      ...item,
      amount: amountResult(item.amountPaisa),
    }))
    .sort((left, right) => right.amountPaisa - left.amountPaisa);
  const monthlyExpense = [...monthlyMap.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([month, amountPaisa]) => ({
      month,
      amountPaisa,
      amount: amountResult(amountPaisa),
    }));
  const previousMonth = previousMonthId(selectedMonth);
  const previousMonthPaisa = monthlyMap.get(previousMonth) || 0;

  return {
    dailyTrend,
    daily: dailyTrend,
    categoryBreakdown,
    categories: categoryBreakdown,
    memberContribution,
    contributions: memberContribution,
    monthlyExpense,
    previousMonth,
    previousMonthTotal: amountResult(previousMonthPaisa),
    comparisonPercent: previousMonthPaisa > 0
      ? (selectedTotalPaisa - previousMonthPaisa) / previousMonthPaisa * 100
      : null,
  };
}

export function calculateBazarSummary(rows = [], options = {}) {
  const allRows = normalizeBazarRows(rows);
  const today = cleanText(options.today) || dhakaDateId();
  const selectedDate = cleanText(options.selectedDate) || today;
  const selectedMonth = cleanText(options.selectedMonth) || selectedDate.slice(0, 7);
  const openingPaisa = amountToPaisa(options.openingBalance);
  const active = allRows.filter((row) => !row.isDeleted && row.status !== 'draft');
  const counted = active.filter((row) => row.countInBazar !== false);
  const monthRows = counted.filter((row) => row.month === selectedMonth);
  const rawMonthRows = active.filter((row) => row.month === selectedMonth);
  const excludedRows = rawMonthRows.filter((row) => row.countInBazar === false);
  const week = weekBounds(selectedDate);
  const totalPaisa = monthRows.reduce((sum, row) => sum + row.amountPaisa, 0);
  const rawTotalPaisa = rawMonthRows.reduce((sum, row) => sum + row.amountPaisa, 0);
  const excludedPaisa = excludedRows.reduce((sum, row) => sum + row.amountPaisa, 0);
  const todayPaisa = monthRows
    .filter((row) => row.date === today)
    .reduce((sum, row) => sum + row.amountPaisa, 0);
  const selectedDatePaisa = monthRows
    .filter((row) => row.date === selectedDate)
    .reduce((sum, row) => sum + row.amountPaisa, 0);
  const weeklyPaisa = monthRows
    .filter((row) => row.date >= week.start && row.date <= week.end)
    .reduce((sum, row) => sum + row.amountPaisa, 0);
  const expenseDates = new Set(monthRows.map((row) => row.date).filter(Boolean));
  const highestExpenseRow = monthRows.reduce((highest, row) => (
    !highest || row.amountPaisa > highest.amountPaisa ? row : highest
  ), null);
  const analytics = calculateBazarAnalytics(allRows, {
    ...options,
    selectedMonth,
  });

  return {
    selectedMonth,
    selectedDate,
    today,
    weekStart: week.start,
    weekEnd: week.end,
    dailyTotal: amountResult(todayPaisa),
    todayExpense: amountResult(todayPaisa),
    weeklyTotal: amountResult(weeklyPaisa),
    thisWeek: amountResult(weeklyPaisa),
    monthlyTotal: amountResult(totalPaisa),
    thisMonth: amountResult(totalPaisa),
    selectedDateTotal: amountResult(selectedDatePaisa),
    totalExpenses: amountResult(totalPaisa),
    rawTotal: amountResult(rawTotalPaisa),
    excludedTotal: amountResult(excludedPaisa),
    averageDailyExpense: expenseDates.size ? amountResult(totalPaisa / expenseDates.size) : 0,
    expenseDayCount: expenseDates.size,
    highestExpense: amountResult(highestExpenseRow?.amountPaisa || 0),
    highestExpenseRow,
    openingBalance: amountResult(openingPaisa),
    runningBalance: amountResult(openingPaisa - totalPaisa),
    remainingBalance: amountResult(openingPaisa - totalPaisa),
    entryCount: monthRows.length,
    rawEntryCount: rawMonthRows.length,
    excludedCount: excludedRows.length,
    analytics,
  };
}

export const calculateBazarSummaries = calculateBazarSummary;

export function findDuplicateBazarRows(rows = []) {
  const groups = new Map();
  normalizeBazarRows(rows).filter((row) => !row.isDeleted).forEach((row) => {
    const key = getBazarDuplicateKey(row);
    groups.set(key, [...(groups.get(key) || []), row]);
  });
  return [...groups.entries()]
    .filter(([, items]) => items.length > 1)
    .map(([key, items]) => ({ key, rows: items }));
}

export function buildBazarWorkspace(rows = [], options = {}) {
  const normalizedRows = normalizeBazarRows(rows);
  const summary = calculateBazarSummary(normalizedRows, options);
  return {
    version: BAZAR_WORKSPACE_VERSION,
    rows: normalizedRows,
    summary,
    analytics: summary.analytics,
    duplicateGroups: findDuplicateBazarRows(normalizedRows),
  };
}
