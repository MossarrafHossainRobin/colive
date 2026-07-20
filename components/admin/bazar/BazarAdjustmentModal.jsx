'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  BadgeDollarSign,
  Check,
  CircleDollarSign,
  Info,
  Loader2,
  Search,
  UserRound,
  WalletCards,
  X,
} from 'lucide-react';

const REASONS = ['Late Payment', 'Refund', 'Correction', 'Manual Adjustment'];

const focusableSelector = [
  'button:not([disabled])',
  'input:not([disabled])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  '[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function memberId(member) {
  return String(member?.id || member?.uid || member?.userId || member?.memberId || '').trim();
}

function memberName(member) {
  return String(
    member?.displayName || member?.name || member?.fullName || member?.email || 'Member'
  ).trim();
}

function memberInitial(member) {
  return memberName(member).charAt(0).toUpperCase() || 'M';
}

function toEnglishDigits(value) {
  return String(value ?? '')
    .replace(/[০-৯]/g, (digit) => String(digit.charCodeAt(0) - 0x09e6))
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660));
}

function parseAmount(value) {
  const normalized = toEnglishDigits(value)
    .replace(/,/g, '')
    .replace(/[৳\s]/g, '')
    .trim();

  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(normalized)) return Number.NaN;

  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : Number.NaN;
}

function firstNumber(source, keys, fallback = 0) {
  for (const key of keys) {
    const value = key.split('.').reduce((current, segment) => current?.[segment], source);
    if (value === '' || value === null || value === undefined || typeof value === 'boolean') continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }

  return fallback;
}

function balanceSnapshot(member) {
  const previous = firstNumber(member, [
    'previousBalance',
    'previousMonthBalance',
    'balances.previousBalance',
    'bazar.previousBalance',
  ]);
  const previousMealDue = firstNumber(member, [
    'previousBalance',
    'previousMealDue',
    'previousDue',
    'previousAdvance',
    'carryForward',
    'balances.previousBalance',
    'bazar.previousBalance',
  ], previous);
  const currentDeposit = firstNumber(member, [
    'currentDeposit',
    'currentMonthDeposit',
    'deposit',
    'balances.currentDeposit',
    'bazar.currentDeposit',
  ]);
  const adjustment = firstNumber(member, [
    'adjustment',
    'adjustments',
    'balanceAdjustment',
    'balances.adjustment',
    'bazar.adjustment',
  ]);

  return {
    previous,
    previousMealDue,
    currentDeposit,
    adjustment,
    available: previousMealDue + currentDeposit + adjustment,
  };
}

function formatMoney(value, { signed = false } = {}) {
  const amount = Number(value) || 0;
  const absolute = Math.abs(amount).toLocaleString('en-BD', {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  });

  if (amount < 0) return `−৳${absolute}`;
  if (signed && amount > 0) return `+৳${absolute}`;
  return `৳${absolute}`;
}

function FormulaItem({ label, value, color, emphasized = false }) {
  return (
    <div
      className={`rounded-xl border px-3 py-2.5 ${
        emphasized
          ? 'border-[#0891B2] bg-[#0891B2] text-white shadow-sm'
          : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'
      }`}
    >
      <p
        className={`text-[9px] font-bold uppercase tracking-[0.1em] ${
          emphasized ? 'text-cyan-50' : 'text-slate-400'
        }`}
      >
        {label}
      </p>
      <p
        className={`mt-1 text-sm font-black tabular-nums ${emphasized ? 'text-white' : ''}`}
        style={emphasized ? undefined : { color }}
      >
        {formatMoney(value, { signed: label !== 'Current deposit' })}
      </p>
    </div>
  );
}

