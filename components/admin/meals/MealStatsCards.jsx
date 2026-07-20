'use client';

import { useEffect, useMemo } from 'react';
import {
  CalendarDays,
  CircleDollarSign,
  ReceiptText,
  Sigma,
  UsersRound,
  WalletCards,
} from 'lucide-react';
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from 'framer-motion';

const METRICS = [
  {
    key: 'totalMeals',
    label: 'Total meals',
    detail: 'Recorded this month',
    icon: Sigma,
    className: 'bg-[#2563EB] text-white shadow-blue-600/20',
    mutedClassName: 'text-blue-100',
    iconClassName: 'bg-white/15 text-white ring-white/20',
    maximumFractionDigits: 2,
  },
  {
    key: 'todayMeals',
    aliases: ['todaysMeals'],
    label: "Today's meals",
    detail: 'Live daily total',
    icon: CalendarDays,
    className: 'bg-[#16A34A] text-white shadow-green-600/20',
    mutedClassName: 'text-green-100',
    iconClassName: 'bg-white/15 text-white ring-white/20',
    maximumFractionDigits: 2,
  },
  {
    key: 'mealRate',
    label: 'Meal rate',
    detail: 'Current rate per meal',
    icon: CircleDollarSign,
    className: 'bg-[#7C3AED] text-white shadow-violet-700/20',
    mutedClassName: 'text-violet-100',
    iconClassName: 'bg-white/15 text-white ring-white/20',
    prefix: '৳',
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  },
  {
    key: 'pendingBills',
    label: 'Pending bills',
    detail: 'Awaiting settlement',
    icon: ReceiptText,
    className: 'bg-[#DC2626] text-white shadow-red-700/20',
    mutedClassName: 'text-red-100',
    iconClassName: 'bg-white/15 text-white ring-white/20',
    maximumFractionDigits: 0,
  },
  {
    key: 'activeMembers',
    label: 'Active members',
    detail: 'Currently participating',
    icon: UsersRound,
    className: 'bg-[#0891B2] text-white shadow-cyan-700/20',
    mutedClassName: 'text-cyan-100',
    iconClassName: 'bg-white/15 text-white ring-white/20',
    maximumFractionDigits: 0,
  },
  {
    key: 'monthlyExpense',
    label: 'Monthly expense',
    detail: 'Current tracked spend',
    icon: WalletCards,
    className: 'bg-[#F59E0B] text-slate-950 shadow-amber-600/20',
    mutedClassName: 'text-amber-950/75',
    iconClassName: 'bg-slate-950/10 text-slate-950 ring-slate-950/15',
    prefix: '৳',
    maximumFractionDigits: 0,
  },
];

function finiteValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function metricValue(stats, metric) {
  const keys = [metric.key, ...(metric.aliases || [])];
  const source = keys.reduce((result, key) => (
    result === undefined && stats?.[key] !== undefined ? stats[key] : result
  ), undefined);
  const entry = source && typeof source === 'object' && !Array.isArray(source)
    ? source
    : { value: source };

  return {
    value: finiteValue(entry.value),
    detail: entry.detail || stats?.details?.[metric.key] || metric.detail,
    prefix: entry.prefix ?? metric.prefix ?? '',
    suffix: entry.suffix ?? metric.suffix ?? '',
    minimumFractionDigits: entry.minimumFractionDigits ?? metric.minimumFractionDigits ?? 0,
    maximumFractionDigits: entry.maximumFractionDigits ?? metric.maximumFractionDigits ?? 0,
  };
}

function AnimatedNumber({
  value,
  prefix = '',
  suffix = '',
  minimumFractionDigits = 0,
  maximumFractionDigits = 0,
}) {
  const reduceMotion = useReducedMotion();
  const animatedValue = useMotionValue(reduceMotion ? value : 0);
  const formatter = useMemo(() => new Intl.NumberFormat('en-US', {
    minimumFractionDigits,
    maximumFractionDigits,
  }), [maximumFractionDigits, minimumFractionDigits]);
  const displayValue = useTransform(
    animatedValue,
    (latest) => `${prefix}${formatter.format(latest)}${suffix}`
  );
  const accessibleValue = `${prefix}${formatter.format(value)}${suffix}`;

  useEffect(() => {
    if (reduceMotion) {
      animatedValue.set(value);
      return undefined;
    }

    const controls = animate(animatedValue, value, {
      duration: 0.75,
      ease: [0.22, 1, 0.36, 1],
    });
    return () => controls.stop();
  }, [animatedValue, reduceMotion, value]);

  return (
    <>
      <motion.span aria-hidden="true">{displayValue}</motion.span>
      <span className="sr-only">{accessibleValue}</span>
    </>
  );
}

export default function MealStatsCards({ stats = {}, className = '' }) {
  const reduceMotion = useReducedMotion();

  return (
    <section
      aria-label="Meal management statistics"
      className={`grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6 ${className}`}
    >
      {METRICS.map((metric, index) => {
        const Icon = metric.icon;
        const resolved = metricValue(stats, metric);

        return (
          <motion.article
            key={metric.key}
            initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{
              duration: reduceMotion ? 0 : 0.35,
              delay: reduceMotion ? 0 : index * 0.045,
              ease: [0.22, 1, 0.36, 1],
            }}
            whileHover={reduceMotion ? undefined : { y: -3, scale: 1.015 }}
            className={`relative isolate min-h-36 overflow-hidden rounded-2xl p-4 shadow-lg ${metric.className}`}
          >
            <div aria-hidden="true" className="absolute -right-8 -top-10 h-28 w-28 rounded-full border-[18px] border-white/10" />
            <div className="relative flex h-full flex-col justify-between gap-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className={`truncate text-[11px] font-bold uppercase tracking-[0.12em] ${metric.mutedClassName}`}>
                    {metric.label}
                  </h2>
                  <p className="mt-2 text-2xl font-black tracking-tight tabular-nums sm:text-[1.7rem]">
                    <AnimatedNumber {...resolved} />
                  </p>
                </div>
                <span className={`flex h-11 w-11 flex-none items-center justify-center rounded-xl ring-1 ${metric.iconClassName}`}>
                  <Icon aria-hidden="true" className="h-5 w-5" strokeWidth={2.25} />
                </span>
              </div>
              <p className={`truncate text-xs font-semibold ${metric.mutedClassName}`} title={resolved.detail}>
                {resolved.detail}
              </p>
            </div>
          </motion.article>
        );
      })}
    </section>
  );
}
