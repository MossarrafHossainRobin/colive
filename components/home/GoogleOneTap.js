'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { signInWithCredential, GoogleAuthProvider } from 'firebase/auth';
import { useAuth } from '@/lib/AuthContext';

export default function GoogleOneTap() {
  const router = useRouter();
  const { user } = useAuth();

  useEffect(() => {
    if (user) return;
    if (typeof window === 'undefined') return;

    // Global lock
    if (window.__googleOneTapInitialized) return;
    window.__googleOneTapInitialized = true;

    const initialize = () => {
      if (!window.google?.accounts?.id) return;

      window.google.accounts.id.initialize({
        client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
        callback: async (response) => {
          try {
            const credential = GoogleAuthProvider.credential(
              response.credential
            );

            await signInWithCredential(auth, credential);

            router.push('/dashboard');
          } catch (error) {
            console.error('Google One Tap Error:', error);
          }
        },
        auto_select: false,
        cancel_on_tap_outside: true,
        use_fedcm_for_prompt: true,
      });

      setTimeout(() => {
        window.google.accounts.id.prompt();
      }, 500);
    };

    if (window.google?.accounts?.id) {
      initialize();
      return;
    }

    let script = document.getElementById('google-gsi-script');

    if (!script) {
      script = document.createElement('script');
      script.id = 'google-gsi-script';
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = initialize;

      document.head.appendChild(script);
    } else {
      initialize();
    }
  }, [user, router]);

  return null;
}