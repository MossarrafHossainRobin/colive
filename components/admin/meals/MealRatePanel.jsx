'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Calculator,
  CheckCircle2,
  Clock3,
  Equal,
  History,
  Loader2,
  Minus,
  Plus,
  ReceiptText,
  Save,
  ShieldCheck,
  ShoppingCart,
  Sigma,
  Utensils,
  WalletCards,
} from 'lucide-react';
import {
  calculateMealRateBreakdown,
  formatRate,
} from '@/lib/mealRate';
import { finiteNumber } from '@/lib/spreadsheet';
import {
  MetricCard,
  StatusPill,
  ToolbarButton,
} from '@/components/admin/ui/AdminUI';

function firstNumber(...values) {
  for (const value of values) {
    if (value === '' || value === null || value === undefined) continue;
    const number = finiteNumber(value, Number.NaN);
    if (Number.isFinite(number)) return number;
  }
  return 0;
}

function adjustmentValue(value) {
  if (Array.isArray(value)) {
    return value.reduce((sum, item) => sum + finiteNumber(item?.amount ?? item?.value), 0);
  }
  return finiteNumber(value);
}

function money(value, { signed = false, absolute = false } = {}) {
  const number = finiteNumber(value);
  const amount = absolute ? Math.abs(number) : number;
  const formatted = Math.abs(amount).toLocaleString('en-US', {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  });
  if (signed && number > 0) return `+৳${formatted}`;
  if (number < 0 && !absolute) return `−৳${formatted}`;
  return `৳${formatted}`;
}

