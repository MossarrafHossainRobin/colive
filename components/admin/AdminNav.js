'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BellRing,
  CircleDollarSign,
  ClipboardList,
  FileWarning,
  LayoutDashboard,
  Moon,
  ReceiptText,
  ShoppingBasket,
  Sun,
  Trash2,
  UtensilsCrossed,
} from 'lucide-react';

const adminNavItems = [
  { name: 'Overview', path: '/admin', icon: LayoutDashboard, section: 'Overview' },
  { name: 'Meals', path: '/admin/meals', icon: UtensilsCrossed, section: 'Operations' },
  { name: 'Bazar', path: '/admin/bazar', icon: ShoppingBasket, section: 'Operations' },
  { name: 'Bills', path: '/admin/bills', icon: ReceiptText, section: 'Operations' },
  { name: 'Services', path: '/admin/service-charge', icon: CircleDollarSign, section: 'Operations' },
  { name: 'Announcements', path: '/admin/announcements', icon: BellRing, section: 'Communication' },
  { name: 'Issues', path: '/admin/issues', icon: FileWarning, section: 'Communication' },
  { name: 'Archive', path: '/admin/deleted-users', icon: Trash2, section: 'System' },
];

function isItemActive(pathname, path) {
  if (path === '/admin') return pathname === path;
  return pathname === path || pathname?.startsWith(`${path}/`);
}

function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem('nesthub-admin-theme');
    const nextDark = stored
      ? stored === 'dark'
      : window.matchMedia('(prefers-color-scheme: dark)').matches;

    setDark(nextDark);
    document.documentElement.classList.toggle('dark', nextDark);
  }, []);

  const toggleTheme = () => {
    const nextDark = !dark;
    setDark(nextDark);
    document.documentElement.classList.toggle('dark', nextDark);
    window.localStorage.setItem('nesthub-admin-theme', nextDark ? 'dark' : 'light');
  };

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="flex h-9 w-9 flex-none items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-950 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
      title={dark ? 'Use light mode' : 'Use dark mode'}
      aria-label={dark ? 'Use light mode' : 'Use dark mode'}
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

export default function AdminNav() {
  const pathname = usePathname();

  return (
    <div className="border-b border-slate-200 bg-white/95 shadow-[0_1px_0_rgba(15,23,42,0.03)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
      <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-3 py-2 sm:px-5 lg:px-6">
        <Link href="/admin" className="hidden flex-none items-center gap-2 pr-2 lg:flex">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-950 text-white shadow-sm dark:bg-white dark:text-slate-950">
            <ClipboardList className="h-4 w-4" />
          </span>
          <span>
            <span className="block text-sm font-bold leading-none text-slate-950 dark:text-white">Admin</span>
            <span className="mt-1 block text-[10px] font-medium leading-none text-slate-400">Workspace</span>
          </span>
        </Link>

        <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Admin workspace">
          {adminNavItems.map((item, index) => {
            const Icon = item.icon;
            const active = isItemActive(pathname, item.path);
            const showDivider = index > 0 && adminNavItems[index - 1].section !== item.section;

            return (
              <div key={item.path} className="flex items-center gap-1">
                {showDivider && <span className="mx-1 h-6 w-px bg-slate-200 dark:bg-slate-800" aria-hidden="true" />}
                <Link
                  href={item.path}
                  title={item.section}
                  className={`flex h-9 items-center gap-2 whitespace-nowrap rounded-lg px-2.5 text-xs font-semibold transition sm:px-3 ${
                    active
                      ? 'bg-slate-950 text-white shadow-sm dark:bg-white dark:text-slate-950'
                      : 'text-slate-500 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{item.name}</span>
                </Link>
              </div>
            );
          })}
        </nav>

        <ThemeToggle />
      </div>
    </div>
  );
}
