'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import { useAuth } from '@/lib/AuthContext';
import { db, setupPushNotifications, getFCMToken } from '@/lib/firebase';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Bell,
  BellRing,
  CalendarDays,
  CheckCheck,
  CheckCircle,
  Clock,
  Filter,
  History,
  Inbox,
  Loader2,
  MapPin,
  Search,
  Send,
  Smartphone,
  Sparkles,
  X,
} from 'lucide-react';
import { toast } from 'react-hot-toast';

const RECENT_SEARCH_KEY = 'colive_notification_recent_searches';
const MOBILE_NOTIFICATION_QUERY = '(max-width: 767px)';

function subscribeToMobileViewport(callback) {
  if (typeof window === 'undefined') return () => {};

  const media = window.matchMedia(MOBILE_NOTIFICATION_QUERY);
  media.addEventListener('change', callback);
  return () => media.removeEventListener('change', callback);
}

function getMobileViewportSnapshot() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia(MOBILE_NOTIFICATION_QUERY).matches
  );
}

function getServerMobileViewportSnapshot() {
  return false;
}

function getInitialRecentSearches() {
  if (typeof window === 'undefined') return [];

  try {
    const stored = JSON.parse(localStorage.getItem(RECENT_SEARCH_KEY) || '[]');
    return Array.isArray(stored) ? stored.slice(0, 8) : [];
  } catch {
    return [];
  }
}

