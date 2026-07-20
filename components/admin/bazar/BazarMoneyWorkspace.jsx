'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { QueryClient, QueryClientProvider, useMutation } from '@tanstack/react-query';
import {
  ArrowDownAZ,
  BadgeDollarSign,
  Check,
  ChevronDown,
  Clipboard,
  Cloud,
  Download,
  FileSpreadsheet,
  Filter,
  History,
  Loader2,
  Plus,
  Printer,
  Redo2,
  RefreshCw,
  Search,
  Undo2,
  Upload,
  X,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { downloadTextFile, parseDelimited } from '@/lib/spreadsheet';
import {
  bazarMoneyNumber,
  getBazarMoneyStatus,
  roundBazarMoney,
} from '@/lib/bazarMoney';
import BazarAdjustmentModal from './BazarAdjustmentModal';
import BazarMoneyActivityRail from './BazarMoneyActivityRail';

const AUTOSAVE_DELAY = 650;

const COLUMNS = [
  { key: 'memberName', label: 'Member', width: 220, sticky: true },
  { key: 'previousBalance', label: 'Previous Meal Due / Advance', width: 190, money: true, editable: true, tone: 'previous', signed: true },
  { key: 'currentDeposit', label: 'Current Deposit', width: 148, money: true, editable: true, tone: 'deposit', nonNegative: true },
  { key: 'adjustment', label: 'Adjustment', width: 132, money: true, editable: true, tone: 'adjustment', signed: true },
  { key: 'totalDeposit', label: 'Total Deposit', width: 144, money: true, formula: true },
  { key: 'currentBazarCost', label: 'Current Bazar Cost', width: 158, money: true, formula: true },
  { key: 'individualBalance', label: 'Individual Balance', width: 158, money: true, formula: true, tone: 'balance' },
  { key: 'status', label: 'Status', width: 112, formula: true },
  { key: 'remarks', label: 'Remarks', width: 250, editable: true, text: true },
];

const EDITABLE_KEYS = new Set(COLUMNS.filter((column) => column.editable).map((column) => column.key));

const COLUMN_TONES = {
  previous: { header: 'bg-[#7C3AED] text-white', value: 'text-[#7C3AED] dark:text-violet-300' },
  carry: { header: 'bg-[#7C3AED] text-white', value: 'text-[#7C3AED] dark:text-violet-300' },
  deposit: { header: 'bg-[#2563EB] text-white', value: 'text-[#2563EB] dark:text-blue-300' },
  adjustment: { header: 'bg-[#EA580C] text-white', value: 'text-[#EA580C] dark:text-orange-300' },
  balance: { header: 'bg-[#0891B2] text-white', value: 'text-[#0891B2] dark:text-cyan-300' },
};

const STATUS_STYLES = {
  Paid: 'bg-[#16A34A] text-white',
  Credit: 'bg-[#7C3AED] text-white',
  Debit: 'bg-[#DC2626] text-white',
  Pending: 'bg-slate-500 text-white',
};

function money(value, { signed = false } = {}) {
  const amount = roundBazarMoney(value);
  const absolute = Math.abs(amount).toLocaleString('en-US', {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  });
  if (amount < 0) return `-৳${absolute}`;
  if (signed && amount > 0) return `+৳${absolute}`;
  return `৳${absolute}`;
}

function cellKey(memberId, field) {
  return `${memberId}::${field}`;
}

function sameValue(left, right, field) {
  if (field === 'remarks') return String(left || '') === String(right || '');
  return Math.abs(bazarMoneyNumber(left) - bazarMoneyNumber(right)) < 0.005;
}

function cellFormula(row, field) {
  return String(row?.cellFormulas?.[field] || row?.[`${field}Formula`] || '').trim();
}

function defaultCellValue(row, field) {
  if (field === 'previousBalance') return 0;
  if (field === 'currentDeposit') return row.currentBazarCost;
  if (field === 'adjustment') return 0;
  if (field === 'remarks') return '';
  return row[field];
}

function normalizeFormulaDigits(value) {
  return String(value ?? '')
    .replace(/[\u06f0-\u06f9]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[\u09e6-\u09ef]/g, (digit) => String(digit.charCodeAt(0) - 0x09e6))
    .replace(/[\u0660-\u0669]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[−–—]/g, '-');
}

function evaluateMoneyExpression(rawFormula, column) {
  const formula = String(rawFormula ?? '').trim();
  if (!formula.startsWith('=')) return null;
  if (formula.length > 240) throw new Error(`${column.label} formula is too long.`);

  const source = normalizeFormulaDigits(formula.slice(1)).replace(/[,৳$£€\s]/g, '');
  let index = 0;
  const peek = () => source[index];
  const consume = (char) => {
    if (peek() !== char) return false;
    index += 1;
    return true;
  };

  function parseNumber() {
    const start = index;
    while (/\d/.test(peek())) index += 1;
    if (peek() === '.') {
      index += 1;
      while (/\d/.test(peek())) index += 1;
    }
    const text = source.slice(start, index);
    if (!text || text === '.') throw new Error(`${column.label} formula has an invalid number.`);
    const value = Number(text);
    if (!Number.isFinite(value)) throw new Error(`${column.label} formula has an invalid number.`);
    return value;
  }

  function parseExpression() {
    let value = parseTerm();
    while (peek() === '+' || peek() === '-') {
      const operator = peek();
      index += 1;
      const right = parseTerm();
      value = operator === '+' ? value + right : value - right;
    }
    return value;
  }

  function parseFactor() {
    if (consume('+')) return parseFactor();
    if (consume('-')) return -parseFactor();
    if (consume('(')) {
      const value = parseExpression();
      if (!consume(')')) throw new Error(`${column.label} formula is missing a closing parenthesis.`);
      return value;
    }
    return parseNumber();
  }

  function parseTerm() {
    let value = parseFactor();
    while (peek() === '*' || peek() === '/') {
      const operator = peek();
      index += 1;
      const right = parseFactor();
      if (operator === '*') value *= right;
      else {
        if (Math.abs(right) < 0.0000001) throw new Error(`${column.label} formula cannot divide by zero.`);
        value /= right;
      }
    }
    return value;
  }

  if (!source) throw new Error(`${column.label} formula is empty.`);
  const value = parseExpression();
  if (index !== source.length) throw new Error(`${column.label} formula has unsupported text.`);
  if (!Number.isFinite(value)) throw new Error(`${column.label} formula must calculate to a valid number.`);
  return roundBazarMoney(value);
}

function parseCellInput(rawValue, column) {
  if (column.text) return String(rawValue ?? '').slice(0, 500);
  const formulaValue = evaluateMoneyExpression(rawValue, column);
  if (formulaValue !== null) {
    if (column.nonNegative && formulaValue < 0) throw new Error(`${column.label} cannot be negative.`);
    return {
      value: formulaValue,
      formula: String(rawValue ?? '').trim().slice(0, 240),
    };
  }
  return {
    value: parseCellValue(rawValue, column),
    formula: '',
  };
}

function parseCellValue(rawValue, column) {
  if (column.text) return String(rawValue ?? '').slice(0, 500);
  const source = String(rawValue ?? '')
    .replace(/[০-৯]/g, (digit) => String(digit.charCodeAt(0) - 0x09e6))
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/,/g, '')
    .replace(/[৳\s]/g, '')
    .trim();
  if (!source || !/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(source)) {
    throw new Error(`${column.label} must be a valid number.`);
  }
  const amount = roundBazarMoney(Number(source));
  if (!Number.isFinite(amount)) throw new Error(`${column.label} must be a valid number.`);
  if (column.nonNegative && amount < 0) throw new Error(`${column.label} cannot be negative.`);
  return amount;
}

