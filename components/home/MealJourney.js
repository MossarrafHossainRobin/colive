'use client'

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, useInView } from 'framer-motion';
import { useAuth } from '@/lib/AuthContext';
import { auth } from '@/lib/firebase';
import { GoogleAuthProvider, signInWithCredential, signInWithPopup } from 'firebase/auth';
import { 
  CalendarDays, ShoppingCart, Utensils, DollarSign, 
  Calculator, BarChart3, ArrowRight, Loader2
} from 'lucide-react';

// ==================== JOURNEY STEPS ====================
const journeySteps = [
  {
    id: 1,
    icon: CalendarDays,
    title: 'Meal Planning',
    description: 'Create daily and weekly meal schedules and organize food requirements.',
    color: '#6366F1',
    gradient: 'from-violet-500 to-indigo-500',
    stat: '48 Weekly Plans'
  },
  {
    id: 2,
    icon: ShoppingCart,
    title: 'Grocery Management',
    description: 'Track inventory, monitor stock levels, and manage purchases efficiently.',
    color: '#06B6D4',
    gradient: 'from-cyan-500 to-teal-500',
    stat: '2,340 Items Tracked'
  },
  {
    id: 3,
    icon: Utensils,
    title: 'Meal Recording',
    description: 'Record daily meal consumption and maintain accurate meal counts.',
    color: '#8B5CF6',
    gradient: 'from-violet-500 to-purple-500',
    stat: '12,500 Meals Recorded'
  },
  {
    id: 4,
    icon: DollarSign,
    title: 'Expense Tracking',
    description: 'Monitor grocery costs, utilities, and operational expenses.',
    color: '#F59E0B',
    gradient: 'from-amber-500 to-orange-500',
    stat: '890 Expenses Tracked'
  },
  {
    id: 5,
    icon: Calculator,
    title: 'Smart Calculation',
    description: 'Automatically calculate meal rates, balances, and financial summaries.',
    color: '#EC4899',
    gradient: 'from-pink-500 to-rose-500',
    stat: 'Auto-Calculated'
  },
  {
    id: 6,
    icon: BarChart3,
    title: 'Reporting & Analytics',
    description: 'Generate visual reports, trends, and actionable insights.',
    color: '#10B981',
    gradient: 'from-emerald-500 to-green-500',
    stat: 'Real-Time Reports'
  },
];

const particleColors = ['#6366F1', '#06B6D4', '#8B5CF6', '#F59E0B', '#EC4899', '#10B981'];
const floatingParticles = Array.from({ length: 12 }, (_, index) => ({
  initialX: ((index * 37 + 11) % 101) - 50,
  initialY: ((index * 53 + 7) % 101) - 50,
  animateX: ((index * 29 + 17) % 61) - 30,
  animateY: ((index * 43 + 5) % 61) - 30,
  duration: 3 + ((index * 17) % 40) / 10,
  delay: ((index * 13) % 30) / 10,
  color: particleColors[index % particleColors.length],
}));

