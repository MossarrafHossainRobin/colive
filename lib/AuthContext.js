'use client'

import { createContext, useContext, useEffect, useState } from 'react';
import { auth } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { ensureAuthUserProfile } from './memberIdentity';

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        
        try {
          const profile = await ensureAuthUserProfile(firebaseUser);
          setUserData(profile);
        } catch (error) {
          console.error('Error fetching user data:', error);
          setUserData({
            uid: firebaseUser.uid,
            name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
            email: firebaseUser.email,
            displayName: firebaseUser.displayName || '',
            room: '',
            role: 'member',
            balance: 0,
            totalDues: 0,
            isActive: true,
            membershipStatus: 'active',
            notificationEnabled: false,
            phone: '',
            photo: firebaseUser.photoURL || '',
          });
        }
      } else {
        setUser(null);
        setUserData(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, userData, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}
