'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  Activity,
  BellRing,
  CalendarDays,
  Calculator,
  ClipboardList,
  Loader2,
  Save,
  Sigma,
  UserCheck,
  Users,
  UtensilsCrossed,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { auth, db } from '@/lib/firebase';
import { isMemberAccountActive } from '@/lib/memberPolicy';
import { calculateMonthlyBazarTotals } from '@/lib/bazarCalculations';
import {
  MEAL_RATE_PERIOD_RECORD_TYPE,
  calculateMealRateBreakdown,
  formatRate,
  mealRatePeriodDocumentId,
  mealTotal,
} from '@/lib/mealRate';
import { currentMealRecords, dedupeMealRecords, duplicateMealGroups } from '@/lib/mealRecords';
import { buildAuditRecord } from '@/lib/adminAudit';
import useMealRatePeriod from '@/app/hooks/useMealRatePeriod';
import MealSpreadsheet from '@/components/admin/meals/MealSpreadsheet';
import MealRatePanel from '@/components/admin/meals/MealRatePanel';
import ActivityPanel from '@/components/admin/ui/ActivityPanel';
import NotificationReviewModal from '@/components/admin/notifications/NotificationReviewModal';
import { sendReviewedWorkspaceNotification } from '@/lib/adminNotification';
import {
  AdminPageHeader,
  EmptyState,
  MetricCard,
  ToolbarButton,
  ViewTabs,
} from '@/components/admin/ui/AdminUI';

