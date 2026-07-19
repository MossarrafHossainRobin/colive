'use client'

import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLanguage } from '@/lib/LanguageContext';
import { db } from '@/lib/firebase';
import { collection, doc, query, where, onSnapshot } from 'firebase/firestore';
import { useAuth } from '@/lib/AuthContext';
import { 
  ChevronLeft, ChevronRight, Loader2, LogIn, 
  Home, Bolt, Wifi, FileText as FileTextIcon, User, Gift,
  Calendar, Wallet, Utensils,
  Flame, Droplets, ChevronDown,
  TrendingUp, TrendingDown, PieChart, Clock, ArrowUpRight
} from 'lucide-react';
import { toNumber, distributePayment } from '@/lib/paymentDistribution';
import DownloadBill from '@/components/DownloadBill';
import { isMemberOnline } from '@/lib/presence';
import { calculateMonthlyBazarTotals } from '@/lib/bazarCalculations';
import useMealRatePeriod from '@/app/hooks/useMealRatePeriod';
import { dedupeMealRecords } from '@/lib/mealRecords';

const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const UTILITY_TYPES = [
  { type: 'electricity', label: 'Current Bill', icon: Bolt, color: '#F59E0B', bg: 'bg-amber-50' },
  { type: 'gas',         label: 'Gas Bill', icon: Flame, color: '#EF4444', bg: 'bg-red-50' },
  { type: 'water',       label: 'Water Kit', icon: Droplets, color: '#0EA5E9', bg: 'bg-sky-50' },
  { type: 'internet',    label: 'WiFi Bill', icon: Wifi, color: '#06B6D4', bg: 'bg-cyan-50' },
  { type: 'dust',        label: 'Dust Bill', icon: FileTextIcon, color: '#8B5CF6', bg: 'bg-violet-50' },
  { type: 'khala',       label: 'Khala Bill', icon: User, color: '#EC4899', bg: 'bg-pink-50' },
  { type: 'extra_rent',  label: 'Extra House Rent', icon: Home, color: '#F97316', bg: 'bg-orange-50' },
  { type: 'eid_bonus',   label: 'Eid Bonus', icon: Gift, color: '#10B981', bg: 'bg-emerald-50' },
];

