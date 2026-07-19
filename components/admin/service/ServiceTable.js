'use client'

import { useState } from 'react';
import { db } from '@/lib/firebase';
import { doc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { sendAdminChatUpdate } from '@/lib/adminChatMessage';

const statusColors = {
  active: 'bg-green-100 text-green-700',
  pending: 'bg-amber-100 text-amber-700',
  partially_refunded: 'bg-blue-100 text-blue-700',
  refunded: 'bg-gray-100 text-gray-700',
  adjusted: 'bg-purple-100 text-purple-700',
  moved_out: 'bg-red-100 text-red-700',
};

export default function ServiceTable({ charges, users, onUpdate }) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selected, setSelected] = useState(new Set());
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [showRefund, setShowRefund] = useState(null);
  const [refundAmount, setRefundAmount] = useState('');

  const filtered = charges.filter(c => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    if (search) {
      const user = users.find(u => u.id === c.userId);
      return user?.name?.toLowerCase().includes(search.toLowerCase());
    }
    return true;
  });

  const toggleSelect = (id) => { const ns = new Set(selected); ns.has(id) ? ns.delete(id) : ns.add(id); setSelected(ns); };

  const getTotalAdvance = (c) => (c.houseRentAdvance||0)+(c.utilityAdvance||0)+(c.serviceChargeAdvance||0)+(c.securityDeposit||0)+(c.maintenanceDeposit||0)+(c.khalaBuaAdvance||0)+(c.extraDeposit||0);

  const startEdit = (c) => { setEditing(c.id); setEditForm({ refundableAmount: c.refundableAmount||0, nonRefundableAmount: c.nonRefundableAmount||0, damageCharge: c.damageCharge||0, returnedAmount: c.returnedAmount||0, status: c.status||'active' }); };

  const saveEdit = async (id) => {
    const charge = charges.find((item) => item.id === id);
    const data = {
      refundableAmount: Number(editForm.refundableAmount)||0,
      nonRefundableAmount: Number(editForm.nonRefundableAmount)||0,
      damageCharge: Number(editForm.damageCharge)||0,
      returnedAmount: Number(editForm.returnedAmount)||0,
      pendingRefund: Math.max(0, (Number(editForm.refundableAmount)||0) - (Number(editForm.returnedAmount)||0) - (Number(editForm.damageCharge)||0)),
      status: editForm.status,
      updatedAt: new Date(),
    };
    await updateDoc(doc(db, "serviceCharges", id), data);
    const member = users.find((user) => user.id === charge?.userId);
    await sendAdminChatUpdate({
      member,
      category: 'service',
      title: 'Service charge updated',
      summary: 'Your service charge information has been updated by the admin.',
      fields: [
        { label: 'Refundable', value: `Tk ${data.refundableAmount.toLocaleString('en-US')}` },
        { label: 'Non-refundable', value: `Tk ${data.nonRefundableAmount.toLocaleString('en-US')}` },
        { label: 'Damage charge', value: `Tk ${data.damageCharge.toLocaleString('en-US')}` },
        { label: 'Returned', value: `Tk ${data.returnedAmount.toLocaleString('en-US')}` },
        { label: 'Pending refund', value: `Tk ${data.pendingRefund.toLocaleString('en-US')}` },
        { label: 'Status', value: data.status },
      ],
      details: data,
      notify: true,
    }).catch((error) => console.error('Service update chat failed:', error));
    setEditing(null);
    onUpdate && onUpdate();
  };

  const processRefund = async () => {
    if (!showRefund || !refundAmount) return;
    const charge = charges.find(c => c.id === showRefund);
    const amount = Number(refundAmount);
    
    const updatedReturned = (charge.returnedAmount||0) + amount;
    const pendingRefund = Math.max(0, (charge.refundableAmount||0) - updatedReturned - (charge.damageCharge||0));
    const newStatus = pendingRefund <= 0 ? 'refunded' : 'partially_refunded';

    await updateDoc(doc(db, "serviceCharges", showRefund), {
      returnedAmount: updatedReturned,
      pendingRefund,
      status: newStatus,
      updatedAt: new Date(),
      paymentHistory: [...(charge.paymentHistory||[]), {
        type: 'refund',
        amount,
        date: new Date().toISOString(),
        note: 'Refund processed',
      }],
    });

    const member = users.find((user) => user.id === charge.userId);
    await sendAdminChatUpdate({
      member,
      category: 'service',
      title: 'Refund processed',
      summary: 'A refund has been processed for your service account.',
      fields: [
        { label: 'Refund amount', value: `Tk ${amount.toLocaleString('en-US')}` },
        { label: 'Total returned', value: `Tk ${updatedReturned.toLocaleString('en-US')}` },
        { label: 'Remaining refund', value: `Tk ${pendingRefund.toLocaleString('en-US')}` },
        { label: 'Status', value: newStatus },
      ],
      details: { amount, updatedReturned, pendingRefund, status: newStatus },
      notify: true,
    }).catch((error) => console.error('Refund chat update failed:', error));

    setShowRefund(null);
    setRefundAmount('');
    onUpdate && onUpdate();
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-4 border-b flex flex-col sm:flex-row gap-2 items-start sm:items-center justify-between">
        <h2 className="font-bold text-gray-900">Service Charges ({filtered.length})</h2>
        <div className="flex gap-2 flex-wrap">
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs w-32" />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs">
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="pending">Pending</option>
            <option value="partially_refunded">Partially Refunded</option>
            <option value="refunded">Refunded</option>
            <option value="moved_out">Moved Out</option>
          </select>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left">
              <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase">Member</th>
              <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase">Room</th>
              <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase">Total</th>
              <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase">Refundable</th>
              <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase">Returned</th>
              <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase">Pending</th>
              <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase">Status</th>
              <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.map(c => {
              const user = users.find(u => u.id === c.userId);
              const isEditing = editing === c.id;
              const total = getTotalAdvance(c);
              return (
                <tr key={c.id} className="hover:bg-gray-50 transition">
                  <td className="px-4 py-3 font-medium text-gray-900 text-xs">{user?.name||'N/A'}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{c.roomId||'-'}</td>
                  <td className="px-4 py-3 font-bold text-xs">৳{total.toFixed(0)}</td>
                  <td className="px-4 py-3 text-xs text-green-600">
                    {isEditing ? <input type="number" value={editForm.refundableAmount} onChange={e=>setEditForm({...editForm,refundableAmount:e.target.value})} className="w-16 border rounded px-1 text-xs" /> : `৳${c.refundableAmount||0}`}
                  </td>
                  <td className="px-4 py-3 text-xs text-blue-600">৳{c.returnedAmount||0}</td>
                  <td className="px-4 py-3 font-bold text-xs text-red-600">৳{c.pendingRefund||0}</td>
                  <td className="px-4 py-3">
                    {isEditing ? (
                      <select value={editForm.status} onChange={e=>setEditForm({...editForm,status:e.target.value})} className="border rounded px-1 text-[10px]">
                        <option value="active">Active</option><option value="pending">Pending</option><option value="partially_refunded">Partially Refunded</option><option value="refunded">Refunded</option><option value="moved_out">Moved Out</option>
                      </select>
                    ) : (
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusColors[c.status]}`}>{c.status.replace('_',' ')}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      {isEditing ? (
                        <>
                          <button onClick={()=>saveEdit(c.id)} className="text-green-600 text-[10px] font-bold">Save</button>
                          <button onClick={()=>setEditing(null)} className="text-gray-400 text-[10px]">Cancel</button>
                        </>
                      ) : (
                        <>
                          <button onClick={()=>startEdit(c)} className="text-gray-500 text-[10px] font-medium hover:text-black">Edit</button>
                          {c.pendingRefund > 0 && (
                            <button onClick={()=>setShowRefund(c.id)} className="text-green-600 text-[10px] font-medium hover:text-green-800 ml-1">Refund</button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="p-10 text-center text-sm text-gray-400">No service charge records</div>
        )}
      </div>

      {showRefund && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={()=>setShowRefund(null)}>
          <div className="bg-white rounded-2xl p-6 w-80 shadow-xl" onClick={e=>e.stopPropagation()}>
            <h3 className="font-bold text-gray-900 mb-3">Process Refund</h3>
            <input type="number" value={refundAmount} onChange={e=>setRefundAmount(e.target.value)} placeholder="Amount (৳)" className="w-full px-4 py-2.5 border rounded-xl text-sm mb-3" />
            <div className="flex gap-2">
              <button onClick={()=>setShowRefund(null)} className="flex-1 py-2 border rounded-xl text-sm">Cancel</button>
              <button onClick={processRefund} className="flex-1 py-2 bg-green-600 text-white rounded-xl text-sm font-semibold">Confirm Refund</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
