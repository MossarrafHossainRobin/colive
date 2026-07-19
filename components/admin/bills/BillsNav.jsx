'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FileText, ShoppingCart, Users, Utensils } from 'lucide-react';

const navItems = [
  { label: 'Members', icon: Users, href: '/admin' },
  { label: 'Meals', icon: Utensils, href: '/admin/meals' },
  { label: 'Bazar', icon: ShoppingCart, href: '/admin/bazar' },
  { label: 'Bills', icon: FileText, href: '/admin/bills' },
];

export default function BillsNav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="Admin navigation">
      {navItems.map((item) => {
        const Icon = item.icon;
        const active = item.href === '/admin'
          ? pathname === item.href
          : pathname?.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-black whitespace-nowrap transition ${
              active
                ? 'bg-violet-600 text-white shadow-sm'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            <Icon className="w-4 h-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
