'use client'

import { useState } from 'react';
import { 
  Send, Loader2, Wallet, AlertTriangle, CheckCircle, 
  TrendingUp, Banknote, Utensils
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { isMemberAccountActive } from '@/lib/memberPolicy';
import { createUserNotification } from '@/lib/notificationDelivery';

async function sendPaymentNotification(userId, userName, data) {
  try {
    const now = new Date();
    const timeStr = now.toLocaleString('en-US', { 
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit' 
    });

    let title, body;
    
    if (data.status === 'due') {
      title = 'NestHub - Meal Payment Due';
      body = [
        `Dear ${userName},`,
        ``,
        `MEAL PAYMENT SUMMARY - ${data.month}`,
        ``,
        `Given Amount: ৳${data.paid.toFixed(0)}`,
        `Meals Taken: ${data.totalMeals} (Cost: ৳${data.cost.toFixed(0)})`,
        `Meal Rate: ৳${data.mealRate.toFixed(2)}/meal`,
        ``,
        `PENDING DUE: ৳${data.due.toFixed(0)}`,
        ``,
        `Please clear your dues at your earliest convenience.`,
        ``,
        `- NestHub Team`
      ].join('\n');
    } else if (data.status === 'advance') {
      title = 'NestHub - Advance Payment Confirmation';
      body = [
        `Dear ${userName},`,
        ``,
        `PAYMENT SUMMARY - ${data.month}`,
        ``,
        `Given Amount: ৳${data.paid.toFixed(0)}`,
        `Meals Taken: ${data.totalMeals} (Cost: ৳${data.cost.toFixed(0)})`,
        `Meal Rate: ৳${data.mealRate.toFixed(2)}/meal`,
        ``,
        `ADVANCE CREDIT: ৳${data.advance.toFixed(0)}`,
        ``,
        `You have paid more than your meal cost.`,
        ``,
        `- NestHub Team`
      ].join('\n');
    } else {
      title = 'NestHub - Payment Settled';
      body = [
        `Dear ${userName},`,
        ``,
        `PAYMENT SUMMARY - ${data.month}`,
        ``,
        `Given Amount: ৳${data.paid.toFixed(0)}`,
        `Meals Taken: ${data.totalMeals} (Cost: ৳${data.cost.toFixed(0)})`,
        `Meal Rate: ৳${data.mealRate.toFixed(2)}/meal`,
        ``,
        `STATUS: FULLY SETTLED ✓`,
        ``,
        `- NestHub Team`
      ].join('\n');
    }
    
    await createUserNotification({
      userId,
      title,
      body,
      message: body.substring(0, 300),
      type: 'bill',
      link: '/dashboard',
      data: { ...data },
    });
    
    return true;
  } catch { return false; }
}

export default function MemberDue({ meals, users, selectedMonth, bazarTotal = 0, userBazarPayments = {} }) {
  const [notifyingId, setNotifyingId] = useState(null);
  const [notifyAllLoading, setNotifyAllLoading] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const monthlyMeals = meals.filter(m => m.month === selectedMonth);
  const totalMealsAll = monthlyMeals.reduce(
    (sum, meal) =>
      sum +
      (Number(meal.lunch) || 0) +
      (Number(meal.dinner) || 0) +
      (Number(meal.guestMeal) || 0),
    0
  );
  const mealRate = totalMealsAll > 0 ? (bazarTotal / totalMealsAll) : 0;

  const userMealCounts = {};
  monthlyMeals.forEach(m => {
    if (!userMealCounts[m.userId]) userMealCounts[m.userId] = 0;
    userMealCounts[m.userId] +=
      (Number(m.lunch) || 0) +
      (Number(m.dinner) || 0) +
      (Number(m.guestMeal) || 0);
  });

  const memberDues = users.filter(isMemberAccountActive).map(u => {
    const meals = userMealCounts[u.id] || 0;
    const cost = meals * mealRate;
    const paid = userBazarPayments[u.id] || 0;
    const balance = paid - cost;
    
    let status = 'none', due = 0, advance = 0;
    
    if (meals > 0 || paid > 0) {
      if (balance < -0.01) { status = 'due'; due = Math.abs(balance); }
      else if (balance > 0.01) { status = 'advance'; advance = balance; }
      else { status = 'paid'; }
    }
    
    return { userId: u.id, name: u.name, room: u.room || '', totalMeals: meals, cost, paid, balance, due, advance, status };
  }).sort((a, b) => {
    const order = { due: 0, advance: 1, paid: 2, none: 3 };
    return (order[a.status] || 3) - (order[b.status] || 3);
  });

  const totalGiven = memberDues.reduce((s, m) => s + m.paid, 0);
  const totalCost = memberDues.reduce((s, m) => s + m.cost, 0);
  const totalDue = memberDues.reduce((s, m) => s + m.due, 0);
  const totalAdvance = memberDues.reduce((s, m) => s + m.advance, 0);
  
  const dueMembers = memberDues.filter(m => m.status === 'due');
  const advanceMembers = memberDues.filter(m => m.status === 'advance');
  const displayMembers = showAll ? memberDues : memberDues.filter(m => m.status !== 'none');

  const handleNotify = async (member) => {
    setNotifyingId(member.userId);
    const success = await sendPaymentNotification(member.userId, member.name, { ...member, mealRate, month: selectedMonth, status: member.status });
    setNotifyingId(null);
    if (success) toast.success(`Sent to ${member.name}!`);
    else toast.error('Failed');
  };

  const handleNotifyAll = async (members) => {
    setNotifyAllLoading(true);
    let count = 0;
    for (const m of members) {
      const ok = await sendPaymentNotification(m.userId, m.name, { ...m, mealRate, month: selectedMonth, status: m.status });
      if (ok) count++;
    }
    setNotifyAllLoading(false);
    toast.success(`Sent to ${count}/${members.length}`);
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'due': return <span className="inline-flex items-center gap-1 text-[10px] sm:text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full border border-red-200"><AlertTriangle className="w-3 h-3" /> Due</span>;
      case 'advance': return <span className="inline-flex items-center gap-1 text-[10px] sm:text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200"><TrendingUp className="w-3 h-3" /> Advance</span>;
      case 'paid': return <span className="inline-flex items-center gap-1 text-[10px] sm:text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200"><CheckCircle className="w-3 h-3" /> Settled</span>;
      default: return <span className="text-[10px] text-gray-300">—</span>;
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
      <div className="bg-gradient-to-r from-slate-900 via-purple-900 to-slate-900 px-4 sm:px-5 py-3 sm:py-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-white/10 backdrop-blur-xl border border-white/10 flex items-center justify-center">
              <Wallet className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-extrabold text-white">Payment Summary</h2>
              <p className="text-[10px] sm:text-xs text-white/60">{selectedMonth} • Rate: ৳{mealRate.toFixed(2)}/meal</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {dueMembers.length > 0 && (
              <button onClick={() => handleNotifyAll(dueMembers)} disabled={notifyAllLoading}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-red-500/20 text-red-300 border border-red-400/30 rounded-lg text-[10px] font-bold hover:bg-red-500/30 disabled:opacity-50">
                {notifyAllLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                Due ({dueMembers.length})
              </button>
            )}
            {advanceMembers.length > 0 && (
              <button onClick={() => handleNotifyAll(advanceMembers)} disabled={notifyAllLoading}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-500/20 text-blue-300 border border-blue-400/30 rounded-lg text-[10px] font-bold hover:bg-blue-500/30 disabled:opacity-50">
                Adv ({advanceMembers.length})
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3 p-3 sm:p-4">
        <div className="bg-violet-50 rounded-xl p-2.5 sm:p-3 text-center border border-violet-200">
          <p className="text-base sm:text-lg font-black text-violet-700">৳{totalGiven.toFixed(0)}</p>
          <p className="text-[9px] sm:text-[10px] font-bold text-violet-400 uppercase">Given</p>
        </div>
        <div className="bg-amber-50 rounded-xl p-2.5 sm:p-3 text-center border border-amber-200">
          <p className="text-base sm:text-lg font-black text-amber-700">{totalMealsAll}</p>
          <p className="text-[9px] sm:text-[10px] font-bold text-amber-400 uppercase">Meals</p>
        </div>
        <div className="bg-gray-50 rounded-xl p-2.5 sm:p-3 text-center border border-gray-200">
          <p className="text-base sm:text-lg font-black text-gray-700">৳{totalCost.toFixed(0)}</p>
          <p className="text-[9px] sm:text-[10px] font-bold text-gray-400 uppercase">Cost</p>
        </div>
        <div className={`rounded-xl p-2.5 sm:p-3 text-center border ${totalDue > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
          <p className={`text-base sm:text-lg font-black ${totalDue > 0 ? 'text-red-700' : 'text-gray-400'}`}>৳{totalDue.toFixed(0)}</p>
          <p className={`text-[9px] sm:text-[10px] font-bold uppercase ${totalDue > 0 ? 'text-red-400' : 'text-gray-400'}`}>Due</p>
        </div>
        <div className={`rounded-xl p-2.5 sm:p-3 text-center border ${totalAdvance > 0 ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'}`}>
          <p className={`text-base sm:text-lg font-black ${totalAdvance > 0 ? 'text-blue-700' : 'text-gray-400'}`}>৳{totalAdvance.toFixed(0)}</p>
          <p className={`text-[9px] sm:text-[10px] font-bold uppercase ${totalAdvance > 0 ? 'text-blue-400' : 'text-gray-400'}`}>Adv</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs sm:text-sm">
          <thead>
            <tr className="bg-gray-50/80 border-b border-gray-100">
              <th className="px-3 py-2.5 text-left text-[10px] font-bold text-gray-400 uppercase">Member</th>
              <th className="px-2 py-2.5 text-center text-[10px] font-bold text-gray-400 uppercase">Taken</th>
              <th className="px-2 py-2.5 text-right text-[10px] font-bold text-gray-400 uppercase">Cost</th>
              <th className="px-2 py-2.5 text-right text-[10px] font-bold text-emerald-600 uppercase">Given</th>
              <th className="px-2 py-2.5 text-right text-[10px] font-bold text-red-500 uppercase">Due</th>
              <th className="px-2 py-2.5 text-right text-[10px] font-bold text-blue-500 uppercase">Adv</th>
              <th className="px-2 py-2.5 text-center text-[10px] font-bold text-gray-400 uppercase w-20">Status</th>
              <th className="px-2 py-2.5 text-center text-[10px] font-bold text-gray-400 uppercase w-14">Notify</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {displayMembers.map(member => (
              <tr key={member.userId} className={`hover:bg-gray-50/50 transition-all ${
                member.status === 'due' ? 'bg-red-50/20' : member.status === 'advance' ? 'bg-blue-50/20' : member.status === 'paid' ? 'bg-emerald-50/20' : ''
              }`}>
                <td className="px-3 py-2.5">
                  <p className="text-xs font-bold text-gray-900 truncate max-w-[70px] sm:max-w-none">{member.name}</p>
                  {member.room && <p className="text-[9px] text-gray-400">{member.room}</p>}
                </td>
                <td className="px-2 py-2.5 text-center"><span className={`text-xs font-bold ${member.totalMeals > 0 ? 'text-gray-900' : 'text-gray-300'}`}>{member.totalMeals || '—'}</span></td>
                <td className="px-2 py-2.5 text-right"><span className="text-xs font-bold text-gray-700">৳{member.cost.toFixed(0)}</span></td>
                <td className="px-2 py-2.5 text-right"><span className={`text-xs font-bold ${member.paid > 0 ? 'text-emerald-600' : 'text-gray-300'}`}>{member.paid > 0 ? `৳${member.paid.toFixed(0)}` : '—'}</span></td>
                <td className="px-2 py-2.5 text-right"><span className={`text-xs font-bold ${member.due > 0 ? 'text-red-600' : 'text-gray-300'}`}>{member.due > 0 ? `৳${member.due.toFixed(0)}` : '—'}</span></td>
                <td className="px-2 py-2.5 text-right"><span className={`text-xs font-bold ${member.advance > 0 ? 'text-blue-600' : 'text-gray-300'}`}>{member.advance > 0 ? `৳${member.advance.toFixed(0)}` : '—'}</span></td>
                <td className="px-2 py-2.5 text-center">{getStatusBadge(member.status)}</td>
                <td className="px-2 py-2.5 text-center">
                  {member.status !== 'none' && (
                    <button onClick={() => handleNotify(member)} disabled={notifyingId === member.userId}
                      className="p-1.5 rounded-lg hover:bg-gray-100 transition-all disabled:opacity-50">
                      {notifyingId === member.userId ? <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" /> : <Send className="w-3.5 h-3.5 text-gray-400" />}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {memberDues.some(m => m.status === 'none') && (
        <button onClick={() => setShowAll(!showAll)}
          className="w-full py-2.5 text-[10px] font-bold text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors">
          {showAll ? 'Hide inactive' : `Show all (${memberDues.length} members)`}
        </button>
      )}
    </div>
  );
}
