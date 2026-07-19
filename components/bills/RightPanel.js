'use client'

import { CheckCircle, AlertCircle, DollarSign } from 'lucide-react';
import { motion } from 'framer-motion';

export default function RightPanel({ bills }) {
  const totalAmount = bills.reduce((s, b) => s + (b.amount || 0), 0);
  const paidAmount = bills.filter(b => b.status === 'paid').reduce((s, b) => s + (b.amount || 0), 0);
  const pendingAmount = bills.filter(b => b.status !== 'paid').reduce((s, b) => s + (b.amount || 0), 0);
  const paidCount = bills.filter(b => b.status === 'paid').length;
  const pendingCount = bills.filter(b => b.status !== 'paid').length;
  const paidPercent = totalAmount > 0 ? Math.round((paidAmount / totalAmount) * 100) : 0;

  return (
    <div className="flex flex-col h-full p-4 space-y-4 overflow-y-auto">
      <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Summary</h3>

      {/* Total */}
      <div className="bg-gradient-to-br from-violet-500 to-purple-600 rounded-2xl p-4 text-white">
        <DollarSign className="w-5 h-5 text-white/70 mb-2" />
        <p className="text-2xl font-black">৳{totalAmount.toLocaleString()}</p>
        <p className="text-[11px] text-white/70 mt-1">Total Bills</p>
        <p className="text-[10px] text-white/50">{bills.length} bills</p>
      </div>

      {/* Paid */}
      <div className="bg-gradient-to-br from-emerald-500 to-green-600 rounded-2xl p-4 text-white">
        <CheckCircle className="w-5 h-5 text-white/70 mb-2" />
        <p className="text-2xl font-black">৳{paidAmount.toLocaleString()}</p>
        <p className="text-[11px] text-white/70 mt-1">Paid</p>
        <p className="text-[10px] text-white/50">{paidCount} cleared</p>
      </div>

      {/* Due */}
      {pendingAmount > 0 && (
        <div className="bg-gradient-to-br from-red-500 to-rose-600 rounded-2xl p-4 text-white">
          <AlertCircle className="w-5 h-5 text-white/70 mb-2" />
          <p className="text-2xl font-black">৳{pendingAmount.toLocaleString()}</p>
          <p className="text-[11px] text-white/70 mt-1">Due</p>
          <p className="text-[10px] text-white/50">{pendingCount} pending</p>
        </div>
      )}

      {/* Progress */}
      <div className="bg-white rounded-2xl p-4 border border-gray-100">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold text-gray-400 uppercase">Progress</span>
          <span className="text-[10px] font-bold text-violet-600">{paidPercent}%</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
          <motion.div initial={{ width: 0 }} animate={{ width: `${paidPercent}%` }}
            className={`h-full rounded-full ${paidPercent >= 100 ? 'bg-emerald-500' : paidPercent >= 50 ? 'bg-violet-500' : 'bg-red-500'}`} />
        </div>
      </div>

      {/* Breakdown */}
      <div className="bg-white rounded-2xl p-4 border border-gray-100">
        <h4 className="text-[10px] font-bold text-gray-400 uppercase mb-3">Breakdown</h4>
        <div className="space-y-2">
          {bills.map((bill, i) => {
            const isPaid = bill.status === 'paid';
            return (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${isPaid ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
                  <span className="text-[11px] text-gray-600 truncate max-w-[120px]">{bill.type?.replace('_', ' ') || 'Bill'}</span>
                </div>
                <span className={`text-[11px] font-bold ${isPaid ? 'text-emerald-600' : 'text-red-600'}`}>৳{(bill.amount || 0).toLocaleString()}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}