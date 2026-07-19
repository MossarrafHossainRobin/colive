'use client';

import { useMemo, useState } from 'react';
import { db } from '@/lib/firebase';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import {
  ArrowRight,
  Loader2,
  Search,
  Trash2,
  WalletCards,
  X,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { sendAdminChatUpdate } from '@/lib/adminChatMessage';

const formatBDT = (amount) => {
  const number = Number(amount || 0);

  return `৳${Math.abs(number).toLocaleString('bn-BD')}`;
};

const getUserName = (members, userId) => {
  if (!userId) return '—';

  const member = members.find((item) => item.id === userId);

  return (
    member?.name ||
    member?.displayName ||
    member?.fullName ||
    member?.email ||
    'Unknown Member'
  );
};

const getAdjustmentFromId = (item) => {
  return (
    item.fromUserId ||
    item.senderId ||
    item.sourceUserId ||
    item.givenBy ||
    item.userId ||
    ''
  );
};

const getAdjustmentToId = (item) => {
  return (
    item.toUserId ||
    item.receiverId ||
    item.targetUserId ||
    item.givenTo ||
    item.adjustedUserId ||
    ''
  );
};

const getAdjustmentAmount = (item) => {
  return Math.abs(Number(item.amount || 0));
};

const formatDate = (value) => {
  if (!value) return '—';

  const date = value?.toDate ? value.toDate() : new Date(value);

  if (Number.isNaN(date.getTime())) return '—';

  return date.toLocaleString('en-US', {
    timeZone: 'Asia/Dhaka',
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export default function BalanceAdjustmentHistory({
  adjustments = [],
  members = [],
  selectedMonth,
  onUpdate,
  onDelete,
  notificationsEnabled = false,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [deletingId, setDeletingId] = useState('');

  const activeAdjustments = useMemo(() => {
    return adjustments.filter((item) => !item.isDeleted);
  }, [adjustments]);

  const filteredAdjustments = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    if (!term) return activeAdjustments;

    return activeAdjustments.filter((item) => {
      const fromName = getUserName(members, getAdjustmentFromId(item));
      const toName = getUserName(members, getAdjustmentToId(item));

      return [
        fromName,
        toName,
        item.reason,
        item.notes,
        item.amount,
        item.month,
        item.date,
        formatDate(item.createdAt),
      ]
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
  }, [activeAdjustments, members, searchTerm]);

  const totalTransfer = useMemo(() => {
    return filteredAdjustments.reduce((sum, item) => {
      return sum + getAdjustmentAmount(item);
    }, 0);
  }, [filteredAdjustments]);

  const handleDelete = async (item) => {
    if (!item?.id) return;

    const confirmDelete = window.confirm(
      'Are you sure you want to delete this balance transfer record?'
    );

    if (!confirmDelete) return;

    try {
      setDeletingId(item.id);

      if (onDelete) {
        await onDelete(item);
        toast.success('Balance transfer deleted successfully.');
        if (onUpdate) onUpdate();
        return;
      }

      await updateDoc(doc(db, 'balanceAdjustments', item.id), {
        isDeleted: true,
        deletedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const fromId = getAdjustmentFromId(item);
      const toId = getAdjustmentToId(item);
      const fromMember = members.find((member) => member.id === fromId);
      const toMember = members.find((member) => member.id === toId);
      const amount = getAdjustmentAmount(item);

      if (notificationsEnabled) await Promise.all([
        sendAdminChatUpdate({
          member: fromMember,
          category: 'balance',
          title: 'Balance transfer reversed',
          summary: 'A balance transfer sent from your account was removed by the admin.',
          fields: [
            { label: 'Amount', value: `Tk ${amount.toLocaleString('en-US')}` },
            { label: 'To', value: getUserName(members, toId) },
            { label: 'Month', value: selectedMonth },
          ],
          details: { action: 'deleted', direction: 'sent', amount, month: selectedMonth },
          notify: true,
        }),
        sendAdminChatUpdate({
          member: toMember,
          category: 'balance',
          title: 'Balance transfer reversed',
          summary: 'A balance transfer received by your account was removed by the admin.',
          fields: [
            { label: 'Amount', value: `Tk ${amount.toLocaleString('en-US')}` },
            { label: 'From', value: getUserName(members, fromId) },
            { label: 'Month', value: selectedMonth },
          ],
          details: { action: 'deleted', direction: 'received', amount, month: selectedMonth },
          notify: true,
        }),
      ]).catch((error) => console.error('Balance reversal chat failed:', error));

      toast.success('Balance transfer deleted successfully.');

      if (onUpdate) {
        onUpdate();
      }
    } catch (error) {
      console.error('Delete balance adjustment error:', error);
      toast.error('Failed to delete balance transfer.');
    } finally {
      setDeletingId('');
    }
  };

  return (
    <section className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-[10px] font-black uppercase text-blue-700">
              <WalletCards className="h-3.5 w-3.5" />
              Balance Transfer
            </div>

            <h2 className="mt-2 text-base font-extrabold text-gray-950 sm:text-lg">
              ব্যালেন্স ট্রান্সফার হিস্টোরি ({filteredAdjustments.length})
            </h2>

            <p className="mt-1 text-xs font-semibold text-gray-500">
              মোট ট্রান্সফার: {formatBDT(totalTransfer)}
            </p>
          </div>

          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />

            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="খুঁজুন..."
              className="w-full rounded-2xl border border-gray-200 bg-gray-50 py-3 pl-11 pr-10 text-sm font-bold text-gray-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
            />

            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-gray-400 hover:bg-gray-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[720px] border-collapse">
          <thead>
            <tr className="bg-gray-50">
              <th className="border-b border-gray-200 px-4 py-3 text-left text-[11px] font-black uppercase text-gray-500">
                From
              </th>

              <th className="border-b border-gray-200 px-4 py-3 text-left text-[11px] font-black uppercase text-gray-500">
                To
              </th>

              <th className="border-b border-gray-200 px-4 py-3 text-left text-[11px] font-black uppercase text-gray-500">
                Amount
              </th>

              <th className="border-b border-gray-200 px-4 py-3 text-left text-[11px] font-black uppercase text-gray-500">
                Reason
              </th>

              <th className="border-b border-gray-200 px-4 py-3 text-left text-[11px] font-black uppercase text-gray-500">
                Date
              </th>

              <th className="border-b border-gray-200 px-4 py-3 text-right text-[11px] font-black uppercase text-gray-500">
                Action
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100">
            {filteredAdjustments.length > 0 ? (
              filteredAdjustments.map((item, index) => {
                const fromId = getAdjustmentFromId(item);
                const toId = getAdjustmentToId(item);
                const fromName = getUserName(members, fromId);
                const toName = getUserName(members, toId);

                return (
                  <tr
                    key={item.id || index}
                    className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}
                  >
                    <td className="px-4 py-3 text-sm font-bold text-gray-900">
                      {fromName}
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 text-sm font-bold text-gray-900">
                        <ArrowRight className="h-4 w-4 text-gray-400" />
                        {toName}
                      </div>
                    </td>

                    <td className="px-4 py-3 text-sm font-black text-blue-700">
                      {formatBDT(getAdjustmentAmount(item))}
                    </td>

                    <td className="px-4 py-3 text-sm font-semibold text-gray-600">
                      {item.reason || item.notes || '—'}
                    </td>

                    <td className="px-4 py-3 text-xs font-bold text-gray-400">
                      {formatDate(item.createdAt || item.date)}
                    </td>

                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleDelete(item)}
                        disabled={deletingId === item.id}
                        className="inline-flex items-center justify-center rounded-xl bg-red-50 px-3 py-2 text-xs font-black text-red-600 transition hover:bg-red-100 disabled:opacity-60"
                      >
                        {deletingId === item.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </button>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-14 text-center text-sm font-bold text-gray-400"
                >
                  এই মাসে কোনো ব্যালেন্স ট্রান্সফার পাওয়া যায়নি
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 p-4 md:hidden">
        {filteredAdjustments.length > 0 ? (
          filteredAdjustments.map((item, index) => {
            const fromId = getAdjustmentFromId(item);
            const toId = getAdjustmentToId(item);
            const fromName = getUserName(members, fromId);
            const toName = getUserName(members, toId);

            return (
              <article
                key={item.id || index}
                className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase text-gray-400">
                      Transfer #{index + 1}
                    </p>

                    <div className="mt-2 flex items-center gap-2 text-sm font-black text-gray-900">
                      <span>{fromName}</span>
                      <ArrowRight className="h-4 w-4 text-gray-400" />
                      <span>{toName}</span>
                    </div>
                  </div>

                  <span className="rounded-full bg-blue-600 px-3 py-1 text-xs font-black text-white">
                    {formatBDT(getAdjustmentAmount(item))}
                  </span>
                </div>

                <div className="mt-4 rounded-2xl bg-gray-50 px-3 py-2">
                  <p className="text-[9px] font-black uppercase text-gray-400">
                    Reason
                  </p>

                  <p className="mt-1 text-xs font-bold text-gray-700">
                    {item.reason || item.notes || '—'}
                  </p>
                </div>

                <div className="mt-3 flex items-center justify-between gap-3">
                  <p className="text-[10px] font-bold text-gray-400">
                    {formatDate(item.createdAt || item.date)}
                  </p>

                  <button
                    type="button"
                    onClick={() => handleDelete(item)}
                    disabled={deletingId === item.id}
                    className="inline-flex items-center justify-center rounded-xl bg-red-50 px-3 py-2 text-xs font-black text-red-600 transition hover:bg-red-100 disabled:opacity-60"
                  >
                    {deletingId === item.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </article>
            );
          })
        ) : (
          <div className="rounded-3xl border border-dashed border-gray-200 p-8 text-center">
            <WalletCards className="mx-auto h-8 w-8 text-gray-300" />

            <p className="mt-3 text-sm font-black text-gray-400">
              এই মাসে কোনো ব্যালেন্স ট্রান্সফার পাওয়া যায়নি
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