// ==================== STEP CARD ====================
function StepCard({ step, index, isInView }) {
  const isLeft = index % 2 === 0;
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 40, x: isLeft ? -30 : 30 }}
      animate={isInView ? { opacity: 1, y: 0, x: 0 } : {}}
      transition={{ duration: 0.6, delay: 0.3 + index * 0.15, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -4, scale: 1.02 }}
      className={`relative flex items-center gap-4 sm:gap-6 ${isLeft ? 'flex-row' : 'flex-row-reverse'} group`}
    >
      {/* Card */}
      <div className={`flex-1 bg-white/60 backdrop-blur-xl border border-white/80 rounded-2xl p-5 sm:p-6 shadow-lg shadow-gray-100/50 hover:shadow-xl transition-shadow duration-300 ${isLeft ? 'text-left' : 'text-right'}`}>
        <div className={`flex items-start gap-3 sm:gap-4 ${isLeft ? 'flex-row' : 'flex-row-reverse'}`}>
          <motion.div
            whileHover={{ rotate: [0, -10, 10, 0], scale: 1.1 }}
            transition={{ duration: 0.4 }}
            className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm"
            style={{ background: `${step.color}15` }}
          >
            <step.icon className="w-5 h-5 sm:w-6 sm:h-6" style={{ color: step.color }} />
          </motion.div>
          <div className={isLeft ? 'text-left' : 'text-right'}>
            <h4 className="text-sm sm:text-base font-semibold text-gray-800 mb-1">{step.title}</h4>
            <p className="text-xs sm:text-sm text-gray-500 leading-relaxed">{step.description}</p>
            <motion.div
              initial={{ width: 0 }}
              animate={isInView ? { width: '100%' } : { width: 0 }}
              transition={{ duration: 1, delay: 0.8 + index * 0.15 }}
              className={`h-0.5 rounded-full mt-3 max-w-[120px] ${isLeft ? 'mr-auto' : 'ml-auto'}`}
              style={{ background: `linear-gradient(${isLeft ? '90deg' : '270deg'}, ${step.color}, transparent)` }}
            />
            <p className="text-[10px] sm:text-xs font-medium mt-2" style={{ color: step.color }}>
              {step.stat}
            </p>
          </div>
        </div>
      </div>

      {/* Node on the path */}
      <motion.div
        initial={{ scale: 0 }}
        animate={isInView ? { scale: 1 } : { scale: 0 }}
        transition={{ duration: 0.4, delay: 0.5 + index * 0.15, type: 'spring' }}
        className="relative flex-shrink-0 z-10"
      >
        <motion.div
          animate={{ boxShadow: [`0 0 0 0 ${step.color}30`, `0 0 0 12px ${step.color}00`, `0 0 0 0 ${step.color}30`] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
          className="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center"
          style={{ background: `linear-gradient(135deg, ${step.color}, ${step.color}dd)` }}
        >
          <span className="text-white text-xs sm:text-sm font-bold">{step.id}</span>
        </motion.div>
      </motion.div>

      {/* Spacer for alignment */}
      <div className="flex-1 hidden sm:block" />
    </motion.div>
  );
}

// ==================== FLOATING PARTICLES ====================
function FloatingParticles() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {floatingParticles.map((particle, index) => (
        <motion.div
          key={index}
          initial={{ opacity: 0, x: particle.initialX, y: particle.initialY }}
          animate={{
            opacity: [0, 0.6, 0],
            x: [0, particle.animateX],
            y: [0, particle.animateY],
          }}
          transition={{
            duration: particle.duration,
            repeat: Infinity,
            delay: particle.delay,
            ease: 'easeInOut',
          }}
          className="absolute top-1/2 left-1/2 w-1.5 h-1.5 rounded-full"
          style={{ background: particle.color }}
        />
      ))}
    </div>
  );
}

