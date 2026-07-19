'use client';

import { useMemo, useState } from 'react';
import { db } from '@/lib/firebase';
import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  Calendar,
  Edit3,
  Loader2,
  MapPin,
  Package,
  Search,
  ShoppingCart,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { sendAdminChatUpdate } from '@/lib/adminChatMessage';
import { calculateMonthlyBazarTotals } from '@/lib/bazarCalculations';

const formatBDT = (amount) => {
  const number = Number(amount || 0);

  return `৳${number.toLocaleString('bn-BD')}`;
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

const getUserRoom = (members, userId) => {
  if (!userId) return '';

  const member = members.find((item) => item.id === userId);

  return member?.room || '';
};

const getAmount = (value) => {
  const number = Number(value);

  return Number.isFinite(number) ? number : 0;
};

const getItemsArray = (items) => {
  if (Array.isArray(items)) {
    return items.filter(Boolean);
  }

  if (typeof items === 'string') {
    return items
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
};

const getItemsText = (items) => {
  return getItemsArray(items).join(', ');
};

const formatDate = (value) => {
  if (!value) return '—';

  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    const date = new Date(`${value}T00:00:00+06:00`);

    return date.toLocaleDateString('en-US', {
      timeZone: 'Asia/Dhaka',
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  const date = value?.toDate ? value.toDate() : new Date(value);

  if (Number.isNaN(date.getTime())) return '—';

  return date.toLocaleDateString('en-US', {
    timeZone: 'Asia/Dhaka',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const getDateSortValue = (value) => {
  if (!value) return 0;

  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    return new Date(`${value}T00:00:00+06:00`).getTime();
  }

  const date = value?.toDate ? value.toDate() : new Date(value);

  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
};

const getCreatedAtSortValue = (value) => {
  if (!value) return 0;
  if (value?.toMillis) return value.toMillis();

  const date = value?.toDate ? value.toDate() : new Date(value);

  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
};

function EditBazarModal({
  item,
  members,
  selectedMonth,
  onClose,
  onSaved,
  notificationsEnabled = false,
}) {
  const [date, setDate] = useState(item?.date || '');
  const [amount, setAmount] = useState(item?.amount || '');
  const [place, setPlace] = useState(item?.place || item?.market || item?.location || '');
  const [items, setItems] = useState(getItemsText(item?.items));
  const [notes, setNotes] = useState(item?.notes || item?.reason || '');
  const [countInBazar, setCountInBazar] = useState(item?.countInBazar !== false);
  const [helperMemberId, setHelperMemberId] = useState(item?.helperMemberId || '');
  const [saving, setSaving] = useState(false);

  const userName = getUserName(members, item?.userId);

  const handleSave = async (event) => {
    event.preventDefault();

    if (!item?.id) return;

    const numericAmount = Number(amount);

    if (!date) {
      toast.error('Please select bazar date.');
      return;
    }

    if (!numericAmount || numericAmount <= 0) {
      toast.error('Please enter a valid amount.');
      return;
    }

    if (selectedMonth && date.substring(0, 7) !== selectedMonth) {
      toast.error(`The bazar date must be within ${selectedMonth}.`);
      return;
    }

    try {
      setSaving(true);

      await updateDoc(doc(db, 'bazar', item.id), {
        date,
        month: selectedMonth,
        amount: numericAmount,
        place: place.trim() || 'All Places',
        items: getItemsArray(items),
        notes: notes.trim(),
        countInBazar,
        helperMemberId,
        helperMemberName: helperMemberId ? getUserName(members, helperMemberId) : '',
        updatedAt: serverTimestamp(),
      });

      const monthSnapshot = await getDocs(
        query(collection(db, 'bazar'), where('month', '==', selectedMonth))
      );
      const monthlyTotals = calculateMonthlyBazarTotals(
        monthSnapshot.docs.map((entryDoc) => entryDoc.data()),
        selectedMonth
      );
      const monthlyBazarTotal = monthlyTotals.byMember[item.userId] || 0;
      await updateDoc(doc(db, 'users', item.userId), {
        [`monthlyBazarTotals.${selectedMonth}`]: monthlyBazarTotal,
        updatedAt: serverTimestamp(),
      }).catch(() => null);

      const member = members.find((entry) => entry.id === item.userId);
      if (notificationsEnabled) await sendAdminChatUpdate({
        member,
        category: 'bazar',
        title: 'Bazar entry updated',
        summary: 'Your bazar entry has been updated by the admin.',
        fields: [
          { label: 'Amount', value: `Tk ${numericAmount.toLocaleString('en-US')}` },
          {
            label: `${selectedMonth} monthly bazar total`,
            value: `Tk ${monthlyBazarTotal.toLocaleString('en-US')}`,
          },
          {
            label: `${selectedMonth} NestHub bazar total`,
            value: `Tk ${monthlyTotals.house.toLocaleString('en-US')}`,
          },
          { label: 'Place', value: place.trim() || 'All Places' },
          { label: 'Items', value: items || 'Not specified' },
          { label: 'Date', value: date },
          { label: 'Counted in calculation', value: countInBazar ? 'Yes' : 'No' },
          { label: 'Helper', value: helperMemberId ? getUserName(members, helperMemberId) : '' },
          { label: 'Notes', value: notes.trim() },
        ],
        details: {
          date,
          amount: numericAmount,
          place,
          items,
          notes,
          month: selectedMonth,
          countInBazar,
          helperMemberId,
          monthlyBazarTotal,
          monthlyHouseBazarTotal: monthlyTotals.house,
        },
        notify: true,
      }).catch((error) => console.error('Bazar update chat failed:', error));

      toast.success('Bazar record updated successfully.');

      if (onSaved) {
        onSaved();
      }

      onClose();
    } catch (error) {
      console.error('Bazar update error:', error);
      toast.error('Failed to update bazar record.');
    } finally {
      setSaving(false);
    }
  };

  if (!item) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-gray-950/60 px-0 sm:items-center sm:px-4">
      <div className="w-full rounded-t-3xl bg-white shadow-2xl sm:max-w-lg sm:rounded-3xl">
        <div className="border-b border-gray-100 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase text-emerald-600">
                Edit Bazar Record
              </p>

              <h3 className="mt-1 text-lg font-extrabold text-gray-950">
                {userName}
              </h3>

              <p className="mt-1 text-xs font-semibold text-gray-500">
                Update bazar date, place, amount, items, or notes.
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl bg-gray-100 p-2 text-gray-500 transition hover:bg-gray-200"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-4 p-5">
          <div>
            <label className="text-xs font-black uppercase text-gray-500">
              Date
            </label>

            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="mt-1 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-800 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
            />
          </div>

          <div>
            <label className="text-xs font-black uppercase text-gray-500">
              Amount
            </label>

            <input
              type="number"
              min="0"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="Enter bazar amount"
              className="mt-1 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-800 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
            />
          </div>

          <div>
            <label className="text-xs font-black uppercase text-gray-500">
              Place
            </label>

            <input
              type="text"
              value={place}
              onChange={(event) => setPlace(event.target.value)}
              placeholder="Example: All Places, Local Market, Super Shop"
              className="mt-1 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-800 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
            />
          </div>

          <div>
            <label className="text-xs font-black uppercase text-gray-500">
              Items
            </label>

            <input
              type="text"
              value={items}
              onChange={(event) => setItems(event.target.value)}
              placeholder="Rice, Fish, Vegetable"
              className="mt-1 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-800 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
            />

            <p className="mt-1 text-[11px] font-semibold text-gray-400">
              Separate multiple items with comma.
            </p>
          </div>

          <div>
            <label className="text-xs font-black uppercase text-gray-500">
              Notes
            </label>

            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Optional notes"
              rows={3}
              className="mt-1 w-full resize-none rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-800 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex items-center justify-between rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
              <span>
                <span className="block text-xs font-black uppercase text-gray-500">
                  Counted
                </span>
                <span className="block text-[11px] font-semibold text-gray-400">
                  Include in monthly meal/bazar calculation.
                </span>
              </span>
              <button
                type="button"
                onClick={() => setCountInBazar((current) => !current)}
                className={`relative h-6 w-11 rounded-full transition-colors ${countInBazar ? 'bg-emerald-500' : 'bg-gray-300'}`}
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${countInBazar ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </label>

            <div>
              <label className="text-xs font-black uppercase text-gray-500">
                Helper
              </label>
              <select
                value={helperMemberId}
                onChange={(event) => setHelperMemberId(event.target.value)}
                className="mt-1 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-800 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
              >
                <option value="">No helper member</option>
                {members
                  .filter((member) => member.id !== item.userId)
                  .map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.displayName || member.name || member.email}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl border border-gray-200 bg-white px-5 py-3 text-sm font-black text-gray-600 transition hover:bg-gray-50"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-black text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Edit3 className="h-4 w-4" />}
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function BazarHistory({
  bazars = [],
  members = [],
  selectedMonth,
  onUpdate,
  notificationsEnabled = false,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [deletingId, setDeletingId] = useState('');
  const [editingItem, setEditingItem] = useState(null);

  const activeBazars = useMemo(() => {
    return bazars.filter((item) => !item.isDeleted);
  }, [bazars]);

  const filteredBazars = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    if (!term) return activeBazars;

    return activeBazars.filter((item) => {
      const userName = getUserName(members, item.userId);
      const room = getUserRoom(members, item.userId);
      const itemsText = getItemsText(item.items);

      return [
        userName,
        room,
        item.date,
        formatDate(item.date),
        item.place,
        item.market,
        item.location,
        item.amount,
        itemsText,
        item.notes,
        item.reason,
        item.month,
      ]
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
  }, [activeBazars, members, searchTerm]);

  const sortedBazars = useMemo(() => {
    return [...filteredBazars].sort((a, b) => {
      const dateDiff = getDateSortValue(b.date) - getDateSortValue(a.date);

      if (dateDiff !== 0) return dateDiff;

      return getCreatedAtSortValue(b.createdAt) - getCreatedAtSortValue(a.createdAt);
    });
  }, [filteredBazars]);

  const totalAmount = useMemo(() => {
    return activeBazars.reduce((sum, item) => {
      if (item.countInBazar === false) return sum;
      return sum + getAmount(item.amount);
    }, 0);
  }, [activeBazars]);

  const excludedAmount = useMemo(() => {
    return activeBazars.reduce((sum, item) => {
      if (item.countInBazar !== false) return sum;
      return sum + getAmount(item.amount);
    }, 0);
  }, [activeBazars]);

  const handleDelete = async (item) => {
    if (!item?.id) return;

    const confirmDelete = window.confirm(
      'Are you sure you want to delete this bazar record?'
    );

    if (!confirmDelete) return;

    try {
      setDeletingId(item.id);

      await updateDoc(doc(db, 'bazar', item.id), {
        isDeleted: true,
        deletedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const monthSnapshot = await getDocs(
        query(collection(db, 'bazar'), where('month', '==', selectedMonth))
      );
      const monthlyTotals = calculateMonthlyBazarTotals(
        monthSnapshot.docs.map((entryDoc) => entryDoc.data()),
        selectedMonth
      );
      const monthlyBazarTotal = monthlyTotals.byMember[item.userId] || 0;
      await updateDoc(doc(db, 'users', item.userId), {
        [`monthlyBazarTotals.${selectedMonth}`]: monthlyBazarTotal,
        updatedAt: serverTimestamp(),
      }).catch(() => null);

      const member = members.find((entry) => entry.id === item.userId);
      if (notificationsEnabled) await sendAdminChatUpdate({
        member,
        category: 'bazar',
        title: 'Bazar entry deleted',
        summary: 'A bazar entry was deleted by the admin.',
        fields: [
          { label: 'Deleted amount', value: `Tk ${getAmount(item.amount).toLocaleString('en-US')}` },
          { label: 'Date', value: item.date || '' },
          { label: 'Place', value: item.place || item.market || '' },
          {
            label: `${selectedMonth} monthly bazar total`,
            value: `Tk ${monthlyBazarTotal.toLocaleString('en-US')}`,
          },
        ],
        details: {
          action: 'deleted',
          month: selectedMonth,
          amount: getAmount(item.amount),
          monthlyBazarTotal,
        },
        notify: true,
      }).catch((error) => console.error('Bazar deletion chat failed:', error));

      toast.success('Bazar record deleted successfully.');

      if (onUpdate) {
        onUpdate();
      }
    } catch (error) {
      console.error('Delete bazar error:', error);
      toast.error('Failed to delete bazar record.');
    } finally {
      setDeletingId('');
    }
  };

  return (
    <>
      <section className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase text-emerald-700">
                <ShoppingCart className="h-3.5 w-3.5" />
                Bazar History
              </div>

              <h2 className="mt-2 text-base font-extrabold text-gray-950 sm:text-lg">
                বাজার হিস্টোরি ({filteredBazars.length})
              </h2>

              <p className="mt-1 text-xs font-semibold text-gray-500">
                Counted total: {formatBDT(totalAmount)}
                {excludedAmount > 0 && ` | Not counted: ${formatBDT(excludedAmount)}`}
              </p>
            </div>

            <div className="relative w-full lg:max-w-xs">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />

              <input
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="খুঁজুন..."
                className="w-full rounded-2xl border border-gray-200 bg-gray-50 py-3 pl-11 pr-10 text-sm font-bold text-gray-800 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
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
          <table className="w-full min-w-[840px] border-collapse">
            <thead>
              <tr className="bg-gray-50">
                <th className="border-b border-gray-200 px-4 py-3 text-left text-[11px] font-black uppercase text-gray-500">
                  Member
                </th>

                <th className="border-b border-gray-200 px-4 py-3 text-left text-[11px] font-black uppercase text-gray-500">
                  Date
                </th>

                <th className="border-b border-gray-200 px-4 py-3 text-left text-[11px] font-black uppercase text-gray-500">
                  Place
                </th>

                <th className="border-b border-gray-200 px-4 py-3 text-left text-[11px] font-black uppercase text-gray-500">
                  Amount
                </th>

                <th className="border-b border-gray-200 px-4 py-3 text-left text-[11px] font-black uppercase text-gray-500">
                  Items / Notes
                </th>

                <th className="border-b border-gray-200 px-4 py-3 text-right text-[11px] font-black uppercase text-gray-500">
                  Action
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {sortedBazars.length > 0 ? (
                sortedBazars.map((item, index) => {
                  const userName = getUserName(members, item.userId);
                  const room = getUserRoom(members, item.userId);
                  const items = getItemsArray(item.items);

                  return (
                    <tr
                      key={item.id || index}
                      className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-emerald-100 text-xs font-black text-emerald-700">
                            {String(userName).charAt(0).toUpperCase()}
                          </div>

                          <div>
                            <p className="text-sm font-black text-gray-900">
                              {userName}
                            </p>

                            <p className="text-[11px] font-bold text-gray-400">
                              {room ? `Room ${room}` : 'No room'}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 text-sm font-bold text-gray-700">
                          <Calendar className="h-3.5 w-3.5 text-gray-400" />
                          {formatDate(item.date)}
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 text-sm font-bold text-gray-700">
                          <MapPin className="h-3.5 w-3.5 text-gray-400" />
                          {item.place || item.market || item.location || '—'}
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <p className={`text-sm font-black ${item.countInBazar === false ? 'text-gray-500 line-through' : 'text-emerald-700'}`}>
                          {formatBDT(item.amount)}
                        </p>
                        {item.countInBazar === false && (
                          <span className="mt-1 inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-black uppercase text-amber-700">
                            Not counted
                          </span>
                        )}
                        {item.helperMemberName && (
                          <p className="mt-1 text-[10px] font-bold text-blue-500">
                            Helper: {item.helperMemberName}
                          </p>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        {items.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {items.map((product, productIndex) => (
                              <span
                                key={`${product}-${productIndex}`}
                                className="rounded-full bg-gray-100 px-2 py-1 text-[10px] font-bold text-gray-600"
                              >
                                {product}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="max-w-xs truncate text-xs font-bold text-gray-500">
                            {item.notes || item.reason || '—'}
                          </p>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingItem(item)}
                            className="inline-flex items-center justify-center rounded-xl bg-blue-50 px-3 py-2 text-xs font-black text-blue-600 transition hover:bg-blue-100"
                          >
                            <Edit3 className="h-4 w-4" />
                          </button>

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
                    এই মাসে কোনো বাজার হিস্টোরি পাওয়া যায়নি
                  </td>
                </tr>
              )}
            </tbody>

            {sortedBazars.length > 0 && (
              <tfoot>
                <tr className="bg-gray-950 text-white">
                  <td className="px-4 py-4 text-sm font-black">
                    Total
                  </td>

                  <td className="px-4 py-4 text-sm font-bold text-gray-300">
                    {selectedMonth}
                  </td>

                  <td className="px-4 py-4 text-sm font-bold text-gray-300">
                    {sortedBazars.length} entries
                  </td>

                  <td className="px-4 py-4 text-sm font-black text-emerald-300">
                    {formatBDT(totalAmount)}
                  </td>

                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        <div className="space-y-3 p-4 md:hidden">
          {sortedBazars.length > 0 ? (
            sortedBazars.map((item, index) => {
              const userName = getUserName(members, item.userId);
              const room = getUserRoom(members, item.userId);
              const items = getItemsArray(item.items);

              return (
                <article
                  key={item.id || index}
                  className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase text-gray-400">
                        Record #{index + 1}
                      </p>

                      <div className="mt-2 flex items-center gap-2">
                        <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-emerald-100 text-xs font-black text-emerald-700">
                          {String(userName).charAt(0).toUpperCase()}
                        </div>

                        <div>
                          <p className="text-sm font-black text-gray-900">
                            {userName}
                          </p>

                          <p className="text-[11px] font-bold text-gray-400">
                            {room ? `Room ${room}` : 'No room'}
                          </p>
                        </div>
                      </div>
                    </div>

                    <span className={`rounded-full px-3 py-1 text-xs font-black text-white ${item.countInBazar === false ? 'bg-amber-500' : 'bg-emerald-600'}`}>
                      {formatBDT(item.amount)}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-2">
                    <div className="rounded-2xl bg-gray-50 px-3 py-2">
                      <p className="text-[9px] font-black uppercase text-gray-400">
                        Date
                      </p>

                      <p className="mt-1 flex items-center gap-1 text-xs font-bold text-gray-700">
                        <Calendar className="h-3.5 w-3.5 text-gray-400" />
                        {formatDate(item.date)}
                      </p>
                    </div>

                    <div className="rounded-2xl bg-gray-50 px-3 py-2">
                      <p className="text-[9px] font-black uppercase text-gray-400">
                        Place
                      </p>

                      <p className="mt-1 flex items-center gap-1 text-xs font-bold text-gray-700">
                        <MapPin className="h-3.5 w-3.5 text-gray-400" />
                        {item.place || item.market || item.location || '—'}
                      </p>
                    </div>
                  </div>

                  {items.length > 0 ? (
                    <div className="mt-3 rounded-2xl bg-gray-50 px-3 py-2">
                      <p className="text-[9px] font-black uppercase text-gray-400">
                        Items
                      </p>

                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {items.map((product, productIndex) => (
                          <span
                            key={`${product}-${productIndex}`}
                            className="rounded-full bg-white px-2 py-1 text-[10px] font-bold text-gray-600"
                          >
                            {product}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 rounded-2xl bg-gray-50 px-3 py-2">
                      <p className="text-[9px] font-black uppercase text-gray-400">
                        Notes
                      </p>

                      <p className="mt-1 text-xs font-bold text-gray-600">
                        {item.notes || item.reason || '—'}
                      </p>
                    </div>
                  )}

                  {(item.countInBazar === false || item.helperMemberName) && (
                    <div className="mt-3 rounded-2xl bg-amber-50 px-3 py-2">
                      {item.countInBazar === false && (
                        <p className="text-[10px] font-black uppercase text-amber-700">
                          Not counted in calculation
                        </p>
                      )}
                      {item.helperMemberName && (
                        <p className="mt-1 text-[10px] font-bold text-blue-600">
                          Helper: {item.helperMemberName}
                        </p>
                      )}
                    </div>
                  )}

                  <div className="mt-3 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingItem(item)}
                      className="inline-flex items-center justify-center rounded-xl bg-blue-50 px-3 py-2 text-xs font-black text-blue-600 transition hover:bg-blue-100"
                    >
                      <Edit3 className="h-4 w-4" />
                    </button>

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
              <ShoppingCart className="mx-auto h-8 w-8 text-gray-300" />

              <p className="mt-3 text-sm font-black text-gray-400">
                এই মাসে কোনো বাজার হিস্টোরি পাওয়া যায়নি
              </p>
            </div>
          )}

          {sortedBazars.length > 0 && (
            <div className="rounded-3xl bg-gray-950 p-4 text-white">
              <div className="flex items-center justify-between text-sm font-black">
                <span>Counted Bazar</span>
                <span className="text-emerald-300">{formatBDT(totalAmount)}</span>
              </div>

              <div className="mt-2 flex items-center justify-between text-sm font-black">
                <span>Total Entries</span>
                <span>{sortedBazars.length}</span>
              </div>
            </div>
          )}
        </div>
      </section>

      {editingItem && (
        <EditBazarModal
          item={editingItem}
          members={members}
          selectedMonth={selectedMonth}
          onClose={() => setEditingItem(null)}
          onSaved={onUpdate}
          notificationsEnabled={notificationsEnabled}
        />
      )}
    </>
  );
}
