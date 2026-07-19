'use client'

import { 
  Home, Bolt, Wifi, Flame, Droplets, FileText, User, Gift,
  CheckCircle, Search
} from 'lucide-react';

const billTypeConfig = {
  rent: { label: 'House Rent', icon: Home, gradient: 'from-violet-500 to-purple-600' },
  electricity: { label: 'Electricity', icon: Bolt, gradient: 'from-amber-500 to-orange-500' },
  gas: { label: 'Gas', icon: Flame, gradient: 'from-red-500 to-rose-500' },
  internet: { label: 'WiFi', icon: Wifi, gradient: 'from-blue-500 to-indigo-500' },
  water: { label: 'Water', icon: Droplets, gradient: 'from-cyan-500 to-teal-500' },
  dust: { label: 'Dust', icon: FileText, gradient: 'from-indigo-500 to-violet-500' },
  khala: { label: 'Khala', icon: User, gradient: 'from-pink-500 to-rose-500' },
  extra_rent: { label: 'Extra Rent', icon: Home, gradient: 'from-orange-500 to-amber-500' },
  eid_bonus: { label: 'Bonus', icon: Gift, gradient: 'from-emerald-500 to-green-500' },
};

export default function LeftPanel({ bills, selectedBill, onSelectBill }) {
  const pendingBills = bills.filter(b => b.status !== 'paid');
  const paidBills = bills.filter(b => b.status === 'paid');

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="p-3 border-b border-gray-100">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input type="text" placeholder="Search bills..."
            className="w-full pl-8 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-violet-500/20 outline-none" />
        </div>
      </div>

      {/* Chat List */}
      <div className="flex-1 overflow-y-auto">
        {pendingBills.length > 0 && (
          <div>
            <div className="px-3 py-2">
              <span className="text-[10px] font-bold text-red-500 uppercase">Pending ({pendingBills.length})</span>
            </div>
            {pendingBills.map((bill) => {
              const config = billTypeConfig[bill.type] || billTypeConfig.rent;
              const Icon = config.icon;
              const isSelected = selectedBill?.id === bill.id;
              return (
                <button key={bill.id} onClick={() => onSelectBill(bill)}
                  className={`w-full px-3 py-2.5 flex items-center gap-3 hover:bg-gray-50 transition-colors text-left ${
                    isSelected ? 'bg-violet-50 border-r-2 border-violet-500' : ''
                  }`}>
                  <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${config.gradient} flex items-center justify-center flex-shrink-0`}>
                    <Icon className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-gray-900 truncate">{config.label}</p>
                    <span className="text-xs font-bold text-red-600">৳{(bill.amount || 0).toLocaleString()}</span>
                  </div>
                  <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0"></span>
                </button>
              );
            })}
          </div>
        )}

        {paidBills.length > 0 && (
          <div>
            <div className="px-3 py-2 border-t border-gray-50">
              <span className="text-[10px] font-bold text-emerald-500 uppercase">Paid ({paidBills.length})</span>
            </div>
            {paidBills.map((bill) => {
              const config = billTypeConfig[bill.type] || billTypeConfig.rent;
              const Icon = config.icon;
              const isSelected = selectedBill?.id === bill.id;
              return (
                <button key={bill.id} onClick={() => onSelectBill(bill)}
                  className={`w-full px-3 py-2.5 flex items-center gap-3 hover:bg-gray-50 transition-colors text-left ${
                    isSelected ? 'bg-violet-50 border-r-2 border-violet-500' : ''
                  }`}>
                  <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${config.gradient} flex items-center justify-center flex-shrink-0 opacity-70`}>
                    <Icon className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-500 truncate">{config.label}</p>
                    <span className="text-xs text-gray-400">৳{(bill.amount || 0).toLocaleString()}</span>
                  </div>
                  <CheckCircle className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                </button>
              );
            })}
          </div>
        )}

        {bills.length === 0 && (
          <div className="p-6 text-center">
            <FileText className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-xs text-gray-400">No bills</p>
          </div>
        )}
      </div>
    </div>
  );
}