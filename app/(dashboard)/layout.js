'use client'

import { useEffect, useState } from 'react';
import { LanguageProvider } from '@/lib/LanguageContext';
import Navbar from '@/components/Navbar';
import { usePathname } from 'next/navigation';
import { Toaster } from 'react-hot-toast';
import AnnouncementBar from '@/components/AnnouncementBar';
import ForegroundPushListener from '@/components/ForegroundPushListener';
import MaintenanceNotice from '@/components/MaintenanceNotice';
import { useAuth } from '@/lib/AuthContext';
import { db } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import {
  DEFAULT_MAINTENANCE_SETTINGS,
  MAINTENANCE_SETTINGS_COLLECTION,
  MAINTENANCE_SETTINGS_ID,
  canAccessDuringMaintenance,
  normalizeMaintenanceSettings,
} from '@/lib/maintenanceMode';

export default function DashboardLayout({ children }) {
  const { user, userData } = useAuth();
  const pathname = usePathname() || '';
  const [maintenanceState, setMaintenanceState] = useState({
    settings: DEFAULT_MAINTENANCE_SETTINGS,
    userId: null,
  });

  useEffect(() => {
    if (!user?.uid) {
      return undefined;
    }

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
        console.error('Maintenance settings listener failed:', error);
        setMaintenanceState({
          settings: DEFAULT_MAINTENANCE_SETTINGS,
          userId: user.uid,
        });
      }
    );
  }, [user?.uid]);

  const maintenanceSettings = maintenanceState.settings;
  const maintenanceLoading =
    Boolean(user?.uid) && maintenanceState.userId !== user.uid;
  const canViewDashboard = canAccessDuringMaintenance({
    settings: maintenanceSettings,
    user,
    userData,
  });
  const isChat = pathname === '/chat';
  const isAdmin = pathname === '/admin' || pathname.startsWith('/admin/');
  const isDashboard = pathname === '/dashboard';
  const isMemberAppPage = [
    '/dashboard',
    '/meals',
    '/bazar',
    '/bills',
    '/notifications',
    '/chat',
  ].some((path) => pathname === path || pathname.startsWith(`${path}/`));

  if (maintenanceLoading && user?.uid) {
    return (
      <LanguageProvider>
        <div className="flex min-h-screen items-center justify-center bg-black">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#1DBF73] border-t-transparent" />
        </div>
      </LanguageProvider>
    );
  }

  if (user?.uid && !canViewDashboard) {
    return (
      <LanguageProvider>
        <MaintenanceNotice settings={maintenanceSettings} />
      </LanguageProvider>
    );
  }

  return (
    <LanguageProvider>
      <ForegroundPushListener />
      <div className={`min-h-screen bg-white ${isMemberAppPage ? 'dashboard-shell' : ''}`}>
        <Navbar />
        <div className={isDashboard || isAdmin ? 'hidden' : ''}>
          <AnnouncementBar />
        </div>
        <main className={
          isChat
            ? 'h-[calc(100dvh-52px)] md:h-[calc(100vh-64px)] overflow-hidden'
            : isAdmin
              ? 'w-full'
              : isDashboard
              ? 'w-full'
              : isMemberAppPage
                ? 'w-full pb-[calc(60px+env(safe-area-inset-bottom,0px))] md:pb-8'
                : 'max-w-7xl mx-auto px-4 py-6 pb-20 md:pb-6'
        }>
          {children}
        </main>
        <Toaster 
          position="top-center"
          toastOptions={{
            duration: 3000,
            style: {
              background: '#1f2937',
              color: '#fff',
              fontSize: '13px',
              borderRadius: '12px',
              padding: '12px 16px',
              fontWeight: '500',
            },
            success: {
              iconTheme: {
                primary: '#10B981',
                secondary: '#fff',
              },
            },
            error: {
              iconTheme: {
                primary: '#EF4444',
                secondary: '#fff',
              },
            },
          }}
        />
      </div>
    </LanguageProvider>
  );
}
