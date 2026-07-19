'use client';

import Image from 'next/image';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AlertTriangle,
  ClipboardCopy,
  Download,
  Eraser,
  FileSpreadsheet,
  FileText,
  Loader2,
  Search,
  Sigma,
  Trash2,
  Upload,
  UserRoundCheck,
  Users,
  Utensils,
  X,
} from 'lucide-react';
import { mealTotal } from '@/lib/mealRate';
import {
  downloadTextFile,
  finiteNumber,
  gridNavigationTarget,
  parseDelimited,
  parseSpreadsheetXml,
} from '@/lib/spreadsheet';
import {
  EmptyState,
  StatusPill,
  ToolbarButton,
  ViewTabs,
} from '@/components/admin/ui/AdminUI';

const METRICS = [
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'guestMeal', label: 'Guest' },
];

function getMemberId(member) {
  return member?.id || member?.uid || member?.userId || '';
}

function getMemberName(member) {
  return (
    member?.name ||
    member?.displayName ||
    member?.fullName ||
    member?.email ||
    'Member'
  );
}

function getMemberPhoto(member) {
  return member?.photoURL || member?.photo || member?.avatar || member?.image || '';
}

function getMealMemberId(meal) {
  return meal?.userId || meal?.memberId || meal?.uid || '';
}

function isCurrentMeal(meal) {
  return meal?.isDeleted !== true && String(meal?.status || '').toLowerCase() !== 'deleted';
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
    weekday: Number.isNaN(value.getTime())
      ? ''
      : value.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 2),
  };
}

function timestampValue(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (Number.isFinite(value.seconds)) return value.seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizedMealValue(value) {
  const number = finiteNumber(value, Number.NaN);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Number(number.toFixed(2)));
}

function formatMealValue(value) {
  const number = normalizedMealValue(value) ?? 0;
  return Number.isInteger(number) ? String(number) : String(number);
}

function entryKey(memberId, date) {
  return `${memberId}::${date}`;
}

function cellKey(memberId, date, metric) {
  return `${entryKey(memberId, date)}::${metric}`;
}

function filledCellClass(metric) {
  if (metric === 'guestMeal') return 'bg-violet-50/90 dark:bg-violet-950/30';
  if (metric === 'dinner') return 'bg-indigo-50/90 dark:bg-indigo-950/30';
  return 'bg-emerald-50/90 dark:bg-emerald-950/30';
}

function filledTextClass(metric) {
  if (metric === 'guestMeal') return 'text-violet-800 dark:text-violet-200';
  if (metric === 'dinner') return 'text-indigo-800 dark:text-indigo-200';
  return 'text-emerald-800 dark:text-emerald-200';
}

function memberInitial(member) {
  return getMemberName(member).charAt(0).toUpperCase();
}

function activeRange(dates, start, end) {
  if (!dates.length) return [];
  const first = start && dates.includes(start) ? start : dates[0];
  const last = end && dates.includes(end) ? end : dates[dates.length - 1];
  const lower = first <= last ? first : last;
  const upper = first <= last ? last : first;
  return dates.filter((date) => date >= lower && date <= upper);
}

function buildNextEntry({ existing, memberId, date, month, metric, value, values }) {
  const next = {
    ...(existing || {}),
    userId: memberId,
    date,
    month,
    lunch: values.lunch,
    dinner: values.dinner,
    guestMeal: values.guestMeal,
    [metric]: value,
  };

  next.totalMeal = mealTotal(next);
  return next;
}