function dhakaMonth() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${lookup.year}-${lookup.month}`;
}

function validMonth(value) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value || ''));
}

function memberName(member) {
  return member?.displayName || member?.name || member?.fullName || member?.email || 'Member';
}

function safeMeal(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Number(number.toFixed(2))) : 0;
}

function mealDocumentId(month, date, userId) {
  return `${month}_${date}_${userId}`.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function money(value) {
  return `৳${Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

const ADMIN_MEAL_ACTIVITY_RECORD_TYPE = 'admin_activity';

function stageMealAuditRecord(batch, payload) {
  const ref = doc(collection(db, 'meals'));
  batch.set(ref, {
    ...buildAuditRecord(payload),
    recordType: ADMIN_MEAL_ACTIVITY_RECORD_TYPE,
    isSystemRecord: true,
    active: false,
    status: 'system',
  });
  return ref;
}

function buildMealActivityRecord(payload) {
  return {
    ...buildAuditRecord(payload),
    recordType: ADMIN_MEAL_ACTIVITY_RECORD_TYPE,
    isSystemRecord: true,
    active: false,
    status: 'system',
  };
}

export default function AdminMeals() {
  const [selectedMonth, setSelectedMonth] = useState(dhakaMonth);
  const [view, setView] = useState('sheet');
  const [members, setMembers] = useState([]);
  const [meals, setMeals] = useState([]);
  const [bazarRows, setBazarRows] = useState([]);
  const [sourceReady, setSourceReady] = useState({ meals: '', bazar: '' });
  const [changes, setChanges] = useState([]);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notificationSending, setNotificationSending] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [rateConfigDirty, setRateConfigDirty] = useState(false);
  const [rateConfig, setRateConfig] = useState({
    previousBalance: 0,
    otherExpenses: 0,
    adjustments: 0,
    notes: '',
  });

  const {
    period: publishedPeriod,
    loading: rateLoading,
    loadedMonth: rateReadyMonth,
  } = useMealRatePeriod(selectedMonth);

  useEffect(() => {
    if (!validMonth(selectedMonth)) return undefined;
    setMeals([]);
    setBazarRows([]);
    setSourceReady({ meals: '', bazar: '' });
    const unsubscribeMembers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const rows = snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .filter((member) => isMemberAccountActive(member) && String(member.room || '').trim())
        .sort((a, b) => String(a.room || '').localeCompare(String(b.room || ''), undefined, { numeric: true }) || memberName(a).localeCompare(memberName(b)));
      setMembers(rows);
    });

    const unsubscribeMeals = onSnapshot(
      query(collection(db, 'meals'), where('month', '==', selectedMonth)),
      (snapshot) => {
        setMeals(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
        setSourceReady((current) => ({ ...current, meals: selectedMonth }));
      },
      (error) => {
        console.error('Meal workspace listener failed:', error);
        setMeals([]);
        setSourceReady((current) => ({ ...current, meals: selectedMonth }));
      }
    );

    const unsubscribeBazar = onSnapshot(
      query(collection(db, 'bazar'), where('month', '==', selectedMonth)),
      (snapshot) => {
        setBazarRows(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
        setSourceReady((current) => ({ ...current, bazar: selectedMonth }));
      },
      (error) => {
        console.error('Meal workspace Bazar listener failed:', error);
        setBazarRows([]);
        setSourceReady((current) => ({ ...current, bazar: selectedMonth }));
      }
    );

    return () => {
      unsubscribeMembers();
      unsubscribeMeals();
      unsubscribeBazar();
    };
  }, [selectedMonth]);

  useEffect(() => {
    setChanges([]);
    setNotificationOpen(false);
  }, [selectedMonth]);

  useEffect(() => {
    if (rateLoading || rateReadyMonth !== selectedMonth) return;
    setRateConfig({
      previousBalance: Number(publishedPeriod?.previousBalance || 0),
      otherExpenses: Number(publishedPeriod?.otherExpenses || 0),
      adjustments: Number(publishedPeriod?.adjustments || 0),
      notes: publishedPeriod?.notes || '',
    });
    setRateConfigDirty(false);
  }, [publishedPeriod, rateLoading, rateReadyMonth, selectedMonth]);

  const activeMealRows = useMemo(
    () => currentMealRecords(meals, { month: selectedMonth }),
    [meals, selectedMonth]
  );
  const currentMeals = useMemo(
    () => dedupeMealRecords(activeMealRows, { month: selectedMonth }),
    [activeMealRows, selectedMonth]
  );
  const duplicateGroups = useMemo(
    () => duplicateMealGroups(activeMealRows, { month: selectedMonth }),
    [activeMealRows, selectedMonth]
  );
  const duplicateCount = activeMealRows.length - currentMeals.length;
  const activity = useMemo(() => (
    meals
      .filter((item) => (
        item?.recordType === ADMIN_MEAL_ACTIVITY_RECORD_TYPE &&
        item?.module === 'meals' &&
        (!item.month || item.month === selectedMonth)
      ))
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
      .slice(0, 250)
  ), [meals, selectedMonth]);
  const bazarTotals = useMemo(
    () => calculateMonthlyBazarTotals(bazarRows, selectedMonth),
    [bazarRows, selectedMonth]
  );
  const totals = useMemo(() => currentMeals.reduce((summary, meal) => {
    summary.present += safeMeal(meal.lunch) + safeMeal(meal.dinner);
    summary.guest += safeMeal(meal.guestMeal);
    summary.total += mealTotal(meal);
    return summary;
  }, { present: 0, guest: 0, total: 0 }), [currentMeals]);
  const breakdown = useMemo(() => calculateMealRateBreakdown({
    bazarCost: bazarTotals.house,
    previousBalance: rateConfig.previousBalance,
    otherExpenses: rateConfig.otherExpenses,
    adjustments: rateConfig.adjustments,
    totalMeals: totals.total,
  }), [bazarTotals.house, rateConfig, totals.total]);
  const activeRecipients = members;
  const configDirty = rateConfigDirty;
  const ratePanelBreakdown = useMemo(() => ({
    ...breakdown,
    publishedMealRate: publishedPeriod?.mealRate,
    consistent: publishedPeriod
      ? Math.abs(Number(publishedPeriod.mealRate || 0) - Number(breakdown.mealRate || 0)) < 0.000001
      : false,
    calculatedAt: publishedPeriod?.updatedAt || publishedPeriod?.sourceUpdatedAt,
    bazarEntryCount: bazarRows.filter((row) => !row.isDeleted && row.countInBazar !== false).length,
    mealEntryCount: currentMeals.length,
    memberCount: members.length,
    excludedBazar: bazarTotals.excludedHouse,
    duplicateCount,
    status: configDirty ? 'draft' : publishedPeriod ? 'published' : 'preview',
  }), [bazarRows, bazarTotals.excludedHouse, breakdown, configDirty, currentMeals.length, duplicateCount, members.length, publishedPeriod]);

  // Source changes (meals/Bazar) refresh the canonical period immediately while
  // preserving the last explicitly reviewed configuration inputs.
  useEffect(() => {
    const sourcesReady = sourceReady.meals === selectedMonth && sourceReady.bazar === selectedMonth;
    if (!validMonth(selectedMonth) || !sourcesReady || rateLoading || rateReadyMonth !== selectedMonth || configDirty) return;
    const persistedConfig = publishedPeriod || {
      previousBalance: 0,
      otherExpenses: 0,
      adjustments: 0,
      notes: '',
    };
    const next = calculateMealRateBreakdown({
      bazarCost: bazarTotals.house,
      previousBalance: persistedConfig.previousBalance,
      otherExpenses: persistedConfig.otherExpenses,
      adjustments: persistedConfig.adjustments,
      totalMeals: totals.total,
    });
    if (next.totalMeals <= 0 || next.totalCost < 0) return;
    const unchanged = publishedPeriod && [
      'bazarCost', 'totalMeals', 'totalCost', 'mealRate',
    ].every((key) => Math.abs(Number(publishedPeriod[key] || 0) - Number(next[key] || 0)) < 0.000001);
    if (unchanged) return;

    setDoc(doc(db, 'meals', mealRatePeriodDocumentId(selectedMonth)), {
      ...next,
      recordType: MEAL_RATE_PERIOD_RECORD_TYPE,
      isSystemRecord: true,
      month: selectedMonth,
      previousBalance: Number(persistedConfig.previousBalance || 0),
      otherExpenses: Number(persistedConfig.otherExpenses || 0),
      adjustments: Number(persistedConfig.adjustments || 0),
      notes: persistedConfig.notes || '',
      status: 'current',
      duplicateMealCount: duplicateCount,
      bazarEntryCount: bazarRows.filter((row) => !row.isDeleted && row.countInBazar !== false).length,
      mealEntryCount: currentMeals.length,
      sourceUpdatedAt: serverTimestamp(),
    }, { merge: true }).catch((error) => console.error('Canonical meal rate refresh failed:', error));
  }, [bazarRows, bazarTotals.house, configDirty, currentMeals.length, duplicateCount, publishedPeriod, rateLoading, rateReadyMonth, selectedMonth, sourceReady, totals.total]);

  const handleRateConfigChange = useCallback((nextConfig) => {
    setRateConfig({
      previousBalance: Number(nextConfig.previousBalance || 0),
      otherExpenses: Number(nextConfig.otherExpenses || 0),
      adjustments: Number(nextConfig.adjustments || 0),
      notes: nextConfig.notes || '',
    });
    setRateConfigDirty(true);
  }, []);

  const recordChanges = useCallback((items) => {
    setChanges((current) => [...items, ...current].slice(0, 300));
  }, []);

  const upsertMeal = useCallback(async (entry, meta = {}) => {
    if (!entry.userId || !entry.date || entry.month !== selectedMonth) {
      throw new Error(`Meal entry must belong to ${selectedMonth}.`);
    }
    const values = {
      lunch: safeMeal(entry.lunch),
      dinner: safeMeal(entry.dinner),
      guestMeal: safeMeal(entry.guestMeal),
    };
    const existing = entry.id ? meals.find((meal) => meal.id === entry.id) : null;
    const ref = doc(db, 'meals', entry.id || mealDocumentId(selectedMonth, entry.date, entry.userId));
    const next = {
      userId: entry.userId,
      date: entry.date,
      month: selectedMonth,
      ...values,
      totalMeal: values.lunch + values.dinner + values.guestMeal,
      notes: entry.notes || existing?.notes || '',
      isDeleted: false,
      status: 'active',
      version: Number(existing?.version || 0) + 1,
      updatedAt: serverTimestamp(),
      updatedById: auth.currentUser?.uid || '',
      updatedByName: auth.currentUser?.displayName || auth.currentUser?.email || 'Admin',
      ...(existing ? {} : { createdAt: serverTimestamp(), createdById: auth.currentUser?.uid || '' }),
    };
    const batch = writeBatch(db);
    batch.set(ref, next, { merge: true });
    stageMealAuditRecord(batch, {
      module: 'meals',
      action: existing ? 'update' : 'create',
      entityType: 'meal',
      entityId: ref.id,
      month: selectedMonth,
      summary: meta.change?.label || `${memberName(members.find((member) => member.id === entry.userId))} meal updated for ${entry.date}`,
      before: existing ? { lunch: existing.lunch || 0, dinner: existing.dinner || 0, guestMeal: existing.guestMeal || 0, version: existing.version || 0 } : null,
      after: { ...values, totalMeal: next.totalMeal, version: next.version },
      metadata: { field: meta.field || '', reason: meta.reason || 'spreadsheet_edit' },
    });
    await batch.commit();
  }, [meals, members, selectedMonth]);

  const bulkUpsertMeals = useCallback(async (entries, meta = {}) => {
    const chunks = [];
    for (let index = 0; index < entries.length; index += 180) chunks.push(entries.slice(index, index + 180));
    let offset = 0;
    let committed = 0;
    for (const chunk of chunks) {
      const batch = writeBatch(db);
      chunk.forEach((entry, index) => {
        const existing = entry.id ? meals.find((meal) => meal.id === entry.id) : null;
        const ref = doc(db, 'meals', entry.id || mealDocumentId(selectedMonth, entry.date, entry.userId));
        const values = { lunch: safeMeal(entry.lunch), dinner: safeMeal(entry.dinner), guestMeal: safeMeal(entry.guestMeal) };
        const next = {
          userId: entry.userId,
          date: entry.date,
          month: selectedMonth,
          ...values,
          totalMeal: values.lunch + values.dinner + values.guestMeal,
          isDeleted: false,
          status: 'active',
          version: Number(existing?.version || 0) + 1,
          updatedAt: serverTimestamp(),
          updatedById: auth.currentUser?.uid || '',
          ...(existing ? {} : { createdAt: serverTimestamp(), createdById: auth.currentUser?.uid || '' }),
        };
        batch.set(ref, next, { merge: true });
        stageMealAuditRecord(batch, {
          module: 'meals', action: existing ? 'update' : 'create', entityType: 'meal', entityId: ref.id, month: selectedMonth,
          summary: meta.changes?.[offset + index]?.label || `Bulk meal update for ${entry.date}`,
          before: existing ? { lunch: existing.lunch || 0, dinner: existing.dinner || 0, guestMeal: existing.guestMeal || 0, version: existing.version || 0 } : null,
          after: { ...values, totalMeal: next.totalMeal, version: next.version },
          metadata: { reason: meta.reason || 'bulk_fill' },
        });
      });
      try {
        await batch.commit();
        committed += chunk.length;
        offset += chunk.length;
      } catch (error) {
        const message = committed
          ? `${committed} of ${entries.length} rows were saved before the next batch failed. Reloading will show the committed values.`
          : error.message || 'Bulk meal update failed.';
        const partialError = new Error(message);
        partialError.partialCommitted = committed;
        throw partialError;
      }
    }
    return { committed, total: entries.length };
  }, [meals, selectedMonth]);

  const softDeleteMeal = useCallback(async (meal, meta = {}) => {
    if (!meal?.id) return;
    const batch = writeBatch(db);
    batch.update(doc(db, 'meals', meal.id), {
      isDeleted: true,
      status: 'deleted',
      deletedAt: serverTimestamp(),
      deletedById: auth.currentUser?.uid || '',
      updatedAt: serverTimestamp(),
      version: Number(meal.version || 0) + 1,
    });
    stageMealAuditRecord(batch, {
      module: 'meals', action: 'delete', entityType: 'meal', entityId: meal.id, month: selectedMonth,
      summary: `Meal entry moved to history · ${meal.date}`,
      before: { userId: meal.userId, date: meal.date, lunch: meal.lunch || 0, dinner: meal.dinner || 0, guestMeal: meal.guestMeal || 0, version: meal.version || 0 },
      after: { isDeleted: true, version: Number(meal.version || 0) + 1 },
      metadata: meta,
    });
    await batch.commit();
  }, [selectedMonth]);

  const restoreMeal = useCallback(async (auditItem) => {
    const before = auditItem?.before;
    if (!auditItem?.entityId || !before) return;
    try {
      await runTransaction(db, async (transaction) => {
        const mealRef = doc(db, 'meals', auditItem.entityId);
        const currentSnapshot = await transaction.get(mealRef);
        if (!currentSnapshot.exists() || currentSnapshot.data().isDeleted !== true) {
          throw new Error('This meal entry is no longer deleted, so the old restore point was not applied.');
        }
        const current = currentSnapshot.data();
        const version = Number(current.version || 0) + 1;
        transaction.set(mealRef, {
          ...before,
          month: selectedMonth,
          isDeleted: false,
          status: 'active',
          restoredAt: serverTimestamp(),
          restoredById: auth.currentUser?.uid || '',
          updatedAt: serverTimestamp(),
          version,
        }, { merge: true });
        transaction.set(doc(collection(db, 'meals')), buildMealActivityRecord({
          module: 'meals', action: 'restore', entityType: 'meal', entityId: auditItem.entityId, month: selectedMonth,
          summary: `Restored meal entry for ${before.date}`,
          before: { isDeleted: true, version: current.version || 0 },
          after: { ...before, isDeleted: false, version },
        }));
      });
      toast.success('Meal entry restored.');
    } catch (error) {
      toast.error(error.message || 'Meal entry could not be restored.');
    }
  }, [selectedMonth]);

  const publishRate = useCallback(async (calculation = breakdown, nextConfig = rateConfig) => {
    setPublishing(true);
    try {
      if (!validMonth(selectedMonth)) throw new Error('Choose a valid month.');
      if (sourceReady.meals !== selectedMonth || sourceReady.bazar !== selectedMonth || rateReadyMonth !== selectedMonth) {
        throw new Error('Wait for this month’s meals, Bazar, and published rate to finish loading.');
      }
      if (duplicateCount > 0) throw new Error(`Resolve ${duplicateCount} duplicate meal row(s) before publishing.`);
      if (Number(calculation.totalMeals || 0) <= 0) throw new Error('A rate needs at least one meal.');
      if (Number(calculation.totalCost || 0) < 0) throw new Error('Total cost cannot be negative.');
      const reviewedConfig = {
        previousBalance: Number(nextConfig.previousBalance || 0),
        otherExpenses: Math.max(0, Number(nextConfig.otherExpenses || 0)),
        adjustments: Number(nextConfig.adjustments || 0),
        notes: nextConfig.notes || '',
      };
      const batch = writeBatch(db);
      const next = {
        ...calculation,
        ...reviewedConfig,
        month: selectedMonth,
        status: 'current',
        duplicateMealCount: 0,
        bazarEntryCount: bazarRows.filter((row) => !row.isDeleted && row.countInBazar !== false).length,
        mealEntryCount: currentMeals.length,
        revision: Number(publishedPeriod?.revision || 0) + 1,
        updatedAt: serverTimestamp(),
        updatedById: auth.currentUser?.uid || '',
        updatedByName: auth.currentUser?.displayName || auth.currentUser?.email || 'Admin',
      };
      batch.set(doc(db, 'meals', mealRatePeriodDocumentId(selectedMonth)), {
        ...next,
        recordType: MEAL_RATE_PERIOD_RECORD_TYPE,
        isSystemRecord: true,
      }, { merge: true });
      stageMealAuditRecord(batch, {
        module: 'meals', action: 'publish_rate', entityType: 'mealRatePeriod', entityId: selectedMonth, month: selectedMonth,
        summary: `Published meal rate ${money(calculation.mealRate)} for ${selectedMonth}`,
        before: publishedPeriod ? { previousBalance: publishedPeriod.previousBalance || 0, otherExpenses: publishedPeriod.otherExpenses || 0, adjustments: publishedPeriod.adjustments || 0, mealRate: publishedPeriod.mealRate || 0, revision: publishedPeriod.revision || 0 } : null,
        after: { ...calculation, ...reviewedConfig, revision: next.revision },
      });
      await batch.commit();
      setRateConfig(reviewedConfig);
      setRateConfigDirty(false);
      setChanges((current) => [{ id: `rate-${Date.now()}`, type: 'meal_rate_published', label: `Meal rate published: ${money(calculation.mealRate)}`, createdAt: new Date().toISOString() }, ...current]);
      toast.success('Canonical meal rate published to every screen.');
    } catch (error) {
      toast.error(error.message || 'Meal rate could not be published.');
      throw error;
    } finally {
      setPublishing(false);
    }
  }, [bazarRows, breakdown, currentMeals.length, duplicateCount, publishedPeriod, rateConfig, rateReadyMonth, selectedMonth, sourceReady]);

  const rateIsConsistent = Boolean(publishedPeriod) && [
    'bazarCost', 'totalMeals', 'totalCost', 'mealRate',
  ].every((key) => Math.abs(Number(publishedPeriod?.[key] || 0) - Number(breakdown[key] || 0)) < 0.000001);
  const loading = sourceReady.meals !== selectedMonth || sourceReady.bazar !== selectedMonth || rateLoading || rateReadyMonth !== selectedMonth;
  const canonicalRate = Number.isFinite(Number(publishedPeriod?.mealRate)) ? Number(publishedPeriod.mealRate) : 0;
  const canonicalTotalCost = Number.isFinite(Number(publishedPeriod?.totalCost)) ? Number(publishedPeriod.totalCost) : 0;
  const canSendNotification = !loading && Boolean(publishedPeriod) && !configDirty && rateIsConsistent && duplicateCount === 0;

  const sendNotification = async ({ channels }) => {
    setNotificationSending(true);
    try {
      if (!canSendNotification || !publishedPeriod) {
        throw new Error('Publish a consistent, duplicate-free meal rate before sending.');
      }
      const notificationSnapshot = {
        bazarCost: Number(publishedPeriod.bazarCost || 0),
        totalMeals: Number(publishedPeriod.totalMeals || 0),
        totalCost: Number(publishedPeriod.totalCost || 0),
        mealRate: Number(publishedPeriod.mealRate || 0),
        revision: Number(publishedPeriod.revision || 0),
      };
      const result = await sendReviewedWorkspaceNotification({
        recipients: activeRecipients,
        title: `NestHub meal summary · ${selectedMonth}`,
        body: `Meal tracking was reviewed by the admin.\nTotal meals: ${notificationSnapshot.totalMeals}\nGuest meals: ${totals.guest}\nMeal rate: ৳${formatRate(notificationSnapshot.mealRate)}\nTotal cost: ${money(notificationSnapshot.totalCost)}\nBazar cost: ${money(notificationSnapshot.bazarCost)}`,
        type: 'meal_summary',
        link: '/meals',
        data: { month: selectedMonth, ...notificationSnapshot, changeCount: changes.length },
        channels,
      });
      const batch = writeBatch(db);
      stageMealAuditRecord(batch, {
        module: 'meals', action: 'notify', entityType: 'notificationBatch', month: selectedMonth,
        summary: `Reviewed meal summary sent to ${result.sent}/${result.total} members`,
        after: { channels, sent: result.sent, failed: result.failed, ...notificationSnapshot },
      });
      await batch.commit().catch((error) => {
        console.error('Meal notification audit failed:', error);
      });
      setChanges([]);
      setNotificationOpen(false);
      if (result.failed) toast.error(`${result.sent} sent, ${result.failed} failed.`);
      else toast.success(`Notification sent to ${result.sent} member(s).`);
    } catch (error) {
      toast.error(error.message || 'Notification could not be sent.');
    } finally {
      setNotificationSending(false);
    }
  };

  const memberSummary = useMemo(() => members.map((member) => {
    const rows = currentMeals.filter((meal) => meal.userId === member.id);
    const summary = rows.reduce((result, meal) => ({
      lunch: result.lunch + safeMeal(meal.lunch),
      dinner: result.dinner + safeMeal(meal.dinner),
      guest: result.guest + safeMeal(meal.guestMeal),
      total: result.total + mealTotal(meal),
    }), { lunch: 0, dinner: 0, guest: 0, total: 0 });
    return { member, ...summary, cost: summary.total * canonicalRate };
  }), [canonicalRate, currentMeals, members]);

  const tabs = [
    { value: 'sheet', label: 'Meal Sheet', icon: ClipboardList },
    { value: 'summary', label: 'Monthly Summary', icon: Users },
    { value: 'rate', label: 'Rate & Formula', icon: Calculator },
    { value: 'activity', label: 'Activity', icon: Activity, count: activity.length },
  ];

  if (loading) return <div className="flex min-h-[60dvh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-4">
      <AdminPageHeader
        eyebrow="Operations / Meals"
        title="Meal tracking workspace"
        description="Fast spreadsheet entry, one transparent meal-rate formula, immutable changes, and review-before-send notifications."
        icon={UtensilsCrossed}
        actions={(
          <>
            <label className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
              <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
              <input
                type="month"
                value={selectedMonth}
                onChange={(event) => {
                  if (validMonth(event.target.value)) setSelectedMonth(event.target.value);
                }}
                className="bg-transparent outline-none"
              />
            </label>
            <ToolbarButton
              icon={BellRing}
              active={changes.length > 0 && canSendNotification}
              disabled={!canSendNotification}
              title={canSendNotification ? 'Review and send the published summary' : 'Publish a consistent, duplicate-free rate first'}
              onClick={() => setNotificationOpen(true)}
            >
              Send notification {changes.length > 0 ? `(${changes.length})` : ''}
            </ToolbarButton>
          </>
        )}
      />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <MetricCard label="Total meals" value={totals.total.toLocaleString()} detail={`${currentMeals.length} entries`} icon={Sigma} tone="amber" />
        <MetricCard label="Present meals" value={totals.present.toLocaleString()} detail="Lunch + dinner" icon={UserCheck} tone="blue" />
        <MetricCard label="Guest meals" value={totals.guest.toLocaleString()} detail="Included in total" icon={Users} tone="violet" />
        <MetricCard label="Bazar cost" value={money(breakdown.bazarCost)} detail="Counted entries" icon={ClipboardList} tone="emerald" />
        <MetricCard label="Meal rate" value={`৳${formatRate(canonicalRate)}`} detail={publishedPeriod ? `Published revision ${publishedPeriod.revision || 1}` : 'Not published'} icon={Calculator} tone="rose" />
        <MetricCard label="Total cost" value={money(canonicalTotalCost)} detail="Published transparent total" icon={Save} tone="slate" />
      </div>

      <ViewTabs value={view} onChange={setView} items={tabs} />

      {duplicateCount > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {duplicateCount} duplicate meal document(s) exist across {duplicateGroups.length} member/date cell(s). The newest record is used for totals; remove the duplicates from the Meal Sheet before publishing or notifying.
        </div>
      )}

      {!loading && !configDirty && publishedPeriod && !rateIsConsistent && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs font-semibold text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
          Source totals changed. The canonical rate is being recalculated; notification sending stays locked until every screen has the same value.
        </div>
      )}

      {view === 'sheet' && (
        <MealSpreadsheet
          members={members}
          meals={meals}
          month={selectedMonth}
          onUpsert={upsertMeal}
          onBulkUpsert={bulkUpsertMeals}
          onSoftDelete={softDeleteMeal}
          onChanges={recordChanges}
        />
      )}

      {view === 'summary' && (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">Individual monthly meal summary</h2>
            <p className="mt-0.5 text-[10px] text-slate-400">Every member uses the same published rate: ৳{formatRate(canonicalRate)}.</p>
          </div>
          {!memberSummary.length ? <EmptyState icon={Users} title="No members" /> : (
            <div className="overflow-auto">
              <table className="w-full min-w-[720px] border-collapse text-xs">
                <thead className="sticky top-0 bg-slate-50 dark:bg-slate-950"><tr>{['Member', 'Room', 'Lunch', 'Dinner', 'Guest', 'Total', 'Meal cost'].map((label) => <th key={label} className="border-b border-slate-200 px-3 py-2 text-left text-[9px] font-bold uppercase tracking-wide text-slate-400 dark:border-slate-800">{label}</th>)}</tr></thead>
                <tbody>{memberSummary.map((row) => <tr key={row.member.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800"><td className="px-3 py-2.5 font-semibold text-slate-900 dark:text-white">{memberName(row.member)}</td><td className="px-3 py-2.5 text-slate-500">{row.member.room || '—'}</td><td className="px-3 py-2.5">{row.lunch}</td><td className="px-3 py-2.5">{row.dinner}</td><td className="px-3 py-2.5">{row.guest}</td><td className="px-3 py-2.5 font-bold">{row.total}</td><td className="px-3 py-2.5 font-bold text-emerald-700 dark:text-emerald-300">{money(row.cost)}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {view === 'rate' && (
        <MealRatePanel
          breakdown={ratePanelBreakdown}
          config={{ ...rateConfig, isDirty: configDirty }}
          onConfigChange={handleRateConfigChange}
          onPublish={publishRate}
          activity={activity.filter((item) => item.action === 'publish_rate')}
          publishing={publishing}
        />
      )}

      {view === 'activity' && <ActivityPanel items={activity} moduleName="meal" onRestore={restoreMeal} />}

      <NotificationReviewModal
        open={notificationOpen}
        onClose={() => setNotificationOpen(false)}
        moduleName="Meal Tracking"
        title={`Meal summary updated · ${selectedMonth}`}
        summary="The meal sheet and transparent published calculation have been reviewed. This preview uses the same immutable rate revision shown to every member."
        dateLabel={`Monthly period ${selectedMonth}`}
        metrics={[
          { label: 'Total meals', value: publishedPeriod?.totalMeals || 0 },
          { label: 'Updated meal rate', value: `৳${formatRate(canonicalRate)}` },
          { label: 'Total Bazar', value: money(publishedPeriod?.bazarCost || 0) },
          { label: 'Monthly cost', value: money(canonicalTotalCost) },
        ]}
        changes={changes}
        recipients={activeRecipients}
        onConfirm={sendNotification}
        sending={notificationSending}
      />
    </div>
  );
}
