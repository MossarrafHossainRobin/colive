'use client';

import { AlertCircle, CheckCircle, DollarSign, Home, TrendingUp, Zap } from 'lucide-react';

const cards = [
  { key: 'totalPayable', label: 'Total Payable', icon: DollarSign, className: 'text-gray-900' },
  { key: 'totalRent', label: 'Rent', icon: Home, className: 'text-blue-700' },
  { key: 'totalUtility', label: 'Utility', icon: Zap, className: 'text-amber-700' },
  { key: 'totalPaid', label: 'Paid', icon: CheckCircle, className: 'text-green-700' },
  { key: 'totalDue', label: 'Due', icon: AlertCircle, className: 'text-red-700' },
  { key: 'totalAdvance', label: 'Advance', icon: TrendingUp, className: 'text-emerald-700' },
];

export default function BillSummaryCards({ summary }) {
  return (
    <section className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
      {cards.map((card) => {
        const Icon = card.icon;
        const value = Math.ceil(summary?.[card.key] || 0);

        return (
          <div key={card.key} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <Icon className={`w-4 h-4 ${card.className}`} />
              <span className="text-[10px] font-extrabold text-gray-500 uppercase tracking-wide">{card.label}</span>
            </div>
            <p className={`text-xl font-black ${card.className}`}>৳{value.toLocaleString()}</p>
          </div>
        );
      })}
    </section>
  );
}