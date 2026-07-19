'use client'

import { useEffect, useMemo, useState } from 'react';
import { db } from '@/lib/firebase';
import {
  collection,
  addDoc,
  writeBatch,
  doc,
  serverTimestamp,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import {
  Bell,
  Calendar,
  Check,
  Loader2,
  Minus,
  Plus,
  Save,
  Send,
  Sparkles,
  User,
  Users,
  Utensils,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { sendAdminChatUpdate } from '@/lib/adminChatMessage';
import { calculateMonthlyBazarTotals } from '@/lib/bazarCalculations';
import { isMemberAccountActive } from '@/lib/memberPolicy';

const QUICK_MEAL_VALUES = [0, 0.5, 1, 1.5, 2, 2.5, 3];

function toMealNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Number(number.toFixed(2)));
}

function formatMeal(value) {
  const number = toMealNumber(value);
  return Number.isInteger(number) ? String(number) : number.toFixed(2);
}

function formatRate(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) return '0.00';

  return number.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function taka(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) return '৳0';

  return `৳${Math.round(number).toLocaleString()}`;
}

async function syncToGoogleSheet(memberName, date, lunch, dinner) {
  const res = await fetch('/api/update-sheet', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      memberName,
      date,
      lunch,
      dinner,
    }),
  });

  if (!res.ok) {
    throw new Error('Google Sheet update failed');
  }

  return res.json().catch(() => ({}));
}

function memberName(user) {
  return (
    user?.name ||
    user?.displayName ||
    user?.fullName ||
    user?.email ||
    'Member'
  );
}

function memberPhoto(user) {
  return user?.photoURL || user?.photo || user?.avatar || user?.image || '';
}

function memberInitial(user) {
  return memberName(user).charAt(0).toUpperCase();
}

function memberFirstName(user) {
  return (
    user?.name?.split(' ')[0] ||
    user?.displayName?.split(' ')[0] ||
    user?.fullName?.split(' ')[0] ||
    user?.email ||
    'Member'
  );
}

function getMealTotalFromRow(row) {
  return toMealNumber(
    toMealNumber(row?.lunch) +
      toMealNumber(row?.dinner) +
      toMealNumber(row?.guestMeal)
  );
}

async function getMealSnapshotForMonth(month, newEntries = []) {
  const mealsQuery = query(
    collection(db, 'meals'),
    where('month', '==', month)
  );

  const bazarQuery = query(
    collection(db, 'bazar'),
    where('month', '==', month)
  );

  const [mealsSnap, bazarSnap] = await Promise.all([
    getDocs(mealsQuery),
    getDocs(bazarQuery),
  ]);

  const existingMealTotal = mealsSnap.docs.reduce((sum, item) => {
    return sum + getMealTotalFromRow(item.data());
  }, 0);

  const newMealTotal = newEntries.reduce((sum, item) => {
    return sum + toMealNumber(item.totalMeal);
  }, 0);

  const totalBazar = calculateMonthlyBazarTotals(
    bazarSnap.docs.map((item) => item.data()),
    month
  ).house;

  const overallMeals = toMealNumber(existingMealTotal + newMealTotal);
  const mealRate = overallMeals > 0 ? totalBazar / overallMeals : 0;

  return {
    overallMeals,
    totalBazar,
    mealRate,
  };
}

function buildMealEntryNotificationBody({
  userName,
  action,
  date,
  month,
  lunch,
  dinner,
  guestMeal,
  totalMeal,
  mealRate,
  entryCost,
  notes,
}) {
  const actionText = action === 'meal_edited' ? 'updated' : 'added';

  return `Dear ${userName},

Your meal entry has been ${actionText}.

Month: ${month}
Date: ${date}

Lunch: ${formatMeal(lunch)}
Dinner: ${formatMeal(dinner)}
Guest Meal: ${formatMeal(guestMeal)}
Total Meal: ${formatMeal(totalMeal)}

Meal Rate at this time: ৳${formatRate(mealRate)}/meal
Entry Cost at this time: ${taka(entryCost)}

Reason: ${notes || 'Meal entry recorded by admin.'}

This notification is a fixed snapshot. Later meal rate changes will not change this notification.

- NestHub Team`;
}

function buildMealPushBody({
  date,
  lunch,
  dinner,
  guestMeal,
  totalMeal,
  mealRate,
}) {
  return `Meal added for ${date}. Lunch: ${formatMeal(lunch)}, Dinner: ${formatMeal(
    dinner
  )}, Guest: ${formatMeal(guestMeal)}, Total: ${formatMeal(
    totalMeal
  )}. Rate: ৳${formatRate(mealRate)}/meal.`;
}

