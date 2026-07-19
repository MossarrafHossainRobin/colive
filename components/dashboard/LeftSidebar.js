'use client'

import { useState, useMemo, useRef, useEffect } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import { useAuth } from '@/lib/AuthContext';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Utensils, FileText, DollarSign, ShoppingCart, User, 
  HelpCircle, Settings, LogOut,
  LayoutDashboard, Menu, X, Search, Clock, ArrowUpLeft,
  CalendarDays, ChevronDown
} from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { isMemberOnline } from '@/lib/presence';

const DASHBOARD_MENU_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, page: 'dashboard' },
  { id: 'meals', label: 'Meals', icon: Utensils, page: 'meals' },
  { id: 'bills', label: 'Bills', icon: FileText, page: 'bills' },
  { id: 'bazar', label: 'Bazar', icon: ShoppingCart, page: 'bazar' },
  { id: 'expenses', label: 'Expenses', icon: DollarSign, page: 'expenses' },
];

const DASHBOARD_BOTTOM_ITEMS = [
  { id: 'profile', label: 'Profile', icon: User, page: 'profile' },
  { id: 'help', label: 'Help', icon: HelpCircle, page: 'help' },
  { id: 'settings', label: 'Settings', icon: Settings, page: 'settings' },
];

function StatusDot({ member, size = 'sm' }) {
  const isLive = isMemberOnline(member);

  const sizeClass = size === 'xs' ? 'w-1.5 h-1.5 border' : 'w-2.5 h-2.5 border-[2px]';

  return (
    <motion.span
      animate={isLive ? { scale: [1, 1.3, 1] } : {}}
      transition={isLive ? { duration: 1.5, repeat: Infinity, ease: "easeInOut" } : {}}
      className={`absolute -bottom-0.5 -right-0.5 ${sizeClass} rounded-full border-white ${
        isLive ? 'bg-green-500 shadow-lg shadow-green-500/30' : 'bg-gray-400'
      }`}
    />
  );
}