export default function MealSpreadsheet({
  members = [],
  meals = [],
  month = '',
  onUpsert,
  onBulkUpsert,
  onSoftDelete,
  onChanges,
}) {
  const dates = useMemo(() => monthDates(month), [month]);
  const firstDate = dates[0] || '';
  const lastDate = dates[dates.length - 1] || '';

  const [metric, setMetric] = useState('lunch');
  const [search, setSearch] = useState('');
  const [selectedMembers, setSelectedMembers] = useState(() => new Set());
  const [rangeStart, setRangeStart] = useState(firstDate);
  const [rangeEnd, setRangeEnd] = useState(lastDate);
  const [bulkValue, setBulkValue] = useState('1');
  const [draftValues, setDraftValues] = useState({});
  const [committedValues, setCommittedValues] = useState({});
  const [activeCell, setActiveCell] = useState(null);
  const [savingCells, setSavingCells] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const inputRefs = useRef(new Map());
  const inFlightValues = useRef(new Map());
  const fileInputRef = useRef(null);

  useEffect(() => {
    setRangeStart(firstDate);
    setRangeEnd(lastDate);
    setSelectedMembers(new Set());
    setDraftValues({});
    setCommittedValues({});
    setActiveCell(null);
    inFlightValues.current.clear();
  }, [firstDate, lastDate]);

  const mealIndex = useMemo(() => {
    const groups = new Map();

    meals.forEach((meal) => {
      if (!isCurrentMeal(meal)) return;
      if (month && String(meal?.month || String(meal?.date || '').slice(0, 7)) !== month) return;

      const memberId = getMealMemberId(meal);
      const date = String(meal?.date || '');
      if (!memberId || !date) return;

      const key = entryKey(memberId, date);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(meal);
    });

    const index = new Map();
    groups.forEach((rows, key) => {
      const sorted = [...rows].sort((a, b) => {
        const versionDifference = Number(b.version || 0) - Number(a.version || 0);
        if (versionDifference) return versionDifference;
        const aTime = timestampValue(a.updatedAt) || timestampValue(a.createdAt);
        const bTime = timestampValue(b.updatedAt) || timestampValue(b.createdAt);
        return bTime - aTime;
      });
      index.set(key, {
        primary: sorted[0],
        rows: sorted,
        duplicateCount: Math.max(0, sorted.length - 1),
      });
    });

    return index;
  }, [meals, month]);

  const duplicateGroups = useMemo(
    () => [...mealIndex.entries()].filter(([, group]) => group.duplicateCount > 0),
    [mealIndex]
  );
  const duplicateRows = useMemo(
    () => duplicateGroups.reduce((sum, [, group]) => sum + group.duplicateCount, 0),
    [duplicateGroups]
  );

  const normalizedMembers = useMemo(() => (
    members
      .filter((member) => getMemberId(member))
      .map((member) => ({ ...member, _mealMemberId: getMemberId(member) }))
  ), [members]);

  const filteredMembers = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return normalizedMembers;
    return normalizedMembers.filter((member) => (
      [getMemberName(member), member.room, member.email]
        .join(' ')
        .toLowerCase()
        .includes(term)
    ));
  }, [normalizedMembers, search]);

  const rangeDates = useMemo(
    () => activeRange(dates, rangeStart, rangeEnd),
    [dates, rangeEnd, rangeStart]
  );

  const getPrimary = useCallback((memberId, date) => (
    mealIndex.get(entryKey(memberId, date))?.primary || null
  ), [mealIndex]);

  useEffect(() => {
    const reconciled = Object.entries(committedValues).filter(([key, optimisticValue]) => {
      const parts = key.split('::');
      const field = parts.pop();
      const date = parts.pop();
      const memberId = parts.join('::');
      const snapshotValue = normalizedMealValue(getPrimary(memberId, date)?.[field]) ?? 0;
      return snapshotValue === optimisticValue;
    }).map(([key]) => key);
    if (!reconciled.length) return;
    const reconciledSet = new Set(reconciled);
    setCommittedValues((current) => Object.fromEntries(
      Object.entries(current).filter(([key]) => !reconciledSet.has(key))
    ));
    setDraftValues((current) => Object.fromEntries(
      Object.entries(current).filter(([key]) => !reconciledSet.has(key))
    ));
  }, [committedValues, getPrimary]);

  const getCellValue = useCallback((memberId, date, field) => {
    const key = cellKey(memberId, date, field);
    if (Object.prototype.hasOwnProperty.call(draftValues, key)) {
      return normalizedMealValue(draftValues[key]) ?? 0;
    }
    if (Object.prototype.hasOwnProperty.call(committedValues, key)) return committedValues[key];
    return normalizedMealValue(getPrimary(memberId, date)?.[field]) ?? 0;
  }, [committedValues, draftValues, getPrimary]);

  const summary = useMemo(() => {
    const byMember = new Map();
    const byDate = new Map(dates.map((date) => [date, 0]));
    const house = { lunch: 0, dinner: 0, guestMeal: 0, total: 0 };

    normalizedMembers.forEach((member) => {
      const totals = { lunch: 0, dinner: 0, guestMeal: 0, total: 0 };
      dates.forEach((date) => {
        METRICS.forEach(({ value: field }) => {
          const value = getCellValue(member._mealMemberId, date, field);
          totals[field] += value;
          house[field] += value;
          if (field === metric) byDate.set(date, (byDate.get(date) || 0) + value);
        });
      });
      totals.total = totals.lunch + totals.dinner + totals.guestMeal;
      house.total += totals.total;
      byMember.set(member._mealMemberId, totals);
    });

    return { byMember, byDate, house };
  }, [dates, getCellValue, metric, normalizedMembers]);

  const selectedCount = selectedMembers.size;
  const allVisibleSelected = filteredMembers.length > 0 && filteredMembers.every(
    (member) => selectedMembers.has(member._mealMemberId)
  );

  const setCellDraft = (memberId, date, field, value) => {
    const key = cellKey(memberId, date, field);
    setDraftValues((current) => ({ ...current, [key]: value }));
  };

  const setCellSaving = (key, saving) => {
    setSavingCells((current) => {
      const next = new Set(current);
      if (saving) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const makeEntryAndChange = useCallback((member, date, field, value) => {
    const memberId = member._mealMemberId;
    const existing = getPrimary(memberId, date);
    const key = cellKey(memberId, date, field);
    const previousValue = Object.prototype.hasOwnProperty.call(committedValues, key)
      ? committedValues[key]
      : normalizedMealValue(existing?.[field]) ?? 0;
    const values = Object.fromEntries(METRICS.map(({ value: mealField }) => [
      mealField,
      mealField === field ? value : getCellValue(memberId, date, mealField),
    ]));
    const entry = buildNextEntry({
      existing,
      memberId,
      date,
      month,
      metric: field,
      value,
      values,
    });
    const change = {
      id: `${key}-${Date.now()}`,
      type: existing ? 'meal_updated' : 'meal_created',
      module: 'meals',
      mealId: existing?.id || '',
      userId: memberId,
      memberName: getMemberName(member),
      date,
      month,
      field,
      previousValue,
      value,
      label: `${getMemberName(member)} · ${date} · ${METRICS.find((item) => item.value === field)?.label}: ${formatMealValue(previousValue)} → ${formatMealValue(value)}`,
      createdAt: new Date().toISOString(),
    };

    return { entry, change, previousValue, key };
  }, [committedValues, getCellValue, getPrimary, month]);

  const commitCell = useCallback(async (member, date, field) => {
    const memberId = member._mealMemberId;
    const key = cellKey(memberId, date, field);
    const rawValue = Object.prototype.hasOwnProperty.call(draftValues, key)
      ? draftValues[key]
      : getCellValue(memberId, date, field);
    const value = normalizedMealValue(rawValue);

    if (value === null) {
      setMessage({ tone: 'red', text: 'Meal values must be valid numbers.' });
      return;
    }

    const currentValue = Object.prototype.hasOwnProperty.call(committedValues, key)
      ? committedValues[key]
      : normalizedMealValue(getPrimary(memberId, date)?.[field]) ?? 0;

    if (value === currentValue || inFlightValues.current.get(key) === value) {
      setCellDraft(memberId, date, field, formatMealValue(value));
      return;
    }

    const { entry, change, previousValue } = makeEntryAndChange(member, date, field, value);
    inFlightValues.current.set(key, value);
    setCommittedValues((current) => ({ ...current, [key]: value }));
    setCellDraft(memberId, date, field, formatMealValue(value));
    setCellSaving(key, true);
    setMessage(null);

    try {
      await onUpsert?.(entry, {
        key: entryKey(memberId, date),
        field,
        previousValue,
        value,
        change,
      });
      onChanges?.([change]);
    } catch (error) {
      setCommittedValues((current) => ({ ...current, [key]: previousValue }));
      setCellDraft(memberId, date, field, formatMealValue(previousValue));
      setMessage({ tone: 'red', text: error?.message || 'Meal cell could not be saved.' });
    } finally {
      inFlightValues.current.delete(key);
      setCellSaving(key, false);
    }
  }, [committedValues, draftValues, getCellValue, getPrimary, makeEntryAndChange, onChanges, onUpsert]);

  const runBulkUpsert = useCallback(async (cells, reason = 'bulk_fill') => {
    const unique = new Map();
    cells.forEach((cell) => {
      const memberId = cell.member?._mealMemberId;
      const value = normalizedMealValue(cell.value);
      if (!memberId || !cell.date || value === null) return;
      unique.set(cellKey(memberId, cell.date, metric), { ...cell, value });
    });

    const prepared = [...unique.values()]
      .map((cell) => makeEntryAndChange(cell.member, cell.date, metric, cell.value))
      .filter(({ key, change }) => {
        const current = Object.prototype.hasOwnProperty.call(committedValues, key)
          ? committedValues[key]
          : change.previousValue;
        return current !== change.value;
      });

    if (!prepared.length) {
      setMessage({ tone: 'amber', text: 'No meal values changed.' });
      return;
    }

    const previous = new Map(prepared.map((item) => [item.key, item.previousValue]));
    setCommittedValues((current) => {
      const next = { ...current };
      prepared.forEach(({ key, change }) => {
        next[key] = change.value;
      });
      return next;
    });
    prepared.forEach(({ key, change }) => {
      inFlightValues.current.set(key, change.value);
    });
    setDraftValues((current) => {
      const next = { ...current };
      prepared.forEach(({ key, change }) => {
        next[key] = formatMealValue(change.value);
      });
      return next;
    });
    setBulkBusy(true);
    setMessage(null);

    try {
      const entries = prepared.map((item) => item.entry);
      const changes = prepared.map((item) => ({ ...item.change, reason }));
      if (onBulkUpsert) {
        await onBulkUpsert(entries, { field: metric, reason, changes });
      } else {
        await Promise.all(entries.map((entry, index) => onUpsert?.(entry, {
          key: entryKey(entry.userId, entry.date),
          field: metric,
          reason,
          change: changes[index],
        })));
      }
      onChanges?.(changes);
      setMessage({ tone: 'green', text: `${changes.length} meal cell${changes.length === 1 ? '' : 's'} saved.` });
    } catch (error) {
      const partialCommitted = Math.max(0, Number(error?.partialCommitted || 0));
      setCommittedValues((current) => {
        const next = { ...current };
        prepared.forEach(({ key }, index) => {
          if (index < partialCommitted) delete next[key];
          else next[key] = previous.get(key) ?? 0;
        });
        return next;
      });
      setDraftValues((current) => {
        const next = { ...current };
        prepared.forEach(({ key }, index) => {
          if (index < partialCommitted) delete next[key];
          else {
            const value = previous.get(key) ?? 0;
            next[key] = formatMealValue(value);
          }
        });
        return next;
      });
      setMessage({ tone: 'red', text: error?.message || 'Bulk meal update failed.' });
    } finally {
      prepared.forEach(({ key }) => inFlightValues.current.delete(key));
      setBulkBusy(false);
    }
  }, [committedValues, makeEntryAndChange, metric, onBulkUpsert, onChanges, onUpsert]);

  const handleCellKeyDown = (event, member, rowIndex, columnIndex, date) => {
    if (event.key === 'Escape') {
      const value = getPrimary(member._mealMemberId, date)?.[metric] ?? 0;
      setCellDraft(member._mealMemberId, date, metric, formatMealValue(value));
      event.currentTarget.blur();
      return;
    }

    const target = gridNavigationTarget(
      event,
      rowIndex,
      columnIndex,
      filteredMembers.length,
      dates.length
    );
    if (!target) return;

    event.preventDefault();
    void commitCell(member, date, metric);
    requestAnimationFrame(() => {
      const nextMember = filteredMembers[target.row];
      const nextDate = dates[target.column];
      inputRefs.current.get(cellKey(nextMember?._mealMemberId, nextDate, metric))?.focus();
      inputRefs.current.get(cellKey(nextMember?._mealMemberId, nextDate, metric))?.select();
    });
  };

  const toggleMember = (memberId) => {
    setSelectedMembers((current) => {
      const next = new Set(current);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelectedMembers((current) => {
      const next = new Set(current);
      if (allVisibleSelected) {
        filteredMembers.forEach((member) => next.delete(member._mealMemberId));
      } else {
        filteredMembers.forEach((member) => next.add(member._mealMemberId));
      }
      return next;
    });
  };

  const handleBulkFill = () => {
    const value = normalizedMealValue(bulkValue);
    if (value === null) {
      setMessage({ tone: 'red', text: 'Enter a valid bulk meal value.' });
      return;
    }
    const selectedRows = normalizedMembers.filter((member) => selectedMembers.has(member._mealMemberId));
    if (!selectedRows.length || !rangeDates.length) {
      setMessage({ tone: 'amber', text: 'Select members and a date range first.' });
      return;
    }

    void runBulkUpsert(
      selectedRows.flatMap((member) => rangeDates.map((date) => ({ member, date, value }))),
      'bulk_fill'
    );
  };

  const handlePaste = (event, startRow, startColumn) => {
    const text = event.clipboardData?.getData('text/plain') || '';
    if (!text) return;
    event.preventDefault();

    const matrix = text
      .replace(/\r/g, '')
      .split('\n')
      .filter((row, index, rows) => index < rows.length - 1 || row !== '')
      .map((row) => row.split('\t'));
    const invalid = matrix.some((row) => row.some((value) => normalizedMealValue(value || 0) === null));
    if (invalid) {
      setMessage({ tone: 'red', text: 'Paste contains an invalid meal value.' });
      return;
    }

    const cells = [];
    matrix.forEach((row, rowOffset) => {
      row.forEach((value, columnOffset) => {
        const member = filteredMembers[startRow + rowOffset];
        const date = dates[startColumn + columnOffset];
        if (member && date) cells.push({ member, date, value: value || 0 });
      });
    });
    void runBulkUpsert(cells, 'paste_tsv');
  };

  const copySelectedRange = async () => {
    const rows = normalizedMembers.filter((member) => selectedMembers.has(member._mealMemberId));
    if (!rows.length || !rangeDates.length) {
      setMessage({ tone: 'amber', text: 'Select members and a date range to copy.' });
      return;
    }

    const text = rows.map((member) => (
      rangeDates
        .map((date) => formatMealValue(getCellValue(member._mealMemberId, date, metric)))
        .join('\t')
    )).join('\n');

    try {
      await navigator.clipboard.writeText(text);
      setMessage({ tone: 'green', text: `Copied ${rows.length} × ${rangeDates.length} cells as TSV.` });
    } catch {
      setMessage({ tone: 'red', text: 'Clipboard permission was not available.' });
    }
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
        { header: 'Member ID', key: 'memberId', width: 26 },
        { header: 'Member', key: 'member', width: 24 },
        { header: 'Room', key: 'room', width: 12 },
        { header: 'Date', key: 'date', width: 14 },
        { header: 'Lunch', key: 'lunch', width: 11 },
        { header: 'Dinner', key: 'dinner', width: 11 },
        { header: 'Guest Meals', key: 'guestMeal', width: 13 },
        { header: 'Total', key: 'total', width: 11 },
      ];
      normalizedMembers.forEach((member) => {
        dates.forEach((date) => {
          const lunch = getCellValue(member._mealMemberId, date, 'lunch');
          const dinner = getCellValue(member._mealMemberId, date, 'dinner');
          const guestMeal = getCellValue(member._mealMemberId, date, 'guestMeal');
          worksheet.addRow({
            memberId: member._mealMemberId,
            member: getMemberName(member),
            room: member.room || '',
            date,
            lunch,
            dinner,
            guestMeal,
            total: lunch + dinner + guestMeal,
          });
        });
      });
      worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
      worksheet.autoFilter = { from: 'A1', to: 'H1' };
      const buffer = await workbook.xlsx.writeBuffer();
      downloadTextFile(buffer, `meals-${month}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      setMessage({ tone: 'green', text: 'Monthly meal sheet exported to Excel.' });
    } catch (error) {
      setMessage({ tone: 'red', text: error?.message || 'Excel export failed.' });
    }
  };

  const exportPdf = async () => {
    try {
      const { default: JsPDF } = await import('jspdf');
      const pdf = new JsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
      const columns = [
        { label: 'Member', width: 205 },
        { label: 'Room', width: 58 },
        { label: 'Lunch', width: 58 },
        { label: 'Dinner', width: 58 },
        { label: 'Guest', width: 58 },
        { label: 'Total', width: 58 },
      ];
      const margin = 28;
      const pageHeight = pdf.internal.pageSize.getHeight();
      let y = 62;
      const drawHeader = () => {
        pdf.setFillColor(15, 23, 42);
        pdf.rect(margin, y, 495, 20, 'F');
        pdf.setTextColor(255, 255, 255);
        pdf.setFontSize(7);
        let x = margin + 4;
        columns.forEach((column) => {
          pdf.text(column.label, x, y + 13);
          x += column.width;
        });
        pdf.setTextColor(30, 41, 59);
        y += 20;
      };
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(15);
      pdf.text(`NestHub Monthly Meal Summary - ${month}`, margin, 32);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.text(`Total meals: ${summary.house.total} | Lunch: ${summary.house.lunch} | Dinner: ${summary.house.dinner} | Guest: ${summary.house.guestMeal}`, margin, 47);
      drawHeader();
      normalizedMembers.forEach((member, index) => {
        if (y + 19 > pageHeight - margin) {
          pdf.addPage();
          y = margin;
          drawHeader();
        }
        const totals = summary.byMember.get(member._mealMemberId) || { lunch: 0, dinner: 0, guestMeal: 0, total: 0 };
        if (index % 2 === 0) {
          pdf.setFillColor(248, 250, 252);
          pdf.rect(margin, y, 495, 19, 'F');
        }
        const values = [getMemberName(member), member.room || '', totals.lunch, totals.dinner, totals.guestMeal, totals.total];
        let x = margin + 4;
        pdf.setFontSize(7);
        values.forEach((value, valueIndex) => {
          const rendered = pdf.splitTextToSize(String(value), columns[valueIndex].width - 7)[0] || '';
          pdf.text(rendered, x, y + 12);
          x += columns[valueIndex].width;
        });
        y += 19;
      });
      pdf.save(`meals-${month}.pdf`);
      setMessage({ tone: 'green', text: 'Monthly meal summary exported to PDF.' });
    } catch (error) {
      setMessage({ tone: 'red', text: error?.message || 'PDF export failed.' });
    }
  };

  const importSpreadsheet = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBulkBusy(true);
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
            if (value instanceof Date) {
              return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
            }
            if (value && typeof value === 'object') {
              if (value.result !== undefined) return String(value.result ?? '');
              if (value.text !== undefined) return String(value.text ?? '');
              if (Array.isArray(value.richText)) return value.richText.map((item) => item.text || '').join('');
            }
            return String(value ?? '');
          }));
        });
        records = parseDelimited(matrix.map((row) => row.join('\t')).join('\n'));
      } else if (extension === 'xls' || extension === 'xml') {
        records = parseSpreadsheetXml(await file.text());
      } else {
        records = parseDelimited(await file.text());
      }

      const prepared = new Map();
      records.forEach((record, index) => {
        const wantedId = String(record['member id'] || record['user id'] || '').trim();
        const wantedName = String(record.member || record.name || record.email || record.room || '').trim().toLowerCase();
        const member = normalizedMembers.find((item) => item._mealMemberId === wantedId) || normalizedMembers.find((item) => (
          [getMemberName(item), item.email, item.room].some((value) => String(value || '').trim().toLowerCase() === wantedName)
        ));
        const date = String(record.date || '').trim();
        if (!member) throw new Error(`Row ${index + 2}: member could not be matched.`);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date.slice(0, 7) !== month) throw new Error(`Row ${index + 2}: date must be inside ${month}.`);
        const lunch = normalizedMealValue(record.lunch ?? 0);
        const dinner = normalizedMealValue(record.dinner ?? 0);
        const guestMeal = normalizedMealValue(record['guest meals'] ?? record.guest ?? record['guest meal'] ?? 0);
        if ([lunch, dinner, guestMeal].some((value) => value === null)) throw new Error(`Row ${index + 2}: meal values must be valid numbers.`);
        const existing = getPrimary(member._mealMemberId, date);
        prepared.set(entryKey(member._mealMemberId, date), {
          ...(existing || {}),
          userId: member._mealMemberId,
          date,
          month,
          lunch,
          dinner,
          guestMeal,
          totalMeal: lunch + dinner + guestMeal,
          _member: member,
        });
      });
      const entries = [...prepared.values()];
      if (!entries.length) throw new Error('The spreadsheet contains no meal rows.');
      const changes = entries.map((entry, index) => ({
        id: `meal-import-${index}-${Date.now()}`,
        type: entry.id ? 'meal_updated' : 'meal_created',
        userId: entry.userId,
        date: entry.date,
        label: `${getMemberName(entry._member)} · ${entry.date} imported from ${file.name}`,
      }));
      const cleanEntries = entries.map(({ _member, ...entry }) => entry);
      if (onBulkUpsert) await onBulkUpsert(cleanEntries, { reason: 'excel_import', changes });
      else await Promise.all(cleanEntries.map((entry, index) => onUpsert?.(entry, { reason: 'excel_import', change: changes[index] })));
      setCommittedValues((current) => {
        const next = { ...current };
        cleanEntries.forEach((entry) => METRICS.forEach(({ value: field }) => {
          next[cellKey(entry.userId, entry.date, field)] = entry[field];
        }));
        return next;
      });
      onChanges?.(changes);
      setMessage({ tone: 'green', text: `${cleanEntries.length} meal row(s) imported and saved.` });
    } catch (error) {
      setMessage({ tone: 'red', text: error?.message || 'Spreadsheet import failed.' });
    } finally {
      setBulkBusy(false);
    }
  };

  const softDeleteSelectedRange = async () => {
    if (!onSoftDelete || !selectedMembers.size || !rangeDates.length) return;
    const targets = [];
    selectedMembers.forEach((memberId) => {
      rangeDates.forEach((date) => {
        const group = mealIndex.get(entryKey(memberId, date));
        if (group) targets.push(...group.rows);
      });
    });
    const uniqueTargets = [...new Map(targets.map((meal) => [meal.id || `${getMealMemberId(meal)}-${meal.date}`, meal])).values()];
    if (!uniqueTargets.length) {
      setMessage({ tone: 'amber', text: 'The selected range has no saved entries.' });
      return;
    }
    if (!window.confirm(`Move ${uniqueTargets.length} meal entr${uniqueTargets.length === 1 ? 'y' : 'ies'} to history?`)) return;

    setBulkBusy(true);
    setMessage(null);
    try {
      await Promise.all(uniqueTargets.map((meal) => onSoftDelete(meal, {
        reason: 'spreadsheet_range_delete',
        month,
      })));
      const clearedKeys = uniqueTargets.flatMap((meal) => (
        METRICS.map(({ value: field }) => cellKey(getMealMemberId(meal), meal.date, field))
      ));
      setCommittedValues((current) => {
        const next = { ...current };
        clearedKeys.forEach((key) => {
          next[key] = 0;
        });
        return next;
      });
      setDraftValues((current) => {
        const next = { ...current };
        clearedKeys.forEach((key) => {
          next[key] = '0';
        });
        return next;
      });
      const changes = uniqueTargets.map((meal) => ({
        id: `meal-delete-${meal.id || `${getMealMemberId(meal)}-${meal.date}`}-${Date.now()}`,
        type: 'meal_deleted',
        module: 'meals',
        mealId: meal.id || '',
        userId: getMealMemberId(meal),
        date: meal.date,
        month,
        label: `Meal entry moved to history · ${meal.date}`,
        createdAt: new Date().toISOString(),
      }));
      onChanges?.(changes);
      setMessage({ tone: 'green', text: `${uniqueTargets.length} meal entr${uniqueTargets.length === 1 ? 'y' : 'ies'} moved to history.` });
    } catch (error) {
      setMessage({ tone: 'red', text: error?.message || 'Selected entries could not be deleted.' });
    } finally {
      setBulkBusy(false);
    }
  };

  const selectedMetricTotal = summary.house[metric] || 0;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.xml,.csv,.tsv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,text/tab-separated-values" onChange={importSpreadsheet} className="hidden" />
      <header className="border-b border-slate-200 p-3 dark:border-slate-800 sm:p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-orange-50 text-orange-600 dark:bg-orange-950 dark:text-orange-300">
              <Utensils className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-bold text-slate-950 dark:text-white">Monthly meal sheet</h2>
                <StatusPill tone="blue">{month || 'No month'}</StatusPill>
                <StatusPill tone="green">Manual notification only</StatusPill>
              </div>
              <p className="mt-0.5 text-[11px] text-slate-400">Member rows, date columns, fractional meals, and spreadsheet keyboard controls.</p>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
            <ViewTabs value={metric} onChange={setMetric} items={METRICS} />
            <div className="flex flex-wrap gap-1.5">
              <ToolbarButton icon={Upload} onClick={() => fileInputRef.current?.click()} disabled={bulkBusy}>Import</ToolbarButton>
              <ToolbarButton icon={FileSpreadsheet} onClick={exportExcel} disabled={bulkBusy || !normalizedMembers.length}>Excel</ToolbarButton>
              <ToolbarButton icon={FileText} onClick={exportPdf} disabled={bulkBusy || !normalizedMembers.length}>PDF</ToolbarButton>
              <ToolbarButton icon={Download} onClick={copySelectedRange} disabled={bulkBusy || !selectedCount || !rangeDates.length}>TSV</ToolbarButton>
            </div>
            <label className="relative min-w-0 sm:w-56">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search member or room"
                className="h-9 w-full rounded-xl border border-slate-200 bg-white pl-8 pr-8 text-xs font-medium text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:ring-blue-950"
              />
              {search && (
                <button type="button" onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
                  <X className="h-3 w-3" />
                </button>
              )}
            </label>
          </div>
        </div>

        <div className="mt-3 flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-800 dark:bg-slate-950 lg:flex-row lg:items-end">
          <div className="grid flex-1 grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-end">
            <label className="min-w-0">
              <span className="mb-1 block text-[9px] font-bold uppercase tracking-wide text-slate-400">From</span>
              <input type="date" min={firstDate} max={lastDate} value={rangeStart} onChange={(event) => setRangeStart(event.target.value)} className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 sm:w-36" />
            </label>
            <label className="min-w-0">
              <span className="mb-1 block text-[9px] font-bold uppercase tracking-wide text-slate-400">To</span>
              <input type="date" min={firstDate} max={lastDate} value={rangeEnd} onChange={(event) => setRangeEnd(event.target.value)} className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 sm:w-36" />
            </label>
            <label className="min-w-0">
              <span className="mb-1 block text-[9px] font-bold uppercase tracking-wide text-slate-400">Fill value</span>
              <input type="number" min="0" step="any" inputMode="decimal" value={bulkValue} onChange={(event) => setBulkValue(event.target.value)} className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-center text-xs font-bold text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-white sm:w-24" />
            </label>
            <div className="col-span-2 flex flex-wrap gap-1.5 sm:col-span-1">
              <ToolbarButton icon={Eraser} onClick={handleBulkFill} disabled={bulkBusy || !selectedCount || !rangeDates.length}>
                Fill {selectedCount ? `${selectedCount} row${selectedCount === 1 ? '' : 's'}` : 'range'}
              </ToolbarButton>
              <ToolbarButton icon={ClipboardCopy} onClick={copySelectedRange} disabled={bulkBusy || !selectedCount || !rangeDates.length}>
                Copy TSV
              </ToolbarButton>
              <ToolbarButton icon={Trash2} danger onClick={softDeleteSelectedRange} disabled={bulkBusy || !onSoftDelete || !selectedCount}>
                Delete entries
              </ToolbarButton>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 lg:justify-end">
            <span className="text-[10px] font-semibold text-slate-400">{selectedCount} selected · {rangeDates.length} day{rangeDates.length === 1 ? '' : 's'}</span>
            {bulkBusy && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
          </div>
        </div>

        {message && (
          <div className={`mt-2 flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-[11px] font-semibold ${
            message.tone === 'red'
              ? 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
              : message.tone === 'amber'
                ? 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
          }`}>
            <span>{message.text}</span>
            <button type="button" onClick={() => setMessage(null)}><X className="h-3 w-3" /></button>
          </div>
        )}

        {duplicateRows > 0 && (
          <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900 dark:bg-amber-950/40">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none text-amber-600" />
            <p className="text-[11px] leading-4 text-amber-800 dark:text-amber-200">
              {duplicateRows} duplicate row{duplicateRows === 1 ? '' : 's'} across {duplicateGroups.length} member/date cell{duplicateGroups.length === 1 ? '' : 's'}. The newest row is shown; select the affected range and use Delete entries to move every copy to history before re-entering it.
            </p>
          </div>
        )}
      </header>

      {!dates.length || !normalizedMembers.length ? (
        <EmptyState
          icon={Users}
          title={!dates.length ? 'Choose a valid month' : 'No members available'}
          description={!dates.length ? 'The spreadsheet expects a month in YYYY-MM format.' : 'Add active members before recording meals.'}
        />
      ) : (
        <div className="max-h-[68dvh] overflow-auto [scrollbar-color:rgb(203_213_225)_transparent]">
          <table className="w-max min-w-full border-separate border-spacing-0 text-xs" role="grid" aria-label={`${month} meal spreadsheet, ${metric} mode`}>
            <thead className="sticky top-0 z-30">
              <tr>
                <th className="sticky left-0 z-40 min-w-52 border-b border-r border-slate-200 bg-slate-100 px-3 py-2 text-left dark:border-slate-700 dark:bg-slate-800">
                  <div className="flex items-center gap-2">
                    <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} aria-label="Select visible members" />
                    <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-300">Member</span>
                  </div>
                </th>
                {dates.map((date) => {
                  const parts = dateParts(date);
                  const inRange = rangeDates.includes(date);
                  return (
                    <th key={date} className={`min-w-[66px] border-b border-r px-1 py-1.5 text-center ${
                      date === today
                        ? 'border-blue-200 bg-blue-100 text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300'
                        : inRange
                          ? 'border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                          : 'border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900'
                    }`}>
                      <span className="block text-[10px] font-bold">{parts.day}</span>
                      <span className="block text-[8px] font-semibold uppercase opacity-70">{parts.weekday}</span>
                    </th>
                  );
                })}
                <th className="min-w-20 border-b border-r border-slate-200 bg-slate-100 px-2 py-2 text-right text-[9px] font-bold uppercase text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">{METRICS.find((item) => item.value === metric)?.label}</th>
                <th className="min-w-20 border-b border-slate-200 bg-slate-100 px-2 py-2 text-right text-[9px] font-bold uppercase text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">All meals</th>
              </tr>
            </thead>
            <tbody>
              {filteredMembers.map((member, rowIndex) => {
                const memberId = member._mealMemberId;
                const totals = summary.byMember.get(memberId) || { [metric]: 0, total: 0 };
                return (
                  <tr key={memberId} className="group">
                    <th className={`sticky left-0 z-20 border-b border-r border-slate-200 px-3 py-2 text-left dark:border-slate-800 ${
                      selectedMembers.has(memberId)
                        ? 'bg-blue-50 dark:bg-blue-950'
                        : rowIndex % 2
                          ? 'bg-slate-50/80 group-hover:bg-slate-100 dark:bg-slate-900/80 dark:group-hover:bg-slate-800'
                          : 'bg-white group-hover:bg-slate-50 dark:bg-slate-900 dark:group-hover:bg-slate-800'
                    }`}>
                      <div className="flex items-center gap-2">
                        <input type="checkbox" checked={selectedMembers.has(memberId)} onChange={() => toggleMember(memberId)} aria-label={`Select ${getMemberName(member)}`} />
                        {getMemberPhoto(member) ? (
                          <Image src={getMemberPhoto(member)} alt="" width={28} height={28} unoptimized className="h-7 w-7 flex-none rounded-lg object-cover" />
                        ) : (
                          <span className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-slate-100 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{memberInitial(member)}</span>
                        )}
                        <span className="min-w-0">
                          <span className="block max-w-32 truncate text-[11px] font-bold text-slate-900 dark:text-white">{getMemberName(member)}</span>
                          <span className="block truncate text-[9px] font-medium text-slate-400">{member.room || 'No room'}</span>
                        </span>
                      </div>
                    </th>
                    {dates.map((date, columnIndex) => {
                      const key = cellKey(memberId, date, metric);
                      const group = mealIndex.get(entryKey(memberId, date));
                      const hasDuplicate = group?.duplicateCount > 0;
                      const value = Object.prototype.hasOwnProperty.call(draftValues, key)
                        ? draftValues[key]
                        : formatMealValue(getCellValue(memberId, date, metric));
                      const hasValue = finiteNumber(value) > 0;
                      const isActive = activeCell === key;
                      const isSaving = savingCells.has(key);
                      return (
                        <td key={date} className={`relative border-b border-r p-0 dark:border-slate-800 ${
                          hasDuplicate
                            ? 'bg-amber-50 dark:bg-amber-950/30'
                            : isActive
                              ? 'bg-blue-50 dark:bg-blue-950/40'
                              : hasValue
                                ? filledCellClass(metric)
                                : rowIndex % 2
                                  ? 'bg-slate-50/70 group-hover:bg-slate-100/80 dark:bg-slate-900/80 dark:group-hover:bg-slate-800/50'
                                  : 'bg-white group-hover:bg-slate-50/70 dark:bg-slate-900 dark:group-hover:bg-slate-800/50'
                        }`} title={hasDuplicate ? `${group.rows.length} active records exist for this member and date` : ''}>
                          <input
                            ref={(node) => {
                              if (node) inputRefs.current.set(key, node);
                              else inputRefs.current.delete(key);
                            }}
                            type="text"
                            inputMode="decimal"
                            value={value}
                            onChange={(event) => setCellDraft(memberId, date, metric, event.target.value)}
                            onFocus={() => setActiveCell(key)}
                            onBlur={() => {
                              setActiveCell((current) => current === key ? null : current);
                              void commitCell(member, date, metric);
                            }}
                            onKeyDown={(event) => handleCellKeyDown(event, member, rowIndex, columnIndex, date)}
                            onPaste={(event) => handlePaste(event, rowIndex, columnIndex)}
                            aria-label={`${getMemberName(member)}, ${date}, ${metric}`}
                            className={`h-10 w-[66px] appearance-none bg-transparent px-1.5 text-center text-[11px] font-semibold tabular-nums outline-none [MozAppearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${
                              isActive ? 'ring-2 ring-inset ring-blue-500' : ''
                            } ${hasValue ? filledTextClass(metric) : 'text-slate-300 dark:text-slate-600'}`}
                          />
                          {hasDuplicate && <AlertTriangle className="absolute right-0.5 top-0.5 h-2.5 w-2.5 text-amber-500" />}
                          {isSaving && <Loader2 className="absolute bottom-0.5 right-0.5 h-2.5 w-2.5 animate-spin text-blue-500" />}
                        </td>
                      );
                    })}
                    <td className="border-b border-r border-slate-200 bg-slate-50 px-2 py-2 text-right font-bold tabular-nums text-blue-700 dark:border-slate-800 dark:bg-slate-950 dark:text-blue-300">{formatMealValue(totals[metric])}</td>
                    <td className="border-b border-slate-200 bg-slate-50 px-2 py-2 text-right font-bold tabular-nums text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-white">{formatMealValue(totals.total)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="sticky bottom-0 z-20">
              <tr>
                <th className="sticky left-0 z-30 border-r border-t border-slate-300 bg-slate-950 px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-white dark:border-slate-700">
                  Daily {METRICS.find((item) => item.value === metric)?.label} total
                </th>
                {dates.map((date) => (
                  <td key={date} className="border-r border-t border-slate-700 bg-slate-950 px-1 py-2 text-center text-[10px] font-bold tabular-nums text-white">
                    {formatMealValue(summary.byDate.get(date) || 0)}
                  </td>
                ))}
                <td className="border-r border-t border-slate-700 bg-slate-950 px-2 py-2 text-right text-[11px] font-bold tabular-nums text-blue-300">{formatMealValue(selectedMetricTotal)}</td>
                <td className="border-t border-slate-700 bg-slate-950 px-2 py-2 text-right text-[11px] font-bold tabular-nums text-white">{formatMealValue(summary.house.total)}</td>
              </tr>
            </tfoot>
          </table>

          {filteredMembers.length === 0 && (
            <div className="flex min-h-48 flex-col items-center justify-center bg-white px-6 text-center dark:bg-slate-900">
              <Search className="h-6 w-6 text-slate-300" />
              <p className="mt-2 text-xs font-bold text-slate-600 dark:text-slate-300">No matching members</p>
              <button type="button" onClick={() => setSearch('')} className="mt-2 text-[11px] font-semibold text-blue-600">Clear search</button>
            </div>
          )}
        </div>
      )}

      <footer className="grid grid-cols-2 gap-px border-t border-slate-200 bg-slate-200 dark:border-slate-800 dark:bg-slate-800 sm:grid-cols-4">
        {[
          { label: 'Members', value: normalizedMembers.length, icon: Users },
          { label: 'Selected metric', value: formatMealValue(selectedMetricTotal), icon: Sigma },
          { label: 'All meals', value: formatMealValue(summary.house.total), icon: Utensils },
          { label: 'Duplicate rows', value: duplicateRows, icon: duplicateRows ? AlertTriangle : UserRoundCheck },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="flex items-center gap-2 bg-white px-3 py-2.5 dark:bg-slate-900">
              <Icon className={`h-3.5 w-3.5 ${item.label === 'Duplicate rows' && duplicateRows ? 'text-amber-500' : 'text-slate-400'}`} />
              <span>
                <span className="block text-[9px] font-bold uppercase tracking-wide text-slate-400">{item.label}</span>
                <span className="block text-xs font-bold text-slate-900 dark:text-white">{item.value}</span>
              </span>
            </div>
          );
        })}
      </footer>
    </section>
  );
}
