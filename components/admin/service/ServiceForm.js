'use client'

import { useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { sendAdminChatUpdate } from '@/lib/adminChatMessage';
import { isMemberAccountActive } from '@/lib/memberPolicy';

const rooms = ['Room 1', 'Room 2', 'Room 3'];

const chargeFields = [
  { key: 'houseRentAdvance', label: 'House Rent Advance' },
  { key: 'utilityAdvance', label: 'Utility Advance' },
  { key: 'serviceChargeAdvance', label: 'Service Charge' },
  { key: 'securityDeposit', label: 'Security Deposit' },
  { key: 'maintenanceDeposit', label: 'Maintenance Deposit' },
  { key: 'khalaBuaAdvance', label: 'Khala/Bua Advance' },
  { key: 'extraDeposit', label: 'Extra Deposit' },
];

export default function ServiceForm({ users, onSuccess }) {
  const [form, setForm] = useState({
    userId: '', roomId: '',
    houseRentAdvance: '', utilityAdvance: '', serviceChargeAdvance: '',
    securityDeposit: '', maintenanceDeposit: '', khalaBuaAdvance: '', extraDeposit: '',
    refundableAmount: '', nonRefundableAmount: '', damageCharge: '',
    returnedAmount: '', status: 'active', notes: '',
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleChange = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const totalAdvance = chargeFields.reduce((sum, f) => sum + (Number(form[f.key]) || 0), 0);
  const totalRefundable = Number(form.refundableAmount) || 0;
  const totalNonRefundable = Number(form.nonRefundableAmount) || 0;
  const totalReturned = Number(form.returnedAmount) || 0;
  const pendingRefund = totalRefundable - totalReturned - (Number(form.damageCharge) || 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.userId) return;
    setLoading(true);

    const data = {
      userId: form.userId,
      roomId: form.roomId,
      houseRentAdvance: Number(form.houseRentAdvance) || 0,
      utilityAdvance: Number(form.utilityAdvance) || 0,
      serviceChargeAdvance: Number(form.serviceChargeAdvance) || 0,
      securityDeposit: Number(form.securityDeposit) || 0,
      maintenanceDeposit: Number(form.maintenanceDeposit) || 0,
      khalaBuaAdvance: Number(form.khalaBuaAdvance) || 0,
      extraDeposit: Number(form.extraDeposit) || 0,
      refundableAmount: Number(form.refundableAmount) || 0,
      nonRefundableAmount: Number(form.nonRefundableAmount) || 0,
      damageCharge: Number(form.damageCharge) || 0,
      returnedAmount: Number(form.returnedAmount) || 0,
      pendingRefund: Math.max(0, pendingRefund),
      status: form.status,
      notes: form.notes,
      paymentHistory: [{
        type: 'deposit',
        amount: totalAdvance,
        date: new Date().toISOString(),
        note: 'Initial deposit',
      }],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await addDoc(collection(db, "serviceCharges"), data);

    await addDoc(collection(db, "notifications"), {
      title: 'Service Charge Added',
      body: `Total Advance: ৳${totalAdvance} | Refundable: ৳${totalRefundable}`,
      userId: form.userId,
      type: 'service',
      link: '/dashboard',
      read: false,
      createdAt: serverTimestamp(),
    });

    const selectedMember = users.find((user) => user.id === form.userId);
    await sendAdminChatUpdate({
      member: selectedMember,
      category: 'service',
      title: 'Service charge updated',
      summary: 'Your service charge and advance information has been updated.',
      fields: [
        { label: 'Room', value: form.roomId },
        { label: 'Total advance', value: `Tk ${totalAdvance.toLocaleString('en-US')}` },
        { label: 'Refundable', value: `Tk ${totalRefundable.toLocaleString('en-US')}` },
        { label: 'Pending refund', value: `Tk ${Math.max(0, pendingRefund).toLocaleString('en-US')}` },
        { label: 'Status', value: form.status },
        { label: 'Notes', value: form.notes },
      ],
      details: data,
      notify: true,
    }).catch((error) => console.error('Service chat update failed:', error));

    setMessage('Service charge entry added');
    setForm({ userId: '', roomId: '', houseRentAdvance: '', utilityAdvance: '', serviceChargeAdvance: '', securityDeposit: '', maintenanceDeposit: '', khalaBuaAdvance: '', extraDeposit: '', refundableAmount: '', nonRefundableAmount: '', damageCharge: '', returnedAmount: '', status: 'active', notes: '' });
    setLoading(false);
    onSuccess && onSuccess();
    setTimeout(() => setMessage(''), 3000);
  };

  const inputClass = "w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition bg-white";

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
      <h2 className="text-lg font-bold text-gray-900 mb-4">Add Service Charge / Advance</h2>

      {message && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded-lg mb-4 text-sm font-medium">{message}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <select value={form.userId} onChange={e => handleChange('userId', e.target.value)} className={inputClass} required>
          <option value="">Select Member</option>
          {users.filter(isMemberAccountActive).map(u => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>

        <select value={form.roomId} onChange={e => handleChange('roomId', e.target.value)} className={inputClass}>
          <option value="">Select Room</option>
          {rooms.map(r => <option key={r} value={r}>{r}</option>)}
        </select>

        <div className="border-t pt-3">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Advance / Deposit Fields</p>
          <div className="grid grid-cols-2 gap-2">
            {chargeFields.map(f => (
              <div key={f.key}>
                <label className="text-[10px] font-medium text-gray-500 mb-0.5 block">{f.label}</label>
                <input type="number" value={form[f.key]} onChange={e => handleChange(f.key, e.target.value)} placeholder="0" className={inputClass} />
              </div>
            ))}
          </div>
        </div>

        <div className="border-t pt-3">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Refund / Settlement</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-medium text-green-600 mb-0.5 block">Refundable Amount</label>
              <input type="number" value={form.refundableAmount} onChange={e => handleChange('refundableAmount', e.target.value)} placeholder="0" className={`${inputClass} border-green-200`} />
            </div>
            <div>
              <label className="text-[10px] font-medium text-red-500 mb-0.5 block">Non-Refundable</label>
              <input type="number" value={form.nonRefundableAmount} onChange={e => handleChange('nonRefundableAmount', e.target.value)} placeholder="0" className={`${inputClass} border-red-200`} />
            </div>
            <div>
              <label className="text-[10px] font-medium text-red-500 mb-0.5 block">Damage Charge</label>
              <input type="number" value={form.damageCharge} onChange={e => handleChange('damageCharge', e.target.value)} placeholder="0" className={`${inputClass} border-red-200`} />
            </div>
            <div>
              <label className="text-[10px] font-medium text-blue-600 mb-0.5 block">Returned Amount</label>
              <input type="number" value={form.returnedAmount} onChange={e => handleChange('returnedAmount', e.target.value)} placeholder="0" className={`${inputClass} border-blue-200`} />
            </div>
          </div>
        </div>

        <div>
          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Status</label>
          <select value={form.status} onChange={e => handleChange('status', e.target.value)} className={inputClass}>
            <option value="active">Active</option>
            <option value="pending">Pending</option>
            <option value="partially_refunded">Partially Refunded</option>
            <option value="refunded">Refunded</option>
            <option value="adjusted">Adjusted</option>
            <option value="moved_out">Moved Out</option>
          </select>
        </div>

        <div>
          <label className="text-[10px] font-medium text-gray-500 mb-1 block">Notes</label>
          <textarea value={form.notes} onChange={e => handleChange('notes', e.target.value)} rows={2} placeholder="Optional notes..." className={inputClass} />
        </div>

        <div className="bg-gray-50 rounded-xl p-3 space-y-1 text-xs">
          <div className="flex justify-between"><span className="text-gray-500">Total Advance:</span><span className="font-bold">৳{totalAdvance.toFixed(0)}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Refundable:</span><span className="font-bold text-green-600">৳{totalRefundable.toFixed(0)}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Pending Refund:</span><span className={`font-bold ${pendingRefund > 0 ? 'text-red-600' : 'text-green-600'}`}>৳{Math.max(0, pendingRefund).toFixed(0)}</span></div>
        </div>

        <button type="submit" disabled={loading || !form.userId}
          className="w-full bg-black text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-800 transition disabled:opacity-50">
          {loading ? 'Adding...' : 'Save Service Charge Entry'}
        </button>
      </form>
    </div>
  );
}
