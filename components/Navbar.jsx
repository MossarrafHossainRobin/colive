'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useLanguage } from '@/lib/LanguageContext';
import { auth, db } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import {
  GoogleAuthProvider,
  signInWithCredential,
  signInWithPopup,
} from 'firebase/auth';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Loader2,
  Bell,
  MessageSquare,
  ChevronDown,
  User,
  Settings,
  HelpCircle,
  LogOut,
  FileText,
  BookOpen,
  Users,
  Shield,
  Star,
  DollarSign,
  LayoutDashboard,
  ShoppingCart,
  BarChart3,
  ChefHat,
  ShoppingBag,
  Receipt,
  MessageCircle,
  LogIn,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import {
  isMemberOnline,
  PRESENCE_HEARTBEAT_MS,
} from '@/lib/presence';

const COLORS = {
  primary: '#2563EB',
  secondary: '#4F46E5',
  accent: '#06B6D4',
  success: '#10B981',
};

const Z = {
  navbar: 'z-40',
  bottomNav: 'z-50',
  dropdown: 'z-[60]',
};

const productDropdown = [
  {
    name: 'Meal Tracking',
    icon: ChefHat,
    desc: 'Daily meal scheduling',
    color: COLORS.primary,
  },
  {
    name: 'Expense Management',
    icon: DollarSign,
    desc: 'Track costs & utilities',
    color: COLORS.accent,
  },
  {
    name: 'Grocery Management',
    icon: ShoppingCart,
    desc: 'Inventory & purchases',
    color: COLORS.secondary,
  },
  {
    name: 'Reports & Analytics',
    icon: BarChart3,
    desc: 'Visual data insights',
    color: COLORS.success,
  },
];

const resourcesDropdown = [
  { name: 'Documentation', icon: BookOpen },
  { name: 'User Guide', icon: FileText },
  { name: 'FAQ', icon: HelpCircle },
];

const companyDropdown = [
  { name: 'About Us', icon: Users },
  { name: 'Privacy Policy', icon: Shield },
  { name: 'Terms of Service', icon: FileText },
];

const profileActions = [
  { name: 'My Profile', icon: User },
  { name: 'Account Settings', icon: Settings },
  { name: 'Notification Preferences', icon: Bell },
  { name: 'Help & Support', icon: HelpCircle },
];

function LogoIcon() {
  return (
    <svg className="w-9 h-9" viewBox="0 0 36 36" fill="none">
      <rect width="36" height="36" rx="10" fill="url(#lG)" />

      <defs>
        <linearGradient id="lG" x1="0" y1="0" x2="36" y2="36">
          <stop stopColor={COLORS.primary} />
          <stop offset="1" stopColor={COLORS.secondary} />
        </linearGradient>
      </defs>

      <path
        d="M10 18C10 14 13 10 18 10s8 2 7 5"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
      />

      <path
        d="M26 18c0 4-3 8-8 8s-6-2-7-5"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
      />

      <circle cx="18" cy="18" r="3" fill="white" />
    </svg>
  );
}

function PresenceButton({
  isActive,
  saving,
  onToggle,
  compact = false,
  iconOnly = false,
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={saving}
      title={
        isActive
          ? 'Active now. Click to set Away.'
          : 'Away. Click to set Active.'
      }
      className={`flex items-center gap-1.5 rounded-full font-semibold transition disabled:opacity-60 ${
        iconOnly
          ? 'h-7 w-7 justify-center p-0 text-[10px]'
          : compact
            ? 'px-2 py-1 text-[10px]'
            : 'px-2.5 py-1.5 text-[11px]'
      } ${
        isActive
          ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      }`}
    >
      {saving ? (
        <Loader2
          className={`${compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} animate-spin`}
        />
      ) : isActive ? (
        <CheckCircle className={compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
      ) : (
        <XCircle className={compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
      )}

      <span className={iconOnly ? 'sr-only' : ''}>
        {isActive ? 'Active' : 'Away'}
      </span>
    </button>
  );
}

function DesktopDropdown({ items, isOpen, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    const handler = (event) => {
      if (ref.current && !ref.current.contains(event.target)) {
        event.stopPropagation();
        onClose();
      }
    };

    document.addEventListener('mousedown', handler);

    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.12 }}
      className={`absolute left-0 top-full mt-2 w-72 bg-white rounded-2xl shadow-2xl border border-gray-100 py-2 ${Z.dropdown}`}
    >
      {items.map((item, index) => (
        <a
          key={index}
          href="#"
          onClick={(event) => {
            event.stopPropagation();
            onClose();
          }}
          className="flex items-center gap-3 px-4 py-3 mx-2 rounded-xl text-sm hover:bg-blue-50 transition-colors"
        >
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{
              background: item.color ? `${item.color}15` : '#2563EB15',
            }}
          >
            <item.icon
              className="w-4 h-4"
              style={{ color: item.color || COLORS.primary }}
            />
          </div>

          <div className="min-w-0">
            <span className="font-medium text-gray-700 block">
              {item.name}
            </span>

            {item.desc && (
              <span className="text-xs text-gray-400 block truncate">
                {item.desc}
              </span>
            )}
          </div>
        </a>
      ))}
    </motion.div>
  );
}

