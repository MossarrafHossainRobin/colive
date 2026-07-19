'use client'

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { FileText, Home, Bolt, Flame, Wifi, Droplets, User, Gift, ArrowRight } from 'lucide-react';
import Link from 'next/link';

const UTILITY_TYPES = [
  { type: 'electricity', label: 'Electricity Bill', icon: Bolt, color: '#F59E0B', bg: 'bg-amber-50' },
  { type: 'gas',         label: 'Gas Bill', icon: Flame, color: '#EF4444', bg: 'bg-red-50' },
  { type: 'water',       label: 'Water Bill', icon: Droplets, color: '#0EA5E9', bg: 'bg-sky-50' },
  { type: 'internet',    label: 'WiFi Bill', icon: Wifi, color: '#06B6D4', bg: 'bg-cyan-50' },
  { type: 'dust',        label: 'Dust Bill', icon: FileText, color: '#8B5CF6', bg: 'bg-violet-50' },
  { type: 'khala',       label: 'Khala Bill', icon: User, color: '#EC4899', bg: 'bg-pink-50' },
  { type: 'extra_rent',  label: 'Extra House Rent', icon: Home, color: '#F97316', bg: 'bg-orange-50' },
  { type: 'eid_bonus',   label: 'Bonus', icon: Gift, color: '#10B981', bg: 'bg-emerald-50' },
];

const toNumber = (v) => { const n = Number(v); return isNaN(n) ? 0 : n; };

