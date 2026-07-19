'use client';

import { useState } from 'react';
import { Check, Edit3, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import {
  formatSignedTaka,
  getPaymentText,
  parsePaymentInput,
} from '@/lib/billCalculations';
import {
  saveMemberPayment,
  saveMemberPreviousBalance,
} from '@/lib/billFirestore';

function statusClass(status) {
  if (status === 'paid') return 'bg-green-100 text-green-700';
  if (status === 'partial') return 'bg-blue-100 text-blue-700';
  if (status === 'advance') return 'bg-emerald-100 text-emerald-700';
  return 'bg-red-100 text-red-700';
}

export default function MemberBillsMobileCards({ monthId, rows }) {
  const [editingId, setEditingId] = useState(null);
  const [inputs, setInputs] = useState({});
  const [savingId, setSavingId] = useState(null);

  const [editingPrevId, setEditingPrevId] = useState(null);
  const [prevInputs, setPrevInputs] = useState({});
  const [savingPrevId, setSavingPrevId] = useState(null);

  async function handleSave(row) {
    const rawPayment = inputs[row.userId] ?? getPaymentText(row.payments);
    const parsed = parsePaymentInput(rawPayment);

    if (!parsed.valid) {
      toast.error(parsed.error);
      return;
    }

    try {
      setSavingId(row.userId);

      await saveMemberPayment({
        monthId,
        memberRow: row,
        rawPayment,
      });

      toast.success('Payment saved.');
      setEditingId(null);
    } catch (error) {
      toast.error(error.message || 'Payment save failed.');
    } finally {
      setSavingId(null);
    }
  }

  async function handleSavePreviousBalance(row) {
    const raw = prevInputs[row.userId] ?? row.previousBalance ?? 0;
    const value = Number(raw);

    if (!Number.isFinite(value)) {
      toast.error('Enter a valid previous due or advance amount.');
      return;
    }

    try {
      setSavingPrevId(row.userId);

      await saveMemberPreviousBalance({
        monthId,
        memberRow: row,
        previousBalance: value,
      });

      toast.success('Previous due / advance saved.');
      setEditingPrevId(null);
    } catch (error) {
      toast.error(error.message || 'Failed to save previous due.');
    } finally {
      setSavingPrevId(null);
    }
  }

  function startEditing(row) {
    setEditingId(row.userId);
    setInputs((old) => ({
      ...old,
      [row.userId]: getPaymentText(row.payments),
    }));
  }

  function startEditingPreviousBalance(row) {
    setEditingPrevId(row.userId);
    setPrevInputs((old) => ({
      ...old,
      [row.userId]: row.previousBalance || 0,
    }));
  }

  return (
    <section className="lg:hidden space-y-3">
      {rows.map((row) => {
        const editing = editingId === row.userId;
        const editingPreviousBalance = editingPrevId === row.userId;
        const paymentText = getPaymentText(row.payments);
        const preview = parsePaymentInput(inputs[row.userId] ?? paymentText);

        return (
          <div
            key={row.userId}
            className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm"
          >
            <div className="flex justify-between gap-3">
              <div>
                <h3 className="font-black text-gray-900">{row.name}</h3>
                <p className="text-xs text-gray-500">{row.room}</p>
              </div>

              <span
                className={`h-fit rounded-full px-2 py-1 text-[10px] font-black uppercase ${statusClass(
                  row.status
                )}`}
              >
                {row.status || 'pending'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-4 text-sm">
              <p className="flex justify-between gap-2">
                <span className="text-gray-500">Rent</span>
                <b>৳{Number(row.roomRent || 0).toLocaleString()}</b>
              </p>

              <p className="flex justify-between gap-2">
                <span className="text-gray-500">Utility</span>
                <b>৳{Number(row.utility || 0).toLocaleString()}</b>
              </p>

              <p className="flex justify-between gap-2">
                <span className="text-gray-500">Prev</span>
                <b
                  className={
                    row.previousBalance < 0
                      ? 'text-emerald-700'
                      : row.previousBalance > 0
                        ? 'text-orange-700'
                        : 'text-gray-700'
                  }
                >
                  {formatSignedTaka(row.previousBalance)}
                </b>
              </p>

              <p className="flex justify-between gap-2">
                <span className="text-gray-500">Total</span>
                <b>৳{Number(row.totalPayable || 0).toLocaleString()}</b>
              </p>
            </div>

            <div className="mt-3 rounded-xl border border-orange-200 bg-orange-50 p-3">
              <p className="text-[11px] font-black text-orange-700 uppercase">
                Previous Due / Advance
              </p>

              {editingPreviousBalance ? (
                <div className="mt-2 space-y-2">
                  <input
                    type="number"
                    value={prevInputs[row.userId] ?? row.previousBalance ?? 0}
                    onChange={(event) =>
                      setPrevInputs((old) => ({
                        ...old,
                        [row.userId]: event.target.value,
                      }))
                    }
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') handleSavePreviousBalance(row);
                      if (event.key === 'Escape') setEditingPrevId(null);
                    }}
                    placeholder="500 or -300"
                    className="w-full rounded-xl border border-orange-300 px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-orange-500"
                  />

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={savingPrevId === row.userId}
                      onClick={() => handleSavePreviousBalance(row)}
                      className="inline-flex items-center justify-center gap-1 rounded-xl bg-green-600 py-2 text-xs font-black text-white disabled:opacity-50"
                    >
                      <Check className="w-3 h-3" /> Save
                    </button>

                    <button
                      type="button"
                      onClick={() => setEditingPrevId(null)}
                      className="inline-flex items-center justify-center gap-1 rounded-xl bg-gray-100 py-2 text-xs font-black text-gray-700"
                    >
                      <X className="w-3 h-3" /> Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => startEditingPreviousBalance(row)}
                  className={`mt-1 text-sm font-black ${
                    row.previousBalance < 0
                      ? 'text-emerald-700'
                      : row.previousBalance > 0
                        ? 'text-orange-700'
                        : 'text-gray-700'
                  }`}
                >
                  {formatSignedTaka(row.previousBalance)} — Tap to edit
                </button>
              )}

              <p className="text-[10px] text-orange-700 mt-1">
                Use positive number for previous due, negative number for advance.
              </p>
            </div>

            <div className="mt-4 border-t border-gray-100 pt-3 space-y-3">
              {editing ? (
                <div className="space-y-2">
                  <input
                    autoFocus
                    value={inputs[row.userId] ?? paymentText}
                    onChange={(event) =>
                      setInputs((old) => ({
                        ...old,
                        [row.userId]: event.target.value,
                      }))
                    }
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') handleSave(row);
                      if (event.key === 'Escape') setEditingId(null);
                    }}
                    className="w-full rounded-xl border border-green-300 px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="1000+1200+3000"
                  />

                  {preview.valid && preview.total > 0 && (
                    <p className="text-[10px] text-gray-500">
                      Total: ৳{preview.total.toLocaleString()}
                    </p>
                  )}

                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={savingId === row.userId}
                      onClick={() => handleSave(row)}
                      className="flex-1 inline-flex items-center justify-center gap-1 rounded-xl bg-green-600 py-2 text-xs font-black text-white disabled:opacity-50"
                    >
                      <Check className="w-3 h-3" /> Save
                    </button>

                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="flex-1 inline-flex items-center justify-center gap-1 rounded-xl bg-gray-100 py-2 text-xs font-black text-gray-700"
                    >
                      <X className="w-3 h-3" /> Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-green-700 font-bold truncate">
                    {paymentText || 'No payment'}
                  </p>

                  <button
                    type="button"
                    onClick={() => startEditing(row)}
                    className="shrink-0 p-2 rounded-xl bg-violet-50 text-violet-700"
                    title="Edit payment"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                </div>
              )}

              <div className="flex justify-between text-sm">
                <span className="text-green-700 font-black">
                  Paid ৳{Number(row.paidAmount || 0).toLocaleString()}
                </span>

                <span
                  className={`font-black ${
                    row.balance < 0
                      ? 'text-emerald-700'
                      : row.balance > 0
                        ? 'text-red-700'
                        : 'text-gray-500'
                  }`}
                >
                  {row.balance < 0
                    ? 'Advance '
                    : row.balance > 0
                      ? 'Due '
                      : 'Settled '}
                  {formatSignedTaka(row.balance)}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </section>
  );
}