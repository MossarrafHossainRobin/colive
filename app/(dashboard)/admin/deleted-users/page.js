'use client'

import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, doc, setDoc, deleteDoc, updateDoc, serverTimestamp, addDoc, getDocs, where } from 'firebase/firestore';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Loader2, User, Mail, Phone, Home, Calendar, Clock, Trash2, 
  RefreshCw, Search, Eye, ArrowLeft, Shield, ShoppingCart, 
  Utensils, FileText, DollarSign, Activity, Key, Copy, Ban,
  CheckCircle, XCircle, AlertCircle, Bell, MessageSquare
} from 'lucide-react';
import { normalizeEmail } from '@/lib/memberIdentity';

export default function DeletedUsersPage() {
  const [deletedUsers, setDeletedUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [activeTab, setActiveTab] = useState('meals');
  const [restoring, setRestoring] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "deletedUsers"), orderBy("deletedAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setDeletedUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // ============ RESTORE USER ============
  const handleRestoreUser = async (userData) => {
    if (!confirm(`Restore ${userData.displayName || userData.name}? This will recreate their account with all data.`)) return;
    
    setRestoring(true);
    let restoredMeals = 0;
    let restoredBazar = 0;
    let restoredBills = 0;
    let restoredExpenses = 0;
    let restoredChats = 0;

    try {
      // STEP 1: Restore user profile to users collection
      await setDoc(doc(db, "users", userData.userId), {
        email: userData.email || '',
        emailLower: normalizeEmail(userData.email),
        displayName: userData.displayName || userData.name || '',
        name: userData.name || '',
        phone: userData.phone || '',
        photo: userData.photo || '',
        room: userData.room || '',
        role: userData.role || 'member',
        memberId: userData.memberId || '',
        balance: userData.balance || 0,
        totalDues: userData.totalDues || 0,
        rentAmount: userData.rentAmount || 0,
        serviceCharge: userData.serviceCharge || 0,
        isActive: true,
        membershipStatus: 'active',
        isBlocked: false,
        notificationEnabled: userData.notificationSettings?.enabled || false,
        language: userData.language || 'en',
        updatedAt: serverTimestamp(),
        restoredAt: serverTimestamp(),
        restoredFrom: userData.userId,
      });

      // STEP 2: Restore meals
      if (userData.meals?.length > 0) {
        for (const meal of userData.meals) {
          try {
            const { id, ...mealData } = meal;
            await setDoc(doc(db, "meals", id || doc(collection(db, "meals")).id), {
              ...mealData,
              restoredAt: serverTimestamp(),
            });
            restoredMeals++;
          } catch (e) { console.error('Meal restore error:', e); }
        }
      }

      // STEP 3: Restore bazar entries
      if (userData.bazar?.length > 0) {
        for (const bazar of userData.bazar) {
          try {
            const { id, ...bazarData } = bazar;
            await setDoc(doc(db, "bazar", id || doc(collection(db, "bazar")).id), {
              ...bazarData,
              restoredAt: serverTimestamp(),
            });
            restoredBazar++;
          } catch (e) { console.error('Bazar restore error:', e); }
        }
      }

      // STEP 4: Restore bills
      if (userData.bills?.length > 0) {
        for (const bill of userData.bills) {
          try {
            const { id, ...billData } = bill;
            await setDoc(doc(db, "bills", id || doc(collection(db, "bills")).id), {
              ...billData,
              restoredAt: serverTimestamp(),
            });
            restoredBills++;
          } catch (e) { console.error('Bill restore error:', e); }
        }
      }

      // STEP 5: Restore expenses
      if (userData.expenses?.length > 0) {
        for (const exp of userData.expenses) {
          try {
            const { id, ...expData } = exp;
            await setDoc(doc(db, "expenses", id || doc(collection(db, "expenses")).id), {
              ...expData,
              restoredAt: serverTimestamp(),
            });
            restoredExpenses++;
          } catch (e) { console.error('Expense restore error:', e); }
        }
      }

      // STEP 6: Restore chat messages
      if (userData.chats?.length > 0) {
        for (const chat of userData.chats) {
          try {
            const { id, ...chatData } = chat;
            await setDoc(doc(db, "chats", id || doc(collection(db, "chats")).id), {
              ...chatData,
              restoredAt: serverTimestamp(),
            });
            restoredChats++;
          } catch (e) { console.error('Chat restore error:', e); }
        }
      }

      // STEP 7: Restore notification settings
      if (userData.notificationSettings) {
        try {
          await setDoc(doc(db, "notificationSettings", userData.userId), {
            ...userData.notificationSettings,
            updatedAt: serverTimestamp(),
          });
        } catch (e) {}
      }

      // STEP 8: Restore FCM tokens
      if (userData.fcmTokens?.length > 0) {
        for (const token of userData.fcmTokens) {
          try {
            const { deviceId, ...tokenData } = token;
            const restoredDeviceId =
              deviceId || doc(collection(db, "fcmTokens", userData.userId, "devices")).id;
            await setDoc(doc(db, "fcmTokens", userData.userId, "devices", restoredDeviceId), {
              ...tokenData,
              updatedAt: serverTimestamp(),
            });
          } catch (e) {}
        }
      }

      // STEP 9: Update deletedUsers status to restored
      await updateDoc(doc(db, "deletedUsers", userData.userId), {
        canRetrieve: false,
        retrievalStatus: 'restored',
        restoredAt: serverTimestamp(),
        restoredBy: 'admin',
        restoredData: {
          meals: restoredMeals,
          bazar: restoredBazar,
          bills: restoredBills,
          expenses: restoredExpenses,
          chats: restoredChats,
        }
      });

      // STEP 10: Send notification to restored user
      try {
        await addDoc(collection(db, "notifications"), {
          userId: userData.userId,
          title: '🎉 Your Account Has Been Restored!',
          body: `Welcome back ${userData.displayName || userData.name}! Your account and all data have been restored. You can now login again.`,
          type: 'account_restored',
          link: '/dashboard',
          read: false,
          createdAt: serverTimestamp(),
        });
      } catch (e) {}

      // STEP 11: Update local state immediately
      setDeletedUsers(prev => prev.map(u => 
        u.userId === userData.userId ? { 
          ...u, 
          canRetrieve: false, 
          retrievalStatus: 'restored',
          restoredAt: new Date().toISOString(),
          restoredBy: 'admin',
          restoredData: { meals: restoredMeals, bazar: restoredBazar, bills: restoredBills, expenses: restoredExpenses, chats: restoredChats }
        } : u
      ));

      if (selectedUser?.userId === userData.userId) {
        setSelectedUser(prev => ({ 
          ...prev, 
          canRetrieve: false, 
          retrievalStatus: 'restored',
          restoredAt: new Date().toISOString(),
          restoredBy: 'admin',
          restoredData: { meals: restoredMeals, bazar: restoredBazar, bills: restoredBills, expenses: restoredExpenses, chats: restoredChats }
        }));
      }

      toast.success(
        `✅ ${userData.displayName || userData.name} restored!\n` +
        `📊 ${restoredMeals} meals, ${restoredBazar} bazar, ${restoredBills} bills, ${restoredExpenses} expenses, ${restoredChats} chats`
      );
    } catch (error) {
      console.error('Restore error:', error);
      toast.error('Failed to restore user: ' + (error.message || 'Unknown error'));
    } finally {
      setRestoring(false);
    }
  };

  // ============ PERMANENT DELETE ============
  const handlePermanentDelete = async (userData) => {
    if (!confirm(`⚠️ PERMANENTLY delete ${userData.displayName || userData.name}?\n\nThis will remove ALL data FOREVER and cannot be undone!`)) return;
    
    setDeleting(true);
    try {
      await deleteDoc(doc(db, "deletedUsers", userData.userId));
      
      // Update local state
      setDeletedUsers(prev => prev.filter(u => u.userId !== userData.userId));
      if (selectedUser?.userId === userData.userId) {
        setSelectedUser(null);
      }
      
      toast.success('Permanently deleted');
    } catch (error) {
      console.error('Delete error:', error);
      toast.error('Failed to delete: ' + (error.message || 'Unknown error'));
    } finally {
      setDeleting(false);
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return '—';
    const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const filteredUsers = deletedUsers.filter(u => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (u.displayName || u.name || '').toLowerCase().includes(term) ||
           (u.email || '').toLowerCase().includes(term) ||
           (u.memberId || '').toLowerCase().includes(term) ||
           (u.userId || '').toLowerCase().includes(term);
  });

  const getStatusBadge = (user) => {
    if (user.retrievalStatus === 'restored') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-[10px] font-bold border border-green-200">
          <CheckCircle className="w-3 h-3" /> Restored
        </span>
      );
    }
    if (user.canRetrieve) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-[10px] font-bold border border-amber-200">
          <AlertCircle className="w-3 h-3" /> Pending
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-[10px] font-bold border border-gray-200">
        <XCircle className="w-3 h-3" /> Archived
      </span>
    );
  };

  const getDataStatusDot = (hasData) => (
    <span className={`w-2 h-2 rounded-full ${hasData ? 'bg-green-500 shadow-sm shadow-green-500/30' : 'bg-red-400'}`} />
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gray-900 rounded-xl flex items-center justify-center">
            <Ban className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Deleted Users</h1>
            <p className="text-xs text-gray-500">
              {deletedUsers.length} total • {deletedUsers.filter(u => u.retrievalStatus === 'restored').length} restored • {deletedUsers.filter(u => u.canRetrieve && u.retrievalStatus !== 'restored').length} pending
            </p>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search by name, email, ID..." className="pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm w-64 focus:ring-2 focus:ring-black/10 outline-none bg-white" />
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-400 uppercase">User</th>
                <th className="px-3 py-3 text-center text-[10px] font-bold text-gray-400 uppercase">Member ID</th>
                <th className="px-3 py-3 text-center text-[10px] font-bold text-gray-400 uppercase">Room</th>
                <th className="px-3 py-3 text-center text-[10px] font-bold text-gray-400 uppercase">Stats</th>
                <th className="px-3 py-3 text-center text-[10px] font-bold text-gray-400 uppercase">Status</th>
                <th className="px-3 py-3 text-center text-[10px] font-bold text-gray-400 uppercase">Deleted</th>
                <th className="px-3 py-3 text-center text-[10px] font-bold text-gray-400 uppercase w-28">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredUsers.length > 0 ? (
                filteredUsers.map(u => (
                  <tr key={u.id} className={`hover:bg-gray-50 cursor-pointer transition-colors ${
                    u.retrievalStatus === 'restored' ? 'bg-green-50/30' : u.canRetrieve ? 'bg-amber-50/20' : ''
                  }`} onClick={() => setSelectedUser(u)}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {u.photo ? (
                          <img src={u.photo} alt="" className="w-8 h-8 rounded-full object-cover" />
                        ) : (
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${
                            u.retrievalStatus === 'restored' ? 'bg-green-500' : u.canRetrieve ? 'bg-amber-500' : 'bg-red-500'
                          }`}>
                            {(u.displayName || u.name)?.charAt(0)?.toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-bold text-gray-900 truncate">{u.displayName || u.name || 'Unknown'}</p>
                          <p className="text-[10px] text-gray-400 truncate">{u.email || '—'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <code className="text-[10px] font-mono bg-gray-100 px-2 py-0.5 rounded">{u.memberId || '—'}</code>
                    </td>
                    <td className="px-3 py-3 text-center text-xs text-gray-600">{u.room || '—'}</td>
                    <td className="px-3 py-3 text-center">
                      <div className="flex items-center justify-center gap-2 text-[10px]">
                        <span className="text-orange-600 font-bold">🍽 {u.stats?.totalMeals || 0}</span>
                        <span className="text-green-600 font-bold">💰 ৳{(u.stats?.totalBazar || 0).toLocaleString()}</span>
                        <span className="text-blue-600 font-bold">📄 {u.stats?.billCount || 0}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center">
                      {getStatusBadge(u)}
                    </td>
                    <td className="px-3 py-3 text-center text-[10px] text-gray-500">
                      {formatDate(u.deletedAt)}
                    </td>
                    <td className="px-3 py-3 text-center" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1">
                        {u.canRetrieve && u.retrievalStatus !== 'restored' && (
                          <button onClick={() => handleRestoreUser(u)} disabled={restoring}
                            className="p-1.5 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition-colors" title="Restore User">
                            {restoring ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                          </button>
                        )}
                        <button onClick={() => handlePermanentDelete(u)} disabled={deleting}
                          className="p-1.5 bg-red-50 text-red-500 rounded-lg hover:bg-red-100 transition-colors" title="Permanent Delete">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center text-sm text-gray-400">
                    {searchTerm ? 'No matching users found' : 'No deleted users'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Panel */}
      <AnimatePresence>
        {selectedUser && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 z-40" onClick={() => setSelectedUser(null)} />
            <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'tween', duration: 0.3 }}
              className="fixed inset-y-0 right-0 w-full max-w-lg bg-white z-50 shadow-2xl flex flex-col">
              
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 flex-shrink-0">
                <button onClick={() => setSelectedUser(null)} className="p-1 -ml-1"><ArrowLeft className="w-5 h-5 text-gray-600" /></button>
                <span className="text-sm font-bold text-gray-900">Deleted User Details</span>
                <div className="w-5" />
              </div>

              <div className="flex-1 overflow-y-auto">
                {/* Profile Card */}
                <div className={`text-center py-6 px-4 border-b ${
                  selectedUser.retrievalStatus === 'restored' ? 'bg-green-50/50' : selectedUser.canRetrieve ? 'bg-amber-50/50' : 'bg-red-50/50'
                }`}>
                  {selectedUser.photo ? (
                    <img src={selectedUser.photo} alt="" className="w-20 h-20 rounded-full mx-auto mb-3 object-cover ring-4 ring-white" />
                  ) : (
                    <div className={`w-20 h-20 rounded-full flex items-center justify-center text-white text-2xl font-bold mx-auto mb-3 ring-4 ring-white ${
                      selectedUser.retrievalStatus === 'restored' ? 'bg-green-500' : selectedUser.canRetrieve ? 'bg-amber-500' : 'bg-red-500'
                    }`}>
                      {(selectedUser.displayName || selectedUser.name)?.charAt(0)?.toUpperCase()}
                    </div>
                  )}
                  <h2 className="text-lg font-bold text-gray-900">{selectedUser.displayName || selectedUser.name}</h2>
                  <p className="text-sm text-gray-500">{selectedUser.email}</p>
                  <div className="flex items-center justify-center gap-2 mt-2 flex-wrap">
                    {getStatusBadge(selectedUser)}
                    {selectedUser.retrievalStatus === 'restored' && selectedUser.restoredAt && (
                      <span className="text-[10px] text-gray-400">Restored: {formatDate(selectedUser.restoredAt)}</span>
                    )}
                  </div>
                </div>

                {/* Info Grid */}
                <div className="grid grid-cols-2 gap-3 p-4">
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-[10px] text-gray-400 uppercase font-semibold">Member ID</p>
                    <p className="text-sm font-mono font-bold text-gray-900">{selectedUser.memberId || '—'}</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-[10px] text-gray-400 uppercase font-semibold">Room</p>
                    <p className="text-sm font-bold text-gray-900">{selectedUser.room || 'Not assigned'}</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-[10px] text-gray-400 uppercase font-semibold">Role</p>
                    <p className="text-sm font-bold text-gray-900 capitalize">{selectedUser.role || 'member'}</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-[10px] text-gray-400 uppercase font-semibold">Balance</p>
                    <p className="text-sm font-bold text-gray-900">৳{(selectedUser.balance || 0).toLocaleString()}</p>
                  </div>
                </div>

                {/* Data Status Indicators */}
                <div className="px-4 mb-4">
                  <h3 className="text-xs font-bold text-gray-500 uppercase mb-2">Data Availability</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {[
                      { label: 'Meals', has: (selectedUser.meals?.length > 0), count: selectedUser.meals?.length || 0 },
                      { label: 'Bazar', has: (selectedUser.bazar?.length > 0), count: selectedUser.bazar?.length || 0 },
                      { label: 'Bills', has: (selectedUser.bills?.length > 0), count: selectedUser.bills?.length || 0 },
                      { label: 'Expenses', has: (selectedUser.expenses?.length > 0), count: selectedUser.expenses?.length || 0 },
                      { label: 'Chats', has: (selectedUser.chats?.length > 0), count: selectedUser.chats?.length || 0 },
                      { label: 'Tokens', has: (selectedUser.fcmTokens?.length > 0), count: selectedUser.fcmTokens?.length || 0 },
                    ].map((item, i) => (
                      <div key={i} className={`rounded-xl p-2.5 border flex items-center gap-2 ${item.has ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                        {getDataStatusDot(item.has)}
                        <div>
                          <p className="text-[10px] font-bold text-gray-700">{item.label}</p>
                          <p className={`text-[10px] ${item.has ? 'text-green-600' : 'text-red-500'}`}>
                            {item.has ? `${item.count} records` : 'No data'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Restore Info (if restored) */}
                {selectedUser.retrievalStatus === 'restored' && selectedUser.restoredData && (
                  <div className="px-4 mb-4">
                    <div className="bg-green-50 rounded-xl p-3 border border-green-200">
                      <h3 className="text-xs font-bold text-green-700 uppercase mb-2 flex items-center gap-1">
                        <CheckCircle className="w-3.5 h-3.5" /> Restored Data
                      </h3>
                      <div className="grid grid-cols-3 gap-2 text-[10px]">
                        <span className="text-green-600">🍽 {selectedUser.restoredData.meals || 0} meals</span>
                        <span className="text-green-600">🛒 {selectedUser.restoredData.bazar || 0} bazar</span>
                        <span className="text-green-600">📄 {selectedUser.restoredData.bills || 0} bills</span>
                        <span className="text-green-600">💰 {selectedUser.restoredData.expenses || 0} expenses</span>
                        <span className="text-green-600">💬 {selectedUser.restoredData.chats || 0} chats</span>
                        <span className="text-green-600">🔔 Notification sent</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Data Tabs */}
                <div className="border-t border-gray-100">
                  <div className="flex gap-1 px-4 py-2 bg-gray-50 overflow-x-auto">
                    {['meals', 'bazar', 'bills', 'expenses', 'chats'].map(tab => (
                      <button key={tab} onClick={() => setActiveTab(tab)}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-bold capitalize whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                          activeTab === tab ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                        }`}>
                        {getDataStatusDot(selectedUser[tab]?.length > 0)}
                        {tab} ({selectedUser[tab]?.length || 0})
                      </button>
                    ))}
                  </div>

                  <div className="p-4 max-h-[400px] overflow-y-auto">
                    {activeTab === 'meals' && (
                      selectedUser.meals?.length > 0 ? (
                        <div className="space-y-2">
                          {selectedUser.meals.map((meal, i) => (
                            <div key={i} className="bg-gray-50 rounded-lg p-3 flex items-center justify-between">
                              <div>
                                <p className="text-sm font-medium text-gray-900">{meal.date}</p>
                                <p className="text-[10px] text-gray-500">{meal.month}</p>
                              </div>
                              <div className="flex items-center gap-3 text-xs">
                                <span className="text-orange-600 font-bold">L:{meal.lunch || 0}</span>
                                <span className="text-blue-600 font-bold">D:{meal.dinner || 0}</span>
                                <span className="text-gray-900 font-bold">T:{(meal.lunch||0)+(meal.dinner||0)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : <p className="text-sm text-gray-400 text-center py-8">No meal records</p>
                    )}

                    {activeTab === 'bazar' && (
                      selectedUser.bazar?.length > 0 ? (
                        <div className="space-y-2">
                          {selectedUser.bazar.map((b, i) => (
                            <div key={i} className="bg-gray-50 rounded-lg p-3 flex items-center justify-between">
                              <div>
                                <p className="text-sm font-medium text-gray-900">{b.place || 'Unknown'}</p>
                                <p className="text-[10px] text-gray-500">{b.date}</p>
                              </div>
                              <span className="text-sm font-bold text-green-600">৳{(b.amount || 0).toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                      ) : <p className="text-sm text-gray-400 text-center py-8">No bazar records</p>
                    )}

                    {activeTab === 'bills' && (
                      selectedUser.bills?.length > 0 ? (
                        <div className="space-y-2">
                          {selectedUser.bills.map((bill, i) => (
                            <div key={i} className="bg-gray-50 rounded-lg p-3">
                              <div className="flex items-center justify-between mb-1">
                                <p className="text-sm font-medium text-gray-900">{bill.note || bill.type}</p>
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                  bill.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                }`}>{bill.status || 'pending'}</span>
                              </div>
                              <div className="flex items-center gap-3 text-xs">
                                <span className="text-gray-500">৳{(bill.amount || 0).toLocaleString()}</span>
                                <span className="text-green-600">Paid: ৳{(bill.paidAmount || 0).toLocaleString()}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : <p className="text-sm text-gray-400 text-center py-8">No bill records</p>
                    )}

                    {activeTab === 'expenses' && (
                      selectedUser.expenses?.length > 0 ? (
                        <div className="space-y-2">
                          {selectedUser.expenses.map((exp, i) => (
                            <div key={i} className="bg-gray-50 rounded-lg p-3 flex items-center justify-between">
                              <div>
                                <p className="text-sm font-medium text-gray-900">{exp.category || 'Expense'}</p>
                                <p className="text-[10px] text-gray-500">{exp.date} {exp.note && `• ${exp.note}`}</p>
                              </div>
                              <span className="text-sm font-bold text-red-600">৳{(exp.amount || 0).toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                      ) : <p className="text-sm text-gray-400 text-center py-8">No expense records</p>
                    )}

                    {activeTab === 'chats' && (
                      selectedUser.chats?.length > 0 ? (
                        <div className="space-y-2">
                          {selectedUser.chats.map((chat, i) => (
                            <div key={i} className="bg-gray-50 rounded-lg p-3">
                              <p className="text-sm text-gray-800">{chat.message}</p>
                              <p className="text-[10px] text-gray-400 mt-1">
                                {chat.createdAt?.toDate?.()?.toLocaleString() || formatDate(chat.createdAt)}
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : <p className="text-sm text-gray-400 text-center py-8">No chat messages</p>
                    )}
                  </div>
                </div>

                {/* Deletion Info */}
                <div className="p-4 border-t border-gray-100">
                  <h3 className="text-xs font-bold text-gray-500 uppercase mb-2">Deletion Info</h3>
                  <div className="bg-gray-50 rounded-xl p-3 space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Deleted By</span>
                      <span className="font-bold capitalize">{selectedUser.deletedBy || 'user'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Deleted At</span>
                      <span className="font-bold">{formatDate(selectedUser.deletedAt)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Original Created</span>
                      <span className="font-bold">{formatDate(selectedUser.originalCreatedAt)}</span>
                    </div>
                    {selectedUser.restoredAt && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Restored At</span>
                        <span className="font-bold text-green-600">{formatDate(selectedUser.restoredAt)}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-gray-500">Status</span>
                      <span className={`font-bold capitalize ${
                        selectedUser.retrievalStatus === 'restored' ? 'text-green-600' : 
                        selectedUser.canRetrieve ? 'text-amber-600' : 'text-gray-600'
                      }`}>
                        {selectedUser.retrievalStatus || 'pending'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="p-4 border-t border-gray-200 bg-gray-50 flex gap-2 flex-shrink-0">
                {selectedUser.canRetrieve && selectedUser.retrievalStatus !== 'restored' ? (
                  <button onClick={() => handleRestoreUser(selectedUser)} disabled={restoring}
                    className="flex-1 py-2.5 bg-green-600 text-white rounded-xl text-sm font-bold hover:bg-green-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
                    {restoring ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    Restore Account
                  </button>
                ) : selectedUser.retrievalStatus === 'restored' ? (
                  <div className="flex-1 py-2.5 bg-green-50 text-green-700 rounded-xl text-sm font-bold text-center border border-green-200">
                    ✅ Account Restored
                  </div>
                ) : null}
                <button onClick={() => handlePermanentDelete(selectedUser)} disabled={deleting}
                  className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-bold hover:bg-red-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
                  <Trash2 className="w-4 h-4" /> Delete Forever
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