function StatusBadge({ status }) {
  const map = {
    paid:    { label: 'Paid',    cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    partial: { label: 'Partial', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
    pending: { label: 'Due',     cls: 'bg-red-50 text-red-700 border-red-200' },
    advance: { label: 'Advance', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
    'n/a':   { label: '—',       cls: 'bg-gray-50 text-gray-400 border-gray-200' },
  };
  const s = map[status] || map['n/a'];
  return (
    <span className={`inline-flex items-center rounded-full border px-1.5 py-px text-[8px] font-bold leading-none sm:gap-1 sm:px-2 sm:py-0.5 sm:text-[10px] sm:font-semibold ${s.cls}`}>
      {s.label}
    </span>
  );
}

export default function CenterContent({
  currentMember = null,
  selectedMember = 'me',
  members = [],
  currentUserData = null,
  onSelectMember,
  dashboardMonth = '',
  onDashboardMonthChange,
}) {
  const { language } = useLanguage();
  const { user } = useAuth();
  const printRef = useRef(null);
  const [showMonthDropdown, setShowMonthDropdown] = useState(false);

  const normalizedDashboardMonth = /^\d{4}-\d{2}$/.test(String(dashboardMonth))
    ? dashboardMonth
    : `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const [selectedYear, selectedMonthNumber] = normalizedDashboardMonth
    .split('-')
    .map(Number);
  const selectedMonth = selectedMonthNumber - 1;

  const [profile, setProfile] = useState(null);
  const [allBills, setAllBills] = useState([]);
  const [allMealDocs, setAllMealDocs] = useState([]);
  const [myMealDocs, setMyMealDocs] = useState([]);
  const [allBazar, setAllBazar] = useState([]);
  const [profileLoading, setProfileLoading] = useState(true);
  const [monthLoading, setMonthLoading] = useState(true);
  const targetUserId =
    selectedMember === 'me' ? user?.uid : currentMember?.id || currentMember?.uid;

  const monthStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
  const { period: canonicalRatePeriod } = useMealRatePeriod(monthStr);
  const getMonthName = () => months[selectedMonth];

  // The admin bill system supports 2026-2030. Keep every option available,
  // including future months, and keep the selector English on every locale.
  const availableMonths = useMemo(() => {
    const result = [];

    for (let year = 2026; year <= 2030; year += 1) {
      for (let month = 0; month < 12; month += 1) {
        result.push({
          year,
          month,
          label: months[month],
          value: `${year}-${String(month + 1).padStart(2, '0')}`,
        });
      }
    }

    return result;
  }, []);

  const updateMonth = (year, monthIndex) => {
    onDashboardMonthChange?.(
      `${year}-${String(monthIndex + 1).padStart(2, '0')}`
    );
  };

  const goToPrevMonth = () => {
    if (selectedYear === 2026 && selectedMonth === 0) return;
    if (selectedMonth === 0) updateMonth(selectedYear - 1, 11);
    else updateMonth(selectedYear, selectedMonth - 1);
  };
  const goToNextMonth = () => {
    if (selectedYear === 2030 && selectedMonth === 11) return;
    if (selectedMonth === 11) updateMonth(selectedYear + 1, 0);
    else updateMonth(selectedYear, selectedMonth + 1);
  };

  const selectMonth = (year, month) => {
    updateMonth(year, month);
    setShowMonthDropdown(false);
  };

  useEffect(() => {
    if (!targetUserId) return;
    const u1 = onSnapshot(
      doc(db, 'users', targetUserId),
      snap => {
        setProfile(
          snap.exists()
            ? { id: snap.id, ...snap.data() }
            : null
        );
        setProfileLoading(false);
      }
    );
    return () => { u1(); };
  }, [targetUserId]);

  useEffect(() => {
    if (!targetUserId) return;
    let pending = 4;
    const done = () => { if (--pending <= 0) setMonthLoading(false); };
    const u1 = onSnapshot(query(collection(db, 'bills'), where('month', '==', monthStr)),
      snap => { setAllBills(snap.docs.map(d => ({ id: d.id, ...d.data() }))); done(); }, done);
    const u2 = onSnapshot(query(collection(db, 'meals'), where('userId', '==', targetUserId), where('month', '==', monthStr)),
      snap => { setMyMealDocs(dedupeMealRecords(snap.docs.map(d => ({ id: d.id, ...d.data() })), { month: monthStr })); done(); });
    const u3 = onSnapshot(query(collection(db, 'meals'), where('month', '==', monthStr)),
      snap => { setAllMealDocs(dedupeMealRecords(snap.docs.map(d => ({ id: d.id, ...d.data() })), { month: monthStr })); done(); });
    const u4 = onSnapshot(query(collection(db, 'bazar'), where('month', '==', monthStr)),
      snap => { setAllBazar(snap.docs.map(d => ({ id: d.id, ...d.data() }))); done(); });
    return () => { u1(); u2(); u3(); u4(); };
  }, [targetUserId, monthStr]);

  const userRoom = profile?.room || '';
  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  // ============ CALCULATIONS ============
  const rentBill = useMemo(() => 
    allBills.find(b => b.category === 'rent' && b.userId === targetUserId && b.collectionType !== 'expense'),
    [allBills, targetUserId]
  );

  const previousDue = useMemo(() => {
    const b = allBills.find(b => 
      b.userId === targetUserId && b.collectionType !== 'expense' &&
      typeof b.manualPrevDue === 'number' && b.manualPrevDue !== 0
    );
    return toNumber(b ? b.manualPrevDue : profile?.previousDue);
  }, [allBills, targetUserId, profile]);

  const utilityBillsSample = useMemo(() => 
    allBills.filter(b => b.category === 'utility' && b.collectionType !== 'expense'),
    [allBills]
  );

  const uniqueUtilityTotals = useMemo(() => 
    Object.values(utilityBillsSample.reduce((acc, b) => {
      if (!acc[b.type]) acc[b.type] = toNumber(b.totalUtilityCost);
      return acc;
    }, {})),
    [utilityBillsSample]
  );

  const trueTotalUtility = useMemo(() => 
    uniqueUtilityTotals.reduce((s, v) => s + v, 0),
    [uniqueUtilityTotals]
  );

  const totalMembers = useMemo(() => {
    const firstBill = utilityBillsSample.find(b => b.totalMembers);
    return Math.max(toNumber(firstBill?.totalMembers), 1);
  }, [utilityBillsSample]);

  const perPersonUtility = useMemo(() => 
    Math.ceil(trueTotalUtility / totalMembers),
    [trueTotalUtility, totalMembers]
  );

  const userUtilityBills = useMemo(() => {
    const bills = [];
    UTILITY_TYPES.forEach(u => {
      const bill = allBills.find(b => 
        b.type === u.type && b.userId === targetUserId && b.collectionType !== 'expense'
      );
      if (bill) {
        bills.push({
          type: u.type, label: u.label, icon: u.icon, color: u.color, bg: u.bg,
          totalCost: toNumber(bill.totalUtilityCost),
          paid: toNumber(bill.paidAmount), id: bill.id
        });
      }
    });
    return bills;
  }, [allBills, targetUserId]);

  const utilityShares = useMemo(() => {
    if (userUtilityBills.length === 0) return [];
    const totalAllUtilityCost = userUtilityBills.reduce((s, b) => s + b.totalCost, 0);
    let remaining = perPersonUtility;
    
    return userUtilityBills.map((bill, index) => {
      if (index === userUtilityBills.length - 1) {
        const share = Math.max(0, remaining);
        return { ...bill, myShare: share, due: Math.max(0, share - bill.paid),
          status: share <= 0 ? 'n/a' : bill.paid >= share ? 'paid' : bill.paid > 0 ? 'partial' : 'pending' };
      }
      const proportional = (bill.totalCost / totalAllUtilityCost) * perPersonUtility;
      const share = Math.round(proportional);
      remaining -= share;
      return { ...bill, myShare: share, due: Math.max(0, share - bill.paid),
        status: share <= 0 ? 'n/a' : bill.paid >= share ? 'paid' : bill.paid > 0 ? 'partial' : 'pending' };
    });
  }, [userUtilityBills, perPersonUtility]);

  const allBillItems = useMemo(() => {
    const items = [];
    if (previousDue > 0) items.push({ type: 'previous_due', label: 'Previous Due', myShare: previousDue, paid: 0, totalCost: previousDue, members: 1 });
    if (rentBill) {
      const totalCost = toNumber(rentBill.totalRoomRent || rentBill.amount);
      const members = Math.max(toNumber(rentBill.membersInRoom), 1);
      items.push({ type: 'rent', label: 'House Rent', myShare: Math.ceil(totalCost / members), paid: toNumber(rentBill.paidAmount), totalCost, members });
    }
    utilityShares.forEach(share => items.push({ type: share.type, label: share.label, myShare: share.myShare, paid: share.paid, totalCost: share.totalCost, members: totalMembers }));
    return items;
  }, [previousDue, rentBill, utilityShares, totalMembers]);

  const userTotalPayment = useMemo(() => allBillItems.reduce((sum, item) => sum + item.paid, 0), [allBillItems]);

  const distribution = useMemo(() => {
    if (allBillItems.length === 0) return { bills: [], totalPaid: 0, totalDue: 0, totalShare: 0, advanceAmount: 0, remainingToPay: 0 };
    return distributePayment(userTotalPayment, allBillItems.map(b => ({ ...b, paid: 0 })));
  }, [allBillItems, userTotalPayment]);

  const totalShare = distribution.totalShare;
  const totalPaid = distribution.totalPaid;
  const advanceAmount = distribution.advanceAmount;
  const remainingToPay = distribution.remainingToPay;

  const overallStatus = useMemo(() => {
    if (totalShare === 0) return 'n/a';
    if (advanceAmount > 0 && remainingToPay === 0) return 'advance';
    if (remainingToPay === 0) return 'paid';
    if (totalPaid > 0) return 'partial';
    return 'pending';
  }, [totalShare, totalPaid, remainingToPay, advanceAmount]);

  const previousDueBill = distribution.bills.find(b => b.type === 'previous_due');
  const rentBillDistributed = distribution.bills.find(b => b.type === 'rent');
  const utilityBillsDistributed = distribution.bills.filter(b => 
    b.type !== 'previous_due' && b.type !== 'rent'
  ).sort((a, b) => {
    const order = ['electricity', 'gas', 'water', 'internet', 'dust', 'khala', 'extra_rent', 'eid_bonus'];
    return order.indexOf(a.type) - order.indexOf(b.type);
  });
  const mobileExpenseRows = [
    ...(rentBillDistributed
      ? [{ ...rentBillDistributed, label: 'House Rent' }]
      : []),
    ...utilityBillsDistributed,
  ];
  const mobileExpenseTotal = mobileExpenseRows.reduce(
    (sum, row) => sum + toNumber(row.myShare),
    0
  );
  const mobileExpensePaid = mobileExpenseRows.reduce(
    (sum, row) => sum + Math.min(toNumber(row.paid), toNumber(row.myShare)),
    0
  );
  const mobileExpenseStatus =
    mobileExpenseTotal <= 0
      ? 'n/a'
      : mobileExpensePaid >= mobileExpenseTotal
        ? 'paid'
        : mobileExpensePaid > 0
          ? 'partial'
          : 'pending';

  // Meal calculations
  const myMeals = useMemo(
    () =>
      myMealDocs.reduce(
        (sum, meal) =>
          sum +
          toNumber(meal.lunch) +
          toNumber(meal.dinner) +
          toNumber(meal.guestMeal),
        0
      ),
    [myMealDocs]
  );
  const totalMessMeals = useMemo(
    () =>
      allMealDocs.reduce(
        (sum, meal) =>
          sum +
          toNumber(meal.lunch) +
          toNumber(meal.dinner) +
          toNumber(meal.guestMeal),
        0
      ),
    [allMealDocs]
  );
  const currentBazar = useMemo(() => allBazar.filter((b) => !b.isDeleted), [allBazar]);
  const monthlyBazarTotals = useMemo(
    () => calculateMonthlyBazarTotals(allBazar, monthStr),
    [allBazar, monthStr]
  );
  const totalMealExpense = monthlyBazarTotals.house;
  const effectiveMealRate = Number.isFinite(Number(canonicalRatePeriod?.mealRate))
    ? Number(canonicalRatePeriod.mealRate)
    : 0;
  const consumedAmount = myMeals * effectiveMealRate;
  const bazarGiven = monthlyBazarTotals.byMember[targetUserId] || 0;
  const mealNet = bazarGiven - consumedAmount;
  const mealBalanceAmount = Math.abs(Math.round(mealNet));
  const mealBalanceLabel =
    mealNet > 0 ? 'Meal advance' : mealNet < 0 ? 'Meal due' : 'Settled';

  const myBazarEntries = useMemo(() => 
    currentBazar.filter(b => b.userId === targetUserId).sort((a, b) => (b.date || '').localeCompare(a.date || '')),
    [currentBazar, targetUserId]
  );
  const loading = (profileLoading || monthLoading) && allBills.length === 0;
  const paidPercentage = totalShare > 0 ? Math.round((totalPaid / totalShare) * 100) : 0;
  const mobileRoomMembers = [
    {
      ...(currentUserData || {}),
      id: 'me',
      uid: user?.uid,
      name:
        currentUserData?.displayName ||
        currentUserData?.name ||
        user?.displayName ||
        'Me',
      photo: currentUserData?.photo || user?.photoURL || '',
      isCurrentUser: true,
    },
    ...members.filter((member) => member?.room?.trim()),
  ];

  if (!user) return (
    <div className="flex-1 flex items-center justify-center min-h-[60vh]">
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
        <div className="w-16 h-16 bg-white rounded-2xl shadow-lg flex items-center justify-center mx-auto mb-4">
          <LogIn className="w-7 h-7 text-blue-600" />
        </div>
        <p className="text-base font-bold text-gray-700">{language === 'bn' ? 'লগ ইন করুন' : 'Please sign in'}</p>
      </motion.div>
    </div>
  );

  return (
    <div className="min-h-0 flex-1 overflow-hidden bg-slate-50 sm:overflow-y-auto">
      <div className="mx-auto flex h-full max-w-5xl flex-col gap-1.5 p-1.5 sm:block sm:h-auto sm:space-y-5 sm:p-5 sm:pb-8 lg:p-6">

        {/* ============ HEADER WITH MONTH SELECTOR ============ */}
        <div className="shrink-0 rounded-xl border border-slate-200/80 bg-white p-1 shadow-sm sm:rounded-3xl sm:p-5">
          <div className="flex sm:items-center sm:justify-between">
            {/* User Info */}
            <div className="hidden min-w-0 items-center gap-3 sm:flex">
              <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-md flex-shrink-0">
                <Calendar className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-black text-slate-950 sm:text-xl">Monthly Statement</h2>
                <p className="text-xs text-gray-500 truncate">
                  {selectedMember !== 'me' && 'Viewing member · '}
                  {userRoom && `${userRoom} · `}{profile?.displayName || profile?.name || 'User'}
                </p>
              </div>
            </div>

            {/* Month Selector + Download */}
            <div className="flex w-full items-center gap-2 sm:w-auto sm:flex-shrink-0">
              {/* Month Dropdown */}
              <div className="relative min-w-0 flex-1 sm:flex-none">
                <div className="grid h-9 grid-cols-[minmax(0,1fr)_78px] overflow-hidden rounded-lg border border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 shadow-inner sm:hidden">
                  <label className="relative flex min-w-0 items-center border-r border-blue-100">
                    <Calendar className="pointer-events-none ml-2 h-3.5 w-3.5 shrink-0 text-blue-600" />
                    <span className="sr-only">Select month</span>
                    <select
                      value={selectedMonth}
                      onChange={(event) =>
                        updateMonth(selectedYear, Number(event.target.value))
                      }
                      className="h-full min-w-0 flex-1 appearance-none bg-transparent pl-1.5 pr-5 text-[11px] font-black text-slate-900 outline-none"
                    >
                      {months.map((month, index) => (
                        <option key={month} value={index}>
                          {month}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-1.5 h-3 w-3 text-blue-500" />
                  </label>

                  <label className="relative flex items-center">
                    <span className="sr-only">Select year</span>
                    <select
                      value={selectedYear}
                      onChange={(event) =>
                        updateMonth(Number(event.target.value), selectedMonth)
                      }
                      className="h-full w-full appearance-none bg-transparent pl-2.5 pr-5 text-[11px] font-black text-indigo-700 outline-none"
                    >
                      {[2026, 2027, 2028, 2029, 2030].map((year) => (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-1.5 h-3 w-3 text-indigo-500" />
                  </label>
                </div>

                <button
                  onClick={() => setShowMonthDropdown(!showMonthDropdown)}
                  className="hidden h-9 w-full items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2.5 text-xs font-black text-gray-900 transition-colors hover:bg-gray-100 sm:flex sm:h-auto sm:w-auto sm:rounded-xl sm:px-4 sm:py-2.5 sm:text-sm sm:font-semibold"
                >
                  <span className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-blue-600 sm:hidden" />
                    {getMonthName()} {selectedYear}
                  </span>
                  <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showMonthDropdown ? 'rotate-180' : ''}`} />
                </button>

                <AnimatePresence>
                  {showMonthDropdown && (
                    <motion.div
                      initial={{ opacity: 0, y: -10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -10, scale: 0.95 }}
                      className="absolute right-0 z-50 mt-2 hidden max-h-64 w-56 min-w-56 overflow-y-auto rounded-xl border border-gray-200 bg-white py-2 shadow-xl sm:block"
                    >
                      <div className="sticky top-0 z-10 border-b border-gray-100 bg-white px-3 pb-2 pt-1">
                        <p className="mb-1 text-center text-[9px] font-black uppercase tracking-wide text-blue-600">
                          English months · 2026–2030
                        </p>
                        <div className="flex items-center justify-between">
                          <button
                            onClick={goToPrevMonth}
                            disabled={selectedYear === 2026 && selectedMonth === 0}
                            className="rounded-lg p-1 hover:bg-gray-100 disabled:opacity-25"
                          >
                            <ChevronLeft className="w-4 h-4 text-gray-500" />
                          </button>
                          <span className="text-xs font-bold text-gray-700">{selectedYear}</span>
                          <button
                            onClick={goToNextMonth}
                            disabled={selectedYear === 2030 && selectedMonth === 11}
                            className="rounded-lg p-1 hover:bg-gray-100 disabled:opacity-25"
                          >
                            <ChevronRight className="w-4 h-4 text-gray-500" />
                          </button>
                        </div>
                      </div>
                      {availableMonths.map((m) => (
                        <button
                          key={m.value}
                          onClick={() => selectMonth(m.year, m.month)}
                          className={`w-full flex items-center justify-between px-4 py-2.5 text-sm transition-colors ${
                            m.year === selectedYear && m.month === selectedMonth
                              ? 'bg-blue-50 text-blue-700 font-bold'
                              : 'text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          <span>{m.label} {m.year}</span>
                          {m.year === selectedYear && m.month === selectedMonth && (
                            <span className="w-2 h-2 rounded-full bg-blue-600" />
                          )}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Download Button */}
              <div className="hidden sm:block">
                <DownloadBill
                  targetRef={printRef}
                  fileName={`NestHub-Bill-${profile?.name || 'user'}-${monthStr}`}
                  title={`NestHub Bill - ${getMonthName()} ${selectedYear}`}
                  author={profile?.name || 'NestHub User'}
                />
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-1 flex-col items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500 mb-3" />
            <p className="text-sm text-gray-500">{language === 'bn' ? 'লোড হচ্ছে...' : 'Loading...'}</p>
          </div>
        ) : (
        <>
          <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm sm:hidden">
            <div className="flex min-w-0 items-center justify-between border-b border-slate-100 px-2.5 py-1">
                  <span className="truncate text-[9px] font-black uppercase tracking-wide text-slate-500">
                    Overall · {profile?.displayName || profile?.name || 'Member'}
              </span>
              <strong className="ml-2 text-xs font-black tabular-nums text-slate-950">
                ৳{mobileExpenseTotal.toLocaleString()}
              </strong>
            </div>
            <div className="row-span-2 flex items-center border-l border-slate-100 px-2.5">
              <StatusBadge status={mobileExpenseStatus} />
            </div>
            <div className="grid grid-cols-2 divide-x divide-slate-100 border-t border-slate-100">
              <span className="px-2.5 py-1 text-[9px] font-bold text-emerald-700">
                Paid ৳{mobileExpensePaid.toLocaleString()}
              </span>
              <span className="px-2.5 py-1 text-right text-[9px] font-bold text-rose-700">
                Due ৳{Math.max(0, mobileExpenseTotal - mobileExpensePaid).toLocaleString()}
              </span>
            </div>
          </div>

          {/* ============ PRINTABLE AREA ============ */}
          <div ref={printRef} className="min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm sm:block sm:rounded-3xl print:rounded-none print:border-none print:shadow-none">

            {/* Statement Header */}
            <div className="hidden bg-gray-900 px-5 py-5 text-white sm:block sm:px-6">
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-7 h-7 bg-blue-500 rounded-lg flex items-center justify-center">
                      <Home className="w-3.5 h-3.5 text-white" />
                    </div>
                    <h1 className="text-sm sm:text-lg font-bold">NestHub Monthly Statement</h1>
                  </div>
                  <p className="text-gray-400 text-[10px] sm:text-xs">
                    {getMonthName()} {selectedYear} • {userRoom || 'All Rooms'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-gray-400">Generated: {today}</p>
                  {profile?.name && <p className="text-xs sm:text-sm font-bold mt-0.5">{profile.name}</p>}
                </div>
              </div>
            </div>

            {/* Summary Cards */}
            <div className="hidden grid-cols-2 gap-3 p-4 sm:grid sm:grid-cols-4 sm:p-5">
              {[
                { label: 'Total Payable', value: totalShare, icon: Wallet, color: 'text-gray-900', bg: 'bg-gray-50' },
                { label: 'Total Paid', value: totalPaid, icon: TrendingUp, color: 'text-emerald-700', bg: 'bg-emerald-50' },
                { label: 'Balance', value: remainingToPay > 0 ? remainingToPay : advanceAmount, icon: remainingToPay > 0 ? TrendingDown : ArrowUpRight, color: remainingToPay > 0 ? 'text-red-700' : 'text-blue-700', bg: remainingToPay > 0 ? 'bg-red-50' : 'bg-blue-50', suffix: remainingToPay > 0 ? ' Due' : ' Adv' },
                { label: 'Progress', value: paidPercentage, icon: PieChart, color: 'text-violet-700', bg: 'bg-violet-50', suffix: '%', isPercentage: true },
              ].map((card, i) => (
                <div key={i} className={`${card.bg} rounded-xl p-3 sm:p-4 border border-gray-100`}>
                  <div className="flex items-center gap-2 mb-2">
                    <card.icon className={`w-4 h-4 ${card.color}`} />
                    <span className="text-[10px] font-semibold text-gray-500 uppercase">{card.label}</span>
                  </div>
                  <p className={`text-lg sm:text-xl font-extrabold ${card.color}`}>
                    {card.isPercentage ? '' : '৳'}{card.value.toLocaleString()}{card.suffix || ''}
                  </p>
                  {card.isPercentage && (
                    <div className="mt-2 w-full bg-gray-200 rounded-full h-1.5">
                      <div 
                        className={`h-1.5 rounded-full transition-all ${paidPercentage >= 100 ? 'bg-emerald-500' : paidPercentage >= 50 ? 'bg-blue-500' : 'bg-red-500'}`}
                        style={{ width: `${Math.min(paidPercentage, 100)}%` }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* House Expense Table */}
            <div className="border-gray-100 sm:border-t">
              <div className="border-b border-gray-100 bg-gray-50/50 px-2 py-1 sm:px-5 sm:py-3">
                <div className="flex items-center gap-2">
                  <Wallet className="h-3.5 w-3.5 text-blue-600 sm:h-4 sm:w-4" />
                  <span className="text-[9px] font-black uppercase tracking-wider text-gray-700 sm:text-xs sm:font-bold">
                    <span className="sm:hidden">Utility details</span>
                    <span className="hidden sm:inline">House Expense Breakdown</span>
                  </span>
                  <span className="ml-auto hidden text-[10px] text-gray-400 sm:inline">Per Person: ৳{perPersonUtility.toLocaleString()}</span>
                </div>
              </div>

              {/* Desktop Table */}
              <div className="hidden sm:block">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-center py-2.5 px-3 text-[10px] font-bold text-gray-400 uppercase w-8">#</th>
                      <th className="text-left py-2.5 px-3 text-[10px] font-bold text-gray-400 uppercase">Expense</th>
                      <th className="text-right py-2.5 px-3 text-[10px] font-bold text-gray-400 uppercase">Total</th>
                      <th className="text-right py-2.5 px-3 text-[10px] font-bold text-gray-400 uppercase">Share</th>
                      <th className="text-right py-2.5 px-3 text-[10px] font-bold text-gray-400 uppercase">Paid</th>
                      <th className="text-right py-2.5 px-3 text-[10px] font-bold text-gray-400 uppercase">Due</th>
                      <th className="text-center py-2.5 px-3 text-[10px] font-bold text-gray-400 uppercase w-20">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {previousDueBill && previousDueBill.myShare > 0 && (
                      <tr className="bg-orange-50/30">
                        <td className="py-2.5 px-3 text-center text-gray-400 text-[10px]">*</td>
                        <td className="py-2.5 px-3 font-semibold text-orange-600 text-[11px]">Previous Due</td>
                        <td className="py-2.5 px-3 text-right text-gray-400">—</td>
                        <td className="py-2.5 px-3 text-right font-bold text-orange-600">৳{previousDueBill.myShare.toLocaleString()}</td>
                        <td className="py-2.5 px-3 text-right text-green-600">৳{previousDueBill.paid.toLocaleString()}</td>
                        <td className="py-2.5 px-3 text-right font-bold text-red-500">{previousDueBill.due > 0 ? `৳${previousDueBill.due.toLocaleString()}` : '—'}</td>
                        <td className="py-2.5 px-3 text-center"><StatusBadge status={previousDueBill.status} /></td>
                      </tr>
                    )}
                    {rentBillDistributed && (
                      <tr className="hover:bg-gray-50/50 transition-colors">
                        <td className="py-2.5 px-3 text-center text-gray-400 text-[10px]">1</td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-md bg-blue-100 flex items-center justify-center">
                              <Home className="w-3 h-3 text-blue-600" />
                            </div>
                            <span className="font-semibold text-gray-800 text-[11px]">House Rent</span>
                            {rentBillDistributed.members > 1 && <span className="text-[9px] text-gray-400">({rentBillDistributed.members})</span>}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right text-gray-500">৳{rentBillDistributed.totalCost.toLocaleString()}</td>
                        <td className="py-2.5 px-3 text-right font-bold">৳{rentBillDistributed.myShare.toLocaleString()}</td>
                        <td className="py-2.5 px-3 text-right font-bold text-green-600">৳{rentBillDistributed.paid.toLocaleString()}</td>
                        <td className="py-2.5 px-3 text-right font-bold text-red-500">{rentBillDistributed.due > 0 ? `৳${rentBillDistributed.due.toLocaleString()}` : '—'}</td>
                        <td className="py-2.5 px-3 text-center"><StatusBadge status={rentBillDistributed.status} /></td>
                      </tr>
                    )}
                    {utilityBillsDistributed.map((row, i) => {
                      const config = UTILITY_TYPES.find(u => u.type === row.type);
                      const Icon = config?.icon || FileTextIcon;
                      const color = config?.color || '#6B7280';
                      const bg = config?.bg || 'bg-gray-50';
                      return (
                        <tr key={row.type} className="hover:bg-gray-50/50 transition-colors">
                          <td className="py-2.5 px-3 text-center text-gray-400 text-[10px]">{i + 2}</td>
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-2">
                              <div className={`w-6 h-6 rounded-md ${bg} flex items-center justify-center`}>
                                <Icon className="w-3 h-3" style={{ color }} />
                              </div>
                              <span className="font-semibold text-gray-800 text-[11px]">{row.label}</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-right text-gray-500">৳{row.totalCost.toLocaleString()}</td>
                          <td className="py-2.5 px-3 text-right font-bold">৳{row.myShare.toLocaleString()}</td>
                          <td className="py-2.5 px-3 text-right font-bold text-green-600">৳{row.paid.toLocaleString()}</td>
                          <td className="py-2.5 px-3 text-right font-bold text-red-500">{row.due > 0 ? `৳${row.due.toLocaleString()}` : '—'}</td>
                          <td className="py-2.5 px-3 text-center"><StatusBadge status={row.status} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-100 border-t-2 border-gray-200 font-bold">
                      <td colSpan={3} className="py-3 px-3 text-[11px] text-gray-700">Total</td>
                      <td className="py-3 px-3 text-right text-[11px]">৳{totalShare.toLocaleString()}</td>
                      <td className="py-3 px-3 text-right text-[11px] text-green-600">৳{totalPaid.toLocaleString()}</td>
                      <td className="py-3 px-3 text-right text-[11px] text-red-500">{remainingToPay > 0 ? `৳${remainingToPay.toLocaleString()}` : '—'}</td>
                      <td className="py-3 px-3 text-center"><StatusBadge status={overallStatus} /></td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Compact mobile ledger: only the member share and its status. */}
              <div className="sm:hidden">
                <div className="grid grid-cols-[minmax(0,1fr)_64px_56px] items-center border-b border-gray-100 bg-slate-50 px-2 py-1 text-[8px] font-black uppercase tracking-wide text-slate-400">
                  <span>Expense name</span>
                  <span className="text-right">Amount</span>
                  <span className="text-right">Status</span>
                </div>

                <div className="divide-y divide-gray-100">
                  {mobileExpenseRows.map((row) => {
                    const config = UTILITY_TYPES.find((item) => item.type === row.type);
                    const Icon = row.type === 'rent' ? Home : config?.icon || FileTextIcon;
                    const color = row.type === 'rent' ? '#2563EB' : config?.color || '#6B7280';

                    return (
                      <div
                        key={row.type}
                        className={`grid min-h-7 grid-cols-[minmax(0,1fr)_64px_56px] items-center border-l-2 px-2 py-1 ${
                          row.status === 'paid'
                            ? 'border-l-emerald-500 bg-emerald-50/70'
                            : row.status === 'partial'
                              ? 'border-l-amber-500 bg-amber-50/70'
                              : 'border-l-rose-500 bg-rose-50/70'
                        }`}
                      >
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span
                            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md"
                            style={{ backgroundColor: `${color}15` }}
                          >
                            <Icon className="h-3 w-3" style={{ color }} />
                          </span>
                          <span className="truncate text-[10px] font-bold leading-none text-slate-800">
                            {row.label}
                          </span>
                        </span>
                        <span className="text-right text-[10px] font-black tabular-nums text-slate-900">
                          ৳{row.myShare.toLocaleString()}
                        </span>
                        <span className="justify-self-end">
                          <StatusBadge status={row.status} />
                        </span>
                      </div>
                    );
                  })}

                  {!rentBillDistributed && utilityBillsDistributed.length === 0 && (
                    <p className="px-3 py-4 text-center text-[10px] font-semibold text-slate-400">
                      No utility expense was set by the admin for this month.
                    </p>
                  )}
                </div>

              </div>
            </div>

            {/* Meal Summary */}
            <div className="border-t border-gray-200">
              <div className="hidden bg-gray-50/50 px-4 py-3 sm:block sm:px-5">
                <div className="flex items-center gap-2">
                  <Utensils className="w-4 h-4 text-orange-600" />
                  <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">Meal Summary</span>
                  <span className="text-[10px] text-gray-400 ml-auto">Rate: ৳{effectiveMealRate}/meal</span>
                </div>
              </div>

              {/* Desktop Meal Table */}
              <div className="hidden sm:block p-4 sm:p-5">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  {[
                    { label: 'Your Meals', value: myMeals, suffix: ' meals', color: 'text-blue-700', bg: 'bg-blue-50' },
                    { label: 'Mess Total', value: totalMessMeals, suffix: ' meals', color: 'text-indigo-700', bg: 'bg-indigo-50' },
                    { label: 'Bazar Count', value: myBazarEntries.length, suffix: ' entries', color: 'text-amber-700', bg: 'bg-amber-50' },
                    { label: 'Meal Rate', value: effectiveMealRate, prefix: '৳', suffix: '/meal', color: 'text-emerald-700', bg: 'bg-emerald-50' },
                  ].map((stat, i) => (
                    <div key={i} className={`${stat.bg} rounded-xl p-3 border border-gray-100`}>
                      <p className="text-[10px] text-gray-500 uppercase font-semibold">{stat.label}</p>
                      <p className={`text-lg font-extrabold ${stat.color} mt-0.5`}>
                        {stat.prefix || ''}{stat.value.toLocaleString()}{stat.suffix || ''}
                      </p>
                    </div>
                  ))}
                </div>

                <table className="w-full text-xs">
                  <tbody className="divide-y divide-gray-100">
                    <tr>
                      <td className="py-2.5 text-gray-600">Total Bazar Expense</td>
                      <td className="py-2.5 text-right font-bold">৳{totalMealExpense.toLocaleString()}</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 text-gray-600">Your Consumption ({myMeals} × ৳{effectiveMealRate})</td>
                      <td className="py-2.5 text-right font-bold text-red-500">৳{consumedAmount.toLocaleString()}</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 text-gray-600">Your Contribution</td>
                      <td className="py-2.5 text-right font-bold text-green-600">৳{bazarGiven.toLocaleString()}</td>
                    </tr>
                    <tr className="bg-gray-50 font-bold">
                      <td className="py-2.5 text-gray-800">Net Meal Balance</td>
                      <td className={`py-2.5 text-right ${mealNet > 0 ? 'text-green-600' : mealNet < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                        {mealNet > 0 ? `+৳${mealNet.toLocaleString()}` : mealNet < 0 ? `৳${Math.abs(mealNet).toLocaleString()} Due` : 'Settled ✓'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Four at-a-glance meal figures for the phone app view. */}
              <div className="grid grid-cols-4 gap-1 p-1.5 sm:hidden">
                {[
                  {
                    label: 'Meal rate',
                    value: `৳${effectiveMealRate.toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })}`,
                    icon: TrendingUp,
                    className: 'bg-indigo-50 text-indigo-700 ring-indigo-100',
                  },
                  {
                    label: 'Meals taken',
                    value: myMeals.toLocaleString(),
                    icon: Utensils,
                    className: 'bg-blue-50 text-blue-700 ring-blue-100',
                  },
                  {
                    label: 'Meal amount',
                    value: `৳${Math.round(consumedAmount).toLocaleString()}`,
                    icon: Wallet,
                    className: 'bg-amber-50 text-amber-700 ring-amber-100',
                  },
                  {
                    label: mealBalanceLabel,
                    value: mealNet === 0 ? '৳0' : `৳${mealBalanceAmount.toLocaleString()}`,
                    icon: Clock,
                    className:
                      mealNet > 0
                        ? 'bg-emerald-50 text-emerald-700 ring-emerald-100'
                        : mealNet < 0
                          ? 'bg-rose-50 text-rose-700 ring-rose-100'
                          : 'bg-slate-50 text-slate-600 ring-slate-100',
                  },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className={`flex min-w-0 items-center gap-1.5 rounded-lg p-1.5 ring-1 ${stat.className}`}
                  >
                    <stat.icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="min-w-0">
                      <span className="block truncate text-[11px] font-black leading-none tabular-nums">{stat.value}</span>
                      <span className="mt-0.5 block truncate text-[7px] font-black uppercase leading-none opacity-70">
                        {stat.label}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Room-assigned member switcher for the mobile app view. */}
            <div className="shrink-0 border-t border-slate-200 bg-white sm:hidden">
              <div className="flex h-4 items-center justify-between px-2">
                <span className="text-[7px] font-black uppercase tracking-wider text-slate-400">
                  Room members
                </span>
                {selectedMember !== 'me' ? (
                  <button
                    type="button"
                    onClick={() => onSelectMember?.('me')}
                    className="rounded bg-blue-50 px-1.5 py-0.5 text-[7px] font-black text-blue-700"
                  >
                    ← My details
                  </button>
                ) : (
                  <span className="max-w-[55%] truncate text-[7px] font-bold text-slate-500">
                    {profile?.displayName || profile?.name || 'Member'} · {profile?.room || 'No room'}
                  </span>
                )}
              </div>

              <div className="grid h-10 grid-flow-col auto-cols-[minmax(42px,1fr)] overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {mobileRoomMembers.map((member) => {
                  const memberId = member.isCurrentUser ? 'me' : member.id;
                  const selected = selectedMember === memberId;
                  const online = isMemberOnline(member);
                  const name = member.displayName || member.name || 'Member';
                  const photo = member.photo || member.photoURL || '';

                  return (
                    <button
                      key={memberId}
                      type="button"
                      onClick={() => onSelectMember?.(memberId)}
                      className={`relative flex min-w-[42px] flex-col items-center justify-center px-1 transition ${
                        selected ? 'bg-blue-50' : 'bg-white'
                      }`}
                      title={`${name} · ${online ? 'Active' : 'Away'}`}
                      aria-pressed={selected}
                    >
                      <span className="relative">
                        {photo ? (
                          <img
                            src={photo}
                            alt=""
                            className={`h-6 w-6 rounded-full object-cover ring-2 ${
                              selected ? 'ring-blue-500' : 'ring-slate-100'
                            }`}
                          />
                        ) : (
                          <span
                            className={`flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-black ring-2 ${
                              selected
                                ? 'bg-blue-600 text-white ring-blue-200'
                                : 'bg-slate-100 text-slate-600 ring-white'
                            }`}
                          >
                            {name.charAt(0).toUpperCase()}
                          </span>
                        )}
                        <span
                          className={`absolute -bottom-px -right-px h-2 w-2 rounded-full border border-white ${
                            online ? 'bg-emerald-500' : 'bg-slate-400'
                          }`}
                        />
                      </span>
                      <span
                        className={`mt-0.5 max-w-11 truncate text-[7px] leading-none ${
                          selected ? 'font-black text-blue-700' : 'font-bold text-slate-500'
                        }`}
                      >
                        {member.isCurrentUser ? 'Me' : name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Footer */}
            <div className="hidden border-t border-gray-100 bg-gray-50/50 px-4 py-3 text-center sm:block sm:px-5">
              <p className="text-[10px] text-gray-400">
                Generated {today} • NestHub Meal Management • Per Person Utility: ৳{perPersonUtility.toLocaleString()}
              </p>
            </div>
          </div>
        </>
        )}
      </div>
    </div>
  );
}
