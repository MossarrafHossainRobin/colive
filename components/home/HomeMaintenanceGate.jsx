'use client';

import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import MaintenanceNotice from '@/components/MaintenanceNotice';
import { useAuth } from '@/lib/AuthContext';
import { db } from '@/lib/firebase';
import {
  DEFAULT_MAINTENANCE_SETTINGS,
  MAINTENANCE_SETTINGS_COLLECTION,
  MAINTENANCE_SETTINGS_ID,
  canAccessDuringMaintenance,
  normalizeMaintenanceSettings,
} from '@/lib/maintenanceMode';

export default function HomeMaintenanceGate({ children }) {
  const { user, userData } = useAuth();
  const [maintenanceState, setMaintenanceState] = useState({
    settings: DEFAULT_MAINTENANCE_SETTINGS,
    userId: null,
  });

  useEffect(() => {
    if (!user?.uid) return undefined;

    return onSnapshot(
      doc(db, MAINTENANCE_SETTINGS_COLLECTION, MAINTENANCE_SETTINGS_ID),
      (snapshot) => {
        setMaintenanceState({
          settings: normalizeMaintenanceSettings(
            snapshot.exists() ? snapshot.data() : undefined
          ),
          userId: user.uid,
        });
      },
      (error) => {
        console.error('Home maintenance settings listener failed:', error);
        setMaintenanceState({
          settings: DEFAULT_MAINTENANCE_SETTINGS,
          userId: user.uid,
        });
      }
    );
  }, [user?.uid]);

  if (!user?.uid) return children;

  const loading = maintenanceState.userId !== user.uid;
  const canViewHome = canAccessDuringMaintenance({
    settings: maintenanceState.settings,
    user,
    userData,
  });

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#1DBF73] border-t-transparent" />
      </div>
    );
  }

  if (!canViewHome) {
    return <MaintenanceNotice settings={maintenanceState.settings} />;
  }

  return children;
}
