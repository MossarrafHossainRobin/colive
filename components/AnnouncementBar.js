'use client'

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { db } from '@/lib/firebase';
import { calculateMonthlyBazarTotals } from '@/lib/bazarCalculations';
import { collection, query, orderBy, onSnapshot, where, getDocs } from 'firebase/firestore';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { X, MapPin, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';

/* ============================================================
   CONFIGURATION
   ============================================================ */
const SLIDE_INTERVAL = 5000;
const SCROLL_SPEED = 30;

const typeConfig = {
  general:    { accent: '#6366F1', bg: 'from-indigo-50 to-purple-50', border: 'border-indigo-200', text: 'text-indigo-700', badge: 'bg-indigo-500' },
  emergency:  { accent: '#EF4444', bg: 'from-red-50 to-rose-50', border: 'border-red-200', text: 'text-red-700', badge: 'bg-red-500' },
  nobazar:    { accent: '#F59E0B', bg: 'from-amber-50 to-orange-50', border: 'border-amber-200', text: 'text-amber-700', badge: 'bg-amber-500' },
  bazar:      { accent: '#10B981', bg: 'from-emerald-50 to-teal-50', border: 'border-emerald-200', text: 'text-emerald-700', badge: 'bg-emerald-500' },
};

// In-memory dismissed IDs (resets on page refresh)
const dismissedIds = new Set();

/* ============================================================
   MAIN COMPONENT
   ============================================================ */
export default function AnnouncementBar() {
  const [announcements, setAnnouncements] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [memberStats, setMemberStats] = useState({});
  const [loading, setLoading] = useState(true);
  
  const intervalRef = useRef(null);
  const scrollRef = useRef(null);
  const scrollPosRef = useRef(0);
  const animFrameRef = useRef(null);
  const reduceMotion = useReducedMotion();

  const currentMonth = useMemo(() => new Date().toISOString().substring(0, 7), []);

  // Fetch member bazar stats
  const fetchStats = useCallback(async (memberId) => {
    if (!memberId || memberStats[memberId]) return;
    try {
      const snap = await getDocs(query(collection(db, "bazar"), where("userId", "==", memberId), where("month", "==", currentMonth)));
      const entries = snap.docs.map(d => d.data()).filter((entry) => !entry.isDeleted);
      const totals = calculateMonthlyBazarTotals(entries, currentMonth);
      const total = totals.byMember[memberId] || 0;
      const last = [...entries].sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
      setMemberStats(prev => ({
        ...prev,
        [memberId]: {
          total,
          count: totals.countByMember[memberId] || 0,
          lastPlace: last?.place || '—',
        },
      }));
    } catch {}
  }, [currentMonth, memberStats]);

  // Real-time announcements listener
  useEffect(() => {
    const q = query(collection(db, "announcements"), orderBy("priority", "desc"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const active = all.filter(a => a.active !== false && !dismissedIds.has(a.id));
      setAnnouncements(active);
      setLoading(false);
      active.forEach(a => { if (a.type === 'bazar' && a.bazarDetails?.memberId) fetchStats(a.bazarDetails.memberId); });
    });
    return () => unsub();
  }, [fetchStats]);

  // Auto-slide between announcements
  useEffect(() => {
    if (announcements.length <= 1 || isPaused || reduceMotion) return;
    intervalRef.current = setInterval(() => setCurrentIndex(prev => (prev + 1) % announcements.length), SLIDE_INTERVAL);
    return () => clearInterval(intervalRef.current);
  }, [announcements.length, isPaused, reduceMotion]);

  // Smooth scroll for bazar items
  useEffect(() => {
    if (!scrollRef.current || isPaused) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      return;
    }
    
    const scroll = () => {
      if (scrollRef.current) {
        const container = scrollRef.current;
        scrollPosRef.current += 0.4;
        if (scrollPosRef.current >= container.scrollWidth / 2) scrollPosRef.current = 0;
        container.scrollLeft = scrollPosRef.current;
      }
      animFrameRef.current = requestAnimationFrame(scroll);
    };
    
    const current = announcements[currentIndex];
    if (current?.type === 'bazar' && current.bazarDetails?.items?.length > 4) {
      animFrameRef.current = requestAnimationFrame(scroll);
    }
    
    return () => { if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current); };
  }, [isPaused, currentIndex, announcements]);

  useEffect(() => { if (currentIndex >= announcements.length) setCurrentIndex(0); }, [announcements.length, currentIndex]);

  if (loading) {
    return (
      <div className="w-full bg-gradient-to-r from-gray-50 to-slate-50 border-b border-gray-100">
        <div className="px-4 py-2 flex items-center gap-3 animate-pulse max-w-7xl mx-auto">
          <div className="h-1.5 w-1.5 rounded-full bg-gray-300" />
          <div className="h-3 w-20 bg-gray-200 rounded" />
          <div className="flex-1 h-3 bg-gray-100 rounded" />
        </div>
      </div>
    );
  }

  if (announcements.length === 0) return null;

  const current = announcements[currentIndex];
  if (!current) return null;

  const config = typeConfig[current.type] || typeConfig.general;
  const isBazar = current.type === 'bazar';
  const bd = current.bazarDetails;
  const stats = bd ? memberStats[bd.memberId] : null;
  const items = bd?.items || [];

  const handleDismiss = (id) => { dismissedIds.add(id); setAnnouncements(prev => prev.filter(a => a.id !== id)); };

  return (
    <div className="w-full border-b border-gray-100 shadow-sm overflow-hidden" style={{ background: `linear-gradient(135deg, ${config.accent}08 0%, ${config.accent}03 100%)` }}>
      
      {/* Top accent line */}
      <div className="h-[2px] w-full" style={{ backgroundColor: config.accent, opacity: 0.3 }} />

      <div className="relative max-w-7xl mx-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={current.id}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="px-3 sm:px-5 py-2 sm:py-2.5"
            onMouseEnter={() => setIsPaused(true)}
            onMouseLeave={() => setIsPaused(false)}
          >
            <div className="flex items-center gap-3">
              
              {/* Pulsing dot */}
              <span className="relative flex h-1.5 w-1.5 flex-shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ backgroundColor: config.accent }} />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ backgroundColor: config.accent }} />
              </span>

              {/* Type Badge */}
              <span className="text-[10px] font-bold uppercase tracking-wider flex-shrink-0 hidden sm:inline" style={{ color: config.accent }}>
                {current.type === 'nobazar' ? 'No Bazar' : current.type}
              </span>

              {/* Content */}
              <div className="flex-1 min-w-0 overflow-hidden">
                
                {/* Non-Bazar: Scrolling text */}
                {!isBazar && (
                  <div className="overflow-hidden whitespace-nowrap">
                    <div 
                      className="inline-flex gap-16 animate-marquee"
                      style={{ animationPlayState: isPaused ? 'paused' : 'running' }}
                    >
                      <span className="text-[13px] sm:text-sm font-semibold text-gray-800">
                        {[current.title, current.message].filter(Boolean).join(' — ')}
                      </span>
                      <span className="text-[13px] sm:text-sm font-semibold text-gray-800" aria-hidden="true">
                        {[current.title, current.message].filter(Boolean).join(' — ')}
                      </span>
                    </div>
                  </div>
                )}

                {/* Bazar: Rich layout */}
                {isBazar && bd && (
                  <div className="flex items-center gap-2 sm:gap-3">
                    
                    {/* Member Avatar */}
                    <div className="relative flex-shrink-0">
                      {bd.memberPhoto ? (
                        <img src={bd.memberPhoto} alt="" className="w-8 h-8 sm:w-9 sm:h-9 rounded-full object-cover ring-1 ring-white shadow-sm" />
                      ) : (
                        <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-sm" style={{ backgroundColor: config.accent }}>
                          {(bd.memberName)?.charAt(0)?.toUpperCase() || '?'}
                        </div>
                      )}
                      <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white bg-green-500" />
                    </div>

                    {/* Name + Stats */}
                    <div className="flex-shrink-0 hidden sm:block">
                      <p className="text-xs font-bold text-gray-900 leading-tight">{bd.memberName}</p>
                      <p className="text-[9px] text-gray-500">{bd.memberRoom}</p>
                    </div>

                    {/* Stats Pills */}
                    <div className="hidden sm:flex items-center gap-1.5 flex-shrink-0">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ backgroundColor: `${config.accent}15`, color: config.accent }}>
                        <Sparkles className="w-3 h-3" />
                        ৳{(stats?.total || 0).toLocaleString()}
                      </span>
                      <span className="text-[10px] text-gray-400">{stats?.count || 0} trips</span>
                      <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                        <MapPin className="w-2.5 h-2.5" />{stats?.lastPlace || '—'}
                      </span>
                    </div>

                    {/* Scrolling Items */}
                    <div className="flex-1 overflow-hidden" ref={scrollRef}>
                      <div className="flex gap-1.5" style={{ width: 'max-content' }}>
                        {[...items, ...items].map((item, i) => (
                          <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-medium border flex-shrink-0 bg-white/80"
                            style={{ borderColor: `${config.accent}30`, color: config.accent }}>
                            <span>{item.name}</span>
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Mobile: Name + total */}
                    <div className="sm:hidden flex items-center gap-2 min-w-0">
                      <span className="text-xs font-bold text-gray-900 truncate">{bd.memberName}</span>
                      <span className="text-[10px] font-bold" style={{ color: config.accent }}>৳{(stats?.total || 0).toLocaleString()}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 flex-shrink-0">
                {announcements.length > 1 && (
                  <div className="hidden sm:flex items-center gap-0.5 bg-white/60 rounded-full px-1 py-0.5 border border-gray-200">
                    <button onClick={() => setCurrentIndex(prev => (prev - 1 + announcements.length) % announcements.length)}
                      className="p-0.5 rounded-full hover:bg-gray-100 transition-colors">
                      <ChevronLeft className="w-3 h-3 text-gray-500" />
                    </button>
                    <span className="text-[9px] text-gray-400 font-medium min-w-[28px] text-center">{currentIndex + 1}/{announcements.length}</span>
                    <button onClick={() => setCurrentIndex(prev => (prev + 1) % announcements.length)}
                      className="p-0.5 rounded-full hover:bg-gray-100 transition-colors">
                      <ChevronRight className="w-3 h-3 text-gray-500" />
                    </button>
                  </div>
                )}
                <button onClick={() => handleDismiss(current.id)}
                  className="p-1 rounded-full hover:bg-red-50 transition-colors group flex-shrink-0">
                  <X className="w-3.5 h-3.5 text-gray-400 group-hover:text-red-500" />
                </button>
              </div>
            </div>

            {/* Progress Bar */}
            {announcements.length > 1 && !reduceMotion && (
              <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gray-100">
                <motion.div
                  className="h-full rounded-r-full"
                  style={{ backgroundColor: config.accent }}
                  initial={{ width: '0%' }}
                  animate={{ width: isPaused ? '0%' : '100%' }}
                  transition={{ duration: SLIDE_INTERVAL / 1000, ease: 'linear' }}
                  key={current.id}
                />
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* CSS Animation */}
      <style jsx global>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-marquee {
          animation: marquee 20s linear infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-marquee { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
