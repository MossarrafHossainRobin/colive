'use client';

import { useEffect, useMemo, useState } from 'react';
import { listenMonthlyMembers, listenMonthSetup, listenUsers } from '@/lib/billFirestore';
import { isMemberAccountActive } from '@/lib/memberPolicy';
import { calculateSummary } from '@/lib/billCalculations';

export function useBillsMonth(selectedMonth) {
  const [users, setUsers] = useState([]);
  const [monthSetup, setMonthSetup] = useState(null);
  const [memberRows, setMemberRows] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingMembers, setLoadingMembers] = useState(true);

  useEffect(() => {
    const unsubscribe = listenUsers((rows) => {
      setUsers(rows);
      setLoadingUsers(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!selectedMonth) return;

    setLoadingMembers(true);

    const unsubscribeSetup = listenMonthSetup(selectedMonth, setMonthSetup);

    const unsubscribeMembers = listenMonthlyMembers(selectedMonth, (rows) => {
      setMemberRows(rows);
      setLoadingMembers(false);
    });

    return () => {
      unsubscribeSetup();
      unsubscribeMembers();
    };
  }, [selectedMonth]);

  const activeMembers = useMemo(() => {
    return users.filter((user) => {
      return isMemberAccountActive(user) && user.room;
    });
  }, [users]);

  const rooms = useMemo(() => {
    return [...new Set(activeMembers.map((member) => member.room).filter(Boolean))].sort();
  }, [activeMembers]);

  const summary = useMemo(() => {
    return calculateSummary(memberRows);
  }, [memberRows]);

  return {
    users,
    activeMembers,
    rooms,
    monthSetup,
    memberRows,
    summary,
    loading: loadingUsers || loadingMembers,
  };
}
