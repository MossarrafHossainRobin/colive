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
  BellRing,
  CalendarDays,
  CircleDollarSign,
  Gauge,
  History,
  Landmark,
  Loader2,
  PiggyBank,
  ReceiptText,
  Save,
  ShoppingBasket,
  WalletCards,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { auth, db } from '@/lib/firebase';
import { isMemberAccountActive } from '@/lib/memberPolicy';
import {
  calculateBazarSummary,
  dhakaDateId,
  normalizeBazarRow,
  normalizeBazarRows,
  serializeBazarRow,
  validateBazarRow,
} from '@/lib/bazarWorkspace';
import { createAuditRecord, stageAuditRecord } from '@/lib/adminAudit';
import { formatRate } from '@/lib/mealRate';
import { sendReviewedWorkspaceNotification } from '@/lib/adminNotification';
import useMealRatePeriod from '@/app/hooks/useMealRatePeriod';
import BazarSpreadsheet from '@/components/admin/bazar/BazarSpreadsheet';
import BazarAnalytics from '@/components/admin/bazar/BazarAnalytics';
import AdjustBalance from '@/components/admin/bazar/AdjustBalance';
import BalanceAdjustmentHistory from '@/components/admin/bazar/BalanceAdjustmentHistory';
import NotificationReviewModal from '@/components/admin/notifications/NotificationReviewModal';
import ActivityPanel from '@/components/admin/ui/ActivityPanel';
import {
  AdminPageHeader,
  MetricCard,
  ToolbarButton,
  ViewTabs,
} from '@/components/admin/ui/AdminUI';

function money(value) {
  const amount = Number(value || 0);
  const absolute = Math.abs(amount).toLocaleString('en-US', { maximumFractionDigits: 2 });
  return amount < 0 ? `-৳${absolute}` : `৳${absolute}`;
}

function memberName(member) {
  return member?.displayName || member?.name || member?.fullName || member?.email || 'Member';
}

function isActiveRoomMember(member) {
  return isMemberAccountActive(member) && Boolean(String(member?.room || '').trim());
}

