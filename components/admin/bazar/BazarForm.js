'use client'

import { useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp, doc, getDoc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { toast } from 'react-hot-toast';
import { Send, Plus } from 'lucide-react';
import { sendAdminChatUpdate } from '@/lib/adminChatMessage';
import { calculateMonthlyBazarTotals } from '@/lib/bazarCalculations';
import { createUserNotification } from '@/lib/notificationDelivery';

export default function BazarForm({ members, selectedMember, selectedMonth, onSuccess, notificationsEnabled = false }) {
  const today = new Date().toISOString().split('T')[0];
  const [form, setForm] = useState({
    date: today,
    amount: '',
    place: '',
    items: '',
    countInBazar: true,
    helperMemberId: '',
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedMember || !form.amount || !form.place) {
      toast.error('সব তথ্য পূরণ করুন');
      return;
    }
    setLoading(true);

    try {
      const amount = Number(form.amount);
      const entryMonth = form.date.substring(0, 7);
      const helperMember = members.find((member) => member.id === form.helperMemberId);

      if (!Number.isFinite(amount) || amount <= 0) {
        toast.error('Enter a valid bazar amount.');
        return;
      }

      if (selectedMonth && entryMonth !== selectedMonth) {
        toast.error(`The bazar date must be within ${selectedMonth}.`);
        return;
      }

      const bazarData = {
        userId: selectedMember.id,
        date: form.date,
        month: entryMonth,
        amount,
        place: form.place,
        items: form.items.split(',').map(i => i.trim()).filter(i => i),
        countInBazar: form.countInBazar,
        helperMemberId: helperMember?.id || '',
        helperMemberName: helperMember
          ? helperMember.displayName || helperMember.name || helperMember.email || 'Member'
          : '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await addDoc(collection(db, "bazar"), bazarData);

      const monthSnapshot = await getDocs(
        query(collection(db, 'bazar'), where('month', '==', bazarData.month))
      );
      const monthlyTotals = calculateMonthlyBazarTotals(
        monthSnapshot.docs.map((item) => item.data()),
        bazarData.month
      );
      const monthlyBazarTotal = monthlyTotals.byMember[selectedMember.id] || 0;

      // Keep a month-scoped total. The lifetime account balance is managed by
      // explicit balance transfers and must not be inflated by bazar entries.
      const userRef = doc(db, "users", selectedMember.id);
      const userDoc = await getDoc(userRef);
      if (userDoc.exists()) {
        await updateDoc(userRef, {
          [`monthlyBazarTotals.${bazarData.month}`]: monthlyBazarTotal,
          updatedAt: serverTimestamp(),
        });
      }

      // Legacy delivery remains opt-in only. The active workspace uses the
      // explicit review/confirm notification composer.
      if (notificationsEnabled) {
        const memberName = selectedMember.displayName || selectedMember.name;
        const notificationBody = `${memberName}, a bazar entry was added.\nAmount: Tk ${amount.toLocaleString('en-US')}\nMonthly counted bazar: Tk ${monthlyBazarTotal.toLocaleString('en-US')}\nCounted in calculation: ${form.countInBazar ? 'Yes' : 'No'}\nPlace: ${form.place}\nItems: ${form.items || 'N/A'}${helperMember ? `\nHelper: ${helperMember.displayName || helperMember.name || helperMember.email}` : ''}`;
        await createUserNotification({
        userId: selectedMember.id,
        title: '🛒 নতুন বাজার এন্ট্রি',
        body: `${memberName}, আপনার জন্য নতুন বাজার এন্ট্রি যোগ করা হয়েছে।\nপরিমাণ: ৳${amount.toLocaleString('bn-BD')}\nমাসিক মোট বাজার: ৳${monthlyBazarTotal.toLocaleString('bn-BD')}\nস্থান: ${form.place}\nআইটেম: ${form.items || 'N/A'}`,
        type: 'bazar',
        link: '/bazar',
        title: 'Bazar entry added',
        body: notificationBody,
        data: {
          ...bazarData,
          monthlyBazarTotal,
          monthlyHouseBazarTotal: monthlyTotals.house,
        },
        read: false,
        createdAt: serverTimestamp(),
        });

        await sendAdminChatUpdate({
        member: selectedMember,
        category: 'bazar',
        title: 'Bazar entry added',
        summary: 'Your bazar entry has been added successfully.',
        fields: [
          { label: 'Amount', value: `Tk ${amount.toLocaleString('en-US')}` },
          {
            label: `${bazarData.month} monthly bazar total`,
            value: `Tk ${monthlyBazarTotal.toLocaleString('en-US')}`,
          },
          {
            label: `${bazarData.month} NestHub bazar total`,
            value: `Tk ${monthlyTotals.house.toLocaleString('en-US')}`,
          },
          { label: 'Place', value: form.place },
          { label: 'Items', value: form.items || 'Not specified' },
          { label: 'Counted in calculation', value: form.countInBazar ? 'Yes' : 'No' },
          {
            label: 'Helper',
            value: helperMember ? helperMember.displayName || helperMember.name || helperMember.email : '',
          },
          { label: 'Date', value: form.date },
        ],
        details: {
          ...bazarData,
          monthlyBazarTotal,
          monthlyHouseBazarTotal: monthlyTotals.house,
        },
        notify: true,
        }).catch((error) => console.error('Bazar chat update failed:', error));
      }

      toast.success(`বাজার এন্ট্রি সফল হয়েছে! ৳${amount.toLocaleString('bn-BD')} ${selectedMember.displayName || selectedMember.name} এর অ্যাকাউন্টে যোগ হয়েছে`);
      setForm({
        date: today,
        amount: '',
        place: '',
        items: '',
        countInBazar: true,
        helperMemberId: '',
      });
      if (onSuccess) onSuccess();
    } catch (error) {
      toast.error('ব্যর্থ হয়েছে');
    } finally {
      setLoading(false);
    }
  };

  if (!selectedMember) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 text-center">
        <p className="text-sm text-gray-400">বাজার এন্ট্রি করতে উপরে থেকে সদস্য নির্বাচন করুন</p>
      </div>
    );
  }

  const inputClass = "w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition bg-white";

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
      <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
        <Plus className="w-4 h-4 text-emerald-500" />
        {selectedMember.displayName || selectedMember.name} এর বাজার এন্ট্রি
      </h3>

      <form onSubmit={handleSubmit} className="space-y-3">
        <input type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})} className={inputClass} required />
        <input type="text" value={form.place} onChange={e => setForm({...form, place: e.target.value})} placeholder="স্থান (যেমন: নিউ মার্কেট)" className={inputClass} required />
        <input type="number" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} placeholder="পরিমাণ (৳)" className={`${inputClass} text-lg font-bold`} required />
        <input type="text" value={form.items} onChange={e => setForm({...form, items: e.target.value})} placeholder="আইটেম (কমা দিয়ে আলাদা)" className={inputClass} />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex items-center justify-between rounded-xl border-2 border-gray-200 bg-white px-3 py-2.5">
            <span>
              <span className="block text-sm font-black text-gray-800">Count in calculation</span>
              <span className="block text-[10px] font-bold text-gray-400">Turn off when member only gave money.</span>
            </span>
            <button
              type="button"
              onClick={() => setForm({ ...form, countInBazar: !form.countInBazar })}
              className={`relative h-6 w-11 rounded-full transition-colors ${form.countInBazar ? 'bg-emerald-500' : 'bg-gray-300'}`}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${form.countInBazar ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </label>

          <select
            value={form.helperMemberId}
            onChange={e => setForm({ ...form, helperMemberId: e.target.value })}
            className={inputClass}
          >
            <option value="">No helper member</option>
            {members
              .filter((member) => member.id !== selectedMember.id)
              .map((member) => (
                <option key={member.id} value={member.id}>
                  {member.displayName || member.name || member.email}
                </option>
              ))}
          </select>
        </div>

        <button type="submit" disabled={loading}
          className="w-full bg-emerald-500 text-white py-2.5 rounded-xl font-bold hover:bg-emerald-600 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
          <Send className="w-4 h-4" />
          {loading ? 'সংরক্ষণ হচ্ছে...' : 'বাজার এন্ট্রি যোগ করুন'}
        </button>
      </form>
    </div>
  );
}
