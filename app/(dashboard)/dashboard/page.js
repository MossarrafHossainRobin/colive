'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/lib/LanguageContext';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, getDocs } from 'firebase/firestore';
import {
  BarChart3,
  ChevronDown,
  HelpCircle,
  LayoutDashboard,
  Menu,
  ReceiptText,
  Search,
  Settings,
  ShoppingCart,
  User,
  Users,
  Utensils,
  WalletCards,
  X,
} from 'lucide-react';
import LeftSidebar from '@/components/dashboard/LeftSidebar';
import CenterContent from '@/components/dashboard/CenterContent';
import RightSidebar from '@/components/dashboard/RightSidebar';
import ProfileContent from '@/components/dashboard/ProfileContent';
import HelpContent from '@/components/dashboard/HelpContent';
import SettingsContent from '@/components/dashboard/SettingsContent';
import MealsContent from '@/components/dashboard/MealsContent';
import BillsContent from '@/components/dashboard/BillsContent';
import BazarContent from '@/components/dashboard/BazarContent';
import ExpensesContent from '@/components/dashboard/ExpensesContent';
import { isMemberAccountActive } from '@/lib/memberPolicy';
import { calculateMonthlyBazarTotals } from '@/lib/bazarCalculations';
import { dedupeMealRecords } from '@/lib/mealRecords';

const pageItems = [
  { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
  { id: 'meals', label: 'Meals', icon: Utensils },
  { id: 'bills', label: 'Bills', icon: ReceiptText },
  { id: 'bazar', label: 'Bazar', icon: ShoppingCart },
  { id: 'expenses', label: 'Expenses', icon: WalletCards },
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'help', label: 'Help', icon: HelpCircle },
  { id: 'settings', label: 'Settings', icon: Settings },
];

function monthOptions(count = 12) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date();
    date.setDate(1);
    date.setMonth(date.getMonth() - index);
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

    return {
      value,
      label: date.toLocaleDateString('en-US', {
        month: 'short',
        year: 'numeric',
      }),
    };
  });
}