function DesktopProfileDropdown({
  isOpen,
  onClose,
  user,
  userData,
  isAdmin,
  isActiveStatus,
  toggleActiveStatus,
  handleLogout,
  t,
}) {
  const ref = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    const handler = (event) => {
      if (ref.current && !ref.current.contains(event.target)) {
        event.stopPropagation();
        onClose();
      }
    };

    document.addEventListener('mousedown', handler);

    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.12 }}
      className={`absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-gray-100 py-3 ${Z.dropdown}`}
    >
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="relative flex-shrink-0">
            {user?.photoURL || userData?.photo ? (
              <img
                src={userData?.photo || user?.photoURL}
                className="w-11 h-11 rounded-full ring-2 ring-blue-200 object-cover"
                alt=""
              />
            ) : (
              <div className="w-11 h-11 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-full flex items-center justify-center text-white text-base font-bold">
                {userData?.name?.charAt(0)?.toUpperCase() || 'U'}
              </div>
            )}

            <span
              className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full ring-2 ring-white ${
                isActiveStatus ? 'bg-emerald-400 animate-pulse' : 'bg-gray-400'
              }`}
            />
          </div>

          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-800 truncate">
              {userData?.name || userData?.displayName || 'User'}
            </p>
            <p className="text-xs text-gray-500 truncate">{user?.email}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-3">
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
              isAdmin ? 'bg-blue-600 text-white' : 'bg-blue-100 text-blue-700'
            }`}
          >
            {isAdmin ? 'Admin' : 'Member'}
          </span>

          <PresenceButton
            isActive={isActiveStatus}
            saving={false}
            onToggle={toggleActiveStatus}
            compact
          />
        </div>
      </div>

      <div className="py-1">
        {profileActions.map((action, index) => (
          <button
            key={index}
            onClick={(event) => {
              event.stopPropagation();
              onClose();
            }}
            className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-gray-600 hover:bg-blue-50 transition-colors"
          >
            <action.icon className="w-4 h-4 text-gray-400" />
            {action.name}
          </button>
        ))}
      </div>

      <div className="border-t border-gray-100 pt-1 mt-1">
        {isAdmin && (
          <Link
            href="/admin"
            onClick={(event) => {
              event.stopPropagation();
              onClose();
            }}
            className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-blue-700 hover:bg-blue-50 transition-colors block"
          >
            <Star className="w-4 h-4" />
            Admin Panel
          </Link>
        )}

        <button
          onClick={(event) => {
            event.stopPropagation();
            handleLogout();
          }}
          className="flex items-center gap-3 w-full px-4 py-2.5 text-sm font-medium text-red-500 hover:bg-red-50 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          {t('logout')}
        </button>
      </div>
    </motion.div>
  );
}