async function createMealEntryNotification({
  userId,
  userName,
  action = 'meal_added',
  month,
  date,
  lunch,
  dinner,
  guestMeal,
  totalMeal,
  notes,
  snapshot,
}) {
  const entryCost = totalMeal * snapshot.mealRate;

  const title =
    action === 'meal_edited'
      ? 'NestHub - Meal Edited'
      : 'NestHub - Meal Added';

  const body = buildMealEntryNotificationBody({
    userName,
    action,
    date,
    month,
    lunch,
    dinner,
    guestMeal,
    totalMeal,
    mealRate: snapshot.mealRate,
    entryCost,
    notes,
  });

  const pushBody = buildMealPushBody({
    date,
    lunch,
    dinner,
    guestMeal,
    totalMeal,
    mealRate: snapshot.mealRate,
  });

  await addDoc(collection(db, 'notifications'), {
    userId,
    type: action,
    title,
    body,
    data: {
      type: action,
      action,
      month,
      monthId: month,
      date,
      userName,
      lunch: toMealNumber(lunch),
      dinner: toMealNumber(dinner),
      guestMeal: toMealNumber(guestMeal),
      totalMeal: toMealNumber(totalMeal),
      mealRateSnapshot: snapshot.mealRate,
      entryCostSnapshot: entryCost,
      totalBazarSnapshot: snapshot.totalBazar,
      overallMealsSnapshot: snapshot.overallMeals,
      reason: notes || 'Meal entry recorded by admin.',
      notes: notes || '',
    },
    read: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return {
    title,
    body,
    pushBody,
  };
}

function MemberAvatar({ user, selected = false }) {
  const photo = memberPhoto(user);

  if (photo) {
    return (
      <img
        src={photo}
        alt={memberName(user)}
        className={`h-10 w-10 rounded-2xl object-cover ring-2 ${
          selected ? 'ring-white/80' : 'ring-gray-100'
        }`}
      />
    );
  }

  return (
    <div
      className={`flex h-10 w-10 items-center justify-center rounded-2xl text-sm font-black ring-2 ${
        selected
          ? 'bg-white text-violet-700 ring-white/80'
          : 'bg-violet-100 text-violet-700 ring-gray-100'
      }`}
    >
      {memberInitial(user)}
    </div>
  );
}

function MealCounter({ label, value, onChange, color = 'amber' }) {
  const colorClass = {
    amber: {
      box: 'border-amber-200 bg-amber-50',
      text: 'text-amber-700',
      button: 'border-amber-200 text-amber-700 hover:bg-amber-100',
      active: 'bg-amber-500 text-white border-amber-500',
      input:
        'border-amber-200 text-amber-700 focus:border-amber-400 focus:ring-amber-500/20',
    },
    blue: {
      box: 'border-blue-200 bg-blue-50',
      text: 'text-blue-700',
      button: 'border-blue-200 text-blue-700 hover:bg-blue-100',
      active: 'bg-blue-500 text-white border-blue-500',
      input:
        'border-blue-200 text-blue-700 focus:border-blue-400 focus:ring-blue-500/20',
    },
    emerald: {
      box: 'border-emerald-200 bg-emerald-50',
      text: 'text-emerald-700',
      button: 'border-emerald-200 text-emerald-700 hover:bg-emerald-100',
      active: 'bg-emerald-500 text-white border-emerald-500',
      input:
        'border-emerald-200 text-emerald-700 focus:border-emerald-400 focus:ring-emerald-500/20',
    },
  }[color];

  const currentValue = toMealNumber(value);

  const changeBy = (amount) => {
    onChange(toMealNumber(currentValue + amount));
  };

  return (
    <div className={`rounded-2xl border p-3 ${colorClass.box}`}>
      <p
        className={`mb-2 text-center text-[11px] font-black uppercase ${colorClass.text}`}
      >
        {label}
      </p>

      <div className="flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => changeBy(-0.5)}
          className={`flex h-8 w-8 items-center justify-center rounded-xl border bg-white transition ${colorClass.button}`}
        >
          <Minus className="h-3.5 w-3.5" />
        </button>

        <input
          type="number"
          min="0"
          step="0.5"
          value={currentValue}
          onChange={(event) => onChange(toMealNumber(event.target.value))}
          className={`h-10 w-16 rounded-xl border-2 bg-white px-1 text-center text-lg font-black outline-none transition focus:ring-2 ${colorClass.input}`}
        />

        <button
          type="button"
          onClick={() => changeBy(0.5)}
          className={`flex h-8 w-8 items-center justify-center rounded-xl border bg-white transition ${colorClass.button}`}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-1.5 sm:grid-cols-7">
        {QUICK_MEAL_VALUES.map((item) => {
          const active = currentValue === item;

          return (
            <button
              key={item}
              type="button"
              onClick={() => onChange(item)}
              className={`rounded-lg border px-1 py-1.5 text-[10px] font-black transition ${
                active ? colorClass.active : `bg-white ${colorClass.button}`
              }`}
            >
              {formatMeal(item)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function MealForm({ users, onSuccess, notificationsEnabled = false }) {
  const [userId, setUserId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  const [lunch, setLunch] = useState(0);
  const [dinner, setDinner] = useState(0);
  const [guestMeal, setGuestMeal] = useState(0);
  const [notes, setNotes] = useState('');

  const [saving, setSaving] = useState(false);
  const [sheetSending, setSheetSending] = useState(false);

  const [bulkMode, setBulkMode] = useState(false);
  const [bulkLunch, setBulkLunch] = useState(0);
  const [bulkDinner, setBulkDinner] = useState(0);
  const [bulkGuest, setBulkGuest] = useState(0);
  const [selectedUsers, setSelectedUsers] = useState([]);

  const activeUsers = useMemo(() => {
    return users.filter((user) => {
      return isMemberAccountActive(user) && Boolean(String(user?.room || '').trim());
    });
  }, [users]);

  const selectedUser = useMemo(() => {
    return activeUsers.find((user) => user.id === userId);
  }, [activeUsers, userId]);

  const totalMeals = bulkMode
    ? toMealNumber(bulkLunch + bulkDinner + bulkGuest)
    : toMealNumber(lunch + dinner + guestMeal);

  const toggleUserSelection = (uid) => {
    setSelectedUsers((prev) => {
      if (prev.includes(uid)) {
        return prev.filter((id) => id !== uid);
      }

      return [...prev, uid];
    });
  };

  const selectAllUsers = () => {
    setSelectedUsers((old) => {
      if (old.length === activeUsers.length) {
        return [];
      }

      return activeUsers.map((user) => user.id);
    });
  };

  const resetSingleForm = () => {
    setLunch(0);
    setDinner(0);
    setGuestMeal(0);
    setNotes('');
  };

  const resetBulkForm = () => {
    setBulkLunch(0);
    setBulkDinner(0);
    setBulkGuest(0);
    setSelectedUsers([]);
    setNotes('');
  };

  const validateMealInput = () => {
    if (bulkMode) {
      if (selectedUsers.length === 0) {
        toast.error('Select at least one member');
        return false;
      }

      if (totalMeals <= 0) {
        toast.error('Enter at least one meal count');
        return false;
      }

      return true;
    }

    if (!userId) {
      toast.error('Select a member');
      return false;
    }

    if (totalMeals <= 0) {
      toast.error('Enter at least one meal');
      return false;
    }

    return true;
  };

  const handleSendToSheet = async () => {
    if (!validateMealInput()) return;

    setSheetSending(true);

    const loadingToast = toast.loading('Sending to Google Sheet...');

    try {
      if (bulkMode) {
        const usersToSend = activeUsers.filter((user) =>
          selectedUsers.includes(user.id)
        );

        let sentCount = 0;

        for (const user of usersToSend) {
          await syncToGoogleSheet(
            memberFirstName(user),
            date,
            toMealNumber(bulkLunch),
            toMealNumber(bulkDinner)
          );

          sentCount++;
        }

        toast.dismiss(loadingToast);
        toast.success(`Sent to Google Sheet for ${sentCount} member(s)!`, {
          icon: '📄',
          duration: 3000,
        });
      } else {
        await syncToGoogleSheet(
          memberFirstName(selectedUser),
          date,
          toMealNumber(lunch),
          toMealNumber(dinner)
        );

        toast.dismiss(loadingToast);
        toast.success('Sent to Google Sheet!', {
          icon: '📄',
          duration: 3000,
        });
      }
    } catch (error) {
      toast.dismiss(loadingToast);
      console.error('Google Sheet sync error:', error);
      toast.error('Failed to send to Google Sheet.');
    } finally {
      setSheetSending(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!validateMealInput()) return;

    setSaving(true);

    const loadingToast = toast.loading('Recording meal entry...');

    try {
      const month = date.substring(0, 7);

      if (bulkMode) {
        const usersToSave = activeUsers.filter((user) =>
          selectedUsers.includes(user.id)
        );

        const totalMeal = toMealNumber(bulkLunch + bulkDinner + bulkGuest);

        const mealData = {
          lunch: toMealNumber(bulkLunch),
          dinner: toMealNumber(bulkDinner),
          guestMeal: toMealNumber(bulkGuest),
          totalMeal,
          date,
          notes,
        };

        const snapshot = await getMealSnapshotForMonth(
          month,
          usersToSave.map((user) => ({
            userId: user.id,
            totalMeal,
          }))
        );

        const batch = writeBatch(db);

        if (notificationsEnabled) for (const user of usersToSave) {
          const ref = doc(collection(db, 'meals'));

          batch.set(ref, {
            userId: user.id,
            date,
            month,
            lunch: toMealNumber(bulkLunch),
            dinner: toMealNumber(bulkDinner),
            guestMeal: toMealNumber(bulkGuest),
            guestName: '',
            totalMeal,
            mealRate: 0,
            totalCost: 0,
            notes: notes || '',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }

        await batch.commit();

        for (const user of usersToSave) {
          await createMealEntryNotification({
            userId: user.id,
            userName: memberName(user),
            action: 'meal_added',
            month,
            date,
            lunch: toMealNumber(bulkLunch),
            dinner: toMealNumber(bulkDinner),
            guestMeal: toMealNumber(bulkGuest),
            totalMeal,
            notes,
            snapshot,
          });

          await sendAdminChatUpdate({
            member: user,
            category: 'meal',
            title: 'Meal entry added',
            summary: 'Your meal entry has been recorded.',
            fields: [
              { label: 'Date', value: date },
              { label: 'Lunch', value: toMealNumber(bulkLunch) },
              { label: 'Dinner', value: toMealNumber(bulkDinner) },
              { label: 'Guest meal', value: toMealNumber(bulkGuest) },
              { label: 'Total meals', value: totalMeal },
              { label: 'Notes', value: notes || '' },
            ],
            details: { ...mealData, month },
            notify: true,
          }).catch((error) => console.error('Meal chat update failed:', error));
        }

        toast.dismiss(loadingToast);
        toast.success(`Saved meals for ${usersToSave.length} member(s).${notificationsEnabled ? ' Notifications sent.' : ''}`, {
          icon: '✅',
          duration: 3000,
        });

        resetBulkForm();
      } else {
        const totalMeal = toMealNumber(lunch + dinner + guestMeal);

        const mealData = {
          lunch: toMealNumber(lunch),
          dinner: toMealNumber(dinner),
          guestMeal: toMealNumber(guestMeal),
          totalMeal,
          date,
          notes,
        };

        const snapshot = await getMealSnapshotForMonth(month, [
          {
            userId,
            totalMeal,
          },
        ]);

        await addDoc(collection(db, 'meals'), {
          userId,
          date,
          month,
          lunch: toMealNumber(lunch),
          dinner: toMealNumber(dinner),
          guestMeal: toMealNumber(guestMeal),
          guestName: '',
          totalMeal,
          mealRate: 0,
          totalCost: 0,
          notes: notes || '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        if (notificationsEnabled) await createMealEntryNotification({
          userId,
          userName: memberName(selectedUser),
          action: 'meal_added',
          month,
          date,
          lunch: toMealNumber(lunch),
          dinner: toMealNumber(dinner),
          guestMeal: toMealNumber(guestMeal),
          totalMeal,
          notes,
          snapshot,
        });

        if (selectedUser && notificationsEnabled) {
          await sendAdminChatUpdate({
            member: selectedUser,
            category: 'meal',
            title: 'Meal entry added',
            summary: 'Your meal entry has been recorded.',
            fields: [
              { label: 'Date', value: date },
              { label: 'Lunch', value: toMealNumber(lunch) },
              { label: 'Dinner', value: toMealNumber(dinner) },
              { label: 'Guest meal', value: toMealNumber(guestMeal) },
              { label: 'Total meals', value: totalMeal },
              { label: 'Notes', value: notes || '' },
            ],
            details: { ...mealData, month },
            notify: true,
          }).catch((error) => console.error('Meal chat update failed:', error));
        }

        toast.dismiss(loadingToast);

        toast.success(`Meal saved.${notificationsEnabled ? ' Notification sent.' : ''}`, {
          icon: '✅',
          duration: 3000,
        });

        resetSingleForm();
      }

      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      toast.dismiss(loadingToast);
      console.error('Error:', error);
      toast.error('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-[28px] border border-gray-200 bg-white shadow-sm">
      <div className="bg-gradient-to-br from-orange-500 via-amber-500 to-yellow-400 px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm">
              <Utensils className="h-5 w-5 text-white" />
            </div>

            <div>
              <h2 className="text-base font-black text-white sm:text-lg">
                Meal Entry
              </h2>

              <p className="text-[11px] font-semibold text-white/80">
                {bulkMode ? 'Bulk Add Mode' : 'Single Entry Mode'} • Point meal supported
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {((!bulkMode && selectedUser) || bulkMode) && (
              <span
                className="flex items-center gap-1.5 rounded-xl border border-white/30 bg-white/20 px-3 py-2 text-[10px] font-black text-white"
              >
                <Bell className="h-3.5 w-3.5" />
                Chat push automatic
              </span>
            )}

            <button
              type="button"
              onClick={() => {
                setBulkMode(!bulkMode);
                setUserId('');
                setSelectedUsers([]);
              }}
              className={`rounded-xl px-3 py-2 text-[11px] font-black transition-all ${
                bulkMode
                  ? 'bg-white text-orange-600 shadow-sm'
                  : 'border border-white/30 bg-white/20 text-white hover:bg-white/30'
              }`}
            >
              <span className="flex items-center gap-1.5">
                {bulkMode ? (
                  <Users className="h-3.5 w-3.5" />
                ) : (
                  <User className="h-3.5 w-3.5" />
                )}

                {bulkMode ? 'Bulk' : 'Single'}
              </span>
            </button>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5 p-4 sm:p-5">
        <div className="rounded-3xl border border-gray-100 bg-gray-50/70 p-3 sm:p-4">
          <label className="mb-2 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-gray-500">
            <Calendar className="h-3.5 w-3.5" />
            Meal Date
          </label>

          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            max={new Date().toISOString().split('T')[0]}
            className="w-full rounded-2xl border-2 border-gray-100 bg-white px-4 py-3 text-sm font-black text-gray-900 outline-none transition-all focus:border-orange-400 focus:ring-4 focus:ring-orange-500/10"
            required
          />
        </div>

        {!bulkMode && (
          <div className="rounded-3xl border border-gray-100 bg-gray-50/70 p-3 sm:p-4">
            <label className="mb-3 flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-gray-500">
                <User className="h-3.5 w-3.5" />
                Select Member
              </span>

              <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[10px] font-black text-violet-600">
                Room assigned only
              </span>
            </label>

            {activeUsers.length > 0 ? (
              <div className="grid max-h-72 grid-cols-1 gap-2 overflow-y-auto pr-1">
                {activeUsers.map((user) => {
                  const selected = userId === user.id;

                  return (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => setUserId(user.id)}
                      className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition-all ${
                        selected
                          ? 'border-violet-300 bg-violet-600 text-white shadow-sm'
                          : 'border-gray-100 bg-white text-gray-800 hover:border-violet-200 hover:bg-violet-50'
                      }`}
                    >
                      <MemberAvatar user={user} selected={selected} />

                      <div className="min-w-0 flex-1">
                        <p
                          className={`truncate text-sm font-black ${
                            selected ? 'text-white' : 'text-gray-900'
                          }`}
                        >
                          {memberName(user)}
                        </p>

                        <p
                          className={`mt-0.5 text-[11px] font-bold ${
                            selected ? 'text-white/75' : 'text-gray-400'
                          }`}
                        >
                          Room: {user.room}
                        </p>
                      </div>

                      {selected && (
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white">
                          <Check className="h-4 w-4 text-violet-600" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-white p-6 text-center">
                <p className="text-xs font-bold text-gray-400">
                  No active member with assigned room found.
                </p>
              </div>
            )}
          </div>
        )}

        {bulkMode && (
          <div className="rounded-3xl border border-gray-100 bg-gray-50/70 p-3 sm:p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <label className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-gray-500">
                <Users className="h-3.5 w-3.5" />
                Select Members
              </label>

              <div className="flex items-center gap-2">
                <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[10px] font-black text-violet-600">
                  {selectedUsers.length} selected
                </span>

                <button
                  type="button"
                  onClick={selectAllUsers}
                  className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-violet-600 hover:bg-violet-50"
                >
                  {selectedUsers.length === activeUsers.length
                    ? 'Deselect All'
                    : 'Select All'}
                </button>
              </div>
            </div>

            {activeUsers.length > 0 ? (
              <div className="grid max-h-64 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                {activeUsers.map((user) => {
                  const selected = selectedUsers.includes(user.id);

                  return (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => toggleUserSelection(user.id)}
                      className={`flex items-center gap-2 rounded-2xl border px-3 py-2.5 text-left transition-all ${
                        selected
                          ? 'border-violet-300 bg-violet-600 text-white shadow-sm'
                          : 'border-gray-100 bg-white text-gray-700 hover:border-violet-200 hover:bg-violet-50'
                      }`}
                    >
                      <MemberAvatar user={user} selected={selected} />

                      <div className="min-w-0 flex-1">
                        <p
                          className={`truncate text-xs font-black ${
                            selected ? 'text-white' : 'text-gray-900'
                          }`}
                        >
                          {memberName(user)}
                        </p>

                        <p
                          className={`mt-0.5 text-[10px] font-bold ${
                            selected ? 'text-white/75' : 'text-gray-400'
                          }`}
                        >
                          Room: {user.room}
                        </p>
                      </div>

                      <span
                        className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border-2 transition-all ${
                          selected
                            ? 'border-white bg-white'
                            : 'border-gray-300 bg-transparent'
                        }`}
                      >
                        {selected && <Check className="h-3 w-3 text-violet-600" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-white p-6 text-center">
                <p className="text-xs font-bold text-gray-400">
                  No active member with assigned room found.
                </p>
              </div>
            )}
          </div>
        )}

        <div className="rounded-3xl border border-gray-100 bg-gray-50/70 p-3 sm:p-4">
          <label className="mb-3 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-gray-500">
            <Utensils className="h-3.5 w-3.5" />
            Meal Count
          </label>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <MealCounter
              label="Lunch"
              value={bulkMode ? bulkLunch : lunch}
              onChange={bulkMode ? setBulkLunch : setLunch}
              color="amber"
            />

            <MealCounter
              label="Dinner"
              value={bulkMode ? bulkDinner : dinner}
              onChange={bulkMode ? setBulkDinner : setDinner}
              color="blue"
            />

            <MealCounter
              label="Guest"
              value={bulkMode ? bulkGuest : guestMeal}
              onChange={bulkMode ? setBulkGuest : setGuestMeal}
              color="emerald"
            />
          </div>
        </div>

        <div className="rounded-3xl border border-gray-100 bg-gray-50/70 p-3 sm:p-4">
          <label className="mb-2 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-gray-500">
            <Sparkles className="h-3.5 w-3.5" />
            Remarks
          </label>

          <input
            type="text"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Add a note, for example: half meal, guest, special case..."
            className="w-full rounded-2xl border-2 border-gray-100 bg-white px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition-all placeholder:text-gray-300 focus:border-orange-400 focus:ring-4 focus:ring-orange-500/10"
          />
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-3 shadow-sm sm:p-4">
          <div className="mb-3 flex items-center justify-between rounded-2xl bg-gray-950 px-4 py-3 text-white">
            <span className="text-[11px] font-black uppercase text-white/60">
              Total Meal
            </span>

            <span className="text-2xl font-black">
              {formatMeal(totalMeals)}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="submit"
              disabled={saving || sheetSending}
              className="flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-gray-900 to-gray-800 py-3.5 text-sm font-black text-white shadow-lg shadow-gray-900/10 transition-all hover:from-gray-800 hover:to-gray-700 active:scale-[0.98] disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}

              {bulkMode ? `Save (${selectedUsers.length})` : 'Save Entry'}
            </button>

            <button
              type="button"
              onClick={handleSendToSheet}
              disabled={saving || sheetSending}
              className="flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-600 to-green-600 py-3.5 text-sm font-black text-white shadow-lg shadow-emerald-900/10 transition-all hover:from-emerald-700 hover:to-green-700 active:scale-[0.98] disabled:opacity-50"
            >
              {sheetSending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}

              {sheetSending ? 'Sending...' : 'Send to Sheet'}
            </button>
          </div>

          <p className="mt-3 text-center text-[10px] font-bold text-gray-400">
            Save Entry stores data in Firebase and creates meal-added notification. Send to Sheet updates Google Sheet manually.
          </p>
        </div>
      </form>
    </div>
  );
}
