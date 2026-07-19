'use client'

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, useScroll, useSpring } from 'framer-motion';
import { useAuth } from '@/lib/AuthContext';
import { auth, db } from '@/lib/firebase';
import { collection, query, where, getCountFromServer, getDocs, orderBy, limit } from 'firebase/firestore';
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import Link from 'next/link';
import { 
  Users, UserCheck, Utensils, ShoppingCart, 
  DollarSign, TrendingUp, Activity,
  ArrowRight, BarChart3, Zap, Shield,
  ChevronRight, Clock, Loader2, Sparkles
} from 'lucide-react';
import { 
  BarChart, Bar, PieChart as RePieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart
} from 'recharts';

// ==================== SCROLL PROGRESS BAR ====================
function ScrollProgressBar() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001,
  });
  return (
    <motion.div
      style={{ scaleX }}
      className="fixed top-0 left-0 right-0 h-[3px] z-[9999] origin-left bg-gradient-to-r from-violet-500 via-purple-500 to-cyan-500"
    />
  );
}

// ==================== HOOKS ====================
function useCountUp(end, duration = 2000, start = false) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!start) return;
    let frame, startTime;
    const animate = (ts) => {
      if (!startTime) startTime = ts;
      const p = Math.min((ts - startTime) / duration, 1);
      setCount(Math.floor((1 - Math.pow(1 - p, 4)) * end));
      if (p < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [end, duration, start]);
  return count;
}

// ==================== STAT CARD ====================
function StatCard({ icon: Icon, label, value, prefix = '', suffix = '', color, delay = 0 }) {
  const [start, setStart] = useState(false);
  const count = useCountUp(value, 2000, start);
  useEffect(() => {
    const t = setTimeout(() => setStart(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: delay / 1000 }}
      whileHover={{ y: -2 }}
      className="bg-white/70 backdrop-blur-xl border border-white/80 rounded-xl sm:rounded-2xl p-3 sm:p-4 shadow-lg shadow-gray-100/50 group"
    >
      <div className="flex items-center gap-2 sm:gap-3 mb-1.5 sm:mb-2">
        <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${color}15` }}>
          <Icon className="w-3.5 h-3.5 sm:w-4.5 sm:h-4.5" style={{ color }} />
        </div>
      </div>
      <div className="text-lg sm:text-xl font-bold text-gray-800 tabular-nums">{prefix}{count.toLocaleString()}{suffix}</div>
      <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5 font-medium truncate">{label}</p>
    </motion.div>
  );
}

// ==================== ACTIVITY ITEM ====================
function ActivityItem({ icon: Icon, title, description, time, color }) {
  return (
    <div className="flex items-start gap-2.5 py-2">
      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${color}15` }}>
        <Icon className="w-3.5 h-3.5" style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs sm:text-sm font-medium text-gray-700 truncate">{title}</p>
        <p className="text-[10px] sm:text-xs text-gray-500 truncate">{description}</p>
      </div>
      <span className="text-[9px] sm:text-[10px] text-gray-400 whitespace-nowrap">{time}</span>
    </div>
  );
}

// ==================== CONSTANTS ====================
const CHART_COLORS = ['#6366F1', '#06B6D4', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444'];
const PIE_COLORS = ['#6366F1', '#06B6D4', '#8B5CF6', '#F59E0B'];
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

// ==================== FLOATING ORBS ====================
function FloatingOrbs() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      <motion.div animate={{ y: [0,-30,0], x: [0,20,0], scale: [1,1.1,1] }} transition={{ duration:8, repeat:Infinity, ease:'easeInOut' }} className="absolute top-1/4 left-1/4 w-72 sm:w-96 h-72 sm:h-96 bg-violet-200/25 rounded-full blur-[100px]" />
      <motion.div animate={{ y: [0,25,0], x: [0,-15,0], scale: [1,0.95,1] }} transition={{ duration:10, repeat:Infinity, ease:'easeInOut' }} className="absolute bottom-1/4 right-1/4 w-80 sm:w-[500px] h-80 sm:h-[500px] bg-cyan-200/20 rounded-full blur-[120px]" />
    </div>
  );
}

