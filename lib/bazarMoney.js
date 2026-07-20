import { calculateMonthlyBazarTotals } from './bazarCalculations';

export const BAZAR_MONEY_EVENT_TYPES = Object.freeze({
  DEPOSIT: 'bazar_deposit',
  PREVIOUS_DUE: 'previous_meal_due',
  CARRY_FORWARD: 'carry_forward',
  ADJUSTMENT: 'manual_adjustment',
  REMARK: 'member_remark',
  LEGACY_TRANSFER: 'nesthub_payment',
});

export const BAZAR_DEPOSIT_TYPE = BAZAR_MONEY_EVENT_TYPES.DEPOSIT;
export const PREVIOUS_MEAL_DUE_TYPE = BAZAR_MONEY_EVENT_TYPES.PREVIOUS_DUE;
export const CARRY_FORWARD_TYPE = BAZAR_MONEY_EVENT_TYPES.CARRY_FORWARD;
export const MANUAL_ADJUSTMENT_TYPE = BAZAR_MONEY_EVENT_TYPES.ADJUSTMENT;
export const MEMBER_REMARK_TYPE = BAZAR_MONEY_EVENT_TYPES.REMARK;
export const LEGACY_TRANSFER_TYPE = BAZAR_MONEY_EVENT_TYPES.LEGACY_TRANSFER;
export const BAZAR_MONEY_EVENT_TYPE_VALUES = Object.freeze(
  Object.values(BAZAR_MONEY_EVENT_TYPES)
);

export const BAZAR_MONEY_STATUSES = Object.freeze({
  PAID: 'Paid',
  CREDIT: 'Credit',
  DEBIT: 'Debit',
  PENDING: 'Pending',
});

const MONEY_PRECISION = 100;

function cleanText(value) {
  return String(value ?? '').trim();
}

function normalizeDigits(value) {
  return String(value ?? '')
    .replace(/[০-৯]/g, (digit) => String(digit.charCodeAt(0) - 0x09e6))
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660));
}

function identityValue(value) {
  if (value && typeof value === 'object') {
    return cleanText(value.id || value.uid || value.userId || value.memberId);
  }
  return cleanText(value);
}

function firstIdentity(...values) {
  for (const value of values) {
    const identity = identityValue(value);
    if (identity) return identity;
  }
  return '';
}

function optionalMoney(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;

  const source = normalizeDigits(value).trim();
  if (!source) return null;
  const parenthesized = /^\(.*\)$/.test(source);
  const normalized = source
    .replace(/[(),]/g, '')
    .replace(/[৳$£€\s]/g, '')
    .replace(/[^\d.+-]/g, '');
  if (!normalized || !/[\d]/.test(normalized)) return null;
  const amount = Number(normalized);
  if (!Number.isFinite(amount)) return null;
  return parenthesized ? -Math.abs(amount) : amount;
}

function firstMoney(...values) {
  for (const value of values) {
    const amount = optionalMoney(value);
    if (amount !== null) return amount;
  }
  return 0;
}

export function bazarMoneyNumber(value) {
  return optionalMoney(value) ?? 0;
}

export function roundBazarMoney(value) {
  const amount = bazarMoneyNumber(value);
  if (amount === 0) return 0;
  return Math.sign(amount) * (
    Math.round((Math.abs(amount) + Number.EPSILON) * MONEY_PRECISION) /
    MONEY_PRECISION
  );
}

export function getBazarMoneyMemberId(member = {}) {
  return firstIdentity(
    member.id,
    member.uid,
    member.userId,
    member.memberId,
    member.authUid,
    member.docId
  );
}

export function getBazarMoneyMemberIdentities(member = {}) {
  return [
    member.id,
    member.uid,
    member.userId,
    member.memberId,
    member.authUid,
    member.docId,
  ].map(identityValue).filter((identity, index, identities) => (
    identity && identities.indexOf(identity) === index
  ));
}

export function getBazarMoneyMemberName(member = {}) {
  return cleanText(
    member.displayName ||
    member.name ||
    member.fullName ||
    member.memberName ||
    member.email
  ) || 'Member';
}

export function getBalanceAdjustmentType(event = {}) {
  return cleanText(
    event.type || event.transactionType || event.adjustmentType || event.eventType
  ).toLowerCase().replace(/[\s-]+/g, '_');
}

