'use client';

import Image from 'next/image';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  BellRing,
  Check,
  ChevronDown,
  Clipboard,
  Copy,
  Download,
  Eraser,
  FileSpreadsheet,
  Filter,
  Keyboard,
  Loader2,
  MoreHorizontal,
  Printer,
  Redo2,
  Search,
  SlidersHorizontal,
  Trash2,
  Undo2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { toast } from 'react-hot-toast';
import {
  formatMealCellNumber,
  mealCellLegend,
  mealCellRecordPatch,
  mealCellValueFromRecord,
  normalizeMealCellValue,
} from '@/lib/mealCell';
import {
  cellAddress,
  cellInSelection,
  cellKey,
  parseClipboardMatrix,
  rangeAddress,
  selectionBounds,
  selectionSize,
} from '@/lib/mealGrid';
import { mealDocumentId } from '@/lib/mealRecords';
import {
  downloadTextFile,
  parseSpreadsheetXml,
} from '@/lib/spreadsheet';

const CELL_TONES = {
  one: 'bg-[#16A34A] text-white hover:bg-[#15803D]',
  two: 'bg-[#2563EB] text-white hover:bg-[#1D4ED8]',
  absent: 'bg-[#DC2626] text-white hover:bg-[#B91C1C]',
  guest: 'bg-[#7C3AED] text-white hover:bg-[#6D28D9]',
  beef: 'bg-[#B45309] text-white hover:bg-[#92400E]',
  chicken: 'bg-[#0891B2] text-white hover:bg-[#0E7490]',
  fish: 'bg-[#0F766E] text-white hover:bg-[#115E59]',
  none: 'bg-[#64748B] text-white hover:bg-[#475569]',
  custom: 'bg-[#1E293B] text-white hover:bg-[#0F172A]',
  invalid: 'bg-[#DC2626] text-white',
};

const FILTERS = [
  { value: 'all', label: 'All members' },
  { value: 'with-meals', label: 'With meals' },
  { value: 'no-meals', label: 'No meals' },
  { value: 'guest', label: 'Guest entries' },
  { value: 'absent', label: 'Absent entries' },
  { value: 'unrecorded', label: 'Has unrecorded days' },
];

const SORTS = [
  { value: 'room', label: 'Room order' },
  { value: 'name', label: 'Member name' },
  { value: 'meals-desc', label: 'Most meals' },
  { value: 'meals-asc', label: 'Fewest meals' },
];

function getMemberId(member) {
  return String(member?.id || member?.uid || member?.userId || '').trim();
}

function getMemberName(member) {
  return member?.displayName || member?.name || member?.fullName || member?.email || 'Member';
}

function getMemberPhoto(member) {
  return member?.photoURL || member?.photo || member?.avatar || member?.image || '';
}

function getMealMemberId(meal) {
  return String(meal?.userId || meal?.memberId || meal?.uid || '').trim();
}

function isCurrentMeal(meal) {
  return meal?.isSystemRecord !== true && meal?.isDeleted !== true && String(meal?.status || '').toLowerCase() !== 'deleted';
}

function timestampValue(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (Number.isFinite(value.seconds)) return value.seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function monthDates(month) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(month || ''));
  if (!match) return [];
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  if (monthNumber < 1 || monthNumber > 12) return [];
  const count = new Date(year, monthNumber, 0).getDate();
  return Array.from({ length: count }, (_, index) => (
    `${year}-${String(monthNumber).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`
  ));
}

function dateParts(date) {
  const [year, month, day] = String(date || '').split('-').map(Number);
  const value = new Date(year, month - 1, day);
  return {
    day: String(day || '').padStart(2, '0'),
    weekday: Number.isNaN(value.getTime()) ? '' : value.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 2),
  };
}

function dhakaToday() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function memberInitial(member) {
  return getMemberName(member).charAt(0).toUpperCase();
}

function toneForValue(value, recorded = true) {
  if (!recorded && String(value || '') === '') return 'empty';
  return normalizeMealCellValue(value).tone;
}

function cellToneClass(value, recorded, rowIndex) {
  const tone = toneForValue(value, recorded);
  if (tone === 'empty') {
    return rowIndex % 2
      ? 'bg-[#F8FAFC] text-slate-300 hover:bg-blue-50 dark:bg-slate-900 dark:text-slate-700 dark:hover:bg-slate-800'
      : 'bg-white text-slate-300 hover:bg-blue-50 dark:bg-slate-950 dark:text-slate-700 dark:hover:bg-slate-800';
  }
  return CELL_TONES[tone] || CELL_TONES.custom;
}

function roomCompare(a, b) {
  return String(a.room || '').localeCompare(String(b.room || ''), undefined, { numeric: true }) || getMemberName(a).localeCompare(getMemberName(b));
}

function SheetButton({ icon: Icon, children, active = false, danger = false, compact = false, className = '', ...props }) {
  return (
    <button
      type="button"
      className={`group relative flex h-9 items-center justify-center gap-1.5 overflow-hidden rounded-lg border px-2.5 text-[11px] font-bold transition duration-200 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 ${
        danger
          ? 'border-red-600 bg-red-600 text-white hover:bg-red-700'
          : active
            ? 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700'
            : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-blue-700 dark:hover:bg-slate-800 dark:hover:text-white'
      } ${className}`}
      {...props}
    >
      <span className="pointer-events-none absolute inset-0 scale-0 rounded-full bg-current opacity-10 transition-transform duration-300 group-active:scale-150" />
      {Icon && <Icon className="relative h-3.5 w-3.5 flex-none" />}
      <span className={compact ? 'sr-only sm:not-sr-only' : ''}>{children}</span>
    </button>
  );
}

function SpinnerDot() {
  return <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />;
}

function normalizeHeader(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, ' ').trim();
}

function worksheetValue(value) {
  if (value instanceof Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  if (value && typeof value === 'object') {
    if (value.result !== undefined) return String(value.result ?? '');
    if (value.text !== undefined) return String(value.text ?? '');
    if (Array.isArray(value.richText)) return value.richText.map((item) => item.text || '').join('');
  }
  return String(value ?? '');
}

function parseTextMatrix(value) {
  const source = String(value || '').replace(/^\uFEFF/, '');
  const delimiter = source.includes('\t') ? '\t' : ',';
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (character === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === delimiter && !quoted) {
      row.push(cell.trim());
      cell = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && next === '\n') index += 1;
      row.push(cell.trim());
      if (row.some((item) => item !== '')) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += character;
    }
  }

  row.push(cell.trim());
  if (row.some((item) => item !== '')) rows.push(row);
  return rows;
}

