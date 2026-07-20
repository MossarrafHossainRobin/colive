'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  Activity,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  FileSpreadsheet,
  History,
  Loader2,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  ShoppingBasket,
  WalletCards,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { auth, db } from '@/lib/firebase';
import { isMemberAccountActive } from '@/lib/memberPolicy';
import {
  BAZAR_MONEY_EVENT_TYPES,
  buildBazarMoneyWorksheet,
  roundBazarMoney,
} from '@/lib/bazarMoney';
import {
  dhakaDateId,
  normalizeBazarRow,
  normalizeBazarRows,
  serializeBazarRow,
  validateBazarRow,
} from '@/lib/bazarWorkspace';
import { stageAuditRecord } from '@/lib/adminAudit';
import BazarMoneyStatsCards from '@/components/admin/bazar/BazarMoneyStatsCards';
import BazarMoneyWorkspace from '@/components/admin/bazar/BazarMoneyWorkspace';
import BazarSpreadsheet from '@/components/admin/bazar/BazarSpreadsheet';
import BazarAnalytics from '@/components/admin/bazar/BazarAnalytics';
import ActivityPanel from '@/components/admin/ui/ActivityPanel';
import { ViewTabs } from '@/components/admin/ui/AdminUI';

const PERSONAL_FIELD_TYPES = {
  previousBalance: BAZAR_MONEY_EVENT_TYPES.PREVIOUS_DUE,
  currentDeposit: BAZAR_MONEY_EVENT_TYPES.DEPOSIT,
  adjustment: BAZAR_MONEY_EVENT_TYPES.ADJUSTMENT,
  remarks: BAZAR_MONEY_EVENT_TYPES.REMARK,
};

function memberName(member) {
  return member?.displayName || member?.name || member?.fullName || member?.email || 'Member';
}

function isActiveRoomMember(member) {
  return isMemberAccountActive(member) && Boolean(String(member?.room || '').trim());
}

function recentMonths(monthId, count = 6) {
  const [year, month] = String(monthId).split('-').map(Number);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 - index, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  }).reverse();
}

function auditBazarRow(row) {
  const value = normalizeBazarRow(row);
  return {
    date: value.date,
    month: value.month,
    marketId: value.marketId,
    description: value.description,
    category: value.category,
    amount: value.amount,
    amountPaisa: value.amountPaisa,
    paidById: value.paidById,
    paidByName: value.paidByName,
    addedById: value.addedById,
    addedByName: value.addedByName,
    notes: value.notes,
    attachmentUrl: value.attachmentUrl,
    countInBazar: value.countInBazar,
    place: value.place,
    isDeleted: value.isDeleted,
    version: value.version,
  };
}

function displayValue(value, field) {
  if (field === 'remarks') return String(value || '') || '—';
  const amount = roundBazarMoney(value);
  const absolute = Math.abs(amount).toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (amount < 0) return `-৳${absolute}`;
  return `৳${absolute}`;
}

function eventDirection(memberId, delta) {
  if (delta < 0) {
    return {
      fromMember: memberId,
      fromUserId: memberId,
      toMember: '',
      toUserId: '',
    };
  }
  return {
    fromMember: '',
    fromUserId: '',
    toMember: memberId,
    toUserId: memberId,
  };
}