function GoogleSignInButton({ compact = false }) {
  const [loading, setLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const check = () => {
      setIsMobile(
        /Android|iPhone|iPad|iPod|webOS/i.test(navigator.userAgent) ||
          window.innerWidth < 768
      );
    };

    check();
    window.addEventListener('resize', check);

    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    if (isMobile) return;
    if (document.getElementById('gsi-nav')) return;

    const script = document.createElement('script');
    script.id = 'gsi-nav';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;

    document.head.appendChild(script);
  }, [isMobile]);

  const handleSignIn = useCallback(async () => {
    setLoading(true);

    if (isMobile) {
      try {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });

        const result = await signInWithPopup(auth, provider);

        if (result.user) router.push('/dashboard');
      } catch (error) {
        console.error('Mobile Google sign in failed:', error);
      } finally {
        setLoading(false);
      }

      return;
    }

    try {
      const response = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('timeout')), 30000);

        window.google?.accounts?.id?.initialize({
          client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
          callback: (result) => {
            clearTimeout(timeout);
            resolve(result);
          },
          auto_select: false,
          cancel_on_tap_outside: true,
        });

        window.google?.accounts?.id?.prompt((notification) => {
          if (notification.isNotDisplayed()) {
            clearTimeout(timeout);
            reject(new Error(notification.getNotDisplayedReason()));
          }
        });
      });

      const credential = GoogleAuthProvider.credential(response.credential);

      await signInWithCredential(auth, credential);

      router.push('/dashboard');
    } catch (error) {
      try {
        const provider = new GoogleAuthProvider();
        const result = await signInWithPopup(auth, provider);

        if (result.user) router.push('/dashboard');
      } catch (fallbackError) {
        console.error('Google sign in failed:', fallbackError);
      }
    } finally {
      setLoading(false);
    }
  }, [router, isMobile]);

  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={handleSignIn}
      disabled={loading}
      className={`flex items-center justify-center gap-2 bg-white hover:bg-gray-50 text-gray-700 font-medium rounded-xl border border-gray-200 shadow-sm disabled:opacity-70 ${
        compact ? 'px-3 py-2 text-xs' : 'px-4 py-2.5 text-sm'
      }`}
    >
      {loading ? (
        <Loader2 className="animate-spin text-blue-600 w-4 h-4" />
      ) : (
        <svg className="w-5 h-5" viewBox="0 0 24 24">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          />
        </svg>
      )}

      <span>{loading ? 'Connecting...' : 'Continue with Google'}</span>
    </motion.button>
  );
}

