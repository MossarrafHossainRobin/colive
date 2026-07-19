'use client';

import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { CHAT_COLLECTIONS } from '../_constants/chatCollections';

function belongsToMember(data, memberId) {
  return (
    data.userId === memberId ||
    data.memberId === memberId ||
    data.uid === memberId ||
    data.createdBy === memberId
  );
}

function numericValue(data) {
  return Number(data.amount || data.total || data.cost || data.value || 0);
}

export function useMemberStats(memberId) {
  const [stats, setStats] = useState({
    meals: 0,
    bazar: 0,
    bills: 0,
    serviceCharges: 0,
    balance: 0,
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!memberId) return undefined;

    let active = true;

    async function loadStats() {
      setLoading(true);

      try {
        const [mealsSnap, bazarSnap, billsSnap, serviceSnap] = await Promise.all([
          getDocs(collection(db, CHAT_COLLECTIONS.MEALS)),
          getDocs(collection(db, CHAT_COLLECTIONS.BAZAR)),
          getDocs(collection(db, CHAT_COLLECTIONS.BILLS)),
          getDocs(collection(db, CHAT_COLLECTIONS.SERVICE_CHARGES)),
        ]);

        const meals = mealsSnap.docs.filter((item) => belongsToMember(item.data(), memberId)).length;
        const bazar = bazarSnap.docs
          .filter((item) => belongsToMember(item.data(), memberId))
          .reduce((sum, item) => sum + numericValue(item.data()), 0);
        const bills = billsSnap.docs
          .filter((item) => belongsToMember(item.data(), memberId))
          .reduce((sum, item) => sum + numericValue(item.data()), 0);
        const serviceCharges = serviceSnap.docs
          .filter((item) => belongsToMember(item.data(), memberId))
          .reduce((sum, item) => sum + numericValue(item.data()), 0);

        if (active) {
          setStats({
            meals,
            bazar,
            bills,
            serviceCharges,
            balance: bills + serviceCharges - bazar,
          });
        }
      } catch (error) {
        console.error('Member stats load failed:', error);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadStats();

    return () => {
      active = false;
    };
  }, [memberId]);

  return { stats, loading };
}