function formatCount(value) {
  const number = finiteNumber(value);
  return number.toLocaleString('en-US', {
    minimumFractionDigits: Number.isInteger(number) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

function safeDate(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  if (Number.isFinite(value.seconds)) return new Date(value.seconds * 1000);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function activityDate(item) {
  const date = safeDate(item?.createdAt || item?.updatedAt || item?.timestamp || item?.publishedAt);
  if (!date) return 'Time unavailable';
  return date.toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function activityActor(item) {
  return (
    item?.actorName ||
    item?.createdByName ||
    item?.updatedByName ||
    item?.adminName ||
    item?.userName ||
    'Admin'
  );
}

function activityText(item) {
  return (
    item?.summary ||
    item?.label ||
    item?.description ||
    item?.action ||
    item?.type ||
    'Meal-rate configuration updated'
  );
}

function NumberField({ label, hint, value, onChange, signed = false, min }) {
  return (
    <label className="block rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
      <span className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-300">{label}</span>
        {signed && <StatusPill tone="blue">Signed</StatusPill>}
      </span>
      <span className="mt-2 flex h-10 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:focus-within:ring-blue-950">
        <span className="mr-2 text-sm font-bold text-slate-400">৳</span>
        <input
          type="number"
          inputMode="decimal"
          step="any"
          min={min}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="min-w-0 flex-1 appearance-none bg-transparent text-right text-sm font-bold tabular-nums text-slate-950 outline-none [MozAppearance:textfield] dark:text-white [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
      </span>
      <span className="mt-1.5 block text-[9px] leading-4 text-slate-400">{hint}</span>
    </label>
  );
}

function FormulaLine({ operator, label, detail, value, tone = 'slate', strong = false }) {
  const tones = {
    slate: 'text-slate-600 dark:text-slate-300',
    emerald: 'text-emerald-700 dark:text-emerald-300',
    amber: 'text-amber-700 dark:text-amber-300',
    rose: 'text-rose-700 dark:text-rose-300',
    blue: 'text-blue-700 dark:text-blue-300',
  };
  return (
    <div className={`grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2 border-b border-slate-100 px-3 py-2.5 last:border-b-0 dark:border-slate-800 ${strong ? 'bg-slate-50 dark:bg-slate-950' : ''}`}>
      <span className={`flex h-6 w-6 items-center justify-center rounded-md text-sm font-black ${
        operator === '+'
          ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300'
          : operator === '−'
            ? 'bg-rose-50 text-rose-600 dark:bg-rose-950 dark:text-rose-300'
            : operator === '÷'
              ? 'bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-300'
              : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300'
      }`}>{operator}</span>
      <span className="min-w-0">
        <span className={`block truncate text-xs ${strong ? 'font-bold' : 'font-semibold'} ${tones[tone] || tones.slate}`}>{label}</span>
        {detail && <span className="mt-0.5 block truncate text-[9px] text-slate-400">{detail}</span>}
      </span>
      <span className={`text-right text-sm font-black tabular-nums ${tones[tone] || tones.slate}`}>{value}</span>
    </div>
  );
}

export default function MealRatePanel({
  breakdown = {},
  config = {},
  onConfigChange,
  onPublish,
  activity = [],
  publishing = false,
}) {
  const bazarCost = firstNumber(
    breakdown.bazarCost,
    breakdown.totalBazar,
    breakdown.houseBazar,
    breakdown.house
  );
  const totalMeals = firstNumber(
    breakdown.totalMeals,
    breakdown.overallMeals,
    breakdown.mealCount
  );
  const externalPreviousBalance = firstNumber(config.previousBalance, breakdown.previousBalance);
  const externalOtherExpenses = firstNumber(config.otherExpenses, breakdown.otherExpenses);
  const externalAdjustments = config.adjustments !== undefined
    ? adjustmentValue(config.adjustments)
    : adjustmentValue(breakdown.adjustments);

  const [inputs, setInputs] = useState({
    previousBalance: String(externalPreviousBalance),
    otherExpenses: String(externalOtherExpenses),
    adjustments: String(externalAdjustments),
  });
  const [publishMessage, setPublishMessage] = useState(null);

  useEffect(() => {
    setInputs({
      previousBalance: String(externalPreviousBalance),
      otherExpenses: String(externalOtherExpenses),
      adjustments: String(externalAdjustments),
    });
  }, [externalAdjustments, externalOtherExpenses, externalPreviousBalance]);

  const calculation = useMemo(() => calculateMealRateBreakdown({
    bazarCost,
    totalMeals,
    previousBalance: finiteNumber(inputs.previousBalance),
    otherExpenses: Math.max(0, finiteNumber(inputs.otherExpenses)),
    adjustments: finiteNumber(inputs.adjustments),
  }), [bazarCost, inputs.adjustments, inputs.otherExpenses, inputs.previousBalance, totalMeals]);

  const publishedRate = firstNumber(
    breakdown.publishedMealRate,
    breakdown.canonicalMealRate,
    breakdown.published?.mealRate
  );
  const hasPublishedRate = [
    breakdown.publishedMealRate,
    breakdown.canonicalMealRate,
    breakdown.published?.mealRate,
  ].some((value) => value !== undefined && value !== null && value !== '');
  const rateDelta = hasPublishedRate ? Math.abs(publishedRate - calculation.mealRate) : 0;
  const explicitConsistency = breakdown.consistent ?? breakdown.isConsistent;
  const isConsistent = explicitConsistency !== undefined
    ? Boolean(explicitConsistency)
    : !hasPublishedRate || rateDelta < 0.005;
  const isInvalid = calculation.totalMeals <= 0 || calculation.totalCost < 0;
  const isDraft = Boolean(
    config.isDirty ||
    config.dirty ||
    String(config.status || breakdown.status || '').toLowerCase() === 'draft' ||
    (hasPublishedRate && rateDelta >= 0.005)
  );

  const status = calculation.totalMeals <= 0
    ? { label: 'Waiting for meals', tone: 'red', detail: 'A rate cannot be calculated until total meals is greater than zero.' }
    : calculation.totalCost < 0
      ? { label: 'Invalid total cost', tone: 'red', detail: 'Review the previous balance and signed adjustment values.' }
      : !isConsistent
        ? { label: 'Mismatch', tone: 'red', detail: 'The live calculation does not match the published system value.' }
        : isDraft
          ? { label: 'Unpublished changes', tone: 'amber', detail: 'The formula is live in this preview but has not been published.' }
          : hasPublishedRate
            ? { label: 'Consistent', tone: 'green', detail: 'The visible formula matches the published system value.' }
            : { label: 'Live preview', tone: 'blue', detail: 'Publish this calculation to make it the shared monthly value.' };

  const updateConfig = (field, rawValue) => {
    const nextInputs = { ...inputs, [field]: rawValue };
    setInputs(nextInputs);
    setPublishMessage(null);

    const nextConfig = {
      ...config,
      previousBalance: finiteNumber(nextInputs.previousBalance),
      otherExpenses: Math.max(0, finiteNumber(nextInputs.otherExpenses)),
      adjustments: finiteNumber(nextInputs.adjustments),
      isDirty: true,
    };
    const nextCalculation = calculateMealRateBreakdown({
      bazarCost,
      totalMeals,
      previousBalance: nextConfig.previousBalance,
      otherExpenses: nextConfig.otherExpenses,
      adjustments: nextConfig.adjustments,
    });
    onConfigChange?.(nextConfig, nextCalculation);
  };

  const handlePublish = async () => {
    if (isInvalid || publishing || !onPublish) return;
    setPublishMessage(null);
    try {
      await onPublish(calculation, {
        ...config,
        previousBalance: calculation.previousBalance,
        otherExpenses: calculation.otherExpenses,
        adjustments: calculation.adjustments,
      });
      setPublishMessage({ tone: 'green', text: 'Meal-rate calculation published.' });
    } catch (error) {
      setPublishMessage({ tone: 'red', text: error?.message || 'Meal rate could not be published.' });
    }
  };

  const previousOperator = calculation.previousBalance >= 0 ? '−' : '+';
  const adjustmentOperator = calculation.adjustments >= 0 ? '+' : '−';
  const sourceUpdatedAt = safeDate(
    breakdown.calculatedAt || breakdown.updatedAt || breakdown.sourceUpdatedAt
  );
  const sourceDetails = [
    { label: 'Bazar entries', value: firstNumber(breakdown.bazarEntryCount, breakdown.bazarCount, breakdown.sources?.bazarEntries) },
    { label: 'Meal entries', value: firstNumber(breakdown.mealEntryCount, breakdown.entryCount, breakdown.sources?.mealEntries) },
    { label: 'Members', value: firstNumber(breakdown.memberCount, breakdown.activeMembers, breakdown.sources?.members) },
    { label: 'Excluded bazar', value: money(firstNumber(breakdown.excludedBazar, breakdown.excludedHouse, breakdown.sources?.excludedBazar)) },
  ];

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <header className="border-b border-slate-200 px-4 py-4 dark:border-slate-800 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-300">
              <Calculator className="h-4.5 w-4.5" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-bold text-slate-950 dark:text-white">Transparent meal-rate calculation</h2>
                <StatusPill tone={status.tone}>{status.label}</StatusPill>
              </div>
              <p className="mt-1 max-w-2xl text-[11px] leading-5 text-slate-500 dark:text-slate-400">Every input, operator, source total, and result is visible. No notification is sent when these values change.</p>
            </div>
          </div>

          <ToolbarButton icon={publishing ? Loader2 : Save} onClick={handlePublish} disabled={publishing || isInvalid || !onPublish} className="h-9 self-start border-violet-600 bg-violet-600 px-4 text-white hover:bg-violet-700 hover:text-white dark:border-violet-500 dark:bg-violet-600">
            {publishing ? 'Publishing…' : 'Publish shared rate'}
          </ToolbarButton>
        </div>

        {(publishMessage || status.tone === 'red') && (
          <div className={`mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-[11px] font-semibold ${
            (publishMessage?.tone || status.tone) === 'red'
              ? 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
              : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
          }`}>
            {(publishMessage?.tone || status.tone) === 'red' ? <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none" /> : <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-none" />}
            <span>{publishMessage?.text || status.detail}</span>
          </div>
        )}
      </header>

      <div className="grid gap-4 p-4 sm:p-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <div className="min-w-0 space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <MetricCard label="Total Bazar" value={money(calculation.bazarCost)} detail="Live active Bazar source" icon={ShoppingCart} tone="emerald" />
            <MetricCard label="Total meals" value={formatCount(calculation.totalMeals)} detail="Lunch + dinner + guest" icon={Utensils} tone="amber" />
            <MetricCard label="Total cost" value={money(calculation.totalCost)} detail="After all visible components" icon={WalletCards} tone={calculation.totalCost < 0 ? 'rose' : 'slate'} />
            <MetricCard label="Meal rate" value={`৳${formatRate(calculation.mealRate)}`} detail="Same value for every member" icon={Sigma} tone="violet" />
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-950">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-300">Calculation steps</p>
                <p className="mt-0.5 text-[9px] text-slate-400">Operators below are the operators actually applied.</p>
              </div>
              <StatusPill tone="blue">{calculation.formulaVersion}</StatusPill>
            </div>

            <FormulaLine operator="A" label="Total Bazar cost" detail="Derived from active, included Bazar rows" value={money(calculation.bazarCost)} tone="emerald" />
            <FormulaLine operator={previousOperator} label="Previous balance" detail={calculation.previousBalance >= 0 ? 'Positive balance is deducted from cost' : 'Negative balance increases cost'} value={money(calculation.previousBalance, { absolute: true })} tone={previousOperator === '−' ? 'rose' : 'emerald'} />
            <FormulaLine operator="+" label="Other expenses" detail="Explicit monthly expense input" value={money(calculation.otherExpenses)} tone="amber" />
            <FormulaLine operator={adjustmentOperator} label="Signed adjustments" detail="Positive adds cost; negative reduces cost" value={money(calculation.adjustments, { absolute: true })} tone={adjustmentOperator === '+' ? 'amber' : 'emerald'} />
            <FormulaLine operator="=" label="Total cost" detail="Numerator used by the rate" value={money(calculation.totalCost)} tone={calculation.totalCost < 0 ? 'rose' : 'slate'} strong />
            <FormulaLine operator="÷" label="Total meals" detail="Denominator: lunch + dinner + guest meals" value={formatCount(calculation.totalMeals)} tone="blue" />
            <FormulaLine operator="=" label="Meal rate" detail="Total cost ÷ total meals" value={`৳${formatRate(calculation.mealRate)}/meal`} tone="emerald" strong />
          </div>

          <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3 dark:border-blue-900 dark:bg-blue-950/30">
            <div className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 flex-none text-blue-600 dark:text-blue-300" />
              <div>
                <p className="text-[11px] font-bold text-blue-900 dark:text-blue-100">Exact formula</p>
                <p className="mt-1 text-[10px] leading-5 text-blue-700 dark:text-blue-300">{calculation.formula}</p>
                <p className="mt-1 font-mono text-[10px] leading-5 text-blue-900 dark:text-blue-100">
                  ({money(calculation.bazarCost)} {previousOperator} {money(calculation.previousBalance, { absolute: true })} + {money(calculation.otherExpenses)} {adjustmentOperator} {money(calculation.adjustments, { absolute: true })}) ÷ {formatCount(calculation.totalMeals)} = ৳{formatRate(calculation.mealRate)}
                </p>
              </div>
            </div>
          </div>
        </div>

        <aside className="min-w-0 space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-300">Editable inputs</p>
                <p className="mt-0.5 text-[9px] text-slate-400">Results update immediately.</p>
              </div>
              <StatusPill tone="amber">Draft</StatusPill>
            </div>
            <div className="space-y-2">
              <NumberField label="Previous balance" hint="Positive values are subtracted. Use a negative value for a carried loss." value={inputs.previousBalance} onChange={(value) => updateConfig('previousBalance', value)} signed />
              <NumberField label="Other expenses" hint="Additional meal-related costs outside the Bazar ledger." value={inputs.otherExpenses} onChange={(value) => updateConfig('otherExpenses', value)} min="0" />
              <NumberField label="Adjustments" hint="Positive adds to total cost; negative reduces it." value={inputs.adjustments} onChange={(value) => updateConfig('adjustments', value)} signed />
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-950">
              <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-300"><ReceiptText className="h-3.5 w-3.5" /> Source totals</span>
              <StatusPill tone={isConsistent ? 'green' : 'red'}>{isConsistent ? 'Checked' : 'Review'}</StatusPill>
            </div>
            <div className="grid grid-cols-2 gap-px bg-slate-200 dark:bg-slate-800">
              {sourceDetails.map((item) => (
                <div key={item.label} className="bg-white px-3 py-2.5 dark:bg-slate-900">
                  <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{item.label}</p>
                  <p className="mt-1 text-xs font-bold text-slate-900 dark:text-white">{item.value}</p>
                </div>
              ))}
            </div>
            <div className="flex items-start gap-2 border-t border-slate-200 px-3 py-2.5 dark:border-slate-800">
              <Clock3 className="mt-0.5 h-3.5 w-3.5 flex-none text-slate-400" />
              <p className="text-[10px] leading-4 text-slate-500 dark:text-slate-400">
                {sourceUpdatedAt ? `Sources last calculated ${sourceUpdatedAt.toLocaleString('en-US')}.` : 'Source timestamp is not available.'}
                {hasPublishedRate && ` Published rate: ৳${formatRate(publishedRate)}. Difference: ৳${formatRate(rateDelta)}.`}
              </p>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-950">
              <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-300"><History className="h-3.5 w-3.5" /> Audit timeline</span>
              <span className="text-[9px] font-semibold text-slate-400">{activity.length} event{activity.length === 1 ? '' : 's'}</span>
            </div>
            <div className="max-h-72 overflow-y-auto">
              {activity.length ? activity.slice(0, 20).map((item, index) => (
                <div key={item.id || `${activityText(item)}-${index}`} className="relative flex gap-3 border-b border-slate-100 px-3 py-3 last:border-b-0 dark:border-slate-800">
                  <span className="relative z-10 flex h-7 w-7 flex-none items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                    {String(item?.type || item?.action || '').includes('publish') ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Activity className="h-3.5 w-3.5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold leading-4 text-slate-700 dark:text-slate-200">{activityText(item)}</p>
                    <p className="mt-1 text-[9px] text-slate-400">{activityActor(item)} · {activityDate(item)}</p>
                    {item?.formulaVersion && <div className="mt-1.5"><StatusPill tone="blue">{item.formulaVersion}</StatusPill></div>}
                  </div>
                </div>
              )) : (
                <div className="flex min-h-32 flex-col items-center justify-center px-4 text-center">
                  <History className="h-5 w-5 text-slate-300" />
                  <p className="mt-2 text-[11px] font-semibold text-slate-500">No calculation activity yet</p>
                  <p className="mt-1 text-[9px] text-slate-400">Published versions and configuration changes will appear here.</p>
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>

      <footer className="flex flex-col gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex items-center gap-2">
          {status.tone === 'green' ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : status.tone === 'red' ? <AlertTriangle className="h-4 w-4 text-rose-500" /> : <Activity className="h-4 w-4 text-blue-500" />}
          <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">{status.detail}</span>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 dark:text-slate-300">
          <span className="flex items-center gap-1"><Minus className="h-3 w-3 text-rose-500" /> Previous balance</span>
          <span className="flex items-center gap-1"><Plus className="h-3 w-3 text-emerald-500" /> Costs</span>
          <span className="flex items-center gap-1"><Equal className="h-3 w-3 text-blue-500" /> Shared rate</span>
        </div>
      </footer>
    </section>
  );
}
