'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { db, setupPushNotifications, getFCMToken } from '@/lib/firebase';
import {
  collection,
  doc,
  getDocs,
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
  MapPin,
  Search,
  ShoppingCart,
  Smartphone,
  TrendingUp,
  UserCheck,
  Users,
  WalletCards,
  X,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import BazarNotificationCard from './BazarNotificationCard';
import { isMemberOnline } from '@/lib/presence';
import { calculateMemberMonthlyBazarTotal } from '@/lib/bazarCalculations';
import { isMemberAccountActive } from '@/lib/memberPolicy';

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

  if (Number.isNaN(date.getTime())) return null;

  return date;
}

function getMonthId(year, monthIndex) {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
}

function getMonthName(year, monthIndex) {
  return `${MONTHS[monthIndex]} ${year}`;
}

function money(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) return '৳0';

  return `৳${Math.round(number).toLocaleString()}`;
}

function getAmount(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
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

function isLive(member) {
  return isMemberOnline(member);
}

function formatDate(dateValue) {
  const date = safeDate(dateValue);

  if (!date) return dateValue || '—';

  return date.toLocaleDateString('en-US', {
    timeZone: 'Asia/Dhaka',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatDay(dateValue) {
  const date = safeDate(dateValue);

  if (!date) return '';

  return date.toLocaleDateString('en-US', {
    timeZone: 'Asia/Dhaka',
    weekday: 'long',
  });
}

function getItemsText(items) {
  if (Array.isArray(items)) return items.join(' ');

  if (typeof items === 'string') return items;

  return '';
}

function getBazarSearchText(row) {
  return [
    row?.date,
    formatDate(row?.date),
    formatDay(row?.date),
    row?.place,
    row?.market,
    row?.location,
    row?.notes,
    row?.reason,
    row?.amount,
    getItemsText(row?.items),
  ]
    .join(' ')
    .toLowerCase();
}

function isBazarNotification(notification) {
  const data = notification?.data || {};

  const rawType = String(
    data.type ||
      data.action ||
      notification?.type ||
      notification?.category ||
      ''
  ).toLowerCase();

  const title = String(notification?.title || '').toLowerCase();

  if (rawType.includes('meal')) return false;
  if (title.includes('meal')) return false;

  return (
    rawType === 'bazar' ||
    rawType === 'bazar_added' ||
    rawType === 'bazar_update' ||
    rawType === 'balance_adjustment' ||
    rawType === 'balance' ||
    rawType.includes('bazar') ||
    rawType.includes('balance') ||
    title.includes('bazar') ||
    title.includes('balance')
  );
}

function getNotificationMonth(notification) {
  const data = notification?.data || {};

  const directMonth =
    data.month ||
    data.monthId ||
    notification?.month ||
    notification?.monthId ||
    '';

  if (/^\d{4}-\d{2}$/.test(String(directMonth))) {
    return String(directMonth);
  }

  const bazarDate =
    data.date ||
    data.bazarDate ||
    notification?.date ||
    notification?.bazarDate ||
    '';

  if (/^\d{4}-\d{2}/.test(String(bazarDate))) {
    return String(bazarDate).slice(0, 7);
  }

  const createdDate = safeDate(notification?.createdAt);

  if (createdDate) {
    return `${createdDate.getFullYear()}-${String(createdDate.getMonth() + 1).padStart(2, '0')}`;
  }

  return '';
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
    data.status,
    data.reason,
    data.notes,
    data.date,
    data.bazarDate,
    data.month,
    data.monthId,
    data.place,
    data.market,
    data.location,
    data.room,
    data.amount,
    data.totalAmount,
    data.totalPayable,
    data.paidAmount,
    data.balance,
    data.due,
    data.advance,
    getItemsText(data.items),
  ]
    .join(' ')
    .toLowerCase();
}

function MemberAvatar({ member, selected = false }) {
  const name = getUserName(member);
  const photo = getUserPhoto(member);

  if (photo) {
    return (
      <img
        src={photo}
        alt={name}
        className={`h-10 w-10 rounded-2xl object-cover ring-2 ${
          selected ? 'ring-emerald-300' : 'ring-white'
        }`}
      />
    );
  }

  return (
    <div
      className={`flex h-10 w-10 items-center justify-center rounded-2xl text-sm font-black ring-2 ${
        selected
          ? 'bg-emerald-600 text-white ring-emerald-300'
          : 'bg-emerald-100 text-emerald-700 ring-white'
      }`}
    >
      {getInitial(name)}
    </div>
  );
}

export default function BazarPage() {
  const { user } = useAuth();

  const now = new Date();

  const [bazars, setBazars] = useState([]);
  const [memberBazars, setMemberBazars] = useState([]);
  const [members, setMembers] = useState([]);

  const [loading, setLoading] = useState(true);
  const [loadingMemberBazars, setLoadingMemberBazars] = useState(false);

  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());

  const [searchTerm, setSearchTerm] = useState('');
  const [notificationSearchTerm, setNotificationSearchTerm] = useState('');

  const [sortConfig, setSortConfig] = useState({
    key: 'date',
    direction: 'desc',
  });

  const [activeMemberId, setActiveMemberId] = useState(null);

  const [bazarNotifications, setBazarNotifications] = useState([]);
  const [notificationSettings, setNotificationSettings] = useState(null);
  const [deviceInfo, setDeviceInfo] = useState(getDeviceInfo());
  const [enablingNotification, setEnablingNotification] = useState(false);
  const [markingNotifications, setMarkingNotifications] = useState(false);

  const monthStr = getMonthId(selectedYear, selectedMonth);
  const monthName = getMonthName(selectedYear, selectedMonth);

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

    setLoading(true);

    const bazarQuery = query(
      collection(db, 'bazar'),
      where('userId', '==', user.uid),
      where('month', '==', monthStr),
      orderBy('date', 'desc')
    );

    const unsubscribe = onSnapshot(
      bazarQuery,
      (snapshot) => {
        setBazars(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
        setLoading(false);
      },
      (error) => {
        console.error('Bazar listener error:', error);
        toast.error('Failed to load bazar records.');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user?.uid, monthStr]);

  useEffect(() => {
    if (!user?.uid || !db) return;

    async function fetchMembers() {
      try {
        const membersQuery = query(collection(db, 'users'));

        const snapshot = await getDocs(membersQuery);

        const rows = snapshot.docs
          .map((item) => ({
            id: item.id,
            ...item.data(),
          }))
          .filter((member) => {
            return (
              isMemberAccountActive(member) &&
              String(member?.room || '').trim() &&
              member.id !== user.uid
            );
          });

        setMembers(rows);
      } catch (error) {
        console.error('Members load error:', error);
      }
    }

    fetchMembers();
  }, [user?.uid]);

  useEffect(() => {
    if (!activeMemberId || !monthStr || !db) {
      setMemberBazars([]);
      setLoadingMemberBazars(false);
      return;
    }

    setLoadingMemberBazars(true);

    const memberBazarQuery = query(
      collection(db, 'bazar'),
      where('userId', '==', activeMemberId),
      where('month', '==', monthStr),
      orderBy('date', 'desc')
    );

    const unsubscribe = onSnapshot(
      memberBazarQuery,
      (snapshot) => {
        setMemberBazars(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
        setLoadingMemberBazars(false);
      },
      (error) => {
        console.error('Member bazar listener error:', error);
        setMemberBazars([]);
        setLoadingMemberBazars(false);
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

    const notificationsUnsubscribe = onSnapshot(
      notificationsQuery,
      (snapshot) => {
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

        setBazarNotifications(rows.filter(isBazarNotification));
      },
      (error) => {
        console.error('Bazar notification listener error:', error);
      }
    );

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

  const displayedBazars = activeMemberId ? memberBazars : bazars;

  const filteredBazars = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    if (!term) return [...displayedBazars];

    return displayedBazars.filter((row) => {
      return getBazarSearchText(row).includes(term);
    });
  }, [displayedBazars, searchTerm]);

  const sortedBazars = useMemo(() => {
    const rows = [...filteredBazars];

    rows.sort((a, b) => {
      if (sortConfig.key === 'date') {
        const result = String(a.date || '').localeCompare(String(b.date || ''));
        return sortConfig.direction === 'asc' ? result : -result;
      }

      if (sortConfig.key === 'amount') {
        const result = getAmount(a.amount) - getAmount(b.amount);
        return sortConfig.direction === 'asc' ? result : -result;
      }

      const result = String(a[sortConfig.key] || '').localeCompare(
        String(b[sortConfig.key] || '')
      );

      return sortConfig.direction === 'asc' ? result : -result;
    });

    return rows;
  }, [filteredBazars, sortConfig]);

  const stats = useMemo(() => {
    const currentRows = displayedBazars.filter((row) => !row.isDeleted);
    const totalAmount = activeMemberId
      ? calculateMemberMonthlyBazarTotal(currentRows, activeMemberId, monthStr)
      : calculateMemberMonthlyBazarTotal(currentRows, user?.uid, monthStr);

    const totalCount = currentRows.length;
    const avgAmount = totalCount > 0 ? Math.round(totalAmount / totalCount) : 0;

    const highest = currentRows.reduce((max, row) => {
      return Math.max(max, getAmount(row.amount));
    }, 0);

    return {
      totalAmount,
      totalCount,
      avgAmount,
      highest,
    };
  }, [activeMemberId, displayedBazars, monthStr, user?.uid]);

  const monthBazarNotifications = useMemo(() => {
    return bazarNotifications.filter((notification) => {
      const notificationMonth = getNotificationMonth(notification);

      if (!notificationMonth) return true;

      return notificationMonth === monthStr;
    });
  }, [bazarNotifications, monthStr]);

  const filteredBazarNotifications = useMemo(() => {
    const term = notificationSearchTerm.trim().toLowerCase();

    if (!term) return monthBazarNotifications;

    return monthBazarNotifications.filter((notification) => {
      return getNotificationSearchText(notification).includes(term);
    });
  }, [monthBazarNotifications, notificationSearchTerm]);

  const unreadBazarNotificationCount = monthBazarNotifications.filter(
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
      <ChevronUp className="h-3 w-3 text-emerald-500" />
    ) : (
      <ChevronDown className="h-3 w-3 text-emerald-500" />
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
      setActiveMemberId(null);
      return;
    }

    setActiveMemberId(memberId);
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

      toast.success('Bazar notifications enabled.');
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

  async function markAllBazarNotificationsRead() {
    const unread = monthBazarNotifications.filter((notification) => !notification.read);

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

      toast.success('All bazar notifications marked as read.');
    } catch {
      toast.error('Failed to mark notifications.');
    } finally {
      setMarkingNotifications(false);
    }
  }

  async function handleBazarNotificationClick(notification) {
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
          <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
          <p className="text-sm font-bold text-gray-500">Loading bazar records...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto w-full max-w-7xl px-3 py-4 sm:px-5 sm:py-6 lg:px-8">
        <section className="overflow-hidden rounded-[30px] border border-gray-200 bg-white shadow-sm">
          <div className="bg-gradient-to-br from-emerald-600 via-green-500 to-lime-400 p-4 sm:p-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-4">
                <div className="relative shrink-0">
                  {viewingUserPhoto ? (
                    <img
                      src={viewingUserPhoto}
                      alt={viewingUserName}
                      className="h-14 w-14 rounded-2xl object-cover ring-4 ring-white/30 sm:h-16 sm:w-16"
                    />
                  ) : (
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 text-xl font-black text-white ring-4 ring-white/20 sm:h-16 sm:w-16">
                      {getInitial(viewingUserName)}
                    </div>
                  )}
                </div>

                <div>
                  <p className="text-xs font-black uppercase tracking-wide text-white/80">
                    Bazar Records
                  </p>

                  <h1 className="mt-1 text-2xl font-black text-white sm:text-3xl">
                    {viewingUserName}
                  </h1>

                  <p className="mt-1 text-sm font-semibold text-white/80">
                    {activeMember
                      ? `Viewing ${getUserName(activeMember)}'s bazar records`
                      : 'Your monthly bazar summary'}
                  </p>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-[110px_150px_auto_auto]">
                <select
                  value={selectedYear}
                  onChange={(event) => setSelectedYear(Number(event.target.value))}
                  className="rounded-2xl border border-white/30 bg-white/90 px-4 py-3 text-sm font-black text-gray-800 outline-none focus:ring-4 focus:ring-white/30"
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
                  className="rounded-2xl border border-white/30 bg-white/90 px-4 py-3 text-sm font-black text-gray-800 outline-none focus:ring-4 focus:ring-white/30"
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
                  className="rounded-2xl border border-white/30 bg-white/20 px-4 py-3 text-sm font-black text-white transition hover:bg-white/30"
                >
                  <span className="flex items-center justify-center gap-1">
                    <ChevronLeft className="h-4 w-4" />
                    Prev
                  </span>
                </button>

                <button
                  type="button"
                  onClick={goToNextMonth}
                  className="rounded-2xl border border-white/30 bg-white/20 px-4 py-3 text-sm font-black text-white transition hover:bg-white/30"
                >
                  <span className="flex items-center justify-center gap-1">
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </span>
                </button>
              </div>
            </div>
          </div>

          <div className="p-4 sm:p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-black uppercase text-emerald-600">
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
                  placeholder="Search date, place, amount, items..."
                  className="w-full rounded-2xl border border-gray-200 bg-gray-50 py-3 pl-11 pr-10 text-sm font-bold outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
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

            <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                <div className="flex items-center gap-2 text-[11px] font-black uppercase text-emerald-600">
                  <WalletCards className="h-4 w-4" />
                  Total Bazar
                </div>

                <p className="mt-2 text-2xl font-black text-emerald-700">
                  {money(stats.totalAmount)}
                </p>
              </div>

              <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                <div className="flex items-center gap-2 text-[11px] font-black uppercase text-blue-600">
                  <ShoppingCart className="h-4 w-4" />
                  Entries
                </div>

                <p className="mt-2 text-2xl font-black text-blue-700">
                  {stats.totalCount}
                </p>
              </div>

              <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4">
                <div className="flex items-center gap-2 text-[11px] font-black uppercase text-violet-600">
                  <TrendingUp className="h-4 w-4" />
                  Average
                </div>

                <p className="mt-2 text-2xl font-black text-violet-700">
                  {money(stats.avgAmount)}
                </p>
              </div>

              <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
                <div className="flex items-center gap-2 text-[11px] font-black uppercase text-amber-600">
                  <UserCheck className="h-4 w-4" />
                  Highest
                </div>

                <p className="mt-2 text-2xl font-black text-amber-700">
                  {money(stats.highest)}
                </p>
              </div>
            </div>
          </div>
        </section>

        {!notificationEnabled && (
          <section className="mt-4 rounded-3xl border border-emerald-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                  <BellRing className="h-5 w-5" />
                </div>

                <div>
                  <h2 className="text-sm font-black text-gray-950">
                    Enable bazar notifications
                  </h2>

                  <p className="mt-1 text-xs leading-5 text-gray-500 sm:text-sm">
                    Get instant alerts when bazar records, balance updates, or payment changes are added.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleEnableNotifications}
                disabled={enablingNotification}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-black text-white transition hover:bg-emerald-700 disabled:opacity-60 sm:w-auto"
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
          <section className="mt-4 rounded-3xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-gray-500" />

                <p className="text-xs font-black uppercase text-gray-500">
                  View member bazar
                </p>
              </div>

              {activeMemberId && (
                <button
                  type="button"
                  onClick={() => setActiveMemberId(null)}
                  className="text-xs font-black text-emerald-600 hover:underline"
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
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                        : 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-white'
                    }`}
                  >
                    <div className="relative shrink-0">
                      <MemberAvatar member={member} selected={selected} />

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
                    Bazar Breakdown
                  </h2>

                  <p className="mt-1 text-xs text-gray-500">
                    {monthName} • {sortedBazars.length} record{sortedBazars.length !== 1 ? 's' : ''}
                  </p>
                </div>

                {activeMember && (
                  <button
                    type="button"
                    onClick={() => setActiveMemberId(null)}
                    className="rounded-2xl bg-emerald-50 px-4 py-2 text-xs font-black text-emerald-700"
                  >
                    Back to My Bazar
                  </button>
                )}
              </div>

              {loadingMemberBazars && (
                <div className="mt-3 flex items-center gap-2 rounded-2xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading member bazar records...
                </div>
              )}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[760px] border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    {[
                      { key: 'date', label: 'Date' },
                      { key: 'place', label: 'Place' },
                      { key: 'amount', label: 'Amount' },
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
                      Items / Notes
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-100">
                  {sortedBazars.length > 0 ? (
                    sortedBazars.map((row, index) => (
                      <tr
                        key={row.id}
                        className={`hover:bg-emerald-50/40 ${
                          index % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'
                        }`}
                      >
                        <td className="px-4 py-3">
                          <p className="text-sm font-black text-gray-900">
                            {formatDate(row.date)}
                          </p>

                          <p className="mt-0.5 text-[11px] font-bold text-gray-400">
                            {formatDay(row.date)}
                          </p>
                        </td>

                        <td className="px-4 py-3">
                          <p className="flex items-center gap-1 text-sm font-black text-gray-900">
                            <MapPin className="h-3.5 w-3.5 text-gray-400" />
                            {row.place || row.market || row.location || '—'}
                          </p>
                        </td>

                        <td className="px-4 py-3 text-sm font-black text-emerald-700">
                          {money(row.amount)}
                        </td>

                        <td className="px-4 py-3">
                          {Array.isArray(row.items) && row.items.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {row.items.map((item, itemIndex) => (
                                <span
                                  key={`${item}-${itemIndex}`}
                                  className="rounded-full bg-gray-100 px-2 py-1 text-[10px] font-bold text-gray-600"
                                >
                                  {item}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs font-bold text-gray-400">
                              {row.notes || row.reason || '—'}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-4 py-16 text-center">
                        <ShoppingCart className="mx-auto h-8 w-8 text-gray-300" />

                        <p className="mt-3 text-sm font-bold text-gray-400">
                          {searchTerm
                            ? 'No matching bazar record found'
                            : 'No bazar records found for this month'}
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>

                {sortedBazars.length > 0 && (
                  <tfoot>
                    <tr className="bg-gray-950 text-white">
                      <td className="px-4 py-4 text-sm font-black">
                        Total
                      </td>

                      <td className="px-4 py-4 text-sm font-black text-gray-300">
                        {stats.totalCount} entries
                      </td>

                      <td className="px-4 py-4 text-sm font-black text-emerald-300">
                        {money(stats.totalAmount)}
                      </td>

                      <td className="px-4 py-4 text-xs font-bold text-gray-300">
                        Average: {money(stats.avgAmount)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            <div className="space-y-3 p-4 md:hidden">
              {sortedBazars.length > 0 ? (
                sortedBazars.map((row, index) => (
                  <article
                    key={row.id}
                    className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-black uppercase text-gray-400">
                          #{index + 1}
                        </p>

                        <h3 className="mt-1 text-sm font-black text-gray-950">
                          {formatDate(row.date)}
                        </h3>

                        <p className="mt-1 text-xs font-bold text-gray-400">
                          {formatDay(row.date)}
                        </p>
                      </div>

                      <span className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-black text-white">
                        {money(row.amount)}
                      </span>
                    </div>

                    <div className="mt-4 rounded-2xl bg-gray-50 px-3 py-2">
                      <p className="text-[9px] font-black uppercase text-gray-400">
                        Place
                      </p>

                      <p className="mt-1 flex items-center gap-1 text-xs font-bold text-gray-700">
                        <MapPin className="h-3.5 w-3.5 text-gray-400" />
                        {row.place || row.market || row.location || '—'}
                      </p>
                    </div>

                    {Array.isArray(row.items) && row.items.length > 0 && (
                      <div className="mt-3 rounded-2xl bg-gray-50 px-3 py-2">
                        <p className="text-[9px] font-black uppercase text-gray-400">
                          Items
                        </p>

                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {row.items.map((item, itemIndex) => (
                            <span
                              key={`${item}-${itemIndex}`}
                              className="rounded-full bg-white px-2 py-1 text-[10px] font-bold text-gray-600"
                            >
                              {item}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {(row.notes || row.reason) && (
                      <div className="mt-3 rounded-2xl bg-gray-50 px-3 py-2">
                        <p className="text-[9px] font-black uppercase text-gray-400">
                          Notes
                        </p>

                        <p className="mt-1 text-xs font-bold text-gray-600">
                          {row.notes || row.reason}
                        </p>
                      </div>
                    )}
                  </article>
                ))
              ) : (
                <div className="rounded-3xl border border-dashed border-gray-200 p-8 text-center">
                  <ShoppingCart className="mx-auto h-8 w-8 text-gray-300" />

                  <p className="mt-3 text-sm font-black text-gray-400">
                    {searchTerm
                      ? 'No matching bazar record found'
                      : 'No bazar records found'}
                  </p>
                </div>
              )}

              {sortedBazars.length > 0 && (
                <div className="rounded-3xl bg-gray-950 p-4 text-white">
                  <div className="flex items-center justify-between text-sm font-black">
                    <span>Total Bazar</span>
                    <span>{money(stats.totalAmount)}</span>
                  </div>

                  <div className="mt-2 flex items-center justify-between text-sm font-black text-blue-300">
                    <span>Entries</span>
                    <span>{stats.totalCount}</span>
                  </div>

                  <div className="mt-2 flex items-center justify-between text-sm font-black text-violet-300">
                    <span>Average</span>
                    <span>{money(stats.avgAmount)}</span>
                  </div>

                  <div className="mt-2 flex items-center justify-between text-sm font-black text-amber-300">
                    <span>Highest</span>
                    <span>{money(stats.highest)}</span>
                  </div>
                </div>
              )}
            </div>
          </section>

          <aside className="min-w-0 rounded-3xl border border-gray-200 bg-white shadow-sm lg:sticky lg:top-4 lg:self-start">
            <div className="border-b border-gray-100 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase text-emerald-700">
                    <Bell className="h-3.5 w-3.5" />
                    Bazar Alerts
                  </div>

                  <h2 className="mt-2 text-base font-black text-gray-950">
                    Latest Notifications
                  </h2>

                  <p className="mt-1 text-xs text-gray-500">
                    {unreadBazarNotificationCount > 0
                      ? `${unreadBazarNotificationCount} unread for ${monthName}`
                      : `No unread alert for ${monthName}`}
                  </p>
                </div>

                {unreadBazarNotificationCount > 0 && (
                  <button
                    type="button"
                    onClick={markAllBazarNotificationsRead}
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
                  placeholder="Search place, date, amount, balance..."
                  className="w-full rounded-2xl border border-gray-200 bg-gray-50 py-3 pl-11 pr-10 text-sm font-bold outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
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
              {filteredBazarNotifications.length > 0 ? (
                filteredBazarNotifications.map((notification) => (
                  <BazarNotificationCard
                    key={notification.id}
                    notification={notification}
                    onOpen={() => handleBazarNotificationClick(notification)}
                    onMarkRead={() => markNotificationRead(notification.id)}
                  />
                ))
              ) : (
                <div className="rounded-3xl border border-dashed border-gray-200 p-8 text-center">
                  <Bell className="mx-auto h-8 w-8 text-gray-300" />

                  <p className="mt-3 text-sm font-black text-gray-400">
                    {notificationSearchTerm
                      ? 'No matching bazar notification found'
                      : `No bazar notifications for ${monthName}`}
                  </p>

                  <p className="mt-1 text-xs text-gray-400">
                    Bazar and balance messages will appear here.
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