function MemberAvatar({ member, selected }) {
  const name = member?.displayName || member?.name || 'Member';

  if (member?.photo) {
    return (
      <img
        src={member.photo}
        alt=""
        className={`h-10 w-10 rounded-xl object-cover ring-2 ${
          selected ? 'ring-blue-500' : 'ring-gray-100'
        }`}
      />
    );
  }

  return (
    <span
      className={`flex h-10 w-10 items-center justify-center rounded-xl text-sm font-black ring-2 ${
        selected
          ? 'bg-blue-600 text-white ring-blue-200'
          : 'bg-gray-100 text-gray-700 ring-gray-50'
      }`}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

export default function Dashboard() {
  const { user, userData } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const userId = user?.uid;
  const months = useMemo(() => monthOptions(), []);

  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [members, setMembers] = useState([]);
  const [allStats, setAllStats] = useState({});
  const [selectedMember, setSelectedMember] = useState('me');
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [mobileMemberSearch, setMobileMemberSearch] = useState('');
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [myStats, setMyStats] = useState({
    totalMeals: 0,
    totalBazarCost: 0,
    bazarCount: 0,
    lastBazarPlace: 'N/A',
    lastBazarDate: 'N/A',
    totalDues: 0,
    balance: 0,
    highestBazar: 0,
  });

  useEffect(() => {
    const checkPage = () => {
      const page = window.location.hash.replace('#', '') || 'dashboard';
      setCurrentPage(pageItems.some((item) => item.id === page) ? page : 'dashboard');
    };

    checkPage();
    window.addEventListener('hashchange', checkPage);
    return () => window.removeEventListener('hashchange', checkPage);
  }, []);

  useEffect(() => {
    if (!userId) return undefined;

    return onSnapshot(
      collection(db, 'users'),
      (snapshot) => {
        setMembers(
          snapshot.docs
            .map((item) => ({ id: item.id, ...item.data() }))
            .filter(
              (member) =>
                isMemberAccountActive(member) &&
                member.id !== userId &&
                member.role !== 'admin'
            )
        );
      },
      (error) => console.error('Member presence listener failed:', error)
    );
  }, [userId]);

  const navigateInDashboard = useCallback((page) => {
    window.location.hash = page === 'dashboard' ? '' : page;
    setCurrentPage(page);
    setMobilePanelOpen(false);
  }, []);

  const fetchMembers = useCallback(async () => {
    if (!selectedMonth || !userId) return;

    const snapshot = await getDocs(collection(db, 'users'));
    const memberList = snapshot.docs
      .map((item) => ({ id: item.id, ...item.data() }))
      .filter(
        (member) =>
          isMemberAccountActive(member) &&
          member.id !== userId &&
          member.role !== 'admin'
      );

    setMembers(memberList);

    await Promise.all(
      memberList.map(async (member) => {
        const [mealSnapshot, bazarSnapshot, billSnapshot] = await Promise.all([
          getDocs(
            query(
              collection(db, 'meals'),
              where('userId', '==', member.id),
              where('month', '==', selectedMonth)
            )
          ),
          getDocs(
            query(
              collection(db, 'bazar'),
              where('userId', '==', member.id),
              where('month', '==', selectedMonth)
            )
          ),
          getDocs(
            query(
              collection(db, 'bills'),
              where('userId', '==', member.id),
              where('month', '==', selectedMonth)
            )
          ),
        ]);

        let meals = 0;
        dedupeMealRecords(
          mealSnapshot.docs.map((item) => ({ id: item.id, ...item.data() })),
          { month: selectedMonth }
        ).forEach((data) => {
          meals +=
            (Number(data.lunch) || 0) +
            (Number(data.dinner) || 0) +
            (Number(data.guestMeal) || 0);
        });

        const allBazarRows = bazarSnapshot.docs.map((item) => item.data());
        const bazarTotals = calculateMonthlyBazarTotals(
          allBazarRows,
          selectedMonth
        );
        const bazar = bazarTotals.byMember[member.id] || 0;
        const bazarRows = allBazarRows.filter((item) => !item.isDeleted);

        const lastBazar = bazarRows.sort((a, b) =>
          String(b.date || '').localeCompare(String(a.date || ''))
        )[0];

        let dues = 0;
        billSnapshot.docs.forEach((item) => {
          const data = item.data();
          if (data.collectionType === 'expense') return;
          if (String(data.status || '').toLowerCase() === 'paid') return;
          dues += Math.max(
            0,
            Number(
              data.dueAmount ??
                data.balance ??
                (Number(data.amount || 0) - Number(data.paidAmount || 0))
            ) || 0
          );
        });

        setAllStats((current) => ({
          ...current,
          [member.id]: {
            meals,
            bazar,
            dues,
            bazarCount: bazarRows.length,
            lastBazarPlace: lastBazar?.place || 'N/A',
            lastBazarDate: lastBazar?.date || 'N/A',
          },
        }));
      })
    );
    setLoading(false);
  }, [selectedMonth, userId]);

  useEffect(() => {
    if (!userId) {
      router.replace('/login');
      return undefined;
    }

    if (userData?.role === 'admin') {
      router.replace('/admin');
      return undefined;
    }

    void Promise.resolve()
      .then(fetchMembers)
      .catch(() => setLoading(false));
    const unsubscribers = [];

    unsubscribers.push(
      onSnapshot(
        query(
          collection(db, 'meals'),
          where('userId', '==', userId),
          where('month', '==', selectedMonth)
        ),
        (snapshot) => {
          let total = 0;
          dedupeMealRecords(
            snapshot.docs.map((item) => ({ id: item.id, ...item.data() })),
            { month: selectedMonth }
          ).forEach((data) => {
            total +=
              (Number(data.lunch) || 0) +
              (Number(data.dinner) || 0) +
              (Number(data.guestMeal) || 0);
          });
          setMyStats((current) => ({ ...current, totalMeals: total }));
          setAllStats((current) => ({
            ...current,
            me: { ...(current.me || {}), meals: total },
          }));
        }
      )
    );

    unsubscribers.push(
      onSnapshot(
        query(
          collection(db, 'bazar'),
          where('userId', '==', userId),
          where('month', '==', selectedMonth)
        ),
        (snapshot) => {
          const allRows = snapshot.docs.map((item) => item.data());
          const totals = calculateMonthlyBazarTotals(allRows, selectedMonth);
          const cost = totals.byMember[userId] || 0;
          const rows = allRows.filter((item) => !item.isDeleted);
          const last = rows.sort((a, b) =>
            String(b.date || '').localeCompare(String(a.date || ''))
          )[0];

          setMyStats((current) => ({
            ...current,
            totalBazarCost: cost,
            bazarCount: rows.length,
            lastBazarPlace: last?.place || 'N/A',
            lastBazarDate: last?.date || 'N/A',
          }));
          setAllStats((current) => ({
            ...current,
            me: {
              ...(current.me || {}),
              bazar: cost,
              bazarCount: rows.length,
              lastBazarPlace: last?.place || 'N/A',
              lastBazarDate: last?.date || 'N/A',
            },
          }));
        }
      )
    );

    unsubscribers.push(
      onSnapshot(
        query(collection(db, 'bazar'), where('month', '==', selectedMonth)),
        (snapshot) => {
          const totals = calculateMonthlyBazarTotals(
            snapshot.docs.map((item) => item.data()),
            selectedMonth
          );
          const highest =
            Object.values(totals.byMember).sort((a, b) => b - a)[0] || 0;
          setMyStats((current) => ({ ...current, highestBazar: highest }));
        }
      )
    );

    unsubscribers.push(
      onSnapshot(
        query(
          collection(db, 'bills'),
          where('userId', '==', userId),
          where('month', '==', selectedMonth)
        ),
        (snapshot) => {
          let pending = 0;
          snapshot.docs.forEach((item) => {
            const data = item.data();
            if (data.collectionType === 'expense') return;
            if (String(data.status || '').toLowerCase() === 'paid') return;
            pending += Math.max(
              0,
              Number(
                data.dueAmount ??
                  data.balance ??
                  (Number(data.amount || 0) - Number(data.paidAmount || 0))
              ) || 0
            );
          });
          setMyStats((current) => ({ ...current, totalDues: pending }));
          setAllStats((current) => ({
            ...current,
            me: { ...(current.me || {}), dues: pending },
          }));
        }
      )
    );

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [fetchMembers, router, selectedMonth, userData, userId]);

  const currentStats =
    selectedMember === 'me'
      ? {
          meals: myStats.totalMeals,
          bazar: myStats.totalBazarCost,
          bazarCount: myStats.bazarCount,
          lastBazarPlace: myStats.lastBazarPlace,
          lastBazarDate: myStats.lastBazarDate,
          dues: myStats.totalDues,
        }
      : allStats[selectedMember] || {
          meals: 0,
          bazar: 0,
          dues: 0,
          bazarCount: 0,
          lastBazarPlace: 'N/A',
          lastBazarDate: 'N/A',
        };

  const currentMember =
    selectedMember === 'me'
      ? {
          id: userId,
          uid: userId,
          name: userData?.name || t('you'),
          displayName: userData?.displayName,
          photo: userData?.photo,
          room: userData?.room,
          email: userData?.email,
          ...userData,
        }
      : members.find((member) => member.id === selectedMember) || null;

  const filteredMobileMembers = members.filter((member) => {
    const term = mobileMemberSearch.trim().toLowerCase();
    if (!term) return true;
    return `${member.name || ''} ${member.displayName || ''} ${member.room || ''}`
      .toLowerCase()
      .includes(term);
  });

  const renderContent = () => {
    if (currentPage === 'meals') return <MealsContent />;
    if (currentPage === 'bills') return <BillsContent />;
    if (currentPage === 'bazar') return <BazarContent />;
    if (currentPage === 'expenses') return <ExpensesContent />;
    if (currentPage === 'profile') return <ProfileContent />;
    if (currentPage === 'help') return <HelpContent />;
    if (currentPage === 'settings') return <SettingsContent />;

    return (
      <CenterContent
        currentMember={currentMember}
        currentStats={currentStats}
        myStats={myStats}
        selectedMember={selectedMember}
        members={members}
        currentUserData={userData}
        onSelectMember={setSelectedMember}
        dashboardMonth={selectedMonth}
        onDashboardMonthChange={setSelectedMonth}
        myBalance={Number(userData?.balance) || 0}
      />
    );
  };

  if (loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center bg-slate-50">
        <div className="space-y-3 text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-[3px] border-slate-200 border-t-blue-600" />
          <p className="text-xs font-bold text-slate-400">Preparing dashboard</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-app relative flex min-h-0 flex-col overflow-hidden bg-white md:h-[calc(100dvh-64px)] md:min-h-[680px]">
      <header className="hidden h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-3">
        <button
          type="button"
          onClick={() => setMobilePanelOpen(true)}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700"
          aria-label="Open dashboard menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="min-w-0 text-center">
          <p className="truncate text-sm font-black text-slate-950">
            {pageItems.find((item) => item.id === currentPage)?.label || 'Dashboard'}
          </p>
          <p className="truncate text-[10px] font-semibold text-slate-400">
            {currentMember?.displayName || currentMember?.name || 'Member'}
          </p>
        </div>

        <label className="relative">
          <select
            value={selectedMonth}
            onChange={(event) => setSelectedMonth(event.target.value)}
            aria-label="Select dashboard month"
            className="h-10 max-w-[110px] appearance-none rounded-xl border-0 bg-slate-100 pl-3 pr-7 text-[11px] font-bold text-slate-700 outline-none"
          >
            {months.map((month) => (
              <option key={month.value} value={month.value}>
                {month.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
        </label>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="hidden shrink-0 md:block">
          <LeftSidebar
            userData={userData}
            members={members}
            allStats={allStats}
            selectedMember={selectedMember}
            setSelectedMember={setSelectedMember}
            selectedMonth={selectedMonth}
            setSelectedMonth={setSelectedMonth}
          />
        </div>

        <div className="flex min-w-0 flex-1 overflow-hidden">
          {renderContent()}
        </div>

        <RightSidebar
          userData={userData}
          members={members}
          allStats={allStats}
          selectedMember={selectedMember}
          myStats={myStats}
          currentStats={currentStats}
        />
      </div>

      {mobilePanelOpen && (
        <div className="fixed inset-0 z-[120] flex md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm"
            onClick={() => setMobilePanelOpen(false)}
            aria-label="Close dashboard menu"
          />
          <aside className="relative flex h-full w-[88%] max-w-sm flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 p-4">
              <div>
                <p className="text-base font-black text-slate-950">Dashboard</p>
                <p className="text-xs font-semibold text-slate-400">
                  Pages and members
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMobilePanelOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <nav className="grid grid-cols-4 gap-2 border-b border-slate-100 p-3">
              {pageItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigateInDashboard(item.id)}
                  className={`flex min-w-0 flex-col items-center gap-1.5 rounded-xl px-1 py-2.5 text-[10px] font-bold ${
                    currentPage === item.id
                      ? 'bg-slate-950 text-white'
                      : 'bg-slate-50 text-slate-600'
                  }`}
                >
                  <item.icon className="h-4 w-4" />
                  <span className="truncate">{item.label}</span>
                </button>
              ))}
            </nav>

            <div className="border-b border-slate-100 p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={mobileMemberSearch}
                  onChange={(event) => setMobileMemberSearch(event.target.value)}
                  placeholder="Search members or rooms"
                  className="h-11 w-full rounded-xl border-0 bg-slate-100 pl-9 pr-3 text-sm font-semibold text-slate-800 outline-none ring-blue-500 focus:ring-2"
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-400">
                  <Users className="h-4 w-4" />
                  Members
                </p>
                <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500">
                  {filteredMobileMembers.length + 1}
                </span>
              </div>

              <button
                type="button"
                onClick={() => {
                  setSelectedMember('me');
                  setMobilePanelOpen(false);
                  navigateInDashboard('dashboard');
                }}
                className={`mb-2 flex w-full items-center gap-3 rounded-2xl p-3 text-left ${
                  selectedMember === 'me'
                    ? 'bg-blue-50 ring-1 ring-blue-100'
                    : 'bg-white ring-1 ring-slate-100'
                }`}
              >
                <MemberAvatar member={userData} selected={selectedMember === 'me'} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-black text-slate-900">
                    {userData?.displayName || userData?.name || 'My details'}
                  </span>
                  <span className="block truncate text-xs font-semibold text-slate-400">
                    {userData?.room || 'My account'}
                  </span>
                </span>
                <BarChart3 className="h-4 w-4 text-slate-300" />
              </button>

              <div className="space-y-2">
                {filteredMobileMembers.map((member) => (
                  <button
                    key={member.id}
                    type="button"
                    onClick={() => {
                      setSelectedMember(member.id);
                      setMobilePanelOpen(false);
                      navigateInDashboard('dashboard');
                    }}
                    className={`flex w-full items-center gap-3 rounded-2xl p-3 text-left ${
                      selectedMember === member.id
                        ? 'bg-blue-50 ring-1 ring-blue-100'
                        : 'bg-white ring-1 ring-slate-100'
                    }`}
                  >
                    <MemberAvatar
                      member={member}
                      selected={selectedMember === member.id}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-black text-slate-900">
                        {member.displayName || member.name || 'Member'}
                      </span>
                      <span className="block truncate text-xs font-semibold text-slate-400">
                        {member.room || 'No room'}
                      </span>
                    </span>
                    <span className="text-xs font-black text-slate-500">
                      {allStats[member.id]?.meals || 0}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
