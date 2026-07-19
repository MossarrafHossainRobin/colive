'use client'

import { Flame, DollarSign, ShoppingCart, Trophy, TrendingUp, TrendingDown } from 'lucide-react';

export default function MealStats({ meals, users, bazarTotal, selectedMonth, userBazarPayments = {} }) {
  const monthlyMeals = meals.filter(m => m.month === selectedMonth);
  
  let totalMeals = 0;
  const userStats = {};
  monthlyMeals.forEach(m => {
    const c =
      (Number(m.lunch) || 0) +
      (Number(m.dinner) || 0) +
      (Number(m.guestMeal) || 0);
    totalMeals += c;
    if (!userStats[m.userId]) userStats[m.userId] = 0;
    userStats[m.userId] += c;
  });

  const mealRate = totalMeals > 0 ? (bazarTotal / totalMeals) : 0;
  const activeEaters = users.filter(u => isMemberAccountActive(u) && (userStats[u.id] || 0) > 0);
  const maxMeals = Math.max(...activeEaters.map(u => userStats[u.id] || 0), 0);
  const topEaters = activeEaters.filter(u => (userStats[u.id] || 0) === maxMeals);
  const minMeals = Math.min(...activeEaters.map(u => userStats[u.id] || 0), Infinity);
  const lowEaters = activeEaters.filter(u => (userStats[u.id] || 0) === minMeals && minMeals > 0);

  const bazarVals = Object.entries(userBazarPayments).filter(([_, v]) => v > 0);
  const maxBazar = bazarVals.length > 0 ? Math.max(...bazarVals.map(([_, v]) => v)) : 0;
  const topBazarUsers = users.filter(u => (userBazarPayments[u.id] || 0) === maxBazar && maxBazar > 0);
  const minBazar = bazarVals.length > 0 ? Math.min(...bazarVals.map(([_, v]) => v)) : 0;
  const lowBazarUsers = users.filter(u => (userBazarPayments[u.id] || 0) === minBazar && minBazar > 0);

  const cards = [
    { label: 'Total Meals', value: totalMeals, sub: `${monthlyMeals.length} entries`, icon: Flame, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
    { label: 'Meal Rate', value: `৳${mealRate.toFixed(2)}`, sub: 'per meal', icon: DollarSign, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
    { label: 'Total Bazar', value: `৳${bazarTotal.toLocaleString()}`, sub: `${bazarVals.length} contributors`, icon: ShoppingCart, color: 'text-violet-600', bg: 'bg-violet-50', border: 'border-violet-200' },
    { label: 'Top Eater', value: topEaters.map(u => u.name).join(', '), sub: maxMeals > 0 ? `${maxMeals} meals` : '—', icon: Trophy, color: 'text-rose-600', bg: 'bg-rose-50', border: 'border-rose-200' },
    { label: 'Highest Bazar', value: topBazarUsers.map(u => u.name).join(', '), sub: maxBazar > 0 ? `৳${maxBazar.toLocaleString()}` : '—', icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
    { label: 'Lowest Bazar', value: lowBazarUsers.map(u => u.name).join(', '), sub: minBazar > 0 ? `৳${minBazar.toLocaleString()}` : '—', icon: TrendingDown, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
      {cards.map((card, i) => (
        <div key={i} className={`${card.bg} ${card.border} rounded-xl sm:rounded-2xl p-2.5 sm:p-4 border shadow-sm hover:shadow-md transition-all`}>
          <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
            <card.icon className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${card.color}`} />
            <span className="text-[9px] sm:text-[10px] font-bold text-gray-400 uppercase tracking-wider truncate">{card.label}</span>
          </div>
          <p className={`text-sm sm:text-base lg:text-lg font-black ${card.color} truncate`}>{card.value}</p>
          <p className="text-[8px] sm:text-[10px] text-gray-400 mt-0.5 truncate">{card.sub}</p>
        </div>
      ))}
    </div>
  );
}
import { isMemberAccountActive } from '@/lib/memberPolicy';
