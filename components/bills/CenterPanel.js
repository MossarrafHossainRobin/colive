'use client'

import { 
  Home, Bolt, Wifi, Flame, Droplets, FileText, User, Gift,
  CheckCircle, AlertCircle, Clock, ArrowLeft
} from 'lucide-react';

const billTypeConfig = {
  rent: { label: 'House Rent', icon: Home, gradient: 'from-violet-500 to-purple-600' },
  electricity: { label: 'Electricity', icon: Bolt, gradient: 'from-amber-500 to-orange-500' },
  gas: { label: 'Gas Bill', icon: Flame, gradient: 'from-red-500 to-rose-500' },
  internet: { label: 'WiFi Bill', icon: Wifi, gradient: 'from-blue-500 to-indigo-500' },
  water: { label: 'Water Bill', icon: Droplets, gradient: 'from-cyan-500 to-teal-500' },
  dust: { label: 'Dust Bill', icon: FileText, gradient: 'from-indigo-500 to-violet-500' },
  khala: { label: 'Khala Bill', icon: User, gradient: 'from-pink-500 to-rose-500' },
  extra_rent: { label: 'Extra Rent', icon: Home, gradient: 'from-orange-500 to-amber-500' },
  eid_bonus: { label: 'Eid Bonus', icon: Gift, gradient: 'from-emerald-500 to-green-500' },
};

export default function CenterPanel({ bill, bills, onBack }) {
  if (!bill) {
    const totalAmount = bills.reduce((s, b) => s + (b.amount || 0), 0);
    const pendingCount = bills.filter(b => b.status !== 'paid').length;
    
    return (
      <div className="flex-1 flex flex-col items-center justify-center h-full bg-gradient-to-b from-gray-50 to-white p-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-violet-100 flex items-center justify-center mb-4">
          <FileText className="w-8 h-8 text-violet-500" />
        </div>
        <h3 className="text-sm font-extrabold text-gray-900 mb-1">Select a Bill</h3>
        <p className="text-xs text-gray-500 mb-4">Choose a bill from the left to view details</p>
        <div className="grid grid-cols-2 gap-2 w-full max-w-xs">
          <div className="bg-white rounded-xl p-3 border border-gray-100 text-center">
            <p className="text-lg font-black text-violet-700">৳{totalAmount.toLocaleString()}</p>
            <p className="text-[10px] text-gray-400">Total</p>
          </div>
          <div className="bg-white rounded-xl p-3 border border-gray-100 text-center">
            <p className="text-lg font-black text-red-600">{pendingCount}</p>
            <p className="text-[10px] text-gray-400">Pending</p>
          </div>
        </div>
      </div>
    );
  }

  const config = billTypeConfig[bill.type] || billTypeConfig.rent;
  const Icon = config.icon;
  const isPaid = bill.status === 'paid';
  const isPartial = bill.status === 'partial';
  const due = Math.max(0, (bill.amount || 0) - (bill.paidAmount || 0));

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3 bg-white flex-shrink-0">
        <button onClick={onBack} className="md:hidden p-1 -ml-1 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="w-5 h-5 text-gray-500" />
        </button>
        <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${config.gradient} flex items-center justify-center flex-shrink-0`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-extrabold text-gray-900 truncate">{config.label}</h3>
          <p className="text-[10px] text-gray-400">{bill.month || ''}</p>
        </div>
        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold flex-shrink-0 ${
          isPaid ? 'bg-emerald-100 text-emerald-700' : isPartial ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
        }`}>
          {isPaid ? 'Paid' : isPartial ? 'Partial' : 'Due'}
        </span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gradient-to-b from-gray-50/50 to-white">
        
        <div className="flex justify-center">
          <div className="bg-gray-100 rounded-full px-3 py-1">
            <p className="text-[10px] text-gray-500">Bill Details</p>
          </div>
        </div>

        <div className="flex justify-end">
          <div className="max-w-[75%] bg-gradient-to-br from-violet-500 to-purple-600 text-white rounded-2xl rounded-br-md px-4 py-3 shadow-md">
            <p className="text-[10px] text-white/70 mb-1">Total Amount</p>
            <p className="text-xl font-extrabold">৳{(bill.amount || 0).toLocaleString()}</p>
          </div>
        </div>

        <div className="flex justify-start">
          <div className="max-w-[75%] bg-white border border-gray-200 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
            <p className="text-[10px] text-gray-400 mb-1">Paid Amount</p>
            <p className="text-lg font-bold text-emerald-600">৳{(bill.paidAmount || 0).toLocaleString()}</p>
          </div>
        </div>

        {due > 0 && (
          <div className="flex justify-end">
            <div className="max-w-[75%] bg-red-50 border border-red-200 rounded-2xl rounded-br-md px-4 py-3">
              <p className="text-[10px] text-red-400 mb-1">Remaining</p>
              <p className="text-lg font-bold text-red-600">৳{due.toLocaleString()}</p>
            </div>
          </div>
        )}

        <div className="flex justify-center">
          <div className={`rounded-full px-4 py-1.5 flex items-center gap-2 ${
            isPaid ? 'bg-emerald-50' : isPartial ? 'bg-amber-50' : 'bg-red-50'
          }`}>
            {isPaid ? <CheckCircle className="w-4 h-4 text-emerald-600" /> : 
             isPartial ? <Clock className="w-4 h-4 text-amber-600" /> : 
             <AlertCircle className="w-4 h-4 text-red-600" />}
            <span className={`text-xs font-bold ${
              isPaid ? 'text-emerald-700' : isPartial ? 'text-amber-700' : 'text-red-700'
            }`}>
              {isPaid ? 'Complete ✓' : isPartial ? 'Partial Payment' : 'Payment Required'}
            </span>
          </div>
        </div>

        {bill.note && (
          <div className="flex justify-center">
            <div className="bg-gray-100 rounded-xl px-4 py-2 max-w-[80%]">
              <p className="text-[10px] text-gray-500">Note: {bill.note}</p>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-gray-100 bg-gray-50/50 text-center flex-shrink-0">
        <p className="text-[10px] text-gray-400">Bill ID: {bill.id.substring(0, 8)}...</p>
      </div>
    </div>
  );
}