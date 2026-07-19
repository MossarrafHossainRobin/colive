'use client';

import { useState } from 'react';
import { Bell, Check, Edit3, Send, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import {
  formatSignedTaka,
  getPaymentText,
  parsePaymentInput,
} from '@/lib/billCalculations';
import {
  saveMemberPayment,
  saveMemberPreviousBalance,
  sendManualBillNotification,
  sendAllBillNotifications,
} from '@/lib/billFirestore';

function StatusBadge({ status }) {
  const styles = {
    paid: 'bg-green-100 text-green-700',
    partial: 'bg-blue-100 text-blue-700',
    pending: 'bg-red-100 text-red-700',
    advance: 'bg-emerald-100 text-emerald-700',
  };

  const labels = {
    paid: 'Paid',
    partial: 'Partial',
    pending: 'Pending',
    advance: 'Advance',
  };

  return (
    <span
      className={`px-2 py-1 rounded-full text-[10px] font-black ${
        styles[status] || styles.pending
      }`}
    >
      {labels[status] || 'Pending'}
    </span>
  );
}

export default function MemberBillsTable({ monthId, rows }) {
  const [editingId, setEditingId] = useState(null);
  const [inputs, setInputs] = useState({});
  const [savingId, setSavingId] = useState(null);

  const [editingPrevId, setEditingPrevId] = useState(null);
  const [prevInputs, setPrevInputs] = useState({});
  const [savingPrevId, setSavingPrevId] = useState(null);

  const [sendingId, setSendingId] = useState(null);
  const [sendingAll, setSendingAll] = useState(false);

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

  async function handleSendNotification(row) {
    try {
      setSendingId(row.userId);

      await sendManualBillNotification({
        monthId,
        memberRow: row,
      });

      toast.success(`Notification sent to ${row.name || 'member'}.`);
    } catch (error) {
      toast.error(error.message || 'Failed to send notification.');
    } finally {
      setSendingId(null);
    }
  }

  async function handleSendAllNotifications() {
    if (!rows.length) {
      toast.error('No member bill data found.');
      return;
    }

    try {
      setSendingAll(true);

      const result = await sendAllBillNotifications({
        monthId,
        rows,
      });

      if (result.failed > 0) {
        toast.success(`Sent ${result.sent}/${result.total}. Failed: ${result.failed}`);
      } else {
        toast.success(`Notifications sent to all ${result.sent} members.`);
      }
    } catch (error) {
      toast.error(error.message || 'Failed to send all notifications.');
    } finally {
      setSendingAll(false);
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
    <section className="hidden lg:block bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="p-5 border-b border-gray-100 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-black text-gray-900">
            Member Wise Monthly Calculation
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Payment example: 1000+1200+3000 • Previous due: 500 • Advance: -300
          </p>
        </div>

        <button
          type="button"
          onClick={handleSendAllNotifications}
          disabled={sendingAll || rows.length === 0}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-green-600 px-4 py-2.5 text-xs font-black text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Send className="w-4 h-4" />
          {sendingAll ? 'Sending...' : 'Send All'}
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1250px] text-sm">
          <thead className="bg-gray-50 text-[11px] uppercase text-gray-500">
            <tr>
              <th className="p-3 text-left">Name</th>
              <th className="p-3 text-left">Room</th>
              <th className="p-3 text-right">Rent</th>
              <th className="p-3 text-right">Utility</th>
              <th className="p-3 text-right">Prev Due/Adv</th>
              <th className="p-3 text-right">Net Payable</th>
              <th className="p-3 text-left">Payments</th>
              <th className="p-3 text-right">Paid</th>
              <th className="p-3 text-right">Balance</th>
              <th className="p-3 text-center">Status</th>
              <th className="p-3 text-center">Notify</th>
              <th className="p-3 text-center">Action</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100">
            {rows.map((row) => {
              const editing = editingId === row.userId;
              const editingPreviousBalance = editingPrevId === row.userId;
              const paymentText = getPaymentText(row.payments);
              const preview = parsePaymentInput(inputs[row.userId] ?? paymentText);
              const isSending = sendingId === row.userId;

              return (
                <tr key={row.userId} className="hover:bg-gray-50">
                  <td className="p-3 font-black text-gray-900 whitespace-nowrap">
                    {row.name}
                  </td>

                  <td className="p-3 font-bold text-gray-600 whitespace-nowrap">
                    {row.room}
                  </td>

                  <td className="p-3 text-right font-bold text-blue-700">
                    ৳{Number(row.roomRent || 0).toLocaleString()}
                  </td>

                  <td className="p-3 text-right font-bold text-amber-700">
                    ৳{Number(row.utility || 0).toLocaleString()}
                  </td>

                  <td className="p-3 text-right">
                    {editingPreviousBalance ? (
                      <div className="flex justify-end items-center gap-1">
                        <input
                          autoFocus
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
                          className="w-28 rounded-xl border border-orange-300 px-2 py-1 text-xs font-bold outline-none focus:ring-2 focus:ring-orange-500"
                          placeholder="500 or -300"
                        />

                        <button
                          type="button"
                          disabled={savingPrevId === row.userId}
                          onClick={() => handleSavePreviousBalance(row)}
                          className="rounded-lg bg-green-600 p-1.5 text-white disabled:opacity-50"
                          title="Save previous due / advance"
                        >
                          <Check className="w-3 h-3" />
                        </button>

                        <button
                          type="button"
                          onClick={() => setEditingPrevId(null)}
                          className="rounded-lg bg-gray-100 p-1.5 text-gray-700"
                          title="Cancel"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => startEditingPreviousBalance(row)}
                        className={`font-bold underline decoration-dotted underline-offset-4 ${
                          row.previousBalance < 0
                            ? 'text-emerald-700'
                            : row.previousBalance > 0
                              ? 'text-orange-700'
                              : 'text-gray-500'
                        }`}
                        title="Click to edit previous due or advance"
                      >
                        {formatSignedTaka(row.previousBalance)}
                      </button>
                    )}
                  </td>

                  <td className="p-3 text-right font-black">
                    ৳{Number(row.totalPayable || 0).toLocaleString()}
                  </td>

                  <td className="p-3">
                    {editing ? (
                      <div>
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
                          className="w-44 rounded-xl border border-green-300 px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-green-500"
                          placeholder="1000+1200+3000"
                        />

                        {preview.valid && preview.total > 0 && (
                          <p className="text-[10px] text-gray-500 mt-1">
                            Total: ৳{preview.total.toLocaleString()}
                          </p>
                        )}
                      </div>
                    ) : (
                      <span className="text-green-700 font-bold">
                        {paymentText || 'No payment'}
                      </span>
                    )}
                  </td>

                  <td className="p-3 text-right font-black text-green-700">
                    ৳{Number(row.paidAmount || 0).toLocaleString()}
                  </td>

                  <td
                    className={`p-3 text-right font-black ${
                      row.balance < 0
                        ? 'text-emerald-700'
                        : row.balance > 0
                          ? 'text-red-700'
                          : 'text-gray-500'
                    }`}
                  >
                    {formatSignedTaka(row.balance)}
                  </td>

                  <td className="p-3 text-center">
                    <StatusBadge status={row.status} />
                  </td>

                  <td className="p-3 text-center">
                    <button
                      type="button"
                      onClick={() => handleSendNotification(row)}
                      disabled={isSending}
                      className="inline-flex items-center justify-center gap-1 rounded-xl bg-sky-50 px-3 py-2 text-xs font-black text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
                      title="Send bill notification"
                    >
                      <Bell className="w-4 h-4" />
                      {isSending ? 'Sending' : 'Send'}
                    </button>
                  </td>

                  <td className="p-3 text-center">
                    {editing ? (
                      <div className="flex justify-center gap-1">
                        <button
                          type="button"
                          disabled={savingId === row.userId}
                          onClick={() => handleSave(row)}
                          className="p-2 rounded-xl bg-green-600 text-white disabled:opacity-50"
                          title="Save payment"
                        >
                          <Check className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="p-2 rounded-xl bg-gray-100 text-gray-700"
                          title="Cancel"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => startEditing(row)}
                        className="p-2 rounded-xl bg-violet-50 text-violet-700"
                        title="Edit payment"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}