'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ClipboardCopy,
  Download,
  FileText,
  FileSpreadsheet,
  Filter,
  Plus,
  Redo2,
  RotateCcw,
  Save,
  Search,
  Trash2,
  Undo2,
  Upload,
  X,
} from 'lucide-react';
import { EmptyState, StatusPill, ToolbarButton } from '@/components/admin/ui/AdminUI';
import {
  downloadTextFile,
  gridNavigationTarget,
  parseDelimited,
  parseSpreadsheetXml,
  rowsToCsv,
} from '@/lib/spreadsheet';
import {
  amountToPaisa,
  BAZAR_CATEGORIES,
  BAZAR_DEFAULT_CATEGORY,
  dhakaDateId,
  normalizeBazarRow,
  normalizeBazarRows,
  paisaToAmount,
  serializeBazarRow,
  validateBazarRow,
} from '@/lib/bazarWorkspace';

const EDITABLE_COLUMNS = [
  { key: 'date', label: 'Date', type: 'date', width: 'min-w-36' },
  { key: 'marketId', label: 'Market ID', type: 'text', width: 'min-w-40' },
  { key: 'description', label: 'Description', type: 'text', width: 'min-w-64' },
  { key: 'category', label: 'Category', type: 'category', width: 'min-w-44' },
  { key: 'amount', label: 'Amount', type: 'number', width: 'min-w-36' },
  { key: 'paidById', label: 'Paid By', type: 'member', width: 'min-w-48' },
  { key: 'addedByName', label: 'Added By', type: 'text', width: 'min-w-44', readOnly: true },
  { key: 'notes', label: 'Notes', type: 'text', width: 'min-w-56' },
  { key: 'attachmentUrl', label: 'Attachment', type: 'url', width: 'min-w-56' },
  { key: 'countInBazar', label: 'Counted', type: 'boolean', width: 'min-w-28' },
  { key: 'place', label: 'Place', type: 'text', width: 'min-w-48' },
];

const EXPORT_COLUMNS = EDITABLE_COLUMNS.map((column) => ({
  key: column.key,
  label: column.label,
  value: (row) => {
    if (column.key === 'countInBazar') return row.countInBazar === false ? 'No' : 'Yes';
    if (column.key === 'amount') return Number(row.amount || 0);
    if (column.key === 'paidById') return row.paidByName || row.paidById || '';
    return row[column.key] ?? '';
  },
}));

function memberId(member) {
  return String(member?.id || member?.uid || '').trim();
}

function memberName(member) {
  return String(
    member?.displayName || member?.name || member?.fullName || member?.email || 'Member'
  ).trim();
}

function rowKey(row) {
  return String(row?.id || row?.__tempId || row?.marketId || '').trim();
}

function makeDraftId(prefix = 'draft') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function marketIdFor(month, index = 0) {
  const monthPart = String(month || dhakaDateId().slice(0, 7)).replace('-', '');
  return `BZ-${monthPart}-${String(Date.now() + index).slice(-6)}`;
}

function defaultDateForMonth(month, selectedDate) {
  if (selectedDate?.slice(0, 7) === month) return selectedDate;
  const today = dhakaDateId();
  if (today.slice(0, 7) === month) return today;
  return month ? `${month}-01` : today;
}

function inputValue(row, column) {
  if (column.key === 'amount') return row.amountPaisa > 0 ? paisaToAmount(row.amountPaisa) : '';
  if (column.key === 'countInBazar') return row.countInBazar === false ? 'false' : 'true';
  return row[column.key] ?? '';
}

function clipboardValue(row, column) {
  if (column.key === 'countInBazar') return row.countInBazar === false ? 'No' : 'Yes';
  if (column.key === 'amount') return String(paisaToAmount(row.amountPaisa));
  return String(row[column.key] ?? '');
}

function booleanValue(value) {
  const text = String(value ?? '').trim().toLowerCase();
  return !['false', 'no', 'n', '0', 'excluded', 'not counted'].includes(text);
}

function cellPatch(columnKey, rawValue, row, members) {
  if (columnKey === 'amount') {
    return {
      amount: rawValue,
      amountPaisa: amountToPaisa(rawValue),
    };
  }
  if (columnKey === 'paidById') {
    const member = members.find((item) => memberId(item) === rawValue);
    return {
      paidById: rawValue,
      paidByName: member ? memberName(member) : row.paidByName || '',
      userId: rawValue,
    };
  }
  if (columnKey === 'countInBazar') {
    return { countInBazar: booleanValue(rawValue) };
  }
  if (columnKey === 'date') {
    return { date: rawValue, month: String(rawValue || '').slice(0, 7) };
  }
  if (columnKey === 'description') {
    return {
      description: rawValue,
      items: String(rawValue || '').split(',').map((item) => item.trim()).filter(Boolean),
    };
  }
  if (columnKey === 'attachmentUrl') {
    const url = String(rawValue || '').trim();
    return {
      attachmentUrl: url,
      attachment: url ? { url, name: url.split('/').pop() || 'Attachment' } : null,
      attachments: url ? [{ url, name: url.split('/').pop() || 'Attachment' }] : [],
    };
  }
  return { [columnKey]: rawValue };
}

