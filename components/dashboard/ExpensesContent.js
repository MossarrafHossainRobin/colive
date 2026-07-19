'use client'

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { toast } from 'react-hot-toast';
import { DollarSign, TrendingUp, TrendingDown, Plus, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function ExpensesContent() {
  const { user } = useAuth();
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newExpense, setNewExpense] = useState({ category: '', amount: '', date: new Date().toISOString().split('T')[0], note: '' });
  const [saving, setSaving] = useState(false);

  const currentMonth = new Date().toISOString().substring(0, 7);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    const q = query(collection(db, "expenses"), where("userId", "==", user.uid));
    const unsub = onSnapshot(q, (snap) => {
      setExpenses(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.date || '').localeCompare(a.date || '')));
      setLoading(false);
    });
    return () => unsub();
  }, [user]);

  const groupedExpenses = useMemo(() => {
    const groups = {};
    expenses.forEach(e => {
      if (!groups[e.month]) groups[e.month] = [];
      groups[e.month].push(e);
    });
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  }, [expenses]);

  const monthlyTotal = useMemo(() => 
    expenses.filter(e => e.month === currentMonth).reduce((s, e) => s + (e.amount || 0), 0),
    [expenses, currentMonth]
  );

  const totalExpenses = useMemo(() => expenses.reduce((s, e) => s + (e.amount || 0), 0), [expenses]);

  const addExpense = async () => {
    if (!newExpense.category || !newExpense.amount) return toast.error('Fill required fields');
    setSaving(true);
    try {
      await addDoc(collection(db, "expenses"), {
        userId: user.uid,
        category: newExpense.category,
        amount: parseInt(newExpense.amount),
        date: newExpense.date,
        month: newExpense.date.substring(0, 7),
        note: newExpense.note,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      toast.success('Expense added!');
      setShowAdd(false);
      setNewExpense({ category: '', amount: '', date: new Date().toISOString().split('T')[0], note: '' });
    } catch (error) {
      toast.error('Failed to add');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 rounded-full border-2 border-gray-200 border-t-gray-900 animate-spin" /></div>;

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center"><DollarSign className="w-5 h-5 text-white" /></div>
              <div><h1 className="text-lg font-bold text-gray-900">My Expenses</h1><p className="text-xs text-gray-500">Personal spending</p></div>
            </div>
            <button onClick={() => setShowAdd(true)} className="px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-bold hover:bg-black transition-colors flex items-center gap-1"><Plus className="w-4 h-4" />Add</button>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-emerald-50 rounded-xl p-3 text-center"><p className="text-xl font-extrabold text-emerald-700">৳{totalExpenses.toLocaleString()}</p><p className="text-[10px] text-gray-500">All Time</p></div>
            <div className="bg-blue-50 rounded-xl p-3 text-center"><p className="text-xl font-extrabold text-blue-700">৳{monthlyTotal.toLocaleString()}</p><p className="text-[10px] text-gray-500">This Month</p></div>
            <div className="bg-gray-50 rounded-xl p-3 text-center"><p className="text-xl font-extrabold text-gray-700">{expenses.length}</p><p className="text-[10px] text-gray-500">Entries</p></div>
          </div>
        </div>

        <AnimatePresence>
          {showAdd && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 overflow-hidden">
              <div className="flex items-center justify-between mb-3"><h3 className="text-sm font-bold text-gray-900">Add Expense</h3><button onClick={() => setShowAdd(false)}><X className="w-4 h-4 text-gray-400" /></button></div>
              <div className="space-y-3">
                <input type="text" value={newExpense.category} onChange={e => setNewExpense(p => ({ ...p, category: e.target.value }))} placeholder="Category (e.g., Food, Transport)" className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-gray-300 outline-none" />
                <input type="number" value={newExpense.amount} onChange={e => setNewExpense(p => ({ ...p, amount: e.target.value }))} placeholder="Amount" className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-gray-300 outline-none" />
                <input type="date" value={newExpense.date} onChange={e => setNewExpense(p => ({ ...p, date: e.target.value }))} className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-gray-300 outline-none" />
                <input type="text" value={newExpense.note} onChange={e => setNewExpense(p => ({ ...p, note: e.target.value }))} placeholder="Note (optional)" className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-gray-300 outline-none" />
                <button onClick={addExpense} disabled={saving} className="w-full py-2.5 bg-gray-900 text-white rounded-xl text-sm font-bold hover:bg-black transition-colors disabled:opacity-50">{saving ? 'Saving...' : 'Save Expense'}</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {groupedExpenses.map(([month, entries]) => {
          const monthTotal = entries.reduce((s, e) => s + (e.amount || 0), 0);
          return (
            <div key={month} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-3"><h3 className="text-sm font-bold text-gray-900">{month}</h3><span className="text-sm font-bold text-emerald-700">৳{monthTotal.toLocaleString()}</span></div>
              <div className="space-y-2">
                {entries.map(entry => (
                  <div key={entry.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <div><p className="text-sm font-semibold text-gray-900">{entry.category}</p><p className="text-[10px] text-gray-400">{entry.date} {entry.note && `• ${entry.note}`}</p></div>
                    <p className="text-sm font-bold text-red-600">৳{(entry.amount || 0).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}