export function getBalanceAdjustmentFromId(event = {}) {
  return firstIdentity(
    event.fromUserId,
    event.fromMember,
    event.senderId,
    event.sourceUserId,
    event.from
  );
}

export function getBalanceAdjustmentToId(event = {}) {
  return firstIdentity(
    event.toUserId,
    event.toMember,
    event.receiverId,
    event.targetUserId,
    event.to
  );
}

export function getBalanceAdjustmentMemberId(event = {}) {
  return firstIdentity(
    event.userId,
    event.memberId,
    event.uid,
    event.subjectUserId,
    event.member
  );
}

export function getBalanceAdjustmentAmount(event = {}) {
  return firstMoney(
    event.amount,
    event.value,
    event.delta,
    event.adjustment,
    event.balanceAmount
  );
}

export function getBalanceAdjustmentReason(event = {}) {
  return cleanText(
    event.reason || event.adjustmentReason || event.note || event.notes || event.description
  );
}

export function getBalanceAdjustmentRemark(event = {}) {
  return cleanText(
    event.remarks || event.remark || event.note || event.notes || event.reason || event.description
  );
}

export function hasBalanceAdjustmentFormula(event = {}) {
  return Object.prototype.hasOwnProperty.call(event, 'formula') ||
    Object.prototype.hasOwnProperty.call(event, 'formulaText') ||
    Object.prototype.hasOwnProperty.call(event, 'cellFormula') ||
    Object.prototype.hasOwnProperty.call(event, 'expression') ||
    Object.prototype.hasOwnProperty.call(event?.metadata || {}, 'formula');
}

export function getBalanceAdjustmentFormula(event = {}) {
  return cleanText(
    event.formula ||
    event.formulaText ||
    event.cellFormula ||
    event.expression ||
    event.metadata?.formula ||
    ''
  );
}

function timestampMilliseconds(value) {
  if (!value) return 0;
  if (typeof value?.toMillis === 'function') {
    const milliseconds = Number(value.toMillis());
    return Number.isFinite(milliseconds) ? milliseconds : 0;
  }
  if (value instanceof Date) {
    const milliseconds = value.getTime();
    return Number.isFinite(milliseconds) ? milliseconds : 0;
  }
  if (typeof value === 'object' && Number.isFinite(Number(value.seconds))) {
    return Number(value.seconds) * 1000 + Number(value.nanoseconds || 0) / 1e6;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? milliseconds : 0;
}

export function getBalanceAdjustmentTimestamp(event = {}) {
  return Math.max(
    timestampMilliseconds(event.updatedAt),
    timestampMilliseconds(event.createdAt),
    timestampMilliseconds(event.date),
    timestampMilliseconds(event.timestamp)
  );
}

export function parseMonthId(value) {
  const text = cleanText(value);
  const match = /^(\d{4})-(\d{1,2})(?:$|-)/.exec(text);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }

  const id = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
  return {
    id,
    year,
    month,
    monthIndex: year * 12 + month - 1,
  };
}

export function normalizeMonthId(value) {
  return parseMonthId(value)?.id || '';
}

