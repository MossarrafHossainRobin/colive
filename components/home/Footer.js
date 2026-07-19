'use client'

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import Link from 'next/link';
import { 
  ArrowRight, Sparkles
} from 'lucide-react';

// ==================== NAV LINKS ====================
const navLinks = [
  { label: 'Features', href: '#features' },
  { label: 'The Journey', href: '#journey' },
  { label: 'Documentation', href: '#' },
  { label: 'Privacy Policy', href: '#' },
  { label: 'Terms of Service', href: '#' },
];

// ==================== ANIMATED DIVIDER ====================
function AnimatedDivider() {
  return (
    <div className="relative h-px w-full overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-violet-400/30 to-transparent" />
      <motion.div
        animate={{ x: ['-100%', '100%'] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
        className="absolute inset-0 w-1/2 bg-gradient-to-r from-transparent via-white/20 to-transparent"
      />
    </div>
  );
}

// ==================== NAV LINK ====================
function NavLink({ label, href }) {
  return (
    <motion.a
      href={href}
      whileHover={{ x: 2 }}
      className="group relative text-sm text-gray-400 hover:text-white transition-colors duration-300 py-1"
    >
      {label}
      <span className="absolute bottom-0 left-0 w-0 h-px bg-gradient-to-r from-violet-400 to-purple-400 group-hover:w-full transition-all duration-300" />
    </motion.a>
  );
}

// ==================== MAIN COMPONENT ====================
export default function Footer() {
  const footerRef = useRef(null);
  const isInView = useInView(footerRef, { once: true, margin: '-50px' });

  return (
    <footer
      ref={footerRef}
      className="relative bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 overflow-hidden"
    >
      {/* Background Effects */}
      <div className="absolute inset-0 pointer-events-none">
        <motion.div
          animate={{ y: [0, -20, 0], opacity: [0.3, 0.5, 0.3] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -top-40 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-violet-500/10 rounded-full blur-[120px]"
        />
        <motion.div
          animate={{ y: [0, 15, 0], opacity: [0.2, 0.4, 0.2] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -bottom-20 -right-20 w-[350px] h-[350px] bg-purple-500/8 rounded-full blur-[100px]"
        />
        <div 
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)`,
            backgroundSize: '50px 50px'
          }}
        />
      </div>

      <AnimatedDivider />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-14 lg:py-16 relative z-10">
        
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-12 mb-10 lg:mb-12">
            
            {/* Brand Area */}
            <div className="lg:col-span-2 text-center lg:text-left">
              <motion.div
                whileHover={{ scale: 1.02 }}
                className="inline-flex items-center gap-2.5 mb-4"
              >
                <div className="relative">
                  <div className="w-9 h-9 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-violet-500/20">
                    <Sparkles className="w-5 h-5 text-white" />
                  </div>
                  <motion.div
                    animate={{ opacity: [0, 0.5, 0] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="absolute inset-0 bg-gradient-to-br from-violet-400 to-purple-500 rounded-xl blur-md -z-10"
                  />
                </div>
                <span className="text-xl font-bold text-white tracking-tight">
                  NestHub
                </span>
              </motion.div>

              <p className="text-sm text-gray-400 mb-2 font-medium">
                Where meal tracking meets intelligent management.
              </p>
              <p className="text-xs text-gray-500 max-w-md lg:pr-8 leading-relaxed">
                Simplifying meal, expense, and inventory management for modern communities.
              </p>
            </div>

            {/* Navigation */}
            <div className="text-center lg:text-left">
              <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wider mb-4">
                Quick Links
              </h4>
              <nav className="flex flex-col gap-2.5">
                {navLinks.map((link) => (
                  <NavLink key={link.label} label={link.label} href={link.href} />
                ))}
              </nav>
            </div>
          </div>

          {/* Trust Statement */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={isInView ? { opacity: 1 } : {}}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="text-center mb-10 lg:mb-12"
          >
            <div className="inline-block max-w-2xl">
              <div className="relative">
                <div className="absolute -left-6 top-1/2 -translate-y-1/2 hidden sm:block">
                  <motion.div
                    animate={{ opacity: [0.3, 0.7, 0.3] }}
                    transition={{ duration: 3, repeat: Infinity }}
                    className="w-1 h-8 rounded-full bg-gradient-to-b from-violet-400 to-purple-400"
                  />
                </div>
                <p className="text-xs sm:text-sm text-gray-400 italic leading-relaxed px-4">
                  Trusted by messes, hostels, and shared communities to manage meals, expenses, and inventory efficiently.
                </p>
                <div className="absolute -right-6 top-1/2 -translate-y-1/2 hidden sm:block">
                  <motion.div
                    animate={{ opacity: [0.3, 0.7, 0.3] }}
                    transition={{ duration: 3, repeat: Infinity, delay: 1.5 }}
                    className="w-1 h-8 rounded-full bg-gradient-to-b from-purple-400 to-violet-400"
                  />
                </div>
              </div>
            </div>
          </motion.div>

          <div className="h-px bg-gradient-to-r from-transparent via-gray-700/50 to-transparent mb-8" />

          {/* Bottom Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
            <div>
              <p className="text-xs text-gray-500">
                &copy; 2026 NestHub. All rights reserved.
              </p>
            </div>
            <div>
              <p className="text-[10px] sm:text-xs text-gray-600">
                Designed for transparent, efficient, and data-driven meal management.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </footer>
  );
}