function cellError(fieldErrors, columnKey) {
  if (fieldErrors?.[columnKey]) return fieldErrors[columnKey];
  if (columnKey === 'description' && fieldErrors?.duplicate) return fieldErrors.duplicate;
  return '';
}

function GridEditor({
  row,
  rowIndex,
  column,
  columnIndex,
  members,
  errors,
  disabled,
  onChange,
  onBlur,
  onKeyDown,
  onPaste,
}) {
  const error = cellError(errors, column.key);
  const className = `h-8 w-full rounded-md border bg-transparent px-2 text-[11px] font-medium outline-none transition disabled:cursor-not-allowed disabled:opacity-55 ${
    error
      ? 'border-rose-300 text-rose-700 focus:border-rose-500 dark:border-rose-800 dark:text-rose-300'
      : 'border-transparent text-slate-700 hover:border-slate-200 focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100 dark:text-slate-200 dark:hover:border-slate-700 dark:focus:bg-slate-950 dark:focus:ring-blue-950'
  }`;
  const common = {
    'data-bazar-cell': `${rowIndex}-${columnIndex}`,
    'aria-label': `${column.label}, row ${rowIndex + 1}`,
    'aria-invalid': Boolean(error),
    title: error || column.label,
    disabled,
    value: inputValue(row, column),
    onBlur,
    onKeyDown,
    onPaste,
    className,
  };

  if (column.type === 'member') {
    return (
      <select {...common} onChange={(event) => onChange(event.target.value)}>
        <option value="">Select member</option>
        {members.map((member) => (
          <option key={memberId(member)} value={memberId(member)}>
            {memberName(member)}{member.room ? ` · ${member.room}` : ''}
          </option>
        ))}
      </select>
    );
  }

  if (column.type === 'boolean') {
    return (
      <select {...common} onChange={(event) => onChange(event.target.value)}>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    );
  }

  return (
    <input
      {...common}
      type={column.type === 'category' ? 'text' : column.type}
      list={column.type === 'category' ? 'bazar-category-options' : undefined}
      min={column.type === 'number' ? '0.01' : undefined}
      step={column.type === 'number' ? '0.01' : undefined}
      placeholder={column.type === 'url' ? 'https://…' : undefined}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

export default function BazarSpreadsheet({
  rows = [],
  members = [],
  selectedMonth = '',
  selectedDate = '',
  onSelectedDateChange,
  onCreate,
  onUpdate,
  onDelete,
  onRestore,
  dirtyChanges = [],
  onDirtyChangesChange,
}) {
  const fileInputRef = useRef(null);
  const dirtyChangesRef = useRef(Array.isArray(dirtyChanges) ? dirtyChanges : []);
  const [drafts, setDrafts] = useState({});
  const [storageReady, setStorageReady] = useState(false);
  const [history, setHistory] = useState({ past: [], future: [] });
  const [selected, setSelected] = useState(() => new Set());
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [memberFilter, setMemberFilter] = useState('all');
  const [countFilter, setCountFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('active');
  const [dateOnly, setDateOnly] = useState(false);
  const [sort, setSort] = useState({ key: 'date', direction: 'desc' });
  const [rowErrors, setRowErrors] = useState({});
  const [saving, setSaving] = useState(() => new Set());
  const [message, setMessage] = useState(null);
  const [renderLimit, setRenderLimit] = useState(200);

  const storageKey = `nesthub:bazar-spreadsheet:drafts:${selectedMonth || 'all'}`;
  const normalizedRows = useMemo(() => normalizeBazarRows(rows), [rows]);
  const memberNames = useMemo(() => new Map(
    members.map((member) => [memberId(member), memberName(member)])
  ), [members]);

  useEffect(() => {
    dirtyChangesRef.current = Array.isArray(dirtyChanges) ? dirtyChanges : [];
  }, [dirtyChanges]);

  useEffect(() => {
    setStorageReady(false);
    try {
      const saved = window.localStorage.getItem(storageKey);
      const parsed = saved ? JSON.parse(saved) : {};
      const restored = Object.fromEntries(
        Object.entries(parsed || {}).map(([key, row]) => [key, normalizeBazarRow(row)])
      );
      setDrafts(restored);
    } catch {
      setDrafts({});
    }
    setHistory({ past: [], future: [] });
    setSelected(new Set());
    setStorageReady(true);
  }, [storageKey]);

  useEffect(() => {
    if (!storageReady) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(drafts));
    } catch {
      // A full/private localStorage should not block spreadsheet editing.
    }
  }, [drafts, storageKey, storageReady]);

  const workingRows = useMemo(() => {
    const baseKeys = new Set(normalizedRows.map(rowKey));
    const merged = normalizedRows.map((row) => {
      const key = rowKey(row);
      return drafts[key] ? normalizeBazarRow({ ...row, ...drafts[key] }) : row;
    });
    Object.entries(drafts).forEach(([key, row]) => {
      if (!baseKeys.has(key) && row?.__isNew) merged.push(normalizeBazarRow(row));
    });
    return merged;
  }, [normalizedRows, drafts]);

  const categories = useMemo(() => [...new Set([
    ...BAZAR_CATEGORIES,
    ...workingRows.map((row) => row.category).filter(Boolean),
  ])].sort(), [workingRows]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = workingRows.filter((row) => {
      if (selectedMonth && row.month !== selectedMonth) return false;
      if (statusFilter === 'active' && row.isDeleted) return false;
      if (statusFilter === 'deleted' && !row.isDeleted) return false;
      if (categoryFilter !== 'all' && row.category !== categoryFilter) return false;
      if (memberFilter !== 'all' && row.paidById !== memberFilter) return false;
      if (countFilter === 'counted' && row.countInBazar === false) return false;
      if (countFilter === 'excluded' && row.countInBazar !== false) return false;
      if (dateOnly && selectedDate && row.date !== selectedDate) return false;
      if (!query) return true;
      return [
        row.marketId,
        row.date,
        row.description,
        row.category,
        row.amount,
        row.paidByName || memberNames.get(row.paidById),
        row.addedByName,
        row.notes,
        row.place,
        row.attachmentUrl,
      ].some((value) => String(value ?? '').toLowerCase().includes(query));
    });

    return filtered.sort((left, right) => {
      let leftValue = left[sort.key] ?? '';
      let rightValue = right[sort.key] ?? '';
      if (sort.key === 'amount') {
        leftValue = left.amountPaisa;
        rightValue = right.amountPaisa;
      }
      if (sort.key === 'paidById') {
        leftValue = left.paidByName || memberNames.get(left.paidById) || '';
        rightValue = right.paidByName || memberNames.get(right.paidById) || '';
      }
      const result = typeof leftValue === 'number'
        ? leftValue - Number(rightValue || 0)
        : String(leftValue).localeCompare(String(rightValue), undefined, { numeric: true });
      return sort.direction === 'asc' ? result : -result;
    });
  }, [
    workingRows,
    selectedMonth,
    selectedDate,
    statusFilter,
    categoryFilter,
    memberFilter,
    countFilter,
    dateOnly,
    search,
    sort,
    memberNames,
  ]);

  const selectedRows = useMemo(() => filteredRows.filter((row) => selected.has(rowKey(row))), [
    filteredRows,
    selected,
  ]);
  const renderedRows = useMemo(() => filteredRows.slice(0, renderLimit), [filteredRows, renderLimit]);
  const draftCount = Object.keys(drafts).length;

  useEffect(() => {
    setRenderLimit(200);
  }, [categoryFilter, countFilter, dateOnly, memberFilter, search, selectedMonth, sort, statusFilter]);

  function appendDirtyChange(change) {
    if (typeof onDirtyChangesChange !== 'function') return;
    const next = [...dirtyChangesRef.current, {
      id: makeDraftId('change'),
      createdAt: new Date().toISOString(),
      ...change,
    }];
    dirtyChangesRef.current = next;
    onDirtyChangesChange(next);
  }

  function stageRow(key, before, after, recordHistory = true) {
    setDrafts((current) => {
      const next = { ...current };
      if (after) next[key] = normalizeBazarRow(after);
      else delete next[key];
      return next;
    });
    if (recordHistory) {
      setHistory((current) => ({
        past: [...current.past.slice(-99), { key, before, after }],
        future: [],
      }));
    }
  }

  function updateCell(row, columnKey, rawValue) {
    const key = rowKey(row);
    const before = normalizeBazarRow(row);
    const after = normalizeBazarRow({
      ...row,
      ...cellPatch(columnKey, rawValue, row, members),
    });
    stageRow(key, before, after);
    setRowErrors((current) => {
      const next = { ...current };
      if (next[key]) {
        next[key] = { ...next[key] };
        delete next[key][columnKey];
        if (columnKey === 'description') delete next[key].duplicate;
      }
      return next;
    });
  }

  function undo() {
    const item = history.past[history.past.length - 1];
    if (!item) return;
    stageRow(item.key, item.after, item.before, false);
    setHistory((current) => ({
      past: current.past.slice(0, -1),
      future: [item, ...current.future].slice(0, 100),
    }));
  }

  function redo() {
    const item = history.future[0];
    if (!item) return;
    stageRow(item.key, item.before, item.after, false);
    setHistory((current) => ({
      past: [...current.past, item].slice(-100),
      future: current.future.slice(1),
    }));
  }

  function addRow(seed = {}, index = 0) {
    const key = makeDraftId('bazar');
    const row = normalizeBazarRow({
      ...seed,
      id: '',
      __tempId: key,
      __isNew: true,
      date: seed.date || defaultDateForMonth(selectedMonth, selectedDate),
      month: selectedMonth,
      marketId: seed.marketId || marketIdFor(selectedMonth, index),
      category: seed.category || BAZAR_DEFAULT_CATEGORY,
      countInBazar: seed.countInBazar !== false,
      isDeleted: false,
    });
    stageRow(key, null, row);
    setStatusFilter('active');
    setMessage({ tone: 'blue', text: 'New row added as a local draft.' });
    requestAnimationFrame(() => {
      const target = document.querySelector(`[data-bazar-cell="${filteredRows.length}-0"]`);
      target?.focus();
    });
    return row;
  }

  async function commitRow(row) {
    const normalized = normalizeBazarRow(row);
    const key = rowKey(normalized);
    const validation = validateBazarRow(normalized, {
      selectedMonth,
      existingRows: workingRows,
    });
    setRowErrors((current) => ({ ...current, [key]: validation.fieldErrors }));
    if (!validation.valid) {
      setMessage({ tone: 'red', text: validation.errors[0] || 'Review the highlighted cells.' });
      return false;
    }

    const payload = serializeBazarRow(validation.value);
    setSaving((current) => new Set(current).add(key));
    try {
      if (normalized.__isNew) {
        if (typeof onCreate !== 'function') {
          setMessage({ tone: 'amber', text: 'Draft is valid. Connect onCreate to save it.' });
          return false;
        }
        const created = await onCreate(payload, {
          draftId: key,
          row: validation.value,
        });
        appendDirtyChange({
          type: 'create',
          action: 'create',
          entityId: created?.id || payload.marketId,
          rowId: created?.id || '',
          memberId: payload.paidById,
          label: `Added ${payload.marketId}: ${payload.description} — ৳${payload.amount.toLocaleString()}`,
          after: payload,
        });
      } else {
        if (typeof onUpdate !== 'function') {
          setMessage({ tone: 'amber', text: 'Draft is valid. Connect onUpdate to save it.' });
          return false;
        }
        const original = normalizedRows.find((item) => rowKey(item) === key) || null;
        await onUpdate(normalized.id, payload, {
          row: validation.value,
          before: original,
        });
        appendDirtyChange({
          type: 'update',
          action: 'update',
          entityId: normalized.id,
          rowId: normalized.id,
          memberId: payload.paidById,
          label: `Updated ${payload.marketId}: ${payload.description}`,
          before: original,
          after: payload,
        });
      }
      setDrafts((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      setRowErrors((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      setMessage({ tone: 'green', text: `${payload.marketId} saved. Notification is still pending review.` });
      return true;
    } catch (error) {
      setMessage({ tone: 'red', text: error?.message || 'Could not save this row.' });
      return false;
    } finally {
      setSaving((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  }

  async function saveDrafts() {
    const pending = workingRows.filter((row) => drafts[rowKey(row)]);
    let savedCount = 0;
    for (const row of pending) {
      if (await commitRow(row)) savedCount += 1;
    }
    if (savedCount) setMessage({ tone: 'green', text: `${savedCount} draft row(s) saved.` });
  }

  async function deleteRow(row, showConfirmation = true) {
    const key = rowKey(row);
    if (row.__isNew) {
      stageRow(key, row, null);
      setSelected((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
      return true;
    }
    if (showConfirmation && !window.confirm(`Soft delete ${row.marketId || row.id}?`)) return false;
    if (typeof onDelete !== 'function') {
      setMessage({ tone: 'amber', text: 'Connect onDelete to soft delete persisted rows.' });
      return false;
    }
    try {
      await onDelete(row.id, row);
      setDrafts((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      appendDirtyChange({
        type: 'delete',
        action: 'delete',
        entityId: row.id,
        rowId: row.id,
        memberId: row.paidById,
        label: `Deleted ${row.marketId}: ${row.description}`,
        before: row,
      });
      return true;
    } catch (error) {
      setMessage({ tone: 'red', text: error?.message || 'Could not delete this row.' });
      return false;
    }
  }

  async function restoreRow(row) {
    if (typeof onRestore !== 'function') {
      setMessage({ tone: 'amber', text: 'Connect onRestore to restore deleted rows.' });
      return false;
    }
    try {
      await onRestore(row.id, row);
      setDrafts((current) => {
        const next = { ...current };
        delete next[rowKey(row)];
        return next;
      });
      appendDirtyChange({
        type: 'restore',
        action: 'restore',
        entityId: row.id,
        rowId: row.id,
        memberId: row.paidById,
        label: `Restored ${row.marketId}: ${row.description}`,
        after: { ...row, isDeleted: false },
      });
      return true;
    } catch (error) {
      setMessage({ tone: 'red', text: error?.message || 'Could not restore this row.' });
      return false;
    }
  }

  async function bulkDelete() {
    const targets = selectedRows.filter((row) => !row.isDeleted);
    if (!targets.length) return;
    if (!window.confirm(`Soft delete ${targets.length} selected row(s)?`)) return;
    for (const row of targets) await deleteRow(row, false);
    setSelected(new Set());
  }

  async function bulkRestore() {
    const targets = selectedRows.filter((row) => row.isDeleted);
    for (const row of targets) await restoreRow(row);
    setSelected(new Set());
  }

  function focusCell(rowIndex, columnIndex) {
    requestAnimationFrame(() => {
      const target = document.querySelector(`[data-bazar-cell="${rowIndex}-${columnIndex}"]`);
      target?.focus();
      if (typeof target?.select === 'function' && target.tagName === 'INPUT') target.select();
    });
  }

  function handleCellKeyDown(event, row, rowIndex, columnIndex) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      commitRow(row);
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      redo();
      return;
    }
    const target = gridNavigationTarget(
      event,
      rowIndex,
      columnIndex,
      renderedRows.length,
      EDITABLE_COLUMNS.length
    );
    if (!target) return;
    event.preventDefault();
    if (event.key === 'Enter' || event.key === 'Tab') commitRow(row);
    focusCell(target.row, target.column);
  }

  function handlePaste(event, startRow, startColumn) {
    const text = event.clipboardData.getData('text/plain');
    if (!text || (!text.includes('\t') && !/[\r\n]/.test(text))) return;
    event.preventDefault();
    const matrix = text.replace(/\r/g, '').split('\n').filter(Boolean).map((line) => line.split('\t'));
    matrix.forEach((values, rowOffset) => {
      const target = renderedRows[startRow + rowOffset];
      if (!target) return;
      let next = normalizeBazarRow(target);
      values.forEach((value, columnOffset) => {
        const column = EDITABLE_COLUMNS[startColumn + columnOffset];
        if (!column) return;
        next = normalizeBazarRow({
          ...next,
          ...cellPatch(column.key, value, next, members),
        });
      });
      stageRow(rowKey(target), target, next);
    });
    setMessage({ tone: 'blue', text: `${matrix.length} clipboard row(s) staged as drafts.` });
  }

  async function copySelectedRows() {
    const source = selectedRows.length ? selectedRows : filteredRows;
    if (!source.length) return;
    const text = source.map((row) => (
      EDITABLE_COLUMNS.map((column) => clipboardValue(row, column)).join('\t')
    )).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setMessage({ tone: 'green', text: `${source.length} row(s) copied as spreadsheet data.` });
    } catch {
      setMessage({ tone: 'red', text: 'Clipboard access was blocked by the browser.' });
    }
  }

  function exportCsv() {
    const csv = rowsToCsv(EXPORT_COLUMNS, filteredRows);
    downloadTextFile(`\uFEFF${csv}`, `bazar-${selectedMonth || 'all'}.csv`, 'text/csv;charset=utf-8');
  }

  async function exportExcel() {
    try {
      const excelModule = await import('exceljs');
      const ExcelJS = excelModule.default || excelModule;
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'NestHub';
      workbook.created = new Date();
      const worksheet = workbook.addWorksheet(`Bazar ${selectedMonth || 'All'}`.slice(0, 31), {
        views: [{ state: 'frozen', ySplit: 1 }],
      });
      worksheet.columns = EXPORT_COLUMNS.map((column) => ({
        header: column.label,
        key: column.key,
        width: Math.max(14, Math.min(42, column.label.length + 8)),
      }));
      filteredRows.forEach((row) => worksheet.addRow(Object.fromEntries(
        EXPORT_COLUMNS.map((column) => [
          column.key,
          typeof column.value === 'function' ? column.value(row) : row[column.key],
        ])
      )));
      worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
      worksheet.autoFilter = { from: 'A1', to: `${worksheet.getColumn(EXPORT_COLUMNS.length).letter}1` };
      const buffer = await workbook.xlsx.writeBuffer();
      downloadTextFile(buffer, `bazar-${selectedMonth || 'all'}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      setMessage({ tone: 'green', text: `${filteredRows.length} row(s) exported to Excel.` });
    } catch (error) {
      setMessage({ tone: 'red', text: error?.message || 'Excel export failed.' });
    }
  }

  async function exportPdf() {
    try {
      const { default: JsPDF } = await import('jspdf');
      const pdf = new JsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 24;
      const columns = [
        { label: 'Date', value: (row) => row.date, width: 54 },
        { label: 'Market ID', value: (row) => row.marketId, width: 68 },
        { label: 'Description', value: (row) => row.description, width: 130 },
        { label: 'Category', value: (row) => row.category, width: 70 },
        { label: 'Amount', value: (row) => `BDT ${Number(row.amount || 0).toLocaleString()}`, width: 58 },
        { label: 'Paid By', value: (row) => row.paidByName || row.paidById, width: 76 },
        { label: 'Added By', value: (row) => row.addedByName, width: 72 },
        { label: 'Notes', value: (row) => row.notes, width: 104 },
        { label: 'Attachment', value: (row) => row.attachmentUrl, width: Math.max(80, pageWidth - margin * 2 - 632) },
      ];
      let y = 52;
      const drawHeader = () => {
        pdf.setFillColor(15, 23, 42);
        pdf.rect(margin, y, pageWidth - margin * 2, 18, 'F');
        pdf.setTextColor(255, 255, 255);
        pdf.setFontSize(6.5);
        let x = margin + 3;
        columns.forEach((column) => {
          pdf.text(column.label, x, y + 12);
          x += column.width;
        });
        y += 18;
        pdf.setTextColor(30, 41, 59);
      };
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text(`NestHub Bazar Ledger - ${selectedMonth || 'All months'}`, margin, 30);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7);
      pdf.text(`${filteredRows.length} row(s) | Exported ${new Date().toLocaleString()}`, margin, 42);
      drawHeader();
      filteredRows.forEach((row, rowIndex) => {
        const cells = columns.map((column) => pdf.splitTextToSize(String(column.value(row) || ''), column.width - 6).slice(0, 3));
        const height = Math.max(16, ...cells.map((cell) => cell.length * 8 + 4));
        if (y + height > pageHeight - margin) {
          pdf.addPage();
          y = margin;
          drawHeader();
        }
        if (rowIndex % 2 === 0) {
          pdf.setFillColor(248, 250, 252);
          pdf.rect(margin, y, pageWidth - margin * 2, height, 'F');
        }
        pdf.setDrawColor(226, 232, 240);
        pdf.line(margin, y + height, pageWidth - margin, y + height);
        pdf.setFontSize(6.5);
        let x = margin + 3;
        cells.forEach((cell, index) => {
          pdf.text(cell, x, y + 10);
          x += columns[index].width;
        });
        y += height;
      });
      pdf.save(`bazar-${selectedMonth || 'all'}.pdf`);
      setMessage({ tone: 'green', text: `${filteredRows.length} row(s) exported to PDF.` });
    } catch (error) {
      setMessage({ tone: 'red', text: error?.message || 'PDF export failed.' });
    }
  }

  function resolveImportedMember(record) {
    const id = String(record['paid by id'] || record['user id'] || '').trim();
    if (id && members.some((member) => memberId(member) === id)) return id;
    const wanted = String(record['paid by'] || record.member || '').trim().toLowerCase();
    const member = members.find((item) => [
      memberId(item),
      memberName(item),
      item.email,
      item.room,
    ].some((value) => String(value || '').trim().toLowerCase() === wanted));
    return member ? memberId(member) : id;
  }

  async function importFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const extension = file.name.split('.').pop()?.toLowerCase();
      let records;
      if (extension === 'xlsx') {
        const excelModule = await import('exceljs');
        const ExcelJS = excelModule.default || excelModule;
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(await file.arrayBuffer());
        const worksheet = workbook.worksheets[0];
        if (!worksheet) throw new Error('The workbook does not contain a worksheet.');
        const matrix = [];
        worksheet.eachRow({ includeEmpty: false }, (row) => {
          matrix.push(row.values.slice(1).map((value) => {
            if (value instanceof Date) return value.toISOString().slice(0, 10);
            if (value && typeof value === 'object') {
              if (value.result !== undefined) return String(value.result ?? '');
              if (value.text !== undefined) return String(value.text ?? '');
              if (Array.isArray(value.richText)) return value.richText.map((item) => item.text || '').join('');
            }
            return String(value ?? '');
          }));
        });
        const text = matrix.map((line) => line.map((value) => String(value).replace(/\t/g, ' ')).join('\t')).join('\n');
        records = parseDelimited(text);
      } else if (extension === 'xls' || extension === 'xml') {
        records = parseSpreadsheetXml(await file.text());
      } else {
        records = parseDelimited(await file.text());
      }
      records.forEach((record, index) => {
        const paidById = resolveImportedMember(record);
        const member = members.find((item) => memberId(item) === paidById);
        addRow({
          date: record.date || record['bazar date'],
          marketId: record['market id'] || record.marketid,
          description: record.description || record.items || record.details,
          category: record.category || BAZAR_DEFAULT_CATEGORY,
          amount: record.amount || record.cost,
          amountPaisa: amountToPaisa(record.amount || record.cost),
          paidById,
          paidByName: member ? memberName(member) : record['paid by'],
          addedByName: record['added by'] || record['added by name'],
          notes: record.notes || record.reason,
          attachmentUrl: record.attachment || record['attachment url'],
          countInBazar: booleanValue(record.counted || record['count in bazar'] || 'yes'),
          place: record.place || record.market || record.location,
        }, index);
      });
      setMessage({ tone: 'blue', text: `${records.length} imported row(s) staged for review.` });
    } catch (error) {
      setMessage({ tone: 'red', text: error?.message || 'Could not import this spreadsheet.' });
    }
  }

  function toggleSort(key) {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }));
  }

  function toggleSelected(key) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelected((current) => {
      const allSelected = renderedRows.length > 0 && renderedRows.every((row) => current.has(rowKey(row)));
      const next = new Set(current);
      renderedRows.forEach((row) => {
        if (allSelected) next.delete(rowKey(row));
        else next.add(rowKey(row));
      });
      return next;
    });
  }

  function clearFilters() {
    setSearch('');
    setCategoryFilter('all');
    setMemberFilter('all');
    setCountFilter('all');
    setStatusFilter('active');
    setDateOnly(false);
  }

  const allVisibleSelected = renderedRows.length > 0 && renderedRows.every((row) => selected.has(rowKey(row)));
  const hasFilters = search || categoryFilter !== 'all' || memberFilter !== 'all' ||
    countFilter !== 'all' || statusFilter !== 'active' || dateOnly;

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <datalist id="bazar-category-options">
        {categories.map((category) => <option key={category} value={category} />)}
      </datalist>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.tsv,.xlsx,.xls,.xml,text/csv,text/tab-separated-values,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
        onChange={importFile}
        className="hidden"
      />

      <header className="border-b border-slate-200 p-3 dark:border-slate-800">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
              <h2 className="text-sm font-bold text-slate-950 dark:text-white">Bazar spreadsheet</h2>
              <StatusPill tone={draftCount ? 'amber' : 'green'}>
                {draftCount ? `${draftCount} draft${draftCount === 1 ? '' : 's'}` : 'Saved'}
              </StatusPill>
            </div>
            <p className="mt-0.5 text-[10px] text-slate-400">
              Edit cells directly. Enter saves and moves down; Tab and arrow keys move between cells.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <ToolbarButton icon={Plus} onClick={() => addRow()}>Add row</ToolbarButton>
            <ToolbarButton icon={Save} onClick={saveDrafts} disabled={!draftCount}>Save drafts</ToolbarButton>
            <ToolbarButton icon={Undo2} onClick={undo} disabled={!history.past.length}>Undo</ToolbarButton>
            <ToolbarButton icon={Redo2} onClick={redo} disabled={!history.future.length}>Redo</ToolbarButton>
            <ToolbarButton icon={ClipboardCopy} onClick={copySelectedRows} disabled={!filteredRows.length}>Copy rows</ToolbarButton>
            <ToolbarButton icon={Upload} onClick={() => fileInputRef.current?.click()}>Import Excel / CSV</ToolbarButton>
            <ToolbarButton icon={Download} onClick={exportCsv} disabled={!filteredRows.length}>CSV</ToolbarButton>
            <ToolbarButton icon={FileSpreadsheet} onClick={exportExcel} disabled={!filteredRows.length}>Excel</ToolbarButton>
            <ToolbarButton icon={FileText} onClick={exportPdf} disabled={!filteredRows.length}>PDF</ToolbarButton>
          </div>
        </div>

        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_150px_150px_160px_130px_130px_auto]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search dates, IDs, descriptions, members…"
              className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-8 text-xs text-slate-800 outline-none focus:border-blue-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} className="absolute right-2 top-2 rounded p-0.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </label>
          <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-[11px] text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
            <option value="all">All categories</option>
            {categories.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
          <select value={memberFilter} onChange={(event) => setMemberFilter(event.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-[11px] text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
            <option value="all">All members</option>
            {members.map((member) => <option key={memberId(member)} value={memberId(member)}>{memberName(member)}</option>)}
          </select>
          <select value={countFilter} onChange={(event) => setCountFilter(event.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-[11px] text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
            <option value="all">Counted + excluded</option>
            <option value="counted">Counted only</option>
            <option value="excluded">Excluded only</option>
          </select>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-[11px] text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
            <option value="active">Active</option>
            <option value="deleted">Deleted</option>
            <option value="all">All status</option>
          </select>
          <input
            type="date"
            value={selectedDate}
            onChange={(event) => onSelectedDateChange?.(event.target.value)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-[11px] text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
          />
          <ToolbarButton icon={Filter} active={dateOnly} disabled={!selectedDate} onClick={() => setDateOnly((current) => !current)}>
            Selected date
          </ToolbarButton>
        </div>

        <div className="mt-2 flex min-h-8 flex-wrap items-center gap-2">
          <span className="text-[10px] font-semibold text-slate-400">
            {renderedRows.length} rendered · {filteredRows.length} filtered · {workingRows.length} total · {selected.size} selected
          </span>
          {selectedRows.some((row) => !row.isDeleted) && (
            <ToolbarButton danger icon={Trash2} onClick={bulkDelete}>Soft delete selected</ToolbarButton>
          )}
          {selectedRows.some((row) => row.isDeleted) && (
            <ToolbarButton icon={RotateCcw} onClick={bulkRestore}>Restore selected</ToolbarButton>
          )}
          {hasFilters && <ToolbarButton icon={X} onClick={clearFilters}>Clear filters</ToolbarButton>}
          {message && (
            <span className={`ml-auto rounded-md px-2 py-1 text-[10px] font-semibold ${
              message.tone === 'red'
                ? 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                : message.tone === 'amber'
                  ? 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                  : message.tone === 'green'
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                    : 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
            }`}>{message.text}</span>
          )}
        </div>
      </header>

      {!filteredRows.length ? (
        <EmptyState
          icon={FileSpreadsheet}
          title={workingRows.length ? 'No rows match these filters' : 'No Bazar rows yet'}
          description={workingRows.length ? 'Clear or change the filters to see more transactions.' : 'Add a row or import a CSV to start the monthly sheet.'}
          action={<ToolbarButton icon={Plus} onClick={() => addRow()}>Add first row</ToolbarButton>}
        />
      ) : (
        <div className="max-h-[68dvh] overflow-auto [scrollbar-gutter:stable]">
          <table className="w-full min-w-[1900px] border-separate border-spacing-0 text-left">
            <thead className="sticky top-0 z-30 bg-slate-50 dark:bg-slate-950">
              <tr>
                <th className="sticky left-0 z-40 w-10 border-b border-r border-slate-200 bg-slate-50 px-2 py-2 text-center dark:border-slate-800 dark:bg-slate-950">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleAllVisible}
                    aria-label="Select all visible rows"
                  />
                </th>
                <th className="sticky left-10 z-40 w-12 border-b border-r border-slate-200 bg-slate-50 px-2 py-2 text-center text-[9px] font-bold uppercase tracking-wide text-slate-400 dark:border-slate-800 dark:bg-slate-950">#</th>
                {EDITABLE_COLUMNS.map((column) => (
                  <th key={column.key} className={`${column.width} border-b border-r border-slate-200 bg-slate-50 px-2 py-2 dark:border-slate-800 dark:bg-slate-950`}>
                    <button type="button" onClick={() => toggleSort(column.key)} className="flex w-full items-center justify-between gap-1 text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
                      {column.label}
                      {sort.key === column.key && <span>{sort.direction === 'asc' ? '↑' : '↓'}</span>}
                    </button>
                  </th>
                ))}
                <th className="sticky right-0 z-40 min-w-28 border-b border-l border-slate-200 bg-slate-50 px-2 py-2 text-right text-[9px] font-bold uppercase tracking-wide text-slate-400 dark:border-slate-800 dark:bg-slate-950">Actions</th>
              </tr>
            </thead>
            <tbody>
              {renderedRows.map((row, rowIndex) => {
                const key = rowKey(row);
                const isSaving = saving.has(key);
                const isDraft = Boolean(drafts[key]);
                return (
                  <tr key={key} className={`${row.isDeleted ? 'bg-rose-50/40 dark:bg-rose-950/15' : rowIndex % 2 ? 'bg-slate-50/35 dark:bg-slate-950/30' : 'bg-white dark:bg-slate-900'} hover:bg-blue-50/40 dark:hover:bg-blue-950/15`}>
                    <td className="sticky left-0 z-20 w-10 border-b border-r border-slate-100 bg-inherit px-2 py-1.5 text-center dark:border-slate-800">
                      <input type="checkbox" checked={selected.has(key)} onChange={() => toggleSelected(key)} aria-label={`Select ${row.marketId}`} />
                    </td>
                    <td className="sticky left-10 z-20 w-12 border-b border-r border-slate-100 bg-inherit px-2 py-1.5 text-center dark:border-slate-800">
                      <span className="font-mono text-[9px] text-slate-400">{rowIndex + 1}</span>
                      {isDraft && <span className="mx-auto mt-0.5 block h-1.5 w-1.5 rounded-full bg-amber-400" title="Local draft" />}
                    </td>
                    {EDITABLE_COLUMNS.map((column, columnIndex) => (
                      <td key={column.key} className={`${column.width} border-b border-r border-slate-100 px-1 py-1 dark:border-slate-800`}>
                        <GridEditor
                          row={row}
                          rowIndex={rowIndex}
                          column={column}
                          columnIndex={columnIndex}
                          members={members}
                          errors={rowErrors[key]}
                          disabled={isSaving || row.isDeleted || column.readOnly}
                          onChange={(value) => updateCell(row, column.key, value)}
                          onBlur={() => isDraft && commitRow(row)}
                          onKeyDown={(event) => handleCellKeyDown(event, row, rowIndex, columnIndex)}
                          onPaste={(event) => handlePaste(event, rowIndex, columnIndex)}
                        />
                      </td>
                    ))}
                    <td className="sticky right-0 z-20 border-b border-l border-slate-100 bg-inherit px-2 py-1.5 text-right dark:border-slate-800">
                      <div className="flex items-center justify-end gap-1">
                        {isDraft && !row.isDeleted && (
                          <button type="button" disabled={isSaving} onClick={() => commitRow(row)} className="rounded-md p-1.5 text-blue-600 hover:bg-blue-50 disabled:opacity-40 dark:hover:bg-blue-950" title="Save row">
                            {isSaving ? <span className="text-[9px]">Saving…</span> : <Check className="h-3.5 w-3.5" />}
                          </button>
                        )}
                        {row.isDeleted ? (
                          <button type="button" onClick={() => restoreRow(row)} className="rounded-md p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950" title="Restore row">
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>
                        ) : (
                          <button type="button" onClick={() => deleteRow(row)} className="rounded-md p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950" title="Soft delete row">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <footer className="flex flex-col gap-2 border-t border-slate-200 bg-slate-50 px-3 py-2 text-[10px] text-slate-400 dark:border-slate-800 dark:bg-slate-950 sm:flex-row sm:items-center sm:justify-between">
        <span>Drafts auto-save in this browser. Saving data never sends a notification.</span>
        <span className="flex flex-wrap items-center justify-end gap-2">
          {renderedRows.length < filteredRows.length && (
            <button type="button" onClick={() => setRenderLimit((current) => current + 200)} className="rounded-md border border-slate-200 bg-white px-2 py-1 font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
              Load 200 more
            </button>
          )}
          <span>Excel/CSV import · Excel/PDF/CSV export · TSV copy/paste</span>
        </span>
      </footer>
    </section>
  );
}

export { EDITABLE_COLUMNS as BAZAR_SPREADSHEET_COLUMNS };