export function previousMonthId(value) {
  const parsed = parseMonthId(value);
  if (!parsed) return '';
  const date = new Date(Date.UTC(parsed.year, parsed.month - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function compareMonthIds(left, right) {
  const leftMonth = parseMonthId(left);
  const rightMonth = parseMonthId(right);
  if (!leftMonth || !rightMonth) return 0;
  return Math.sign(leftMonth.monthIndex - rightMonth.monthIndex);
}

function monthFromTimestamp(value) {
  const milliseconds = timestampMilliseconds(value);
  if (!milliseconds) return '';
  const date = new Date(milliseconds);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function getBalanceAdjustmentMonth(event = {}) {
  return normalizeMonthId(
    event.month || event.monthId || event.period || event.date
  ) || monthFromTimestamp(
    event.date || event.createdAt || event.updatedAt || event.timestamp
  );
}

export function isActiveBalanceAdjustment(event) {
  return Boolean(event) &&
    event.isDeleted !== true &&
    cleanText(event.status).toLowerCase() !== 'deleted';
}

export function isMonetaryBalanceAdjustment(event) {
  if (!isActiveBalanceAdjustment(event)) return false;
  if (getBalanceAdjustmentType(event) === BAZAR_MONEY_EVENT_TYPES.REMARK) return false;
  return getBalanceAdjustmentEventDeltas(event).length > 0;
}

export function getBalanceAdjustmentTargetId(event = {}) {
  const directId = getBalanceAdjustmentMemberId(event);
  if (directId) return directId;

  const signedAmount = optionalMoney(event.signedAmount);
  const fromId = getBalanceAdjustmentFromId(event);
  const toId = getBalanceAdjustmentToId(event);
  if (signedAmount !== null) {
    return signedAmount < 0 ? fromId || toId : toId || fromId;
  }
  if (toId && !fromId) return toId;
  if (fromId && !toId) return fromId;
  return toId || fromId;
}

function combineDeltas(deltas) {
  const totals = new Map();
  deltas.forEach(({ memberId, amount }) => {
    const identity = identityValue(memberId);
    const value = bazarMoneyNumber(amount);
    if (!identity || value === 0) return;
    totals.set(identity, roundBazarMoney((totals.get(identity) || 0) + value));
  });
  return [...totals.entries()]
    .filter(([, amount]) => amount !== 0)
    .map(([memberId, amount]) => ({ memberId, amount }));
}

export function getBalanceAdjustmentEventDeltas(event = {}) {
  if (!isActiveBalanceAdjustment(event)) return [];
  if (getBalanceAdjustmentType(event) === BAZAR_MONEY_EVENT_TYPES.REMARK) return [];

  const signedAmount = optionalMoney(event.signedAmount);
  const directId = getBalanceAdjustmentMemberId(event);
  const fromId = getBalanceAdjustmentFromId(event);
  const toId = getBalanceAdjustmentToId(event);

  if (signedAmount !== null) {
    const targetId = directId || (signedAmount < 0 ? fromId || toId : toId || fromId);
    return targetId && signedAmount !== 0
      ? [{ memberId: targetId, amount: roundBazarMoney(signedAmount) }]
      : [];
  }

  const amount = getBalanceAdjustmentAmount(event);
  if (directId) {
    return amount !== 0
      ? [{ memberId: directId, amount: roundBazarMoney(amount) }]
      : [];
  }

  if (fromId && toId) {
    const absoluteAmount = Math.abs(amount);
    return combineDeltas([
      { memberId: fromId, amount: -absoluteAmount },
      { memberId: toId, amount: absoluteAmount },
    ]);
  }
  if (toId) {
    const positiveAmount = Math.abs(amount);
    return positiveAmount
      ? [{ memberId: toId, amount: roundBazarMoney(positiveAmount) }]
      : [];
  }
  if (fromId) {
    const negativeAmount = -Math.abs(amount);
    return negativeAmount
      ? [{ memberId: fromId, amount: roundBazarMoney(negativeAmount) }]
      : [];
  }
  return [];
}

export function signedBalanceAdjustmentAmount(event = {}, memberId = '') {
  const deltas = getBalanceAdjustmentEventDeltas(event);
  const identity = identityValue(memberId);
  if (identity) {
    return roundBazarMoney(deltas.reduce(
      (total, delta) => total + (delta.memberId === identity ? delta.amount : 0),
      0
    ));
  }

  const explicit = optionalMoney(event.signedAmount);
  if (explicit !== null) return roundBazarMoney(explicit);
  if (deltas.length === 1) return deltas[0].amount;
  return roundBazarMoney(getBalanceAdjustmentAmount(event));
}

export const signedEventAmount = signedBalanceAdjustmentAmount;
export const getEventDeltas = getBalanceAdjustmentEventDeltas;

function createIdentityMap(members) {
  const identityMap = new Map();
  members.forEach((member) => {
    const primaryId = getBazarMoneyMemberId(member);
    if (!primaryId) return;
    getBazarMoneyMemberIdentities(member).forEach((identity) => {
      if (!identityMap.has(identity)) identityMap.set(identity, primaryId);
    });
  });
  return identityMap;
}

function canonicalDeltas(event, identityMap) {
  return combineDeltas(getBalanceAdjustmentEventDeltas(event).map((delta) => ({
    ...delta,
    memberId: identityMap.get(delta.memberId) || delta.memberId,
  })));
}

function addToMemberMap(map, memberId, amount) {
  if (!memberId || !amount) return;
  map.set(memberId, roundBazarMoney((map.get(memberId) || 0) + amount));
}

function sumIdentityValues(values, identities) {
  return roundBazarMoney(identities.reduce(
    (total, identity) => total + bazarMoneyNumber(values[identity]),
    0
  ));
}

export function getBazarMoneyStatus(individualBalance, currentDeposit) {
  const balance = roundBazarMoney(individualBalance);
  const deposit = roundBazarMoney(currentDeposit);
  if (balance < 0) return BAZAR_MONEY_STATUSES.DEBIT;
  if (balance > 0) return BAZAR_MONEY_STATUSES.CREDIT;
  if (deposit > 0) return BAZAR_MONEY_STATUSES.PAID;
  return BAZAR_MONEY_STATUSES.PENDING;
}

export function calculateBazarMoneySummary(rows = [], options = {}) {
  const statusCounts = {
    [BAZAR_MONEY_STATUSES.PAID]: 0,
    [BAZAR_MONEY_STATUSES.CREDIT]: 0,
    [BAZAR_MONEY_STATUSES.DEBIT]: 0,
    [BAZAR_MONEY_STATUSES.PENDING]: 0,
  };

  const totals = rows.reduce((summary, row) => {
    const status = row.status || getBazarMoneyStatus(
      row.individualBalance,
      row.currentDeposit
    );
    if (Object.prototype.hasOwnProperty.call(statusCounts, status)) {
      statusCounts[status] += 1;
    }
    summary.currentMonthCollection += bazarMoneyNumber(row.currentDeposit);
    summary.memberBazarCost += bazarMoneyNumber(row.currentBazarCost);
    summary.previousBalance += bazarMoneyNumber(row.previousBalance);
    summary.carryForward += bazarMoneyNumber(row.carryForward);
    summary.adjustment += bazarMoneyNumber(row.adjustment);
    summary.totalDeposit += bazarMoneyNumber(row.totalDeposit);
    summary.individualBalance += bazarMoneyNumber(row.individualBalance);
    return summary;
  }, {
    currentMonthCollection: 0,
    memberBazarCost: 0,
    previousBalance: 0,
    carryForward: 0,
    adjustment: 0,
    totalDeposit: 0,
    individualBalance: 0,
  });

  Object.keys(totals).forEach((key) => {
    totals[key] = roundBazarMoney(totals[key]);
  });

  const suppliedExpense = optionalMoney(options.totalBazarExpense);
  const totalBazarExpense = roundBazarMoney(
    suppliedExpense === null ? totals.memberBazarCost : suppliedExpense
  );
  const remainingBazarBalance = roundBazarMoney(
    totals.currentMonthCollection - totalBazarExpense
  );

  return {
    ...totals,
    totalBazarExpense,
    remainingBazarBalance,
    totalBazarFund: totals.currentMonthCollection,
    overallCollection: totals.currentMonthCollection,
    overallExpense: totalBazarExpense,
    remainingBalance: remainingBazarBalance,
    membersPaid: rows.filter(
      (row) => roundBazarMoney(row.currentDeposit) > 0
    ).length,
    membersDue:
      statusCounts[BAZAR_MONEY_STATUSES.PENDING] +
      statusCounts[BAZAR_MONEY_STATUSES.DEBIT],
    membersWithCredit: statusCounts[BAZAR_MONEY_STATUSES.CREDIT],
    membersWithDebit: statusCounts[BAZAR_MONEY_STATUSES.DEBIT],
    paidCount: rows.filter(
      (row) => roundBazarMoney(row.currentDeposit) > 0
    ).length,
    dueCount:
      statusCounts[BAZAR_MONEY_STATUSES.PENDING] +
      statusCounts[BAZAR_MONEY_STATUSES.DEBIT],
    creditCount: statusCounts[BAZAR_MONEY_STATUSES.CREDIT],
    debitCount: statusCounts[BAZAR_MONEY_STATUSES.DEBIT],
    membersWithDeposit: rows.filter(
      (row) => roundBazarMoney(row.currentDeposit) > 0
    ).length,
    membersWithoutDeposit: rows.filter(
      (row) => roundBazarMoney(row.currentDeposit) <= 0
    ).length,
    statusCounts,
    memberCount: rows.length,
  };
}

function normalizeWorksheetArguments(config, bazarRows, adjustments, selectedMonth) {
  if (Array.isArray(config)) {
    return {
      members: config,
      bazarRows: Array.isArray(bazarRows) ? bazarRows : [],
      balanceAdjustments: Array.isArray(adjustments) ? adjustments : [],
      selectedMonth,
    };
  }
  const options = config && typeof config === 'object' ? config : {};
  return {
    members: Array.isArray(options.members) ? options.members : [],
    bazarRows: Array.isArray(options.bazarRows)
      ? options.bazarRows
      : Array.isArray(options.bazars) ? options.bazars : [],
    balanceAdjustments: Array.isArray(options.balanceAdjustments)
      ? options.balanceAdjustments
      : Array.isArray(options.adjustments) ? options.adjustments : [],
    selectedMonth: options.selectedMonth || options.month || '',
  };
}

export function buildBazarMoneyWorksheet(
  config = {},
  suppliedBazarRows,
  suppliedAdjustments,
  suppliedMonth
) {
  const {
    members,
    bazarRows,
    balanceAdjustments,
    selectedMonth: rawSelectedMonth,
  } = normalizeWorksheetArguments(
    config,
    suppliedBazarRows,
    suppliedAdjustments,
    suppliedMonth
  );
  const selectedMonth = normalizeMonthId(rawSelectedMonth);
  const identityMap = createIdentityMap(members);
  const bazarTotals = calculateMonthlyBazarTotals(
    selectedMonth ? bazarRows : [],
    selectedMonth
  );
  const previousBalances = new Map();
  const currentDeposits = new Map();
  const currentAdjustments = new Map();
  const latestRemarks = new Map();
  const latestReasons = new Map();
  const latestCellFormulas = new Map();

  function setLatestCellFormula(memberId, field, formula, order, index) {
    const identity = identityMap.get(memberId) || memberId;
    if (!identity || !field) return;
    const previous = latestCellFormulas.get(identity)?.[field];
    if (previous && (order < previous.order || (order === previous.order && index < previous.index))) {
      return;
    }
    latestCellFormulas.set(identity, {
      ...(latestCellFormulas.get(identity) || {}),
      [field]: { value: formula, order, index },
    });
  }

  balanceAdjustments.forEach((event, eventIndex) => {
    if (!isActiveBalanceAdjustment(event)) return;
    const eventMonth = getBalanceAdjustmentMonth(event);
    if (!eventMonth || !selectedMonth) return;

    const type = getBalanceAdjustmentType(event);
    const eventField = cleanText(event.field || event.fieldKey);
    const order = getBalanceAdjustmentTimestamp(event);
    if (eventMonth === selectedMonth && hasBalanceAdjustmentFormula(event) && eventField) {
      const rawTargetId = getBalanceAdjustmentTargetId(event);
      const targetId = identityMap.get(rawTargetId) || rawTargetId;
      setLatestCellFormula(targetId, eventField, getBalanceAdjustmentFormula(event), order, eventIndex);
    }

    if (type === BAZAR_MONEY_EVENT_TYPES.REMARK) {
      if (eventMonth !== selectedMonth) return;
      const rawTargetId = getBalanceAdjustmentTargetId(event);
      const targetId = identityMap.get(rawTargetId) || rawTargetId;
      const remark = getBalanceAdjustmentRemark(event);
      if (!targetId) return;
      const previous = latestRemarks.get(targetId);
      if (!previous || order > previous.order || (order === previous.order && eventIndex > previous.index)) {
        latestRemarks.set(targetId, { value: remark, order, index: eventIndex });
      }
      return;
    }

    const deltas = canonicalDeltas(event, identityMap);
    if (!deltas.length) return;

    if (eventMonth !== selectedMonth) return;

    let destination = null;
    if (type === BAZAR_MONEY_EVENT_TYPES.DEPOSIT) {
      destination = currentDeposits;
    } else if (
      type === BAZAR_MONEY_EVENT_TYPES.PREVIOUS_DUE ||
      type === BAZAR_MONEY_EVENT_TYPES.CARRY_FORWARD
    ) {
      destination = previousBalances;
    } else if (
      type === BAZAR_MONEY_EVENT_TYPES.ADJUSTMENT ||
      type === BAZAR_MONEY_EVENT_TYPES.LEGACY_TRANSFER ||
      (!type && (getBalanceAdjustmentFromId(event) || getBalanceAdjustmentToId(event))) ||
      (!BAZAR_MONEY_EVENT_TYPE_VALUES.includes(type) &&
        (getBalanceAdjustmentFromId(event) || getBalanceAdjustmentToId(event)))
    ) {
      destination = currentAdjustments;
    }

    if (!destination) return;
    const reason = getBalanceAdjustmentReason(event);
    deltas.forEach(({ memberId, amount }) => {
      addToMemberMap(destination, memberId, amount);
      if (destination !== currentAdjustments || !reason) return;
      const previous = latestReasons.get(memberId);
      if (!previous || order > previous.order || (order === previous.order && eventIndex > previous.index)) {
        latestReasons.set(memberId, { value: reason, order, index: eventIndex });
      }
    });
  });

  const seenMemberIds = new Set();
  const rows = members.reduce((result, member) => {
    const memberId = getBazarMoneyMemberId(member);
    if (!memberId || seenMemberIds.has(memberId)) return result;
    seenMemberIds.add(memberId);

    const identities = getBazarMoneyMemberIdentities(member);
    const currentBazarCost = sumIdentityValues(bazarTotals.byMember, identities);
    const previousBalance = roundBazarMoney(previousBalances.get(memberId) || 0);
    const currentDeposit = roundBazarMoney(
      currentBazarCost + (currentDeposits.get(memberId) || 0)
    );
    const adjustment = roundBazarMoney(currentAdjustments.get(memberId) || 0);
    const memberFormulas = latestCellFormulas.get(memberId) || {};
    const cellFormulas = Object.fromEntries(
      ['previousBalance', 'currentDeposit', 'adjustment'].map((field) => [
        field,
        memberFormulas[field]?.value || '',
      ])
    );
    const totalDeposit = roundBazarMoney(previousBalance + currentDeposit + adjustment);
    const individualBalance = roundBazarMoney(totalDeposit - currentBazarCost);
    const status = getBazarMoneyStatus(individualBalance, currentDeposit);

    result.push({
      id: memberId,
      memberId,
      userId: memberId,
      member,
      memberName: getBazarMoneyMemberName(member),
      name: getBazarMoneyMemberName(member),
      room: cleanText(member.room || member.roomNo || member.roomNumber),
      previousBalance,
      previousBalanceFormula: cellFormulas.previousBalance,
      carryForward: previousBalance,
      currentDeposit,
      currentDepositFormula: cellFormulas.currentDeposit,
      adjustment,
      adjustmentFormula: cellFormulas.adjustment,
      cellFormulas,
      adjustmentReason: latestReasons.get(memberId)?.value || '',
      reason: latestReasons.get(memberId)?.value || '',
      totalDeposit,
      availableBalance: totalDeposit,
      currentBazarCost,
      individualBalance,
      balance: individualBalance,
      status,
      remarks: latestRemarks.get(memberId)?.value || '',
    });
    return result;
  }, []);

  const summary = calculateBazarMoneySummary(rows, {
    totalBazarExpense: bazarTotals.house,
  });

  return {
    selectedMonth,
    previousMonth: previousMonthId(selectedMonth),
    rows,
    summary: {
      ...summary,
      unassignedBazarCost: roundBazarMoney(
        bazarTotals.house - summary.memberBazarCost
      ),
    },
  };
}

export function buildBazarMoneyRows(
  members = [],
  bazarRows = [],
  balanceAdjustments = [],
  selectedMonth = ''
) {
  return buildBazarMoneyWorksheet(
    members,
    bazarRows,
    balanceAdjustments,
    selectedMonth
  ).rows;
}

export const buildMemberMoneyWorksheet = buildBazarMoneyWorksheet;
export const buildMemberMoneyRows = buildBazarMoneyRows;
export const calculateMemberMoneySummary = calculateBazarMoneySummary;
export const memberIdOf = getBazarMoneyMemberId;
export const memberNameOf = getBazarMoneyMemberName;
export const getMemberId = getBazarMoneyMemberId;
export const getMemberName = getBazarMoneyMemberName;
export const getEventType = getBalanceAdjustmentType;
export const getEventMonth = getBalanceAdjustmentMonth;
export const getEventAmount = getBalanceAdjustmentAmount;
export const getEventReason = getBalanceAdjustmentReason;
export const getEventRemark = getBalanceAdjustmentRemark;
export const getEventFromId = getBalanceAdjustmentFromId;
export const getEventToId = getBalanceAdjustmentToId;
export const getEventTargetId = getBalanceAdjustmentTargetId;