export default function BillsContent() {
  const { user, userData } = useAuth();
  const [userBills, setUserBills] = useState([]);
  const [allBills, setAllBills] = useState([]);
  const [loading, setLoading] = useState(true);

  const currentMonth = new Date().toISOString().substring(0, 7);
  const monthName = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  useEffect(() => {
    if (!user) return;
    setLoading(true);

    const u1 = onSnapshot(
      query(collection(db, "bills"), where("userId", "==", user.uid), where("month", "==", currentMonth)),
      (snap) => setUserBills(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );

    const u2 = onSnapshot(
      query(collection(db, "bills"), where("month", "==", currentMonth), where("category", "==", "utility")),
      (snap) => {
        setAllBills(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoading(false);
      }
    );

    return () => { u1(); u2(); };
  }, [user, currentMonth]);

  const rentBill = useMemo(() => 
    userBills.find(b => b.category === 'rent' && b.collectionType !== 'expense'), 
    [userBills]
  );

  const utilityBillsSample = useMemo(() => 
    allBills.filter(b => b.collectionType !== 'expense'),
    [allBills]
  );

  const uniqueUtilityTotals = useMemo(() => 
    Object.values(utilityBillsSample.reduce((acc, b) => {
      if (!acc[b.type]) acc[b.type] = toNumber(b.totalUtilityCost);
      return acc;
    }, {})),
    [utilityBillsSample]
  );

  const trueTotalUtility = useMemo(() => 
    uniqueUtilityTotals.reduce((s, v) => s + v, 0),
    [uniqueUtilityTotals]
  );

  const totalMembers = useMemo(() => {
    const firstBill = utilityBillsSample.find(b => b.totalMembers);
    return Math.max(toNumber(firstBill?.totalMembers), 1);
  }, [utilityBillsSample]);

  const perPersonUtility = useMemo(() => 
    Math.ceil(trueTotalUtility / totalMembers),
    [trueTotalUtility, totalMembers]
  );

  // Get user's utility bills with actual paid amounts
  const userUtilityBills = useMemo(() => {
    const bills = [];
    UTILITY_TYPES.forEach(u => {
      const allBill = allBills.find(b => b.type === u.type);
      const userBill = userBills.find(b => b.type === u.type);
      
      if (allBill && allBill.totalUtilityCost) {
        bills.push({
          type: u.type, 
          label: u.label, 
          icon: u.icon, 
          color: u.color, 
          bg: u.bg,
          totalCost: toNumber(allBill.totalUtilityCost),
          paid: userBill ? toNumber(userBill.paidAmount) : 0,
          id: userBill?.id
        });
      }
    });
    return bills;
  }, [allBills, userBills]);

  // Calculate shares and distribute payments properly
  const utilityShares = useMemo(() => {
    if (userUtilityBills.length === 0) return [];
    const totalAllUtilityCost = userUtilityBills.reduce((s, b) => s + b.totalCost, 0);
    let remaining = perPersonUtility;
    
    // First calculate all shares
    const shares = userUtilityBills.map((bill, index) => {
      if (index === userUtilityBills.length - 1) {
        const share = Math.max(0, remaining);
        return { ...bill, myShare: share };
      }
      const proportional = (bill.totalCost / totalAllUtilityCost) * perPersonUtility;
      const share = Math.round(proportional);
      remaining -= share;
      return { ...bill, myShare: share };
    });

    // Distribute total paid amount across shares
    const totalUtilityPaid = shares.reduce((s, b) => s + b.paid, 0);
    let remainingPayment = totalUtilityPaid;
    
    return shares.map((bill, index) => {
      if (index === shares.length - 1) {
        const paidForThis = remainingPayment;
        const due = Math.max(0, bill.myShare - paidForThis);
        return {
          ...bill,
          paid: paidForThis,
          due,
          status: bill.myShare <= 0 ? 'n/a' : due <= 0 ? 'paid' : paidForThis > 0 ? 'partial' : 'pending'
        };
      }
      const paidForThis = Math.min(remainingPayment, bill.myShare);
      remainingPayment -= paidForThis;
      const due = Math.max(0, bill.myShare - paidForThis);
      return {
        ...bill,
        paid: paidForThis,
        due,
        status: bill.myShare <= 0 ? 'n/a' : due <= 0 ? 'paid' : paidForThis > 0 ? 'partial' : 'pending'
      };
    });
  }, [userUtilityBills, perPersonUtility]);

  const rentShare = rentBill ? toNumber(rentBill.amount) : 0;
  const rentPaid = rentBill ? toNumber(rentBill.paidAmount) : 0;
  const rentDue = Math.max(0, rentShare - rentPaid);

  const totalMyShare = rentShare + utilityShares.reduce((s, u) => s + u.myShare, 0);
  const totalPaid = rentPaid + utilityShares.reduce((s, u) => s + u.paid, 0);
  const balance = totalMyShare - totalPaid;
  const isAdvance = balance < 0;

  const overallStatus = useMemo(() => {
    if (totalMyShare === 0) return 'n/a';
    if (isAdvance) return 'advance';
    if (balance === 0) return 'paid';
    if (totalPaid > 0) return 'partial';
    return 'pending';
  }, [totalMyShare, totalPaid, balance, isAdvance]);

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="w-7 h-7 rounded-full border-2 border-gray-200 border-t-gray-900 animate-spin" />
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 w-full">
      <div className="p-2 sm:p-3 space-y-2 w-full">
        
        {/* Header */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center flex-shrink-0">
                <FileText className="w-4 h-4 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-sm sm:text-base font-bold text-gray-900 truncate">My Bills</h1>
                <p className="text-[10px] text-gray-500 truncate">{monthName}</p>
              </div>
            </div>
            <Link href="/bills" className="flex items-center gap-1 px-2 py-1 bg-gray-100 rounded-md text-[10px] font-bold text-gray-600 hover:bg-gray-200 transition-colors flex-shrink-0 ml-2">
              Details <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-1.5">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-2.5 text-center">
            <p className="text-sm font-extrabold text-gray-900">৳{totalMyShare.toLocaleString()}</p>
            <p className="text-[8px] text-gray-500 font-semibold">My Share</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-2.5 text-center">
            <p className="text-sm font-extrabold text-green-600">৳{totalPaid.toLocaleString()}</p>
            <p className="text-[8px] text-gray-500 font-semibold">Paid</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-2.5 text-center">
            <p className={`text-sm font-extrabold ${isAdvance ? 'text-blue-600' : balance > 0 ? 'text-red-600' : 'text-gray-900'}`}>
              {isAdvance ? `+৳${Math.abs(balance).toLocaleString()}` : balance > 0 ? `৳${balance.toLocaleString()}` : '৳0'}
            </p>
            <p className="text-[8px] text-gray-500 font-semibold">{isAdvance ? 'Advance' : balance > 0 ? 'Due' : 'Settled'}</p>
          </div>
        </div>

        {/* Overall Status */}
        <div className={`rounded-xl shadow-sm border p-3 ${
          overallStatus === 'paid' ? 'bg-emerald-50 border-emerald-200' : 
          overallStatus === 'partial' ? 'bg-amber-50 border-amber-200' : 
          overallStatus === 'advance' ? 'bg-blue-50 border-blue-200' : 'bg-red-50 border-red-200'
        }`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-gray-500 uppercase">Status</p>
              <p className={`text-base font-extrabold mt-0.5 ${
                overallStatus === 'paid' ? 'text-emerald-700' : 
                overallStatus === 'partial' ? 'text-amber-700' : 
                overallStatus === 'advance' ? 'text-blue-700' : 'text-red-700'
              }`}>
                {overallStatus === 'paid' ? 'Fully Paid' : 
                 overallStatus === 'partial' ? 'Partially Paid' : 
                 overallStatus === 'advance' ? 'Advance' : 'Pending'}
              </p>
            </div>
            <div className={`w-9 h-9 rounded-full flex items-center justify-center ${
              overallStatus === 'paid' ? 'bg-emerald-200' : 
              overallStatus === 'partial' ? 'bg-amber-200' : 
              overallStatus === 'advance' ? 'bg-blue-200' : 'bg-red-200'
            }`}>
              <FileText className={`w-4.5 h-4.5 ${
                overallStatus === 'paid' ? 'text-emerald-700' : 
                overallStatus === 'partial' ? 'text-amber-700' : 
                overallStatus === 'advance' ? 'text-blue-700' : 'text-red-700'
              }`} />
            </div>
          </div>
        </div>

        {/* Rent */}
        {rentBill && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 bg-blue-100 rounded-lg flex items-center justify-center">
                <Home className="w-3.5 h-3.5 text-blue-600" />
              </div>
              <h3 className="text-xs font-bold text-gray-900">House Rent</h3>
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ml-auto ${rentDue <= 0 ? 'bg-gray-100 text-gray-900' : 'bg-red-100 text-red-700'}`}>
                {rentDue <= 0 ? 'Paid' : 'Due'}
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-gray-500">My Share</span>
              <span className="font-bold">৳{rentShare.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between text-[11px] mt-0.5">
              <span className="text-gray-500">Paid</span>
              <span className="font-bold text-green-600">৳{rentPaid.toLocaleString()}</span>
            </div>
            {rentDue > 0 && (
              <div className="flex items-center justify-between text-[11px] mt-0.5 pt-0.5 border-t border-gray-50">
                <span className="text-gray-500">Due</span>
                <span className="font-bold text-red-600">৳{rentDue.toLocaleString()}</span>
              </div>
            )}
          </div>
        )}

        {/* Utilities */}
        {utilityShares.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold text-gray-900">Utilities</h3>
              <span className="text-[9px] text-gray-400">Per Person: ৳{perPersonUtility.toLocaleString()}</span>
            </div>
            <div className="space-y-1">
              {utilityShares.map(util => {
                const Icon = util.icon || FileText;
                const config = UTILITY_TYPES.find(u => u.type === util.type);
                const isPaid = util.status === 'paid';
                return (
                  <div key={util.type} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className={`w-6 h-6 rounded-md ${config?.bg || 'bg-gray-50'} flex items-center justify-center flex-shrink-0`}>
                        <Icon className="w-3 h-3" style={{ color: config?.color || '#6B7280' }} />
                      </div>
                      <div className="min-w-0">
                        <span className="text-[11px] font-medium text-gray-700 truncate block">{util.label}</span>
                        <span className="text-[8px] text-gray-400">Total: ৳{util.totalCost.toLocaleString()}</span>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 ml-2">
                      <p className="text-xs font-bold text-gray-900">৳{util.myShare.toLocaleString()}</p>
                      <span className={`text-[9px] font-bold ${isPaid ? 'text-gray-900' : 'text-red-600'}`}>
                        {isPaid ? 'Paid' : 'Due'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty */}
        {userBills.length === 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 text-center">
            <FileText className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm font-semibold text-gray-400">No bills this month</p>
          </div>
        )}
      </div>
    </div>
  );
}
