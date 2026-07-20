'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  ArrowUp,
  BellRing,
  CalendarDays,
  Calculator,
  ChevronRight,
  ClipboardList,
  Cloud,
  Command,
  Sparkles,
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
import { currentMealRecords, dedupeMealRecords, duplicateMealGroups, mealDocumentId } from '@/lib/mealRecords';
import { buildAuditRecord } from '@/lib/adminAudit';
import useMealRatePeriod from '@/app/hooks/useMealRatePeriod';
import MealSpreadsheet from '@/components/admin/meals/MealSpreadsheet';
import MealRatePanel from '@/components/admin/meals/MealRatePanel';
import MealStatsCards from '@/components/admin/meals/MealStatsCards';
import MealActivityRail from '@/components/admin/meals/MealActivityRail';
import MealNotificationCenter from '@/components/admin/meals/MealNotificationCenter';
import { sendReviewedWorkspaceNotification } from '@/lib/adminNotification';
import { EmptyState } from '@/components/admin/ui/AdminUI';

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

function money(value) {
  return `৳${Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function dhakaDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${lookup.year}-${lookup.month}-${lookup.day}`;
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
  const [sourceErrors, setSourceErrors] = useState({ meals: '', bazar: '' });
  const [sheetSyncState, setSheetSyncState] = useState({ pending: 0, errors: 0, state: 'synced' });
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
  const notificationSendLock = useRef(false);

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
    setSourceErrors({ meals: '', bazar: '' });
    setSheetSyncState({ pending: 0, errors: 0, state: 'synced' });
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
        setSourceErrors((current) => ({ ...current, meals: '' }));
      },
      (error) => {
        console.error('Meal workspace listener failed:', error);
        setSourceErrors((current) => ({ ...current, meals: error?.message || 'Meal data could not be loaded.' }));
      }
    );

    const unsubscribeBazar = onSnapshot(
      query(collection(db, 'bazar'), where('month', '==', selectedMonth)),
      (snapshot) => {
        setBazarRows(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
        setSourceReady((current) => ({ ...current, bazar: selectedMonth }));
        setSourceErrors((current) => ({ ...current, bazar: '' }));
      },
      (error) => {
        console.error('Meal workspace Bazar listener failed:', error);
        setSourceErrors((current) => ({ ...current, bazar: error?.message || 'Bazar data could not be loaded.' }));
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
    if (!validMonth(selectedMonth) || !sourcesReady || sourceErrors.meals || sourceErrors.bazar || rateLoading || rateReadyMonth !== selectedMonth || configDirty) return;
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
  }, [bazarRows, bazarTotals.house, configDirty, currentMeals.length, duplicateCount, publishedPeriod, rateLoading, rateReadyMonth, selectedMonth, sourceErrors.bazar, sourceErrors.meals, sourceReady, totals.total]);

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
    const currentMonthItems = items.filter((item) => !item?.month || item.month === selectedMonth);
    if (!currentMonthItems.length) return;
    setChanges((current) => [...currentMonthItems, ...current].slice(0, 300));
  }, [selectedMonth]);

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
      mealCode: String(entry.mealCode ?? existing?.mealCode ?? '').trim(),
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
      before: existing ? { lunch: existing.lunch || 0, dinner: existing.dinner || 0, guestMeal: existing.guestMeal || 0, mealCode: existing.mealCode || '', version: existing.version || 0 } : null,
      after: { ...values, mealCode: next.mealCode, totalMeal: next.totalMeal, version: next.version },
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
          mealCode: String(entry.mealCode ?? existing?.mealCode ?? '').trim(),
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
          before: existing ? { lunch: existing.lunch || 0, dinner: existing.dinner || 0, guestMeal: existing.guestMeal || 0, mealCode: existing.mealCode || '', version: existing.version || 0 } : null,
          after: { ...values, mealCode: next.mealCode, totalMeal: next.totalMeal, version: next.version },
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
      before: { userId: meal.userId, date: meal.date, lunch: meal.lunch || 0, dinner: meal.dinner || 0, guestMeal: meal.guestMeal || 0, mealCode: meal.mealCode || '', version: meal.version || 0 },
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
      if (sourceErrors.meals || sourceErrors.bazar) throw new Error('Resolve the meal or Bazar sync error before publishing.');
      if (sheetSyncState.pending > 0) throw new Error('Wait for spreadsheet changes to finish saving.');
      if (sheetSyncState.errors > 0) throw new Error('Resolve spreadsheet save errors before publishing.');
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
  }, [bazarRows, breakdown, currentMeals.length, duplicateCount, publishedPeriod, rateConfig, rateReadyMonth, selectedMonth, sheetSyncState.errors, sheetSyncState.pending, sourceErrors.bazar, sourceErrors.meals, sourceReady]);

  const rateIsConsistent = Boolean(publishedPeriod) && [
    'bazarCost', 'totalMeals', 'totalCost', 'mealRate',
  ].every((key) => Math.abs(Number(publishedPeriod?.[key] || 0) - Number(breakdown[key] || 0)) < 0.000001);
  const sourceFailed = Boolean(sourceErrors.meals || sourceErrors.bazar);
  const loading = !sourceFailed && (sourceReady.meals !== selectedMonth || sourceReady.bazar !== selectedMonth || rateLoading || rateReadyMonth !== selectedMonth);
  const canonicalRate = Number.isFinite(Number(publishedPeriod?.mealRate)) ? Number(publishedPeriod.mealRate) : 0;
  const canonicalTotalCost = Number.isFinite(Number(publishedPeriod?.totalCost)) ? Number(publishedPeriod.totalCost) : 0;
  const canSendNotification = !loading && !sourceFailed && sheetSyncState.pending === 0 && sheetSyncState.errors === 0 && Boolean(publishedPeriod) && !configDirty && rateIsConsistent && duplicateCount === 0;

  const sendNotification = async ({
    channels,
    recipients = activeRecipients,
    notificationType = 'meal_summary',
    title,
    message,
  }) => {
    if (notificationSendLock.current) return;
    notificationSendLock.current = true;
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
        recipients,
        title: title || `NestHub meal summary · ${selectedMonth}`,
        body: message || `Meal tracking was reviewed by the admin.\nTotal meals: ${notificationSnapshot.totalMeals}\nGuest meals: ${totals.guest}\nMeal rate: ৳${formatRate(notificationSnapshot.mealRate)}\nTotal cost: ${money(notificationSnapshot.totalCost)}\nBazar cost: ${money(notificationSnapshot.bazarCost)}`,
        type: notificationType,
        link: '/meals',
        data: { month: selectedMonth, ...notificationSnapshot, changeCount: changes.length },
        channels,
      });
      const batch = writeBatch(db);
      stageMealAuditRecord(batch, {
        module: 'meals', action: 'notify', entityType: 'notificationBatch', month: selectedMonth,
        summary: `${notificationType.replaceAll('_', ' ')} sent to ${result.sent}/${result.total} members`,
        after: { channels, notificationType, sent: result.sent, failed: result.failed, ...notificationSnapshot },
      });
      await batch.commit().catch((error) => {
        console.error('Meal notification audit failed:', error);
      });
      const recipientId = (recipient) => recipient?.id || recipient?.uid || recipient?.userId || '';
      const sentAudience = new Set(recipients.map(recipientId).filter(Boolean));
      const completeAudience = activeRecipients.every((recipient) => sentAudience.has(recipientId(recipient))) && sentAudience.size === activeRecipients.length;
      if (!result.failed && notificationType === 'meal_summary' && completeAudience) setChanges([]);
      if (result.failed) {
        toast.error(`${result.sent} sent, ${result.failed} failed. The review stays open for retry.`);
      } else {
        setNotificationOpen(false);
        toast.success(`Notification sent to ${result.sent} member(s).`);
      }
    } catch (error) {
      toast.error(error.message || 'Notification could not be sent.');
    } finally {
      notificationSendLock.current = false;
      setNotificationSending(false);
    }
  };

  const memberSummary = useMemo(() => members.map((member) => {
    const rows = currentMeals.filter((meal) => meal.userId === member.id);
    const total = rows.reduce((sum, meal) => sum + mealTotal(meal), 0);
    const cost = total * canonicalRate;
    const bazarPaid = Number(bazarTotals.byMember?.[member.id] || 0);
    return {
      member,
      recordedDays: new Set(rows.map((meal) => meal.date)).size,
      total,
      cost,
      bazarPaid,
      balance: cost - bazarPaid,
    };
  }), [bazarTotals.byMember, canonicalRate, currentMeals, members]);

  const today = dhakaDate();
  const todayMeals = useMemo(() => currentMeals.reduce((sum, meal) => (
    meal.date === today ? sum + mealTotal(meal) : sum
  ), 0), [currentMeals, today]);
  const pendingBills = useMemo(() => memberSummary.reduce((sum, item) => (
    sum + Math.max(0, item.balance)
  ), 0), [memberSummary]);
  const activityItems = useMemo(() => {
    const liveLabels = new Set(changes.map((item) => item.label || item.summary).filter(Boolean));
    return [
      ...changes,
      ...activity.filter((item) => !liveLabels.has(item.summary || item.label)),
    ];
  }, [activity, changes]);

  const tabs = [
    { value: 'sheet', label: 'Meal Sheet', icon: ClipboardList },
    { value: 'summary', label: 'Monthly Summary', icon: Users },
    { value: 'rate', label: 'Rate & Formula', icon: Calculator },
  ];

  if (loading) return (
    <div className="space-y-4" aria-label="Loading meal workspace" aria-busy="true">
      <div className="h-28 animate-pulse rounded-2xl bg-slate-800" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {[
          'bg-blue-600',
          'bg-green-600',
          'bg-violet-600',
          'bg-red-600',
          'bg-cyan-600',
          'bg-amber-500',
        ].map((tone) => (
          <div key={tone} className={`h-36 animate-pulse rounded-2xl ${tone}`} />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="h-[520px] animate-pulse rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" />
        <div className="hidden h-[520px] animate-pulse rounded-2xl bg-slate-800 xl:block" />
      </div>
    </div>
  );

  return (
    <div className="min-w-0 space-y-4 pb-48">
      <section className="relative overflow-hidden rounded-2xl bg-[#1E293B] px-4 py-4 text-white shadow-xl shadow-slate-950/10 sm:px-5 sm:py-5">
        <div aria-hidden="true" className="absolute -right-16 -top-20 h-52 w-52 rounded-full border-[28px] border-white/5" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-[#2563EB] shadow-lg shadow-blue-950/30">
              <UtensilsCrossed className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="flex items-center gap-1 text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">
                Operations <ChevronRight className="h-3 w-3" /> Meal management
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-black tracking-tight sm:text-2xl">Meal control center</h1>
                <span className="flex items-center gap-1.5 rounded-full bg-[#16A34A] px-2 py-1 text-[9px] font-black uppercase tracking-wide text-white">
                  <Cloud className="h-3 w-3" /> Live
                </span>
              </div>
              <p className="mt-1 max-w-2xl text-xs font-medium leading-5 text-slate-300">A fast daily spreadsheet with background sync, transparent rates, and review-before-send communication.</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="hidden items-center gap-2 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-[10px] font-bold text-slate-300 xl:flex">
              <Command className="h-3.5 w-3.5 text-blue-400" /> Keyboard ready
            </span>
            <label className="flex h-10 items-center gap-2 rounded-lg border border-slate-600 bg-slate-800 px-3 text-xs font-bold text-white transition focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-500/20">
              <CalendarDays className="h-4 w-4 text-blue-400" />
              <input
                type="month"
                value={selectedMonth}
                disabled={sheetSyncState.pending > 0}
                onChange={(event) => {
                  if (validMonth(event.target.value)) setSelectedMonth(event.target.value);
                }}
                className="bg-transparent outline-none [color-scheme:dark]"
                aria-label="Meal sheet month"
              />
            </label>
            <button
              type="button"
              disabled={!canSendNotification}
              title={canSendNotification ? 'Open manual notification center' : 'Publish a consistent, duplicate-free rate first'}
              onClick={() => setNotificationOpen(true)}
              className="group relative flex h-10 items-center gap-2 overflow-hidden rounded-lg bg-[#2563EB] px-3 text-xs font-black text-white shadow-lg shadow-blue-950/30 transition hover:bg-blue-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
            >
              <span className="pointer-events-none absolute inset-0 scale-0 rounded-full bg-white/20 transition-transform duration-300 group-active:scale-150" />
              <BellRing className="relative h-4 w-4" />
              <span className="relative">Notification center</span>
              {changes.length > 0 && <span className="relative rounded bg-white/20 px-1.5 py-0.5 text-[9px]">{changes.length}</span>}
            </button>
          </div>
        </div>
      </section>

      <MealStatsCards
        stats={{
          totalMeals: { value: totals.total, detail: `${currentMeals.length} saved daily entries`, maximumFractionDigits: 2 },
          todayMeals: { value: todayMeals, detail: today.slice(0, 7) === selectedMonth ? `${today} live total` : 'Selected month is not current', maximumFractionDigits: 2 },
          mealRate: { value: canonicalRate, detail: publishedPeriod ? `Published revision ${publishedPeriod.revision || 1}` : 'Preview not published', minimumFractionDigits: 2, maximumFractionDigits: 2 },
          pendingBills: { value: pendingBills, detail: 'Meal cost less member Bazar', prefix: '৳', maximumFractionDigits: 0 },
          activeMembers: { value: members.length, detail: 'Active members with rooms' },
          monthlyExpense: { value: breakdown.bazarCost, detail: 'Counted Bazar spend', prefix: '৳', maximumFractionDigits: 0 },
        }}
      />

      <nav aria-label="Meal workspace views" className="flex min-w-0 items-center gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 shadow-sm [scrollbar-width:none] dark:border-slate-800 dark:bg-slate-900 [&::-webkit-scrollbar]:hidden">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = view === tab.value;
          return (
            <button key={tab.value} type="button" disabled={sheetSyncState.pending > 0} aria-current={active ? 'page' : undefined} onClick={() => setView(tab.value)} className={`flex h-9 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-xs font-black transition disabled:cursor-wait disabled:opacity-50 ${active ? 'bg-[#2563EB] text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'}`}>
              <Icon className="h-3.5 w-3.5" />{tab.label}
            </button>
          );
        })}
        <span className="ml-auto hidden items-center gap-1.5 px-3 text-[10px] font-bold text-slate-400 sm:flex"><Sparkles className="h-3.5 w-3.5 text-violet-500" />Autosave enabled</span>
      </nav>

      {sourceFailed && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-700 bg-[#DC2626] px-4 py-3 text-white shadow-lg shadow-red-700/15">
          <Cloud className="mt-0.5 h-4 w-4 flex-none" />
          <div>
            <p className="text-xs font-black">Live source sync is unavailable</p>
            <p className="mt-0.5 text-[10px] font-semibold text-red-100">{sourceErrors.meals || sourceErrors.bazar} Existing published figures are protected; publishing and notifications stay locked.</p>
          </div>
        </div>
      )}

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

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
        <div className="min-w-0">
          {view === 'sheet' && (
            <MealSpreadsheet
              members={members}
              meals={meals}
              month={selectedMonth}
              onUpsert={upsertMeal}
              onBulkUpsert={bulkUpsertMeals}
              onSoftDelete={softDeleteMeal}
              onChanges={recordChanges}
              onOpenNotification={canSendNotification ? () => setNotificationOpen(true) : undefined}
              onSyncStateChange={setSheetSyncState}
            />
          )}

          {view === 'summary' && (
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg shadow-slate-950/5 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4 dark:border-slate-800">
                <div>
                  <h2 className="text-sm font-black text-slate-900 dark:text-white">Member meal accounts</h2>
                  <p className="mt-0.5 text-[10px] font-medium text-slate-400">One unified daily value · published rate ৳{formatRate(canonicalRate)}</p>
                </div>
                <span className="rounded-lg bg-[#7C3AED] px-2.5 py-1.5 text-[9px] font-black uppercase tracking-wide text-white">{selectedMonth}</span>
              </div>
              {!memberSummary.length ? <EmptyState icon={Users} title="No members" /> : (
                <div className="max-h-[650px] overflow-auto">
                  <table className="w-full min-w-[760px] border-collapse text-xs">
                    <thead className="sticky top-0 z-10 bg-[#334155] text-white"><tr>{['Member', 'Room', 'Recorded days', 'Total meals', 'Meal cost', 'Bazar paid', 'Balance'].map((label) => <th key={label} className="border-r border-slate-500 px-3 py-3 text-left text-[9px] font-black uppercase tracking-[0.1em] last:border-r-0">{label}</th>)}</tr></thead>
                    <tbody>{memberSummary.map((row, index) => (
                      <tr key={row.member.id} className={`border-b border-slate-200 transition hover:bg-blue-50 dark:border-slate-800 dark:hover:bg-slate-800 ${index % 2 ? 'bg-slate-50 dark:bg-slate-900' : 'bg-white dark:bg-slate-950'}`}>
                        <td className="px-3 py-3 font-black text-slate-900 dark:text-white">{memberName(row.member)}</td>
                        <td className="px-3 py-3 font-bold text-slate-500">{row.member.room || '—'}</td>
                        <td className="px-3 py-3 font-bold tabular-nums">{row.recordedDays}</td>
                        <td className="px-3 py-3 font-black tabular-nums text-blue-700 dark:text-blue-300">{row.total}</td>
                        <td className="px-3 py-3 font-black tabular-nums">{money(row.cost)}</td>
                        <td className="px-3 py-3 font-bold tabular-nums text-cyan-700 dark:text-cyan-300">{money(row.bazarPaid)}</td>
                        <td className={`px-3 py-3 font-black tabular-nums ${row.balance > 0 ? 'text-red-600' : 'text-green-600'}`}>{row.balance > 0 ? money(row.balance) : row.balance < 0 ? `−${money(Math.abs(row.balance))}` : 'Settled'}</td>
                      </tr>
                    ))}</tbody>
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
        </div>

        <div className="xl:sticky xl:top-32">
          <MealActivityRail
            items={activityItems}
            syncStatus={sheetSyncState.state === 'syncing'
              ? 'syncing'
              : sheetSyncState.state === 'error'
                ? 'error'
                : changes.length
                  ? { state: 'synced', label: 'Saved · ready to review', detail: `${changes.length} unsent change${changes.length === 1 ? '' : 's'}` }
                  : 'synced'}
            onRestore={restoreMeal}
          />
        </div>
      </div>

      <MealNotificationCenter
        open={notificationOpen}
        onClose={() => setNotificationOpen(false)}
        members={activeRecipients}
        defaultTitle={`NestHub meal summary · ${selectedMonth}`}
        defaultMessage={`The ${selectedMonth} meal sheet has been reviewed. Total meals: ${publishedPeriod?.totalMeals || 0}. Published meal rate: ৳${formatRate(canonicalRate)}. Open NestHub to see your personal summary.`}
        summaryMetrics={[
          { label: 'Total meals', value: publishedPeriod?.totalMeals || 0 },
          { label: 'Meal rate', value: `৳${formatRate(canonicalRate)}` },
          { label: 'Total Bazar', value: money(publishedPeriod?.bazarCost || 0) },
          { label: 'Monthly cost', value: money(canonicalTotalCost) },
        ]}
        onConfirm={sendNotification}
        sending={notificationSending}
      />

      <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] right-4 z-40 flex flex-col items-end gap-2 md:bottom-6 md:right-6 print:hidden">
        <button type="button" disabled={sheetSyncState.pending > 0} onClick={() => { setView('rate'); window.scrollTo({ top: 0, behavior: 'smooth' }); }} title="Open rate and formula" className="flex h-10 items-center gap-2 rounded-full bg-[#7C3AED] px-3 text-[10px] font-black text-white shadow-xl transition hover:scale-[1.03] hover:bg-violet-700 active:scale-95 disabled:cursor-wait disabled:opacity-50"><Calculator className="h-4 w-4" />Rate</button>
        <button type="button" disabled={!canSendNotification} onClick={() => setNotificationOpen(true)} title={canSendNotification ? 'Open notification center' : 'Publish a consistent rate first'} className="flex h-12 items-center gap-2 rounded-full bg-[#2563EB] px-4 text-xs font-black text-white shadow-2xl shadow-blue-600/30 transition hover:scale-[1.03] hover:bg-blue-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-45"><BellRing className="h-4 w-4" />Notify members</button>
        <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} title="Back to top" className="flex h-9 items-center gap-2 rounded-full bg-[#1E293B] px-3 text-[10px] font-black text-white shadow-lg transition hover:scale-[1.03] hover:bg-slate-700 active:scale-95"><ArrowUp className="h-3.5 w-3.5" />Top</button>
      </div>
    </div>
  );
}
