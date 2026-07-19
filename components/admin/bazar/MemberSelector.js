'use client';

import { useState, useEffect, useMemo } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, MapPin, CalendarDays } from 'lucide-react';
import { isMemberOnline } from '@/lib/presence';
import { calculateMonthlyBazarTotals } from '@/lib/bazarCalculations';
import { isMemberAccountActive } from '@/lib/memberPolicy';

const START_YEAR = 2026;
const END_YEAR = 2030;

const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const MONTHS_FULL = [
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

const safeNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const formatBDT = (amount) => {
  const number = safeNumber(amount);

  if (number < 0) {
    return `-৳${Math.abs(number).toLocaleString('bn-BD')}`;
  }

  return `৳${number.toLocaleString('bn-BD')}`;
};

const firstValidValue = (...values) => {
  return values.find(
    (value) => value !== undefined && value !== null && value !== ''
  );
};

const getMonthValue = (year, monthIndex) => {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
};

const getCurrentMonthValue = () => {
  const now = new Date();
  const year = now.getFullYear();
  const monthIndex = now.getMonth();

  if (year < START_YEAR || year > END_YEAR) {
    return `${START_YEAR}-01`;
  }

  return getMonthValue(year, monthIndex);
};

const getMonthOptions = () => {
  const options = [];

  for (let year = START_YEAR; year <= END_YEAR; year++) {
    for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
      options.push({
        value: getMonthValue(year, monthIndex),
        label: `${MONTHS_FULL[monthIndex]} ${year}`,
      });
    }
  }

  return options;
};

const getMonthName = (monthValue) => {
  if (!monthValue) return 'No month selected';

  const [year, month] = monthValue.split('-');
  const monthIndex = parseInt(month, 10) - 1;

  return `${MONTHS_SHORT[monthIndex]} ${year}`;
};

const getStatus = ({ balance, hasPayable }) => {
  if (!hasPayable) {
    if (balance < 0) {
      return {
        label: 'Net Debit',
        color: 'text-red-600',
        bg: 'bg-red-50',
        border: 'ring-red-100',
      };
    }

    return {
      label: 'Net Credit',
      color: 'text-[#0084ff]',
      bg: 'bg-blue-50',
      border: 'ring-blue-100',
    };
  }

  if (balance < 0) {
    return {
      label: 'Pending',
      color: 'text-red-600',
      bg: 'bg-red-50',
      border: 'ring-red-100',
    };
  }

  if (balance > 0) {
    return {
      label: 'Advance',
      color: 'text-[#0084ff]',
      bg: 'bg-blue-50',
      border: 'ring-blue-100',
    };
  }

  return {
    label: 'Clear',
    color: 'text-green-600',
    bg: 'bg-green-50',
    border: 'ring-green-100',
  };
};

function InfoRow({ label, value, valueClassName = 'text-gray-900' }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 border-b border-gray-100 last:border-b-0">
      <span className="text-[11px] font-semibold text-gray-500 truncate">
        {label}
      </span>

      <span
        className={`text-[11px] font-extrabold text-right truncate ${valueClassName}`}
      >
        {value}
      </span>
    </div>
  );
}