function applyOverrides(row, overrides, formulaOverrides) {
  const next = { ...row };
  next.cellFormulas = { ...(row.cellFormulas || {}) };
  for (const field of EDITABLE_KEYS) {
    const key = cellKey(row.memberId, field);
    if (Object.prototype.hasOwnProperty.call(overrides, key)) next[field] = overrides[key];
    if (Object.prototype.hasOwnProperty.call(formulaOverrides, key)) {
      next.cellFormulas[field] = formulaOverrides[key] || '';
    }
  }
  next.totalDeposit = roundBazarMoney(
    bazarMoneyNumber(next.previousBalance) +
    bazarMoneyNumber(next.currentDeposit) +
    bazarMoneyNumber(next.adjustment)
  );
  next.availableBalance = next.totalDeposit;
  next.individualBalance = roundBazarMoney(next.totalDeposit - bazarMoneyNumber(next.currentBazarCost));
  next.balance = next.individualBalance;
  next.status = getBazarMoneyStatus(next.individualBalance, next.currentDeposit);
  return next;
}

function selectionBounds(anchor, active) {
  if (!anchor || !active) return null;
  return {
    top: Math.min(anchor.row, active.row),
    bottom: Math.max(anchor.row, active.row),
    left: Math.min(anchor.column, active.column),
    right: Math.max(anchor.column, active.column),
  };
}

