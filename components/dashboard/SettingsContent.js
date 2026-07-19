'use client'

import { useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { db, auth } from '@/lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings, Bell, Shield, AlertTriangle, Globe } from 'lucide-react';
import { deleteMemberEverywhere } from '@/lib/memberCleanup';

export default function SettingsContent() {
  const { user, userData } = useAuth();
  const [notifications, setNotifications] = useState(userData?.notificationEnabled !== false);
  const [language, setLanguage] = useState(userData?.language || 'en');
  const [showDeletePopup, setShowDeletePopup] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);

  const toggleNotification = async () => {
    const newValue = !notifications;
    setNotifications(newValue);
    try {
      await updateDoc(doc(db, "users", user.uid), { 
        notificationEnabled: newValue, 
        updatedAt: new Date() 
      });
      toast.success(newValue ? 'Notifications enabled' : 'Notifications disabled');
    } catch (error) {
      setNotifications(!newValue);
      toast.error('Failed to update');
    }
  };

  const changeLanguage = async (lang) => {
    setLanguage(lang);
    try {
      await updateDoc(doc(db, "users", user.uid), { 
        language: lang, 
        updatedAt: new Date() 
      });
      toast.success(lang === 'bn' ? 'ভাষা পরিবর্তন হয়েছে' : 'Language changed');
    } catch (error) {
      toast.error('Failed to update');
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirm !== 'DELETE') {
      toast.error('Please type DELETE to confirm');
      return;
    }
    
    setDeleting(true);
    try {
      await deleteMemberEverywhere({
        userId: user.uid,
        email: userData?.email || user.email,
        profile: {
          ...userData,
          email: userData?.email || user.email,
        },
        deletedBy: 'user',
        archive: true,
      });

      toast.success('Account deleted. Your data has been preserved.');
      await signOut(auth);
      window.location.href = '/login';
      
    } catch (error) {
      console.error('Delete error:', error);
      toast.error('Failed to delete account. Please contact admin.');
    } finally {
      setDeleting(false);
      setShowDeletePopup(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 w-full">
      <div className="max-w-lg mx-auto p-3 sm:p-4 space-y-3">
        
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gray-900 rounded-xl flex items-center justify-center">
              <Settings className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">Settings</h1>
              <p className="text-xs text-gray-500">Manage your preferences</p>
            </div>
          </div>
        </div>

        {/* Notifications */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Bell className="w-4 h-4" /> Notifications
          </h2>
          <div className="flex items-center justify-between py-3 px-3 bg-gray-50 rounded-xl">
            <div>
              <p className="text-sm font-semibold text-gray-900">Push Notifications</p>
              <p className="text-[11px] text-gray-500">
                {notifications ? 'You will receive bill & meal updates' : 'Notifications are turned off'}
              </p>
            </div>
            <button 
              onClick={toggleNotification} 
              className={`relative w-12 h-7 rounded-full transition-colors duration-200 flex-shrink-0 ${notifications ? 'bg-blue-500' : 'bg-gray-300'}`}
            >
              <motion.span 
                animate={{ x: notifications ? 20 : 2 }} 
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                className="absolute top-1 w-5 h-5 bg-white rounded-full shadow-sm" 
              />
            </button>
          </div>
          <p className="text-[10px] text-gray-400 mt-2 px-1">
            When enabled, you will receive notifications via Google/FCM for bills, meals, and important updates.
          </p>
        </div>

        {/* Language */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Globe className="w-4 h-4" /> Language / ভাষা
          </h2>
          <div className="flex gap-2">
            <button
              onClick={() => changeLanguage('en')}
              className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${
                language === 'en' 
                  ? 'bg-gray-900 text-white shadow-md' 
                  : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
              }`}
            >
              English
            </button>
            <button
              onClick={() => changeLanguage('bn')}
              className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${
                language === 'bn' 
                  ? 'bg-gray-900 text-white shadow-md' 
                  : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
              }`}
            >
              বাংলা
            </button>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="bg-white rounded-2xl shadow-sm border border-red-200 p-4">
          <h2 className="text-xs font-bold text-red-600 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Shield className="w-4 h-4" /> Danger Zone
          </h2>
          <p className="text-[11px] text-gray-500 mb-3">
            Delete your account. Your data will be saved and can be retrieved by admin if needed.
          </p>
          <button 
            onClick={() => setShowDeletePopup(true)}
            className="px-4 py-2.5 border border-red-200 rounded-xl text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors"
          >
            Delete Account
          </button>
        </div>
      </div>

      {/* Delete Confirmation Popup */}
      <AnimatePresence>
        {showDeletePopup && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={(e) => { if (e.target === e.currentTarget) setShowDeletePopup(false); }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Delete Account</h3>
                  <p className="text-sm text-gray-500">This action cannot be undone</p>
                </div>
              </div>

              <div className="bg-red-50 rounded-xl p-4 mb-4 border border-red-200">
                <p className="text-sm text-red-700 font-medium">
                  All your details will be permanently deleted:
                </p>
                <ul className="text-xs text-red-600 mt-2 space-y-1 list-disc list-inside">
                  <li>Profile & personal information</li>
                  <li>Meal history & records</li>
                  <li>Bazar & expense data</li>
                  <li>Bill & payment history</li>
                  <li>Chat messages</li>
                </ul>
              </div>

              <p className="text-sm text-gray-600 mb-3">
                Type <span className="font-bold text-red-600">DELETE</span> to confirm:
              </p>
              <input
                type="text"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder="Type DELETE here"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-red-500 outline-none mb-4"
              />

              <div className="flex gap-2">
                <button
                  onClick={() => { setShowDeletePopup(false); setDeleteConfirm(''); }}
                  className="flex-1 py-2.5 bg-gray-100 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAccount}
                  disabled={deleteConfirm !== 'DELETE' || deleting}
                  className="flex-1 py-2.5 bg-red-600 rounded-xl text-sm font-bold text-white hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {deleting ? 'Deleting...' : 'Delete Account'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