export default function AdminBazarMoneyPage() {
  const today = useMemo(() => dhakaDateId(), []);
  const [selectedMonth, setSelectedMonth] = useState(() => dhakaDateId().slice(0, 7));
  const [selectedDate, setSelectedDate] = useState(today);
  const [view, setView] = useState('money');
  const [users, setUsers] = useState([]);
  const [rows, setRows] = useState([]);
  const [analyticsRows, setAnalyticsRows] = useState([]);
  const [adjustments, setAdjustments] = useState([]);
  const [activity, setActivity] = useState([]);
  const [ready, setReady] = useState({ members: false, bazar: false, adjustments: false });
  const [sourceErrors, setSourceErrors] = useState({});
  const [refreshRevision, setRefreshRevision] = useState(0);
  const [workspaceSync, setWorkspaceSync] = useState({ state: 'synced', pending: 0, errors: 0 });

  const activeMembers = useMemo(
    () => users.filter(isActiveRoomMember),
    [users]
  );
  const normalizedRows = useMemo(() => normalizeBazarRows(rows), [rows]);
  const worksheet = useMemo(() => buildBazarMoneyWorksheet({
    members: activeMembers,
    bazarRows: normalizedRows,
    balanceAdjustments: adjustments,
    selectedMonth,
  }), [activeMembers, adjustments, normalizedRows, selectedMonth]);

  const loading = !ready.members || !ready.bazar || !ready.adjustments;
  const personalActivity = useMemo(() => activity.filter((item) => (
    item.entityType === 'bazarMemberBalance' || item.metadata?.workspace === 'bazar_money'
  )), [activity]);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'users'),
      (snapshot) => {
        const next = snapshot.docs
          .map((item) => ({ id: item.id, ...item.data() }))
          .sort((left, right) => String(left.room || '').localeCompare(String(right.room || ''), undefined, { numeric: true }) || memberName(left).localeCompare(memberName(right)));
        setUsers(next);
        setReady((current) => ({ ...current, members: true }));
        setSourceErrors((current) => {
          if (!current.members) return current;
          const nextErrors = { ...current };
          delete nextErrors.members;
          return nextErrors;
        });
      },
      (error) => {
        console.error('Bazar member listener failed:', error);
        setReady((current) => ({ ...current, members: true }));
        setSourceErrors((current) => ({ ...current, members: 'Member directory could not be refreshed.' }));
      }
    );
    return unsubscribe;
  }, [refreshRevision]);

  useEffect(() => {
    setReady((current) => ({ ...current, bazar: false }));
    const nextDate = today.slice(0, 7) === selectedMonth ? today : `${selectedMonth}-01`;
    setSelectedDate(nextDate);

    const unsubscribeRows = onSnapshot(
      query(collection(db, 'bazar'), where('month', '==', selectedMonth)),
      (snapshot) => {
        setRows(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
        setReady((current) => ({ ...current, bazar: true }));
        setSourceErrors((current) => {
          if (!current.bazar) return current;
          const nextErrors = { ...current };
          delete nextErrors.bazar;
          return nextErrors;
        });
      },
      (error) => {
        console.error('Bazar ledger listener failed:', error);
        setReady((current) => ({ ...current, bazar: true }));
        setSourceErrors((current) => ({ ...current, bazar: 'Bazar expenses could not be refreshed.' }));
      }
    );

    const unsubscribeAnalytics = onSnapshot(
      query(collection(db, 'bazar'), where('month', 'in', recentMonths(selectedMonth))),
      (snapshot) => {
        setAnalyticsRows(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
        setSourceErrors((current) => {
          if (!current.analytics) return current;
          const nextErrors = { ...current };
          delete nextErrors.analytics;
          return nextErrors;
        });
      },
      (error) => {
        console.error('Bazar analytics listener failed:', error);
        setSourceErrors((current) => ({ ...current, analytics: 'Analytics data is temporarily unavailable.' }));
      }
    );

    return () => {
      unsubscribeRows();
      unsubscribeAnalytics();
    };
  }, [refreshRevision, selectedMonth, today]);

  useEffect(() => {
    setReady((current) => ({ ...current, adjustments: false }));
    const unsubscribe = onSnapshot(
      query(collection(db, 'balanceAdjustments'), where('month', '==', selectedMonth)),
      (snapshot) => {
        setAdjustments(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
        setReady((current) => ({ ...current, adjustments: true }));
        setSourceErrors((current) => {
          if (!current.adjustments) return current;
          const nextErrors = { ...current };
          delete nextErrors.adjustments;
          return nextErrors;
        });
      },
      (error) => {
        console.error('Balance adjustment listener failed:', error);
        setReady((current) => ({ ...current, adjustments: true }));
        setSourceErrors((current) => ({ ...current, adjustments: 'Personal balance history could not be refreshed.' }));
      }
    );
    return unsubscribe;
  }, [refreshRevision, selectedMonth]);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      query(collection(db, 'adminActivity'), where('module', '==', 'bazar')),
      (snapshot) => {
        const next = snapshot.docs
          .map((item) => ({ id: item.id, ...item.data() }))
          .filter((item) => !item.month || item.month === selectedMonth)
          .sort((left, right) => (right.createdAt?.seconds || 0) - (left.createdAt?.seconds || 0));
        setActivity(next.slice(0, 400));
        setSourceErrors((current) => {
          if (!current.activity) return current;
          const nextErrors = { ...current };
          delete nextErrors.activity;
          return nextErrors;
        });
      },
      (error) => {
        console.error('Bazar activity listener failed:', error);
        setSourceErrors((current) => ({ ...current, activity: 'Audit history is temporarily unavailable.' }));
      }
    );
    return unsubscribe;
  }, [refreshRevision, selectedMonth]);

  const createRow = useCallback(async (payload) => {
    const validation = validateBazarRow(payload, {
      selectedMonth,
      existingRows: normalizedRows,
    });
    if (!validation.valid) throw new Error(validation.errors[0] || 'Review this Bazar row.');

    const ref = doc(collection(db, 'bazar'));
    const next = serializeBazarRow({
      ...validation.value,
      id: ref.id,
      version: 1,
      addedById: auth.currentUser?.uid || '',
      addedByName: auth.currentUser?.displayName || auth.currentUser?.email || 'Admin',
    }, { actor: auth.currentUser });
    const batch = writeBatch(db);
    batch.set(ref, {
      ...next,
      isDeleted: false,
      status: 'active',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    stageAuditRecord(batch, {
      module: 'bazar',
      action: 'create',
      entityType: 'bazar',
      entityId: ref.id,
      month: selectedMonth,
      summary: `Added ${next.marketId}: ${next.description}`,
      after: auditBazarRow({ id: ref.id, ...next }),
      metadata: { source: 'expense_spreadsheet' },
    });
    await batch.commit();
    return { id: ref.id, ...next };
  }, [normalizedRows, selectedMonth]);

  const updateRow = useCallback(async (id, payload, meta = {}) => {
    const existing = normalizedRows.find((item) => item.id === id) || normalizeBazarRow(meta.before || {});
    if (!id || !existing.id) throw new Error('This Bazar row no longer exists.');
    const candidate = normalizeBazarRow({
      ...payload,
      id,
      addedById: existing.addedById,
      addedByName: existing.addedByName,
      version: Number(existing.version || 0) + 1,
    });
    const validation = validateBazarRow(candidate, {
      selectedMonth,
      existingRows: normalizedRows,
    });
    if (!validation.valid) throw new Error(validation.errors[0] || 'Review this Bazar row.');
    const next = serializeBazarRow(validation.value, {
      actor: auth.currentUser,
      existingRow: existing,
    });
    const batch = writeBatch(db);
    batch.set(doc(db, 'bazar', id), { ...next, updatedAt: serverTimestamp() }, { merge: true });
    stageAuditRecord(batch, {
      module: 'bazar', action: 'update', entityType: 'bazar', entityId: id, month: selectedMonth,
      summary: `Updated ${next.marketId}: ${next.description}`,
      before: auditBazarRow(existing), after: auditBazarRow({ id, ...next }),
      metadata: { source: 'expense_spreadsheet', version: next.version },
    });
    await batch.commit();
    return { id, ...next };
  }, [normalizedRows, selectedMonth]);

  const softDeleteRow = useCallback(async (id, suppliedRow) => {
    const existing = normalizedRows.find((item) => item.id === id) || normalizeBazarRow(suppliedRow);
    if (!id) throw new Error('Missing Bazar row ID.');
    const version = Number(existing.version || 0) + 1;
    const batch = writeBatch(db);
    batch.set(doc(db, 'bazar', id), {
      isDeleted: true,
      status: 'deleted',
      deletedAt: serverTimestamp(),
      deletedById: auth.currentUser?.uid || '',
      updatedAt: serverTimestamp(),
      version,
    }, { merge: true });
    stageAuditRecord(batch, {
      module: 'bazar', action: 'delete', entityType: 'bazar', entityId: id, month: selectedMonth,
      summary: `Moved ${existing.marketId || id} to trash`,
      before: auditBazarRow(existing), after: { isDeleted: true, status: 'deleted', version },
      metadata: { source: 'expense_spreadsheet', version },
    });
    await batch.commit();
  }, [normalizedRows, selectedMonth]);

  const restoreRow = useCallback(async (id, suppliedRow) => {
    const existing = normalizeBazarRow(suppliedRow || normalizedRows.find((item) => item.id === id));
    if (!id) throw new Error('Missing Bazar row ID.');
    const candidate = normalizeBazarRow({ ...existing, id, isDeleted: false, status: 'active' });
    const validation = validateBazarRow(candidate, { selectedMonth, existingRows: normalizedRows });
    if (!validation.valid) throw new Error(validation.errors[0] || 'This row cannot be restored.');
    const version = Number(existing.version || 0) + 1;
    const batch = writeBatch(db);
    batch.set(doc(db, 'bazar', id), {
      isDeleted: false,
      status: 'active',
      restoredAt: serverTimestamp(),
      restoredById: auth.currentUser?.uid || '',
      updatedAt: serverTimestamp(),
      version,
    }, { merge: true });
    stageAuditRecord(batch, {
      module: 'bazar', action: 'restore', entityType: 'bazar', entityId: id, month: selectedMonth,
      summary: `Restored ${existing.marketId || id}`,
      before: { isDeleted: true, version: existing.version },
      after: { ...auditBazarRow(candidate), isDeleted: false, version },
      metadata: { source: 'activity', version },
    });
    await batch.commit();
    toast.success('Bazar row restored.');
  }, [normalizedRows, selectedMonth]);

  const savePersonalCell = useCallback(async (operation) => {
    const eventType = PERSONAL_FIELD_TYPES[operation.field];
    if (!eventType) throw new Error('This column is calculated and cannot be saved.');
    if (!operation.memberId) throw new Error('The member is missing.');
    const fieldIsRemark = operation.field === 'remarks';
    const delta = fieldIsRemark ? 0 : roundBazarMoney(operation.delta);
    const formulaChanged = !fieldIsRemark &&
      String(operation.beforeFormula || '') !== String(operation.afterFormula || '');
    if (!fieldIsRemark && Math.abs(delta) < 0.005 && !formulaChanged) return null;
    const reason = String(
      operation.reason ||
      (operation.field === 'adjustment' ? 'Manual Adjustment' : `Updated ${operation.field}`)
    ).trim();
    if (operation.field === 'adjustment' && !reason) throw new Error('An adjustment reason is required.');

    const eventRef = doc(collection(db, 'balanceAdjustments'));
    const actorName = auth.currentUser?.displayName || auth.currentUser?.email || 'NestHub Admin';
    const direction = fieldIsRemark ? {
      fromMember: '', fromUserId: '', toMember: '', toUserId: '',
    } : eventDirection(operation.memberId, delta);
    const event = {
      userId: operation.memberId,
      memberId: operation.memberId,
      memberName: operation.memberName || 'Member',
      ...direction,
      amount: Math.abs(delta),
      signedAmount: delta,
      previousValue: operation.before ?? (fieldIsRemark ? '' : 0),
      newValue: operation.after ?? (fieldIsRemark ? '' : 0),
      previousFormula: operation.beforeFormula || '',
      formula: operation.afterFormula || '',
      formulaText: operation.afterFormula || '',
      field: operation.field,
      reason,
      remarks: fieldIsRemark ? String(operation.after || '') : String(operation.remarks || ''),
      month: selectedMonth,
      monthId: selectedMonth,
      type: eventType,
      transactionType: 'bazar_money',
      status: 'completed',
      isDeleted: false,
      version: 1,
      workspaceVersion: 'member-money-v1',
      source: operation.source || 'spreadsheet',
      adminId: auth.currentUser?.uid || '',
      adminName: actorName,
      clientCreatedAt: Date.now(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const batch = writeBatch(db);
    batch.set(eventRef, event);
    stageAuditRecord(batch, {
      module: 'bazar',
      action: operation.source === 'undo' ? 'undo' : operation.source === 'redo' ? 'redo' : 'update_balance',
      entityType: 'bazarMemberBalance',
      entityId: eventRef.id,
      month: selectedMonth,
      summary: `${operation.memberName || 'Member'} · ${operation.field}: ${displayValue(operation.before, operation.field)} → ${displayValue(operation.after, operation.field)}`,
      before: {
        memberId: operation.memberId,
        memberName: operation.memberName || 'Member',
        field: operation.field,
        [operation.field]: operation.before ?? null,
        value: operation.before ?? null,
        formula: operation.beforeFormula || '',
      },
      after: {
        memberId: operation.memberId,
        memberName: operation.memberName || 'Member',
        field: operation.field,
        [operation.field]: operation.after ?? null,
        value: operation.after ?? null,
        formula: operation.afterFormula || '',
      },
      metadata: {
        workspace: 'bazar_money',
        field: operation.field,
        memberName: operation.memberName || 'Member',
        previousValue: operation.before ?? null,
        newValue: operation.after ?? null,
        previousFormula: operation.beforeFormula || '',
        formula: operation.afterFormula || '',
        eventType,
        delta,
        reason,
        remarks: event.remarks,
        source: operation.source || 'spreadsheet',
      },
    });
    await batch.commit();
    return { id: eventRef.id, ...event };
  }, [selectedMonth]);

  const handleMonthChange = (nextMonth) => {
    if (!nextMonth || nextMonth === selectedMonth) return;
    if (workspaceSync.pending > 0) {
      toast.error('Wait for the current sheet changes to finish saving.');
      return;
    }
    setSelectedMonth(nextMonth);
  };

  const handleRefresh = useCallback(async () => {
    setRefreshRevision((current) => current + 1);
  }, []);

  const restoreFromActivity = useCallback(async (item) => {
    if (item.entityType === 'bazar') await restoreRow(item.entityId, item.before);
  }, [restoreRow]);

  const tabs = [
    { value: 'money', label: 'Money Sheet', icon: FileSpreadsheet, count: worksheet.rows.length },
    { value: 'expenses', label: 'Expense Ledger', icon: ReceiptText, count: normalizedRows.filter((row) => !row.isDeleted).length },
    { value: 'analytics', label: 'Analytics', icon: BarChart3 },
    { value: 'audit', label: 'Activity & Trash', icon: History, count: activity.length },
  ];

  if (loading) {
    return (
      <div className="flex min-h-[62dvh] items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto h-7 w-7 animate-spin text-[#2563EB]" />
          <p className="mt-3 text-xs font-semibold text-slate-500">Preparing the Bazar money workspace…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-24 xl:pb-6">
      <header className="overflow-hidden rounded-2xl bg-[#1E293B] text-white shadow-xl shadow-slate-950/15">
        <div className="flex flex-col gap-5 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-3.5">
            <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-[#2563EB] shadow-lg shadow-blue-950/30">
              <ShoppingBasket className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-300">Finance / Bazar Money</p>
                <span className="inline-flex items-center gap-1 rounded-full bg-[#16A34A] px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide">
                  <span className="h-1.5 w-1.5 rounded-full bg-white" /> Realtime
                </span>
              </div>
              <h1 className="mt-1 text-xl font-black tracking-tight sm:text-2xl">Bazar Money Management</h1>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-300">A member-first money sheet for deposits, previous meal due or advance, signed corrections, Bazar cost, and immutable adjustment history.</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className={`inline-flex h-9 items-center gap-2 rounded-lg px-3 text-[10px] font-bold ${workspaceSync.state === 'error' ? 'bg-[#DC2626]' : workspaceSync.state === 'syncing' ? 'bg-[#2563EB]' : 'bg-white/10 text-slate-200 ring-1 ring-inset ring-white/10'}`}>
              {workspaceSync.state === 'syncing' ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : workspaceSync.state === 'error' ? <Activity className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />}
              {workspaceSync.state === 'syncing' ? `${workspaceSync.pending} saving` : workspaceSync.state === 'error' ? 'Sync issue' : 'All changes saved'}
            </div>
            <label className="flex h-9 items-center gap-2 rounded-lg bg-white px-3 text-xs font-bold text-slate-700 shadow-sm">
              <CalendarDays className="h-3.5 w-3.5 text-[#2563EB]" />
              <span className="sr-only">Select month</span>
              <input type="month" value={selectedMonth} onChange={(event) => handleMonthChange(event.target.value)} className="bg-transparent outline-none" />
            </label>
          </div>
        </div>

        <div className="grid border-t border-white/10 sm:grid-cols-3">
          <div className="flex items-center gap-2 px-4 py-3 text-[10px] font-semibold text-slate-300 sm:px-6"><ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> Previous meal due is personal only</div>
          <div className="flex items-center gap-2 border-white/10 px-4 py-3 text-[10px] font-semibold text-slate-300 sm:border-l sm:px-6"><WalletCards className="h-3.5 w-3.5 text-blue-400" /> Collection = current deposits only</div>
          <div className="flex items-center gap-2 border-white/10 px-4 py-3 text-[10px] font-semibold text-slate-300 sm:border-l sm:px-6"><Activity className="h-3.5 w-3.5 text-orange-400" /> Adjustments never alter expense or meal rate</div>
        </div>
      </header>

      {Object.keys(sourceErrors).length > 0 && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
          <Activity className="mt-0.5 h-4 w-4 flex-none" />
          <div><p className="text-xs font-bold">Some live sources need attention</p><p className="mt-0.5 text-[11px]">{Object.values(sourceErrors).join(' ')}</p></div>
        </div>
      )}

      <BazarMoneyStatsCards summary={worksheet.summary} />

      <ViewTabs value={view} onChange={setView} items={tabs} />

      {view === 'money' && (
        <BazarMoneyWorkspace
          rows={worksheet.rows}
          activity={personalActivity}
          selectedMonth={selectedMonth}
          onSaveCell={savePersonalCell}
          onRefresh={handleRefresh}
          onSyncChange={setWorkspaceSync}
        />
      )}

      {view === 'expenses' && (
        <div className="space-y-3">
          <section className="rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-3 dark:border-cyan-900 dark:bg-cyan-950/30">
            <p className="flex items-center gap-2 text-xs font-bold text-cyan-900 dark:text-cyan-100"><ShieldCheck className="h-4 w-4" /> Counted expense ledger</p>
            <p className="mt-1 text-[11px] leading-5 text-cyan-800/80 dark:text-cyan-200/80">These itemized Bazar rows remain the authoritative expense and meal-rate source. Personal previous due or advance and adjustments are stored separately and cannot change this total.</p>
          </section>
          <BazarSpreadsheet
            rows={normalizedRows}
            members={activeMembers}
            selectedMonth={selectedMonth}
            selectedDate={selectedDate}
            onSelectedDateChange={setSelectedDate}
            onCreate={createRow}
            onUpdate={updateRow}
            onDelete={softDeleteRow}
            onRestore={restoreRow}
            dirtyChanges={[]}
            onDirtyChangesChange={() => {}}
          />
        </div>
      )}

      {view === 'analytics' && (
        <BazarAnalytics
          rows={analyticsRows.length ? normalizeBazarRows(analyticsRows) : normalizedRows}
          members={activeMembers}
          month={selectedMonth}
        />
      )}

      {view === 'audit' && (
        <ActivityPanel items={activity} moduleName="Bazar" onRestore={restoreFromActivity} />
      )}
    </div>
  );
}
