'use client'

import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, getDocs } from 'firebase/firestore';
import ServiceForm from '@/components/admin/service/ServiceForm';
import ServiceStats from '@/components/admin/service/ServiceStats';
import ServiceTable from '@/components/admin/service/ServiceTable';

export default function ServiceChargePage() {
  const [users, setUsers] = useState([]);
  const [charges, setCharges] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUsers = async () => {
      const snap = await getDocs(collection(db, "users"));
      setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    };

    fetchUsers();
    const q = query(collection(db, "serviceCharges"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setCharges(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="h-96 bg-gray-100 rounded-2xl animate-pulse"></div>
          <div className="lg:col-span-2 h-96 bg-gray-100 rounded-2xl animate-pulse"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Service Charge & Advance Management</h1>
        <p className="text-sm text-gray-500 mt-1">Permanent member financial tracking</p>
      </div>

      <ServiceStats charges={charges} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:sticky lg:top-20 lg:self-start">
          <ServiceForm users={users} onSuccess={() => {}} />
        </div>
        <div className="lg:col-span-2">
          <ServiceTable charges={charges} users={users} onUpdate={() => {}} />
        </div>
      </div>
    </div>
  );
}
