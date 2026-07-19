'use client'

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useLanguage } from '@/lib/LanguageContext';
import { db } from '@/lib/firebase';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { toast } from 'react-hot-toast';
import { 
  User, Mail, Phone, Home, Shield, Calendar, Clock,
  Edit3, Check, X, Award, Key, Copy
} from 'lucide-react';
import ImageUploader from '@/components/dashboard/ImageUploader';
import { isMemberOnline } from '@/lib/presence';

export default function ProfileContent() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [photoUrl, setPhotoUrl] = useState(null);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, "users", user.uid), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setProfile(data);
        setPhoneNumber(data.phone || '');
        setPhotoUrl(data.photo || null);
      }
      setLoading(false);
    });
    return () => unsub();
  }, [user]);

  const handleSavePhone = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "users", user.uid), { phone: phoneNumber, updatedAt: new Date() });
      setEditingPhone(false);
      toast.success(language === 'bn' ? 'ফোন নম্বর সংরক্ষিত' : 'Phone saved');
    } catch (error) {
      toast.error(language === 'bn' ? 'সংরক্ষণ ব্যর্থ' : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const copyMemberId = () => {
    if (profile?.memberId) {
      navigator.clipboard.writeText(profile.memberId);
      setCopied(true);
      toast.success('Copied!');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return '—';
    const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  const isActive = isMemberOnline(profile);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 rounded-full border-2 border-gray-200 border-t-gray-900 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 w-full">
      <div className="max-w-lg mx-auto p-3 sm:p-4 space-y-3">
        
        {/* Photo & Name */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 text-center">
          {/* ImageUploader handles the entire avatar + status dot + hover menu */}
          <ImageUploader 
            currentPhoto={photoUrl} 
            onPhotoUpdate={setPhotoUrl} 
            displayName={profile?.displayName || profile?.name}
            isActive={isActive}
          />
          
          <h1 className="text-lg font-bold text-gray-900 mt-3">{profile?.displayName || profile?.name || 'User'}</h1>
          <p className="text-xs text-gray-400 mt-0.5">{language === 'bn' ? 'প্রদর্শন নাম (অ্যাডমিন সেট করবেন)' : 'Display name (set by admin)'}</p>
          {profile?.room && (
            <span className="inline-flex items-center gap-1 mt-2 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-bold">
              <Home className="w-3 h-3" />{profile.room}
            </span>
          )}
        </div>

        {/* Personal Information */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
            <User className="w-4 h-4" />{language === 'bn' ? 'ব্যক্তিগত তথ্য' : 'Personal Information'}
          </h2>
          <div className="space-y-2">
            <div className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-xl">
              <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-gray-400" /><span className="text-xs text-gray-500">{language === 'bn' ? 'ইমেইল' : 'Email'}</span></div>
              <span className="text-xs font-semibold text-gray-900">{profile?.email || '—'}</span>
            </div>
            <div className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-xl">
              <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-gray-400" /><span className="text-xs text-gray-500">{language === 'bn' ? 'ফোন' : 'Phone'}</span></div>
              {editingPhone ? (
                <div className="flex items-center gap-1">
                  <input type="text" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} className="w-36 px-2 py-1 border border-gray-200 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-blue-500 outline-none" autoFocus />
                  <button onClick={handleSavePhone} disabled={saving} className="p-1 bg-emerald-500 text-white rounded-lg"><Check className="w-3.5 h-3.5" /></button>
                  <button onClick={() => setEditingPhone(false)} className="p-1 bg-gray-200 text-gray-600 rounded-lg"><X className="w-3.5 h-3.5" /></button>
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <span className="text-xs font-semibold text-gray-900">{profile?.phone || '—'}</span>
                  <button onClick={() => setEditingPhone(true)} className="p-1 hover:bg-gray-200 rounded-lg"><Edit3 className="w-3 h-3 text-gray-400" /></button>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-xl">
              <div className="flex items-center gap-2"><Home className="w-4 h-4 text-gray-400" /><span className="text-xs text-gray-500">{language === 'bn' ? 'রুম' : 'Room'}</span></div>
              <span className="text-xs font-bold text-gray-900">{profile?.room || '—'}</span>
            </div>
          </div>
        </div>

        {/* Account Details */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Shield className="w-4 h-4" />{language === 'bn' ? 'অ্যাকাউন্ট' : 'Account'}
          </h2>
          <div className="space-y-2">
            <div className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-xl">
              <div className="flex items-center gap-2"><Key className="w-4 h-4 text-gray-400" /><span className="text-xs text-gray-500">Member ID</span></div>
              <button onClick={copyMemberId} className="flex items-center gap-1 text-xs font-mono font-semibold text-gray-900">{profile?.memberId || '—'}{copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3 text-gray-400" />}</button>
            </div>
            <div className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-xl">
              <div className="flex items-center gap-2"><Award className="w-4 h-4 text-gray-400" /><span className="text-xs text-gray-500">Role</span></div>
              <span className="px-2 py-0.5 bg-gray-100 rounded-lg text-[10px] font-bold text-gray-700 uppercase">{profile?.role || 'member'}</span>
            </div>
            <div className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-xl">
              <div className="flex items-center gap-2"><div className={`w-2 h-2 rounded-full ${isActive ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} /><span className="text-xs text-gray-500">Status</span></div>
              <span className={`text-xs font-bold ${isActive ? 'text-green-600' : 'text-gray-500'}`}>{isActive ? 'Active' : 'Offline'}</span>
            </div>
            <div className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-xl">
              <div className="flex items-center gap-2"><Calendar className="w-4 h-4 text-gray-400" /><span className="text-xs text-gray-500">Joined</span></div>
              <span className="text-xs text-gray-700">{formatDate(profile?.createdAt)}</span>
            </div>
            <div className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-xl">
              <div className="flex items-center gap-2"><Clock className="w-4 h-4 text-gray-400" /><span className="text-xs text-gray-500">Updated</span></div>
              <span className="text-xs text-gray-700">{formatDate(profile?.updatedAt)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