function MemberIcon({ member, isSelected, onClick, compact = false }) {
  const live = isMemberOnline(member);

  const initials = useMemo(() => {
    const name = member.displayName || member.name || '';
    return name.trim().charAt(0).toUpperCase() || '?';
  }, [member]);

  if (compact) {
    return (
      <button
        onClick={onClick}
        className={`relative flex-shrink-0 group ${
          isSelected ? 'ring-2 ring-gray-900 rounded-full ring-offset-1' : ''
        }`}
      >
        <div className="relative">
          {member.photo ? (
            <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-100">
              <img 
                src={member.photo} 
                alt={member.displayName || member.name}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  e.target.style.display = 'none';
                  e.target.parentElement.innerHTML = `<div class="w-full h-full bg-gray-200 flex items-center justify-center text-xs font-bold text-black">${initials}</div>`;
                }}
              />
            </div>
          ) : (
            <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center text-xs font-bold text-black">
              {initials}
            </div>
          )}
          <StatusDot member={member} size="xs" />
        </div>
        <span className="absolute left-full ml-2 px-2.5 py-1.5 bg-gray-900 text-white text-[11px] font-semibold rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-50 shadow-xl">
          {member.displayName || member.name}
          <span className="text-[10px] text-gray-300 ml-1">({member.room})</span>
          <span className="absolute left-0 top-1/2 -translate-y-1/2 -ml-1 w-2 h-2 bg-gray-900 rotate-45" />
        </span>
      </button>
    );
  }

  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all duration-200 ${
        isSelected
          ? 'bg-gray-100 ring-2 ring-black ring-offset-1'
          : 'hover:bg-gray-50'
      }`}
    >
      <div className="relative flex-shrink-0">
        {member.photo ? (
          <div className="w-11 h-11 rounded-full overflow-hidden bg-gray-100">
            <img 
              src={member.photo} 
              alt={member.displayName || member.name || 'Member'}
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
              onError={(e) => {
                e.target.style.display = 'none';
                e.target.parentElement.innerHTML = `<div class="w-full h-full bg-gray-200 flex items-center justify-center text-sm font-bold text-black">${initials}</div>`;
              }}
            />
          </div>
        ) : (
          <div className="w-11 h-11 bg-gray-200 rounded-full flex items-center justify-center text-sm font-bold text-black">
            {initials}
          </div>
        )}
        <StatusDot member={member} />
      </div>

      <p className="text-[10px] font-bold text-black text-center leading-tight line-clamp-2 max-w-[55px]">
        {member.displayName || member.name || 'Unknown'}
      </p>

      <p className={`text-[9px] font-bold ${live ? 'text-green-600' : 'text-gray-400'}`}>
        {live ? 'Active' : 'Offline'}
      </p>
    </motion.button>
  );
}

export default function LeftSidebar({ userData, members, allStats, selectedMember, setSelectedMember, selectedMonth, setSelectedMonth }) {
  const { t } = useLanguage();
  const { logout } = useAuth();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchHistory, setSearchHistory] = useState(() => {
    if (typeof window === 'undefined') return [];
    try {
      return JSON.parse(localStorage.getItem('nesthub_search_history') || '[]');
    } catch {
      return [];
    }
  });
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activePage, setActivePage] = useState('dashboard');
  const searchRef = useRef(null);
  const suggestionsRef = useRef(null);

  const navigateInPlace = (pageId) => {
    const hash = pageId === 'dashboard' ? '' : `#${pageId}`;
    window.history.replaceState(null, '', `${window.location.pathname}${hash}`);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    setActivePage(pageId);
  };

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      if (hash) setActivePage(hash);
      else setActivePage('dashboard');
    };
    
    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const saveToHistory = (query) => {
    if (!query.trim()) return;
    const updated = [query, ...searchHistory.filter(h => h !== query)].slice(0, 5);
    setSearchHistory(updated);
    localStorage.setItem('nesthub_search_history', JSON.stringify(updated));
  };

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        suggestionsRef.current && 
        !suggestionsRef.current.contains(e.target) &&
        searchRef.current && 
        !searchRef.current.contains(e.target)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      toast.success('Logged out successfully');
      router.push('/login');
    } catch (error) {
      console.error('Logout error:', error);
      toast.error('Failed to logout');
    }
  };

  const isActive = (pageId) => activePage === pageId;

  const menuItems = DASHBOARD_MENU_ITEMS;
  const bottomItems = DASHBOARD_BOTTOM_ITEMS;

  const membersWithRoom = useMemo(() => {
    const currentUserRoom = userData?.room || '';
    const withRoom = members.filter(m => m.room && m.room.trim() !== '');
    const roommates = withRoom.filter(m => m.room === currentUserRoom);
    const others = withRoom.filter(m => m.room !== currentUserRoom);
    return [...roommates, ...others];
  }, [members, userData]);

  const searchSuggestions = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase();
    
    const memberResults = membersWithRoom
      .filter(m => 
        (m.displayName || m.name || '').toLowerCase().includes(query) ||
        (m.room || '').toLowerCase().includes(query)
      )
      .slice(0, 5)
      .map(m => ({
        type: 'member',
        id: m.uid || m.id,
        label: m.displayName || m.name,
        sublabel: m.room,
        photo: m.photo,
        member: m
      }));

    const menuResults = [...menuItems, ...bottomItems]
      .filter(item => item.label.toLowerCase().includes(query))
      .map(item => ({
        type: 'page',
        id: item.id,
        label: item.label,
        icon: item.icon,
        page: item.page
      }));

    return [...memberResults, ...menuResults];
  }, [searchQuery, membersWithRoom, menuItems, bottomItems]);

  const filteredMembers = useMemo(() => {
    if (!searchQuery.trim()) return membersWithRoom;
    const query = searchQuery.toLowerCase();
    return membersWithRoom.filter(m => 
      (m.displayName || m.name || '').toLowerCase().includes(query) ||
      (m.room || '').toLowerCase().includes(query)
    );
  }, [membersWithRoom, searchQuery]);

  const handleSearchSelect = (suggestion) => {
    if (suggestion.type === 'member') {
      setSelectedMember(suggestion.id);
      setSearchQuery(suggestion.label);
      saveToHistory(suggestion.label);
    } else if (suggestion.type === 'page') {
      navigateInPlace(suggestion.page);
      saveToHistory(suggestion.label);
    }
    setShowSuggestions(false);
  };

  const handleSearchSubmit = (e) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      saveToHistory(searchQuery);
      setShowSuggestions(false);
    }
  };

  // ==================== COLLAPSED SIDEBAR ====================
  if (!isOpen) {
    return (
      <div className="flex h-full w-[68px] flex-shrink-0 flex-col border-r border-slate-200 bg-white shadow-sm">
        <div className="flex-shrink-0 flex justify-center pt-4 pb-2">
          <button
            onClick={() => setIsOpen(true)}
            className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-all duration-200 relative group"
          >
            <Menu className="w-5 h-5 text-gray-700" />
            <span className="absolute left-full ml-3 px-3 py-1.5 bg-gray-900 text-white text-xs font-semibold rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-50 shadow-xl">
              Expand Menu
              <span className="absolute left-0 top-1/2 -translate-y-1/2 -ml-1 w-2 h-2 bg-gray-900 rotate-45" />
            </span>
          </button>
        </div>

        <div className="flex-shrink-0 flex flex-col items-center gap-1 px-2">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => navigateInPlace(item.page)}
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 relative group ${
                isActive(item.page) 
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <item.icon className="w-5 h-5" />
              <span className="absolute left-full ml-3 px-3 py-1.5 bg-gray-900 text-white text-xs font-semibold rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-50 shadow-xl">
                {item.label}
                <span className="absolute left-0 top-1/2 -translate-y-1/2 -ml-1 w-2 h-2 bg-gray-900 rotate-45" />
              </span>
              {isActive(item.page) && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-gray-900 rounded-r-full" />
              )}
            </button>
          ))}
        </div>

        <div className="flex-shrink-0 flex justify-center py-2">
          <div className="w-8 h-px bg-gray-200" />
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-none px-2">
          <div className="flex flex-col items-center gap-1.5 py-1">
            <MemberIcon
              member={{
                id: 'me',
                uid: 'me',
                ...userData,
                name: userData?.displayName || userData?.name || 'Me',
              }}
              isSelected={selectedMember === 'me'}
              onClick={() => setSelectedMember('me')}
              compact
            />
            {membersWithRoom.map(member => (
              <MemberIcon
                key={member.uid || member.id}
                member={member}
                isSelected={selectedMember === (member.uid || member.id)}
                onClick={() => setSelectedMember(member.uid || member.id)}
                compact
              />
            ))}
          </div>
        </div>

        <div className="flex-shrink-0 flex flex-col items-center gap-1 px-2 pb-2 border-t border-gray-100 pt-2">
          {bottomItems.map((item) => (
            <button
              key={item.id}
              onClick={() => navigateInPlace(item.page)}
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 relative group ${
                isActive(item.page) 
                  ? 'bg-gray-900 text-white shadow-lg shadow-gray-900/20' 
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <item.icon className="w-5 h-5" />
              <span className="absolute left-full ml-3 px-3 py-1.5 bg-gray-900 text-white text-xs font-semibold rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-50 shadow-xl">
                {item.label}
                <span className="absolute left-0 top-1/2 -translate-y-1/2 -ml-1 w-2 h-2 bg-gray-900 rotate-45" />
              </span>
            </button>
          ))}

          <button
            onClick={handleLogout}
            className="w-10 h-10 rounded-xl flex items-center justify-center text-gray-500 hover:bg-red-50 hover:text-red-500 transition-all duration-200 relative group mt-1"
          >
            <LogOut className="w-5 h-5" />
            <span className="absolute left-full ml-3 px-3 py-1.5 bg-red-500 text-white text-xs font-semibold rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-50 shadow-xl">
              Logout
              <span className="absolute left-0 top-1/2 -translate-y-1/2 -ml-1 w-2 h-2 bg-red-500 rotate-45" />
            </span>
          </button>
        </div>
      </div>
    );
  }

  // ==================== EXPANDED SIDEBAR ====================
  return (
    <div className="flex h-full w-[280px] flex-shrink-0 flex-col border-r border-slate-200 bg-white shadow-sm 2xl:w-[320px]">
      <div className="flex-shrink-0 border-b border-slate-100 bg-gradient-to-b from-white to-slate-50/70 p-4">
        <div className="flex items-center justify-between mb-3">
          <button
            type="button"
            onClick={() => setSelectedMember('me')}
            className="flex min-w-0 items-center gap-3 rounded-xl text-left transition hover:opacity-75"
            title="View my dashboard"
          >
            <div className="relative flex-shrink-0">
              {userData?.photo ? (
                <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-100 ring-2 ring-gray-100">
                  <img 
                    src={userData.photo} 
                    alt=""
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      e.target.style.display = 'none';
                      const initial = (userData?.displayName || userData?.name || '?').charAt(0).toUpperCase();
                      e.target.parentElement.innerHTML = `<div class="w-full h-full bg-gray-200 flex items-center justify-center text-sm font-bold text-black">${initial}</div>`;
                    }}
                  />
                </div>
              ) : (
                <div className="w-10 h-10 bg-gray-900 rounded-full flex items-center justify-center text-sm font-bold text-white ring-2 ring-gray-100">
                  {(userData?.displayName || userData?.name)?.charAt(0)?.toUpperCase() || '?'}
                </div>
              )}
              <StatusDot member={userData} />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-bold text-gray-900 truncate">
                {userData?.displayName || userData?.name || 'User'}
              </h1>
              <p className="text-[11px] text-gray-500 font-medium truncate">
                {userData?.room || 'Member'}
              </p>
            </div>
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-all flex-shrink-0"
          >
            <X className="w-4 h-4 text-gray-600" />
          </button>
        </div>

        <div className="relative" ref={searchRef}>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setShowSuggestions(true); }}
            onFocus={() => setShowSuggestions(true)}
            onKeyDown={handleSearchSubmit}
            placeholder="Search members or pages..."
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-8 text-[13px] font-semibold text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
          />
          {searchQuery && (
            <button
              onClick={() => { setSearchQuery(''); setShowSuggestions(false); }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2"
            >
              <X className="w-3.5 h-3.5 text-gray-400 hover:text-gray-600" />
            </button>
          )}

          <AnimatePresence>
            {showSuggestions && (searchQuery || searchHistory.length > 0) && (
              <motion.div
                ref={suggestionsRef}
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                className="absolute top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden"
              >
                {!searchQuery && searchHistory.length > 0 && (
                  <div>
                    <p className="px-3 py-2 text-[10px] font-bold text-gray-400 uppercase">Recent</p>
                    {searchHistory.map((item, i) => (
                      <button
                        key={i}
                        onClick={() => { setSearchQuery(item); saveToHistory(item); }}
                        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 transition-colors"
                      >
                        <Clock className="w-3.5 h-3.5 text-gray-400" />
                        <span className="text-[13px] text-gray-700 font-medium">{item}</span>
                      </button>
                    ))}
                  </div>
                )}

                {searchQuery && searchSuggestions.length > 0 && (
                  <div>
                    {searchSuggestions.map((suggestion, i) => (
                      <button
                        key={i}
                        onClick={() => handleSearchSelect(suggestion)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0"
                      >
                        {suggestion.type === 'member' ? (
                          <>
                            {suggestion.photo ? (
                              <img src={suggestion.photo} className="w-7 h-7 rounded-full object-cover" alt="" referrerPolicy="no-referrer" />
                            ) : (
                              <div className="w-7 h-7 bg-gray-200 rounded-full flex items-center justify-center text-[10px] font-bold text-gray-600">
                                {suggestion.label?.charAt(0)?.toUpperCase()}
                              </div>
                            )}
                            <div className="flex-1 text-left">
                              <p className="text-[13px] font-semibold text-gray-900">{suggestion.label}</p>
                              <p className="text-[11px] text-gray-400">{suggestion.sublabel}</p>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="w-7 h-7 bg-gray-100 rounded-lg flex items-center justify-center">
                              <suggestion.icon className="w-3.5 h-3.5 text-gray-600" />
                            </div>
                            <span className="text-[13px] font-semibold text-gray-900">{suggestion.label}</span>
                            <ArrowUpLeft className="w-3.5 h-3.5 text-gray-400 ml-auto" />
                          </>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {searchQuery && searchSuggestions.length === 0 && (
                  <div className="px-3 py-4 text-center">
                    <p className="text-[13px] text-gray-400 font-medium">No results</p>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="relative mt-3">
          <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <select
            value={selectedMonth}
            onChange={(event) => setSelectedMonth(event.target.value)}
            className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white pl-9 pr-8 text-xs font-bold text-slate-700 shadow-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
            aria-label="Select dashboard month"
          >
            {Array.from({ length: 12 }, (_, index) => {
              const date = new Date();
              date.setDate(1);
              date.setMonth(date.getMonth() - index);
              const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
              return (
                <option key={value} value={value}>
                  {date.toLocaleDateString('en-US', {
                    month: 'long',
                    year: 'numeric',
                  })}
                </option>
              );
            })}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-none">
        <div className="px-2 py-2">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => navigateInPlace(item.page)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14px] font-semibold transition-all duration-150 mb-0.5 ${
                isActive(item.page) 
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-600/15'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <item.icon className={`w-4.5 h-4.5 ${isActive(item.page) ? 'text-white' : 'text-gray-600'}`} />
              <span className="flex-1 text-left">{item.label}</span>
              {isActive(item.page) && <span className="w-1.5 h-1.5 bg-white rounded-full" />}
            </button>
          ))}
        </div>

        <div className="h-px bg-gray-100 mx-4 my-2" />

        <div className="px-3 mb-2">
          <div className="flex items-center justify-between py-2">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Members</p>
            <span className="text-[10px] font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
              {filteredMembers.length}
            </span>
          </div>
          
          {filteredMembers.length > 0 ? (
            <div className="grid grid-cols-4 gap-2">
              {filteredMembers.map(member => (
                <MemberIcon
                  key={member.uid || member.id}
                  member={member}
                  isSelected={selectedMember === (member.uid || member.id)}
                  onClick={() => setSelectedMember(member.uid || member.id)}
                />
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400 py-6 text-center font-medium">
              {searchQuery ? 'No matching members' : 'No members'}
            </p>
          )}
        </div>

        <div className="h-px bg-gray-100 mx-4 my-2" />

        <div className="px-2 pb-2">
          {bottomItems.map((item) => (
            <button
              key={item.id}
              onClick={() => navigateInPlace(item.page)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14px] font-semibold transition-all duration-150 mb-0.5 ${
                isActive(item.page) 
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-600/15'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <item.icon className={`w-4.5 h-4.5 ${isActive(item.page) ? 'text-white' : 'text-gray-600'}`} />
              <span className="flex-1 text-left">{item.label}</span>
              {isActive(item.page) && <span className="w-1.5 h-1.5 bg-white rounded-full" />}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-shrink-0 border-t border-gray-200 p-3 bg-gray-50/50">
        <div className="flex items-center gap-3">
          <div className="relative flex-shrink-0">
            {userData?.photo ? (
              <div className="w-9 h-9 rounded-full overflow-hidden bg-gray-100">
                <img 
                  src={userData.photo} 
                  alt=""
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    e.target.style.display = 'none';
                    const initial = (userData?.displayName || userData?.name || '?').charAt(0).toUpperCase();
                    e.target.parentElement.innerHTML = `<div class="w-full h-full bg-gray-200 flex items-center justify-center text-xs font-bold text-black">${initial}</div>`;
                  }}
                />
              </div>
            ) : (
              <div className="w-9 h-9 bg-gray-900 rounded-full flex items-center justify-center text-xs font-bold text-white">
                {(userData?.displayName || userData?.name)?.charAt(0)?.toUpperCase() || '?'}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-bold text-gray-900 truncate">
              {userData?.displayName || userData?.name || 'User'}
            </p>
            <p className="text-[11px] text-gray-500 font-medium">
              {userData?.room || 'Member'}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-[12px] font-semibold text-gray-600 hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-all duration-200 flex items-center gap-1.5 shadow-sm flex-shrink-0"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Logout</span>
          </button>
        </div>
      </div>
    </div>
  );
}