export default function MemberSelector({
  members = [],
  selectedMember,
  onSelect,
  selectedMonth,
  onMonthChange,
}) {
  const monthOptions = useMemo(() => getMonthOptions(), []);

  const [localMonth, setLocalMonth] = useState(() => getCurrentMonthValue());
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [bazars, setBazars] = useState([]);
  const [adjustments, setAdjustments] = useState([]);

  const activeMonth = selectedMonth || localMonth;

  const roomMembers = useMemo(() => {
    return members.filter(
      (member) =>
        member.room &&
        member.room.trim() !== '' &&
        isMemberAccountActive(member)
    );
  }, [members]);

  const handleMonthChange = (event) => {
    const newMonth = event.target.value;

    setLocalMonth(newMonth);

    if (onMonthChange) {
      onMonthChange(newMonth);
    }
  };

  useEffect(() => {
    if (!activeMonth) {
      setBazars([]);
      setAdjustments([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    let bazarLoaded = false;
    let adjustmentLoaded = false;

    const finishLoading = () => {
      if (bazarLoaded && adjustmentLoaded) {
        setLoading(false);
      }
    };

    const unsubBazar = onSnapshot(
      query(collection(db, 'bazar'), where('month', '==', activeMonth)),
      (snap) => {
        setBazars(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
        bazarLoaded = true;
        finishLoading();
      },
      () => {
        setBazars([]);
        bazarLoaded = true;
        finishLoading();
      }
    );

    const unsubAdjustment = onSnapshot(
      query(
        collection(db, 'balanceAdjustments'),
        where('month', '==', activeMonth)
      ),
      (snap) => {
        setAdjustments(
          snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
        );
        adjustmentLoaded = true;
        finishLoading();
      },
      () => {
        setAdjustments([]);
        adjustmentLoaded = true;
        finishLoading();
      }
    );

    return () => {
      unsubBazar();
      unsubAdjustment();
    };
  }, [activeMonth]);

  const memberStats = useMemo(() => {
    const stats = {};
    const bazarTotals = calculateMonthlyBazarTotals(bazars, activeMonth);
    const activeAdjustments = adjustments.filter((item) => !item.isDeleted);

    for (const member of roomMembers) {
      const memberId = member.id || member.uid;

      const totalBazar = bazarTotals.byMember[memberId] || 0;
      const totalBazarCount = bazarTotals.countByMember[memberId] || 0;

      const totalSent = activeAdjustments
        .filter((adjustment) => adjustment.fromMember === memberId)
        .reduce((sum, adjustment) => sum + safeNumber(adjustment.amount), 0);

      const totalReceived = activeAdjustments
        .filter((adjustment) => adjustment.toMember === memberId)
        .reduce((sum, adjustment) => sum + safeNumber(adjustment.amount), 0);

      /**
       * Correct monthly account logic:
       *
       * Bazar gives credit to member.
       * Receive gives credit to member.
       * Sent deducts from member.
       *
       * Net Credit = Bazar + Receive - Sent
       */
      const netCredit = totalBazar + totalReceived - totalSent;

      /**
       * Optional payable logic.
       * If you have meal cost/payable per member, this will show:
       *
       * Pending = netCredit - payable < 0
       * Advance = netCredit - payable > 0
       * Clear   = netCredit - payable = 0
       */
      const payableValue = firstValidValue(
        member.monthlyPayables?.[activeMonth],
        member.monthlyPayableByMonth?.[activeMonth],
        member.payableByMonth?.[activeMonth],
        member.monthlyPayable,
        member.totalMealCost,
        member.payableAmount,
        member.monthlyCost,
        member.totalPayable,
        member.payable
      );

      const hasPayable = payableValue !== undefined;
      const totalPayable = hasPayable ? safeNumber(payableValue) : null;

      const finalBalance = hasPayable
        ? netCredit - totalPayable
        : netCredit;

      stats[memberId] = {
        totalBazar,
        totalBazarCount,
        totalSent,
        totalReceived,
        netCredit,
        totalPayable,
        hasPayable,
        finalBalance,
        accountBalance: safeNumber(member.balance),
      };
    }

    return stats;
  }, [roomMembers, bazars, adjustments, activeMonth]);

  const getIsLive = (member) => {
    return isMemberOnline(member);
  };

  const filteredMembers = useMemo(() => {
    return roomMembers.filter((member) => {
      if (!searchTerm.trim()) return true;

      const term = searchTerm.toLowerCase();

      return (
        (member.displayName || member.name || '')
          .toLowerCase()
          .includes(term) ||
        (member.room || '').toLowerCase().includes(term)
      );
    });
  }, [roomMembers, searchTerm]);

  if (loading) {
    return (
      <div className="space-y-4 bg-[#f0f2f5] p-3 rounded-2xl">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_230px] gap-2">
          <div className="h-10 bg-white rounded-full animate-pulse" />
          <div className="h-10 bg-white rounded-full animate-pulse" />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-x-3 gap-y-8 pt-7">
          {[1, 2, 3, 4, 5, 6].map((item) => (
            <div
              key={item}
              className="relative bg-white rounded-2xl pt-11 pb-3 px-3 animate-pulse shadow-sm min-h-[275px]"
            >
              <div className="absolute -top-7 left-1/2 -translate-x-1/2 w-16 h-16 bg-gray-100 rounded-full border-4 border-[#f0f2f5]" />

              <div className="text-center space-y-2">
                <div className="h-3.5 w-24 bg-gray-100 rounded mx-auto" />
                <div className="h-3 w-16 bg-gray-100 rounded mx-auto" />

                <div className="mt-4 space-y-2">
                  <div className="h-3 w-full bg-gray-100 rounded" />
                  <div className="h-3 w-full bg-gray-100 rounded" />
                  <div className="h-3 w-full bg-gray-100 rounded" />
                  <div className="h-3 w-full bg-gray-100 rounded" />
                  <div className="h-3 w-full bg-gray-100 rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 bg-[#f0f2f5] p-3 rounded-2xl">
      {/* Search + Month Selector */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_230px] gap-2">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />

          <input
            type="text"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search members..."
            className="w-full pl-10 pr-4 h-10 bg-white border border-gray-200 rounded-full text-sm font-medium text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-[#0084ff]/20 focus:border-[#0084ff] outline-none transition-all"
          />
        </div>

        <div className="relative">
          <CalendarDays className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />

          <select
            value={activeMonth}
            onChange={handleMonthChange}
            className="w-full appearance-none pl-10 pr-8 h-10 bg-white border border-gray-200 rounded-full text-sm font-bold text-gray-900 focus:ring-2 focus:ring-[#0084ff]/20 focus:border-[#0084ff] outline-none transition-all cursor-pointer"
          >
            {monthOptions.map((month) => (
              <option key={month.value} value={month.value}>
                {month.label}
              </option>
            ))}
          </select>

          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 pointer-events-none">
            ▼
          </span>
        </div>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <div>
          <h3 className="text-base font-extrabold text-gray-950">Members</h3>

          <p className="text-xs text-gray-500 font-medium">
            Showing {getMonthName(activeMonth)} data
          </p>
        </div>

        <span className="px-2.5 py-1 rounded-full bg-white text-xs text-gray-700 font-bold shadow-sm">
          {filteredMembers.length}
        </span>
      </div>

      {/* Messenger Style Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-x-3 gap-y-8 pt-7">
        <AnimatePresence>
          {filteredMembers.map((member, index) => {
            const memberId = member.id || member.uid;

            const stats = memberStats[memberId] || {
              totalBazar: 0,
              totalBazarCount: 0,
              totalSent: 0,
              totalReceived: 0,
              netCredit: 0,
              totalPayable: null,
              hasPayable: false,
              finalBalance: 0,
              accountBalance: safeNumber(member.balance),
            };

            const isLive = getIsLive(member);

            const isSelected =
              selectedMember?.id === memberId ||
              selectedMember?.uid === memberId;

            const status = getStatus({
              balance: stats.finalBalance,
              hasPayable: stats.hasPayable,
            });

            return (
              <motion.div
                key={memberId}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                whileTap={{ scale: 0.97 }}
                transition={{ delay: index * 0.025 }}
                onClick={() => onSelect(member)}
                className={`relative cursor-pointer rounded-2xl pt-11 pb-3 px-3 min-h-[280px] transition-all duration-200 ${
                  isSelected
                    ? 'bg-[#e7f3ff] ring-2 ring-[#0084ff]/40 shadow-md'
                    : 'bg-white hover:bg-gray-50 shadow-sm'
                }`}
              >
                {/* Profile Icon */}
                <div className="absolute -top-7 left-1/2 -translate-x-1/2">
                  <div className="relative">
                    {member.photo ? (
                      <img
                        src={member.photo}
                        alt={member.displayName || member.name || 'Member'}
                        className={`w-16 h-16 rounded-full object-cover border-4 ${
                          isSelected ? 'border-[#0084ff]' : 'border-[#f0f2f5]'
                        }`}
                      />
                    ) : (
                      <div
                        className={`w-16 h-16 rounded-full flex items-center justify-center text-lg font-extrabold text-white border-4 ${
                          isSelected
                            ? 'bg-[#0084ff] border-[#0084ff]'
                            : 'bg-gray-400 border-[#f0f2f5]'
                        }`}
                      >
                        {(member.displayName || member.name || '?')
                          .charAt(0)
                          .toUpperCase()}
                      </div>
                    )}

                    <span
                      className={`absolute bottom-1 right-1 w-4 h-4 rounded-full border-[3px] border-white ${
                        isLive ? 'bg-green-500' : 'bg-gray-300'
                      }`}
                    />
                  </div>
                </div>

                {/* Name + Room */}
                <div className="text-center">
                  <h4 className="text-[14px] font-extrabold text-gray-950 truncate">
                    {member.displayName || member.name}
                  </h4>

                  <div className="mt-1 flex items-center justify-center gap-1 text-[11px] text-gray-500">
                    <MapPin className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">Room {member.room}</span>
                  </div>

                  <p
                    className={`mt-1 text-[10px] font-bold ${
                      isLive ? 'text-green-600' : 'text-gray-400'
                    }`}
                  >
                    {isLive ? 'Active now' : 'Offline'}
                  </p>
                </div>

                {/* Main Status Badge */}
                <div
                  className={`mt-3 mx-auto w-fit max-w-full rounded-full px-3 py-1.5 ring-1 ${status.bg} ${status.border}`}
                >
                  <p
                    className={`text-[12px] font-extrabold leading-tight truncate ${status.color}`}
                  >
                    {status.label} {formatBDT(Math.abs(stats.finalBalance))}
                  </p>
                </div>

                {/* Info List */}
                <div className="mt-3 rounded-xl bg-gray-50 px-2.5 py-1.5">
                  <InfoRow
                    label="Bazar"
                    value={formatBDT(stats.totalBazar)}
                    valueClassName="text-emerald-600"
                  />

                  <InfoRow label="Times" value={stats.totalBazarCount} />

                  <InfoRow
                    label="Sent"
                    value={formatBDT(stats.totalSent)}
                    valueClassName={
                      stats.totalSent > 0 ? 'text-red-600' : 'text-gray-900'
                    }
                  />

                  <InfoRow
                    label="Receive"
                    value={formatBDT(stats.totalReceived)}
                    valueClassName={
                      stats.totalReceived > 0
                        ? 'text-green-600'
                        : 'text-gray-900'
                    }
                  />

                  <InfoRow
                    label="Net"
                    value={formatBDT(stats.netCredit)}
                    valueClassName={
                      stats.netCredit < 0 ? 'text-red-600' : 'text-[#0084ff]'
                    }
                  />

                  <InfoRow
                    label="Payable"
                    value={
                      stats.hasPayable
                        ? formatBDT(stats.totalPayable)
                        : 'Not set'
                    }
                    valueClassName={
                      stats.hasPayable ? 'text-gray-950' : 'text-orange-500'
                    }
                  />

                  <InfoRow
                    label={status.label}
                    value={formatBDT(Math.abs(stats.finalBalance))}
                    valueClassName={status.color}
                  />
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Empty State */}
      {filteredMembers.length === 0 && (
        <div className="text-center py-10 bg-white rounded-2xl shadow-sm">
          <p className="text-sm text-gray-400 font-semibold">
            No members found for {getMonthName(activeMonth)}
          </p>
        </div>
      )}
    </div>
  );
}
