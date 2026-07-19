'use client'

import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { calculateMemberMonthlyBazarTotal } from '@/lib/bazarCalculations';
import { collection, query, where, getDocs, orderBy, doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { deleteMemberEverywhere } from '@/lib/memberCleanup';
import { normalizeEmail } from '@/lib/memberIdentity';
import { dedupeMealRecords } from '@/lib/mealRecords';

const tabs = [
  { id: 'overview', label: 'Overview' },
  { id: 'bills', label: 'Bills' },
  { id: 'meals', label: 'Meals' },
  { id: 'bazar', label: 'Bazar' },
  { id: 'service', label: 'Service Charges' },
  { id: 'ledger', label: 'Ledger' },
];

export default function MemberDetail({ member, bills, bazars, selectedMonth, onClose }) {
  const [meals, setMeals] = useState([]);
  const [serviceCharges, setServiceCharges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [showAddMember, setShowAddMember] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [addForm, setAddForm] = useState({
    name: '', email: '', phone: '', role: 'member', room: '', balance: 0, totalDues: 0,
  });
  const [addLoading, setAddLoading] = useState(false);
  const [addMessage, setAddMessage] = useState('');

  useEffect(() => {
    if (!member) return;

    const fetchMeals = async () => {
      const q = query(collection(db, "meals"), where("userId", "==", member.id), where("month", "==", selectedMonth), orderBy("date", "desc"));
      const snap = await getDocs(q);
      setMeals(dedupeMealRecords(
        snap.docs.map(d => ({ id: d.id, ...d.data() })),
        { month: selectedMonth }
      ));
      setLoading(false);
    };

    const fetchServiceCharges = async () => {
      const q = query(collection(db, "serviceCharges"), where("userId", "==", member.id));
      const snap = await getDocs(q);
      setServiceCharges(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    };

    fetchMeals();
    fetchServiceCharges();
  }, [member, selectedMonth]);

  const handleAddMember = async (e) => {
    e.preventDefault();
    if (!addForm.name || !addForm.email) {
      setAddMessage('Name and email are required');
      return;
    }
    setAddLoading(true);
    
    const normalizedEmail = normalizeEmail(addForm.email);
    const existingByEmail = await getDocs(
      query(collection(db, "users"), where("emailLower", "==", normalizedEmail))
    ).catch(() => null);
    const existingDoc = existingByEmail?.docs?.[0];

    if (existingDoc) {
      await updateDoc(existingDoc.ref, {
        name: addForm.name,
        email: addForm.email,
        emailLower: normalizedEmail,
        phone: addForm.phone || '',
        role: addForm.role,
        room: addForm.room || '',
        balance: Number(addForm.balance) || 0,
        totalDues: Number(addForm.totalDues) || 0,
        isActive: true,
        membershipStatus: 'active',
        updatedAt: serverTimestamp(),
      });
    } else {
      const newUserRef = doc(collection(db, "users"));

      await setDoc(newUserRef, {
      uid: newUserRef.id,
      name: addForm.name,
      email: addForm.email,
      emailLower: normalizedEmail,
      phone: addForm.phone || '',
      role: addForm.role,
      room: addForm.room || '',
      balance: Number(addForm.balance) || 0,
      totalDues: Number(addForm.totalDues) || 0,
      isActive: true,
      membershipStatus: 'active',
      notificationEnabled: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      });
    }

    setAddMessage('Member added successfully!');
    setAddForm({ name: '', email: '', phone: '', role: 'member', room: '', balance: 0, totalDues: 0 });
    setAddLoading(false);
    setTimeout(() => { setShowAddMember(false); setAddMessage(''); }, 1500);
  };

  const handleDeleteMember = async () => {
    setDeleteLoading(true);
    try {
      await deleteMemberEverywhere({
        userId: member.id,
        email: member.email,
        profile: member,
        deletedBy: 'admin',
        archive: true,
      });
      setShowDeleteConfirm(false);
      onClose();
    } catch (error) {
      console.error('Error deleting member:', error);
    }
    setDeleteLoading(false);
  };

  const monthlyBills = bills.filter(b => b.userId === member.id && b.month === selectedMonth);
  const monthlyBazars = bazars.filter(b => b.userId === member.id && b.month === selectedMonth && !b.isDeleted);
  
  const totalBills = monthlyBills.reduce((s, b) => s + (b.amount || 0), 0);
  const totalPaid = monthlyBills.filter(b => b.status === 'paid').reduce((s, b) => s + (b.amount || 0), 0);
  const totalPending = monthlyBills.filter(b => b.status !== 'paid').reduce((s, b) => s + (b.dueAmount || b.amount || 0), 0);
  const totalBazar = calculateMemberMonthlyBazarTotal(
    monthlyBazars,
    member.id,
    selectedMonth
  );
  const totalMeals = meals.reduce((s, m) => s + (m.lunch || 0) + (m.dinner || 0) + (m.guestMeal || 0), 0);
  const totalServiceAdvance = serviceCharges.reduce((s, c) => s + (c.houseRentAdvance||0)+(c.utilityAdvance||0)+(c.serviceChargeAdvance||0)+(c.securityDeposit||0)+(c.maintenanceDeposit||0)+(c.khalaBuaAdvance||0)+(c.extraDeposit||0), 0);
  const totalServiceRefundable = serviceCharges.reduce((s, c) => s + (c.refundableAmount||0), 0);

  const billTypeLabels = { rent: 'House Rent', advance: 'Advance Rent', gas: 'Gas Bill', water: 'Water Bill', electricity: 'Current Bill', wifi: 'WiFi Bill', dust: 'Dust Bill', bua: 'Bua Bill', khala: 'Khala Bill', service: 'Service Charge', mealDue: 'Meal Due', bazarDue: 'Bazar Due', extra: 'Extra Charges', maintenance: 'Maintenance', emergency: 'Emergency' };
  const statusColors = { paid: 'bg-green-100 text-green-700', pending: 'bg-amber-100 text-amber-700', partial: 'bg-blue-100 text-blue-700', overdue: 'bg-red-100 text-red-700' };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
        <div className="bg-white rounded-2xl p-8 w-full max-w-4xl">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-300 border-t-black mx-auto"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-5xl max-h-[92vh] overflow-hidden shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between z-10 rounded-t-2xl flex-shrink-0">
          <div className="flex items-center gap-4">
            {member.photo ? (
              <img src={member.photo} className="w-12 h-12 rounded-full border-2 border-gray-100" alt="" />
            ) : (
              <div className="w-12 h-12 bg-black rounded-full flex items-center justify-center text-white text-lg font-bold">
                {member.name?.charAt(0)?.toUpperCase()}
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-gray-900">{member.name}</h2>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${member.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {member.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
              <p className="text-xs text-gray-500">{member.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); setShowAddMember(true); }}
              className="bg-black text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-gray-800 transition"
            >
              Add Member
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(true); }}
              className="bg-red-500 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-red-600 transition"
            >
              Delete
            </button>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition">
              <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Quick Info Bar */}
        <div className="bg-gray-50 border-b px-6 py-3 grid grid-cols-4 gap-4 flex-shrink-0">
          <div><p className="text-[10px] text-gray-400 uppercase font-bold">Room</p><p className="text-sm font-bold text-gray-900">{member.room || 'N/A'}</p></div>
          <div><p className="text-[10px] text-gray-400 uppercase font-bold">Phone</p><p className="text-sm font-bold text-gray-900">{member.phone || 'N/A'}</p></div>
          <div><p className="text-[10px] text-gray-400 uppercase font-bold">Joined</p><p className="text-sm font-bold text-gray-900">{member.createdAt?.toDate?.()?.toLocaleDateString?.() || 'N/A'}</p></div>
          <div><p className="text-[10px] text-gray-400 uppercase font-bold">Role</p><p className="text-sm font-bold text-gray-900 capitalize">{member.role}</p></div>
        </div>

        {/* Tabs */}
        <div className="border-b px-6 flex gap-0 flex-shrink-0">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-sm font-medium transition-all border-b-2 -mb-[1px] ${
                activeTab === tab.id ? 'text-black border-black' : 'text-gray-400 border-transparent hover:text-gray-600'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white border rounded-xl p-4 text-center shadow-sm">
                  <p className="text-2xl font-bold text-gray-900">৳{totalBills.toFixed(0)}</p>
                  <p className="text-[10px] text-gray-400 uppercase font-bold mt-1">Total Bills</p>
                </div>
                <div className="bg-green-50 border border-green-100 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-green-700">৳{totalPaid.toFixed(0)}</p>
                  <p className="text-[10px] text-green-600 uppercase font-bold mt-1">Paid</p>
                </div>
                <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-red-700">৳{totalPending.toFixed(0)}</p>
                  <p className="text-[10px] text-red-600 uppercase font-bold mt-1">Pending</p>
                </div>
                <div className="bg-white border rounded-xl p-4 text-center shadow-sm">
                  <p className="text-2xl font-bold text-gray-900">{totalMeals.toFixed(1)}</p>
                  <p className="text-[10px] text-gray-400 uppercase font-bold mt-1">Total Meals</p>
                </div>
                <div className="bg-white border rounded-xl p-4 text-center shadow-sm">
                  <p className="text-2xl font-bold text-gray-900">{monthlyBazars.length}</p>
                  <p className="text-[10px] text-gray-400 uppercase font-bold mt-1">Bazar Count</p>
                </div>
                <div className="bg-white border rounded-xl p-4 text-center shadow-sm">
                  <p className="text-2xl font-bold text-gray-900">৳{totalBazar.toFixed(0)}</p>
                  <p className="text-[10px] text-gray-400 uppercase font-bold mt-1">Bazar Amount</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white border rounded-xl p-4 shadow-sm">
                  <p className="text-[10px] text-gray-400 uppercase font-bold mb-2">Service Advances</p>
                  <p className="text-xl font-bold text-gray-900">৳{totalServiceAdvance.toFixed(0)}</p>
                  <p className="text-[10px] text-green-600 mt-1">Refundable: ৳{totalServiceRefundable.toFixed(0)}</p>
                </div>
                <div className="bg-white border rounded-xl p-4 shadow-sm">
                  <p className="text-[10px] text-gray-400 uppercase font-bold mb-2">Balance</p>
                  <p className="text-xl font-bold text-gray-900">৳{(member.balance || 0).toFixed(0)}</p>
                  <p className="text-[10px] text-red-600 mt-1">Dues: ৳{(member.totalDues || 0).toFixed(0)}</p>
                </div>
              </div>
            </div>
          )}

          {/* Bills Tab */}
          {activeTab === 'bills' && (
            <div>
              {monthlyBills.length > 0 ? (
                <div className="space-y-2">
                  {monthlyBills.map(b => (
                    <div key={b.id} className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
                      <span className="text-sm font-medium text-gray-700">{billTypeLabels[b.type] || b.type}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold">৳{b.amount}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusColors[b.status] || ''}`}>{b.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400 text-center py-8">No bills this month</p>
              )}
            </div>
          )}

          {/* Meals Tab */}
          {activeTab === 'meals' && (
            <div>
              {meals.length > 0 ? (
                <div className="space-y-2">
                  {meals.map(m => (
                    <div key={m.id} className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
                      <span className="text-sm font-medium text-gray-700">{m.date}</span>
                      <div className="flex items-center gap-4">
                        <span className="text-sm">L: {m.lunch||0}</span>
                        <span className="text-sm">D: {m.dinner||0}</span>
                        {m.guestMeal > 0 && <span className="text-sm text-pink-600">G: {m.guestMeal}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400 text-center py-8">No meals this month</p>
              )}
            </div>
          )}

          {/* Bazar Tab */}
          {activeTab === 'bazar' && (
            <div>
              {monthlyBazars.length > 0 ? (
                <div className="space-y-2">
                  {monthlyBazars.map(b => (
                    <div key={b.id} className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
                      <div>
                        <span className="text-sm font-medium text-gray-700">{b.place}</span>
                        <span className="text-xs text-gray-500 ml-2">{b.date}</span>
                      </div>
                      <span className="text-sm font-bold text-green-600">৳{b.amount}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400 text-center py-8">No bazar this month</p>
              )}
            </div>
          )}

          {/* Service Charges Tab */}
          {activeTab === 'service' && (
            <div>
              {serviceCharges.length > 0 ? (
                <div className="space-y-3">
                  {serviceCharges.map(c => (
                    <div key={c.id} className="bg-gray-50 rounded-xl p-4">
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        {c.houseRentAdvance > 0 && <div><span className="text-gray-500">Rent Advance:</span> <span className="font-bold">৳{c.houseRentAdvance}</span></div>}
                        {c.utilityAdvance > 0 && <div><span className="text-gray-500">Utility:</span> <span className="font-bold">৳{c.utilityAdvance}</span></div>}
                        {c.serviceChargeAdvance > 0 && <div><span className="text-gray-500">Service:</span> <span className="font-bold">৳{c.serviceChargeAdvance}</span></div>}
                        {c.securityDeposit > 0 && <div><span className="text-gray-500">Security:</span> <span className="font-bold">৳{c.securityDeposit}</span></div>}
                        {c.maintenanceDeposit > 0 && <div><span className="text-gray-500">Maintenance:</span> <span className="font-bold">৳{c.maintenanceDeposit}</span></div>}
                      </div>
                      <div className="flex items-center justify-between mt-3 pt-3 border-t">
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-green-600 font-medium">Refundable: ৳{c.refundableAmount||0}</span>
                          <span className="text-xs text-blue-600 font-medium">Returned: ৳{c.returnedAmount||0}</span>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${c.status === 'active' ? 'bg-green-100 text-green-700' : c.status === 'refunded' ? 'bg-gray-100 text-gray-700' : 'bg-amber-100 text-amber-700'}`}>
                          {c.status?.replace('_',' ') || 'active'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400 text-center py-8">No service charges</p>
              )}
            </div>
          )}

          {/* Ledger Tab */}
          {activeTab === 'ledger' && (
            <div>
              <div className="bg-gray-50 rounded-xl p-4 mb-4">
                <p className="text-xs font-bold text-gray-400 uppercase mb-2">Financial Summary ({selectedMonth})</p>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex justify-between"><span className="text-gray-500">Total Bills:</span><span className="font-bold">৳{totalBills.toFixed(0)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Total Paid:</span><span className="font-bold text-green-600">৳{totalPaid.toFixed(0)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Pending:</span><span className="font-bold text-red-600">৳{totalPending.toFixed(0)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Bazar Total:</span><span className="font-bold">৳{totalBazar.toFixed(0)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Service Adv:</span><span className="font-bold">৳{totalServiceAdvance.toFixed(0)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Refundable:</span><span className="font-bold text-green-600">৳{totalServiceRefundable.toFixed(0)}</span></div>
                </div>
              </div>
              <p className="text-xs text-gray-400 text-center">Complete transaction history</p>
            </div>
          )}
        </div>

        {/* Add Member Modal */}
        {showAddMember && (
          <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center" onClick={() => setShowAddMember(false)}>
            <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
              <h2 className="text-xl font-bold text-gray-900 mb-4">Add New Member</h2>
              
              {addMessage && (
                <div className={`px-4 py-3 rounded-xl mb-4 text-sm font-medium ${addMessage.includes('success') ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                  {addMessage}
                </div>
              )}

              <form onSubmit={handleAddMember} className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Full Name *</label>
                  <input type="text" value={addForm.name} onChange={e => setAddForm({...addForm, name: e.target.value})}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 outline-none" placeholder="Member name" required />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Email *</label>
                  <input type="email" value={addForm.email} onChange={e => setAddForm({...addForm, email: e.target.value})}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 outline-none" placeholder="email@example.com" required />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Phone</label>
                  <input type="text" value={addForm.phone} onChange={e => setAddForm({...addForm, phone: e.target.value})}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 outline-none" placeholder="01XXXXXXXXX" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-500 mb-1 block">Role</label>
                    <select value={addForm.role} onChange={e => setAddForm({...addForm, role: e.target.value})}
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm">
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500 mb-1 block">Room</label>
                    <select value={addForm.room} onChange={e => setAddForm({...addForm, room: e.target.value})}
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm">
                      <option value="">None</option>
                      <option value="Room 1">Room 1</option>
                      <option value="Room 2">Room 2</option>
                      <option value="Room 3">Room 3</option>
                    </select>
                  </div>
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setShowAddMember(false)}
                    className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
                  <button type="submit" disabled={addLoading}
                    className="flex-1 py-2.5 bg-black text-white rounded-xl text-sm font-semibold hover:bg-gray-800 disabled:opacity-50">
                    {addLoading ? 'Adding...' : 'Add Member'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center" onClick={() => setShowDeleteConfirm(false)}>
            <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-gray-900 text-center mb-2">Delete Member</h3>
              <p className="text-sm text-gray-500 text-center mb-4">
                Are you sure you want to delete <strong>{member.name}</strong>? This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteMember}
                  disabled={deleteLoading}
                  className="flex-1 py-2.5 bg-red-500 text-white rounded-xl text-sm font-semibold hover:bg-red-600 disabled:opacity-50"
                >
                  {deleteLoading ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
