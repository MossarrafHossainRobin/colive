'use client'

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { ShoppingCart, MapPin, Calendar } from 'lucide-react';
import {
  calculateMonthlyBazarTotals,
  bazarAmount,
} from '@/lib/bazarCalculations';

export default function BazarContent() {
  const { user } = useAuth();
  const [bazarEntries, setBazarEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    const q = query(collection(db, "bazar"), where("userId", "==", user.uid));
    const unsub = onSnapshot(q, (snap) => {
      setBazarEntries(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter((entry) => !entry.isDeleted).sort((a, b) => (b.date || '').localeCompare(a.date || '')));
      setLoading(false);
    });
    return () => unsub();
  }, [user]);

  const groupedBazar = useMemo(() => {
    const groups = {};
    bazarEntries.forEach(b => {
      if (!groups[b.month]) groups[b.month] = [];
      groups[b.month].push(b);
    });
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  }, [bazarEntries]);

  const totalSpent = useMemo(
    () => calculateMonthlyBazarTotals(bazarEntries).house,
    [bazarEntries]
  );

  if (loading) return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 rounded-full border-2 border-gray-200 border-t-gray-900 animate-spin" /></div>;

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-purple-500 rounded-xl flex items-center justify-center"><ShoppingCart className="w-5 h-5 text-white" /></div>
            <div><h1 className="text-lg font-bold text-gray-900">Bazar List</h1><p className="text-xs text-gray-500">Shopping records</p></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-purple-50 rounded-xl p-3 text-center"><p className="text-xl font-extrabold text-purple-700">৳{totalSpent.toLocaleString()}</p><p className="text-[10px] text-gray-500">Total Spent</p></div>
            <div className="bg-gray-50 rounded-xl p-3 text-center"><p className="text-xl font-extrabold text-gray-700">{bazarEntries.length}</p><p className="text-[10px] text-gray-500">Entries</p></div>
          </div>
        </div>

        {groupedBazar.map(([month, entries]) => {
          const monthTotal = calculateMonthlyBazarTotals(entries, month).house;
          return (
            <div key={month} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-gray-900">{month}</h3>
                <span className="text-sm font-bold text-purple-700">৳{monthTotal.toLocaleString()}</span>
              </div>
              <div className="space-y-2">
                {entries.map(entry => (
                  <div key={entry.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-gray-400" />
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{entry.place || 'Unknown'}</p>
                        <p className="text-[10px] text-gray-400 flex items-center gap-1"><Calendar className="w-3 h-3" />{entry.date}</p>
                      </div>
                    </div>
                    <p className="text-sm font-bold text-gray-900">৳{bazarAmount(entry.amount).toLocaleString()}</p>
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
