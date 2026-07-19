'use client'

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HelpCircle, MessageCircle, Phone, Mail, FileText, ChevronDown, ExternalLink, Search } from 'lucide-react';

const faqs = [
  { q: 'How do I track my daily meals?', a: 'Go to Meals section from sidebar. Add lunch and dinner count daily. System calculates total meals and rate automatically.' },
  { q: 'How are bills calculated?', a: 'Bills = Room Rent + Utility charges divided among room members equally.' },
  { q: 'How to check payment status?', a: 'Dashboard shows Total Payable, Paid Amount, and Balance. Green = Paid, Red = Due.' },
  { q: 'What is meal rate?', a: 'Meal rate = Total Bazar Expenses ÷ Total Meals consumed. Changes monthly.' },
  { q: 'How to contact admin?', a: 'Use contact info below or message admin directly.' },
];

export default function HelpContent() {
  const [openFaq, setOpenFaq] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredFaqs = faqs.filter(faq => 
    faq.q.toLowerCase().includes(searchQuery.toLowerCase()) ||
    faq.a.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-gray-900 rounded-2xl flex items-center justify-center"><HelpCircle className="w-6 h-6 text-white" /></div>
            <div><h1 className="text-xl font-bold text-gray-900">Help & Support</h1><p className="text-sm text-gray-500">How can we help?</p></div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search FAQs..." className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-10 pr-4 py-3 text-sm font-medium text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-gray-300 outline-none" />
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4 flex items-center gap-2"><FileText className="w-4 h-4" />FAQs</h2>
          <div className="space-y-2">
            {filteredFaqs.map((faq, i) => (
              <div key={i} className="border border-gray-100 rounded-xl overflow-hidden">
                <button onClick={() => setOpenFaq(openFaq === i ? null : i)} className="w-full flex items-center justify-between px-4 py-3.5 text-left hover:bg-gray-50 transition-colors">
                  <span className="text-sm font-semibold text-gray-900 pr-4">{faq.q}</span>
                  <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${openFaq === i ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence>
                  {openFaq === i && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                      <p className="px-4 pb-4 text-sm text-gray-600 leading-relaxed">{faq.a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4 flex items-center gap-2"><MessageCircle className="w-4 h-4" />Contact</h2>
          <div className="space-y-3">
            <a href="tel:+8801700000000" className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors">
              <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center"><Phone className="w-5 h-5 text-green-600" /></div>
              <div><p className="text-sm font-semibold text-gray-900">Phone</p><p className="text-xs text-gray-500">+880 1700-000000</p></div>
              <ExternalLink className="w-4 h-4 text-gray-400 ml-auto" />
            </a>
            <a href="mailto:support@nesthub.com" className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors">
              <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center"><Mail className="w-5 h-5 text-blue-600" /></div>
              <div><p className="text-sm font-semibold text-gray-900">Email</p><p className="text-xs text-gray-500">support@nesthub.com</p></div>
              <ExternalLink className="w-4 h-4 text-gray-400 ml-auto" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}