// ==================== MAIN COMPONENT ====================
export default function HeroSection() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState(null);
  const [expenseTrend, setExpenseTrend] = useState([]);
  const [mealData, setMealData] = useState([]);
  const [expenseCategories, setExpenseCategories] = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function fetchAllData() {
      try {
        const [totalMembersSnap, activeMembersSnap, mealsSnap, grocerySnap, expensesSnap, activitySnap] = await Promise.allSettled([
          getCountFromServer(collection(db, 'users')),
          getCountFromServer(query(collection(db, 'users'), where('isActive', '==', true))),
          getCountFromServer(query(collection(db, 'meals'), where('createdAt', '>=', new Date(new Date().getFullYear(), new Date().getMonth(), 1)))),
          getCountFromServer(query(collection(db, 'groceries'), where('createdAt', '>=', new Date(new Date().getFullYear(), new Date().getMonth(), 1)))),
          getDocs(query(collection(db, 'expenses'), orderBy('createdAt', 'desc'), limit(50))),
          getDocs(query(collection(db, 'activityLog'), orderBy('timestamp', 'desc'), limit(5))),
        ]);
        if (cancelled) return;
        const totalMembers = totalMembersSnap.status === 'fulfilled' ? totalMembersSnap.value.data().count : 0;
        const activeMembers = activeMembersSnap.status === 'fulfilled' ? activeMembersSnap.value.data().count : 0;
        const totalMeals = mealsSnap.status === 'fulfilled' ? mealsSnap.value.data().count : 0;
        const totalGrocery = grocerySnap.status === 'fulfilled' ? grocerySnap.value.data().count : 0;
        let totalExpenses = 0;
        const monthlyExpenses = {};
        const categoryExpenses = { Grocery: 0, Utilities: 0, Maintenance: 0, Other: 0 };
        if (expensesSnap.status === 'fulfilled') {
          expensesSnap.value.forEach(doc => {
            const data = doc.data();
            const amount = data.amount || 0;
            totalExpenses += amount;
            const month = new Date(data.createdAt?.toDate()).toLocaleString('default', { month: 'short' });
            monthlyExpenses[month] = (monthlyExpenses[month] || 0) + amount;
            const cat = data.category || 'Other';
            if (categoryExpenses[cat] !== undefined) categoryExpenses[cat] += amount;
            else categoryExpenses['Other'] += amount;
          });
        }
        const budget = 50000;
        setStats({ totalMembers, activeMembers, totalMeals, totalGrocery, totalExpenses: Math.round(totalExpenses), budget, balance: Math.round(budget - totalExpenses) });
        setExpenseTrend(MONTHS.map(m => ({ name: m, expenses: monthlyExpenses[m] || Math.floor(Math.random() * 30000) + 5000 })));
        setMealData(DAYS.map(d => ({ name: d, breakfast: Math.floor(Math.random() * 50) + 10, lunch: Math.floor(Math.random() * 80) + 20, dinner: Math.floor(Math.random() * 60) + 15 })));
        setExpenseCategories([{ name: 'Grocery', value: categoryExpenses.Grocery || 25000 }, { name: 'Utilities', value: categoryExpenses.Utilities || 10000 }, { name: 'Maintenance', value: categoryExpenses.Maintenance || 8000 }, { name: 'Other', value: categoryExpenses.Other || 7000 }]);
        if (activitySnap.status === 'fulfilled') {
          setRecentActivity(activitySnap.value.docs.map(doc => ({ ...doc.data(), time: doc.data().timestamp?.toDate()?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) || '' })));
        }
        setDataLoaded(true);
      } catch {
        setStats({ totalMembers: 0, activeMembers: 0, totalMeals: 0, totalGrocery: 0, totalExpenses: 0, budget: 50000, balance: 50000 });
        setExpenseTrend(MONTHS.map(m => ({ name: m, expenses: 0 })));
        setMealData(DAYS.map(d => ({ name: d, breakfast: 0, lunch: 0, dinner: 0 })));
        setExpenseCategories([{ name: 'Grocery', value: 0 }, { name: 'Utilities', value: 0 }, { name: 'Maintenance', value: 0 }, { name: 'Other', value: 0 }]);
        setRecentActivity([]);
        setDataLoaded(true);
      }
    }
    fetchAllData();
    return () => { cancelled = true; };
  }, []);

  // ==================== GOOGLE ONE TAP (NO POPUP) ====================
  const handleGetStarted = useCallback(async () => {
    setGoogleLoading(true);
    try {
      const response = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('timeout')), 30000);
        window.google?.accounts?.id?.initialize({
          client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
          callback: (r) => { clearTimeout(timeout); resolve(r); },
          auto_select: false,
          cancel_on_tap_outside: true,
        });
        window.google?.accounts?.id?.prompt((n) => {
          if (n.isNotDisplayed()) {
            clearTimeout(timeout);
            reject(new Error(n.getNotDisplayedReason()));
          }
        });
      });
      const credential = GoogleAuthProvider.credential(response.credential);
      await signInWithCredential(auth, credential);
      router.push('/dashboard');
    } catch (err) {
      console.log('One Tap failed:', err.message);
    } finally {
      setGoogleLoading(false);
    }
  }, [router]);

  // Load GSI script
  useEffect(() => {
    if (document.getElementById('gsi-client')) return;
    const script = document.createElement('script');
    script.id = 'gsi-client';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  }, []);

  if (authLoading || !dataLoaded) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-violet-600 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <section id="hero" className="relative overflow-hidden bg-gradient-to-br from-gray-50 via-white to-violet-50">
      <ScrollProgressBar />
      <FloatingOrbs />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-20 lg:py-24 relative z-10">
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 xl:gap-16 items-center mb-12 lg:mb-16">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6 }} className="text-center lg:text-left">
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.5 }} className="inline-flex items-center gap-2 px-3 py-1.5 bg-violet-100/60 backdrop-blur-sm rounded-full text-xs font-semibold text-violet-700 mb-5 sm:mb-6 border border-violet-200/50">
              <Sparkles className="w-3.5 h-3.5" />Smart Meal Management
            </motion.div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-5xl xl:text-6xl font-bold text-gray-900 leading-tight mb-3 sm:mb-4">
              Welcome to{' '}
              <span className="relative inline-block">
                <span className="bg-gradient-to-r from-violet-600 via-purple-600 to-violet-600 bg-clip-text text-transparent">NestHub</span>
                <motion.span animate={{ opacity: [0, 0.5, 0] }} transition={{ duration: 2, repeat: Infinity }} className="absolute -bottom-1 left-0 right-0 h-[3px] bg-gradient-to-r from-violet-400 to-purple-400 rounded-full blur-sm" />
              </span>
            </h1>
            <p className="text-sm sm:text-base lg:text-lg text-gray-600 mb-6 sm:mb-8 leading-relaxed max-w-lg mx-auto lg:mx-0">
              Simplify meal planning, track expenses, manage groceries, and gain real-time insights — all from one intelligent platform.
            </p>
            <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3 justify-center lg:justify-start">
              {!user ? (
                <>
                  <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={handleGetStarted} disabled={googleLoading} className="group relative inline-flex items-center justify-center gap-2 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white font-semibold px-5 sm:px-6 py-2.5 sm:py-3 rounded-xl transition-all shadow-xl shadow-violet-200 text-sm sm:text-base disabled:opacity-70 overflow-hidden">
                    <span className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                    {googleLoading ? <Loader2 className="w-4 h-4 animate-spin relative z-10" /> : <ArrowRight className="w-4 h-4 relative z-10" />}
                    <span className="relative z-10">Get Started</span>
                  </motion.button>
                  <motion.a whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} href="#journey" className="inline-flex items-center justify-center gap-2 bg-white hover:bg-gray-50 text-gray-700 font-semibold px-5 sm:px-6 py-2.5 sm:py-3 rounded-xl border border-gray-200 hover:border-gray-300 transition-all text-sm sm:text-base shadow-sm hover:shadow-md">
                    See How It Works<ChevronRight className="w-4 h-4" />
                  </motion.a>
                </>
              ) : (
                <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                  <Link href="/dashboard" className="group relative inline-flex items-center justify-center gap-2 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white font-semibold px-5 sm:px-6 py-2.5 sm:py-3 rounded-xl transition-all shadow-xl shadow-violet-200 text-sm sm:text-base overflow-hidden">
                    <span className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                    <span className="relative z-10">Go to Dashboard</span><ArrowRight className="w-4 h-4 relative z-10" />
                  </Link>
                </motion.div>
              )}
            </div>
            <div className="flex flex-wrap gap-3 sm:gap-5 mt-6 sm:mt-8 justify-center lg:justify-start">
              {[{ icon: Shield, text: 'Real-Time Data' },{ icon: Zap, text: 'Secure Authentication' },{ icon: BarChart3, text: 'Automated Reports' }].map((item, i) => (
                <motion.div key={i} whileHover={{ scale: 1.05, y: -2 }} className="flex items-center gap-1.5 text-[10px] sm:text-xs text-gray-500 font-medium bg-white/50 backdrop-blur-sm px-3 py-1.5 rounded-full border border-gray-100">
                  <item.icon className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-violet-500" />{item.text}
                </motion.div>
              ))}
            </div>
          </motion.div>
          <motion.div initial={{ opacity: 0, x: 20, scale: 0.95 }} animate={{ opacity: 1, x: 0, scale: 1 }} transition={{ duration: 0.7, delay: 0.15 }}>
            <div className="bg-white/60 backdrop-blur-xl border border-white/80 rounded-2xl sm:rounded-3xl p-4 sm:p-5 shadow-2xl shadow-violet-100/30">
              <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-3 sm:mb-4">
                <StatCard icon={Users} label="Total Members" value={stats.totalMembers} color="#6366F1" delay={200} />
                <StatCard icon={UserCheck} label="Active Members" value={stats.activeMembers} color="#06B6D4" delay={350} />
                <StatCard icon={Utensils} label="Meals This Month" value={stats.totalMeals} color="#8B5CF6" delay={500} />
                <StatCard icon={ShoppingCart} label="Groceries" value={stats.totalGrocery} color="#10B981" delay={650} />
              </div>
              <div className="bg-white/50 rounded-xl sm:rounded-2xl p-3 sm:p-4 mb-3 sm:mb-4 border border-gray-100">
                <div className="flex items-center justify-between mb-2 sm:mb-3">
                  <h4 className="text-xs sm:text-sm font-semibold text-gray-700">Expense Trend</h4>
                  <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-violet-500" />
                </div>
                <ResponsiveContainer width="100%" height={120}>
                  <AreaChart data={expenseTrend} margin={{ top:0, right:0, left:-25, bottom:0 }}>
                    <defs><linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6366F1" stopOpacity="0.3"/><stop offset="100%" stopColor="#6366F1" stopOpacity="0"/></linearGradient></defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9"/>
                    <XAxis dataKey="name" tick={{fontSize:9,fill:'#94A3B8'}} axisLine={false} tickLine={false} interval={1}/>
                    <YAxis tick={{fontSize:9,fill:'#94A3B8'}} axisLine={false} tickLine={false}/>
                    <Area type="monotone" dataKey="expenses" stroke="#6366F1" strokeWidth={2} fill="url(#expenseGrad)"/>
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                <div className="bg-white/50 rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-gray-100">
                  <h4 className="text-[10px] sm:text-xs font-semibold text-gray-700 mb-1.5 sm:mb-2">Meals</h4>
                  <ResponsiveContainer width="100%" height={80}>
                    <BarChart data={mealData} margin={{ top:0, right:0, left:-15, bottom:0 }}><Bar dataKey="lunch" fill="#6366F1" radius={[3,3,0,0]}/></BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="bg-white/50 rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-gray-100">
                  <h4 className="text-[10px] sm:text-xs font-semibold text-gray-700 mb-1.5 sm:mb-2">Categories</h4>
                  <ResponsiveContainer width="100%" height={80}>
                    <RePieChart><Pie data={expenseCategories} cx="50%" cy="50%" innerRadius={20} outerRadius={32} dataKey="value" stroke="none">{expenseCategories.map((_,i)=><Cell key={i} fill={PIE_COLORS[i]}/>)}</Pie></RePieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
        <motion.div initial={{ opacity:0, y:15 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.5, delay:0.4 }} className="grid sm:grid-cols-2 gap-4 sm:gap-6">
          <div className="bg-white/50 backdrop-blur-xl border border-white/80 rounded-2xl p-4 sm:p-6 shadow-lg shadow-gray-100/30">
            <h3 className="text-xs sm:text-sm font-semibold text-gray-700 mb-3 sm:mb-4 flex items-center gap-2"><Activity className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-violet-500"/>System Summary</h3>
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <div><p className="text-[10px] sm:text-xs text-gray-500">Members</p><p className="text-lg sm:text-xl font-bold text-gray-800">{stats.totalMembers.toLocaleString()}</p></div>
              <div><p className="text-[10px] sm:text-xs text-gray-500">Meals Today</p><p className="text-lg sm:text-xl font-bold text-gray-800">{Math.floor(stats.totalMeals/30).toLocaleString()}</p></div>
              <div><p className="text-[10px] sm:text-xs text-gray-500">Budget</p><p className="text-lg sm:text-xl font-bold text-gray-800">${stats.budget.toLocaleString()}</p></div>
              <div><p className="text-[10px] sm:text-xs text-gray-500">Balance</p><p className={`text-lg sm:text-xl font-bold ${stats.balance>=0?'text-emerald-600':'text-red-500'}`}>${stats.balance.toLocaleString()}</p></div>
            </div>
          </div>
          <div className="bg-white/50 backdrop-blur-xl border border-white/80 rounded-2xl p-4 sm:p-6 shadow-lg shadow-gray-100/30">
            <h3 className="text-xs sm:text-sm font-semibold text-gray-700 mb-3 sm:mb-4 flex items-center gap-2"><Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-violet-500"/>Recent Activity</h3>
            {recentActivity.length>0?(
              <div className="divide-y divide-gray-100">{recentActivity.map((activity,i)=><ActivityItem key={i} icon={activity.type==='member'?Users:activity.type==='meal'?Utensils:activity.type==='grocery'?ShoppingCart:DollarSign} title={activity.title||'Activity'} description={activity.description||''} time={activity.time} color={CHART_COLORS[i%CHART_COLORS.length]}/>)}</div>
            ):<p className="text-xs sm:text-sm text-gray-400 text-center py-4">No recent activity</p>}
          </div>
        </motion.div>
      </div>
    </section>
  );
}