export default function BazarAdjustmentModal({
  open,
  onClose,
  members = [],
  initialMemberId = '',
  onSubmit,
  saving = false,
  mode = 'adjustment',
}) {
  const titleId = useId();
  const descriptionId = useId();
  const memberErrorId = useId();
  const amountErrorId = useId();
  const reasonErrorId = useId();
  const dialogRef = useRef(null);
  const searchRef = useRef(null);
  const submitLockRef = useRef(false);
  const [search, setSearch] = useState('');
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [reason, setReason] = useState('');
  const [remarks, setRemarks] = useState('');
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const isDeposit = mode === 'deposit';
  const busy = saving || submitting;
  const accent = isDeposit ? '#2563EB' : '#EA580C';

  const normalizedMembers = useMemo(
    () => members.filter((member) => memberId(member)),
    [members]
  );

  const selectedMember = useMemo(
    () => normalizedMembers.find((member) => memberId(member) === selectedMemberId) || null,
    [normalizedMembers, selectedMemberId]
  );

  const filteredMembers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return normalizedMembers;

    return normalizedMembers.filter((member) => {
      const searchable = [
        memberName(member),
        member?.email,
        member?.room,
        member?.phone,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return searchable.includes(query);
    });
  }, [normalizedMembers, search]);

  const parsedAmount = parseAmount(amountInput);
  const memberError = attempted && !selectedMember ? 'Select a member to continue.' : '';
  const amountError = attempted && (
    !Number.isFinite(parsedAmount)
      ? 'Enter a valid amount.'
      : isDeposit && parsedAmount <= 0
        ? 'Deposit must be greater than zero.'
        : !isDeposit && parsedAmount === 0
          ? 'Adjustment cannot be zero.'
          : ''
  );
  const reasonError = attempted && !reason.trim() ? 'A reason is required for history.' : '';
  const valid = Boolean(
    selectedMember &&
    Number.isFinite(parsedAmount) &&
    (isDeposit ? parsedAmount > 0 : parsedAmount !== 0) &&
    reason.trim()
  );

  const snapshot = useMemo(
    () => balanceSnapshot(selectedMember || {}),
    [selectedMember]
  );
  const nextDeposit = snapshot.currentDeposit + (isDeposit && Number.isFinite(parsedAmount) ? parsedAmount : 0);
  const nextAdjustment = snapshot.adjustment + (!isDeposit && Number.isFinite(parsedAmount) ? parsedAmount : 0);
  const nextAvailable = snapshot.previousMealDue + nextDeposit + nextAdjustment;
  const impact = nextAvailable - snapshot.available;

  const requestClose = useCallback(() => {
    if (!busy) onClose?.();
  }, [busy, onClose]);

  useEffect(() => {
    if (!open) return undefined;

    setSearch('');
    setSelectedMemberId(String(initialMemberId || '').trim());
    setAmountInput('');
    setReason('');
    setRemarks('');
    setAttempted(false);
    setSubmitting(false);
    setSubmitError('');
    submitLockRef.current = false;

    const previouslyFocused = document.activeElement;
    const frame = window.requestAnimationFrame(() => searchRef.current?.focus());

    return () => {
      window.cancelAnimationFrame(frame);
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [initialMemberId, mode, open]);

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        requestClose();
        return;
      }

      if (event.key !== 'Tab' || !dialogRef.current) return;

      const focusable = [...dialogRef.current.querySelectorAll(focusableSelector)]
        .filter((element) => element instanceof HTMLElement && element.offsetParent !== null);
      if (!focusable.length) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, requestClose]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setAttempted(true);
    setSubmitError('');

    if (!valid || busy || submitLockRef.current || typeof onSubmit !== 'function') return;

    submitLockRef.current = true;
    setSubmitting(true);
    try {
      await onSubmit({
        memberId: memberId(selectedMember),
        amount: parsedAmount,
        reason: reason.trim(),
        remarks: remarks.trim(),
      });
    } catch (error) {
      setSubmitError(error?.message || 'Could not save this change. Please try again.');
    } finally {
      submitLockRef.current = false;
      setSubmitting(false);
    }
  };

  if (!open) return null;

  const HeaderIcon = isDeposit ? CircleDollarSign : BadgeDollarSign;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className="relative flex max-h-[94dvh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl outline-none dark:border-slate-700 dark:bg-slate-900"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-4 py-4 dark:border-slate-800 sm:px-6">
          <div className="flex min-w-0 items-start gap-3">
            <span
              className="flex h-10 w-10 flex-none items-center justify-center rounded-xl text-white shadow-sm"
              style={{ backgroundColor: accent }}
            >
              <HeaderIcon className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: accent }}>
                Bazar money workspace
              </p>
              <h2 id={titleId} className="mt-0.5 text-lg font-bold text-slate-950 dark:text-white">
                {isDeposit ? 'Add current deposit' : 'Adjust individual balance'}
              </h2>
              <p id={descriptionId} className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                {isDeposit
                  ? 'Add money to one member’s current-month collection.'
                  : 'Apply a personal correction without changing the overall bazar fund.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={requestClose}
            disabled={busy}
            aria-label="Close dialog"
            title="Close"
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        <form onSubmit={handleSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
          <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[0.88fr_1.12fr]">
            <div className="border-b border-slate-200 p-4 dark:border-slate-800 lg:border-b-0 lg:border-r sm:p-5">
              <label htmlFor={`${titleId}-member-search`} className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">
                Select member <span className="text-rose-500">*</span>
              </label>
              <div className="relative mt-2">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <input
                  ref={searchRef}
                  id={`${titleId}-member-search`}
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search by name, room, email…"
                  autoComplete="off"
                  aria-describedby={memberError ? memberErrorId : undefined}
                  className={`h-10 w-full rounded-xl border bg-white pl-9 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:ring-2 dark:bg-slate-950 dark:text-white ${
                    memberError
                      ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-100 dark:focus:ring-rose-950'
                      : 'border-slate-200 focus:border-blue-500 focus:ring-blue-100 dark:border-slate-700 dark:focus:ring-blue-950'
                  }`}
                />
              </div>
              {memberError && <p id={memberErrorId} className="mt-1.5 text-[11px] font-medium text-rose-600">{memberError}</p>}

              <div
                role="listbox"
                aria-label="Members"
                className="mt-3 max-h-64 space-y-1.5 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-1.5 dark:border-slate-800 dark:bg-slate-950"
              >
                {filteredMembers.length ? filteredMembers.map((member) => {
                  const id = memberId(member);
                  const selected = id === selectedMemberId;
                  return (
                    <button
                      key={id}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => {
                        setSelectedMemberId(id);
                        setSubmitError('');
                      }}
                      className={`flex w-full items-center gap-3 rounded-lg border px-2.5 py-2 text-left transition ${
                        selected
                          ? 'border-blue-300 bg-white shadow-sm dark:border-blue-700 dark:bg-slate-800'
                          : 'border-transparent hover:border-slate-200 hover:bg-white dark:hover:border-slate-700 dark:hover:bg-slate-900'
                      }`}
                    >
                      <span
                        className={`flex h-8 w-8 flex-none items-center justify-center rounded-lg text-xs font-black ${
                          selected ? 'bg-[#2563EB] text-white' : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                        }`}
                      >
                        {memberInitial(member)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-bold text-slate-900 dark:text-white">{memberName(member)}</span>
                        <span className="mt-0.5 block truncate text-[10px] text-slate-400">
                          {member?.room ? `Room ${member.room}` : member?.email || 'House member'}
                        </span>
                      </span>
                      <span className={`flex h-5 w-5 items-center justify-center rounded-full ${selected ? 'bg-[#2563EB] text-white' : 'border border-slate-300 text-transparent dark:border-slate-600'}`}>
                        <Check className="h-3 w-3" aria-hidden="true" />
                      </span>
                    </button>
                  );
                }) : (
                  <div className="flex min-h-28 flex-col items-center justify-center px-4 text-center">
                    <UserRound className="h-5 w-5 text-slate-300" aria-hidden="true" />
                    <p className="mt-2 text-xs font-semibold text-slate-500">No members found</p>
                    <p className="mt-0.5 text-[10px] text-slate-400">Try a different name, room, or email.</p>
                  </div>
                )}
              </div>

              {selectedMember && (
                <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2.5 dark:border-violet-900 dark:bg-violet-950/30">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-[#7C3AED]">Previous balance</span>
                    <strong className="text-xs tabular-nums text-[#7C3AED]">{formatMoney(snapshot.previous, { signed: true })}</strong>
                  </div>
                  <p className="mt-1 text-[10px] leading-4 text-violet-700 dark:text-violet-300">Personal to {memberName(selectedMember)} and excluded from total collection.</p>
                </div>
              )}
            </div>

            <div className="p-4 sm:p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor={`${titleId}-amount`} className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">
                    {isDeposit ? 'Deposit amount' : 'Signed adjustment'} <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative mt-2">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">৳</span>
                    <input
                      id={`${titleId}-amount`}
                      type="text"
                      inputMode="decimal"
                      value={amountInput}
                      onChange={(event) => {
                        setAmountInput(event.target.value);
                        setSubmitError('');
                      }}
                      placeholder={isDeposit ? '1200' : '+200 or -150'}
                      aria-invalid={Boolean(amountError)}
                      aria-describedby={amountError ? amountErrorId : undefined}
                      className={`h-11 w-full rounded-xl border bg-white pl-8 pr-3 text-base font-bold tabular-nums text-slate-950 outline-none transition focus:ring-2 dark:bg-slate-950 dark:text-white ${
                        amountError
                          ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-100 dark:focus:ring-rose-950'
                          : 'border-slate-200 focus:ring-2 dark:border-slate-700'
                      }`}
                      style={!amountError ? { '--tw-ring-color': `${accent}24`, borderColor: undefined } : undefined}
                    />
                  </div>
                  {amountError ? (
                    <p id={amountErrorId} className="mt-1.5 text-[11px] font-medium text-rose-600">{amountError}</p>
                  ) : (
                    <p className="mt-1.5 text-[10px] text-slate-400">
                      {isDeposit ? 'Positive values only.' : 'Use + to add credit or − to add debit.'}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor={`${titleId}-reason`} className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">
                    Reason <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id={`${titleId}-reason`}
                    type="text"
                    value={reason}
                    onChange={(event) => {
                      setReason(event.target.value);
                      setSubmitError('');
                    }}
                    placeholder="Why is this change needed?"
                    maxLength={80}
                    aria-invalid={Boolean(reasonError)}
                    aria-describedby={reasonError ? reasonErrorId : undefined}
                    className={`mt-2 h-11 w-full rounded-xl border bg-white px-3 text-sm text-slate-900 outline-none transition focus:ring-2 dark:bg-slate-950 dark:text-white ${
                      reasonError
                        ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-100 dark:focus:ring-rose-950'
                        : 'border-slate-200 focus:border-orange-500 focus:ring-orange-100 dark:border-slate-700 dark:focus:ring-orange-950'
                    }`}
                  />
                  {reasonError && <p id={reasonErrorId} className="mt-1.5 text-[11px] font-medium text-rose-600">{reasonError}</p>}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Reason presets">
                {REASONS.map((option) => {
                  const active = reason === option;
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setReason(option)}
                      aria-pressed={active}
                      className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-bold transition ${
                        active
                          ? 'border-[#EA580C] bg-[#EA580C] text-white'
                          : 'border-slate-200 bg-white text-slate-500 hover:border-orange-300 hover:text-[#EA580C] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                      }`}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>

              <div className="mt-4">
                <label htmlFor={`${titleId}-remarks`} className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">
                  Remarks <span className="font-medium normal-case tracking-normal text-slate-400">(optional)</span>
                </label>
                <textarea
                  id={`${titleId}-remarks`}
                  value={remarks}
                  onChange={(event) => setRemarks(event.target.value)}
                  placeholder="Add an internal note for the audit history…"
                  rows={2}
                  maxLength={300}
                  className="mt-2 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm leading-5 text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:ring-slate-800"
                />
                <p className="mt-1 text-right text-[9px] text-slate-400">{remarks.length}/300</p>
              </div>

              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950 sm:p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Review impact</p>
                    <p className="mt-1 text-xs font-bold text-slate-800 dark:text-slate-200">
                      {selectedMember ? memberName(selectedMember) : 'Select a member to preview'}
                    </p>
                  </div>
                  <span
                    className="rounded-lg px-2 py-1 text-[10px] font-bold text-white"
                    style={{ backgroundColor: impact < 0 ? '#DC2626' : impact > 0 ? '#16A34A' : '#64748B' }}
                    aria-live="polite"
                  >
                    {formatMoney(impact, { signed: true })} impact
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <FormulaItem label="Previous due/advance" value={snapshot.previousMealDue} color="#7C3AED" />
                  <FormulaItem label="Current deposit" value={nextDeposit} color="#2563EB" />
                  <FormulaItem label="Adjustment" value={nextAdjustment} color="#EA580C" />
                  <FormulaItem label="Available balance" value={nextAvailable} color="#0891B2" emphasized />
                </div>

                <div className="mt-3 flex items-start gap-2 rounded-xl bg-white px-3 py-2.5 dark:bg-slate-900">
                  <Info className="mt-0.5 h-3.5 w-3.5 flex-none text-slate-400" aria-hidden="true" />
                  <p className="text-[10px] leading-4 text-slate-500 dark:text-slate-400">
                    <strong className="text-slate-700 dark:text-slate-200">Previous due/advance + current deposit + adjustment = available balance.</strong>{' '}
                    {isDeposit
                      ? 'Only this current deposit is added to overall collection; previous due/advance and adjustments remain excluded.'
                      : 'This personal adjustment changes only this member and never changes total collection, expense, or meal rate.'}
                  </p>
                </div>
              </div>

              {submitError && (
                <div role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-medium text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
                  {submitError}
                </div>
              )}
            </div>
          </div>

          <footer className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="flex items-center gap-2 text-[10px] text-slate-400">
              <WalletCards className="h-3.5 w-3.5" aria-hidden="true" />
              Saved changes appear in balance history.
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={requestClose}
                disabled={busy}
                className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy || typeof onSubmit !== 'function'}
                className="flex h-9 min-w-36 items-center justify-center gap-2 rounded-lg px-4 text-xs font-bold text-white shadow-sm transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-45"
                style={{ backgroundColor: accent }}
              >
                {busy ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    Saving…
                  </>
                ) : (
                  <>
                    {isDeposit ? 'Add deposit' : 'Save adjustment'}
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </>
                )}
              </button>
            </div>
          </footer>
        </form>
      </section>
    </div>
  );
}