function columnLetter(index) {
  let value = index + 1;
  let result = '';
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function formulaFor(row, column) {
  if (!row || !column) return '';
  if (column.key === 'totalDeposit') return '= Previous Meal Due / Advance + Current Deposit + Adjustment';
  if (column.key === 'individualBalance') return '= Total Deposit - Current Bazar Cost';
  if (column.key === 'status') return '= IF(Balance>0,"Credit",IF(Balance<0,"Debit",IF(Deposit>0,"Paid","Pending")))';
  if (column.key === 'currentBazarCost') return '= SUM(Counted Bazar Entries for Member)';
  if (column.money && column.editable) return cellFormula(row, column.key) || String(roundBazarMoney(row[column.key]));
  if (column.money) return String(roundBazarMoney(row[column.key]));
  return String(row[column.key] ?? '');
}

function rowSearchText(row) {
  return [
    row.memberName,
    row.member?.email,
    row.room,
    row.status,
    row.remarks,
    row.currentDeposit,
    row.individualBalance,
  ].join(' ').toLowerCase();
}

function compareRows(left, right, sort) {
  let result = 0;
  if (sort.key === 'memberName') {
    result = String(left.memberName).localeCompare(String(right.memberName), undefined, { numeric: true });
  } else if (sort.key === 'room') {
    result = String(left.room || '').localeCompare(String(right.room || ''), undefined, { numeric: true });
  } else {
    result = bazarMoneyNumber(left[sort.key]) - bazarMoneyNumber(right[sort.key]);
  }
  return sort.direction === 'asc' ? result : -result;
}

function cellDisplay(row, column) {
  if (column.key === 'memberName') return row.memberName;
  if (column.key === 'status') return row.status;
  if (column.money) return money(row[column.key], { signed: column.signed || ['previousBalance', 'individualBalance'].includes(column.key) });
  return row[column.key] || '';
}

function spreadsheetHeaders() {
  return COLUMNS.map((column) => column.label);
}

function normalizeHeader(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function sourceValue(source, labels) {
  for (const label of labels) {
    const value = source[normalizeHeader(label)];
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return undefined;
}

function BazarMoneyWorkspaceInner({
  rows = [],
  activity = [],
  selectedMonth = '',
  onSaveCell,
  onRefresh,
  onSyncChange,
}) {
  const fileInputRef = useRef(null);
  const tableRef = useRef(null);
  const queueRef = useRef(Promise.resolve());
  const timersRef = useRef(new Map());
  const stagedRef = useRef(new Map());
  const selectingRef = useRef(false);
  const editingRef = useRef(null);
  const [overrides, setOverrides] = useState({});
  const [formulaOverrides, setFormulaOverrides] = useState({});
  const [pendingKeys, setPendingKeys] = useState(() => new Set());
  const [saveErrors, setSaveErrors] = useState({});
  const [scheduledCount, setScheduledCount] = useState(0);
  const [historyState, setHistoryState] = useState({ past: [], future: [] });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sort, setSort] = useState({ key: 'memberName', direction: 'asc' });
  const [active, setActive] = useState({ row: 0, column: 0 });
  const [anchor, setAnchor] = useState({ row: 0, column: 0 });
  const [editing, setEditing] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [modal, setModal] = useState({ open: false, mode: 'deposit', memberId: '' });
  const [refreshing, setRefreshing] = useState(false);

  const saveMutation = useMutation({
    mutationKey: ['bazar-money-cell', selectedMonth],
    mutationFn: (operation) => {
      if (typeof onSaveCell !== 'function') throw new Error('Saving is not available.');
      const next = queueRef.current
        .catch(() => undefined)
        .then(() => onSaveCell(operation));
      queueRef.current = next.catch(() => undefined);
      return next;
    },
  });

  const displayRows = useMemo(
    () => rows.map((row) => applyOverrides(row, overrides, formulaOverrides)),
    [formulaOverrides, overrides, rows]
  );

  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return displayRows
      .filter((row) => statusFilter === 'all' || row.status.toLowerCase() === statusFilter)
      .filter((row) => !query || rowSearchText(row).includes(query))
      .sort((left, right) => compareRows(left, right, sort));
  }, [displayRows, search, sort, statusFilter]);

  const bounds = useMemo(() => selectionBounds(anchor, active), [active, anchor]);
  const activeRow = visibleRows[active.row] || null;
  const activeColumn = COLUMNS[active.column] || null;
  const selectedCellName = activeRow && activeColumn
    ? `${columnLetter(active.column)}${active.row + 2}`
    : 'A1';

  const syncState = useMemo(() => {
    if (Object.keys(saveErrors).length) {
      return { state: 'error', detail: `${Object.keys(saveErrors).length} cell${Object.keys(saveErrors).length === 1 ? '' : 's'} need attention` };
    }
    const count = pendingKeys.size + scheduledCount;
    if (count) return { state: 'syncing', detail: `${count} change${count === 1 ? '' : 's'} saving in background` };
    return { state: 'synced', detail: 'Realtime Firestore sync is current' };
  }, [pendingKeys, saveErrors, scheduledCount]);

  useEffect(() => {
    onSyncChange?.({
      ...syncState,
      pending: pendingKeys.size + scheduledCount,
      errors: Object.keys(saveErrors).length,
    });
  }, [onSyncChange, pendingKeys.size, saveErrors, scheduledCount, syncState]);

  useEffect(() => {
    setOverrides((current) => {
      let changed = false;
      const next = { ...current };
      Object.entries(current).forEach(([key, target]) => {
        const [memberId, field] = key.split('::');
        const serverRow = rows.find((row) => row.memberId === memberId);
        if (serverRow && sameValue(serverRow[field], target, field) && !pendingKeys.has(key) && !stagedRef.current.has(key)) {
          delete next[key];
          changed = true;
        }
      });
      return changed ? next : current;
    });
    setFormulaOverrides((current) => {
      let changed = false;
      const next = { ...current };
      Object.entries(current).forEach(([key, target]) => {
        const [memberId, field] = key.split('::');
        const serverRow = rows.find((row) => row.memberId === memberId);
        if (serverRow && cellFormula(serverRow, field) === String(target || '') && !pendingKeys.has(key) && !stagedRef.current.has(key)) {
          delete next[key];
          changed = true;
        }
      });
      return changed ? next : current;
    });
  }, [pendingKeys, rows]);

  useEffect(() => {
    setActive({ row: 0, column: 0 });
    setAnchor({ row: 0, column: 0 });
    editingRef.current = null;
    setEditing(null);
  }, [search, sort, statusFilter]);

  useEffect(() => {
    editingRef.current = editing;
  }, [editing]);

  useEffect(() => {
    setOverrides({});
    setFormulaOverrides({});
    setHistoryState({ past: [], future: [] });
    setSaveErrors({});
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current.clear();
    stagedRef.current.clear();
    setScheduledCount(0);
  }, [selectedMonth]);

  useEffect(() => {
    const finishSelection = () => { selectingRef.current = false; };
    window.addEventListener('pointerup', finishSelection);
    return () => window.removeEventListener('pointerup', finishSelection);
  }, []);

  useEffect(() => () => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
  }, []);

  const focusCell = useCallback((row, column) => {
    const nextRow = Math.max(0, Math.min(visibleRows.length - 1, row));
    const nextColumn = Math.max(0, Math.min(COLUMNS.length - 1, column));
    setActive({ row: nextRow, column: nextColumn });
    window.requestAnimationFrame(() => {
      tableRef.current?.querySelector(`[data-money-cell="${nextRow}-${nextColumn}"]`)?.focus();
    });
  }, [visibleRows.length]);

  const persistOperation = useCallback(async (operation) => {
    const key = cellKey(operation.memberId, operation.field);
    setPendingKeys((current) => new Set(current).add(key));
    setSaveErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
    try {
      await saveMutation.mutateAsync(operation);
      return true;
    } catch (error) {
      setOverrides((current) => {
        if (!sameValue(current[key], operation.after, operation.field)) return current;
        return { ...current, [key]: operation.before };
      });
      setFormulaOverrides((current) => ({ ...current, [key]: operation.beforeFormula || '' }));
      setSaveErrors((current) => ({ ...current, [key]: error?.message || 'Could not save.' }));
      toast.error(error?.message || `Could not save ${operation.field}.`);
      return false;
    } finally {
      setPendingKeys((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  }, [saveMutation]);

  const scheduleOperation = useCallback((operation, { immediate = false } = {}) => {
    const key = cellKey(operation.memberId, operation.field);
    setOverrides((current) => ({ ...current, [key]: operation.after }));
    setFormulaOverrides((current) => ({ ...current, [key]: operation.afterFormula || '' }));
    const existingTimer = timersRef.current.get(key);
    if (existingTimer) window.clearTimeout(existingTimer);
    const existing = stagedRef.current.get(key);
    const merged = existing
      ? {
          ...operation,
          before: existing.before,
          beforeFormula: existing.beforeFormula,
          delta: operation.field === 'remarks'
            ? 0
            : roundBazarMoney(bazarMoneyNumber(operation.after) - bazarMoneyNumber(existing.before)),
        }
      : operation;
    stagedRef.current.set(key, merged);

    const run = () => {
      const staged = stagedRef.current.get(key);
      stagedRef.current.delete(key);
      const timer = timersRef.current.get(key);
      if (timer) window.clearTimeout(timer);
      timersRef.current.delete(key);
      setScheduledCount(stagedRef.current.size);
      return staged ? persistOperation(staged) : Promise.resolve(true);
    };

    if (immediate) return run();
    const timer = window.setTimeout(run, AUTOSAVE_DELAY);
    timersRef.current.set(key, timer);
    setScheduledCount(stagedRef.current.size);
    return Promise.resolve(true);
  }, [persistOperation]);

  const flushAll = useCallback(async () => {
    const staged = [...stagedRef.current.values()];
    stagedRef.current.clear();
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current.clear();
    setScheduledCount(0);
    for (const operation of staged) {
      await persistOperation(operation);
    }
  }, [persistOperation]);

  const recordHistory = useCallback((operations, label) => {
    if (!operations.length) return;
    setHistoryState((current) => ({
      past: [...current.past.slice(-49), { operations, label, id: `${Date.now()}-${Math.random()}` }],
      future: [],
    }));
  }, []);

  const makeOperation = useCallback((row, column, rawAfter, reason = '') => {
    const parsed = parseCellInput(rawAfter, column);
    const after = column.text ? parsed : parsed.value;
    const beforeFormula = column.text ? '' : cellFormula(row, column.key);
    const afterFormula = column.text ? '' : parsed.formula;
    const before = row[column.key];
    if (sameValue(before, after, column.key) && beforeFormula === afterFormula) return null;
    return {
      memberId: row.memberId,
      memberName: row.memberName,
      field: column.key,
      before,
      after,
      beforeFormula,
      afterFormula,
      delta: column.text ? 0 : roundBazarMoney(bazarMoneyNumber(after) - bazarMoneyNumber(before)),
      reason: reason || row.remarks || (column.key === 'adjustment' ? 'Manual Adjustment' : 'Spreadsheet edit'),
      remarks: column.key === 'remarks' ? String(after) : row.remarks || '',
      source: 'spreadsheet',
      month: selectedMonth,
    };
  }, [selectedMonth]);

  const commitOperations = useCallback(async (operations, {
    label = 'Spreadsheet edit',
    history = true,
    immediate = false,
  } = {}) => {
    const filtered = operations.filter(Boolean);
    if (!filtered.length) return true;
    if (history) recordHistory(filtered, label);
    const results = await Promise.all(filtered.map((operation) => scheduleOperation(operation, { immediate })));
    return results.every(Boolean);
  }, [recordHistory, scheduleOperation]);

  const finishEditing = useCallback(({ immediate = false, move = null } = {}) => {
    if (!editing) return;
    const row = visibleRows.find((item) => item.memberId === editing.memberId);
    const column = COLUMNS.find((item) => item.key === editing.field);
    editingRef.current = null;
    setEditing(null);
    if (!row || !column) return;
    try {
      const operation = makeOperation(row, column, editing.value);
      if (operation) void commitOperations([operation], { label: `Edited ${column.label}`, immediate });
    } catch (error) {
      toast.error(error.message);
    }
    if (move) focusCell(move.row, move.column);
  }, [commitOperations, editing, focusCell, makeOperation, visibleRows]);

  const beginEdit = useCallback((rowIndex, columnIndex, seed) => {
    const row = visibleRows[rowIndex];
    const column = COLUMNS[columnIndex];
    if (!row || !column?.editable) return;
    const pendingEdit = editingRef.current;
    if (
      seed !== undefined &&
      pendingEdit?.row === rowIndex &&
      pendingEdit?.column === columnIndex
    ) {
      const nextEdit = {
        ...pendingEdit,
        value: `${pendingEdit.value ?? ''}${seed}`,
      };
      editingRef.current = nextEdit;
      setEditing(nextEdit);
      return;
    }
    const key = cellKey(row.memberId, column.key);
    const staged = stagedRef.current.get(key);
    if (staged) {
      const timer = timersRef.current.get(key);
      if (timer) window.clearTimeout(timer);
      timersRef.current.delete(key);
      stagedRef.current.delete(key);
      setScheduledCount(stagedRef.current.size);
      void persistOperation(staged);
    }
    const current = column.money ? (cellFormula(row, column.key) || row[column.key] || '') : row[column.key] ?? '';
    const nextEdit = {
      memberId: row.memberId,
      field: column.key,
      row: rowIndex,
      column: columnIndex,
      value: seed !== undefined ? seed : String(current),
    };
    editingRef.current = nextEdit;
    setEditing(nextEdit);
  }, [persistOperation, visibleRows]);

  const selectedMatrix = useCallback(() => {
    if (!bounds) return '';
    const lines = [];
    for (let rowIndex = bounds.top; rowIndex <= bounds.bottom; rowIndex += 1) {
      const row = visibleRows[rowIndex];
      if (!row) continue;
      const values = [];
      for (let columnIndex = bounds.left; columnIndex <= bounds.right; columnIndex += 1) {
        const column = COLUMNS[columnIndex];
        values.push(
          column.key === 'memberName'
            ? row.memberName
            : column.money && column.editable && cellFormula(row, column.key)
              ? cellFormula(row, column.key)
              : String(row[column.key] ?? '')
        );
      }
      lines.push(values.join('\t'));
    }
    return lines.join('\n');
  }, [bounds, visibleRows]);

  const copySelection = useCallback(async () => {
    const text = selectedMatrix();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Selection copied.');
    } catch {
      toast.error('Clipboard access is unavailable.');
    }
  }, [selectedMatrix]);

  const pasteMatrix = useCallback(async (text) => {
    const matrix = String(text || '')
      .replace(/\r/g, '')
      .split('\n')
      .filter((line, index, lines) => line || index < lines.length - 1)
      .map((line) => line.split('\t'));
    if (!matrix.length || !visibleRows.length) return;
    const operations = [];
    const seen = new Set();
    matrix.forEach((values, rowOffset) => {
      values.forEach((value, columnOffset) => {
        const row = visibleRows[active.row + rowOffset];
        const column = COLUMNS[active.column + columnOffset];
        if (!row || !column?.editable) return;
        const key = cellKey(row.memberId, column.key);
        if (seen.has(key)) return;
        try {
          const operation = makeOperation(row, column, value, 'Bulk paste');
          if (operation) {
            operations.push(operation);
            seen.add(key);
          }
        } catch (error) {
          toast.error(`${row.memberName}: ${error.message}`);
        }
      });
    });
    if (!operations.length) {
      toast.error('Paste into Previous Meal Due / Advance, Current Deposit, Adjustment, or Remarks.');
      return;
    }
    await commitOperations(operations, { label: `Pasted ${operations.length} cells`, immediate: true });
    toast.success(`${operations.length} cell${operations.length === 1 ? '' : 's'} pasted.`);
  }, [active.column, active.row, commitOperations, makeOperation, visibleRows]);

  const undo = useCallback(async () => {
    const group = historyState.past.at(-1);
    if (!group) return;
    await flushAll();
    const operations = [...group.operations].reverse().map((operation) => ({
      ...operation,
      before: operation.after,
      after: operation.before,
      beforeFormula: operation.afterFormula,
      afterFormula: operation.beforeFormula,
      delta: operation.field === 'remarks' ? 0 : -operation.delta,
      reason: `Undo: ${operation.reason || group.label}`,
      source: 'undo',
    }));
    setOverrides((current) => {
      const next = { ...current };
      operations.forEach((operation) => { next[cellKey(operation.memberId, operation.field)] = operation.after; });
      return next;
    });
    setFormulaOverrides((current) => {
      const next = { ...current };
      operations.forEach((operation) => { next[cellKey(operation.memberId, operation.field)] = operation.afterFormula || ''; });
      return next;
    });
    await Promise.all(operations.map((operation) => persistOperation(operation)));
    setHistoryState((current) => ({
      past: current.past.slice(0, -1),
      future: [group, ...current.future],
    }));
    toast.success('Change undone.');
  }, [flushAll, historyState.past, persistOperation]);

  const redo = useCallback(async () => {
    const group = historyState.future[0];
    if (!group) return;
    await flushAll();
    const operations = group.operations.map((operation) => ({
      ...operation,
      reason: `Redo: ${operation.reason || group.label}`,
      source: 'redo',
    }));
    setOverrides((current) => {
      const next = { ...current };
      operations.forEach((operation) => { next[cellKey(operation.memberId, operation.field)] = operation.after; });
      return next;
    });
    setFormulaOverrides((current) => {
      const next = { ...current };
      operations.forEach((operation) => { next[cellKey(operation.memberId, operation.field)] = operation.afterFormula || ''; });
      return next;
    });
    await Promise.all(operations.map((operation) => persistOperation(operation)));
    setHistoryState((current) => ({
      past: [...current.past, group],
      future: current.future.slice(1),
    }));
    toast.success('Change redone.');
  }, [flushAll, historyState.future, persistOperation]);

  const clearSelection = useCallback(async () => {
    if (!bounds) return;
    const operations = [];
    for (let rowIndex = bounds.top; rowIndex <= bounds.bottom; rowIndex += 1) {
      const row = visibleRows[rowIndex];
      for (let columnIndex = bounds.left; columnIndex <= bounds.right; columnIndex += 1) {
        const column = COLUMNS[columnIndex];
        if (!row || !column?.editable) continue;
        const operation = makeOperation(row, column, defaultCellValue(row, column.key), 'Reset to calculated default');
        if (operation) operations.push(operation);
      }
    }
    if (operations.length) await commitOperations(operations, { label: 'Reset selected cells', immediate: true });
  }, [bounds, commitOperations, makeOperation, visibleRows]);

  const handleCellKeyDown = useCallback((event, rowIndex, columnIndex) => {
    const pendingEdit = editingRef.current;
    if (
      pendingEdit?.row === rowIndex &&
      pendingEdit?.column === columnIndex &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      if (event.key.length === 1) {
        event.preventDefault();
        const nextEdit = {
          ...pendingEdit,
          value: `${pendingEdit.value ?? ''}${event.key}`,
        };
        editingRef.current = nextEdit;
        setEditing(nextEdit);
        return;
      }
      if (event.key === 'Backspace') {
        event.preventDefault();
        const nextEdit = {
          ...pendingEdit,
          value: String(pendingEdit.value ?? '').slice(0, -1),
        };
        editingRef.current = nextEdit;
        setEditing(nextEdit);
        return;
      }
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
      event.preventDefault();
      void copySelection();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') {
      event.preventDefault();
      navigator.clipboard.readText().then(pasteMatrix).catch(() => toast.error('Clipboard access is unavailable.'));
      return;
    }
    if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      void undo();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === 'y' || (event.shiftKey && event.key.toLowerCase() === 'z'))) {
      event.preventDefault();
      void redo();
      return;
    }
    const column = COLUMNS[columnIndex];
    if ((event.key === 'Enter' || event.key === 'F2') && column.editable) {
      event.preventDefault();
      beginEdit(rowIndex, columnIndex);
      return;
    }
    if ((event.key === 'Backspace' || event.key === 'Delete') && column.editable) {
      event.preventDefault();
      void clearSelection();
      return;
    }
    if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key.length === 1 && column.editable) {
      event.preventDefault();
      beginEdit(rowIndex, columnIndex, event.key);
      return;
    }
    let nextRow = rowIndex;
    let nextColumn = columnIndex;
    if (event.key === 'ArrowUp') nextRow -= 1;
    else if (event.key === 'ArrowDown' || event.key === 'Enter') nextRow += 1;
    else if (event.key === 'ArrowLeft') nextColumn -= 1;
    else if (event.key === 'ArrowRight') nextColumn += 1;
    else if (event.key === 'Home') nextColumn = 0;
    else if (event.key === 'End') nextColumn = COLUMNS.length - 1;
    else if (event.key === 'Tab') {
      nextColumn += event.shiftKey ? -1 : 1;
      if (nextColumn >= COLUMNS.length) { nextColumn = 0; nextRow += 1; }
      if (nextColumn < 0) { nextColumn = COLUMNS.length - 1; nextRow -= 1; }
    } else return;
    event.preventDefault();
    const next = {
      row: Math.max(0, Math.min(visibleRows.length - 1, nextRow)),
      column: Math.max(0, Math.min(COLUMNS.length - 1, nextColumn)),
    };
    if (!event.shiftKey) setAnchor(next);
    focusCell(next.row, next.column);
  }, [beginEdit, clearSelection, copySelection, focusCell, pasteMatrix, redo, undo, visibleRows.length]);

  const exportExcel = useCallback(async () => {
    try {
      const excelModule = await import('exceljs');
      const ExcelJS = excelModule.default || excelModule;
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'NestHub';
      const worksheet = workbook.addWorksheet('Bazar Money');
      worksheet.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }];
      worksheet.addRow(spreadsheetHeaders());
      visibleRows.forEach((row) => worksheet.addRow(COLUMNS.map((column) => (
        column.key === 'memberName' || column.key === 'status' || column.key === 'remarks'
          ? row[column.key] || ''
          : cellFormula(row, column.key)
            ? { formula: cellFormula(row, column.key).replace(/^=\s*/, ''), result: bazarMoneyNumber(row[column.key]) }
            : bazarMoneyNumber(row[column.key])
      ))));
      worksheet.columns = COLUMNS.map((column) => ({ width: Math.max(14, Math.round(column.width / 8)) }));
      worksheet.getRow(1).height = 28;
      worksheet.getRow(1).eachCell((cell, index) => {
        const column = COLUMNS[index - 1];
        const fills = {
          carry: '7C3AED', deposit: '2563EB', adjustment: 'EA580C', balance: '0891B2',
        };
        const fill = fills[column.tone] || '1E293B';
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${fill}` } };
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
        cell.alignment = { vertical: 'middle' };
      });
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        row.eachCell((cell, columnNumber) => {
          if (COLUMNS[columnNumber - 1]?.money) cell.numFmt = '৳#,##0.00;[Red]-৳#,##0.00';
          cell.border = { bottom: { style: 'hair', color: { argb: 'FFE2E8F0' } } };
        });
      });
      const buffer = await workbook.xlsx.writeBuffer();
      downloadTextFile(buffer, `bazar-money-${selectedMonth}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      toast.success('Excel workbook exported.');
    } catch (error) {
      toast.error(error?.message || 'Could not export Excel.');
    }
  }, [selectedMonth, visibleRows]);

  const importRows = useCallback(async (records) => {
    const byIdentity = new Map();
    displayRows.forEach((row) => {
      [row.memberId, row.memberName, row.member?.email, row.room]
        .filter(Boolean)
        .forEach((value) => byIdentity.set(String(value).trim().toLowerCase(), row));
    });
    const operationsByCell = new Map();
    records.forEach((record) => {
      const memberValue = sourceValue(record, ['Member', 'Member ID', 'Email', 'Room']);
      const row = byIdentity.get(String(memberValue || '').trim().toLowerCase());
      if (!row) return;
      [
        ['previousBalance', ['Previous Meal Due', 'Previous Balance', 'Previous Due', 'Previous Advance']],
        ['currentDeposit', ['Current Deposit', 'Deposit']],
        ['adjustment', ['Adjustment']],
        ['remarks', ['Remarks', 'Reason']],
      ].forEach(([field, labels]) => {
        const raw = sourceValue(record, labels);
        if (raw === undefined) return;
        const column = COLUMNS.find((item) => item.key === field);
        try {
          const operation = makeOperation(row, column, raw, 'Excel import');
          if (operation) operationsByCell.set(cellKey(operation.memberId, operation.field), operation);
        } catch (error) {
          throw new Error(`${row.memberName}: ${error.message}`);
        }
      });
    });
    const operations = [...operationsByCell.values()];
    if (!operations.length) throw new Error('No matching members or editable values were found.');
    await commitOperations(operations, { label: `Imported ${operations.length} cells`, immediate: true });
    toast.success(`${operations.length} imported value${operations.length === 1 ? '' : 's'} saved.`);
  }, [commitOperations, displayRows, makeOperation]);

  const handleImport = useCallback(async (file) => {
    if (!file) return;
    try {
      const extension = file.name.split('.').pop()?.toLowerCase();
      let records = [];
      if (extension === 'xlsx') {
        const excelModule = await import('exceljs');
        const ExcelJS = excelModule.default || excelModule;
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(await file.arrayBuffer());
        const worksheet = workbook.worksheets[0];
        const matrix = [];
        worksheet.eachRow({ includeEmpty: false }, (row) => {
          matrix.push(row.values.slice(1).map((value) => (
            value && typeof value === 'object' && 'formula' in value
              ? `=${value.formula}`
              : value && typeof value === 'object' && 'text' in value ? value.text : value ?? ''
          )));
        });
        if (matrix.length) {
          const headers = matrix[0].map(normalizeHeader);
          records = matrix.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
        }
      } else if (extension === 'csv' || extension === 'tsv') {
        records = parseDelimited(await file.text());
      } else {
        throw new Error('Use an .xlsx, .csv, or .tsv file.');
      }
      await importRows(records);
    } catch (error) {
      toast.error(error?.message || 'Could not import this file.');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [importRows]);

  const handleModalSubmit = useCallback(async ({ memberId, amount, reason, remarks }) => {
    const row = displayRows.find((item) => item.memberId === memberId);
    const field = modal.mode === 'deposit' ? 'currentDeposit' : 'adjustment';
    const column = COLUMNS.find((item) => item.key === field);
    if (!row || !column) throw new Error('This member is no longer available.');
    const after = roundBazarMoney(bazarMoneyNumber(row[field]) + amount);
    const operation = makeOperation(row, column, after, reason);
    if (!operation) return;
    operation.remarks = remarks || row.remarks || '';
    operation.source = modal.mode === 'deposit' ? 'add_money' : 'adjust_balance';
    const saved = await commitOperations([operation], {
      label: modal.mode === 'deposit' ? 'Added Bazar money' : 'Adjusted personal balance',
      immediate: true,
    });
    if (!saved) throw new Error('The change could not be saved.');
    setModal((current) => ({ ...current, open: false }));
    toast.success(modal.mode === 'deposit' ? 'Bazar money added.' : 'Balance adjusted.');
  }, [commitOperations, displayRows, makeOperation, modal.mode]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await flushAll();
      await onRefresh?.();
      toast.success('Live data refreshed.');
    } catch (error) {
      toast.error(error?.message || 'Could not refresh data.');
    } finally {
      setRefreshing(false);
    }
  }, [flushAll, onRefresh]);

  return (
    <div className="relative grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-950/5 dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-200 bg-[#1E293B] p-3 text-white dark:border-slate-700 sm:p-4">
          <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-cyan-400" aria-hidden="true" />
                <h2 className="text-sm font-extrabold">Member money sheet</h2>
                <span className="rounded-md bg-[#16A34A] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">Live</span>
              </div>
              <p className="mt-1 text-[10px] text-slate-400">Double-click or press F2 to edit · Enter/Tab to move · Ctrl/Cmd+C/V/Z/Y supported</p>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button type="button" title="Add bazar money" onClick={() => setModal({ open: true, mode: 'deposit', memberId: activeRow?.memberId || '' })} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#2563EB] px-3 text-[11px] font-bold text-white transition hover:bg-blue-700">
                <Plus className="h-3.5 w-3.5" /> Add money
              </button>
              <button type="button" title="Adjust one member's balance" onClick={() => setModal({ open: true, mode: 'adjustment', memberId: activeRow?.memberId || '' })} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#EA580C] px-3 text-[11px] font-bold text-white transition hover:bg-orange-700">
                <BadgeDollarSign className="h-3.5 w-3.5" /> Adjust balance
              </button>
              <button type="button" title="Undo last change" disabled={!historyState.past.length} onClick={() => void undo()} className="sheet-toolbar-button"><Undo2 className="h-3.5 w-3.5" /> Undo</button>
              <button type="button" title="Redo last change" disabled={!historyState.future.length} onClick={() => void redo()} className="sheet-toolbar-button"><Redo2 className="h-3.5 w-3.5" /> Redo</button>
            </div>
          </div>
        </div>

        <div className="border-b border-slate-200 bg-slate-50 p-2.5 dark:border-slate-800 dark:bg-slate-950">
          <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
              <label className="relative min-w-[190px] flex-1 sm:max-w-xs">
                <span className="sr-only">Search members</span>
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search member, room, status…" className="h-8 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-8 text-[11px] font-medium text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:focus:ring-blue-950" />
                {search && <button type="button" onClick={() => setSearch('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400"><X className="h-3.5 w-3.5" /></button>}
              </label>
              <label className="relative">
                <span className="sr-only">Filter by status</span>
                <Filter className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} title="Filter status" className="h-8 appearance-none rounded-lg border border-slate-200 bg-white pl-8 pr-7 text-[11px] font-semibold text-slate-600 outline-none focus:border-blue-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                  <option value="all">All statuses</option><option value="credit">Credit</option><option value="debit">Debit</option><option value="paid">Paid</option><option value="pending">Pending</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
              </label>
              <label className="relative">
                <span className="sr-only">Sort sheet</span>
                <ArrowDownAZ className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <select value={`${sort.key}:${sort.direction}`} onChange={(event) => { const [key, direction] = event.target.value.split(':'); setSort({ key, direction }); }} title="Sort sheet" className="h-8 appearance-none rounded-lg border border-slate-200 bg-white pl-8 pr-7 text-[11px] font-semibold text-slate-600 outline-none focus:border-blue-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                  <option value="memberName:asc">Member A–Z</option><option value="room:asc">Room</option><option value="currentDeposit:desc">Highest deposit</option><option value="individualBalance:desc">Highest balance</option><option value="individualBalance:asc">Lowest balance</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <input ref={fileInputRef} type="file" accept=".xlsx,.csv,.tsv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/tab-separated-values" className="hidden" onChange={(event) => void handleImport(event.target.files?.[0])} />
              <button type="button" title="Import Excel, CSV, or TSV" onClick={() => fileInputRef.current?.click()} className="light-toolbar-button"><Upload className="h-3.5 w-3.5" /> Import Excel</button>
              <button type="button" title="Export filtered rows to Excel" onClick={() => void exportExcel()} className="light-toolbar-button"><Download className="h-3.5 w-3.5" /> Export Excel</button>
              <button type="button" title="Copy selected cells" onClick={() => void copySelection()} className="light-toolbar-button"><Clipboard className="h-3.5 w-3.5" /> Copy</button>
              <button type="button" title="Refresh live Firestore listeners" disabled={refreshing} onClick={() => void handleRefresh()} className="light-toolbar-button">{refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Refresh</button>
              <button type="button" title="Print member money sheet" onClick={() => window.print()} className="light-toolbar-button"><Printer className="h-3.5 w-3.5" /> Print</button>
              <button type="button" title="Open adjustment history" onClick={() => setHistoryOpen(true)} className="light-toolbar-button xl:hidden"><History className="h-3.5 w-3.5" /> History</button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-[58px_minmax(0,1fr)] border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="flex h-9 items-center justify-center border-r border-slate-200 bg-slate-50 font-mono text-[10px] font-bold text-slate-500 dark:border-slate-800 dark:bg-slate-950">{selectedCellName}</div>
          <div className="flex min-w-0 items-center gap-2 px-3">
            <span className="font-mono text-xs font-black text-slate-400">fx</span>
            <span className="truncate text-[11px] font-medium text-slate-700 dark:text-slate-200">{formulaFor(activeRow, activeColumn) || 'Select a cell'}</span>
          </div>
        </div>

        <div
          id="bazar-money-printable"
          ref={tableRef}
          className="max-h-[62dvh] min-h-[360px] overflow-auto bg-white outline-none [scrollbar-color:rgb(148_163_184)_transparent] dark:bg-slate-900"
          onPaste={(event) => {
            if (editing) return;
            event.preventDefault();
            void pasteMatrix(event.clipboardData.getData('text/plain'));
          }}
        >
          <table role="grid" aria-label={`Bazar money sheet for ${selectedMonth}`} aria-rowcount={visibleRows.length + 2} aria-colcount={COLUMNS.length} className="border-separate border-spacing-0 text-left text-[11px]" style={{ minWidth: COLUMNS.reduce((sum, column) => sum + column.width, 0) }}>
            <thead className="sticky top-0 z-30">
              <tr>
                {COLUMNS.map((column, columnIndex) => {
                  const tone = COLUMN_TONES[column.tone];
                  return (
                    <th key={column.key} scope="col" style={{ width: column.width, minWidth: column.width }} className={`h-10 border-b border-r border-slate-200 px-3 text-[9px] font-extrabold uppercase tracking-[0.08em] dark:border-slate-700 ${column.sticky ? 'sticky left-0 z-40 bg-[#1E293B] text-white shadow-[3px_0_8px_rgba(15,23,42,0.12)]' : tone?.header || 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-200'}`}>
                      <span className="flex items-center gap-1.5"><span className="opacity-60">{columnLetter(columnIndex)}</span>{column.label}{column.editable && <span title="Editable" className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />}</span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, rowIndex) => (
                <tr key={row.memberId} className="group">
                  {COLUMNS.map((column, columnIndex) => {
                    const selected = bounds && rowIndex >= bounds.top && rowIndex <= bounds.bottom && columnIndex >= bounds.left && columnIndex <= bounds.right;
                    const current = active.row === rowIndex && active.column === columnIndex;
                    const key = cellKey(row.memberId, column.key);
                    const isEditing = editing?.memberId === row.memberId && editing?.field === column.key;
                    const tone = COLUMN_TONES[column.tone];
                    return (
                      <td
                        key={column.key}
                        role="gridcell"
                        aria-selected={Boolean(selected)}
                        tabIndex={current ? 0 : -1}
                        data-money-cell={`${rowIndex}-${columnIndex}`}
                        style={{ width: column.width, minWidth: column.width }}
                        title={saveErrors[key] || (column.editable ? `Double-click to edit ${column.label}` : formulaFor(row, column))}
                        className={`relative h-11 border-b border-r border-slate-200 px-2 outline-none transition dark:border-slate-800 ${column.sticky ? 'sticky left-0 z-20 bg-white shadow-[3px_0_8px_rgba(15,23,42,0.08)] dark:bg-slate-900' : 'bg-white group-hover:bg-slate-50 dark:bg-slate-900 dark:group-hover:bg-slate-800/70'} ${selected ? 'bg-blue-50/80 dark:bg-blue-950/30' : ''} ${current ? 'z-[25] ring-2 ring-inset ring-[#2563EB]' : ''} ${saveErrors[key] ? 'bg-red-50 ring-1 ring-inset ring-red-400 dark:bg-red-950/30' : ''}`}
                        onPointerDown={(event) => {
                          if (event.button !== 0 || isEditing) return;
                          selectingRef.current = true;
                          const next = { row: rowIndex, column: columnIndex };
                          if (!event.shiftKey) setAnchor(next);
                          setActive(next);
                        }}
                        onPointerEnter={() => {
                          if (selectingRef.current && !editing) setActive({ row: rowIndex, column: columnIndex });
                        }}
                        onDoubleClick={() => beginEdit(rowIndex, columnIndex)}
                        onKeyDown={(event) => handleCellKeyDown(event, rowIndex, columnIndex)}
                        onFocus={() => setActive({ row: rowIndex, column: columnIndex })}
                      >
                        {column.key === 'memberName' ? (
                          <button type="button" onClick={() => setModal({ open: true, mode: 'deposit', memberId: row.memberId })} className="flex w-full items-center gap-2 text-left" title={`Add money for ${row.memberName}`}>
                            <span className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-[#1E293B] text-[10px] font-black text-white">{row.memberName.charAt(0).toUpperCase()}</span>
                            <span className="min-w-0"><span className="block truncate text-xs font-bold text-slate-900 dark:text-white">{row.memberName}</span><span className="block truncate text-[9px] font-medium text-slate-400">{row.room ? `Room ${row.room}` : row.member?.email || 'Member'}</span></span>
                          </button>
                        ) : isEditing ? (
                          <input
                            autoFocus
                            type={column.text ? 'text' : 'text'}
                            inputMode={column.text ? 'text' : 'decimal'}
                            value={editing.value}
                            aria-label={`Edit ${column.label} for ${row.memberName}`}
                            onChange={(event) => setEditing((currentEdit) => ({ ...currentEdit, value: event.target.value }))}
                            onBlur={() => finishEditing()}
                            onKeyDown={(event) => {
                              if (event.key === 'Escape') { event.preventDefault(); editingRef.current = null; setEditing(null); focusCell(rowIndex, columnIndex); }
                              if (event.key === 'Enter' || event.key === 'Tab') {
                                event.preventDefault();
                                const nextColumn = event.key === 'Tab' ? Math.min(COLUMNS.length - 1, columnIndex + (event.shiftKey ? -1 : 1)) : columnIndex;
                                const nextRow = event.key === 'Enter' ? Math.min(visibleRows.length - 1, rowIndex + 1) : rowIndex;
                                finishEditing({ immediate: true, move: { row: nextRow, column: nextColumn } });
                              }
                            }}
                            className="h-8 w-full rounded-md border-2 border-[#2563EB] bg-white px-2 text-[11px] font-bold text-slate-900 outline-none ring-2 ring-blue-100 dark:bg-slate-950 dark:text-white dark:ring-blue-950"
                          />
                        ) : column.key === 'status' ? (
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-wide ${STATUS_STYLES[row.status] || STATUS_STYLES.Pending}`}>{row.status}</span>
                        ) : (
                          <div className={`flex min-w-0 items-center justify-between gap-2 ${column.money ? 'font-bold tabular-nums' : 'font-medium'} ${tone?.value || (column.formula ? 'text-slate-800 dark:text-slate-100' : 'text-slate-600 dark:text-slate-300')}`}>
                            <span className="truncate">{cellDisplay(row, column) || <span className="text-slate-300">—</span>}</span>
                            {pendingKeys.has(key) && <Loader2 className="h-3 w-3 flex-none animate-spin text-blue-500" />}
                            {!pendingKeys.has(key) && Object.prototype.hasOwnProperty.call(overrides, key) && <Cloud className="h-3 w-3 flex-none text-blue-400" />}
                            {column.editable && !pendingKeys.has(key) && !Object.prototype.hasOwnProperty.call(overrides, key) && <span className="h-1.5 w-1.5 flex-none rounded-full bg-slate-300 opacity-0 transition group-hover:opacity-100" />}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {!visibleRows.length && (
                <tr><td colSpan={COLUMNS.length} className="h-64 text-center"><Search className="mx-auto h-7 w-7 text-slate-300" /><p className="mt-3 text-sm font-bold text-slate-700 dark:text-slate-200">No members match this view</p><p className="mt-1 text-[11px] text-slate-400">Clear the search or status filter.</p></td></tr>
              )}
            </tbody>
            {visibleRows.length > 0 && (
              <tfoot className="sticky bottom-0 z-20 bg-[#1E293B] text-white">
                <tr>
                  {COLUMNS.map((column) => {
                    const total = column.money ? visibleRows.reduce((sum, row) => sum + bazarMoneyNumber(row[column.key]), 0) : null;
                    return <td key={column.key} className={`h-10 border-r border-slate-600 px-2 text-[10px] font-extrabold ${column.sticky ? 'sticky left-0 z-30 bg-[#1E293B]' : ''}`}>{column.key === 'memberName' ? `${visibleRows.length} members` : column.money ? money(total, { signed: true }) : ''}</td>;
                  })}
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        <footer className="flex flex-col gap-2 border-t border-slate-200 bg-slate-50 px-3 py-2 text-[10px] dark:border-slate-800 dark:bg-slate-950 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3 text-slate-500 dark:text-slate-400">
            <span><strong className="text-[#7C3AED]">Previous due/advance</strong> is personal</span><span><strong className="text-[#2563EB]">Collection</strong> uses current deposits only</span><span><strong className="text-[#EA580C]">Adjustments</strong> never alter expense or meal rate</span>
          </div>
          <div className="flex items-center gap-2 font-semibold text-slate-500"><Check className={`h-3.5 w-3.5 ${syncState.state === 'error' ? 'text-red-500' : syncState.state === 'syncing' ? 'text-blue-500' : 'text-green-600'}`} />{syncState.detail}</div>
        </footer>
      </section>

      <BazarMoneyActivityRail activity={activity} syncState={syncState} open={historyOpen} onClose={() => setHistoryOpen(false)} />

      <BazarAdjustmentModal
        open={modal.open}
        mode={modal.mode}
        initialMemberId={modal.memberId}
        members={displayRows.map((row) => ({ ...row.member, ...row }))}
        saving={pendingKeys.size > 0}
        onClose={() => setModal((current) => ({ ...current, open: false }))}
        onSubmit={handleModalSubmit}
      />

      <div className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] right-4 z-30 flex flex-col gap-2 xl:hidden">
        <button type="button" onClick={() => setModal({ open: true, mode: 'adjustment', memberId: activeRow?.memberId || '' })} aria-label="Adjust balance" title="Adjust balance" className="flex h-12 w-12 items-center justify-center rounded-full bg-[#EA580C] text-white shadow-xl"><BadgeDollarSign className="h-5 w-5" /></button>
        <button type="button" onClick={() => setModal({ open: true, mode: 'deposit', memberId: activeRow?.memberId || '' })} aria-label="Add bazar money" title="Add bazar money" className="flex h-14 w-14 items-center justify-center rounded-full bg-[#2563EB] text-white shadow-xl"><Plus className="h-6 w-6" /></button>
      </div>

      <style jsx>{`
        .sheet-toolbar-button {
          display: inline-flex; height: 2rem; align-items: center; gap: .375rem; border-radius: .5rem;
          background: rgba(255,255,255,.1); padding: 0 .625rem; font-size: .6875rem; font-weight: 700;
          color: white; transition: background-color .15s ease;
        }
        .sheet-toolbar-button:hover { background: rgba(255,255,255,.18); }
        .sheet-toolbar-button:disabled { cursor: not-allowed; opacity: .35; }
        .light-toolbar-button {
          display: inline-flex; height: 2rem; align-items: center; gap: .375rem; white-space: nowrap;
          border: 1px solid rgb(226 232 240); border-radius: .5rem; background: white; padding: 0 .625rem;
          font-size: .6875rem; font-weight: 700; color: rgb(71 85 105); transition: all .15s ease;
        }
        .light-toolbar-button:hover { border-color: rgb(148 163 184); color: rgb(15 23 42); }
        .light-toolbar-button:disabled { cursor: not-allowed; opacity: .45; }
        :global(.dark) .light-toolbar-button { border-color: rgb(51 65 85); background: rgb(15 23 42); color: rgb(203 213 225); }
        :global(.dark) .light-toolbar-button:hover { background: rgb(30 41 59); color: white; }
      `}</style>
    </div>
  );
}

export default function BazarMoneyWorkspace(props) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      mutations: { retry: 0, networkMode: 'always' },
      queries: { refetchOnWindowFocus: false, staleTime: Infinity },
    },
  }));

  return (
    <QueryClientProvider client={queryClient}>
      <BazarMoneyWorkspaceInner {...props} />
    </QueryClientProvider>
  );
}
