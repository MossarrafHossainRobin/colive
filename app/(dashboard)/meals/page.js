'use client'

import { useCallback, useEffect, useMemo, useState } from 'react';
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
import {
  Bell,
  BellRing,
  Calendar,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  Loader2,
  Search,
  Smartphone,
  Soup,
  TrendingUp,
  UserCheck,
  Users,
  Utensils,
  WalletCards,
  X,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import MealNotificationCard from './MealNotificationCard';
import { isMemberOnline } from '@/lib/presence';
import { calculateMonthlyBazarTotals } from '@/lib/bazarCalculations';
import { isMemberAccountActive } from '@/lib/memberPolicy';
import useMealRatePeriod from '@/app/hooks/useMealRatePeriod';
import { dedupeMealRecords } from '@/lib/mealRecords';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const YEARS = [2024, 2025, 2026, 2027, 2028, 2029, 2030];

function getDeviceInfo() {
  if (typeof window === 'undefined') {
    return {
      permission: 'default',
      supportsPush: false,
      isStandalone: false,
      isIOS: false,
    };
  }

  const userAgent = window.navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(userAgent);
  const isStandalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  return {
    permission:
      typeof Notification !== 'undefined' ? Notification.permission : 'default',
    supportsPush:
      typeof Notification !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window,
    isStandalone,
    isIOS,
  };
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

function safeDate(value) {
  if (!value) return null;
  if (value?.toDate) return value.toDate();

  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    return new Date(`${value}T00:00:00+06:00`);
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getMonthId(year, monthIndex) {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
}

function getMonthName(year, monthIndex) {
  return `${MONTHS[monthIndex]} ${year}`;
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
  const number = Number(value);
  if (!Number.isFinite(number)) return '৳0';
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

function safeAmount(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function getMealTotal(meal) {
  return mealNumber(
    mealNumber(meal?.lunch) +
      mealNumber(meal?.dinner) +
      mealNumber(meal?.guestMeal)
  );
}

function getUserName(user) {
  return (
    user?.displayName ||
    user?.name ||
    user?.fullName ||
    user?.email ||
    'Member'
  );
}

function getUserPhoto(user) {
  return user?.photoURL || user?.photo || user?.avatar || user?.image || '';
}

function getInitial(name) {
  return String(name || 'M').charAt(0).toUpperCase();
}

function formatMealDate(dateValue) {
  const date = safeDate(dateValue);
  if (!date) return dateValue || 'Unknown date';

  return date.toLocaleDateString('en-US', {
    timeZone: 'Asia/Dhaka',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatMealDay(dateValue) {
  const date = safeDate(dateValue);
  if (!date) return '';

  return date.toLocaleDateString('en-US', {
    timeZone: 'Asia/Dhaka',
    weekday: 'long',
  });
}

function isLive(member) {
  return isMemberOnline(member);
}

function getNotificationDate(notification) {
  return (
    safeDate(notification?.sentAt) ||
    safeDate(notification?.createdAt) ||
    safeDate(notification?.timestamp) ||
    safeDate(notification?.updatedAt) ||
    null
  );
}

function isMealNotification(notification) {
  const data = notification?.data || {};

  const text = [
    notification?.title,
    notification?.body,
    notification?.message,
    notification?.type,
    notification?.category,
    data.type,
    data.status,
  ]
    .join(' ')
    .toLowerCase();

  return (
    text.includes('meal') ||
    text.includes('lunch') ||
    text.includes('dinner') ||
    text.includes('guest') ||
    text.includes('payment due') ||
    text.includes('pending due')
  );
}

function getMealNotificationMonth(notification) {
  const data = notification?.data || {};

  const directMonth =
    data.month ||
    data.monthId ||
    notification?.month ||
    notification?.monthId ||
    '';

  if (directMonth) return directMonth;

  const mealDate =
    data.date ||
    data.mealDate ||
    notification?.date ||
    notification?.mealDate ||
    '';

  if (/^\d{4}-\d{2}/.test(String(mealDate))) {
    return String(mealDate).slice(0, 7);
  }

  const createdDate = getNotificationDate(notification);

  if (createdDate) {
    return `${createdDate.getFullYear()}-${String(
      createdDate.getMonth() + 1
    ).padStart(2, '0')}`;
  }

  return '';
}

function getMealSearchText(meal) {
  return [
    meal?.date,
    formatMealDate(meal?.date),
    meal?.notes,
    meal?.reason,
    meal?.guestName,
    meal?.lunch,
    meal?.dinner,
    meal?.guestMeal,
    getMealTotal(meal),
  ]
    .join(' ')
    .toLowerCase();
}

function getNotificationSearchText(notification) {
  const data = notification?.data || {};

  return [
    notification?.title,
    notification?.body,
    notification?.message,
    notification?.type,
    notification?.category,
    data.type,
    data.action,
    data.status,
    data.reason,
    data.notes,
    data.date,
    data.mealDate,
    data.month,
    data.monthId,
    data.userName,
    data.name,
    data.lunch,
    data.dinner,
    data.guestMeal,
    data.totalMeal,
    data.mealRate,
    data.mealRateSnapshot,
    data.entryCost,
    data.entryCostSnapshot,
    data.totalBazar,
    data.totalBazarSnapshot,
    data.overallMeals,
    data.overallMealsSnapshot,
    data.givenAmount,
    data.paidAmount,
    data.due,
    data.dueAmount,
    data.advance,
  ]
    .join(' ')
    .toLowerCase();
}

function getMealStats(rows) {
  let lunch = 0;
  let dinner = 0;
  let guest = 0;

  rows.forEach((meal) => {
    lunch += mealNumber(meal.lunch);
    dinner += mealNumber(meal.dinner);
    guest += mealNumber(meal.guestMeal);
  });

  const total = mealNumber(lunch + dinner + guest);
  const days = rows.length;

  return {
    totalLunch: mealNumber(lunch),
    totalDinner: mealNumber(dinner),
    totalGuest: mealNumber(guest),
    totalMeals: total,
    daysRecorded: days,
    avgPerDay: days > 0 ? mealNumber(total / days) : 0,
  };
}

function getAccountingStatus({ payable, paid }) {
  const roundedPayable = Math.round(payable);
  const roundedPaid = Math.round(paid);
  const balance = roundedPayable - roundedPaid;

  if (roundedPayable <= 0 && roundedPaid <= 0) {
    return {
      status: 'none',
      statusLabel: 'No Meal',
      due: 0,
      advance: 0,
      balanceText: 'No payable amount',
    };
  }

  if (balance === 0) {
    return {
      status: 'paid',
      statusLabel: 'Paid',
      due: 0,
      advance: 0,
      balanceText: 'Fully paid',
    };
  }

  if (balance > 0) {
    return {
      status: 'due',
      statusLabel: 'Due',
      due: balance,
      advance: 0,
      balanceText: `Pending Due: ${money(balance)}`,
    };
  }

  return {
    status: 'advance',
    statusLabel: 'Advance',
    due: 0,
    advance: Math.abs(balance),
    balanceText: `Advance: ${money(Math.abs(balance))}`,
  };
}

function MemberAvatar({ member, size = 'md', active = false }) {
  const name = getUserName(member);
  const photo = getUserPhoto(member);

  const sizeClass =
    size === 'xs'
      ? 'h-6 w-6 text-[8px] rounded-full'
      : size === 'sm'
        ? 'h-9 w-9 text-xs rounded-full'
        : 'h-14 w-14 text-xl rounded-2xl';

  if (photo) {
    return (
      <img
        src={photo}
        alt={name}
        className={`${sizeClass} object-cover ring-2 ${
          active ? 'ring-orange-300' : 'ring-white'
        }`}
      />
    );
  }

  return (
    <div
      className={`${sizeClass} flex items-center justify-center bg-orange-100 font-black text-orange-700 ring-2 ${
        active ? 'ring-orange-300' : 'ring-white'
      }`}
    >
      {getInitial(name)}
    </div>
  );
}

export default function MealsPage() {
  const { user, userData } = useAuth();
  const now = new Date();

  const [meals, setMeals] = useState([]);
  const [memberMeals, setMemberMeals] = useState([]);
  const [allMonthMeals, setAllMonthMeals] = useState([]);
  const [bazarRows, setBazarRows] = useState([]);
  const [members, setMembers] = useState([]);
  const [selfProfile, setSelfProfile] = useState(null);

  const [loading, setLoading] = useState(true);
  const [loadingMemberMeals, setLoadingMemberMeals] = useState(false);

  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [searchTerm, setSearchTerm] = useState('');
  const [notificationSearchTerm, setNotificationSearchTerm] = useState('');

  const [sortConfig, setSortConfig] = useState({
    key: 'date',
    direction: 'desc',
  });

  const [activeMemberId, setActiveMemberId] = useState(null);

  const [mealNotifications, setMealNotifications] = useState([]);
  const [notificationSettings, setNotificationSettings] = useState(null);
  const [deviceInfo, setDeviceInfo] = useState(getDeviceInfo());
  const [enablingNotification, setEnablingNotification] = useState(false);
  const [markingNotifications, setMarkingNotifications] = useState(false);

  const monthStr = getMonthId(selectedYear, selectedMonth);
  const { period: canonicalRatePeriod } = useMealRatePeriod(monthStr);
  const monthName = getMonthName(selectedYear, selectedMonth);
  const viewedUserId = activeMemberId || user?.uid;

  const activeMember = useMemo(() => {
    if (!activeMemberId) return null;
    return members.find((member) => member.id === activeMemberId);
  }, [activeMemberId, members]);

  const viewingUserName = activeMember ? getUserName(activeMember) : getUserName(user);
  const viewingUserPhoto = activeMember ? getUserPhoto(activeMember) : getUserPhoto(user);

  const notificationEnabled =
    notificationSettings?.enabled === true &&
    notificationSettings?.permission === 'granted' &&
    deviceInfo.permission === 'granted';

  useEffect(() => {
    if (!user?.uid || !db) return;

    const mealsQuery = query(
      collection(db, 'meals'),
      where('userId', '==', user.uid),
      where('month', '==', monthStr),
      orderBy('date', 'desc')
    );

    const unsubscribe = onSnapshot(
      mealsQuery,
      (snapshot) => {
        setMeals(dedupeMealRecords(
          snapshot.docs.map((item) => ({ id: item.id, ...item.data() })),
          { month: monthStr }
        ));
        setLoading(false);
      },
      (error) => {
        console.error('Meals listener error:', error);
        toast.error('Failed to load meals.');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user?.uid, monthStr]);

  useEffect(() => {
    if (!monthStr || !db) return;

    const allMealsQuery = query(
      collection(db, 'meals'),
      where('month', '==', monthStr)
    );

    const unsubscribe = onSnapshot(allMealsQuery, (snapshot) => {
      setAllMonthMeals(dedupeMealRecords(
        snapshot.docs.map((item) => ({ id: item.id, ...item.data() })),
        { month: monthStr }
      ));
    });

    return () => unsubscribe();
  }, [monthStr]);

  useEffect(() => {
    if (!monthStr || !db) return;

    const bazarQuery = query(
      collection(db, 'bazar'),
      where('month', '==', monthStr)
    );

    const unsubscribe = onSnapshot(bazarQuery, (snapshot) => {
      setBazarRows(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
    });

    return () => unsubscribe();
  }, [monthStr]);

  useEffect(() => {
    if (!user?.uid || !db) return;

    const usersQuery = query(collection(db, 'users'));

    return onSnapshot(
      usersQuery,
      (snapshot) => {
        const activeRoomMembers = snapshot.docs
          .map((item) => ({ id: item.id, ...item.data() }))
          .filter((member) => {
            return isMemberAccountActive(member) &&
              String(member?.room || '').trim() &&
              member.role !== 'admin';
          });

        setSelfProfile(
          activeRoomMembers.find((member) => member.id === user.uid) || null
        );
        setMembers(
          activeRoomMembers.filter((member) => member.id !== user.uid)
        );
      },
      (error) => console.error('Members load error:', error)
    );
  }, [user?.uid]);

  useEffect(() => {
    if (!activeMemberId || !monthStr || !db) return;

    const memberMealsQuery = query(
      collection(db, 'meals'),
      where('userId', '==', activeMemberId),
      where('month', '==', monthStr),
      orderBy('date', 'desc')
    );

    const unsubscribe = onSnapshot(
      memberMealsQuery,
      (snapshot) => {
        setMemberMeals(dedupeMealRecords(
          snapshot.docs.map((item) => ({ id: item.id, ...item.data() })),
          { month: monthStr }
        ));
        setLoadingMemberMeals(false);
      },
      () => {
        setMemberMeals([]);
        setLoadingMemberMeals(false);
      }
    );

    return () => unsubscribe();
  }, [activeMemberId, monthStr]);

  useEffect(() => {
    if (!user?.uid || !db) return;

    setDeviceInfo(getDeviceInfo());

    const settingsUnsubscribe = onSnapshot(
      doc(db, 'notificationSettings', user.uid),
      (snapshot) => {
        setNotificationSettings(snapshot.exists() ? snapshot.data() : null);
      }
    );

    const notificationsQuery = query(
      collection(db, 'notifications'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const notificationsUnsubscribe = onSnapshot(notificationsQuery, (snapshot) => {
      const rows = snapshot.docs.map((item) => {
        const data = item.data();

        return {
          id: item.id,
          ...data,
          createdAt: safeDate(data.createdAt),
          sentAt: safeDate(data.sentAt),
          timestamp: safeDate(data.timestamp),
          updatedAt: safeDate(data.updatedAt),
        };
      });

      setMealNotifications(rows.filter(isMealNotification));
    });

    return () => {
      settingsUnsubscribe();
      notificationsUnsubscribe();
    };
  }, [user?.uid]);

  useEffect(() => {
    function refreshDeviceInfo() {
      setDeviceInfo(getDeviceInfo());
    }

    window.addEventListener('focus', refreshDeviceInfo);

    return () => {
      window.removeEventListener('focus', refreshDeviceInfo);
    };
  }, []);

  const displayedMeals = activeMemberId ? memberMeals : meals;

  const filteredMeals = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    if (!term) return [...displayedMeals];

    return displayedMeals.filter((meal) => getMealSearchText(meal).includes(term));
  }, [displayedMeals, searchTerm]);

  const sortedMeals = useMemo(() => {
    const rows = [...filteredMeals];

    rows.sort((a, b) => {
      if (sortConfig.key === 'date') {
        const result = String(a.date || '').localeCompare(String(b.date || ''));
        return sortConfig.direction === 'asc' ? result : -result;
      }

      const aValue =
        sortConfig.key === 'totalMeal'
          ? getMealTotal(a)
          : mealNumber(a[sortConfig.key]);

      const bValue =
        sortConfig.key === 'totalMeal'
          ? getMealTotal(b)
          : mealNumber(b[sortConfig.key]);

      const result = aValue - bValue;

      return sortConfig.direction === 'asc' ? result : -result;
    });

    return rows;
  }, [filteredMeals, sortConfig]);

  const tableStats = useMemo(() => {
    return getMealStats(filteredMeals);
  }, [filteredMeals]);

  const fullMonthViewingStats = useMemo(() => {
    return getMealStats(displayedMeals);
  }, [displayedMeals]);

  const monthlyAccounting = useMemo(() => {
    const overallMeals = allMonthMeals.reduce((sum, meal) => {
      return sum + getMealTotal(meal);
    }, 0);

    const bazarTotals = calculateMonthlyBazarTotals(bazarRows, monthStr);
    const totalBazar = bazarTotals.house;
    const userBazarPayments = bazarTotals.byMember;

    const mealRate = Number.isFinite(Number(canonicalRatePeriod?.mealRate))
      ? Number(canonicalRatePeriod.mealRate)
      : 0;
    const previousBalance = Number(canonicalRatePeriod?.previousBalance || 0);
    const otherExpenses = Number(canonicalRatePeriod?.otherExpenses || 0);
    const adjustments = Number(canonicalRatePeriod?.adjustments || 0);
    const totalCost = Number.isFinite(Number(canonicalRatePeriod?.totalCost))
      ? Number(canonicalRatePeriod.totalCost)
      : totalBazar - previousBalance + otherExpenses + adjustments;

    return {
      overallMeals: mealNumber(overallMeals),
      totalBazar,
      mealRate,
      previousBalance,
      otherExpenses,
      adjustments,
      totalCost,
      formula: canonicalRatePeriod?.formula || '(Bazar cost − previous balance + other expenses + signed adjustments) ÷ total meals',
      revision: Number(canonicalRatePeriod?.revision || 0),
      userBazarPayments,
    };
  }, [allMonthMeals, bazarRows, canonicalRatePeriod, monthStr]);

  const memberMonthlyLedger = useMemo(() => {
    const mealsByMember = allMonthMeals.reduce((groups, meal) => {
      const memberId = meal.userId || '';
      if (!memberId) return groups;

      if (!groups[memberId]) groups[memberId] = [];
      groups[memberId].push(meal);
      return groups;
    }, {});

    const currentMember = selfProfile || {
      id: user?.uid,
      uid: user?.uid,
      name: userData?.displayName || userData?.name || user?.displayName || 'Me',
      displayName: userData?.displayName || '',
      photo: userData?.photo || user?.photoURL || '',
      room: userData?.room || '',
      isCurrentUser: true,
    };

    return [currentMember, ...members]
      .filter((member) => member?.id)
      .map((member) => {
        const stats = getMealStats(mealsByMember[member.id] || []);
        const given = monthlyAccounting.userBazarPayments[member.id] || 0;
        const cost = stats.totalMeals * monthlyAccounting.mealRate;
        const status = getAccountingStatus({ payable: cost, paid: given });

        return {
          ...member,
          ...stats,
          given,
          cost,
          ...status,
          isCurrentUser: member.id === user?.uid,
        };
      })
      .sort((a, b) => {
        if (a.isCurrentUser) return -1;
        if (b.isCurrentUser) return 1;

        const roomCompare = String(a.room || '').localeCompare(
          String(b.room || '')
        );
        if (roomCompare !== 0) return roomCompare;
        return getUserName(a).localeCompare(getUserName(b));
      });
  }, [
    allMonthMeals,
    members,
    monthlyAccounting,
    selfProfile,
    user?.displayName,
    user?.photoURL,
    user?.uid,
    userData,
  ]);

  const memberLedgerTotals = useMemo(
    () =>
      memberMonthlyLedger.reduce(
        (totals, member) => {
          totals.meals += member.totalMeals;
          totals.given += member.given;
          totals.cost += member.cost;
          totals.due += member.due;
          totals.advance += member.advance;
          return totals;
        },
        { meals: 0, given: 0, cost: 0, due: 0, advance: 0 }
      ),
    [memberMonthlyLedger]
  );

  const accounting = useMemo(() => {
    const userMeal = fullMonthViewingStats.totalMeals;
    const payable = userMeal * monthlyAccounting.mealRate;
    const paid = monthlyAccounting.userBazarPayments[viewedUserId] || 0;
    const statusInfo = getAccountingStatus({ payable, paid });

    return {
      ...statusInfo,
      userMeal,
      mealRate: monthlyAccounting.mealRate,
      payable,
      paid,
      overallMeals: monthlyAccounting.overallMeals,
      totalBazar: monthlyAccounting.totalBazar,
    };
  }, [fullMonthViewingStats.totalMeals, monthlyAccounting, viewedUserId]);

  const statusCardClass =
    accounting.status === 'paid'
      ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
      : accounting.status === 'advance'
        ? 'border-blue-100 bg-blue-50 text-blue-700'
        : accounting.status === 'due'
          ? 'border-red-100 bg-red-50 text-red-700'
          : 'border-gray-200 bg-gray-50 text-gray-700';

  const monthMealNotifications = useMemo(() => {
    return mealNotifications.filter((notification) => {
      const notificationMonth = getMealNotificationMonth(notification);

      if (!notificationMonth) return true;

      return notificationMonth === monthStr;
    });
  }, [mealNotifications, monthStr]);

  const filteredMealNotifications = useMemo(() => {
    const term = notificationSearchTerm.trim().toLowerCase();

    if (!term) return monthMealNotifications;

    return monthMealNotifications.filter((notification) => {
      return getNotificationSearchText(notification).includes(term);
    });
  }, [monthMealNotifications, notificationSearchTerm]);

  const unreadMealNotificationCount = monthMealNotifications.filter(
    (notification) => !notification.read
  ).length;

  function handleSort(key) {
    setSortConfig((old) => ({
      key,
      direction: old.key === key && old.direction === 'asc' ? 'desc' : 'asc',
    }));
  }

  function SortIcon({ column }) {
    if (sortConfig.key !== column) {
      return <ChevronDown className="h-3 w-3 text-gray-300" />;
    }

    return sortConfig.direction === 'asc' ? (
      <ChevronUp className="h-3 w-3 text-orange-500" />
    ) : (
      <ChevronDown className="h-3 w-3 text-orange-500" />
    );
  }

  function goToPrevMonth() {
    if (selectedMonth === 0) {
      setSelectedMonth(11);
      setSelectedYear((year) => year - 1);
      return;
    }

    setSelectedMonth((month) => month - 1);
  }

  function goToNextMonth() {
    if (selectedMonth === 11) {
      setSelectedMonth(0);
      setSelectedYear((year) => year + 1);
      return;
    }

    setSelectedMonth((month) => month + 1);
  }

  function handleMemberClick(memberId) {
    if (activeMemberId === memberId) {
      showMyDetails();
      return;
    }

    setLoadingMemberMeals(true);
    setActiveMemberId(memberId);
  }

  function showMyDetails() {
    setActiveMemberId(null);
    setLoadingMemberMeals(false);
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
      setEnablingNotification(true);

      const success = await setupPushNotifications(user.uid);

      if (!success) {
        await saveNotificationSettings(user.uid, false, '');
        toast.error('Please allow notification permission.');
        return;
      }

      const token = await getFCMToken(user.uid);

      await saveNotificationSettings(user.uid, true, token || '');
      setDeviceInfo(getDeviceInfo());

      toast.success('Meal notifications enabled.');
    } catch (error) {
      toast.error(error.message || 'Failed to enable notifications.');
    } finally {
      setEnablingNotification(false);
    }
  }, [user?.uid]);

  async function markNotificationRead(notificationId) {
    if (!notificationId) return;

    await updateDoc(doc(db, 'notifications', notificationId), {
      read: true,
      readAt: serverTimestamp(),
    });
  }

  async function markAllMealNotificationsRead() {
    const unread = monthMealNotifications.filter((notification) => !notification.read);

    if (unread.length === 0) return;

    try {
      setMarkingNotifications(true);

      const batch = writeBatch(db);

      unread.forEach((notification) => {
        batch.update(doc(db, 'notifications', notification.id), {
          read: true,
          readAt: serverTimestamp(),
        });
      });

      await batch.commit();
      toast.success('All meal notifications marked as read.');
    } catch {
      toast.error('Failed to mark notifications.');
    } finally {
      setMarkingNotifications(false);
    }
  }

  async function handleMealNotificationClick(notification) {
    try {
      if (!notification.read) {
        await markNotificationRead(notification.id);
      }
    } catch {
      toast.error('Failed to open notification.');
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-gray-200 bg-white px-8 py-7 shadow-sm">
          <Loader2 className="h-8 w-8 animate-spin text-orange-600" />
          <p className="text-sm font-bold text-gray-500">Loading meals...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto w-full max-w-7xl px-2 py-2 sm:px-5 sm:py-6 lg:px-8">
        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm sm:rounded-[30px]">
          <div className="bg-gradient-to-br from-orange-500 via-amber-500 to-yellow-400 p-2.5 sm:p-6">
            <div className="flex flex-col gap-2.5 sm:gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-2.5 sm:gap-4">
                <div className="relative shrink-0">
                  {viewingUserPhoto ? (
                    <img
                      src={viewingUserPhoto}
                      alt={viewingUserName}
                      className="h-10 w-10 rounded-xl object-cover ring-2 ring-white/30 sm:h-16 sm:w-16 sm:rounded-2xl sm:ring-4"
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 text-sm font-black text-white ring-2 ring-white/20 sm:h-16 sm:w-16 sm:rounded-2xl sm:text-xl sm:ring-4">
                      {getInitial(viewingUserName)}
                    </div>
                  )}
                </div>

                <div>
                  <p className="text-[8px] font-black uppercase tracking-wide text-white/80 sm:text-xs">
                    Meal Records
                  </p>

                  <h1 className="text-base font-black leading-tight text-white sm:mt-1 sm:text-3xl">
                    {viewingUserName}
                  </h1>

                  <p className="mt-1 hidden text-sm font-semibold text-white/80 sm:block">
                    {activeMember
                      ? `Viewing ${getUserName(activeMember)}'s meals`
                      : 'Your monthly meal summary with correct meal-rate calculation'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-[1fr_1.35fr_34px_34px] gap-1.5 sm:grid-cols-[110px_150px_auto_auto] sm:gap-2">
                <select
                  value={selectedYear}
                  onChange={(event) => setSelectedYear(Number(event.target.value))}
                  className="h-8 rounded-lg border border-white/30 bg-white/90 px-2 text-[10px] font-black text-gray-800 outline-none focus:ring-2 focus:ring-white/30 sm:h-auto sm:rounded-2xl sm:px-4 sm:py-3 sm:text-sm sm:focus:ring-4"
                >
                  {YEARS.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>

                <select
                  value={selectedMonth}
                  onChange={(event) => setSelectedMonth(Number(event.target.value))}
                  className="h-8 min-w-0 rounded-lg border border-white/30 bg-white/90 px-2 text-[10px] font-black text-gray-800 outline-none focus:ring-2 focus:ring-white/30 sm:h-auto sm:rounded-2xl sm:px-4 sm:py-3 sm:text-sm sm:focus:ring-4"
                >
                  {MONTHS.map((month, index) => (
                    <option key={month} value={index}>
                      {month}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={goToPrevMonth}
                  className="flex h-8 items-center justify-center rounded-lg border border-white/30 bg-white/20 p-0 text-sm font-black text-white transition hover:bg-white/30 sm:h-auto sm:rounded-2xl sm:px-4 sm:py-3"
                >
                  <span className="flex items-center justify-center gap-1">
                    <ChevronLeft className="h-4 w-4" />
                    <span className="hidden sm:inline">Prev</span>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={goToNextMonth}
                  className="flex h-8 items-center justify-center rounded-lg border border-white/30 bg-white/20 p-0 text-sm font-black text-white transition hover:bg-white/30 sm:h-auto sm:rounded-2xl sm:px-4 sm:py-3"
                >
                  <span className="flex items-center justify-center gap-1">
                    <span className="hidden sm:inline">Next</span>
                    <ChevronRight className="h-4 w-4" />
                  </span>
                </button>
              </div>
            </div>
          </div>

          <div className="p-2 sm:p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="hidden sm:block">
                <p className="text-xs font-black uppercase text-orange-600">
                  Selected Month
                </p>

                <h2 className="text-xl font-black text-gray-950">
                  {monthName}
                </h2>
              </div>

              <div className="relative w-full lg:max-w-sm">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />

                <input
                  type="text"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search date, lunch, dinner, reason..."
                  className="h-9 w-full rounded-xl border border-gray-200 bg-gray-50 py-2 pl-10 pr-9 text-xs font-bold outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-100 sm:h-auto sm:rounded-2xl sm:py-3 sm:pl-11 sm:pr-10 sm:text-sm sm:focus:ring-4"
                />

                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-gray-400 hover:bg-gray-100"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            <div className="mt-5 hidden grid-cols-2 gap-3 md:grid lg:grid-cols-8">
              <div className="rounded-2xl border border-orange-100 bg-orange-50 p-4">
                <div className="flex items-center gap-2 text-[11px] font-black uppercase text-orange-600">
                  <Soup className="h-4 w-4" />
                  Lunch
                </div>
                <p className="mt-2 text-2xl font-black text-orange-700">
                  {formatMeal(fullMonthViewingStats.totalLunch)}
                </p>
              </div>

              <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                <div className="flex items-center gap-2 text-[11px] font-black uppercase text-blue-600">
                  <Utensils className="h-4 w-4" />
                  Dinner
                </div>
                <p className="mt-2 text-2xl font-black text-blue-700">
                  {formatMeal(fullMonthViewingStats.totalDinner)}
                </p>
              </div>

              <div className="rounded-2xl border border-purple-100 bg-purple-50 p-4">
                <div className="flex items-center gap-2 text-[11px] font-black uppercase text-purple-600">
                  <Users className="h-4 w-4" />
                  Guest
                </div>
                <p className="mt-2 text-2xl font-black text-purple-700">
                  {formatMeal(fullMonthViewingStats.totalGuest)}
                </p>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <div className="flex items-center gap-2 text-[11px] font-black uppercase text-gray-500">
                  <TrendingUp className="h-4 w-4" />
                  My Meals
                </div>
                <p className="mt-2 text-2xl font-black text-gray-950">
                  {formatMeal(accounting.userMeal)}
                </p>
              </div>

              <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4">
                <div className="flex items-center gap-2 text-[11px] font-black uppercase text-violet-600">
                  <Clock className="h-4 w-4" />
                  Meal Rate
                </div>
                <p className="mt-2 text-2xl font-black text-violet-700">
                  {moneyRate(accounting.mealRate)}
                </p>
              </div>

              <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
                <div className="flex items-center gap-2 text-[11px] font-black uppercase text-amber-600">
                  <WalletCards className="h-4 w-4" />
                  Meal Cost
                </div>
                <p className="mt-2 text-2xl font-black text-amber-700">
                  {money(accounting.payable)}
                </p>
              </div>

              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                <div className="flex items-center gap-2 text-[11px] font-black uppercase text-emerald-600">
                  <UserCheck className="h-4 w-4" />
                  Bazar Paid
                </div>
                <p className="mt-2 text-2xl font-black text-emerald-700">
                  {money(accounting.paid)}
                </p>
              </div>

              <div className={`rounded-2xl border p-4 ${statusCardClass}`}>
                <div className="flex items-center gap-2 text-[11px] font-black uppercase">
                  <Bell className="h-4 w-4" />
                  Status
                </div>
                <p className="mt-2 text-xl font-black">
                  {accounting.statusLabel}
                </p>
                <p className="mt-1 text-[10px] font-bold">
                  {accounting.balanceText}
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-3xl border border-gray-200 bg-gray-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-black uppercase tracking-wide text-gray-700">Transparent meal-rate calculation</p>
                <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-gray-500 ring-1 ring-gray-200">Published revision {monthlyAccounting.revision || '—'}</span>
              </div>
              <div className="mt-3 grid gap-1.5 text-xs font-bold text-gray-600 sm:grid-cols-2 lg:grid-cols-5">
                <div className="rounded-xl bg-white px-3 py-2"><span className="block text-[9px] uppercase text-gray-400">Total Bazar</span><span className="font-black text-gray-950">{money(monthlyAccounting.totalBazar)}</span></div>
                <div className="rounded-xl bg-white px-3 py-2"><span className="block text-[9px] uppercase text-gray-400">− Previous balance</span><span className="font-black text-gray-950">{money(monthlyAccounting.previousBalance)}</span></div>
                <div className="rounded-xl bg-white px-3 py-2"><span className="block text-[9px] uppercase text-gray-400">+ Other expenses</span><span className="font-black text-gray-950">{money(monthlyAccounting.otherExpenses)}</span></div>
                <div className="rounded-xl bg-white px-3 py-2"><span className="block text-[9px] uppercase text-gray-400">+ Adjustments</span><span className="font-black text-gray-950">{money(monthlyAccounting.adjustments)}</span></div>
                <div className="rounded-xl bg-gray-950 px-3 py-2 text-white"><span className="block text-[9px] uppercase text-gray-400">= Total cost</span><span className="font-black">{money(monthlyAccounting.totalCost)}</span></div>
              </div>
              <p className="mt-3 rounded-xl border border-violet-100 bg-violet-50 px-3 py-2 text-xs font-bold leading-6 text-violet-700">
                {money(monthlyAccounting.totalCost)} ÷ {formatMeal(accounting.overallMeals)} meals = <span className="font-black">{moneyRate(accounting.mealRate)} per meal</span>
              </p>

              <p className="mt-1 text-xs font-bold leading-6 text-gray-600">
                Individual payable:{' '}
                <span className="font-black text-gray-950">
                  My Meals {formatMeal(accounting.userMeal)} × Meal Rate{' '}
                  {moneyRate(accounting.mealRate)} = {money(accounting.payable)}
                </span>
              </p>
            </div>

            <div className="mt-2 grid grid-cols-4 gap-1 md:hidden">
              {[
                {
                  label: 'Rate',
                  value: moneyRate(monthlyAccounting.mealRate),
                  className: 'bg-violet-50 text-violet-700',
                },
                {
                  label: 'Meals',
                  value: formatMeal(monthlyAccounting.overallMeals),
                  className: 'bg-orange-50 text-orange-700',
                },
                {
                  label: 'Bazar',
                  value: money(monthlyAccounting.totalBazar),
                  className: 'bg-emerald-50 text-emerald-700',
                },
                {
                  label: 'Members',
                  value: memberMonthlyLedger.length,
                  className: 'bg-blue-50 text-blue-700',
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className={`min-w-0 rounded-lg px-1.5 py-1.5 text-center ${item.className}`}
                >
                  <p className="truncate text-[10px] font-black tabular-nums">
                    {item.value}
                  </p>
                  <p className="mt-0.5 text-[7px] font-black uppercase opacity-65">
                    {item.label}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-2 overflow-hidden rounded-xl border border-slate-300 md:hidden">
              <div className="flex items-center justify-between border-b border-slate-300 bg-slate-800 px-2 py-1.5 text-white">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-wide">
                    Monthly member ledger
                  </p>
                  <p className="text-[7px] font-semibold text-slate-300">
                    Tap a row to view daily meals
                  </p>
                </div>
                {activeMemberId && (
                  <button
                    type="button"
                    onClick={showMyDetails}
                    className="rounded-md bg-white/10 px-2 py-1 text-[8px] font-black"
                  >
                    My details
                  </button>
                )}
              </div>

              <table className="w-full table-fixed border-collapse text-[8px]">
                <colgroup>
                  <col className="w-[30%]" />
                  <col className="w-[12%]" />
                  <col className="w-[18%]" />
                  <col className="w-[18%]" />
                  <col className="w-[22%]" />
                </colgroup>
                <thead>
                  <tr className="bg-slate-100 text-[7px] font-black uppercase text-slate-500">
                    <th className="border-r border-slate-300 px-1.5 py-1.5 text-left">Member</th>
                    <th className="border-r border-slate-300 px-1 py-1.5 text-center">Meals</th>
                    <th className="border-r border-slate-300 px-1 py-1.5 text-right">Given</th>
                    <th className="border-r border-slate-300 px-1 py-1.5 text-right">Cost</th>
                    <th className="px-1 py-1.5 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {memberMonthlyLedger.map((member, index) => {
                    const selected = member.isCurrentUser
                      ? !activeMemberId
                      : activeMemberId === member.id;
                    const balanceAmount =
                      member.status === 'advance' ? member.advance : member.due;

                    return (
                      <tr
                        key={member.id}
                        onClick={() =>
                          member.isCurrentUser
                            ? showMyDetails()
                            : handleMemberClick(member.id)
                        }
                        className={`cursor-pointer border-t border-slate-200 ${
                          selected
                            ? 'bg-orange-50'
                            : index % 2 === 0
                              ? 'bg-white'
                              : 'bg-slate-50/70'
                        }`}
                      >
                        <td className="border-r border-slate-200 px-1.5 py-1.5">
                          <div className="flex min-w-0 items-center gap-1">
                            <MemberAvatar member={member} size="xs" active={selected} />
                            <span className="min-w-0">
                              <span className="block truncate text-[8px] font-black text-slate-900">
                                {member.isCurrentUser ? 'Me' : getUserName(member)}
                              </span>
                              <span className="block truncate text-[6px] font-bold text-slate-400">
                                {member.room || 'No room'}
                              </span>
                            </span>
                          </div>
                        </td>
                        <td className="border-r border-slate-200 px-1 py-1.5 text-center text-[9px] font-black text-blue-700">
                          {formatMeal(member.totalMeals)}
                        </td>
                        <td className="border-r border-slate-200 px-1 py-1.5 text-right font-black tabular-nums text-emerald-700">
                          {money(member.given)}
                        </td>
                        <td className="border-r border-slate-200 px-1 py-1.5 text-right font-black tabular-nums text-amber-700">
                          {money(member.cost)}
                        </td>
                        <td
                          className={`px-1 py-1.5 text-right font-black tabular-nums ${
                            member.status === 'advance'
                              ? 'text-emerald-700'
                              : member.status === 'due'
                                ? 'text-rose-700'
                                : 'text-slate-500'
                          }`}
                        >
                          <span className="block text-[6px] uppercase">
                            {member.statusLabel}
                          </span>
                          <span className="text-[8px]">
                            {member.status === 'paid' || member.status === 'none'
                              ? '৳0'
                              : money(balanceAmount)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-400 bg-slate-900 font-black text-white">
                    <td className="border-r border-slate-700 px-1.5 py-1.5 text-[7px] uppercase">Total</td>
                    <td className="border-r border-slate-700 px-1 py-1.5 text-center text-[8px]">
                      {formatMeal(memberLedgerTotals.meals)}
                    </td>
                    <td className="border-r border-slate-700 px-1 py-1.5 text-right text-[8px] text-emerald-300">
                      {money(memberLedgerTotals.given)}
                    </td>
                    <td className="border-r border-slate-700 px-1 py-1.5 text-right text-[8px] text-amber-300">
                      {money(memberLedgerTotals.cost)}
                    </td>
                    <td className="px-1 py-1.5 text-right text-[7px]">
                      <span className="block text-rose-300">D {money(memberLedgerTotals.due)}</span>
                      <span className="block text-emerald-300">A {money(memberLedgerTotals.advance)}</span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </section>

        {!notificationEnabled && (
          <section className="mt-4 rounded-3xl border border-orange-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-100 text-orange-700">
                  <BellRing className="h-5 w-5" />
                </div>

                <div>
                  <h2 className="text-sm font-black text-gray-950">
                    Enable meal notifications
                  </h2>

                  <p className="mt-1 text-xs leading-5 text-gray-500 sm:text-sm">
                    Get meal alerts with meal rate, payable amount, bazar paid, due, paid, or advance status.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleEnableNotifications}
                disabled={enablingNotification}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-orange-600 px-5 py-3 text-sm font-black text-white transition hover:bg-orange-700 disabled:opacity-60 sm:w-auto"
              >
                {enablingNotification ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Bell className="h-4 w-4" />
                )}

                {enablingNotification ? 'Enabling...' : 'Allow Notifications'}
              </button>
            </div>

            {deviceInfo.isIOS && !deviceInfo.isStandalone && (
              <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-4">
                <div className="flex gap-3">
                  <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" />

                  <p className="text-xs leading-5 text-blue-700">
                    On iPhone, open in Safari, tap Share, add to Home Screen, then open from Home Screen and enable notifications.
                  </p>
                </div>
              </div>
            )}
          </section>
        )}

        {members.length > 0 && (
          <section className="mt-4 hidden rounded-3xl border border-gray-200 bg-white p-4 shadow-sm md:block">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-gray-500" />

                <p className="text-xs font-black uppercase text-gray-500">
                  View member meals
                </p>
              </div>

              {activeMemberId && (
                <button
                  type="button"
                  onClick={showMyDetails}
                  className="text-xs font-black text-orange-600 hover:underline"
                >
                  Show Mine
                </button>
              )}
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1">
              {members.map((member) => {
                const selected = activeMemberId === member.id;

                return (
                  <button
                    key={member.id}
                    type="button"
                    onClick={() => handleMemberClick(member.id)}
                    className={`flex shrink-0 items-center gap-2 rounded-2xl border px-3 py-2 transition ${
                      selected
                        ? 'border-orange-300 bg-orange-50 text-orange-700'
                        : 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-white'
                    }`}
                  >
                    <div className="relative shrink-0">
                      <MemberAvatar member={member} size="sm" active={selected} />

                      <span
                        className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white ${
                          isLive(member) ? 'bg-emerald-500' : 'bg-gray-400'
                        }`}
                      />
                    </div>

                    <div className="min-w-0 text-left">
                      <p className="max-w-[130px] truncate text-xs font-black">
                        {getUserName(member)}
                      </p>

                      <p className="text-[10px] font-bold text-gray-400">
                        Room {member.room}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_390px]">
          <section className="min-w-0 rounded-3xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 p-4 sm:p-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-base font-black text-gray-950">
                    Daily Meal Breakdown
                  </h2>

                  <p className="mt-1 text-xs text-gray-500">
                    {monthName} • {sortedMeals.length} record{sortedMeals.length !== 1 ? 's' : ''}
                  </p>
                </div>

                {activeMember && (
                  <button
                    type="button"
                    onClick={showMyDetails}
                    className="rounded-2xl bg-orange-50 px-4 py-2 text-xs font-black text-orange-700"
                  >
                    Back to My Meals
                  </button>
                )}
              </div>

              {loadingMemberMeals && (
                <div className="mt-3 flex items-center gap-2 rounded-2xl bg-orange-50 px-3 py-2 text-xs font-bold text-orange-700">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading member meals...
                </div>
              )}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[760px] border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    {[
                      { key: 'date', label: 'Date' },
                      { key: 'lunch', label: 'Lunch' },
                      { key: 'dinner', label: 'Dinner' },
                      { key: 'guestMeal', label: 'Guest' },
                      { key: 'totalMeal', label: 'Total' },
                    ].map((column) => (
                      <th
                        key={column.key}
                        className="border-b border-gray-200 px-4 py-3 text-left text-[11px] font-black uppercase text-gray-500"
                      >
                        <button
                          type="button"
                          onClick={() => handleSort(column.key)}
                          className="inline-flex items-center gap-1"
                        >
                          {column.label}
                          <SortIcon column={column.key} />
                        </button>
                      </th>
                    ))}

                    <th className="border-b border-gray-200 px-4 py-3 text-left text-[11px] font-black uppercase text-gray-500">
                      Notes
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-100">
                  {sortedMeals.length > 0 ? (
                    sortedMeals.map((meal, index) => (
                      <tr
                        key={meal.id}
                        className={`hover:bg-orange-50/40 ${
                          index % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'
                        }`}
                      >
                        <td className="px-4 py-3">
                          <p className="text-sm font-black text-gray-900">
                            {formatMealDate(meal.date)}
                          </p>

                          <p className="mt-0.5 text-[11px] font-bold text-gray-400">
                            {formatMealDay(meal.date)}
                          </p>
                        </td>

                        <td className="px-4 py-3 text-sm font-black text-orange-700">
                          {formatMeal(meal.lunch)}
                        </td>

                        <td className="px-4 py-3 text-sm font-black text-blue-700">
                          {formatMeal(meal.dinner)}
                        </td>

                        <td className="px-4 py-3 text-sm font-black text-purple-700">
                          {formatMeal(meal.guestMeal)}
                        </td>

                        <td className="px-4 py-3 text-sm font-black text-gray-950">
                          {formatMeal(getMealTotal(meal))}
                        </td>

                        <td className="px-4 py-3 text-xs font-bold text-gray-500">
                          {meal.notes || meal.reason || '—'}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="px-4 py-16 text-center">
                        <Utensils className="mx-auto h-8 w-8 text-gray-300" />

                        <p className="mt-3 text-sm font-bold text-gray-400">
                          {searchTerm
                            ? 'No matching meal record found'
                            : 'No meals found for this month'}
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>

                {sortedMeals.length > 0 && (
                  <tfoot>
                    <tr className="bg-gray-950 text-white">
                      <td className="px-4 py-4 text-sm font-black">Total</td>

                      <td className="px-4 py-4 text-sm font-black text-orange-300">
                        {formatMeal(tableStats.totalLunch)}
                      </td>

                      <td className="px-4 py-4 text-sm font-black text-blue-300">
                        {formatMeal(tableStats.totalDinner)}
                      </td>

                      <td className="px-4 py-4 text-sm font-black text-purple-300">
                        {formatMeal(tableStats.totalGuest)}
                      </td>

                      <td className="px-4 py-4 text-sm font-black">
                        {formatMeal(tableStats.totalMeals)}
                      </td>

                      <td className="px-4 py-4 text-xs font-bold text-gray-300">
                        Month Cost: {money(accounting.payable)} •{' '}
                        {accounting.balanceText}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            <div className="space-y-3 p-4 md:hidden">
              {sortedMeals.length > 0 ? (
                sortedMeals.map((meal, index) => (
                  <article
                    key={meal.id}
                    className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-black uppercase text-gray-400">
                          #{index + 1}
                        </p>

                        <h3 className="mt-1 text-sm font-black text-gray-950">
                          {formatMealDate(meal.date)}
                        </h3>

                        <p className="mt-1 text-xs font-bold text-gray-400">
                          {formatMealDay(meal.date)}
                        </p>
                      </div>

                      <span className="rounded-full bg-gray-950 px-3 py-1 text-xs font-black text-white">
                        {formatMeal(getMealTotal(meal))}
                      </span>
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-2">
                      <div className="rounded-2xl bg-orange-50 px-3 py-2">
                        <p className="text-[9px] font-black uppercase text-orange-500">
                          Lunch
                        </p>
                        <p className="mt-1 text-sm font-black text-orange-800">
                          {formatMeal(meal.lunch)}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-blue-50 px-3 py-2">
                        <p className="text-[9px] font-black uppercase text-blue-500">
                          Dinner
                        </p>
                        <p className="mt-1 text-sm font-black text-blue-800">
                          {formatMeal(meal.dinner)}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-purple-50 px-3 py-2">
                        <p className="text-[9px] font-black uppercase text-purple-500">
                          Guest
                        </p>
                        <p className="mt-1 text-sm font-black text-purple-800">
                          {formatMeal(meal.guestMeal)}
                        </p>
                      </div>
                    </div>

                    {(meal.notes || meal.reason) && (
                      <div className="mt-3 rounded-2xl bg-gray-50 px-3 py-2">
                        <p className="text-[9px] font-black uppercase text-gray-400">
                          Reason / Notes
                        </p>

                        <p className="mt-1 text-xs font-bold text-gray-600">
                          {meal.notes || meal.reason}
                        </p>
                      </div>
                    )}
                  </article>
                ))
              ) : (
                <div className="rounded-3xl border border-dashed border-gray-200 p-8 text-center">
                  <Utensils className="mx-auto h-8 w-8 text-gray-300" />

                  <p className="mt-3 text-sm font-black text-gray-400">
                    {searchTerm
                      ? 'No matching meal record found'
                      : 'No meals found'}
                  </p>
                </div>
              )}

              {sortedMeals.length > 0 && (
                <div className="rounded-3xl bg-gray-950 p-4 text-white">
                  <div className="flex items-center justify-between text-sm font-black">
                    <span>Total Meals</span>
                    <span>{formatMeal(tableStats.totalMeals)}</span>
                  </div>

                  <div className="mt-2 flex items-center justify-between text-sm font-black text-violet-300">
                    <span>Meal Rate</span>
                    <span>{moneyRate(accounting.mealRate)}</span>
                  </div>

                  <div className="mt-2 flex items-center justify-between text-sm font-black text-amber-300">
                    <span>Month Meal Cost</span>
                    <span>{money(accounting.payable)}</span>
                  </div>

                  <div className="mt-2 flex items-center justify-between text-sm font-black text-emerald-300">
                    <span>Bazar Paid</span>
                    <span>{money(accounting.paid)}</span>
                  </div>

                  <div className="mt-2 flex items-center justify-between text-sm font-black text-red-300">
                    <span>Balance</span>
                    <span>{accounting.balanceText}</span>
                  </div>
                </div>
              )}
            </div>
          </section>

          <aside className="min-w-0 rounded-3xl border border-gray-200 bg-white shadow-sm lg:sticky lg:top-4 lg:self-start">
            <div className="border-b border-gray-100 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full bg-orange-50 px-3 py-1 text-[10px] font-black uppercase text-orange-700">
                    <Bell className="h-3.5 w-3.5" />
                    Meal Alerts
                  </div>

                  <h2 className="mt-2 text-base font-black text-gray-950">
                    Latest Notifications
                  </h2>

                  <p className="mt-1 text-xs text-gray-500">
                    {unreadMealNotificationCount > 0
                      ? `${unreadMealNotificationCount} unread for ${monthName}`
                      : `No unread alert for ${monthName}`}
                  </p>
                </div>

                {unreadMealNotificationCount > 0 && (
                  <button
                    type="button"
                    onClick={markAllMealNotificationsRead}
                    disabled={markingNotifications}
                    className="rounded-2xl bg-gray-900 px-3 py-2 text-[10px] font-black text-white disabled:opacity-60"
                  >
                    {markingNotifications ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCheck className="h-4 w-4" />
                    )}
                  </button>
                )}
              </div>
            </div>

            <div className="border-b border-gray-100 p-4">
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />

                <input
                  type="text"
                  value={notificationSearchTerm}
                  onChange={(event) => setNotificationSearchTerm(event.target.value)}
                  placeholder="Search name, date, reason, due, paid..."
                  className="w-full rounded-2xl border border-gray-200 bg-gray-50 py-3 pl-11 pr-10 text-sm font-bold outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
                />

                {notificationSearchTerm && (
                  <button
                    type="button"
                    onClick={() => setNotificationSearchTerm('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-gray-400 hover:bg-gray-100"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            <div className="max-h-[680px] space-y-3 overflow-y-auto p-4">
              {filteredMealNotifications.length > 0 ? (
                filteredMealNotifications.map((notification) => (
                <MealNotificationCard
                  key={notification.id}
                  notification={notification}
                  onOpen={() => handleMealNotificationClick(notification)}
                  onMarkRead={() => markNotificationRead(notification.id)}
                  />
                ))
              ) : (
                <div className="rounded-3xl border border-dashed border-gray-200 p-8 text-center">
                  <Bell className="mx-auto h-8 w-8 text-gray-300" />

                  <p className="mt-3 text-sm font-black text-gray-400">
                    {notificationSearchTerm
                      ? 'No matching meal notification found'
                      : `No meal notifications for ${monthName}`}
                  </p>

                  <p className="mt-1 text-xs text-gray-400">
                    Payment alerts and meal added/edited messages will appear here.
                  </p>
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
