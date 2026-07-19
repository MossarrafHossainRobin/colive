'use client';

import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BarChart3 } from 'lucide-react';
import { EmptyState } from '@/components/admin/ui/AdminUI';

const COLORS = ['#0f766e', '#2563eb', '#7c3aed', '#d97706', '#dc2626', '#0891b2', '#4f46e5'];

function money(value) {
  return `৳${Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function ChartCard({ title, subtitle, children, className = '' }) {
  return (
    <article className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 ${className}`}>
      <h3 className="text-xs font-bold text-slate-900 dark:text-white">{title}</h3>
      <p className="mt-0.5 text-[10px] text-slate-400">{subtitle}</p>
      <div className="mt-4 h-64">{children}</div>
    </article>
  );
}

export default function BazarAnalytics({ rows = [], members = [], month }) {
  const analytics = useMemo(() => {
    const allActive = rows.filter((row) => !row.isDeleted && row.countInBazar !== false);
    const active = allActive.filter((row) => !month || String(row.month || String(row.date || '').slice(0, 7)) === month);
    const memberMap = new Map(members.map((member) => [member.id, member.displayName || member.name || member.email || 'Member']));
    const dailyMap = new Map();
    const categoryMap = new Map();
    const memberTotals = new Map();
    const monthlyMap = new Map();

    allActive.forEach((row) => {
      const rowMonth = String(row.month || String(row.date || '').slice(0, 7));
      if (!rowMonth) return;
      monthlyMap.set(rowMonth, (monthlyMap.get(rowMonth) || 0) + Number(row.amount || 0));
    });

    active.forEach((row) => {
      const amount = Number(row.amount || 0);
      dailyMap.set(row.date, (dailyMap.get(row.date) || 0) + amount);
      const category = row.category || 'Uncategorized';
      categoryMap.set(category, (categoryMap.get(category) || 0) + amount);
      const paidById = row.paidById || row.userId || row.memberId || '';
      const name = row.paidByName || memberMap.get(paidById) || 'Unknown';
      memberTotals.set(name, (memberTotals.get(name) || 0) + amount);
    });

    const sortedDays = [...dailyMap.entries()].sort(([a], [b]) => a.localeCompare(b));
    const daily = sortedDays.map(([date, amount], index) => ({
      date: date.slice(8),
      fullDate: date,
      amount,
      cumulative: sortedDays
        .slice(0, index + 1)
        .reduce((total, [, dayAmount]) => total + dayAmount, 0),
    }));
    const categories = [...categoryMap.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    const contributions = [...memberTotals.entries()].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount).slice(0, 10);
    const weeks = [1, 2, 3, 4, 5].map((week) => ({ week: `W${week}`, amount: 0 }));
    daily.forEach((item) => {
      const day = Number(item.fullDate.slice(8));
      weeks[Math.min(4, Math.floor((day - 1) / 7))].amount += item.amount;
    });

    const monthly = [...monthlyMap.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([monthId, amount]) => ({ month: monthId, amount }));

    return { daily, categories, contributions, weeks, monthly };
  }, [rows, members, month]);

  if (!analytics.daily.length) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <EmptyState icon={BarChart3} title="No analytics for this month" description={`Add counted Bazar entries in ${month} to generate expense trends and contribution charts.`} />
      </section>
    );
  }

  const tooltipStyle = { borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 11 };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ChartCard title="Daily expense trend" subtitle={`${month} expense and cumulative cost`} className="lg:col-span-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={analytics.daily} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
            <defs>
              <linearGradient id="dailyExpense" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#0f766e" stopOpacity={0.28} /><stop offset="95%" stopColor="#0f766e" stopOpacity={0} /></linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(value) => `${Math.round(value / 1000)}k`} />
            <Tooltip contentStyle={tooltipStyle} formatter={(value) => money(value)} labelFormatter={(_, payload) => payload?.[0]?.payload?.fullDate || ''} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Area name="Daily expense" type="monotone" dataKey="amount" stroke="#0f766e" fill="url(#dailyExpense)" strokeWidth={2} />
            <Area name="Monthly cumulative" type="monotone" dataKey="cumulative" stroke="#2563eb" fill="transparent" strokeWidth={2} strokeDasharray="4 4" />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Category breakdown" subtitle="Where this month's money went">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={analytics.categories} dataKey="value" nameKey="name" innerRadius={52} outerRadius={82} paddingAngle={2}>
              {analytics.categories.map((item, index) => <Cell key={item.name} fill={COLORS[index % COLORS.length]} />)}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} formatter={(value) => money(value)} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
          </PieChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Member contribution" subtitle="Top members by paid Bazar amount">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={analytics.contributions} layout="vertical" margin={{ left: 8, right: 12 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(value) => `${Math.round(value / 1000)}k`} />
            <YAxis type="category" dataKey="name" width={82} tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={tooltipStyle} formatter={(value) => money(value)} />
            <Bar dataKey="amount" name="Contribution" fill="#2563eb" radius={[0, 5, 5, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Monthly expense" subtitle="Six-month counted expense trend" className="lg:col-span-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={analytics.monthly} margin={{ left: 4, right: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(value) => `${Math.round(value / 1000)}k`} />
            <Tooltip contentStyle={tooltipStyle} formatter={(value) => money(value)} />
            <Bar dataKey="amount" name="Monthly expense" fill="#0f766e" radius={[5, 5, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Expense comparison" subtitle="Calendar-week spending pattern" className="lg:col-span-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={analytics.weeks} margin={{ left: 4, right: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="week" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(value) => `${Math.round(value / 1000)}k`} />
            <Tooltip contentStyle={tooltipStyle} formatter={(value) => money(value)} />
            <Bar dataKey="amount" name="Expense" fill="#7c3aed" radius={[5, 5, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}
