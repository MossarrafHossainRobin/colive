'use client'

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';

export default function AuthGuard({ children }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  // Only redirect to dashboard if user is on login page
  useEffect(() => {
    if (!loading && user && window.location.pathname === '/login') {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  // Don't block rendering - show content for all users
  return children;
}