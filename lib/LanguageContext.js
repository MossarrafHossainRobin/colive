'use client'

import { createContext, useContext, useState } from 'react';

const translations = {
  en: {
    dashboard: 'Dashboard',
    meals: 'Meals',
    bazar: 'Bazar',
    bills: 'Bills',
    chat: 'Chat',
    notifications: 'Notifications',
    logout: 'Logout',
    profile: 'Profile',
    welcome: 'Welcome',
    balance: 'Balance',
    dues: 'Pending Dues',
    totalMeals: 'Total Meals',
    lunch: 'Lunch',
    dinner: 'Dinner',
    mealCost: 'Meal Cost',
    bazarCost: 'Bazar Cost',
    bazarCount: 'Bazar Count',
    lastPlace: 'Last Place',
    houseRent: 'House Rent',
    gasBill: 'Gas Bill',
    wifiBill: 'WiFi Bill',
    utility: 'Utility',
    extraCharges: 'Extra Charges',
    totalBills: 'Total Bills',
    remainingBalance: 'Remaining Balance',
    addMeal: 'Add Meal',
    addBazar: 'Add Bazar',
    addBill: 'Add Bill',
    send: 'Send',
    message: 'Message',
    typeMessage: 'Type a message...',
    noBazar: 'No Bazar Today',
    emergency: 'Emergency',
    announcement: 'Announcement',
    allClear: 'All Clear',
    actionRequired: 'Action Required',
    available: 'Available',
    monthlySummary: 'Monthly Summary',
    recentBazar: 'Recent Bazar',
  },
  bn: {
    dashboard: 'ড্যাশবোর্ড',
    meals: 'খাবার',
    bazar: 'বাজার',
    bills: 'বিল',
    chat: 'চ্যাট',
    notifications: 'নোটিফিকেশন',
    logout: 'লগআউট',
    profile: 'প্রোফাইল',
    welcome: 'স্বাগতম',
    balance: 'ব্যালেন্স',
    dues: 'বাকি',
    totalMeals: 'মোট খাবার',
    lunch: 'দুপুরের খাবার',
    dinner: 'রাতের খাবার',
    mealCost: 'খাবারের খরচ',
    bazarCost: 'বাজারের খরচ',
    bazarCount: 'বাজারের সংখ্যা',
    lastPlace: 'শেষ স্থান',
    houseRent: 'বাসা ভাড়া',
    gasBill: 'গ্যাস বিল',
    wifiBill: 'ওয়াইফাই বিল',
    utility: 'ইউটিলিটি',
    extraCharges: 'অতিরিক্ত খরচ',
    totalBills: 'মোট বিল',
    remainingBalance: 'অবশিষ্ট ব্যালেন্স',
    addMeal: 'খাবার যোগ করুন',
    addBazar: 'বাজার যোগ করুন',
    addBill: 'বিল যোগ করুন',
    send: 'পাঠান',
    message: 'বার্তা',
    typeMessage: 'একটি বার্তা লিখুন...',
    noBazar: 'আজ বাজার নেই',
    emergency: 'জরুরি',
    announcement: 'ঘোষণা',
    allClear: 'সব পরিশোধ',
    actionRequired: 'পদক্ষেপ প্রয়োজন',
    available: 'উপলব্ধ',
    monthlySummary: 'মাসিক সারসংক্ষেপ',
    recentBazar: 'সাম্প্রতিক বাজার',
  }
};

const LanguageContext = createContext(null);

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    return { language: 'bn', t: (key) => translations['en'][key] || key, toggleLanguage: () => {} };
  }
  return context;
}

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState('bn');

  const t = (key) => {
    return translations[language]?.[key] || translations['en'][key] || key;
  };

  const toggleLanguage = () => {
    setLanguage(prev => prev === 'en' ? 'bn' : 'en');
  };

  return (
    <LanguageContext.Provider value={{ language, t, toggleLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}