function toDate(value) {
  if (!value) return new Date();
  if (value?.toDate) return value.toDate();
  if (value instanceof Date) return value;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeDigits(value) {
  return String(value || '')
    .replace(/[০-৯]/g, (digit) => String('০১২৩৪৫৬৭৮৯'.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
}

function numberValue(value) {
  const number = Number(
    normalizeDigits(value)
      .replace(/,/g, '')
      .replace(/[৳\s]/g, '')
  );

  return Number.isFinite(number) ? number : 0;
}

function mealNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Number(number.toFixed(2));
}

function formatMeal(value) {
  const number = mealNumber(value);
  return Number.isInteger(number) ? String(number) : number.toFixed(2);
}

function money(value) {
  const number = numberValue(value);
  return `৳${Math.round(Math.abs(number)).toLocaleString()}`;
}

function moneySigned(value) {
  const number = numberValue(value);

  if (number < 0) {
    return `+৳${Math.round(Math.abs(number)).toLocaleString()}`;
  }

  return `৳${Math.round(number).toLocaleString()}`;
}

function moneyRate(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) return '৳0.00';

  return `৳${number.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatShortTime(date) {
  const realDate = toDate(date);
  const diff = Date.now() - realDate.getTime();

  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;

  return realDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function formatFullTime(date) {
  return toDate(date).toLocaleString('en-US', {
    timeZone: 'Asia/Dhaka',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatSearchDate(date) {
  return toDate(date).toLocaleDateString('en-US', {
    timeZone: 'Asia/Dhaka',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function getDayKey(date) {
  const realDate = toDate(date);

  return `${realDate.getFullYear()}-${String(realDate.getMonth() + 1).padStart(
    2,
    '0'
  )}-${String(realDate.getDate()).padStart(2, '0')}`;
}

function getMonthKeyFromDate(dateValue) {
  const date = toDate(dateValue);

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getCurrentMonthKey() {
  return getMonthKeyFromDate(new Date());
}

function getDayLabel(date) {
  const realDate = toDate(date);
  const now = new Date();

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(
    realDate.getFullYear(),
    realDate.getMonth(),
    realDate.getDate()
  );

  const diffDays = Math.floor(
    (today.getTime() - target.getTime()) / 86_400_000
  );

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';

  return realDate.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getMonthName(value) {
  if (!value) return '';

  const text = String(value);

  if (/^\d{4}-\d{2}$/.test(text)) {
    const [year, month] = text.split('-').map(Number);
    const date = new Date(year, month - 1, 1);

    return date.toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    });
  }

  return text;
}

function getNotificationMonthKey(notification) {
  const data = notification?.data || {};

  const directMonth =
    data.monthId ||
    data.month ||
    notification?.monthId ||
    notification?.month ||
    '';

  if (/^\d{4}-\d{2}$/.test(String(directMonth))) {
    return String(directMonth);
  }

  const recordDate =
    data.date ||
    data.mealDate ||
    data.bazarDate ||
    notification?.date ||
    notification?.mealDate ||
    notification?.bazarDate ||
    '';

  if (/^\d{4}-\d{2}/.test(String(recordDate))) {
    return String(recordDate).slice(0, 7);
  }

  return getMonthKeyFromDate(notification.createdAt);
}

function getCurrentSuggestionDates() {
  const now = new Date();

  return {
    currentMonth: now.toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    }),
    currentDay: now.toLocaleDateString('en-US', {
      weekday: 'long',
    }),
    currentFullDate: now.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }),
    currentYear: String(now.getFullYear()),
  };
}

function getDeviceInfo() {
  if (typeof window === 'undefined') {
    return {
      isIOS: false,
      isStandalone: false,
      supportsPush: false,
      permission: 'default',
    };
  }

  const ua = navigator.userAgent || '';
  const isIOS = /iPhone|iPad|iPod/i.test(ua);

  const isStandalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  const supportsPush =
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window;

  return {
    isIOS,
    isStandalone,
    supportsPush,
    permission: 'Notification' in window ? Notification.permission : 'unsupported',
  };
}

function getNotificationBody(notification) {
  return notification?.message || notification?.body || '';
}

function sanitizeUserText(text) {
  return String(text || '')
    .replace(/This notification is a fixed snapshot\. Later meal rate changes will not change this notification\./gi, '')
    .replace(/fixed snapshot/gi, 'saved record')
    .replace(/snapshot/gi, 'record')
    .replace(/database/gi, 'record')
    .replace(/firestore/gi, 'record')
    .replace(/recorded by admin/gi, 'recorded')
    .replace(/updated by admin/gi, 'updated')
    .replace(/added by admin/gi, 'added')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function getNotificationText(notification) {
  const data = notification?.data || {};

  return [
    notification?.title,
    notification?.body,
    notification?.message,
    notification?.type,
    notification?.category,
    notification?.status,
    data.type,
    data.action,
    data.status,
    data.reason,
    data.notes,
    data.location,
    data.room,
    data.address,
    data.area,
    data.city,
  ]
    .join(' ')
    .toLowerCase();
}

function isHiddenNotification(notification) {
  const type = String(notification?.type || '').toLowerCase();

  return (
    type.includes('chat') ||
    type === 'message' ||
    type === 'messages' ||
    type === 'messaging' ||
    type === 'conversation' ||
    type === 'inbox'
  );
}

function getNotificationKind(notification) {
  const data = notification?.data || {};

  const rawType = String(
    data.type ||
      data.action ||
      notification?.type ||
      notification?.category ||
      ''
  ).toLowerCase();

  const text = getNotificationText(notification);

  if (
    rawType === 'meal_payment' ||
    rawType === 'meal_payment_due' ||
    rawType === 'meal_payment_paid' ||
    rawType === 'meal_payment_advance' ||
    text.includes('meal payment') ||
    text.includes('payment summary') ||
    text.includes('payment due') ||
    text.includes('given amount') ||
    text.includes('pending due')
  ) {
    return 'meal_payment';
  }

  if (
    rawType === 'meal_edited' ||
    rawType === 'meal_updated' ||
    text.includes('meal edited') ||
    text.includes('meal updated') ||
    text.includes('entry edited') ||
    text.includes('entry updated')
  ) {
    return 'meal_edited';
  }

  if (
    rawType === 'meal_added' ||
    rawType === 'meal_entry' ||
    rawType === 'meal' ||
    rawType === 'meals' ||
    text.includes('meal added') ||
    text.includes('meal entry confirmation') ||
    text.includes('meal entry has been added') ||
    text.includes('meal entry has been recorded') ||
    text.includes('meal information')
  ) {
    return 'meal_added';
  }

  if (
    rawType === 'bill' ||
    rawType === 'payment' ||
    rawType === 'house_rent' ||
    rawType === 'rent' ||
    text.includes('house rent') ||
    text.includes('rent')
  ) {
    return 'rent';
  }

  if (
    rawType === 'balance_adjustment' ||
    rawType === 'balance' ||
    text.includes('balance update')
  ) {
    return 'balance';
  }

  if (
    rawType === 'bazar' ||
    rawType === 'bazar_added' ||
    rawType === 'bazar_update' ||
    rawType.includes('bazar') ||
    text.includes('bazar') ||
    text.includes('বাজার')
  ) {
    return 'bazar';
  }

  return 'general';
}

function getRelatedPage(notification) {
  const kind = getNotificationKind(notification);
  const directUrl = notification?.url || notification?.link || '';

  if (directUrl.includes('/chat')) {
    return { url: directUrl, label: 'Open Chat', short: 'Chat' };
  }

  if (directUrl.includes('/bazar')) {
    return { url: '/bazar', label: 'Open Bazar', short: 'Bazar' };
  }

  if (directUrl.includes('/bills')) {
    return { url: '/bills', label: 'Open Bills', short: 'Bills' };
  }

  if (directUrl.includes('/meals')) {
    return { url: '/meals', label: 'Open Meals', short: 'Meals' };
  }

  if (kind === 'meal_added' || kind === 'meal_edited' || kind === 'meal_payment') {
    return { url: '/meals', label: 'Open Meals', short: 'Meals' };
  }

  if (kind === 'rent') {
    return { url: '/bills', label: 'Open Bills', short: 'Bills' };
  }

  if (kind === 'bazar' || kind === 'balance') {
    return { url: '/bazar', label: 'Open Bazar', short: 'Bazar' };
  }

  if (directUrl) {
    return { url: directUrl, label: 'Open Page', short: 'Page' };
  }

  return { url: '', label: 'No Link', short: 'No Link' };
}

function getLocationText(notification) {
  const data = notification?.data || {};

  return (
    data.location ||
    data.place ||
    data.market ||
    data.room ||
    data.address ||
    data.area ||
    data.city ||
    notification?.location ||
    notification?.place ||
    notification?.room ||
    ''
  );
}

function parseNumberFromText(text, patterns) {
  const normalized = normalizeDigits(text);

  for (const pattern of patterns) {
    const match = normalized.match(pattern);

    if (match?.[1]) {
      const number = numberValue(match[1]);
      if (Number.isFinite(number)) return number;
    }
  }

  return 0;
}

function parseLineValue(text, labels = []) {
  const lines = String(text || '').split(/\r?\n/);

  for (const line of lines) {
    const cleanLine = line.trim();

    for (const label of labels) {
      const regex = new RegExp(`^${label}\\s*[:：]\\s*(.+)$`, 'i');
      const match = cleanLine.match(regex);

      if (match?.[1]) {
        return sanitizeUserText(match[1].trim());
      }
    }
  }

  return '';
}

function getItemsArray(items) {
  if (Array.isArray(items)) return items.filter(Boolean);

  if (typeof items === 'string') {
    if (items.trim().toLowerCase() === 'n/a') return [];

    return items
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function getPaymentStatus(notification) {
  const data = notification?.data || {};
  const rawStatus = String(data.status || notification.status || '').toLowerCase();
  const text = getNotificationText(notification);

  const totalPayable = numberValue(
    data.totalPayable ||
      data.total ||
      data.amount ||
      data.mealCost ||
      data.mealCostSnapshot ||
      data.payable
  );

  const paidAmount = numberValue(data.paidAmount || data.paid || data.givenAmount);
  const balance = numberValue(data.balance || data.dueAmount || data.due);
  const advance = numberValue(data.advance || data.advanceAmount);

  if (advance > 0 || balance < 0 || rawStatus === 'advance' || text.includes('advance')) {
    return 'advance';
  }

  if (
    rawStatus === 'paid' ||
    rawStatus === 'fully paid' ||
    text.includes('fully paid') ||
    text.includes('successfully paid') ||
    (totalPayable > 0 && paidAmount >= totalPayable && balance === 0)
  ) {
    return 'paid';
  }

  if (
    rawStatus === 'partial' ||
    rawStatus === 'partially paid' ||
    text.includes('partially paid') ||
    (paidAmount > 0 && balance > 0)
  ) {
    return 'partial';
  }

  if (
    rawStatus === 'due' ||
    text.includes('payment is due') ||
    text.includes('pending due') ||
    text.includes('due') ||
    balance > 0
  ) {
    return 'due';
  }

  return 'unpaid';
}

function getStatusDesign(status) {
  const designs = {
    bazar_added: {
      label: 'Bazar Added',
      short: 'Bazar',
      emoji: '🛒',
      avatar: 'bg-emerald-600',
      ring: 'ring-emerald-100',
      bubble: 'bg-emerald-50 border-emerald-200',
      badge: 'bg-emerald-600 text-white',
      soft: 'bg-emerald-100 text-emerald-700',
      text: 'text-emerald-800',
      button: 'bg-emerald-600 hover:bg-emerald-700',
    },
    added: {
      label: 'Meal Added',
      short: 'Added',
      emoji: '🍽️',
      avatar: 'bg-orange-600',
      ring: 'ring-orange-100',
      bubble: 'bg-orange-50 border-orange-200',
      badge: 'bg-orange-600 text-white',
      soft: 'bg-orange-100 text-orange-700',
      text: 'text-orange-800',
      button: 'bg-orange-600 hover:bg-orange-700',
    },
    edited: {
      label: 'Meal Edited',
      short: 'Edited',
      emoji: '✏️',
      avatar: 'bg-blue-600',
      ring: 'ring-blue-100',
      bubble: 'bg-blue-50 border-blue-200',
      badge: 'bg-blue-600 text-white',
      soft: 'bg-blue-100 text-blue-700',
      text: 'text-blue-800',
      button: 'bg-blue-600 hover:bg-blue-700',
    },
    paid: {
      label: 'Paid Status',
      short: 'Paid',
      emoji: '✅',
      avatar: 'bg-emerald-600',
      ring: 'ring-emerald-100',
      bubble: 'bg-emerald-50 border-emerald-200',
      badge: 'bg-emerald-600 text-white',
      soft: 'bg-emerald-100 text-emerald-700',
      text: 'text-emerald-800',
      button: 'bg-emerald-600 hover:bg-emerald-700',
    },
    partial: {
      label: 'Partially Paid Status',
      short: 'Partial',
      emoji: '⚠️',
      avatar: 'bg-blue-600',
      ring: 'ring-blue-100',
      bubble: 'bg-blue-50 border-blue-200',
      badge: 'bg-blue-600 text-white',
      soft: 'bg-blue-100 text-blue-700',
      text: 'text-blue-800',
      button: 'bg-blue-600 hover:bg-blue-700',
    },
    unpaid: {
      label: 'Unpaid Status',
      short: 'Unpaid',
      emoji: '❌',
      avatar: 'bg-red-600',
      ring: 'ring-red-100',
      bubble: 'bg-red-50 border-red-200',
      badge: 'bg-red-600 text-white',
      soft: 'bg-red-100 text-red-700',
      text: 'text-red-800',
      button: 'bg-red-600 hover:bg-red-700',
    },
    due: {
      label: 'Due Status',
      short: 'Due',
      emoji: '⏰',
      avatar: 'bg-amber-600',
      ring: 'ring-amber-100',
      bubble: 'bg-amber-50 border-amber-200',
      badge: 'bg-amber-600 text-white',
      soft: 'bg-amber-100 text-amber-700',
      text: 'text-amber-800',
      button: 'bg-amber-600 hover:bg-amber-700',
    },
    advance: {
      label: 'Advance Status',
      short: 'Advance',
      emoji: '📈',
      avatar: 'bg-purple-600',
      ring: 'ring-purple-100',
      bubble: 'bg-purple-50 border-purple-200',
      badge: 'bg-purple-600 text-white',
      soft: 'bg-purple-100 text-purple-700',
      text: 'text-purple-800',
      button: 'bg-purple-600 hover:bg-purple-700',
    },
    general: {
      label: 'General Update',
      short: 'Update',
      emoji: '🔔',
      avatar: 'bg-violet-600',
      ring: 'ring-violet-100',
      bubble: 'bg-violet-50 border-violet-200',
      badge: 'bg-violet-600 text-white',
      soft: 'bg-violet-100 text-violet-700',
      text: 'text-violet-800',
      button: 'bg-violet-600 hover:bg-violet-700',
    },
  };

  return designs[status] || designs.general;
}

function buildMealEntryDetails(notification) {
  const data = notification?.data || {};
  const body = getNotificationBody(notification);

  const lunch = mealNumber(
    data.lunch ??
      notification?.lunch ??
      parseNumberFromText(body, [/lunch[:\s]+([0-9.]+)/i])
  );

  const dinner = mealNumber(
    data.dinner ??
      notification?.dinner ??
      parseNumberFromText(body, [/dinner[:\s]+([0-9.]+)/i])
  );

  const guestMeal = mealNumber(
    data.guestMeal ??
      notification?.guestMeal ??
      parseNumberFromText(body, [/guest(?:\s*meal)?[:\s]+([0-9.]+)/i])
  );

  const totalMeal =
    mealNumber(data.totalMeal ?? notification?.totalMeal) ||
    mealNumber(lunch + dinner + guestMeal);

  const mealRate = mealNumber(
    data.mealRateSnapshot ??
      data.mealRate ??
      notification?.mealRateSnapshot ??
      notification?.mealRate ??
      parseNumberFromText(body, [/meal rate.*?৳?\s*([0-9,.]+)/i])
  );

  const entryCost =
    numberValue(data.entryCostSnapshot ?? data.entryCost ?? notification?.entryCostSnapshot) ||
    totalMeal * mealRate;

  const date = data.date || data.mealDate || notification?.date || notification?.mealDate || '';

  const reason =
    sanitizeUserText(
      data.reason ||
        data.notes ||
        notification?.reason ||
        notification?.notes ||
        'Meal record updated.'
    ) || 'Meal record updated.';

  return {
    lunch,
    dinner,
    guestMeal,
    totalMeal,
    mealRate,
    entryCost,
    date,
    reason,
  };
}

function buildMealPaymentDetails(notification) {
  const data = notification?.data || {};
  const body = getNotificationBody(notification);

  const givenAmount =
    numberValue(data.givenAmount ?? data.paidAmount ?? data.paid ?? notification?.givenAmount) ||
    parseNumberFromText(body, [/given amount[:\s]+৳?\s*([0-9,.]+)/i]);

  const mealsTaken =
    mealNumber(data.mealsTaken ?? data.userMeal ?? data.totalMeals ?? notification?.mealsTaken) ||
    parseNumberFromText(body, [/meals taken[:\s]+([0-9.]+)/i]);

  const mealRate =
    mealNumber(data.mealRateSnapshot ?? data.mealRate ?? notification?.mealRate) ||
    parseNumberFromText(body, [/meal rate[:\s]+৳?\s*([0-9,.]+)/i]);

  const mealCost =
    numberValue(data.mealCostSnapshot ?? data.mealCost ?? data.payable ?? data.totalPayable) ||
    parseNumberFromText(body, [/meal cost[:\s]+৳?\s*([0-9,.]+)/i]) ||
    parseNumberFromText(body, [/cost[:\s]+৳?\s*([0-9,.]+)/i]);

  const due =
    numberValue(data.due ?? data.dueAmount ?? data.balance ?? notification?.due) ||
    parseNumberFromText(body, [/pending due[:\s]+৳?\s*([0-9,.]+)/i]);

  const advance = numberValue(data.advance ?? data.advanceAmount ?? notification?.advance);
  const month = getMonthName(data.monthId || data.month || notification?.month);

  return {
    givenAmount,
    mealsTaken,
    mealRate,
    mealCost,
    due,
    advance,
    month,
  };
}

function buildBazarEntryDetails(notification) {
  const data = notification?.data || {};
  const body = sanitizeUserText(getNotificationBody(notification));

  const amount =
    numberValue(data.amount || data.totalAmount || data.bazarAmount || notification?.amount) ||
    parseNumberFromText(body, [
      /amount[:\s]*৳?\s*([0-9,.]+)/i,
      /পরিমাণ[:\s]*৳?\s*([0-9,.]+)/i,
    ]);

  const place =
    data.place ||
    data.market ||
    data.location ||
    notification?.place ||
    notification?.location ||
    parseLineValue(body, ['স্থান', 'place', 'location', 'market']) ||
    'All Places';

  const date =
    data.date ||
    data.bazarDate ||
    notification?.date ||
    notification?.bazarDate ||
    '';

  const month = getMonthName(
    data.monthId ||
      data.month ||
      notification?.monthId ||
      notification?.month ||
      (date ? String(date).slice(0, 7) : getNotificationMonthKey(notification))
  );

  const rawItems =
    data.items ||
    notification?.items ||
    parseLineValue(body, ['আইটেম', 'items', 'item']);

  const items = getItemsArray(rawItems);

  const reason =
    sanitizeUserText(
      data.reason ||
        data.notes ||
        notification?.reason ||
        notification?.notes ||
        'Bazar record has been added.'
    ) || 'Bazar record has been added.';

  const message =
    body ||
    `Dear Member, your bazar record has been added.\n\nAmount: ${money(
      amount
    )}\nPlace: ${place}\nItems: ${items.length > 0 ? items.join(', ') : 'N/A'}`;

  return {
    amount,
    place,
    date,
    month,
    items,
    reason,
    message,
  };
}

function buildStyledMessage(notification) {
  const data = notification?.data || {};
  const kind = getNotificationKind(notification);
  const page = getRelatedPage(notification);
  const rawBody = sanitizeUserText(getNotificationBody(notification));

  const username =
    data.name ||
    data.displayName ||
    data.username ||
    data.userName ||
    notification?.name ||
    'Member';

  const location = getLocationText(notification);

  if (kind === 'meal_added' || kind === 'meal_edited') {
    const details = buildMealEntryDetails(notification);
    const design = getStatusDesign(kind === 'meal_edited' ? 'edited' : 'added');

    const message =
      rawBody ||
      `Dear ${username}, your meal entry has been ${
        kind === 'meal_edited' ? 'updated' : 'added'
      }.\n\nLunch: ${formatMeal(details.lunch)}\nDinner: ${formatMeal(
        details.dinner
      )}\nGuest Meal: ${formatMeal(details.guestMeal)}\nTotal Meal: ${formatMeal(
        details.totalMeal
      )}\n\nReason: ${details.reason}`;

    return {
      kind,
      category: {
        title: kind === 'meal_edited' ? 'Meal Edited' : 'Meal Added',
        sender: 'Meal Message',
        icon: kind === 'meal_edited' ? '✏️' : '🍽️',
        page,
      },
      status: kind === 'meal_edited' ? 'edited' : 'added',
      design,
      message,
      username,
      month: details.date ? getMonthName(String(details.date).slice(0, 7)) : getMonthName(data.monthId || data.month),
      location,
      detailsType: 'meal_entry',
      mealEntry: details,
      totalPayable: 0,
      paidAmount: 0,
      balance: 0,
    };
  }

  if (kind === 'meal_payment') {
    const payment = buildMealPaymentDetails(notification);
    const status = getPaymentStatus(notification);
    const design = getStatusDesign(status);

    let message = rawBody;

    if (!message) {
      if (status === 'paid') {
        message = `Dear ${username}, your meal payment for ${payment.month} has been paid. Meal cost was ${money(
          payment.mealCost
        )}, given amount is ${money(payment.givenAmount)}, and your current balance is ৳0.`;
      } else if (status === 'advance') {
        message = `Dear ${username}, your meal payment for ${payment.month} is in advance. Meal cost was ${money(
          payment.mealCost
        )}, given amount is ${money(payment.givenAmount)}, and advance amount is ${money(
          payment.advance
        )}.`;
      } else {
        message = `Dear ${username}, your meal payment for ${payment.month} is due. Meal cost is ${money(
          payment.mealCost
        )}, given amount is ${money(payment.givenAmount)}, and pending due is ${money(
          payment.due
        )}.`;
      }
    }

    return {
      kind,
      category: {
        title: 'Meal Payment',
        sender: 'Meal Payment Message',
        icon: '💳',
        page,
      },
      status,
      design,
      message,
      username,
      month: payment.month,
      location,
      detailsType: 'meal_payment',
      mealPayment: payment,
      totalPayable: payment.mealCost,
      paidAmount: payment.givenAmount,
      balance:
        status === 'advance'
          ? -Math.abs(payment.advance)
          : payment.due || payment.mealCost - payment.givenAmount,
    };
  }

  if (kind === 'rent') {
    const status = getPaymentStatus(notification);
    const design = getStatusDesign(status);
    const month = getMonthName(data.monthId || data.month || notification?.month);

    const totalPayable = numberValue(data.totalPayable || data.total || data.amount);
    const paidAmount = numberValue(data.paidAmount || data.paid);
    const balance = numberValue(data.balance || data.dueAmount || data.due);

    let message = rawBody;

    if (!message) {
      if (status === 'paid') {
        message = `Dear ${username}, your house rent for ${month} has been successfully paid. Total payable was ${money(
          totalPayable
        )}, paid amount is ${money(paidAmount)}, and your current balance is ৳0. Thank you for completing your payment.`;
      } else if (status === 'partial') {
        message = `Dear ${username}, your house rent for ${month} has been partially paid. Total payable is ${money(
          totalPayable
        )}, paid amount is ${money(paidAmount)}, and remaining balance is ${money(
          balance
        )}. Please clear the due amount on time.`;
      } else if (status === 'unpaid') {
        message = `Dear ${username}, your house rent for ${month} has not been paid yet. This month you need to pay ${money(
          totalPayable || balance
        )}. Paid amount is ৳0, and your current balance is ${money(
          balance || totalPayable
        )}. Please complete your payment as soon as possible.`;
      } else if (status === 'due') {
        message = `Dear ${username}, your house rent payment for ${month} is due. You need to pay ${money(
          balance || totalPayable
        )} for this month. Please pay the due amount to keep your rent record updated.`;
      } else if (status === 'advance') {
        message = `Dear ${username}, your house rent for ${month} has been paid in advance. Your advance balance is ${money(
          balance
        )}. Thank you for keeping your rent record updated.`;
      }
    }

    return {
      kind,
      category: {
        title: 'House Rent',
        sender: 'Rent Message',
        icon: '🏠',
        page,
      },
      status,
      design,
      message,
      username,
      month,
      location,
      detailsType: 'money',
      totalPayable,
      paidAmount,
      balance,
    };
  }

  if (kind === 'bazar') {
    const details = buildBazarEntryDetails(notification);
    const design = getStatusDesign('bazar_added');

    return {
      kind,
      category: {
        title: 'Bazar Bill',
        sender: 'Bazar Message',
        icon: '🛒',
        page,
      },
      status: 'bazar_added',
      design,
      message: details.message,
      username,
      month: details.month,
      location: details.place,
      detailsType: 'bazar_entry',
      bazarEntry: details,
      totalPayable: 0,
      paidAmount: 0,
      balance: 0,
    };
  }

  if (kind === 'balance') {
    const status = getPaymentStatus(notification);
    const design = getStatusDesign(status);
    const month = getMonthName(data.monthId || data.month || notification?.month);

    const totalPayable = numberValue(data.totalPayable || data.total || data.amount);
    const paidAmount = numberValue(data.paidAmount || data.paid);
    const balance = numberValue(data.balance || data.dueAmount || data.due);

    const message = rawBody || `Dear ${username}, your balance update has been recorded.`;

    return {
      kind,
      category: {
        title: 'Balance Update',
        sender: 'Balance Message',
        icon: '💰',
        page,
      },
      status,
      design,
      message,
      username,
      month,
      location,
      detailsType: 'money',
      totalPayable,
      paidAmount,
      balance,
    };
  }

  const design = getStatusDesign('general');

  return {
    kind,
    category: {
      title: 'General Update',
      sender: 'COLIVE Message',
      icon: '🔔',
      page,
    },
    status: 'general',
    design,
    message: rawBody || notification?.title || 'You have a new notification.',
    username,
    month: getMonthName(data.monthId || data.month || notification?.month),
    location,
    detailsType: 'general',
    totalPayable: 0,
    paidAmount: 0,
    balance: 0,
  };
}

function getSearchText(notification) {
  const date = toDate(notification.createdAt);
  const data = notification?.data || {};
  const styled = buildStyledMessage(notification);

  const dateText = formatSearchDate(date);
  const shortDate = getDayKey(date);
  const dayLabel = getDayLabel(date);
  const monthText = getMonthName(getNotificationMonthKey(notification));

  const weekdayText = date.toLocaleDateString('en-US', {
    weekday: 'long',
  });

  const visibleSearchParts = [
    notification.title,
    getNotificationBody(notification),
    styled.message,
    styled.category.title,
    styled.category.sender,
    styled.design.label,
    styled.design.short,
    styled.kind,
    styled.month,
    styled.username,
    styled.location,
    dateText,
    shortDate,
    dayLabel,
    monthText,
    weekdayText,

    data.date,
    data.mealDate,
    data.bazarDate,
    data.month,
    data.monthId,
    data.room,
    data.location,
    data.place,
    data.market,
    data.address,
    data.area,
    data.city,
    data.reason,
    data.notes,
    data.status,

    data.lunch,
    data.dinner,
    data.guestMeal,
    data.totalMeal,
    data.mealRate,
    data.mealRateSnapshot,
    data.entryCost,
    data.entryCostSnapshot,

    data.amount,
    data.totalAmount,
    data.items,

    data.givenAmount,
    data.paidAmount,
    data.due,
    data.dueAmount,
    data.advance,
  ];

  return visibleSearchParts
    .filter((value) => value !== null && value !== undefined)
    .join(' ')
    .toLowerCase();
}

function matchesDateFilter(notification, dateFilter) {
  if (dateFilter === 'all') return true;

  const date = toDate(notification.createdAt);
  const now = new Date();

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfNotificationDay = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );

  const diffDays = Math.floor(
    (startOfToday.getTime() - startOfNotificationDay.getTime()) / 86_400_000
  );

  if (dateFilter === 'today') return diffDays === 0;
  if (dateFilter === 'yesterday') return diffDays === 1;
  if (dateFilter === 'week') return diffDays >= 0 && diffDays <= 7;
  if (dateFilter === 'month') return getNotificationMonthKey(notification) === getCurrentMonthKey();

  return true;
}

async function saveNotificationSettings(userId, enabled, token = '') {
  const device = getDeviceInfo();

  await setDoc(
    doc(db, 'notificationSettings', userId),
    {
      enabled,
      permission: device.permission,
      token,
      isStandalone: device.isStandalone,
      supportsPush: device.supportsPush,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

function MoneyDetails({ styled }) {
  return (
    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
      <div className="rounded-2xl bg-white/80 px-3 py-2">
        <p className="text-[9px] font-black uppercase text-gray-400">Total</p>
        <p className="mt-1 text-xs font-black text-gray-900 sm:text-sm">
          {money(styled.totalPayable)}
        </p>
      </div>

      <div className="rounded-2xl bg-white/80 px-3 py-2">
        <p className="text-[9px] font-black uppercase text-gray-400">Paid</p>
        <p className="mt-1 text-xs font-black text-emerald-700 sm:text-sm">
          {money(styled.paidAmount)}
        </p>
      </div>

      <div className="rounded-2xl bg-white/80 px-3 py-2">
        <p className="text-[9px] font-black uppercase text-gray-400">Balance</p>
        <p
          className={`mt-1 text-xs font-black sm:text-sm ${
            styled.balance > 0
              ? 'text-red-700'
              : styled.balance < 0
                ? 'text-purple-700'
                : 'text-gray-700'
          }`}
        >
          {moneySigned(styled.balance)}
        </p>
      </div>

      <div className="rounded-2xl bg-white/80 px-3 py-2">
        <p className="text-[9px] font-black uppercase text-gray-400">Status</p>
        <p className={`mt-1 text-xs font-black sm:text-sm ${styled.design.text}`}>
          {styled.design.short}
        </p>
      </div>
    </div>
  );
}

function MealEntryDetails({ details }) {
  return (
    <>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-2xl bg-white/80 px-3 py-2">
          <p className="text-[9px] font-black uppercase text-orange-500">Lunch</p>
          <p className="mt-1 text-xs font-black text-orange-800 sm:text-sm">
            {formatMeal(details.lunch)}
          </p>
        </div>

        <div className="rounded-2xl bg-white/80 px-3 py-2">
          <p className="text-[9px] font-black uppercase text-blue-500">Dinner</p>
          <p className="mt-1 text-xs font-black text-blue-800 sm:text-sm">
            {formatMeal(details.dinner)}
          </p>
        </div>

        <div className="rounded-2xl bg-white/80 px-3 py-2">
          <p className="text-[9px] font-black uppercase text-purple-500">Guest</p>
          <p className="mt-1 text-xs font-black text-purple-800 sm:text-sm">
            {formatMeal(details.guestMeal)}
          </p>
        </div>

        <div className="rounded-2xl bg-white/80 px-3 py-2">
          <p className="text-[9px] font-black uppercase text-gray-400">Total Meal</p>
          <p className="mt-1 text-xs font-black text-gray-900 sm:text-sm">
            {formatMeal(details.totalMeal)}
          </p>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-white/80 px-3 py-2">
          <p className="text-[9px] font-black uppercase text-gray-400">
            Meal Rate
          </p>
          <p className="mt-1 text-xs font-black text-gray-900 sm:text-sm">
            {moneyRate(details.mealRate)}/meal
          </p>
        </div>

        <div className="rounded-2xl bg-white/80 px-3 py-2">
          <p className="text-[9px] font-black uppercase text-gray-400">
            Meal Cost
          </p>
          <p className="mt-1 text-xs font-black text-gray-900 sm:text-sm">
            {money(details.entryCost)}
          </p>
        </div>
      </div>

      <div className="mt-2 rounded-2xl bg-white/80 px-3 py-2">
        <p className="text-[9px] font-black uppercase text-gray-400">Reason</p>
        <p className="mt-1 text-xs font-bold text-gray-700">
          {details.reason}
        </p>
      </div>
    </>
  );
}

function MealPaymentDetails({ details, styled }) {
  return (
    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
      <div className="rounded-2xl bg-white/80 px-3 py-2">
        <p className="text-[9px] font-black uppercase text-gray-400">
          Given Amount
        </p>
        <p className="mt-1 text-xs font-black text-emerald-700 sm:text-sm">
          {money(details.givenAmount)}
        </p>
      </div>

      <div className="rounded-2xl bg-white/80 px-3 py-2">
        <p className="text-[9px] font-black uppercase text-gray-400">
          Meals Taken
        </p>
        <p className="mt-1 text-xs font-black text-gray-900 sm:text-sm">
          {formatMeal(details.mealsTaken)}
        </p>
      </div>

      <div className="rounded-2xl bg-white/80 px-3 py-2">
        <p className="text-[9px] font-black uppercase text-gray-400">
          Meal Rate
        </p>
        <p className="mt-1 text-xs font-black text-violet-700 sm:text-sm">
          {moneyRate(details.mealRate)}/meal
        </p>
      </div>

      <div className="rounded-2xl bg-white/80 px-3 py-2">
        <p className="text-[9px] font-black uppercase text-gray-400">
          Balance
        </p>
        <p
          className={`mt-1 text-xs font-black sm:text-sm ${
            styled.balance > 0
              ? 'text-red-700'
              : styled.balance < 0
                ? 'text-purple-700'
                : 'text-gray-700'
          }`}
        >
          {moneySigned(styled.balance)}
        </p>
      </div>
    </div>
  );
}

function BazarEntryDetails({ details }) {
  return (
    <>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-2xl bg-white/80 px-3 py-2">
          <p className="text-[9px] font-black uppercase text-gray-400">
            Amount
          </p>

          <p className="mt-1 text-xs font-black text-emerald-700 sm:text-sm">
            {money(details.amount)}
          </p>
        </div>

        <div className="rounded-2xl bg-white/80 px-3 py-2">
          <p className="text-[9px] font-black uppercase text-gray-400">
            Place
          </p>

          <p className="mt-1 text-xs font-black text-gray-900 sm:text-sm">
            {details.place || '—'}
          </p>
        </div>

        <div className="rounded-2xl bg-white/80 px-3 py-2">
          <p className="text-[9px] font-black uppercase text-gray-400">
            Month
          </p>

          <p className="mt-1 text-xs font-black text-gray-900 sm:text-sm">
            {details.month || '—'}
          </p>
        </div>

        <div className="rounded-2xl bg-white/80 px-3 py-2">
          <p className="text-[9px] font-black uppercase text-gray-400">
            Type
          </p>

          <p className="mt-1 text-xs font-black text-emerald-700 sm:text-sm">
            Bazar
          </p>
        </div>
      </div>

      <div className="mt-2 rounded-2xl bg-white/80 px-3 py-2">
        <p className="text-[9px] font-black uppercase text-gray-400">
          Items
        </p>

        {details.items.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {details.items.map((item, index) => (
              <span
                key={`${item}-${index}`}
                className="rounded-full bg-gray-100 px-2 py-1 text-[10px] font-bold text-gray-600"
              >
                {item}
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-1 text-xs font-bold text-gray-500">N/A</p>
        )}
      </div>

      <div className="mt-2 rounded-2xl bg-white/80 px-3 py-2">
        <p className="text-[9px] font-black uppercase text-gray-400">
          Reason
        </p>

        <p className="mt-1 text-xs font-bold text-gray-700">
          {details.reason}
        </p>
      </div>
    </>
  );
}

export default function NotificationsPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [notifications, setNotifications] = useState([]);
  const [settings, setSettings] = useState(null);
  const [deviceInfo, setDeviceInfo] = useState(getDeviceInfo());
  const [loading, setLoading] = useState(true);
  const [settingsLoading, setSettingsLoading] = useState(true);

  const [filter, setFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [monthFilter, setMonthFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [recentSearches, setRecentSearches] = useState(
    getInitialRecentSearches
  );
  const [showSuggestions, setShowSuggestions] = useState(false);

  const [permissionModalOpen, setPermissionModalOpen] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const isMobileView = useSyncExternalStore(
    subscribeToMobileViewport,
    getMobileViewportSnapshot,
    getServerMobileViewportSnapshot
  );

  const visibleNotifications = useMemo(() => {
    return notifications.filter((notification) => !isHiddenNotification(notification));
  }, [notifications]);

  const unreadCount = useMemo(() => {
    return visibleNotifications.filter((notification) => !notification.read).length;
  }, [visibleNotifications]);

  const monthOptions = useMemo(() => {
    const map = new Map();

    visibleNotifications.forEach((notification) => {
      const key = getNotificationMonthKey(notification);

      if (key) {
        map.set(key, getMonthName(key));
      }
    });

    return Array.from(map.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => String(b.value).localeCompare(String(a.value)));
  }, [visibleNotifications]);

  const smartSuggestions = useMemo(() => {
    const current = getCurrentSuggestionDates();

    const base = [
      'Today',
      'Yesterday',
      'Last 7 days',
      'This month',
      current.currentFullDate,
      current.currentDay,
      current.currentMonth,
      current.currentYear,
      'Meal Added',
      'Meal Edited',
      'Meal Payment',
      'House Rent',
      'Bazar',
      'Paid',
      'Due',
      'Advance',
      'Partial',
      'Lunch',
      'Dinner',
      'Guest',
    ];

    const dynamic = [];

    visibleNotifications.forEach((notification) => {
      const styled = buildStyledMessage(notification);
      const date = toDate(notification.createdAt);
      const data = notification?.data || {};

      dynamic.push(styled.category.title);
      dynamic.push(styled.category.sender);
      dynamic.push(styled.design.short);
      dynamic.push(styled.username);
      dynamic.push(styled.month);
      dynamic.push(styled.location);
      dynamic.push(getDayLabel(date));
      dynamic.push(formatSearchDate(date));
      dynamic.push(getMonthName(getNotificationMonthKey(notification)));
      dynamic.push(
        date.toLocaleDateString('en-US', {
          weekday: 'long',
        })
      );

      if (data.date) dynamic.push(data.date);
      if (data.mealDate) dynamic.push(data.mealDate);
      if (data.bazarDate) dynamic.push(data.bazarDate);
      if (data.room) dynamic.push(`Room ${data.room}`);
      if (data.place) dynamic.push(data.place);
      if (data.market) dynamic.push(data.market);
      if (data.location) dynamic.push(data.location);
      if (data.area) dynamic.push(data.area);
      if (data.city) dynamic.push(data.city);
      if (data.reason) dynamic.push(sanitizeUserText(data.reason));
    });

    const all = [...recentSearches, ...base, ...dynamic]
      .map((item) => String(item || '').trim())
      .filter(Boolean);

    const unique = [];

    all.forEach((item) => {
      const normalized = normalizeText(item);

      if (!normalized) return;
      if (unique.some((existing) => normalizeText(existing) === normalized)) return;

      unique.push(item);
    });

    const term = normalizeText(searchTerm);

    return unique
      .filter((item) => {
        if (!term) return true;
        return normalizeText(item).includes(term) && normalizeText(item) !== term;
      })
      .slice(0, 18);
  }, [visibleNotifications, recentSearches, searchTerm]);

  const filteredNotifications = useMemo(() => {
    const normalizedSearch = normalizeText(searchTerm);

    return visibleNotifications.filter((notification) => {
      const styled = buildStyledMessage(notification);

      if (filter === 'unread' && notification.read) return false;
      if (filter === 'paid' && styled.status !== 'paid') return false;
      if (filter === 'partial' && styled.status !== 'partial') return false;
      if (filter === 'advance' && styled.status !== 'advance') return false;
      if (filter === 'due' && styled.status !== 'due' && styled.status !== 'unpaid') return false;

      if (filter === 'bill' && styled.kind !== 'rent') return false;
      if (filter === 'meal' && !String(styled.kind).startsWith('meal_')) return false;
      if (filter === 'meal_added' && styled.kind !== 'meal_added') return false;
      if (filter === 'meal_edited' && styled.kind !== 'meal_edited') return false;
      if (filter === 'meal_payment' && styled.kind !== 'meal_payment') return false;

      if (
        filter === 'bazar' &&
        styled.kind !== 'bazar' &&
        styled.kind !== 'balance'
      ) {
        return false;
      }

      if (!matchesDateFilter(notification, dateFilter)) return false;

      if (monthFilter !== 'all' && getNotificationMonthKey(notification) !== monthFilter) {
        return false;
      }

      if (normalizedSearch) {
        return getSearchText(notification).includes(normalizedSearch);
      }

      return true;
    });
  }, [visibleNotifications, filter, dateFilter, monthFilter, searchTerm]);

  const groupedNotifications = useMemo(() => {
    const groups = [];

    filteredNotifications.forEach((notification) => {
      const key = getDayKey(notification.createdAt);
      const existingGroup = groups.find((group) => group.key === key);

      if (existingGroup) {
        existingGroup.items.push(notification);
      } else {
        groups.push({
          key,
          label: getDayLabel(notification.createdAt),
          items: [notification],
        });
      }
    });

    return groups;
  }, [filteredNotifications]);

  const notificationEnabled =
    settings?.enabled === true &&
    settings?.permission === 'granted' &&
    deviceInfo.permission === 'granted';

  useEffect(() => {
    if (!user?.uid || !db) return;

    const unsubscribeSettings = onSnapshot(
      doc(db, 'notificationSettings', user.uid),
      (snapshot) => {
        setSettings(snapshot.exists() ? snapshot.data() : null);
        setSettingsLoading(false);
      },
      () => {
        setSettingsLoading(false);
      }
    );

    const notificationsQuery = query(
      collection(db, 'notifications'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribeNotifications = onSnapshot(
      notificationsQuery,
      (snapshot) => {
        const rows = snapshot.docs.map((item) => {
          const data = item.data();

          return {
            id: item.id,
            ...data,
            createdAt: toDate(data.createdAt),
            updatedAt: data.updatedAt ? toDate(data.updatedAt) : null,
            readAt: data.readAt ? toDate(data.readAt) : null,
          };
        });

        setNotifications(rows);
        setLoading(false);
      },
      () => {
        setLoading(false);
      }
    );

    return () => {
      unsubscribeSettings();
      unsubscribeNotifications();
    };
  }, [user?.uid]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const latestDeviceInfo = getDeviceInfo();
      setDeviceInfo(latestDeviceInfo);

      if (
        latestDeviceInfo.permission !== 'granted' &&
        latestDeviceInfo.permission !== 'unsupported'
      ) {
        const dismissed = localStorage.getItem(
          'notificationPermissionDismissed'
        );

        if (!dismissed) {
          setPermissionModalOpen(true);
        }
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    function refreshDeviceInfo() {
      setDeviceInfo(getDeviceInfo());
    }

    window.addEventListener('focus', refreshDeviceInfo);

    return () => {
      window.removeEventListener('focus', refreshDeviceInfo);
    };
  }, []);

  function saveRecentSearch(term) {
    const clean = String(term || '').trim();

    if (!clean) return;

    const next = [
      clean,
      ...recentSearches.filter(
        (item) => normalizeText(item) !== normalizeText(clean)
      ),
    ].slice(0, 8);

    setRecentSearches(next);

    try {
      localStorage.setItem(RECENT_SEARCH_KEY, JSON.stringify(next));
    } catch {}
  }

  function applySmartFilter(value) {
    const term = normalizeText(value);

    if (!term) return false;

    if (term === 'today') {
      setDateFilter('today');
      setMonthFilter('all');
      setSearchTerm('');
      return true;
    }

    if (term === 'yesterday') {
      setDateFilter('yesterday');
      setMonthFilter('all');
      setSearchTerm('');
      return true;
    }

    if (term === 'last 7 days' || term === 'week') {
      setDateFilter('week');
      setMonthFilter('all');
      setSearchTerm('');
      return true;
    }

    if (term === 'this month') {
      setDateFilter('all');
      setMonthFilter(getCurrentMonthKey());
      setSearchTerm('');
      return true;
    }

    const filterMap = {
      'house rent': 'bill',
      rent: 'bill',
      bazar: 'bazar',
      balance: 'bazar',
      'all meals': 'meal',
      meal: 'meal',
      meals: 'meal',
      'meal added': 'meal_added',
      added: 'meal_added',
      'meal edited': 'meal_edited',
      edited: 'meal_edited',
      'meal payment': 'meal_payment',
      payment: 'meal_payment',
      paid: 'paid',
      due: 'due',
      unpaid: 'due',
      advance: 'advance',
      partial: 'partial',
    };

    if (filterMap[term]) {
      setFilter(filterMap[term]);
      setSearchTerm('');
      return true;
    }

    return false;
  }

  function applySearchSuggestion(value) {
    const handled = applySmartFilter(value);

    if (!handled) {
      setSearchTerm(value);
      saveRecentSearch(value);
    }

    setShowSuggestions(false);
  }

  function clearSearch() {
    setSearchTerm('');
    setShowSuggestions(false);
  }

  function clearAllFilters() {
    setFilter('all');
    setDateFilter('all');
    setMonthFilter('all');
    setSearchTerm('');
  }

  const handleEnableNotifications = useCallback(async () => {
    if (!user?.uid) return;

    const latestDeviceInfo = getDeviceInfo();
    setDeviceInfo(latestDeviceInfo);

    if (!latestDeviceInfo.supportsPush) {
      toast.error('This browser does not support push notifications.');
      return;
    }

    if (latestDeviceInfo.isIOS && !latestDeviceInfo.isStandalone) {
      toast.error('On iPhone, add this app to Home Screen first.');
      return;
    }

    if (latestDeviceInfo.permission === 'denied') {
      toast.error('Notifications are blocked. Enable them from browser or phone settings.');
      await saveNotificationSettings(user.uid, false, '');
      return;
    }

    try {
      setEnabling(true);

      const success = await setupPushNotifications(user.uid);

      if (!success) {
        await saveNotificationSettings(user.uid, false, '');
        toast.error('Please allow notification permission.');
        return;
      }

      const token = await getFCMToken(user.uid);

      await saveNotificationSettings(user.uid, true, token || '');

      localStorage.removeItem('notificationPermissionDismissed');
      setPermissionModalOpen(false);
      setDeviceInfo(getDeviceInfo());

      toast.success('Notifications enabled successfully.');
    } catch (error) {
      toast.error(error.message || 'Failed to enable notifications.');
    } finally {
      setEnabling(false);
    }
  }, [user]);

  async function markAsRead(notificationId) {
    if (!notificationId) return;

    await updateDoc(doc(db, 'notifications', notificationId), {
      read: true,
      readAt: serverTimestamp(),
    });
  }

  async function handleOpenRelatedPage(notification) {
    if (!notification.read) {
      await markAsRead(notification.id);
    }

    const styled = buildStyledMessage(notification);

    if (styled.category.page.url) {
      router.push(styled.category.page.url);
    }
  }

  async function handleSingleMarkRead(notification) {
    if (!notification.read) {
      await markAsRead(notification.id);
    }
  }

  async function markAllAsRead() {
    const unreadNotifications = visibleNotifications.filter(
      (notification) => !notification.read
    );

    if (unreadNotifications.length === 0) return;

    try {
      setMarkingAll(true);

      const batch = writeBatch(db);

      unreadNotifications.forEach((notification) => {
        batch.update(doc(db, 'notifications', notification.id), {
          read: true,
          readAt: serverTimestamp(),
        });
      });

      await batch.commit();
      toast.success('All notifications marked as read.');
    } catch {
      toast.error('Failed to mark all as read.');
    } finally {
      setMarkingAll(false);
    }
  }

  function closePermissionModal() {
    localStorage.setItem('notificationPermissionDismissed', 'true');
    setPermissionModalOpen(false);
  }

  if (loading || settingsLoading) {
    return (
      <main className="flex min-h-[70vh] items-center justify-center px-4">
        <div className="flex w-full max-w-xs flex-col items-center gap-3 rounded-3xl border border-gray-200 bg-white px-6 py-7 shadow-sm">
          <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
          <p className="text-sm font-bold text-gray-500">Loading messages...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-0 py-0 md:px-5 md:py-6 lg:px-8">
      {/* Lightweight mobile inbox. Firestore listeners and router actions are
          shared with desktop, so every action updates without a page reload. */}
      {isMobileView && (
      <section className="min-h-[calc(100dvh-100px)] bg-slate-50 md:hidden">
        <header className="sticky top-12 z-30 border-b border-slate-200 bg-white/95 px-3 pb-2 pt-2 backdrop-blur-xl">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white shadow-sm shadow-violet-200">
              <Bell className="h-4 w-4" />
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-black text-slate-950">
                  Notifications
                </h1>
                {unreadCount > 0 && (
                  <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[8px] font-black leading-none text-white">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </div>
              <p className="text-[9px] font-semibold text-slate-400">
                {filteredNotifications.length} message
                {filteredNotifications.length === 1 ? '' : 's'} · Live updates
              </p>
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllAsRead}
                disabled={markingAll}
                className="flex h-8 items-center gap-1 rounded-lg bg-slate-900 px-2.5 text-[9px] font-black text-white disabled:opacity-50"
              >
                {markingAll ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCheck className="h-3.5 w-3.5" />
                )}
                Read all
              </button>
            )}
          </div>

          <div className="relative mt-2">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search messages..."
              className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-8 text-[10px] font-bold text-slate-800 outline-none transition focus:border-violet-300 focus:bg-white focus:ring-2 focus:ring-violet-100"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-slate-400"
                aria-label="Clear search"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          <div className="mt-2 grid grid-cols-5 gap-1">
            {[
              { value: 'all', label: 'All' },
              { value: 'unread', label: 'Unread' },
              { value: 'meal', label: 'Meals' },
              { value: 'bill', label: 'Bills' },
              { value: 'bazar', label: 'Bazar' },
            ].map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => {
                  setFilter(item.value);
                  setDateFilter('all');
                  setMonthFilter('all');
                }}
                className={`h-7 truncate rounded-lg px-1 text-[8px] font-black transition ${
                  filter === item.value
                    ? 'bg-violet-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-500'
                }`}
              >
                {item.label}
                {item.value === 'unread' && unreadCount > 0
                  ? ` ${unreadCount}`
                  : ''}
              </button>
            ))}
          </div>
        </header>

        {!notificationEnabled && (
          <div className="mx-2 mt-2 flex items-center gap-2 rounded-xl border border-violet-100 bg-violet-50 px-2.5 py-2">
            <BellRing className="h-4 w-4 shrink-0 text-violet-600" />
            <p className="min-w-0 flex-1 text-[9px] font-bold leading-4 text-violet-800">
              Enable push alerts for instant updates.
            </p>
            <button
              type="button"
              onClick={handleEnableNotifications}
              disabled={enabling}
              className="h-7 shrink-0 rounded-lg bg-violet-600 px-2.5 text-[8px] font-black text-white disabled:opacity-50"
            >
              {enabling ? 'Enabling…' : 'Enable'}
            </button>
          </div>
        )}

        <div className="px-2 pb-3 pt-2">
          {groupedNotifications.length > 0 ? (
            groupedNotifications.map((group) => (
              <div key={group.key} className="mb-3">
                <div className="mb-1 flex items-center gap-2 px-1">
                  <span className="text-[8px] font-black uppercase tracking-wider text-slate-400">
                    {group.label}
                  </span>
                  <span className="h-px flex-1 bg-slate-200" />
                </div>

                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                  {group.items.map((notification, index) => {
                    const styled = buildStyledMessage(notification);
                    const canOpen = Boolean(styled.category.page.url);

                    return (
                      <button
                        key={notification.id}
                        type="button"
                        onClick={() =>
                          canOpen
                            ? handleOpenRelatedPage(notification)
                            : handleSingleMarkRead(notification)
                        }
                        className={`relative flex w-full gap-2.5 px-2.5 py-2 text-left transition active:bg-slate-100 ${
                          index > 0 ? 'border-t border-slate-100' : ''
                        } ${
                          notification.read
                            ? 'bg-white'
                            : 'bg-violet-50/55'
                        }`}
                      >
                        <span
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm text-white ${styled.design.avatar}`}
                        >
                          {styled.category.icon}
                        </span>

                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="min-w-0 flex-1 truncate text-[10px] font-black text-slate-900">
                              {styled.category.title}
                            </span>
                            <span className="shrink-0 text-[8px] font-bold text-slate-400">
                              {formatShortTime(notification.createdAt)}
                            </span>
                            {!notification.read && (
                              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-violet-600" />
                            )}
                          </span>

                          <span className="mt-0.5 block truncate text-[9px] font-bold text-slate-600">
                            {styled.design.label}
                            {styled.month ? ` · ${styled.month}` : ''}
                          </span>

                          <span className="mt-0.5 line-clamp-2 block text-[8px] leading-3.5 text-slate-500">
                            {styled.message}
                          </span>

                          <span className="mt-1 flex min-w-0 items-center gap-1">
                            <span
                              className={`truncate rounded px-1.5 py-0.5 text-[7px] font-black uppercase ${styled.design.badge}`}
                            >
                              {styled.design.short}
                            </span>
                            {styled.location && (
                              <span className="min-w-0 truncate text-[7px] font-bold text-slate-400">
                                · {styled.location}
                              </span>
                            )}
                            {canOpen && (
                              <span className="ml-auto inline-flex shrink-0 items-center gap-0.5 text-[7px] font-black text-violet-600">
                                {styled.category.page.short}
                                <Send className="h-2.5 w-2.5" />
                              </span>
                            )}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          ) : (
            <div className="flex min-h-52 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white px-6 text-center">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100">
                <Inbox className="h-5 w-5 text-slate-400" />
              </span>
              <p className="mt-2 text-xs font-black text-slate-600">
                No notifications found
              </p>
              <p className="mt-1 text-[9px] text-slate-400">
                New updates will appear here instantly.
              </p>
              {(filter !== 'all' || searchTerm) && (
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="mt-3 rounded-lg bg-violet-600 px-3 py-2 text-[9px] font-black text-white"
                >
                  Clear filters
                </button>
              )}
            </div>
          )}
        </div>
      </section>
      )}

      {!isMobileView && (
      <div className="hidden md:block">
      {!notificationEnabled && (
        <section className="mb-4 rounded-3xl border border-violet-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-700 sm:h-12 sm:w-12">
                <BellRing className="h-5 w-5 sm:h-6 sm:w-6" />
              </div>

              <div>
                <h1 className="text-sm font-black text-gray-950 sm:text-base">
                  Turn on message alerts
                </h1>

                <p className="mt-1 text-xs leading-5 text-gray-500 sm:text-sm">
                  Get instant updates for rent, meal records, meal payments, bazar, and balance changes.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleEnableNotifications}
              disabled={enabling}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 px-5 py-3 text-sm font-black text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >
              {enabling ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Bell className="h-4 w-4" />
              )}
              {enabling ? 'Enabling...' : 'Allow Notifications'}
            </button>
          </div>

          {deviceInfo.isIOS && !deviceInfo.isStandalone && (
            <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-4">
              <div className="flex gap-3">
                <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" />

                <div>
                  <p className="text-sm font-black text-blue-800">
                    iPhone setup required
                  </p>

                  <p className="mt-1 text-xs leading-5 text-blue-700">
                    Open in Safari, tap Share, add to Home Screen, then open from Home Screen and enable notifications.
                  </p>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      <section className="sticky top-0 z-20 -mx-3 mb-4 border-b border-gray-100 bg-gray-50/95 px-3 py-3 backdrop-blur sm:static sm:mx-0 sm:rounded-3xl sm:border sm:border-gray-200 sm:bg-white sm:p-5 sm:shadow-sm lg:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-wide text-violet-600 sm:text-xs">
              Messenger Style Updates
            </p>

            <h2 className="mt-1 text-xl font-black text-gray-950 sm:text-3xl">
              Notification Messages
            </h2>

            <p className="mt-1 text-xs text-gray-500 sm:text-sm">
              {unreadCount > 0
                ? `${unreadCount} unread message${unreadCount > 1 ? 's' : ''}`
                : 'All messages are read'}
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            {(filter !== 'all' || dateFilter !== 'all' || monthFilter !== 'all' || searchTerm) && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-xs font-black text-gray-700 transition hover:bg-gray-50 sm:w-auto"
              >
                Clear filters
              </button>
            )}

            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllAsRead}
                disabled={markingAll}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gray-900 px-4 py-3 text-xs font-black text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              >
                <CheckCheck className="h-4 w-4" />
                {markingAll ? 'Marking...' : 'Mark all read'}
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 grid gap-2 lg:grid-cols-[1fr_180px_180px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />

            <input
              value={searchTerm}
              onChange={(event) => {
                setSearchTerm(event.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => {
                setTimeout(() => setShowSuggestions(false), 180);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  const handled = applySmartFilter(searchTerm);
                  if (!handled) saveRecentSearch(searchTerm);
                  setShowSuggestions(false);
                }
              }}
              placeholder="Search by date, day, month, room, meal, bazar, paid..."
              className="w-full rounded-2xl border border-gray-200 bg-white py-3 pl-11 pr-10 text-xs font-bold text-gray-800 outline-none transition placeholder:text-gray-400 focus:border-violet-400 focus:ring-4 focus:ring-violet-100 sm:bg-gray-50 sm:text-sm"
            />

            {searchTerm && (
              <button
                type="button"
                onClick={clearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-gray-400 hover:bg-gray-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}

            {showSuggestions && smartSuggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-30 max-h-80 overflow-y-auto rounded-3xl border border-gray-200 bg-white p-3 shadow-2xl">
                {recentSearches.length > 0 && (
                  <div className="mb-3">
                    <div className="mb-2 flex items-center gap-1.5 text-[10px] font-black uppercase text-gray-400">
                      <History className="h-3.5 w-3.5" />
                      Recent Searches
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {recentSearches.slice(0, 6).map((item) => (
                        <button
                          key={`recent-${item}`}
                          type="button"
                          onMouseDown={(event) => {
                            event.preventDefault();
                            applySearchSuggestion(item);
                          }}
                          className="rounded-full bg-gray-100 px-3 py-1.5 text-[11px] font-black text-gray-700 hover:bg-violet-100 hover:text-violet-700"
                        >
                          {item}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mb-2 flex items-center gap-1.5 text-[10px] font-black uppercase text-gray-400">
                  <Sparkles className="h-3.5 w-3.5" />
                  Suggestions
                </div>

                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {smartSuggestions.map((item) => (
                    <button
                      key={`suggestion-${item}`}
                      type="button"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        applySearchSuggestion(item);
                      }}
                      className="flex items-center gap-2 rounded-2xl px-3 py-2 text-left text-xs font-bold text-gray-700 hover:bg-violet-50 hover:text-violet-700"
                    >
                      <Search className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                      <span className="truncate">{item}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="relative">
            <CalendarDays className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />

            <select
              value={dateFilter}
              onChange={(event) => {
                setDateFilter(event.target.value);
                if (event.target.value !== 'all') {
                  setMonthFilter('all');
                }
              }}
              className="w-full appearance-none rounded-2xl border border-gray-200 bg-white py-3 pl-11 pr-4 text-xs font-black text-gray-700 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100 sm:bg-gray-50 sm:text-sm"
            >
              <option value="all">All dates</option>
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="week">Last 7 days</option>
              <option value="month">This month</option>
            </select>
          </div>

          <div className="relative">
            <CalendarDays className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />

            <select
              value={monthFilter}
              onChange={(event) => {
                setMonthFilter(event.target.value);
                if (event.target.value !== 'all') {
                  setDateFilter('all');
                }
              }}
              className="w-full appearance-none rounded-2xl border border-gray-200 bg-white py-3 pl-11 pr-4 text-xs font-black text-gray-700 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100 sm:bg-gray-50 sm:text-sm"
            >
              <option value="all">All months</option>
              {monthOptions.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {[
            'Today',
            'Yesterday',
            'This month',
            'Meal Added',
            'Meal Edited',
            'Meal Payment',
            'Paid',
            'Due',
            'Advance',
            'Bazar',
          ].map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => applySearchSuggestion(item)}
              className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-[10px] font-black text-gray-600 hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700"
            >
              {item}
            </button>
          ))}
        </div>
      </section>

      <section className="mb-4 flex gap-2 overflow-x-auto pb-1">
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-gray-200 bg-white px-3 py-2.5 text-xs font-black text-gray-500">
          <Filter className="h-3.5 w-3.5" />
          Filter
        </span>

        {[
          { value: 'all', label: 'All' },
          { value: 'unread', label: `Unread ${unreadCount}` },
          { value: 'bill', label: 'House Rent' },
          { value: 'meal', label: 'All Meals' },
          { value: 'meal_added', label: 'Meal Added' },
          { value: 'meal_edited', label: 'Meal Edited' },
          { value: 'meal_payment', label: 'Meal Payment' },
          { value: 'paid', label: 'Paid' },
          { value: 'partial', label: 'Partial' },
          { value: 'due', label: 'Due/Unpaid' },
          { value: 'advance', label: 'Advance' },
          { value: 'bazar', label: 'Bazar' },
        ].map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => {
              setFilter(item.value);
              setSearchTerm('');
            }}
            className={`shrink-0 rounded-full px-4 py-2.5 text-xs font-black transition ${
              filter === item.value
                ? 'bg-violet-600 text-white shadow-sm'
                : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            {item.label}
          </button>
        ))}
      </section>

      <section className="space-y-5">
        {groupedNotifications.length > 0 ? (
          groupedNotifications.map((group) => (
            <div key={group.key} className="space-y-3">
              <div className="sticky top-[142px] z-10 flex justify-center sm:static">
                <span className="rounded-full border border-gray-200 bg-white/95 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-gray-500 shadow-sm backdrop-blur">
                  {group.label}
                </span>
              </div>

              {group.items.map((notification) => {
                const styled = buildStyledMessage(notification);

                return (
                  <article key={notification.id} className="flex gap-2.5 sm:gap-4">
                    <div
                      className={`mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base text-white shadow-sm ring-4 sm:h-11 sm:w-11 sm:text-lg ${styled.design.avatar} ${styled.design.ring}`}
                    >
                      {styled.category.icon}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <span className="text-xs font-black text-gray-900">
                          {styled.category.sender}
                        </span>

                        <span className="text-[10px] font-bold text-gray-400">
                          {formatShortTime(notification.createdAt)}
                        </span>

                        {!notification.read && (
                          <span className="rounded-full bg-red-500 px-2 py-0.5 text-[9px] font-black uppercase text-white">
                            New
                          </span>
                        )}
                      </div>

                      <div
                        className={`max-w-full rounded-[22px] rounded-tl-md border px-3 py-3 shadow-sm sm:rounded-[24px] sm:px-5 sm:py-4 ${styled.design.bubble}`}
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-wide text-gray-500 sm:text-[11px]">
                              {styled.category.title}
                            </p>

                            <div className="mt-2 flex flex-wrap items-center gap-1.5 sm:gap-2">
                              <span
                                className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase sm:text-[10px] ${styled.design.badge}`}
                              >
                                {styled.design.emoji} {styled.design.short}
                              </span>

                              {styled.month && (
                                <span className="rounded-full bg-white/80 px-2.5 py-1 text-[9px] font-black uppercase text-gray-500 sm:text-[10px]">
                                  {styled.month}
                                </span>
                              )}

                              {styled.location && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2.5 py-1 text-[9px] font-black uppercase text-gray-500 sm:text-[10px]">
                                  <MapPin className="h-3 w-3" />
                                  {styled.location}
                                </span>
                              )}
                            </div>

                            <h3
                              className={`mt-2 text-sm font-black sm:mt-3 sm:text-base ${styled.design.text}`}
                            >
                              {styled.design.label}
                            </h3>
                          </div>

                          {notification.read && (
                            <span className="inline-flex w-fit shrink-0 items-center gap-1 rounded-full bg-white/80 px-2 py-1 text-[9px] font-black uppercase text-gray-500 sm:text-[10px]">
                              <CheckCircle className="h-3 w-3" />
                              Read
                            </span>
                          )}
                        </div>

                        <p className="mt-3 whitespace-pre-line text-xs leading-5 text-gray-800 sm:text-sm sm:leading-6">
                          {styled.message}
                        </p>

                        {styled.detailsType === 'meal_entry' && (
                          <MealEntryDetails details={styled.mealEntry} />
                        )}

                        {styled.detailsType === 'meal_payment' && (
                          <MealPaymentDetails
                            details={styled.mealPayment}
                            styled={styled}
                          />
                        )}

                        {styled.detailsType === 'bazar_entry' && (
                          <BazarEntryDetails details={styled.bazarEntry} />
                        )}

                        {styled.detailsType === 'money' && (
                          <MoneyDetails styled={styled} />
                        )}

                        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex items-center gap-2 text-[10px] font-bold text-gray-400 sm:text-xs">
                            <Clock className="h-3.5 w-3.5" />
                            {formatFullTime(notification.createdAt)}
                          </div>

                          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                            {!notification.read && (
                              <button
                                type="button"
                                onClick={() => handleSingleMarkRead(notification)}
                                className="rounded-2xl border border-gray-200 bg-white px-3 py-2.5 text-[11px] font-black text-gray-700 transition hover:bg-gray-50 sm:px-4 sm:text-xs"
                              >
                                Mark read
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => handleOpenRelatedPage(notification)}
                              disabled={!styled.category.page.url}
                              className={`inline-flex items-center justify-center gap-2 rounded-2xl px-3 py-2.5 text-[11px] font-black text-white shadow-sm transition disabled:cursor-not-allowed disabled:bg-gray-300 sm:px-4 sm:text-xs ${
                                styled.design.button
                              } ${notification.read ? 'col-span-2 sm:col-span-1' : ''}`}
                            >
                              <Send className="h-3.5 w-3.5" />
                              {styled.category.page.label}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ))
        ) : (
          <div className="rounded-3xl border border-dashed border-gray-200 bg-white p-8 text-center sm:p-14">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gray-50 sm:h-16 sm:w-16">
              <Inbox className="h-7 w-7 text-gray-300 sm:h-8 sm:w-8" />
            </div>

            <p className="mt-4 text-sm font-black text-gray-500">
              No notification message found
            </p>

            <p className="mt-1 text-xs text-gray-400">
              Try changing the search, date filter, month filter, or category filter.
            </p>
          </div>
        )}
      </section>
      </div>
      )}

      {permissionModalOpen && !notificationEnabled && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-gray-950/60 px-0 sm:items-center sm:px-4"
          onClick={closePermissionModal}
        >
          <div
            className="w-full overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-w-md sm:rounded-3xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="bg-gradient-to-br from-violet-600 to-indigo-600 p-6 text-white">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15">
                    <BellRing className="h-6 w-6" />
                  </div>

                  <h2 className="mt-4 text-2xl font-black">
                    Enable message alerts
                  </h2>

                  <p className="mt-2 text-sm leading-6 text-white/80">
                    Receive instant updates for rent, meals, bazar, and balance changes.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closePermissionModal}
                  className="rounded-2xl bg-white/15 p-2 text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="p-5">
              {deviceInfo.isIOS && !deviceInfo.isStandalone ? (
                <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                  <div className="flex gap-3">
                    <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" />

                    <div>
                      <p className="text-sm font-black text-blue-800">
                        iPhone setup needed
                      </p>

                      <ol className="mt-2 list-inside list-decimal space-y-1 text-xs leading-5 text-blue-700">
                        <li>Open this website in Safari.</li>
                        <li>Tap Share.</li>
                        <li>Tap Add to Home Screen.</li>
                        <li>Open the app from Home Screen.</li>
                        <li>Enable notifications here.</li>
                      </ol>
                    </div>
                  </div>
                </div>
              ) : deviceInfo.permission === 'denied' ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
                  <div className="flex gap-3">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-700" />

                    <div>
                      <p className="text-sm font-black text-red-800">
                        Notifications are blocked
                      </p>

                      <p className="mt-1 text-xs leading-5 text-red-700">
                        Allow notifications from browser or phone settings first.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleEnableNotifications}
                  disabled={enabling}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 py-3.5 text-sm font-black text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {enabling ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Bell className="h-4 w-4" />
                  )}
                  {enabling ? 'Enabling...' : 'Allow Notifications'}
                </button>
              )}

              <button
                type="button"
                onClick={closePermissionModal}
                className="mt-3 w-full rounded-2xl border border-gray-200 bg-white py-3 text-sm font-black text-gray-600"
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
