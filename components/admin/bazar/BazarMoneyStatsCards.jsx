import {
  CheckCircle2,
  Clock3,
  Landmark,
  ShoppingBasket,
  TrendingDown,
  TrendingUp,
  WalletCards,
} from 'lucide-react';

const MONEY_FORMATTER = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const COUNT_FORMATTER = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
});

const METRICS = [
  {
    key: 'currentMonthCollection',
    aliases: ['currentCollection', 'monthlyCollection', 'totalCollection', 'currentMonthDeposits', 'monthlyDeposits'],
    label: 'Current Month Collection',
    detail: 'Current deposits only',
    icon: WalletCards,
    money: true,
    cardClassName: 'bg-[#2563EB] text-white shadow-blue-700/20',
    detailClassName: 'text-blue-100',
  },
  {
    key: 'totalBazarExpense',
    aliases: ['totalExpenses', 'monthlyExpense', 'currentBazarCost'],
    label: 'Total Bazar Expense',
    detail: 'Current month spending',
    icon: ShoppingBasket,
    money: true,
    cardClassName: 'bg-[#EA580C] text-white shadow-orange-700/20',
    detailClassName: 'text-orange-100',
  },
  {
    key: 'remainingBazarBalance',
    aliases: ['remainingBalance', 'bazarBalance', 'runningBalance'],
    label: 'Remaining Bazar Balance',
    detail: 'Collection minus expense',
    icon: Landmark,
    money: true,
    cardClassName: 'bg-[#0891B2] text-white shadow-cyan-700/20',
    detailClassName: 'text-cyan-100',
  },
  {
    key: 'membersPaid',
    aliases: ['paidMembers', 'paid'],
    label: 'Members Paid',
    detail: 'Deposits received',
    icon: CheckCircle2,
    cardClassName: 'bg-[#16A34A] text-white shadow-green-700/20',
    detailClassName: 'text-green-100',
  },
  {
    key: 'membersDue',
    aliases: ['dueMembers', 'due'],
    label: 'Members Due',
    detail: 'Payment still pending',
    icon: Clock3,
    cardClassName: 'bg-[#D97706] text-white shadow-amber-700/20',
    detailClassName: 'text-amber-100',
  },
  {
    key: 'membersWithCredit',
    aliases: ['creditMembers', 'membersCredit', 'credit'],
    label: 'Members with Credit',
    detail: 'Positive personal balance',
    icon: TrendingUp,
    cardClassName: 'bg-[#7C3AED] text-white shadow-violet-700/20',
    detailClassName: 'text-violet-100',
  },
  {
    key: 'membersWithDebit',
    aliases: ['debitMembers', 'membersDebit', 'debit'],
    label: 'Members with Debit',
    detail: 'Negative personal balance',
    icon: TrendingDown,
    cardClassName: 'bg-[#DC2626] text-white shadow-red-700/20',
    detailClassName: 'text-red-100',
  },
];

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function metricValue(summary, metric) {
  const keys = [metric.key, ...(metric.aliases || [])];

  for (const key of keys) {
    const direct = summary?.[key];
    const nested = summary?.counts?.[key];
    const candidate = direct !== undefined ? direct : nested;

    if (candidate !== undefined) {
      return finiteNumber(
        candidate && typeof candidate === 'object' && !Array.isArray(candidate)
          ? candidate.value
          : candidate
      );
    }
  }

  return 0;
}

export function formatBazarMoney(value) {
  const amount = finiteNumber(value);
  const formatted = MONEY_FORMATTER.format(Math.abs(amount));
  return amount < 0 ? `-৳${formatted}` : `৳${formatted}`;
}

export default function BazarMoneyStatsCards({ summary = {}, className = '' }) {
  return (
    <section
      aria-label="Bazar money summary"
      className={`grid grid-cols-2 gap-3 md:grid-cols-4 2xl:grid-cols-7 ${className}`}
    >
      {METRICS.map((metric) => {
        const Icon = metric.icon;
        const value = metricValue(summary, metric);

        return (
          <article
            key={metric.key}
            className={`group relative isolate min-h-32 overflow-hidden rounded-2xl p-4 shadow-lg transition duration-200 hover:-translate-y-0.5 hover:shadow-xl motion-reduce:transform-none motion-reduce:transition-none ${metric.cardClassName}`}
          >
            <div
              aria-hidden="true"
              className="absolute -right-7 -top-8 h-24 w-24 rounded-full border-[16px] border-white/10 transition-transform duration-300 group-hover:scale-110 motion-reduce:transition-none"
            />

            <div className="relative flex h-full flex-col justify-between gap-4">
              <div className="flex items-start justify-between gap-2">
                <h2 className={`max-w-[9.5rem] text-[10px] font-extrabold uppercase leading-4 tracking-[0.1em] ${metric.detailClassName}`}>
                  {metric.label}
                </h2>
                <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-white/15 ring-1 ring-inset ring-white/20">
                  <Icon aria-hidden="true" className="h-4.5 w-4.5" strokeWidth={2.25} />
                </span>
              </div>

              <div>
                <p className="truncate text-xl font-black tracking-tight tabular-nums sm:text-2xl" title={metric.money ? formatBazarMoney(value) : COUNT_FORMATTER.format(value)}>
                  {metric.money ? formatBazarMoney(value) : COUNT_FORMATTER.format(value)}
                </p>
                <p className={`mt-1 truncate text-[10px] font-semibold ${metric.detailClassName}`} title={metric.detail}>
                  {metric.detail}
                </p>
              </div>
            </div>
          </article>
        );
      })}
    </section>
  );
}
