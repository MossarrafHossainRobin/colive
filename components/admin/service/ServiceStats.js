'use client'

export default function ServiceStats({ charges }) {
  const totalAdvance = charges.reduce((s, c) => s + 
    (c.houseRentAdvance||0) + (c.utilityAdvance||0) + (c.serviceChargeAdvance||0) + 
    (c.securityDeposit||0) + (c.maintenanceDeposit||0) + (c.khalaBuaAdvance||0) + (c.extraDeposit||0), 0);
  
  const totalRefundable = charges.reduce((s, c) => s + (c.refundableAmount||0), 0);
  const totalNonRefundable = charges.reduce((s, c) => s + (c.nonRefundableAmount||0), 0);
  const totalReturned = charges.reduce((s, c) => s + (c.returnedAmount||0), 0);
  const totalPending = charges.reduce((s, c) => s + (c.pendingRefund||0), 0);
  const activeMembers = charges.filter(c => c.status === 'active').length;

  const stats = [
    { label: 'Total Collected', value: `৳${totalAdvance.toFixed(0)}`, sub: `${charges.length} entries` },
    { label: 'Refundable', value: `৳${totalRefundable.toFixed(0)}`, sub: 'Returnable' },
    { label: 'Non-Refundable', value: `৳${totalNonRefundable.toFixed(0)}`, sub: 'Kept' },
    { label: 'Returned', value: `৳${totalReturned.toFixed(0)}`, sub: 'Already paid back' },
    { label: 'Pending Refund', value: `৳${totalPending.toFixed(0)}`, sub: 'Yet to return' },
    { label: 'Active Members', value: activeMembers, sub: 'With active charges' },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
      {stats.map((s, i) => (
        <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm hover:shadow-md transition-shadow">
          <p className="text-xl font-bold text-gray-900">{s.value}</p>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-1">{s.label}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">{s.sub}</p>
        </div>
      ))}
    </div>
  );
}