function MobileProfileMenu({
  isOpen,
  onClose,
  user,
  userData,
  isAdmin,
  isActiveStatus,
  toggleActiveStatus,
  handleLogout,
  t,
}) {
  const ref = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    let justOpened = true;

    const openTimer = setTimeout(() => {
      justOpened = false;
    }, 100);

    const handler = (event) => {
      if (justOpened) return;

      if (ref.current && !ref.current.contains(event.target)) {
        onClose();
      }
    };

    document.addEventListener('click', handler);

    return () => {
      clearTimeout(openTimer);
      document.removeEventListener('click', handler);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={ref}
      className="absolute top-full right-2 mt-2 w-72 bg-white rounded-2xl shadow-2xl border border-gray-100 py-2 z-[200]"
    >
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-3">
          {user?.photoURL || userData?.photo ? (
            <img
              src={userData?.photo || user?.photoURL}
              className="w-10 h-10 rounded-full ring-2 ring-blue-200 object-cover"
              alt=""
            />
          ) : (
            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-full flex items-center justify-center text-white text-sm font-bold">
              {userData?.name?.charAt(0)?.toUpperCase() || 'U'}
            </div>
          )}

          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-800 truncate">
              {userData?.name || userData?.displayName || 'User'}
            </p>

            <p className="text-xs text-gray-500 truncate">{user?.email}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-2">
          <span
            className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
              isAdmin ? 'bg-blue-600 text-white' : 'bg-blue-100 text-blue-700'
            }`}
          >
            {isAdmin ? 'Admin' : 'Member'}
          </span>

          <PresenceButton
            isActive={isActiveStatus}
            saving={false}
            onToggle={toggleActiveStatus}
            compact
          />
        </div>
      </div>

      <div className="py-1">
        {profileActions.map((action, index) => (
          <button
            key={index}
            onClick={onClose}
            className="flex items-center gap-3 w-full px-4 py-3 text-sm text-gray-600 hover:bg-blue-50 transition-colors"
          >
            <action.icon className="w-4 h-4 text-gray-400" />
            {action.name}
          </button>
        ))}
      </div>

      {isAdmin && (
        <Link
          href="/admin"
          onClick={onClose}
          className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-blue-700 hover:bg-blue-50 transition-colors block border-t border-gray-100"
        >
          <Star className="w-4 h-4" />
          Admin Panel
        </Link>
      )}

      <div className="border-t border-gray-100 pt-1 mt-1">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-4 py-3 text-sm font-medium text-red-500 hover:bg-red-50 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          {t('logout')}
        </button>
      </div>
    </div>
  );
}

export default function Navbar() {
  const { user, userData } = useAuth();
  const { language, t, toggleLanguage } = useLanguage();

  const router = useRouter();
  const pathname = usePathname() || '';

  const [desktopProfileOpen, setDesktopProfileOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState(null);
  const [mobileProfileOpen, setMobileProfileOpen] = useState(false);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [isActiveStatus, setIsActiveStatus] = useState(false);
  const [presenceMode, setPresenceMode] = useState('auto');
  const [presenceSaving, setPresenceSaving] = useState(false);

  const navRef = useRef(null);

  const isAdmin = userData?.role === 'admin';
  const isHomePage = pathname === '/';

  const isChatPage =
    pathname === '/chat' ||
    pathname.startsWith('/chat/') ||
    pathname.includes('/chat');

  const userPresenceRef = useMemo(() => {
    if (!user?.uid) return null;

    return doc(db, 'users', user.uid);
  }, [user?.uid]);

  const navItems = isAdmin
    ? [
        { name: 'adminPanel', path: '/admin', icon: Shield },
        { name: 'meals', path: '/admin/meals', icon: ChefHat },
        { name: 'bazar', path: '/admin/bazar', icon: ShoppingBag },
        { name: 'bills', path: '/admin/bills', icon: Receipt },
        { name: 'chat', path: '/chat', icon: MessageCircle },
      ]
    : [
        { name: 'dashboard', path: '/dashboard', icon: LayoutDashboard },
        { name: 'meals', path: '/meals', icon: ChefHat },
        { name: 'bazar', path: '/bazar', icon: ShoppingBag },
        { name: 'bills', path: '/bills', icon: Receipt },
        { name: 'chat', path: '/chat', icon: MessageCircle },
      ];

  const bottomItems = [
    {
      name: 'Home',
      path: '/',
      icon: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
    },
    {
      name: 'Dashboard',
      path: user ? (isAdmin ? '/admin' : '/dashboard') : '/login',
      icon: 'M4 6h16M4 12h16M4 18h16',
    },
    {
      name: 'Meals',
      path: user ? (isAdmin ? '/admin/meals' : '/meals') : '/login',
      icon: 'M12 6v6m0 0v6m0-6h6m-6 0H6',
    },
    {
      name: 'Chat',
      path: '/chat',
      icon: 'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z',
    },
  ];

  const updatePresence = useCallback(
    async ({ online, mode = presenceMode, route = pathname }) => {
      if (!userPresenceRef || !user?.uid) return;

      const finalOnline = mode === 'away' ? false : online;

      await setDoc(
        userPresenceRef,
        {
          uid: user.uid,
          isOnline: finalOnline,
          presenceStatus: finalOnline ? 'active' : 'away',
          presenceMode: mode,
          activeRoute: finalOnline ? route : '',
          lastSeen: serverTimestamp(),
          presenceUpdatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setIsActiveStatus(finalOnline);
      setPresenceMode(mode);
    },
    [userPresenceRef, user?.uid, pathname, presenceMode]
  );

  const toggleActiveStatus = useCallback(async () => {
    if (!userPresenceRef || presenceSaving) return;

    setPresenceSaving(true);

    try {
      if (isActiveStatus) {
        await updatePresence({
          online: false,
          mode: 'away',
          route: '',
        });
      } else {
        await updatePresence({
          online: true,
          mode: 'auto',
          route: pathname,
        });
      }
    } catch (error) {
      console.error('Presence toggle failed:', error);
    } finally {
      setPresenceSaving(false);
    }
  }, [
    userPresenceRef,
    presenceSaving,
    isActiveStatus,
    updatePresence,
    pathname,
  ]);

  const handleLogout = useCallback(async () => {
    try {
      if (user?.uid) {
        await setDoc(
          doc(db, 'users', user.uid),
          {
            isOnline: false,
            presenceStatus: 'away',
            presenceMode: 'auto',
            lastSeen: serverTimestamp(),
            presenceUpdatedAt: serverTimestamp(),
            activeRoute: '',
          },
          { merge: true }
        );
      }

      await signOut(auth);

      setDesktopProfileOpen(false);
      setMobileProfileOpen(false);

      router.push('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  }, [router, user?.uid]);

  useEffect(() => {
    const handler = (event) => {
      if (navRef.current && !navRef.current.contains(event.target)) {
        setActiveDropdown(null);
        setDesktopProfileOpen(false);
      }
    };

    document.addEventListener('mousedown', handler);

    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!userPresenceRef) {
      setIsActiveStatus(false);
      setPresenceMode('auto');
      return;
    }

    return onSnapshot(
      userPresenceRef,
      (snapshot) => {
        const data = snapshot.data();

        if (!data) return;

        setIsActiveStatus(isMemberOnline(data));
        setPresenceMode(data.presenceMode || 'auto');
      },
      (error) => {
        console.error('Presence listener failed:', error);
      }
    );
  }, [userPresenceRef]);

  useEffect(() => {
    if (!userPresenceRef || !user?.uid) return;

    let mounted = true;

    const markActive = async () => {
      if (!mounted) return;
      if (presenceMode === 'away') return;
      if (document.visibilityState !== 'visible') return;

      try {
        await updatePresence({
          online: true,
          mode: 'auto',
          route: pathname,
        });
      } catch (error) {
        console.error('Mark active failed:', error);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        markActive();
      }
    };

    markActive();

    const heartbeat = window.setInterval(() => {
      if (document.visibilityState === 'visible' && presenceMode !== 'away') {
        markActive();
      }
    }, PRESENCE_HEARTBEAT_MS);

    window.addEventListener('focus', markActive);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      mounted = false;

      window.clearInterval(heartbeat);

      window.removeEventListener('focus', markActive);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [userPresenceRef, user?.uid, updatePresence, presenceMode, pathname]);

  useEffect(() => {
    if (!userPresenceRef || !user?.uid) return;
    if (presenceMode === 'away') return;
    if (document.visibilityState !== 'visible') return;

    updatePresence({
      online: true,
      mode: 'auto',
      route: pathname,
    }).catch((error) => {
      console.error('Route presence update failed:', error);
    });
  }, [pathname, userPresenceRef, user?.uid, presenceMode, updatePresence]);

  useEffect(() => {
    if (!user?.uid || !db) return;

    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', user.uid),
      where('read', '==', false)
    );

    return onSnapshot(
      q,
      (snap) => setUnreadNotifs(snap.size),
      (error) => console.error('Unread notifications listener error:', error)
    );
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid || !db) return;

    const q = query(
      collection(db, 'conversations'),
      where('participants', 'array-contains', user.uid)
    );

    return onSnapshot(
      q,
      (snap) => {
        const totalUnread = snap.docs.reduce((total, item) => {
          const data = item.data();

          return total + Number(data.unreadCount?.[user.uid] || 0);
        }, 0);

        setUnreadMessages(totalUnread);
      },
      (error) => console.error('Unread conversations listener error:', error)
    );
  }, [user?.uid]);

  const isActive = useCallback(
    (path) => {
      if (!pathname) return false;
      if (path === '#') return false;

      return pathname === path || pathname.startsWith(path + '/');
    },
    [pathname]
  );

  const toggleDropdown = (name) => {
    setActiveDropdown(activeDropdown === name ? null : name);
  };

  return (
    <>
      {/* ==================== DESKTOP NAVBAR ==================== */}
      {!isChatPage && (
        <nav
          ref={navRef}
          className={`hidden md:block sticky top-0 ${Z.navbar} bg-white/80 backdrop-blur-2xl border-b border-gray-100/60 shadow-sm`}
        >
          <div className="max-w-7xl mx-auto px-6">
            <div className="flex items-center justify-between h-[72px]">
              <Link
                href={user ? (isAdmin ? '/admin' : '/dashboard') : '/'}
                className="flex items-center gap-3 flex-shrink-0"
              >
                <LogoIcon />

                <div className="leading-tight">
                  <span className="font-bold text-lg text-gray-900 tracking-tight">
                    NestHub
                  </span>

                  <span className="hidden xl:block text-[10px] text-gray-400 font-medium">
                    Smart Meal Operations
                  </span>
                </div>
              </Link>

              <div className="flex items-center gap-0.5">
                {user ? (
                  <>
                    <Link
                      href="/"
                      className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                        isHomePage
                          ? 'text-blue-700 bg-blue-50'
                          : 'text-gray-500 hover:text-blue-600 hover:bg-blue-50'
                      }`}
                    >
                      Home
                    </Link>

                    {navItems.map((item) => (
                      <Link
                        key={item.path}
                        href={item.path}
                        className={`relative flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                          isActive(item.path)
                            ? 'text-blue-700 bg-blue-50'
                            : 'text-gray-500 hover:text-blue-600 hover:bg-blue-50'
                        }`}
                      >
                        <item.icon className="w-4 h-4" />
                        <span>{t(item.name)}</span>

                        {isActive(item.path) && (
                          <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full" />
                        )}
                      </Link>
                    ))}
                  </>
                ) : (
                  <>
                    <Link
                      href="/"
                      className={`px-3.5 py-2 rounded-lg text-sm font-medium ${
                        isHomePage
                          ? 'text-blue-700 bg-blue-50'
                          : 'text-gray-500 hover:text-blue-600 hover:bg-blue-50'
                      }`}
                    >
                      Home
                    </Link>

                    <div className="relative">
                      <button
                        onClick={() => toggleDropdown('product')}
                        className={`flex items-center gap-1 px-3.5 py-2 rounded-lg text-sm font-medium ${
                          activeDropdown === 'product'
                            ? 'text-blue-700 bg-blue-50'
                            : 'text-gray-500 hover:text-blue-600 hover:bg-blue-50'
                        }`}
                      >
                        Product

                        <ChevronDown
                          className={`w-3 h-3 transition-transform ${
                            activeDropdown === 'product' ? 'rotate-180' : ''
                          }`}
                        />
                      </button>

                      <DesktopDropdown
                        items={productDropdown}
                        isOpen={activeDropdown === 'product'}
                        onClose={() => setActiveDropdown(null)}
                      />
                    </div>

                    <div className="relative">
                      <button
                        onClick={() => toggleDropdown('resources')}
                        className={`flex items-center gap-1 px-3.5 py-2 rounded-lg text-sm font-medium ${
                          activeDropdown === 'resources'
                            ? 'text-blue-700 bg-blue-50'
                            : 'text-gray-500 hover:text-blue-600 hover:bg-blue-50'
                        }`}
                      >
                        Resources

                        <ChevronDown
                          className={`w-3 h-3 transition-transform ${
                            activeDropdown === 'resources' ? 'rotate-180' : ''
                          }`}
                        />
                      </button>

                      <DesktopDropdown
                        items={resourcesDropdown}
                        isOpen={activeDropdown === 'resources'}
                        onClose={() => setActiveDropdown(null)}
                      />
                    </div>

                    <a
                      href="#journey"
                      className="px-3.5 py-2 rounded-lg text-sm font-medium text-gray-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                    >
                      Journey
                    </a>

                    <div className="relative">
                      <button
                        onClick={() => toggleDropdown('company')}
                        className={`flex items-center gap-1 px-3.5 py-2 rounded-lg text-sm font-medium ${
                          activeDropdown === 'company'
                            ? 'text-blue-700 bg-blue-50'
                            : 'text-gray-500 hover:text-blue-600 hover:bg-blue-50'
                        }`}
                      >
                        Company

                        <ChevronDown
                          className={`w-3 h-3 transition-transform ${
                            activeDropdown === 'company' ? 'rotate-180' : ''
                          }`}
                        />
                      </button>

                      <DesktopDropdown
                        items={companyDropdown}
                        isOpen={activeDropdown === 'company'}
                        onClose={() => setActiveDropdown(null)}
                      />
                    </div>
                  </>
                )}
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                {user ? (
                  <>
                    <button
                      onClick={toggleLanguage}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                    >
                      {language === 'en' ? 'বাংলা' : 'EN'}
                    </button>

                    <PresenceButton
                      isActive={isActiveStatus}
                      saving={presenceSaving}
                      onToggle={toggleActiveStatus}
                    />

                    <Link
                      href="/chat"
                      className="relative p-2.5 rounded-xl text-gray-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                    >
                      <MessageSquare className="w-5 h-5" />

                      {unreadMessages > 0 && (
                        <motion.span
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="absolute -top-0.5 -right-0.5 bg-blue-500 text-white text-[9px] font-bold min-w-[18px] h-[18px] rounded-full flex items-center justify-center shadow-lg shadow-blue-200"
                        >
                          {unreadMessages > 9 ? '9+' : unreadMessages}
                        </motion.span>
                      )}
                    </Link>

                    <Link
                      href="/notifications"
                      className="relative p-2.5 rounded-xl text-gray-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                    >
                      <Bell className="w-5 h-5" />

                      {unreadNotifs > 0 && (
                        <motion.span
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[9px] font-bold min-w-[18px] h-[18px] rounded-full flex items-center justify-center shadow-lg shadow-red-200"
                        >
                          {unreadNotifs > 9 ? '9+' : unreadNotifs}
                        </motion.span>
                      )}
                    </Link>

                    <div className="relative">
                      <button
                        onClick={() =>
                          setDesktopProfileOpen(!desktopProfileOpen)
                        }
                        className={`flex items-center gap-1.5 p-1.5 pr-2 rounded-xl transition-colors ${
                          desktopProfileOpen
                            ? 'bg-blue-50'
                            : 'hover:bg-blue-50'
                        }`}
                      >
                        <div className="relative flex-shrink-0">
                          {user?.photoURL || userData?.photo ? (
                            <img
                              src={userData?.photo || user?.photoURL}
                              className="w-8 h-8 rounded-full ring-2 ring-blue-200 object-cover"
                              alt=""
                            />
                          ) : (
                            <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-full flex items-center justify-center text-white text-sm font-bold">
                              {userData?.name?.charAt(0)?.toUpperCase() || 'U'}
                            </div>
                          )}

                          <span
                            className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ring-2 ring-white ${
                              isActiveStatus
                                ? 'bg-emerald-400 animate-pulse'
                                : 'bg-gray-400'
                            }`}
                          />
                        </div>

                        <ChevronDown
                          className={`w-3.5 h-3.5 text-gray-400 transition-transform ${
                            desktopProfileOpen ? 'rotate-180' : ''
                          }`}
                        />
                      </button>

                      <DesktopProfileDropdown
                        isOpen={desktopProfileOpen}
                        onClose={() => setDesktopProfileOpen(false)}
                        user={user}
                        userData={userData}
                        isAdmin={isAdmin}
                        isActiveStatus={isActiveStatus}
                        toggleActiveStatus={toggleActiveStatus}
                        handleLogout={handleLogout}
                        t={t}
                      />
                    </div>
                  </>
                ) : (
                  <div className="flex items-center gap-2">
                    <Link
                      href="/login"
                      className="px-4 py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                    >
                      <LogIn className="w-4 h-4 inline mr-1.5" />
                      Sign in
                    </Link>

                    <GoogleSignInButton />
                  </div>
                )}
              </div>
            </div>
          </div>
        </nav>
      )}

      {/* ==================== MOBILE TOP BAR ==================== */}
      {!isChatPage && (
        <nav
          className={`sticky top-0 md:hidden ${Z.navbar} border-b border-gray-100 bg-white/95 backdrop-blur-xl`}
        >
          <div className="flex h-12 items-center justify-between px-2.5">
            <Link
              href={user ? (isAdmin ? '/admin' : '/dashboard') : '/'}
              className="flex items-center gap-2"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600">
                <span className="text-xs font-extrabold text-white">N</span>
              </div>

              <span className="text-sm font-bold text-gray-900">
                NestHub
              </span>
            </Link>

            <div className="flex items-center gap-0.5">
              {user ? (
                <>
                  <Link href="/chat" className="relative p-1.5">
                    <MessageSquare className="h-[18px] w-[18px] text-gray-600" />

                    {unreadMessages > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 bg-blue-500 text-white text-[8px] font-bold min-w-[14px] h-[14px] rounded-full flex items-center justify-center">
                        {unreadMessages > 9 ? '9+' : unreadMessages}
                      </span>
                    )}
                  </Link>

                  <Link href="/notifications" className="relative p-1.5">
                    <Bell className="h-[18px] w-[18px] text-gray-600" />

                    {unreadNotifs > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[8px] font-bold min-w-[14px] h-[14px] rounded-full flex items-center justify-center">
                        {unreadNotifs > 9 ? '9+' : unreadNotifs}
                      </span>
                    )}
                  </Link>

                  <PresenceButton
                    isActive={isActiveStatus}
                    saving={presenceSaving}
                    onToggle={toggleActiveStatus}
                    compact
                    iconOnly
                  />

                  <button
                    onClick={() => setMobileProfileOpen(!mobileProfileOpen)}
                    className="relative"
                  >
                    {user?.photoURL || userData?.photo ? (
                      <img
                        src={userData?.photo || user?.photoURL}
                        className="h-7 w-7 rounded-full object-cover ring-2 ring-blue-200"
                        alt=""
                      />
                    ) : (
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 text-[10px] font-bold text-white">
                        {userData?.name?.charAt(0)?.toUpperCase() || 'U'}
                      </div>
                    )}

                    <span
                      className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white ${
                        isActiveStatus
                          ? 'bg-emerald-400 animate-pulse'
                          : 'bg-gray-400'
                      }`}
                    />
                  </button>
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <Link
                    href="/login"
                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-blue-600 border border-blue-200"
                  >
                    <LogIn className="w-3.5 h-3.5 inline mr-1" />
                    Sign in
                  </Link>

                  <GoogleSignInButton compact />
                </div>
              )}
            </div>
          </div>

          <MobileProfileMenu
            isOpen={mobileProfileOpen}
            onClose={() => setMobileProfileOpen(false)}
            user={user}
            userData={userData}
            isAdmin={isAdmin}
            isActiveStatus={isActiveStatus}
            toggleActiveStatus={toggleActiveStatus}
            handleLogout={handleLogout}
            t={t}
          />
        </nav>
      )}

      {/* ==================== MOBILE BOTTOM NAV ==================== */}
      {user && (
        <nav
          className={`dashboard-mobile-nav md:hidden fixed bottom-0 left-0 right-0 ${Z.bottomNav} bg-white/95 backdrop-blur-xl border-t border-black/10 shadow-[0_-8px_30px_rgba(34,35,37,0.10)]`}
          style={{ paddingBottom: 'env(safe-area-inset-bottom,0px)' }}
        >
          <div className="flex h-[52px] items-center justify-around px-2">
            {bottomItems.map((item) => {
              const active = isActive(item.path);

              return (
                <Link
                  key={item.name}
                  href={item.path}
                  className={`relative flex min-w-[54px] flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-1 transition-all ${
                    active ? 'text-[#1DBF73]' : 'text-black/45'
                  }`}
                >
                  {active && (
                    <motion.div
                      layoutId="bottomPill"
                      className="absolute inset-0 -z-10 rounded-xl bg-[#1DBF73]/10"
                      transition={{
                        type: 'spring',
                        stiffness: 400,
                        damping: 30,
                      }}
                    />
                  )}

                  <svg
                    className="relative z-10 h-[19px] w-[19px]"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={active ? 2.2 : 1.7}
                      d={item.icon}
                    />
                  </svg>

                  <span className={`relative z-10 text-[9px] leading-none ${active ? 'font-black' : 'font-semibold'}`}>
                    {item.name}
                  </span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </>
  );
}