export default function MealSpreadsheetWorkspace({
  members = [],
  meals = [],
  month = '',
  onUpsert,
  onBulkUpsert,
  onSoftDelete,
  onChanges,
  onOpenNotification,
  onSyncStateChange,
}) {
  const dates = useMemo(() => monthDates(month), [month]);
  const today = dhakaToday();
  const fileInputRef = useRef(null);
  const gridRef = useRef(null);
  const contextMenuRef = useRef(null);
  const cellRefs = useRef(new Map());
  const editorRefs = useRef(new Map());
  const autoSaveTimers = useRef(new Map());
  const saveGeneration = useRef(new Map());
  const saveChain = useRef(Promise.resolve());
  const skipBlurKey = useRef('');
  const workspaceGeneration = useRef(0);
  const knownRecords = useRef(new Set());
  const historyBusy = useRef(false);
  const bulkOperationCount = useRef(0);
  const frozenMembers = useRef(null);
  const previousMembers = useRef([]);
  const draggingSelection = useRef(false);
  const fillDrag = useRef(null);
  const resizeDrag = useRef(null);
  const finishFillRef = useRef(() => {});

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('room');
  const [filterOpen, setFilterOpen] = useState(false);
  const [activeCell, setActiveCell] = useState({ row: 0, column: 0 });
  const [selection, setSelection] = useState({ anchor: { row: 0, column: 0 }, focus: { row: 0, column: 0 } });
  const [editingKey, setEditingKey] = useState('');
  const [draftValues, setDraftValues] = useState({});
  const [optimisticValues, setOptimisticValues] = useState({});
  const [savingCells, setSavingCells] = useState(() => new Set());
  const [cellErrors, setCellErrors] = useState({});
  const [history, setHistory] = useState({ past: [], future: [] });
  const [historyRunning, setHistoryRunning] = useState(false);
  const [message, setMessage] = useState(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [formulaValue, setFormulaValue] = useState('');
  const [fillPreview, setFillPreview] = useState(null);
  const [memberWidth, setMemberWidth] = useState(220);
  const [dayWidth, setDayWidth] = useState(62);
  const [renderLimit, setRenderLimit] = useState(80);

  const mealIndex = useMemo(() => {
    const groups = new Map();
    meals.forEach((meal) => {
      if (!isCurrentMeal(meal)) return;
      if (month && String(meal?.month || String(meal?.date || '').slice(0, 7)) !== month) return;
      const memberId = getMealMemberId(meal);
      const date = String(meal?.date || '');
      if (!memberId || !date) return;
      const key = cellKey(memberId, date);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(meal);
    });
    const index = new Map();
    groups.forEach((rows, key) => {
      const sorted = [...rows].sort((a, b) => {
        const versionDifference = Number(b.version || 0) - Number(a.version || 0);
        if (versionDifference) return versionDifference;
        return (timestampValue(b.updatedAt) || timestampValue(b.createdAt)) - (timestampValue(a.updatedAt) || timestampValue(a.createdAt));
      });
      index.set(key, { primary: sorted[0], rows: sorted, duplicateCount: Math.max(0, sorted.length - 1) });
    });
    return index;
  }, [meals, month]);

  const duplicateRows = useMemo(() => (
    [...mealIndex.values()].reduce((total, group) => total + group.duplicateCount, 0)
  ), [mealIndex]);

  const normalizedMembers = useMemo(() => (
    members
      .filter((member) => getMemberId(member))
      .map((member) => ({ ...member, _mealMemberId: getMemberId(member) }))
  ), [members]);

  const getPrimary = useCallback((memberId, date) => mealIndex.get(cellKey(memberId, date))?.primary || null, [mealIndex]);

  const getServerValue = useCallback((memberId, date) => {
    const record = getPrimary(memberId, date);
    return record ? mealCellValueFromRecord(record) : '';
  }, [getPrimary]);

  const getStableValue = useCallback((memberId, date) => {
    const key = cellKey(memberId, date);
    if (Object.prototype.hasOwnProperty.call(optimisticValues, key)) return optimisticValues[key];
    return getServerValue(memberId, date);
  }, [getServerValue, optimisticValues]);

  const getVisibleValue = useCallback((memberId, date) => {
    const key = cellKey(memberId, date);
    if (editingKey === key && Object.prototype.hasOwnProperty.call(draftValues, key)) return draftValues[key];
    return getStableValue(memberId, date);
  }, [draftValues, editingKey, getStableValue]);

  useEffect(() => {
    setOptimisticValues((current) => {
      let changed = false;
      const next = { ...current };
      Object.entries(current).forEach(([key, optimistic]) => {
        const splitAt = key.lastIndexOf('::');
        const memberId = key.slice(0, splitAt);
        const date = key.slice(splitAt + 2);
        if (getServerValue(memberId, date) === optimistic) {
          delete next[key];
          changed = true;
        }
      });
      return changed ? next : current;
    });
  }, [getServerValue]);

  const rollups = useMemo(() => {
    const byMember = new Map();
    const byDate = new Map(dates.map((date) => [date, 0]));
    let total = 0;
    normalizedMembers.forEach((member) => {
      let memberTotal = 0;
      let guests = 0;
      let absences = 0;
      let unrecorded = 0;
      dates.forEach((date) => {
        const value = getStableValue(member._mealMemberId, date);
        if (value === '') unrecorded += 1;
        const parsed = normalizeMealCellValue(value || 0);
        memberTotal += parsed.valid ? parsed.total : 0;
        if (parsed.tone === 'guest') guests += 1;
        if (parsed.tone === 'absent') absences += 1;
        byDate.set(date, (byDate.get(date) || 0) + (parsed.valid ? parsed.total : 0));
      });
      byMember.set(member._mealMemberId, { total: memberTotal, guests, absences, unrecorded });
      total += memberTotal;
    });
    return { byMember, byDate, total };
  }, [dates, getStableValue, normalizedMembers]);

  const calculatedMembers = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = normalizedMembers.filter((member) => {
      const summary = rollups.byMember.get(member._mealMemberId) || {};
      const matchesSearch = !term || [getMemberName(member), member.room, member.email]
        .join(' ')
        .toLowerCase()
        .includes(term);
      if (!matchesSearch) return false;
      if (filter === 'with-meals') return summary.total > 0;
      if (filter === 'no-meals') return summary.total === 0;
      if (filter === 'guest') return summary.guests > 0;
      if (filter === 'absent') return summary.absences > 0;
      if (filter === 'unrecorded') return summary.unrecorded > 0;
      return true;
    });
    return [...filtered].sort((a, b) => {
      if (sort === 'name') return getMemberName(a).localeCompare(getMemberName(b));
      if (sort === 'meals-desc') return (rollups.byMember.get(b._mealMemberId)?.total || 0) - (rollups.byMember.get(a._mealMemberId)?.total || 0) || roomCompare(a, b);
      if (sort === 'meals-asc') return (rollups.byMember.get(a._mealMemberId)?.total || 0) - (rollups.byMember.get(b._mealMemberId)?.total || 0) || roomCompare(a, b);
      return roomCompare(a, b);
    });
  }, [filter, normalizedMembers, rollups.byMember, search, sort]);

  // Keep row identity stable for the lifetime of an edit session. Reactive
  // meal filters/sorts may otherwise unmount the editor after an autosave.
  const filteredMembers = editingKey && frozenMembers.current
    ? frozenMembers.current
    : calculatedMembers;

  const visibleMembers = filteredMembers.slice(0, renderLimit);
  const bounds = selectionBounds(selection, filteredMembers.length, dates.length);
  const selectedSize = selectionSize(selection, filteredMembers.length, dates.length);
  const selectedAddress = rangeAddress(selection, filteredMembers.length, dates.length);
  const activeMember = filteredMembers[activeCell.row];
  const activeDate = dates[activeCell.column];
  const activeKey = activeMember && activeDate ? cellKey(activeMember._mealMemberId, activeDate) : '';
  const activeDisplayValue = activeMember && activeDate ? getVisibleValue(activeMember._mealMemberId, activeDate) : '';

  useLayoutEffect(() => {
    const previous = previousMembers.current;
    previousMembers.current = filteredMembers;
    if (!previous.length || previous === filteredMembers) return;
    const previousSignature = previous.map((member) => member._mealMemberId).join('\u0000');
    const nextSignature = filteredMembers.map((member) => member._mealMemberId).join('\u0000');
    if (previousSignature === nextSignature) return;

    const nextRowFor = (oldRow) => {
      const memberId = previous[oldRow]?._mealMemberId;
      const found = filteredMembers.findIndex((member) => member._mealMemberId === memberId);
      return found >= 0 ? found : 0;
    };
    setActiveCell((current) => ({ ...current, row: nextRowFor(current.row) }));
    setSelection((current) => ({
      anchor: { ...current.anchor, row: nextRowFor(current.anchor.row) },
      focus: { ...current.focus, row: nextRowFor(current.focus.row) },
    }));
  }, [filteredMembers]);

  useEffect(() => {
    workspaceGeneration.current += 1;
    saveChain.current = Promise.resolve();
    knownRecords.current = new Set();
    bulkOperationCount.current = 0;
    frozenMembers.current = null;
    skipBlurKey.current = '';
    setActiveCell({ row: 0, column: 0 });
    setSelection({ anchor: { row: 0, column: 0 }, focus: { row: 0, column: 0 } });
    setEditingKey('');
    setDraftValues({});
    setOptimisticValues({});
    setCellErrors({});
    setHistory({ past: [], future: [] });
    setHistoryRunning(false);
    setRenderLimit(80);
    setContextMenu(null);
    autoSaveTimers.current.forEach((timer) => window.clearTimeout(timer));
    autoSaveTimers.current.clear();
  }, [month]);

  useEffect(() => {
    mealIndex.forEach((group, key) => {
      if (group?.primary) knownRecords.current.add(key);
    });
  }, [mealIndex]);

  useEffect(() => {
    setActiveCell({ row: 0, column: 0 });
    setSelection({ anchor: { row: 0, column: 0 }, focus: { row: 0, column: 0 } });
    setRenderLimit(80);
  }, [filter, search, sort]);

  useEffect(() => {
    setFormulaValue(activeDisplayValue);
  }, [activeDisplayValue, activeKey]);

  useEffect(() => {
    if (!contextMenu) return;
    window.requestAnimationFrame(() => contextMenuRef.current?.querySelector('button[role="menuitem"]')?.focus());
  }, [contextMenu]);

  useEffect(() => {
    const handlePointerMove = (event) => {
      const resize = resizeDrag.current;
      if (!resize) return;
      const delta = event.clientX - resize.startX;
      if (resize.type === 'member') setMemberWidth(Math.max(170, Math.min(340, resize.startWidth + delta)));
      if (resize.type === 'day') setDayWidth(Math.max(50, Math.min(110, resize.startWidth + delta)));
    };
    const handlePointerUp = () => {
      draggingSelection.current = false;
      resizeDrag.current = null;
      finishFillRef.current();
    };
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, []);

  useEffect(() => () => {
    autoSaveTimers.current.forEach((timer) => window.clearTimeout(timer));
  }, []);

  useEffect(() => {
    const errorCount = Object.keys(cellErrors).length;
    const pending = savingCells.size + (bulkBusy ? 1 : 0) + (editingKey ? 1 : 0);
    onSyncStateChange?.({
      pending,
      errors: errorCount,
      state: errorCount ? 'error' : pending ? 'syncing' : 'synced',
    });
  }, [bulkBusy, cellErrors, editingKey, onSyncStateChange, savingCells]);

  const pushHistory = useCallback((operation) => {
    if (!operation?.changes?.length) return;
    setHistory((current) => ({
      past: [...current.past, operation].slice(-100),
      future: [],
    }));
  }, []);

  const commitCells = useCallback(async (cells, reason = 'spreadsheet_edit', options = {}) => {
    const operationSession = workspaceGeneration.current;
    const unique = new Map();
    for (const cell of cells) {
      const memberId = cell.member?._mealMemberId || getMemberId(cell.member);
      if (!memberId || !cell.date) continue;
      const patch = mealCellRecordPatch(cell.value);
      if (!patch.valid) {
        const key = cellKey(memberId, cell.date);
        setCellErrors((current) => ({ ...current, [key]: patch.description }));
        setMessage({ tone: 'red', text: patch.description });
        return false;
      }
      unique.set(cellKey(memberId, cell.date), { ...cell, memberId, patch });
    }

    const prepared = [...unique.entries()].map(([key, cell]) => {
      const previous = getStableValue(cell.memberId, cell.date);
      const nextValue = cell.patch.display;
      if (previous === nextValue) return null;
      const existing = getPrimary(cell.memberId, cell.date);
      const beforeRecorded = Boolean(existing) || knownRecords.current.has(key);
      const documentId = existing?.id || mealDocumentId(month, cell.date, cell.memberId);
      const entry = {
        ...(existing || {}),
        id: documentId,
        userId: cell.memberId,
        date: cell.date,
        month,
        lunch: cell.patch.lunch,
        dinner: cell.patch.dinner,
        guestMeal: cell.patch.guestMeal,
        totalMeal: cell.patch.total,
        mealCode: cell.patch.mealCode,
      };
      const change = {
        id: `meal-${reason}-${cell.memberId}-${cell.date}-${Date.now()}`,
        type: beforeRecorded ? 'meal_updated' : 'meal_created',
        module: 'meals',
        month,
        userId: cell.memberId,
        date: cell.date,
        previousValue: previous,
        value: nextValue,
        label: `${getMemberName(cell.member)} · ${cell.date}: ${previous || 'Empty'} → ${nextValue}`,
        createdAt: new Date().toISOString(),
      };
      return { ...cell, key, previous, nextValue, beforeRecorded, documentId, entry, change };
    }).filter(Boolean);

    if (!prepared.length) {
      if (!options.silent) setMessage({ tone: 'amber', text: 'No meal values changed.' });
      return true;
    }

    const generations = new Map();
    prepared.forEach(({ key }) => {
      const generation = Number(saveGeneration.current.get(key) || 0) + 1;
      saveGeneration.current.set(key, generation);
      generations.set(key, generation);
    });
    setSavingCells((current) => {
      const next = new Set(current);
      prepared.forEach(({ key }) => next.add(key));
      return next;
    });
    setCellErrors((current) => {
      const next = { ...current };
      prepared.forEach(({ key }) => delete next[key]);
      return next;
    });
    setOptimisticValues((current) => {
      const next = { ...current };
      prepared.forEach(({ key, nextValue }) => { next[key] = nextValue; });
      return next;
    });

    const showBulkBusy = prepared.length > 1;
    if (showBulkBusy) {
      bulkOperationCount.current += 1;
      setBulkBusy(true);
    }
    if (!options.silent) setMessage(null);

    const runSave = async () => {
      const entries = prepared.map((item) => item.entry);
      const changes = prepared.map((item) => ({ ...item.change, reason }));
      if (entries.length > 1 && onBulkUpsert) {
        return onBulkUpsert(entries, { field: 'mealCode', reason, changes });
      }
      if (entries.length === 1) {
        return onUpsert?.(entries[0], {
          key: prepared[0].key,
          field: 'mealCode',
          reason,
          previousValue: prepared[0].previous,
          value: prepared[0].nextValue,
          change: changes[0],
        });
      }
      return Promise.all(entries.map((entry, index) => onUpsert?.(entry, {
        key: prepared[index].key,
        field: 'mealCode',
        reason,
        change: changes[index],
      })));
    };

    const queuedSave = saveChain.current.catch(() => undefined).then(runSave);
    saveChain.current = queuedSave.catch(() => undefined);

    try {
      await queuedSave;
      if (operationSession !== workspaceGeneration.current) return true;
      prepared.forEach(({ key }) => knownRecords.current.add(key));
      const changes = prepared.map((item) => ({ ...item.change, reason }));
      onChanges?.(changes);
      if (options.recordHistory !== false) {
        pushHistory({
          id: `${reason}-${Date.now()}`,
          reason,
          changes: prepared.map((item) => ({
            memberId: item.memberId,
            date: item.date,
            before: item.previous,
            after: item.nextValue,
            beforeRecorded: item.beforeRecorded,
            documentId: item.documentId,
          })),
        });
      }
      if (!options.silent) {
        const label = prepared.length === 1 ? 'Cell saved' : `${prepared.length} cells saved`;
        setMessage({ tone: 'green', text: `${label}.` });
      }
      return true;
    } catch (error) {
      const partialCommitted = Math.max(0, Number(error?.partialCommitted || 0));
      if (operationSession !== workspaceGeneration.current) return false;
      const committed = prepared.slice(0, partialCommitted);
      const failed = prepared.slice(partialCommitted);
      committed.forEach(({ key }) => knownRecords.current.add(key));
      if (committed.length) {
        const committedChanges = committed.map((item) => ({ ...item.change, reason }));
        onChanges?.(committedChanges);
        if (options.recordHistory !== false) {
          pushHistory({
            id: `${reason}-partial-${Date.now()}`,
            reason,
            changes: committed.map((item) => ({
              memberId: item.memberId,
              date: item.date,
              before: item.previous,
              after: item.nextValue,
              beforeRecorded: item.beforeRecorded,
              documentId: item.documentId,
            })),
          });
        }
      }
      setOptimisticValues((current) => {
        const next = { ...current };
        failed.forEach(({ key, previous }) => {
          if (saveGeneration.current.get(key) !== generations.get(key)) return;
          if (previous === '') delete next[key];
          else next[key] = previous;
        });
        return next;
      });
      setCellErrors((current) => {
        const next = { ...current };
        failed.forEach(({ key }) => { next[key] = error?.message || 'Save failed'; });
        return next;
      });
      setMessage({ tone: 'red', text: error?.message || 'Meal cells could not be saved.' });
      return false;
    } finally {
      if (operationSession === workspaceGeneration.current) {
        setSavingCells((current) => {
          const next = new Set(current);
          prepared.forEach(({ key }) => {
            if (saveGeneration.current.get(key) === generations.get(key)) next.delete(key);
          });
          return next;
        });
        if (showBulkBusy) {
          bulkOperationCount.current = Math.max(0, bulkOperationCount.current - 1);
          setBulkBusy(bulkOperationCount.current > 0);
        }
      }
    }
  }, [getPrimary, getStableValue, month, onBulkUpsert, onChanges, onUpsert, pushHistory]);

  const selectedCells = useCallback(() => {
    const cells = [];
    for (let row = bounds.top; row <= bounds.bottom; row += 1) {
      for (let column = bounds.left; column <= bounds.right; column += 1) {
        const member = filteredMembers[row];
        const date = dates[column];
        if (member && date) cells.push({ member, date, row, column });
      }
    }
    return cells;
  }, [bounds.bottom, bounds.left, bounds.right, bounds.top, dates, filteredMembers]);

  const setSelectionValue = useCallback((value, reason = 'bulk_fill') => (
    commitCells(selectedCells().map((cell) => ({ ...cell, value })), reason)
  ), [commitCells, selectedCells]);

  const focusGridCell = useCallback((row, column, extend = false) => {
    const next = {
      row: Math.max(0, Math.min(filteredMembers.length - 1, row)),
      column: Math.max(0, Math.min(dates.length - 1, column)),
    };
    setActiveCell(next);
    setSelection((current) => extend
      ? { ...current, focus: next }
      : { anchor: next, focus: next });
    setContextMenu(null);
    if (next.row >= renderLimit) setRenderLimit(Math.min(filteredMembers.length, next.row + 40));
    requestAnimationFrame(() => {
      requestAnimationFrame(() => cellRefs.current.get(`${next.row}:${next.column}`)?.focus({ preventScroll: false }));
    });
  }, [dates.length, filteredMembers.length, renderLimit]);

  const clearAutoSave = useCallback((key) => {
    const timer = autoSaveTimers.current.get(key);
    if (timer) window.clearTimeout(timer);
    autoSaveTimers.current.delete(key);
  }, []);

  const beginEdit = useCallback((row, column, initialValue) => {
    const member = filteredMembers[row];
    const date = dates[column];
    if (!member || !date || bulkBusy) return;
    const key = cellKey(member._mealMemberId, date);
    const value = initialValue !== undefined ? initialValue : getStableValue(member._mealMemberId, date);
    frozenMembers.current = filteredMembers;
    setActiveCell({ row, column });
    setSelection({ anchor: { row, column }, focus: { row, column } });
    setEditingKey(key);
    setDraftValues((current) => ({ ...current, [key]: value }));
    setFormulaValue(value);
    setContextMenu(null);
    requestAnimationFrame(() => {
      const editor = editorRefs.current.get(key);
      editor?.focus();
      if (initialValue === undefined) editor?.select();
    });
  }, [bulkBusy, dates, filteredMembers, getStableValue]);

  const cancelEdit = useCallback((memberId, date) => {
    const key = cellKey(memberId, date);
    skipBlurKey.current = key;
    clearAutoSave(key);
    setDraftValues((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    setCellErrors((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    setEditingKey('');
    frozenMembers.current = null;
    setFormulaValue(getStableValue(memberId, date));
    window.requestAnimationFrame(() => {
      if (skipBlurKey.current === key) skipBlurKey.current = '';
    });
  }, [clearAutoSave, getStableValue]);

  const finishEdit = useCallback(async (member, date, value, navigation) => {
    const key = cellKey(member._mealMemberId, date);
    clearAutoSave(key);
    const parsed = normalizeMealCellValue(value);
    if (!parsed.valid) {
      setCellErrors((current) => ({ ...current, [key]: parsed.description }));
      setMessage({ tone: 'red', text: parsed.description });
      requestAnimationFrame(() => editorRefs.current.get(key)?.focus());
      return false;
    }
    skipBlurKey.current = key;
    setDraftValues((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    setEditingKey('');
    frozenMembers.current = null;
    setFormulaValue(parsed.display);
    if (navigation) focusGridCell(navigation.row, navigation.column);
    window.requestAnimationFrame(() => {
      if (skipBlurKey.current === key) skipBlurKey.current = '';
    });
    const success = await commitCells([{ member, date, value }], 'cell_edit', { silent: true });
    if (!success) return false;
    return true;
  }, [clearAutoSave, commitCells, focusGridCell]);

  const scheduleAutoSave = useCallback((member, date, value) => {
    const key = cellKey(member._mealMemberId, date);
    clearAutoSave(key);
    const parsed = normalizeMealCellValue(value);
    if (!parsed.valid) return;
    const timer = window.setTimeout(async () => {
      if (autoSaveTimers.current.get(key) !== timer) return;
      autoSaveTimers.current.delete(key);
      await commitCells([{ member, date, value }], 'debounced_autosave', { silent: true });
    }, 650);
    autoSaveTimers.current.set(key, timer);
  }, [clearAutoSave, commitCells]);

  const copySelection = useCallback(async () => {
    const rows = [];
    for (let row = bounds.top; row <= bounds.bottom; row += 1) {
      const values = [];
      for (let column = bounds.left; column <= bounds.right; column += 1) {
        const member = filteredMembers[row];
        const date = dates[column];
        values.push(member && date ? getStableValue(member._mealMemberId, date) : '');
      }
      rows.push(values.join('\t'));
    }
    try {
      await navigator.clipboard.writeText(rows.join('\n'));
      toast.success(`Copied ${selectedSize.cells} cell${selectedSize.cells === 1 ? '' : 's'}`);
    } catch {
      setMessage({ tone: 'red', text: 'Clipboard permission was not available.' });
    }
  }, [bounds.bottom, bounds.left, bounds.right, bounds.top, dates, filteredMembers, getStableValue, selectedSize.cells]);

  const pasteText = useCallback(async (text, start = activeCell) => {
    const matrix = parseClipboardMatrix(text);
    if (!matrix.length) return;
    const cells = [];
    let invalid = null;
    matrix.forEach((row, rowOffset) => {
      row.forEach((value, columnOffset) => {
        const member = filteredMembers[start.row + rowOffset];
        const date = dates[start.column + columnOffset];
        if (!member || !date) return;
        const parsed = normalizeMealCellValue(value === '' ? '0' : value);
        if (!parsed.valid) invalid = value;
        cells.push({ member, date, value: value === '' ? '0' : value });
      });
    });
    if (invalid !== null) {
      setMessage({ tone: 'red', text: `“${invalid}” is not a valid meal value.` });
      return;
    }
    if (!cells.length) {
      setMessage({ tone: 'amber', text: 'The pasted range falls outside this sheet.' });
      return;
    }
    const success = await commitCells(cells, 'paste');
    if (success) {
      const focus = {
        row: Math.min(filteredMembers.length - 1, start.row + matrix.length - 1),
        column: Math.min(dates.length - 1, start.column + Math.max(...matrix.map((row) => row.length)) - 1),
      };
      setSelection({ anchor: start, focus });
      setActiveCell(start);
    }
  }, [activeCell, commitCells, dates, filteredMembers]);

  const pasteFromClipboard = useCallback(async () => {
    try {
      await pasteText(await navigator.clipboard.readText());
    } catch {
      setMessage({ tone: 'red', text: 'Clipboard read permission was not available.' });
    }
  }, [pasteText]);

  const runHistory = useCallback(async (direction) => {
    if (historyBusy.current) return;
    const source = direction === 'undo' ? history.past : history.future;
    const operation = source[source.length - 1];
    if (!operation) return;
    const conflict = operation.changes.find((change) => {
      const current = getStableValue(change.memberId, change.date);
      const expected = direction === 'undo'
        ? change.after
        : change.beforeRecorded === false ? '' : change.before;
      return current !== expected;
    });
    if (conflict) {
      toast.error('Undo stopped because this cell changed after the recorded operation.');
      return;
    }

    historyBusy.current = true;
    setHistoryRunning(true);
    try {
      let success = true;
      const createRemovals = direction === 'undo'
        ? operation.changes.filter((change) => change.beforeRecorded === false)
        : [];
      const valueChanges = operation.changes.filter((change) => !createRemovals.includes(change));

      if (createRemovals.length) {
        if (typeof onSoftDelete !== 'function') throw new Error('Undo cannot remove newly created records.');
        for (const change of createRemovals) {
          const existing = getPrimary(change.memberId, change.date);
          await onSoftDelete(existing || {
            id: change.documentId || mealDocumentId(month, change.date, change.memberId),
            userId: change.memberId,
            date: change.date,
            month,
            version: 0,
          }, { reason: 'undo_create', month });
          knownRecords.current.delete(cellKey(change.memberId, change.date));
        }
        setOptimisticValues((current) => {
          const next = { ...current };
          createRemovals.forEach((change) => { next[cellKey(change.memberId, change.date)] = ''; });
          return next;
        });
        onChanges?.(createRemovals.map((change) => ({
          id: `meal-undo-create-${change.memberId}-${change.date}-${Date.now()}`,
          type: 'meal_deleted',
          module: 'meals',
          month,
          userId: change.memberId,
          date: change.date,
          label: `Undo created meal · ${change.date}`,
          createdAt: new Date().toISOString(),
        })));
      }

      if (valueChanges.length) {
        const cells = valueChanges.map((change) => ({
          member: normalizedMembers.find((member) => member._mealMemberId === change.memberId),
          date: change.date,
          value: direction === 'undo' ? change.before : change.after,
        })).filter((cell) => cell.member);
        success = await commitCells(cells, direction, { recordHistory: false, silent: true });
      }
      if (!success) return;
      setHistory((current) => {
        if (direction === 'undo') {
          return { past: current.past.slice(0, -1), future: [...current.future, operation] };
        }
        return { past: [...current.past, operation], future: current.future.slice(0, -1) };
      });
      toast.success(direction === 'undo' ? 'Change undone' : 'Change restored');
    } catch (error) {
      setMessage({ tone: 'red', text: error?.message || 'History action failed.' });
    } finally {
      historyBusy.current = false;
      setHistoryRunning(false);
    }
  }, [commitCells, getPrimary, getStableValue, history.future, history.past, month, normalizedMembers, onChanges, onSoftDelete]);

  const handleGridKeyDown = useCallback((event, row, column) => {
    if (editingKey || bulkBusy) return;
    const command = event.metaKey || event.ctrlKey;
    if (command && event.key.toLowerCase() === 'c') {
      event.preventDefault();
      void copySelection();
      return;
    }
    if (command && event.key.toLowerCase() === 'v') return;
    if (command && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      void runHistory(event.shiftKey ? 'redo' : 'undo');
      return;
    }
    if (command && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      void runHistory('redo');
      return;
    }
    if (event.key === 'F2' || event.key === 'Enter') {
      event.preventDefault();
      beginEdit(row, column);
      return;
    }
    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      void setSelectionValue('0', 'clear');
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      let nextRow = row;
      let nextColumn = column + (event.shiftKey ? -1 : 1);
      if (nextColumn >= dates.length) { nextColumn = 0; nextRow += 1; }
      if (nextColumn < 0) { nextColumn = dates.length - 1; nextRow -= 1; }
      focusGridCell(nextRow, nextColumn);
      return;
    }
    const movement = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    }[event.key];
    if (movement) {
      event.preventDefault();
      focusGridCell(row + movement[0], column + movement[1], event.shiftKey);
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      focusGridCell(command ? 0 : row, 0, event.shiftKey);
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      focusGridCell(command ? filteredMembers.length - 1 : row, dates.length - 1, event.shiftKey);
      return;
    }
    if (!command && !event.altKey && event.key.length === 1) {
      event.preventDefault();
      beginEdit(row, column, event.key);
    }
  }, [beginEdit, bulkBusy, copySelection, dates.length, editingKey, filteredMembers.length, focusGridCell, runHistory, setSelectionValue]);

  const handlePasteEvent = useCallback((event) => {
    if (editingKey) return;
    const text = event.clipboardData?.getData('text/plain');
    if (!text) return;
    event.preventDefault();
    void pasteText(text);
  }, [editingKey, pasteText]);

  const finishFill = useCallback(async () => {
    const drag = fillDrag.current;
    fillDrag.current = null;
    setFillPreview(null);
    if (!drag?.target || !drag?.source) return;
    const sourceMember = filteredMembers[drag.source.row];
    const sourceDate = dates[drag.source.column];
    if (!sourceMember || !sourceDate) return;
    const value = getStableValue(sourceMember._mealMemberId, sourceDate);
    const nextSelection = { anchor: drag.source, focus: drag.target };
    const nextBounds = selectionBounds(nextSelection, filteredMembers.length, dates.length);
    const cells = [];
    for (let row = nextBounds.top; row <= nextBounds.bottom; row += 1) {
      for (let column = nextBounds.left; column <= nextBounds.right; column += 1) {
        const member = filteredMembers[row];
        const date = dates[column];
        if (member && date) cells.push({ member, date, value: value || '0' });
      }
    }
    const success = await commitCells(cells, 'drag_fill');
    if (success) setSelection(nextSelection);
  }, [commitCells, dates, filteredMembers, getStableValue]);
  finishFillRef.current = finishFill;

  const handleCellPointerEnter = (row, column) => {
    if (fillDrag.current) {
      fillDrag.current.target = { row, column };
      setFillPreview({ source: fillDrag.current.source, target: { row, column } });
      return;
    }
    if (!draggingSelection.current) return;
    const focus = { row, column };
    setActiveCell(focus);
    setSelection((current) => ({ ...current, focus }));
  };

  const exportExcel = async () => {
    try {
      const excelModule = await import('exceljs');
      const ExcelJS = excelModule.default || excelModule;
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'NestHub';
      const worksheet = workbook.addWorksheet(`Meals ${month}`.slice(0, 31), {
        views: [{ state: 'frozen', ySplit: 1, xSplit: 2 }],
      });
      worksheet.columns = [
        { header: 'Member ID', key: 'memberId', width: 27 },
        { header: 'Member', key: 'member', width: 24 },
        { header: 'Room', key: 'room', width: 11 },
        ...dates.map((date) => ({ header: date, key: date, width: 9 })),
        { header: 'Total', key: 'total', width: 11 },
      ];
      normalizedMembers.forEach((member) => {
        const row = {
          memberId: member._mealMemberId,
          member: getMemberName(member),
          room: member.room || '',
          total: rollups.byMember.get(member._mealMemberId)?.total || 0,
        };
        dates.forEach((date) => { row[date] = getStableValue(member._mealMemberId, date); });
        worksheet.addRow(row);
      });
      worksheet.getRow(1).height = 26;
      worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
      worksheet.autoFilter = { from: 'A1', to: `${worksheet.getColumn(worksheet.columnCount).letter}1` };
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        row.height = 24;
        dates.forEach((date, index) => {
          const cell = row.getCell(index + 4);
          const tone = toneForValue(cell.value, cell.value !== '');
          const fills = {
            one: 'FF16A34A', two: 'FF2563EB', absent: 'FFDC2626', guest: 'FF7C3AED',
            beef: 'FFB45309', chicken: 'FF0891B2', fish: 'FF0F766E', none: 'FF64748B', custom: 'FF1E293B',
          };
          if (fills[tone]) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fills[tone] } };
            cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
            cell.alignment = { horizontal: 'center' };
          }
        });
      });
      const buffer = await workbook.xlsx.writeBuffer();
      downloadTextFile(buffer, `meal-sheet-${month}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      toast.success('Excel sheet exported');
    } catch (error) {
      setMessage({ tone: 'red', text: error?.message || 'Excel export failed.' });
    }
  };

  const exportCsv = () => {
    const escape = (value) => {
      const text = String(value ?? '');
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const header = ['Member ID', 'Member', 'Room', ...dates, 'Total'];
    const rows = normalizedMembers.map((member) => [
      member._mealMemberId,
      getMemberName(member),
      member.room || '',
      ...dates.map((date) => getStableValue(member._mealMemberId, date)),
      rollups.byMember.get(member._mealMemberId)?.total || 0,
    ]);
    downloadTextFile([header, ...rows].map((row) => row.map(escape).join(',')).join('\r\n'), `meal-sheet-${month}.csv`, 'text/csv;charset=utf-8');
    toast.success('CSV exported');
  };

  const importSpreadsheet = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBulkBusy(true);
    try {
      const extension = file.name.split('.').pop()?.toLowerCase();
      let records = [];
      if (extension === 'xlsx') {
        const excelModule = await import('exceljs');
        const ExcelJS = excelModule.default || excelModule;
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(await file.arrayBuffer());
        const worksheet = workbook.worksheets[0];
        if (!worksheet) throw new Error('The workbook does not contain a worksheet.');
        const matrix = [];
        worksheet.eachRow({ includeEmpty: false }, (row) => matrix.push(row.values.slice(1).map(worksheetValue)));
        const headers = matrix[0] || [];
        records = matrix.slice(1).map((row) => Object.fromEntries(headers.map((header, index) => [normalizeHeader(header), row[index] ?? ''])));
      } else if (extension === 'xml') {
        records = parseSpreadsheetXml(await file.text());
      } else if (extension === 'xls') {
        throw new Error('Legacy binary .xls files are not supported. Save the file as .xlsx, CSV, or Spreadsheet XML first.');
      } else {
        const matrix = parseTextMatrix(await file.text());
        const headers = matrix[0] || [];
        records = matrix.slice(1).map((row) => Object.fromEntries(headers.map((header, index) => [normalizeHeader(header), row[index] ?? ''])));
      }

      const cells = [];
      records.forEach((record, index) => {
        const wantedId = String(record['member id'] || record['user id'] || '').trim();
        const wantedName = String(record.member || record.name || record.email || record.room || '').trim().toLowerCase();
        const member = normalizedMembers.find((item) => item._mealMemberId === wantedId) || normalizedMembers.find((item) => (
          [getMemberName(item), item.email, item.room].some((value) => String(value || '').trim().toLowerCase() === wantedName)
        ));
        if (!member) throw new Error(`Row ${index + 2}: member could not be matched.`);
        const wideDates = dates.filter((date) => Object.prototype.hasOwnProperty.call(record, date));
        if (wideDates.length) {
          wideDates.forEach((date) => {
            if (String(record[date] ?? '').trim() === '') return;
            cells.push({ member, date, value: record[date] });
          });
          return;
        }
        const date = String(record.date || '').trim();
        if (!dates.includes(date)) throw new Error(`Row ${index + 2}: date must be inside ${month}.`);
        let value = record.value ?? record.meal ?? record.code ?? record['meal value'];
        if (value === undefined) {
          const lunch = Number(record.lunch || 0);
          const dinner = Number(record.dinner || 0);
          const guest = Number(record['guest meals'] ?? record.guest ?? record['guest meal'] ?? 0);
          value = guest === 1 && lunch === 0 && dinner === 0 ? 'G' : formatMealCellNumber(lunch + dinner + guest);
        }
        cells.push({ member, date, value });
      });
      if (!cells.length) throw new Error('The spreadsheet contains no meal cells.');
      const success = await commitCells(cells, 'spreadsheet_import');
      if (success) toast.success(`${cells.length} meal cells imported`);
    } catch (error) {
      setMessage({ tone: 'red', text: error?.message || 'Spreadsheet import failed.' });
    } finally {
      setBulkBusy(false);
    }
  };

  const deleteSelection = async () => {
    if (!onSoftDelete) return;
    const targets = [];
    selectedCells().forEach(({ member, date }) => {
      const group = mealIndex.get(cellKey(member._mealMemberId, date));
      if (group) targets.push(...group.rows);
    });
    const uniqueTargets = [...new Map(targets.map((meal) => [meal.id || `${getMealMemberId(meal)}-${meal.date}`, meal])).values()];
    if (!uniqueTargets.length) {
      setMessage({ tone: 'amber', text: 'The selected range has no saved entries.' });
      return;
    }
    if (!window.confirm(`Move ${uniqueTargets.length} saved meal entr${uniqueTargets.length === 1 ? 'y' : 'ies'} to history?`)) return;
    setBulkBusy(true);
    try {
      for (const meal of uniqueTargets) {
        await onSoftDelete(meal, { reason: 'spreadsheet_range_delete', month });
      }
      const changes = uniqueTargets.map((meal) => ({
        id: `meal-delete-${meal.id}-${Date.now()}`,
        type: 'meal_deleted',
        module: 'meals',
        mealId: meal.id || '',
        userId: getMealMemberId(meal),
        date: meal.date,
        month,
        label: `Meal entry moved to history · ${meal.date}`,
        createdAt: new Date().toISOString(),
      }));
      setOptimisticValues((current) => {
        const next = { ...current };
        uniqueTargets.forEach((meal) => { next[cellKey(getMealMemberId(meal), meal.date)] = ''; });
        return next;
      });
      onChanges?.(changes);
      setMessage({ tone: 'green', text: `${uniqueTargets.length} saved entries moved to history.` });
    } catch (error) {
      setMessage({ tone: 'red', text: error?.message || 'Selected entries could not be deleted.' });
    } finally {
      setBulkBusy(false);
    }
  };

  const contextAction = async (action) => {
    setContextMenu(null);
    if (action === 'copy') return copySelection();
    if (action === 'paste') return pasteFromClipboard();
    if (action === 'clear') return setSelectionValue('0', 'clear');
    if (action === 'fill-down') {
      const sourceMember = filteredMembers[bounds.top];
      const sourceDate = dates[bounds.left];
      if (!sourceMember || !sourceDate) return undefined;
      return setSelectionValue(getStableValue(sourceMember._mealMemberId, sourceDate) || '0', 'fill_down');
    }
    return undefined;
  };

  const formulaCommit = async () => {
    if (!activeMember || !activeDate) return;
    const parsed = normalizeMealCellValue(formulaValue);
    if (!parsed.valid) {
      setMessage({ tone: 'red', text: parsed.description });
      return;
    }
    await commitCells([{ member: activeMember, date: activeDate, value: formulaValue }], 'formula_bar');
  };

  const syncLabel = savingCells.size || bulkBusy ? 'Saving changes…' : 'All changes saved';

  return (
    <section id="meal-printable-sheet" className="relative min-w-0 overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.08)] dark:border-slate-700 dark:bg-slate-950">
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xml,.csv,.tsv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/tab-separated-values"
        onChange={importSpreadsheet}
        className="hidden"
      />

      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-3 py-3 dark:border-slate-800 sm:px-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-[#16A34A] text-white shadow-md shadow-green-600/20">
              <FileSpreadsheet className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-sm font-black text-slate-950 dark:text-white">Monthly meal sheet</h2>
                <span className="rounded-md bg-[#2563EB] px-2 py-1 text-[9px] font-black uppercase tracking-wide text-white">{month}</span>
                <span className="flex items-center gap-1 text-[10px] font-bold text-[#16A34A]">
                  {savingCells.size || bulkBusy ? <SpinnerDot /> : <Check className="h-3 w-3" />}
                  {syncLabel}
                </span>
              </div>
              <p className="mt-0.5 truncate text-[10px] font-medium text-slate-400">One member · one date · one editable value</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <SheetButton icon={Undo2} compact disabled={!history.past.length || bulkBusy || historyRunning} onClick={() => void runHistory('undo')} title="Undo (Ctrl/⌘ Z)">Undo</SheetButton>
            <SheetButton icon={Redo2} compact disabled={!history.future.length || bulkBusy || historyRunning} onClick={() => void runHistory('redo')} title="Redo (Ctrl/⌘ Shift Z)">Redo</SheetButton>
            <span className="mx-0.5 hidden h-6 w-px bg-slate-200 sm:block dark:bg-slate-700" />
            <SheetButton icon={Upload} compact disabled={bulkBusy} onClick={() => fileInputRef.current?.click()} title="Import Excel, CSV, or TSV">Import</SheetButton>
            <SheetButton icon={Download} compact disabled={!normalizedMembers.length} onClick={exportExcel} title="Export as Excel workbook">Excel</SheetButton>
            <div className="relative group/export">
              <SheetButton icon={ChevronDown} compact title="More export options">More</SheetButton>
              <div className="invisible absolute right-0 top-10 z-50 w-40 translate-y-1 rounded-xl border border-slate-200 bg-white p-1 opacity-0 shadow-xl transition group-hover/export:visible group-hover/export:translate-y-0 group-hover/export:opacity-100 group-focus-within/export:visible group-focus-within/export:translate-y-0 group-focus-within/export:opacity-100 dark:border-slate-700 dark:bg-slate-900">
                <button type="button" onClick={exportCsv} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[11px] font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"><Download className="h-3.5 w-3.5" />Export CSV</button>
                <button type="button" onClick={() => window.print()} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[11px] font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"><Printer className="h-3.5 w-3.5" />Print sheet</button>
              </div>
            </div>
            {onOpenNotification && <SheetButton icon={BellRing} active onClick={onOpenNotification} title="Open manual notification center">Notify</SheetButton>}
          </div>
        </div>

        <div className="flex flex-col gap-2 border-b border-slate-200 bg-[#F8FAFC] px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900 sm:px-4 lg:flex-row lg:items-center">
          <label className="relative min-w-0 flex-1 lg:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search member, room, email…"
              className="h-9 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-9 text-[11px] font-semibold text-slate-800 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
            {search && <button type="button" onClick={() => setSearch('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100"><X className="h-3 w-3" /></button>}
          </label>

          <div className="relative">
            <SheetButton icon={Filter} active={filter !== 'all'} onClick={() => setFilterOpen((current) => !current)} aria-expanded={filterOpen} title="Filter members">
              {FILTERS.find((item) => item.value === filter)?.label || 'Filter'}
            </SheetButton>
            <AnimatePresence>
              {filterOpen && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} className="absolute left-0 top-11 z-50 w-52 rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
                  {FILTERS.map((item) => (
                    <button key={item.value} type="button" onClick={() => { setFilter(item.value); setFilterOpen(false); }} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[11px] font-bold ${filter === item.value ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
                      {item.label}{filter === item.value && <Check className="h-3.5 w-3.5" />}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <label className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 dark:border-slate-700 dark:bg-slate-950">
            <SlidersHorizontal className="h-3.5 w-3.5 text-slate-400" />
            <select value={sort} onChange={(event) => setSort(event.target.value)} className="bg-transparent text-[11px] font-bold text-slate-600 outline-none dark:text-slate-300" aria-label="Sort members">
              {SORTS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>

          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <SheetButton icon={Copy} compact onClick={() => void copySelection()} title="Copy selected cells">Copy</SheetButton>
            <SheetButton icon={Clipboard} compact onClick={() => void pasteFromClipboard()} title="Paste at active cell">Paste</SheetButton>
            <SheetButton icon={Eraser} compact onClick={() => void setSelectionValue('0', 'clear')} title="Set selected cells to no meal">Clear</SheetButton>
            <SheetButton icon={Trash2} danger compact disabled={bulkBusy || !onSoftDelete} onClick={deleteSelection} title="Move saved entries to history">Delete</SheetButton>
          </div>
        </div>

        <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2 dark:border-slate-800 sm:px-4">
          <span className="flex h-8 min-w-[72px] items-center justify-center rounded-md border border-slate-300 bg-slate-100 px-2 font-mono text-[11px] font-black text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-white">{selectedAddress}</span>
          <span className="font-serif text-sm font-black italic text-slate-400">fx</span>
          <input
            value={formulaValue}
            onChange={(event) => setFormulaValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') { event.preventDefault(); void formulaCommit(); }
              if (event.key === 'Escape') setFormulaValue(activeDisplayValue);
            }}
            onBlur={() => {
              if (formulaValue !== activeDisplayValue) void formulaCommit();
            }}
            className="h-8 min-w-0 flex-1 border-0 bg-transparent px-2 text-[11px] font-semibold text-slate-800 outline-none focus:bg-blue-50 dark:text-white dark:focus:bg-slate-900"
            placeholder="Select a cell or type 0, 1, 2, A, G, B, C, F…"
            aria-label="Formula bar"
          />
          <span className="hidden text-[10px] font-semibold text-slate-400 md:block">{selectedSize.rows} × {selectedSize.columns} · {selectedSize.cells} cell{selectedSize.cells === 1 ? '' : 's'}</span>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto px-3 py-2 [scrollbar-width:none] dark:bg-slate-950 sm:px-4 [&::-webkit-scrollbar]:hidden">
          <span className="mr-1 flex items-center gap-1.5 whitespace-nowrap text-[9px] font-black uppercase tracking-[0.14em] text-slate-400"><Keyboard className="h-3.5 w-3.5" />Cell key</span>
          {mealCellLegend().map((item) => (
            <button key={`${item.display}-${item.label}`} type="button" onClick={() => void setSelectionValue(item.display, 'quick_fill')} title={item.description} className={`flex h-7 items-center gap-1.5 whitespace-nowrap rounded-md px-2 text-[9px] font-black shadow-sm transition hover:scale-[1.02] ${CELL_TONES[item.tone]}`}>
              <span>{item.display}</span><span className="font-semibold opacity-80">{item.label}</span>
            </button>
          ))}
          <span className="ml-auto hidden whitespace-nowrap text-[9px] font-semibold text-slate-400 xl:block">Double-click to edit · Drag the blue handle to fill</span>
        </div>
      </header>

      <AnimatePresence>
        {message && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} role="status" aria-live="polite" className={`flex items-center justify-between gap-3 border-b px-4 py-2 text-[10px] font-bold ${
            message.tone === 'red' ? 'border-red-700 bg-red-600 text-white' : message.tone === 'amber' ? 'border-amber-600 bg-amber-500 text-slate-950' : 'border-green-700 bg-green-600 text-white'
          }`}>
            <span>{message.text}</span>
            <button type="button" onClick={() => setMessage(null)} aria-label="Dismiss message" className="rounded p-1 hover:bg-white/15"><X className="h-3 w-3" /></button>
          </motion.div>
        )}
      </AnimatePresence>

      {duplicateRows > 0 && (
        <div className="flex items-start gap-2 border-b border-amber-600 bg-amber-500 px-4 py-2 text-[10px] font-bold text-slate-950">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none" />
          {duplicateRows} duplicate record{duplicateRows === 1 ? '' : 's'} detected. The newest value is shown; delete the affected saved cells before publishing.
        </div>
      )}

      {!dates.length || !normalizedMembers.length ? (
        <div className="flex min-h-[440px] flex-col items-center justify-center px-6 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-800 text-white"><Users className="h-6 w-6" /></span>
          <h3 className="mt-4 text-sm font-black text-slate-900 dark:text-white">{!dates.length ? 'Choose a valid month' : 'No active members'}</h3>
          <p className="mt-1 text-xs text-slate-400">{!dates.length ? 'The sheet expects a month in YYYY-MM format.' : 'Active members with assigned rooms will appear here.'}</p>
        </div>
      ) : (
        <div
          ref={gridRef}
          className="meal-grid-scroll min-h-[430px] max-h-[calc(100dvh-19rem)] overflow-auto overscroll-contain [scrollbar-color:#94A3B8_transparent] print:max-h-none print:overflow-visible"
          onPaste={handlePasteEvent}
          onScroll={(event) => {
            const target = event.currentTarget;
            if (target.scrollHeight - target.scrollTop - target.clientHeight < 260 && renderLimit < filteredMembers.length) {
              setRenderLimit((current) => Math.min(filteredMembers.length, current + 60));
            }
          }}
        >
          <table className="w-max min-w-full table-fixed border-separate border-spacing-0 text-xs" role="grid" aria-label={`${month} unified meal spreadsheet`} aria-rowcount={filteredMembers.length + 2} aria-colcount={dates.length + 2}>
            <colgroup>
              <col style={{ width: memberWidth }} />
              {dates.map((date) => <col key={date} style={{ width: dayWidth }} />)}
              <col style={{ width: 88 }} />
            </colgroup>
            <thead className="sticky top-0 z-30 text-white">
              <tr>
                <th
                  className="sticky left-0 z-50 h-12 border-b border-r border-slate-500 bg-[#334155] px-3 text-left"
                  style={{ width: memberWidth, minWidth: memberWidth }}
                >
                  <button type="button" onClick={() => setSelection({ anchor: { row: 0, column: 0 }, focus: { row: filteredMembers.length - 1, column: dates.length - 1 } })} className="flex w-full items-center justify-between text-[10px] font-black uppercase tracking-[0.12em]" title="Select all meal cells">
                    <span>Member</span><span className="text-white/55">{filteredMembers.length}</span>
                  </button>
                  <button type="button" aria-label="Resize member column" onPointerDown={(event) => { event.preventDefault(); resizeDrag.current = { type: 'member', startX: event.clientX, startWidth: memberWidth }; }} className="absolute right-0 top-0 h-full w-1 cursor-col-resize bg-transparent hover:bg-blue-400" />
                </th>
                {dates.map((date, columnIndex) => {
                  const parts = dateParts(date);
                  const isToday = date === today;
                  return (
                    <th key={date} className={`relative h-12 border-b border-r border-slate-500 px-1 text-center ${isToday ? 'bg-[#2563EB]' : 'bg-[#334155]'}`} style={{ width: dayWidth, minWidth: dayWidth }}>
                      <button type="button" onClick={() => { const next = { row: 0, column: columnIndex }; setActiveCell(next); setSelection({ anchor: next, focus: { row: filteredMembers.length - 1, column: columnIndex } }); }} className="h-full w-full" title={date}>
                        <span className="block text-[11px] font-black leading-none">{parts.day}</span>
                        <span className="mt-1 block text-[8px] font-bold uppercase tracking-wide text-white/65">{parts.weekday}</span>
                      </button>
                      <button type="button" aria-label={`Resize ${date} columns`} onPointerDown={(event) => { event.preventDefault(); resizeDrag.current = { type: 'day', startX: event.clientX, startWidth: dayWidth }; }} className="absolute right-0 top-0 h-full w-1 cursor-col-resize bg-transparent hover:bg-blue-300" />
                    </th>
                  );
                })}
                <th className="h-12 border-b border-slate-500 bg-[#334155] px-2 text-right text-[9px] font-black uppercase tracking-wide">Total</th>
              </tr>
            </thead>
            <tbody>
              {visibleMembers.map((member, rowIndex) => {
                const memberId = member._mealMemberId;
                const memberTotal = rollups.byMember.get(memberId)?.total || 0;
                return (
                  <tr key={memberId} className="group h-11">
                    <th
                      className={`sticky left-0 z-20 border-b border-r border-slate-200 px-2 text-left transition dark:border-slate-800 ${rowIndex % 2 ? 'bg-[#F8FAFC] dark:bg-slate-900' : 'bg-white dark:bg-slate-950'} group-hover:bg-blue-50 dark:group-hover:bg-slate-800`}
                      style={{ width: memberWidth, minWidth: memberWidth }}
                    >
                      <button type="button" onClick={() => { const next = { row: rowIndex, column: 0 }; setActiveCell(next); setSelection({ anchor: next, focus: { row: rowIndex, column: dates.length - 1 } }); }} className="flex w-full items-center gap-2 text-left" title={`Select ${getMemberName(member)} row`}>
                        <span className="w-5 flex-none text-center font-mono text-[9px] font-bold text-slate-400">{rowIndex + 2}</span>
                        {getMemberPhoto(member) ? (
                          <Image src={getMemberPhoto(member)} alt="" width={28} height={28} unoptimized className="h-7 w-7 flex-none rounded-lg object-cover ring-1 ring-slate-200 dark:ring-slate-700" />
                        ) : (
                          <span className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-[#1E293B] text-[10px] font-black text-white">{memberInitial(member)}</span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[10px] font-black text-slate-900 dark:text-white">{getMemberName(member)}</span>
                          <span className="mt-0.5 block truncate text-[8px] font-bold uppercase tracking-wide text-slate-400">Room {member.room || '—'}</span>
                        </span>
                      </button>
                    </th>
                    {dates.map((date, columnIndex) => {
                      const key = cellKey(memberId, date);
                      const group = mealIndex.get(key);
                      const serverRecorded = Boolean(group?.primary);
                      const value = getVisibleValue(memberId, date);
                      const stableValue = getStableValue(memberId, date);
                      const selected = cellInSelection(rowIndex, columnIndex, selection, filteredMembers.length, dates.length);
                      const active = activeCell.row === rowIndex && activeCell.column === columnIndex;
                      const editing = editingKey === key;
                      const saving = savingCells.has(key);
                      const error = cellErrors[key];
                      const previewed = fillPreview && cellInSelection(rowIndex, columnIndex, { anchor: fillPreview.source, focus: fillPreview.target }, filteredMembers.length, dates.length);
                      return (
                        <td key={date} role="gridcell" aria-selected={selected} className="relative h-11 border-b border-r border-slate-200 p-0 dark:border-slate-800" style={{ width: dayWidth, minWidth: dayWidth }}>
                          {editing ? (
                            <input
                              ref={(node) => {
                                if (node) editorRefs.current.set(key, node);
                                else editorRefs.current.delete(key);
                              }}
                              value={value}
                              onChange={(event) => {
                                const next = event.target.value;
                                setDraftValues((current) => ({ ...current, [key]: next }));
                                setFormulaValue(next);
                                const parsed = normalizeMealCellValue(next);
                                setCellErrors((current) => {
                                  const copy = { ...current };
                                  if (parsed.valid) delete copy[key];
                                  else copy[key] = parsed.description;
                                  return copy;
                                });
                                scheduleAutoSave(member, date, next);
                              }}
                              onBlur={(event) => {
                                if (skipBlurKey.current === key) {
                                  skipBlurKey.current = '';
                                  return;
                                }
                                void finishEdit(member, date, event.currentTarget.value);
                              }}
                              onKeyDown={(event) => {
                                if (event.key === 'Escape') { event.preventDefault(); cancelEdit(memberId, date); focusGridCell(rowIndex, columnIndex); }
                                if (event.key === 'Enter') { event.preventDefault(); void finishEdit(member, date, event.currentTarget.value, { row: rowIndex + (event.shiftKey ? -1 : 1), column: columnIndex }); }
                                if (event.key === 'Tab') { event.preventDefault(); void finishEdit(member, date, event.currentTarget.value, { row: rowIndex, column: columnIndex + (event.shiftKey ? -1 : 1) }); }
                              }}
                              aria-label={`${getMemberName(member)}, ${date}, edit meal value`}
                              aria-invalid={Boolean(error)}
                              title={error || 'Enter 0, a number, A, G, B, C, or F'}
                              className={`h-11 w-full border-0 px-1 text-center text-xs font-black uppercase outline-none ring-2 ring-inset ${error ? 'bg-red-600 text-white ring-red-900' : 'bg-white text-slate-950 ring-blue-600 dark:bg-slate-900 dark:text-white'}`}
                            />
                          ) : (
                            <button
                              ref={(node) => {
                                const refKey = `${rowIndex}:${columnIndex}`;
                                if (node) cellRefs.current.set(refKey, node);
                                else cellRefs.current.delete(refKey);
                              }}
                              type="button"
                              tabIndex={active ? 0 : -1}
                              aria-label={`${getMemberName(member)}, ${date}: ${stableValue || 'unrecorded'}`}
                              title={error || (group?.duplicateCount ? `${group.rows.length} active records exist for this cell` : `${date} · ${normalizeMealCellValue(stableValue || 0).label}`)}
                              onFocus={() => setActiveCell({ row: rowIndex, column: columnIndex })}
                              onPointerDown={(event) => {
                                if (event.button !== 0) return;
                                draggingSelection.current = true;
                                const next = { row: rowIndex, column: columnIndex };
                                setActiveCell(next);
                                setSelection((current) => event.shiftKey ? { ...current, focus: next } : { anchor: next, focus: next });
                              }}
                              onPointerEnter={() => handleCellPointerEnter(rowIndex, columnIndex)}
                              onDoubleClick={() => beginEdit(rowIndex, columnIndex)}
                              onKeyDown={(event) => handleGridKeyDown(event, rowIndex, columnIndex)}
                              onContextMenu={(event) => {
                                event.preventDefault();
                                const next = { row: rowIndex, column: columnIndex };
                                if (!selected) setSelection({ anchor: next, focus: next });
                                setActiveCell(next);
                                setContextMenu({ x: Math.max(8, Math.min(event.clientX, window.innerWidth - 230)), y: Math.max(8, Math.min(event.clientY, window.innerHeight - 330)) });
                              }}
                              className={`relative h-11 w-full px-1 text-center text-[11px] font-black uppercase tabular-nums outline-none transition duration-200 hover:z-10 hover:scale-[1.02] focus:z-10 ${cellToneClass(stableValue, serverRecorded || Object.prototype.hasOwnProperty.call(optimisticValues, key), rowIndex)} ${selected ? 'z-[1] ring-2 ring-inset ring-blue-600' : ''} ${active ? 'z-[2] ring-[3px] ring-inset ring-blue-700 dark:ring-blue-400' : ''} ${previewed ? 'brightness-110 ring-2 ring-inset ring-blue-300' : ''}`}
                            >
                              <span className={stableValue === '' ? 'opacity-0' : ''}>{stableValue || '·'}</span>
                            </button>
                          )}
                          {active && !editing && (
                            <button
                              type="button"
                              tabIndex={-1}
                              aria-label="Drag to fill"
                              title="Drag to fill"
                              onPointerDown={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                draggingSelection.current = false;
                                fillDrag.current = { source: { row: rowIndex, column: columnIndex }, target: { row: rowIndex, column: columnIndex } };
                                setFillPreview(fillDrag.current);
                              }}
                              className="absolute -bottom-1 -right-1 z-20 h-3 w-3 cursor-crosshair rounded-sm border-2 border-white bg-blue-700 shadow"
                            />
                          )}
                          {saving && <Loader2 className="pointer-events-none absolute bottom-0.5 right-0.5 z-10 h-2.5 w-2.5 animate-spin text-white drop-shadow" />}
                          {group?.duplicateCount > 0 && <AlertTriangle className="pointer-events-none absolute left-0.5 top-0.5 z-10 h-2.5 w-2.5 text-amber-300 drop-shadow" />}
                          {error && <span className="pointer-events-none absolute right-0 top-0 z-10 h-0 w-0 border-l-[7px] border-t-[7px] border-l-transparent border-t-red-950" />}
                        </td>
                      );
                    })}
                    <td className="h-11 border-b border-slate-200 bg-slate-100 px-3 text-right text-[11px] font-black tabular-nums text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-white">{formatMealCellNumber(memberTotal)}</td>
                  </tr>
                );
              })}
              {!visibleMembers.length && (
                <tr><td colSpan={dates.length + 2} className="h-52 bg-white text-center dark:bg-slate-950"><Search className="mx-auto h-6 w-6 text-slate-300" /><p className="mt-2 text-xs font-black text-slate-500">No matching members</p><button type="button" onClick={() => { setSearch(''); setFilter('all'); }} className="mt-2 text-[10px] font-bold text-blue-600">Clear filters</button></td></tr>
              )}
            </tbody>
            <tfoot className="sticky bottom-0 z-20 text-white">
              <tr>
                <th className="sticky left-0 z-30 h-10 border-r border-t border-slate-600 bg-[#1E293B] px-3 text-left text-[9px] font-black uppercase tracking-[0.12em]">Daily total</th>
                {dates.map((date) => <td key={date} className="h-10 border-r border-t border-slate-600 bg-[#1E293B] px-1 text-center text-[10px] font-black tabular-nums">{formatMealCellNumber(rollups.byDate.get(date) || 0)}</td>)}
                <td className="h-10 border-t border-slate-600 bg-[#2563EB] px-3 text-right text-xs font-black tabular-nums">{formatMealCellNumber(rollups.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <footer className="flex flex-col gap-2 border-t border-slate-200 bg-[#F8FAFC] px-3 py-2 text-[9px] font-bold text-slate-500 dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between sm:px-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${savingCells.size || bulkBusy ? 'animate-pulse bg-amber-500' : 'bg-green-600'}`} />{syncLabel}</span>
          <span>{filteredMembers.length} member{filteredMembers.length === 1 ? '' : 's'}</span>
          <span>{selectedAddress}</span>
          <span>Count: {selectedSize.cells}</span>
        </div>
        <div className="flex items-center gap-3 text-slate-400">
          <span>Enter / F2 edit</span><span>Ctrl/⌘ C · V · Z</span>
        </div>
      </footer>

      <AnimatePresence>
        {contextMenu && (
          <motion.div
            ref={contextMenuRef}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            className="fixed z-[90] w-56 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xl dark:border-slate-700 dark:bg-slate-900"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            role="menu"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                setContextMenu(null);
                cellRefs.current.get(`${activeCell.row}:${activeCell.column}`)?.focus();
                return;
              }
              if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
              event.preventDefault();
              const items = [...event.currentTarget.querySelectorAll('button[role="menuitem"]')];
              const current = items.indexOf(document.activeElement);
              const offset = event.key === 'ArrowDown' ? 1 : -1;
              items[(current + offset + items.length) % items.length]?.focus();
            }}
          >
            <div className="mb-1 grid grid-cols-4 gap-1 border-b border-slate-100 pb-1.5 dark:border-slate-800">
              {mealCellLegend().map((item) => <button key={item.display} type="button" role="menuitem" onClick={() => { setContextMenu(null); void setSelectionValue(item.display, 'context_fill'); }} title={item.label} className={`h-8 rounded-md text-[10px] font-black ${CELL_TONES[item.tone]}`}>{item.display}</button>)}
            </div>
            {[
              { id: 'copy', label: 'Copy', icon: Copy, shortcut: '⌘C' },
              { id: 'paste', label: 'Paste', icon: Clipboard, shortcut: '⌘V' },
              { id: 'fill-down', label: 'Fill selection', icon: Download, shortcut: '' },
              { id: 'clear', label: 'Set to no meal', icon: Eraser, shortcut: 'Del' },
            ].map((item) => {
              const Icon = item.icon;
              return <button key={item.id} type="button" role="menuitem" onClick={() => void contextAction(item.id)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[11px] font-bold text-slate-700 hover:bg-blue-50 hover:text-blue-700 dark:text-slate-200 dark:hover:bg-slate-800"><Icon className="h-3.5 w-3.5" /><span className="flex-1">{item.label}</span><span className="text-[9px] text-slate-400">{item.shortcut}</span></button>;
            })}
            <div className="mt-1 border-t border-slate-100 pt-1 dark:border-slate-800">
              <button type="button" role="menuitem" onClick={() => { setContextMenu(null); void deleteSelection(); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[11px] font-bold text-red-600 hover:bg-red-50 dark:hover:bg-red-950"><Trash2 className="h-3.5 w-3.5" />Move saved entries to history</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {contextMenu && <button type="button" aria-label="Close context menu" onClick={() => setContextMenu(null)} className="fixed inset-0 z-[80] cursor-default" />}

      {bulkBusy && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-white/25 backdrop-blur-[1px] dark:bg-slate-950/25">
          <span className="flex items-center gap-2 rounded-xl bg-[#1E293B] px-4 py-2.5 text-xs font-black text-white shadow-xl"><Loader2 className="h-4 w-4 animate-spin" />Syncing spreadsheet</span>
        </div>
      )}
    </section>
  );
}