// ==================== MAIN COMPONENT ====================
export default function MealJourney() {
  const router = useRouter();
  const { user } = useAuth();
  const sectionRef = useRef(null);
  const isInView = useInView(sectionRef, { once: true, margin: '-100px' });
  const [googleLoading, setGoogleLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(/Android|iPhone|iPad|iPod|webOS/i.test(navigator.userAgent) || window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // ==================== GOOGLE ONE TAP / POPUP ====================
  const handleGetStarted = useCallback(async () => {
    if (user) {
      router.push('/dashboard');
      return;
    }

    setGoogleLoading(true);

    if (isMobile) {
      try {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        const result = await signInWithPopup(auth, provider);
        if (result.user) router.push('/dashboard');
      } catch (err) {
        if (err.code !== 'auth/cancelled-popup-request' && err.code !== 'auth/popup-closed-by-user') {
          console.log('Google sign-in cancelled');
        }
      } finally { setGoogleLoading(false); }
      return;
    }

    try {
      const response = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('timeout')), 25000);
        window.google?.accounts?.id?.initialize({
          client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
          callback: (r) => { clearTimeout(timeout); resolve(r); },
          auto_select: false,
          cancel_on_tap_outside: true,
        });
        window.google?.accounts?.id?.prompt((n) => {
          if (n.isNotDisplayed()) { clearTimeout(timeout); reject(new Error(n.getNotDisplayedReason())); }
        });
      });
      const credential = GoogleAuthProvider.credential(response.credential);
      await signInWithCredential(auth, credential);
      router.push('/dashboard');
    } catch {
      try {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        const result = await signInWithPopup(auth, provider);
        if (result.user) router.push('/dashboard');
      } catch (popupErr) {}
    } finally { setGoogleLoading(false); }
  }, [router, isMobile, user]);

  return (
    <section
      ref={sectionRef}
      id="journey"
      className="relative overflow-hidden bg-gradient-to-b from-white via-gray-50 to-violet-50/30 py-16 sm:py-20 lg:py-24"
    >
      {/* Background orbs */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <motion.div
          animate={{ y: [0, -40, 0], scale: [1, 1.1, 1] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute top-0 right-0 w-[400px] h-[400px] bg-violet-100/25 rounded-full blur-[100px]"
        />
        <motion.div
          animate={{ y: [0, 30, 0], scale: [1, 0.95, 1] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute bottom-0 left-0 w-[350px] h-[350px] bg-cyan-100/20 rounded-full blur-[100px]"
        />
      </div>

      <FloatingParticles />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-12 sm:mb-16"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-violet-100/60 backdrop-blur-sm rounded-full text-xs font-semibold text-violet-700 mb-4 border border-violet-200/50">
            <BarChart3 className="w-3.5 h-3.5" />
            Platform Workflow
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 mb-3">
            The Journey of{' '}
            <span className="bg-gradient-to-r from-violet-600 via-purple-600 to-violet-600 bg-clip-text text-transparent">
              Every Meal
            </span>
          </h2>
          <p className="text-sm sm:text-base text-gray-500 max-w-2xl mx-auto leading-relaxed">
            Follow the complete lifecycle of a meal, from planning and inventory management to reporting and analytics.
          </p>
        </motion.div>

        {/* Journey Path */}
        <div className="relative">
          
          {/* Vertical connecting line */}
          <motion.div
            initial={{ height: 0 }}
            animate={isInView ? { height: '100%' } : { height: 0 }}
            transition={{ duration: 1.5, delay: 0.2, ease: 'easeInOut' }}
            className="absolute left-1/2 top-0 bottom-0 w-0.5 -translate-x-1/2 hidden sm:block"
            style={{ background: 'linear-gradient(180deg, #6366F1, #06B6D4, #8B5CF6, #F59E0B, #EC4899, #10B981)' }}
          />

          {/* Mobile line */}
          <motion.div
            initial={{ height: 0 }}
            animate={isInView ? { height: '100%' } : { height: 0 }}
            transition={{ duration: 1.5, delay: 0.2, ease: 'easeInOut' }}
            className="absolute left-5 top-0 bottom-0 w-0.5 sm:hidden"
            style={{ background: 'linear-gradient(180deg, #6366F1, #06B6D4, #8B5CF6, #F59E0B, #EC4899, #10B981)' }}
          />

          {/* Steps */}
          <div className="space-y-6 sm:space-y-8 relative">
            {journeySteps.map((step, index) => (
              <div key={step.id}>
                <StepCard step={step} index={index} isInView={isInView} />
              </div>
            ))}
          </div>
        </div>

        {/* Bottom CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 1.2 }}
          className="text-center mt-12 sm:mt-16"
        >
          <p className="text-sm text-gray-500 mb-4">Ready to streamline your meal management?</p>
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={handleGetStarted}
            disabled={googleLoading}
            className="group relative inline-flex items-center gap-2 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white font-semibold px-6 py-3 rounded-xl transition-all shadow-xl shadow-violet-200 text-sm disabled:opacity-70 overflow-hidden"
          >
            <span className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
            {googleLoading ? (
              <Loader2 className="w-4 h-4 animate-spin relative z-10" />
            ) : (
              <ArrowRight className="w-4 h-4 relative z-10" />
            )}
            <span className="relative z-10">
              {user ? 'Go to Dashboard' : 'Get Started Now'}
            </span>
          </motion.button>
        </motion.div>
      </div>
    </section>
  );
}
