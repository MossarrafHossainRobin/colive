'use client';

import { CalendarDays } from 'lucide-react';
import { generateMonthOptions, MONTH_NAMES } from '@/lib/billCalculations';

const YEARS = [2026, 2027, 2028, 2029, 2030];

export default function MonthSelector({ value, onChange }) {
  const [year = '2026', month = '01'] = value.split('-');
  const quickMonths = generateMonthOptions(Number(year), Number(year));

  return (
    <section className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <CalendarDays className="w-4 h-4 text-green-600" />
        <p className="text-xs font-extrabold text-gray-700 uppercase tracking-wide">Select billing month</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="sr-only">Year</span>
          <select
            value={year}
            onChange={(event) => onChange(`${event.target.value}-${month}`)}
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-green-500"
          >
            {YEARS.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="sr-only">Month</span>
          <select
            value={month}
            onChange={(event) => onChange(`${year}-${event.target.value}`)}
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-green-500"
          >
            {MONTH_NAMES.map((name, index) => {
              const monthValue = String(index + 1).padStart(2, '0');
              return <option key={monthValue} value={monthValue}>{name}</option>;
            })}
          </select>
        </label>
      </div>

      <div className="mt-3 flex gap-1 overflow-x-auto pb-1" aria-label="Quick month selector">
        {quickMonths.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-bold transition ${
              value === option.value
                ? 'bg-green-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {option.shortLabel}
          </button>
        ))}
      </div>
    </section>
  );
}