function auditRow(row) {
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

function validateSettings(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${label} must be zero or greater.`);
  return Number(number.toFixed(2));
}

function recentMonths(monthId, count = 6) {
  const [year, month] = String(monthId).split('-').map(Number);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 - index, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  }).reverse();
}

export default function AdminBazar() {
  const today = useMemo(() => dhakaDateId(), []);
  const [selectedMonth, setSelectedMonth] = useState(() => dhakaDateId().slice(0, 7));
  const [selectedDate, setSelectedDate] = useState(today);
  const [view, setView] = useState('ledger');
  const [users, setUsers] = useState([]);
  const [rows, setRows] = useState([]);
  const [analyticsRows, setAnalyticsRows] = useState([]);
  const [adjustments, setAdjustments] = useState([]);
  const [activity, setActivity] = useState([]);
  const [period, setPeriod] = useState({ openingBalance: 0, monthlyBudget: 0 });
  const [openingBalanceDraft, setOpeningBalanceDraft] = useState('0');
  const [monthlyBudgetDraft, setMonthlyBudgetDraft] = useState('0');
  const [dirtyChanges, setDirtyChanges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notificationSending, setNotificationSending] = useState(false);
  const {
    period: mealRatePeriod,
    loading: mealRateLoading,
    loadedMonth: mealRateReadyMonth,
  } = useMealRatePeriod(selectedMonth);

  const activeMembers = useMemo(
    () => users.filter(isActiveRoomMember),
    [users]
  );
  const normalizedRows = useMemo(() => normalizeBazarRows(rows), [rows]);
  const summary = useMemo(() => calculateBazarSummary(normalizedRows, {
    selectedMonth,
    selectedDate,
    today,
    openingBalance: period.openingBalance,
    members: activeMembers,
  }), [activeMembers, normalizedRows, period.openingBalance, selectedDate, selectedMonth, today]);
  const remainingBudget = Number(period.monthlyBudget || 0) > 0
    ? Number(period.monthlyBudget) - summary.totalExpenses
    : summary.runningBalance;
  const mealRateIsCurrent = Boolean(mealRatePeriod) &&
    !mealRateLoading &&
    mealRateReadyMonth === selectedMonth &&
    Math.abs(Number(mealRatePeriod.bazarCost || 0) - Number(summary.monthlyTotal || 0)) < 0.000001;

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'users'),
      (snapshot) => {
        const next = snapshot.docs
          .map((item) => ({ id: item.id, ...item.data() }))
          .sort((left, right) => String(left.room || '').localeCompare(String(right.room || ''), undefined, { numeric: true }) || memberName(left).localeCompare(memberName(right)));
        setUsers(next);
      },
      (error) => {
        console.error('Bazar member listener failed:', error);
        setUsers([]);
      }
    );
    return unsubscribe;
  }, []);

  useEffect(() => {
    setLoading(true);
    setDirtyChanges([]);
    const nextDate = today.slice(0, 7) === selectedMonth ? today : `${selectedMonth}-01`;
    setSelectedDate(nextDate);

    const unsubscribeRows = onSnapshot(
      query(collection(db, 'bazar'), where('month', '==', selectedMonth)),
      (snapshot) => {
        setRows(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
        setLoading(false);
      },
      (error) => {
        console.error('Bazar ledger listener failed:', error);
        setRows([]);
        setLoading(false);
        toast.error('Could not load the Bazar ledger.');
      }
    );
    const unsubscribeAnalytics = onSnapshot(
      query(collection(db, 'bazar'), where('month', 'in', recentMonths(selectedMonth))),
      (snapshot) => setAnalyticsRows(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
      (error) => {
        console.error('Bazar analytics listener failed:', error);
        setAnalyticsRows([]);
      }
    );
    const unsubscribeAdjustments = onSnapshot(
      query(collection(db, 'balanceAdjustments'), where('month', '==', selectedMonth)),
      (snapshot) => setAdjustments(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
      (error) => {
        console.error('Balance adjustment listener failed:', error);
        setAdjustments([]);
      }
    );
    const unsubscribeActivity = onSnapshot(
      query(collection(db, 'adminActivity'), where('module', '==', 'bazar')),
      (snapshot) => {
        const next = snapshot.docs
          .map((item) => ({ id: item.id, ...item.data() }))
          .filter((item) => item.module === 'bazar' && (!item.month || item.month === selectedMonth))
          .sort((left, right) => (right.createdAt?.seconds || 0) - (left.createdAt?.seconds || 0));
        setActivity(next.slice(0, 300));
      },
      () => setActivity([])
    );
    const unsubscribePeriod = onSnapshot(
      doc(db, 'bazarPeriods', selectedMonth),
      (snapshot) => {
        const value = snapshot.exists() ? snapshot.data() : {};
        const next = {
          openingBalance: Number(value.openingBalance || 0),
          monthlyBudget: Number(value.monthlyBudget || 0),
        };
        setPeriod(next);
        setOpeningBalanceDraft(String(next.openingBalance));
        setMonthlyBudgetDraft(String(next.monthlyBudget));
      },
      (error) => console.error('Bazar period listener failed:', error)
    );

    return () => {
      unsubscribeRows();
      unsubscribeAnalytics();
      unsubscribeAdjustments();
      unsubscribeActivity();
      unsubscribePeriod();
    };
  }, [selectedMonth, today]);

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
    }, {
      actor: auth.currentUser,
    });
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
      after: auditRow({ id: ref.id, ...next }),
      metadata: { source: 'spreadsheet' },
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
    batch.set(doc(db, 'bazar', id), {
      ...next,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    stageAuditRecord(batch, {
      module: 'bazar',
      action: 'update',
      entityType: 'bazar',
      entityId: id,
      month: selectedMonth,
      summary: `Updated ${next.marketId}: ${next.description}`,
      before: auditRow(existing),
      after: auditRow({ id, ...next }),
      metadata: { source: 'spreadsheet', version: next.version },
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
      module: 'bazar',
      action: 'delete',
      entityType: 'bazar',
      entityId: id,
      month: selectedMonth,
      summary: `Moved ${existing.marketId || id} to trash`,
      before: auditRow(existing),
      after: { isDeleted: true, status: 'deleted', version },
      metadata: { source: 'spreadsheet', version },
    });
    await batch.commit();
  }, [normalizedRows, selectedMonth]);

  const restoreRow = useCallback(async (id, suppliedRow) => {
    const existing = normalizeBazarRow(suppliedRow || normalizedRows.find((item) => item.id === id));
    if (!id) throw new Error('Missing Bazar row ID.');
    const candidate = normalizeBazarRow({ ...existing, id, isDeleted: false, status: 'active' });
    const validation = validateBazarRow(candidate, {
      selectedMonth,
      existingRows: normalizedRows,
    });
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
      module: 'bazar',
      action: 'restore',
      entityType: 'bazar',
      entityId: id,
      month: selectedMonth,
      summary: `Restored ${existing.marketId || id}`,
      before: { isDeleted: true, version: existing.version },
      after: { ...auditRow(candidate), isDeleted: false, version },
      metadata: { source: 'history', version },
    });
    await batch.commit();
    toast.success('Bazar row restored.');
  }, [normalizedRows, selectedMonth]);

  const savePeriodSettings = async () => {
    setSavingSettings(true);
    try {
      const openingBalance = validateSettings(openingBalanceDraft, 'Opening balance');
      const monthlyBudget = validateSettings(monthlyBudgetDraft, 'Monthly budget');
      const batch = writeBatch(db);
      batch.set(doc(db, 'bazarPeriods', selectedMonth), {
        month: selectedMonth,
        openingBalance,
        monthlyBudget,
        updatedAt: serverTimestamp(),
        updatedById: auth.currentUser?.uid || '',
        updatedByName: auth.currentUser?.displayName || auth.currentUser?.email || 'Admin',
      }, { merge: true });
      stageAuditRecord(batch, {
        module: 'bazar',
        action: 'update_balance',
        entityType: 'bazarPeriod',
        entityId: selectedMonth,
        month: selectedMonth,
        summary: `Updated opening balance and budget for ${selectedMonth}`,
        before: period,
        after: { openingBalance, monthlyBudget },
      });
      await batch.commit();
      setDirtyChanges((current) => [{
        id: `balance-${Date.now()}`,
        type: 'balance',
        label: `Updated monthly funds: opening ${money(openingBalance)}, budget ${money(monthlyBudget)}`,
      }, ...current]);
      toast.success('Monthly balance settings saved.');
    } catch (error) {
      toast.error(error.message || 'Could not save balance settings.');
    } finally {
      setSavingSettings(false);
    }
  };

  const recordAdjustment = async (result) => {
    if (!result) return;
    const label = `Transferred ${money(result.amount)} from ${result.fromName} to ${result.toName}`;
    setDirtyChanges((current) => [{ id: `adjustment-${Date.now()}`, type: 'balance_adjustment', label }, ...current]);
    await createAuditRecord({
      module: 'bazar',
      action: 'create',
      entityType: 'balanceAdjustment',
      entityId: result.id || '',
      month: selectedMonth,
      summary: label,
      after: result,
      metadata: { source: 'balance_transfer' },
    }).catch((error) => console.error('Balance adjustment audit failed:', error));
  };

  const deleteAdjustment = async (item) => {
    const batch = writeBatch(db);
    const version = Number(item.version || 0) + 1;
    batch.set(doc(db, 'balanceAdjustments', item.id), {
      isDeleted: true,
      deletedAt: serverTimestamp(),
      deletedById: auth.currentUser?.uid || '',
      updatedAt: serverTimestamp(),
      version,
    }, { merge: true });
    stageAuditRecord(batch, {
      module: 'bazar',
      action: 'delete',
      entityType: 'balanceAdjustment',
      entityId: item.id,
      month: selectedMonth,
      summary: `Deleted balance transfer ${money(item.amount)}`,
      before: {
        fromUserId: item.fromUserId || item.fromMember || '',
        toUserId: item.toUserId || item.toMember || '',
        amount: Number(item.amount || 0),
        reason: item.reason || '',
        version: item.version || 0,
      },
      after: { isDeleted: true, version },
    });
    await batch.commit();
    setDirtyChanges((current) => [{ id: `adjustment-delete-${Date.now()}`, type: 'delete', label: `Deleted balance transfer ${money(item.amount)}` }, ...current]);
  };

  const restoreFromActivity = async (item) => {
    if (item.entityType === 'balanceAdjustment') {
      const version = Number(item.before?.version || 0) + 1;
      const batch = writeBatch(db);
      batch.set(doc(db, 'balanceAdjustments', item.entityId), {
        ...item.before,
        month: selectedMonth,
        isDeleted: false,
        restoredAt: serverTimestamp(),
        restoredById: auth.currentUser?.uid || '',
        updatedAt: serverTimestamp(),
        version,
      }, { merge: true });
      stageAuditRecord(batch, {
        module: 'bazar', action: 'restore', entityType: 'balanceAdjustment', entityId: item.entityId, month: selectedMonth,
        summary: `Restored balance transfer ${money(item.before?.amount)}`,
        before: { isDeleted: true }, after: { ...item.before, isDeleted: false, version },
      });
      await batch.commit();
      toast.success('Balance transfer restored.');
      return;
    }
    await restoreRow(item.entityId, item.before);
  };

  const sendNotification = async ({ channels }) => {
    setNotificationSending(true);
    try {
      if (!mealRateIsCurrent) throw new Error('Wait for the shared meal rate to finish recalculating before sending.');
      const mealRate = Number(mealRatePeriod?.mealRate || 0);
      const result = await sendReviewedWorkspaceNotification({
        recipients: activeMembers,
        title: `NestHub Bazar summary · ${selectedMonth}`,
        body: `The Bazar ledger was reviewed by the admin.\nToday's expenses: ${money(summary.todayExpense)}\nMonthly expenses: ${money(summary.monthlyTotal)}\nRemaining balance: ${money(remainingBudget)}\nUpdated meal rate: ৳${formatRate(mealRate)}`,
        type: 'bazar_summary',
        link: '/bazar',
        data: {
          month: selectedMonth,
          selectedDate,
          todayExpense: summary.todayExpense,
          monthlyExpense: summary.monthlyTotal,
          remainingBalance: remainingBudget,
          mealRate,
          changeCount: dirtyChanges.length,
        },
        channels,
      });
      const batch = writeBatch(db);
      stageAuditRecord(batch, {
        module: 'bazar',
        action: 'notify',
        entityType: 'notificationBatch',
        month: selectedMonth,
        summary: `Reviewed Bazar summary sent to ${result.sent}/${result.total} members`,
        after: { channels, sent: result.sent, failed: result.failed, mealRate },
      });
      await batch.commit();
      setDirtyChanges([]);
      setNotificationOpen(false);
      if (result.failed) toast.error(`${result.sent} sent, ${result.failed} failed.`);
      else toast.success(`Notification sent to ${result.sent} member(s).`);
    } catch (error) {
      toast.error(error.message || 'Notification could not be sent.');
    } finally {
      setNotificationSending(false);
    }
  };

  const tabs = [
    { value: 'ledger', label: 'Ledger', icon: ReceiptText, count: summary.rawEntryCount },
    { value: 'analytics', label: 'Analytics', icon: BarChart3 },
    { value: 'balances', label: 'Balances', icon: WalletCards, count: adjustments.filter((item) => !item.isDeleted).length },
    { value: 'activity', label: 'Activity & Trash', icon: Activity, count: activity.length },
  ];

  if (loading) {
    return <div className="flex min-h-[60dvh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;
  }

  return (
    <div className="space-y-4">
      <AdminPageHeader
        eyebrow="Operations / Bazar"
        title="Bazar finance workspace"
        description="A spreadsheet-first ledger with transparent totals, analytics, audit history, safe recovery, and deliberate notification review."
        icon={ShoppingBasket}
        actions={(
          <>
            <label className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
              <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
              <input type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} className="bg-transparent outline-none" />
            </label>
            <ToolbarButton
              icon={BellRing}
              active={dirtyChanges.length > 0 && mealRateIsCurrent}
              disabled={!mealRateIsCurrent}
              title={mealRateIsCurrent ? 'Review and send the current summary' : 'Waiting for the shared meal rate to match this ledger'}
              onClick={() => setNotificationOpen(true)}
            >
              Send notification {dirtyChanges.length ? `(${dirtyChanges.length})` : ''}
            </ToolbarButton>
          </>
        )}
      />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
        <MetricCard label="Today" value={money(summary.todayExpense)} detail={today} icon={CircleDollarSign} tone="emerald" />
        <MetricCard label="This week" value={money(summary.weeklyTotal)} detail={`${summary.weekStart.slice(5)} – ${summary.weekEnd.slice(5)}`} icon={CalendarDays} tone="blue" />
        <MetricCard label="This month" value={money(summary.monthlyTotal)} detail={`${summary.entryCount} counted rows`} icon={ReceiptText} tone="violet" />
        <MetricCard label="Selected date" value={money(summary.selectedDateTotal)} detail={selectedDate} icon={CalendarDays} tone="amber" />
        <MetricCard label="Daily average" value={money(summary.averageDailyExpense)} detail={`${summary.expenseDayCount} expense days`} icon={Gauge} tone="blue" />
        <MetricCard label="Highest expense" value={money(summary.highestExpense)} detail={summary.highestExpenseRow?.description || 'No expense'} icon={Landmark} tone="rose" />
        <MetricCard label="Running balance" value={money(summary.runningBalance)} detail={`Opening ${money(summary.openingBalance)}`} icon={WalletCards} tone={summary.runningBalance < 0 ? 'rose' : 'emerald'} />
        <MetricCard label="Remaining budget" value={money(remainingBudget)} detail={period.monthlyBudget ? `Budget ${money(period.monthlyBudget)}` : 'Uses running balance'} icon={PiggyBank} tone={remainingBudget < 0 ? 'rose' : 'slate'} />
      </div>

      <ViewTabs value={view} onChange={setView} items={tabs} />

      {view === 'ledger' && (
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
          dirtyChanges={dirtyChanges}
          onDirtyChangesChange={setDirtyChanges}
        />
      )}

      {view === 'analytics' && <BazarAnalytics rows={analyticsRows.length ? normalizeBazarRows(analyticsRows) : normalizedRows} members={activeMembers} month={selectedMonth} />}

      {view === 'balances' && (
        <div className="space-y-4">
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">Monthly funds & running balance</h2>
                <p className="mt-1 max-w-2xl text-[11px] leading-5 text-slate-400">Running balance = opening balance − counted Bazar expenses. Member-to-member transfers redistribute contributions and do not change the house total.</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-[160px_160px_auto]">
                <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  Opening balance
                  <input type="number" min="0" step="0.01" value={openingBalanceDraft} onChange={(event) => setOpeningBalanceDraft(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 outline-none focus:border-blue-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200" />
                </label>
                <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  Monthly budget
                  <input type="number" min="0" step="0.01" value={monthlyBudgetDraft} onChange={(event) => setMonthlyBudgetDraft(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 outline-none focus:border-blue-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200" />
                </label>
                <ToolbarButton icon={savingSettings ? Loader2 : Save} disabled={savingSettings} onClick={savePeriodSettings} className="self-end">
                  {savingSettings ? 'Saving…' : 'Save funds'}
                </ToolbarButton>
              </div>
            </div>
          </section>

          <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
            <AdjustBalance
              members={activeMembers}
              bazars={normalizedRows}
              adjustments={adjustments}
              selectedMonth={selectedMonth}
              onAdjust={recordAdjustment}
              notificationsEnabled={false}
            />
            <BalanceAdjustmentHistory
              adjustments={adjustments}
              members={activeMembers}
              selectedMonth={selectedMonth}
              onDelete={deleteAdjustment}
              notificationsEnabled={false}
            />
          </div>
        </div>
      )}

      {view === 'activity' && <ActivityPanel items={activity} moduleName="Bazar" onRestore={restoreFromActivity} />}

      <NotificationReviewModal
        open={notificationOpen}
        onClose={() => setNotificationOpen(false)}
        moduleName="Bazar Management"
        title={`Bazar summary updated · ${selectedMonth}`}
        summary="The ledger changes and finance totals below have been reviewed. No edit triggered this message automatically."
        dateLabel={`Prepared for ${today}`}
        metrics={[
          { label: "Today's expenses", value: money(summary.todayExpense) },
          { label: 'Monthly expenses', value: money(summary.monthlyTotal) },
          { label: 'Updated meal rate', value: `৳${formatRate(mealRatePeriod?.mealRate || 0)}` },
          { label: 'Remaining balance', value: money(remainingBudget) },
        ]}
        changes={dirtyChanges}
        recipients={activeMembers}
        onConfirm={sendNotification}
        sending={notificationSending}
      />
    </div>
  );
}
