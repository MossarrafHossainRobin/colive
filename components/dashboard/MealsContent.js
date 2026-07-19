'use client'

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { db } from '@/lib/firebase';
import { calculateMonthlyBazarTotals } from '@/lib/bazarCalculations';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { Utensils, TrendingUp, TrendingDown, Users, DollarSign, ArrowRight, Calendar } from 'lucide-react';
import Link from 'next/link';
import useMealRatePeriod from '@/app/hooks/useMealRatePeriod';
import { dedupeMealRecords } from '@/lib/mealRecords';
import { dhakaDateId } from '@/lib/bazarWorkspace';

export default function MealsContent() {
  const { user } = useAuth();
  const [myMeals, setMyMeals] = useState([]);
  const [bazarEntries, setBazarEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  const currentDate = dhakaDateId();
  const currentMonth = currentDate.substring(0, 7);
  const { period: canonicalRatePeriod } = useMealRatePeriod(currentMonth);
  const today = currentDate;
  const monthName = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  useEffect(() => {
    if (!user) return;
    setLoading(true);

    const u1 = onSnapshot(
      query(collection(db, "meals"), where("userId", "==", user.uid), where("month", "==", currentMonth)),
      (snap) => {
        setMyMeals(dedupeMealRecords(
          snap.docs.map(d => ({ id: d.id, ...d.data() })),
          { month: currentMonth }
        ));
        setLoading(false);
      }
    );

    const u2 = onSnapshot(
      query(collection(db, "bazar"), where("month", "==", currentMonth)),
      (snap) => setBazarEntries(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );

    return () => { u1(); u2(); };
  }, [user, currentMonth]);

  const todayMeal = useMemo(() => myMeals.find(m => m.date === today), [myMeals, today]);

  const myTotalMeals = useMemo(
    () =>
      myMeals.reduce(
        (sum, meal) =>
          sum +
          (Number(meal.lunch) || 0) +
          (Number(meal.dinner) || 0) +
          (Number(meal.guestMeal) || 0),
        0
      ),
    [myMeals]
  );
  const myGuestMeals = useMemo(() => myMeals.reduce((s, m) => s + (m.guestMeal || 0), 0), [myMeals]);
  const bazarTotals = useMemo(
    () => calculateMonthlyBazarTotals(bazarEntries, currentMonth),
    [bazarEntries, currentMonth]
  );
  const effectiveMealRate = Number.isFinite(Number(canonicalRatePeriod?.mealRate))
    ? Number(canonicalRatePeriod.mealRate)
    : 0;
  const myConsumedAmount = Math.ceil(myTotalMeals * effectiveMealRate);
  const myBazarGiven = bazarTotals.byMember[user?.uid] || 0;
  const mealBalance = myBazarGiven - myConsumedAmount;

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="w-7 h-7 rounded-full border-2 border-gray-200 border-t-gray-900 animate-spin" />
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 w-full">
      <div className="p-2 sm:p-3 space-y-2 w-full">
        
        {/* Header */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center flex-shrink-0">
                <Utensils className="w-4 h-4 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-sm sm:text-base font-bold text-gray-900 truncate">My Meals</h1>
                <p className="text-[10px] text-gray-500 truncate">{monthName}</p>
              </div>
            </div>
            <Link href="/meals" className="flex items-center gap-1 px-2 py-1 bg-gray-100 rounded-md text-[10px] font-bold text-gray-600 hover:bg-gray-200 transition-colors flex-shrink-0 ml-2">
              Details <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-1.5">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3">
            <Utensils className="w-4 h-4 text-orange-500 mb-1" />
            <p className="text-lg font-extrabold text-gray-900">{myTotalMeals}</p>
            <p className="text-[9px] text-gray-500 font-semibold">Total Meals</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3">
            <DollarSign className="w-4 h-4 text-emerald-500 mb-1" />
            <p className="text-lg font-extrabold text-gray-900">৳{effectiveMealRate.toFixed(2)}</p>
            <p className="text-[9px] text-gray-500 font-semibold">Meal Rate</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3">
            <TrendingDown className="w-4 h-4 text-red-500 mb-1" />
            <p className="text-lg font-extrabold text-gray-900">৳{myConsumedAmount.toLocaleString()}</p>
            <p className="text-[9px] text-gray-500 font-semibold">Consumed</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3">
            <Users className="w-4 h-4 text-purple-500 mb-1" />
            <p className="text-lg font-extrabold text-gray-900">{myGuestMeals}</p>
            <p className="text-[9px] text-gray-500 font-semibold">Guest Meals</p>
          </div>
        </div>

        {/* Balance */}
        <div className={`rounded-xl shadow-sm border p-3 ${mealBalance >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-gray-500 uppercase">Meal Balance</p>
              <p className={`text-lg font-extrabold mt-0.5 truncate ${mealBalance >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                {mealBalance >= 0 ? `+৳${mealBalance.toLocaleString()}` : `৳${Math.abs(mealBalance).toLocaleString()}`}
              </p>
              <p className="text-[9px] font-medium text-gray-500">
                {mealBalance >= 0 ? 'Advance' : 'Due'}
              </p>
            </div>
            <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ml-2 ${mealBalance >= 0 ? 'bg-emerald-200' : 'bg-red-200'}`}>
              {mealBalance >= 0 ? <TrendingUp className="w-4.5 h-4.5 text-emerald-700" /> : <TrendingDown className="w-4.5 h-4.5 text-red-700" />}
            </div>
          </div>
        </div>

        {/* Today's Meal - Read Only */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Calendar className="w-3.5 h-3.5 text-orange-500 flex-shrink-0" />
            <h2 className="text-xs font-bold text-gray-900">Today</h2>
            <span className="text-[9px] text-gray-400 ml-auto">{today}</span>
          </div>
          <div className="grid grid-cols-3 gap-1.5 text-center">
            <div className="bg-orange-50 rounded-lg p-2">
              <p className="text-base font-extrabold text-orange-700">{todayMeal?.lunch || 0}</p>
              <p className="text-[8px] text-gray-500 font-semibold">Lunch</p>
            </div>
            <div className="bg-blue-50 rounded-lg p-2">
              <p className="text-base font-extrabold text-blue-700">{todayMeal?.dinner || 0}</p>
              <p className="text-[8px] text-gray-500 font-semibold">Dinner</p>
            </div>
            <div className="bg-purple-50 rounded-lg p-2">
              <p className="text-base font-extrabold text-purple-700">{todayMeal?.guestMeal || 0}</p>
              <p className="text-[8px] text-gray-500 font-semibold">Guest</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
