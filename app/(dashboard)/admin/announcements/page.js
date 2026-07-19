'use client'

import { useCallback, useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, query, orderBy, serverTimestamp, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Megaphone, AlertTriangle, Ban, Trash2, Send, ShoppingCart, 
  Edit3, Eye, EyeOff, CheckCircle, X, Zap
} from 'lucide-react';
import { sendAdminChatUpdate } from '@/lib/adminChatMessage';
import { isMemberAccountActive } from '@/lib/memberPolicy';
import { createUserNotification } from '@/lib/notificationDelivery';

const bazarItemsList = [
  { en: 'Rice', bn: 'চাল' },
  { en: 'Potato', bn: 'আলু' },
  { en: 'Onion', bn: 'পেঁয়াজ' },
  { en: 'Garlic', bn: 'রসুন' },
  { en: 'Ginger', bn: 'আদা' },
  { en: 'Oil', bn: 'তেল' },
  { en: 'Salt', bn: 'লবণ' },
  { en: 'Sugar', bn: 'চিনি' },
  { en: 'Flour', bn: 'আটা' },
  { en: 'Lentils', bn: 'ডাল' },
  { en: 'Chicken', bn: 'মুরগি' },
  { en: 'Beef', bn: 'গরুর মাংস' },
  { en: 'Fish', bn: 'মাছ' },
  { en: 'Eggs', bn: 'ডিম' },
  { en: 'Milk', bn: 'দুধ' },
  { en: 'Tea', bn: 'চা' },
  { en: 'Vegetables', bn: 'সবজি' },
  { en: 'Fruits', bn: 'ফল' },
  { en: 'Soap', bn: 'সাবান' },
  { en: 'Spices', bn: 'মসলা' },
];

const announcementTypes = [
  { value: 'general', label: 'General', color: '#6366F1', gradient: 'from-indigo-500 to-purple-500' },
  { value: 'emergency', label: 'Emergency', color: '#EF4444', gradient: 'from-red-500 to-rose-500' },
  { value: 'nobazar', label: 'No Bazar', color: '#F59E0B', gradient: 'from-amber-400 to-orange-500' },
  { value: 'bazar', label: 'Bazar', color: '#10B981', gradient: 'from-emerald-400 to-teal-500' },
];

export default function AdminAnnouncements() {
  const [announcements, setAnnouncements] = useState([]);
  const [members, setMembers] = useState([]);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ 
    title: '', message: '', type: 'general', active: true, priority: 0,
    selectedItems: [], selectedMember: ''
  });
  const [loading, setLoading] = useState(false);
  const [language, setLanguage] = useState('en');
  const [itemSearch, setItemSearch] = useState('');

  const fetchAnnouncements = useCallback(async () => {
    try {
      const snap = await getDocs(query(collection(db, "announcements"), orderBy("priority", "desc"), orderBy("createdAt", "desc")));
      setAnnouncements(snap.docs.map(d => ({ id: String(d.id), ...d.data() })));
    } catch (error) { console.error('Fetch error:', error); }
  }, []);

  const fetchMembers = useCallback(async () => {
    try {
      const snap = await getDocs(query(collection(db, "users")));
      setMembers(snap.docs.map(d => ({ id: String(d.id), ...d.data() })).filter(m => isMemberAccountActive(m) && m.room?.trim()));
    } catch (error) { console.error('Members error:', error); }
  }, []);

  useEffect(() => {
    fetchAnnouncements();
    fetchMembers();
  }, [fetchAnnouncements, fetchMembers]);

  const resetForm = () => {
    setForm({ title: '', message: '', type: 'general', active: true, priority: 0, selectedItems: [], selectedMember: '' });
    setEditId(null); setItemSearch('');
  };

  const handleEdit = (a) => {
    setEditId(String(a.id));
    setForm({
      title: a.title || '', message: a.message || '', type: a.type || 'general',
      active: a.active !== false, priority: a.priority || 0,
      selectedItems: a.bazarDetails?.items || [], selectedMember: a.bazarDetails?.memberId || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete permanently?')) return;
    try { await deleteDoc(doc(db, "announcements", String(id))); toast.success('Deleted'); fetchAnnouncements(); }
    catch { toast.error('Failed'); }
  };

  const toggleActive = async (a) => {
    try { 
      await updateDoc(doc(db, "announcements", String(a.id)), { active: !a.active, updatedAt: serverTimestamp() }); 
      fetchAnnouncements(); 
    } catch { toast.error('Failed'); }
  };

  const toggleItem = (item) => {
    setForm(prev => {
      const exists = prev.selectedItems.find(i => i.nameEn === item.en);
      if (exists) return { ...prev, selectedItems: prev.selectedItems.filter(i => i.nameEn !== item.en) };
      const name = language === 'bn' ? item.bn : item.en;
      return { ...prev, selectedItems: [...prev.selectedItems, { name, nameEn: item.en, nameBn: item.bn }] };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) { toast.error('Title required'); return; }
    if (form.type === 'bazar' && !form.selectedMember) { toast.error('Select member'); return; }
    
    setLoading(true);
    try {
      const data = {
        title: form.title.trim(), message: form.message.trim(), type: form.type,
        active: form.active, priority: form.priority, updatedAt: serverTimestamp(),
      };
      if (form.type === 'bazar') {
        data.bazarDetails = {
          memberId: form.selectedMember,
          memberName: members.find(m => m.id === form.selectedMember)?.displayName || 'Member',
          memberPhoto: members.find(m => m.id === form.selectedMember)?.photo || '',
          memberRoom: members.find(m => m.id === form.selectedMember)?.room || '',
          items: form.selectedItems,
        };
      }

      if (editId) {
        await updateDoc(doc(db, "announcements", String(editId)), data);
        const editRecipients =
          form.type === 'bazar'
            ? members.filter((member) => member.id === form.selectedMember)
            : members.filter(isMemberAccountActive);
        await Promise.all(
          editRecipients.map((member) =>
            sendAdminChatUpdate({
              member,
              category: form.type === 'bazar' ? 'bazar_assignment' : 'announcement',
              title: 'Announcement updated',
              summary: form.message || `${form.title} has been updated by the admin.`,
              fields: form.type === 'bazar'
                ? [{ label: 'Items', value: form.selectedItems.map((item) => item.name).join(', ') || 'See announcement' }]
                : [{ label: 'Priority', value: form.priority }],
              details: { ...data, action: 'updated' },
              notify: true,
            }).catch((error) => console.error('Announcement update chat failed:', error))
          )
        );
        toast.success('Updated');
      } else {
        await addDoc(collection(db, "announcements"), { ...data, createdBy: 'admin', createdAt: serverTimestamp() });
        
        // ============ SEND NOTIFICATIONS ============
        const itemsList = form.selectedItems.map(i => i.name).join(', ');
        let chatRecipients = [];

        // Bazar: Send to assigned member only
        if (form.type === 'bazar' && form.selectedMember) {
          const assignedMember = members.find(m => m.id === form.selectedMember);
          const memberName = assignedMember?.displayName || 'Member';
          if (assignedMember) chatRecipients = [assignedMember];
          
          // Firestore notification
          await createUserNotification({
            userId: form.selectedMember,
            title: 'Bazar Assignment',
            body: `${memberName}, you are assigned for bazar!\nItems: ${itemsList}`,
            type: 'bazar_assignment',
            link: '/bazar',
            data: { items: form.selectedItems, announcementTitle: form.title },
          });

        }

        // Emergency/General: Send to ALL active members
        if (form.type === 'emergency' || form.type === 'general' || form.type === 'nobazar') {
          try {
            const usersSnap = await getDocs(query(collection(db, "users")));
            chatRecipients = usersSnap.docs.map((item) => ({
              id: item.id,
              ...item.data(),
            })).filter(isMemberAccountActive);
            
            for (const member of chatRecipients) {
              const userId = member.id;
              
              // Firestore notification
              await createUserNotification({
                userId,
                title: form.type === 'emergency' ? 'Emergency Alert' : 'Announcement',
                body: `${form.title}${form.message ? '\n' + form.message : ''}`,
                type: 'announcement',
                link: '/dashboard',
                data: { type: form.type, announcementTitle: form.title },
              });

            }
          } catch (broadcastErr) { console.error('Broadcast error:', broadcastErr); }
        }

        await Promise.all(
          chatRecipients.map((member) =>
            sendAdminChatUpdate({
              member,
              category: form.type === 'bazar' ? 'bazar_assignment' : 'announcement',
              title: form.type === 'emergency' ? 'Emergency announcement' : form.title,
              summary:
                form.message ||
                (form.type === 'bazar'
                  ? 'You have been assigned to complete the next bazar.'
                  : 'A new NestHub announcement has been published.'),
              fields:
                form.type === 'bazar'
                  ? [{ label: 'Items', value: itemsList || 'See announcement' }]
                  : [{ label: 'Priority', value: form.priority }],
              details: {
                type: form.type,
                title: form.title,
                message: form.message,
                items: form.selectedItems,
              },
              notify: true,
            }).catch((error) => console.error('Announcement chat update failed:', error))
          )
        );

        toast.success('Published with chat and push notifications');
      }
      resetForm(); fetchAnnouncements();
    } catch (error) {
      console.error('Submit error:', error);
      toast.error('Failed');
    }
    finally { setLoading(false); }
  };

  const isItemSelected = (item) => form.selectedItems.some(i => i.nameEn === item.en);
  const filteredItems = bazarItemsList.filter(i => 
    i.en.toLowerCase().includes(itemSearch.toLowerCase()) || i.bn.toLowerCase().includes(itemSearch.toLowerCase())
  );
  const getConfig = (type) => announcementTypes.find(t => t.value === type) || announcementTypes[0];

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
      
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Announcements</h1>
          <p className="text-xs text-gray-500">{announcements.length} total · {announcements.filter(a => a.active).length} active</p>
        </div>
        {editId && (
          <button onClick={resetForm} className="px-4 py-2 bg-gray-100 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-200 transition-colors">
            Cancel Edit
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Form */}
        <div className="lg:col-span-5">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sticky top-4">
            <h2 className="text-sm font-bold text-gray-900 mb-4">{editId ? 'Edit' : 'Create'} Announcement</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              
              <div className="flex gap-2 flex-wrap">
                {announcementTypes.map(at => (
                  <button key={at.value} type="button" onClick={() => setForm({...form, type: at.value})}
                    className={`px-3 py-1.5 rounded-full text-[11px] font-bold border-2 transition-all ${
                      form.type === at.value ? 'text-white border-transparent shadow-md' : 'text-gray-500 border-gray-200 hover:border-gray-300'
                    }`}
                    style={form.type === at.value ? { backgroundColor: at.color, borderColor: at.color } : {}}>
                    {at.label}
                  </button>
                ))}
              </div>

              <input type="text" value={form.title} onChange={e => setForm({...form, title: e.target.value})}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="Announcement title" required />

              <div className="flex items-center justify-between py-2 px-4 bg-gray-50 rounded-xl">
                <span className="text-xs font-semibold text-gray-700">Visible on dashboard</span>
                <button type="button" onClick={() => setForm({...form, active: !form.active})}
                  className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${form.active ? 'bg-green-500' : 'bg-gray-300'}`}>
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${form.active ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </div>

              {form.type === 'bazar' && (
                <div className="space-y-3 bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl p-4 border border-emerald-100">
                  <div className="flex bg-white rounded-lg p-1 border border-gray-100">
                    <button type="button" onClick={() => setLanguage('en')}
                      className={`flex-1 py-1.5 rounded-md text-xs font-bold ${language === 'en' ? 'bg-emerald-500 text-white' : 'text-gray-500'}`}>EN</button>
                    <button type="button" onClick={() => setLanguage('bn')}
                      className={`flex-1 py-1.5 rounded-md text-xs font-bold ${language === 'bn' ? 'bg-emerald-500 text-white' : 'text-gray-500'}`}>BN</button>
                  </div>

                  <select value={form.selectedMember} onChange={e => setForm({...form, selectedMember: e.target.value})}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none bg-white">
                    <option value="">Select member...</option>
                    {members.map(m => (
                      <option key={m.id} value={m.id}>{m.displayName || m.name} — {m.room}</option>
                    ))}
                  </select>

                  <div className="relative">
                    <input type="text" value={itemSearch} onChange={e => setItemSearch(e.target.value)}
                      placeholder="Search items..." className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-emerald-500 outline-none" />
                    {itemSearch && filteredItems.length > 0 && (
                      <div className="absolute top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-lg z-20 max-h-40 overflow-y-auto">
                        {filteredItems.map(item => (
                          <button key={item.en} type="button" onClick={() => { toggleItem(item); setItemSearch(''); }}
                            className="w-full px-4 py-2.5 text-left text-sm hover:bg-emerald-50 transition-colors">
                            {language === 'bn' ? item.bn : item.en}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="bg-white rounded-xl p-3 border border-gray-100 max-h-[250px] overflow-y-auto">
                    <p className="text-[10px] font-bold text-gray-400 uppercase mb-2">Items · {form.selectedItems.length} selected</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {bazarItemsList.map(item => {
                        const selected = isItemSelected(item);
                        return (
                          <button key={item.en} type="button" onClick={() => toggleItem(item)}
                            className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-left text-xs font-medium transition-all ${
                              selected ? 'bg-emerald-100 text-emerald-800 border-2 border-emerald-400' : 'bg-gray-50 text-gray-600 border-2 border-gray-100 hover:bg-gray-100'
                            }`}>
                            {selected && <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />}
                            <span className="truncate">{language === 'bn' ? item.bn : item.en}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              <textarea value={form.message} onChange={e => setForm({...form, message: e.target.value})}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm resize-none focus:ring-2 focus:ring-indigo-500 outline-none"
                rows={2} placeholder="Optional message..." />

              <button type="submit" disabled={loading}
                className={`w-full py-3 rounded-xl text-sm font-bold text-white transition-all flex items-center justify-center gap-2 bg-gradient-to-r ${getConfig(form.type).gradient} hover:shadow-lg hover:scale-[1.02] active:scale-95 disabled:opacity-50`}>
                <Send className="w-4 h-4" />
                {loading ? 'Publishing...' : editId ? 'Update' : form.type === 'bazar' ? 'Assign Bazar & Notify' : 'Publish & Notify All'}
              </button>
            </form>
          </div>
        </div>

        {/* List */}
        <div className="lg:col-span-7 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-900">All Announcements</h2>
            <span className="text-xs text-gray-400">{announcements.length} items</span>
          </div>

          <AnimatePresence>
            {announcements.length > 0 ? announcements.map((a, index) => {
              const config = getConfig(a.type);
              return (
                <motion.div key={a.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -20 }}
                  className={`relative overflow-hidden rounded-xl border transition-all ${
                    a.active ? 'bg-white border-gray-200 shadow-sm hover:shadow-md' : 'bg-gray-50 border-gray-100 opacity-70'
                  }`}>
                  <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: config.color }} />
                  <div className="p-4 pl-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold text-white shadow-sm" style={{ backgroundColor: config.color }}>{config.label}</span>
                          {index === 0 && a.active && <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-indigo-100 text-indigo-600 animate-pulse"><Zap className="w-2.5 h-2.5 inline mr-0.5" />TOP</span>}
                          {!a.active && <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-gray-200 text-gray-500">Hidden</span>}
                          <span className="text-[10px] text-gray-400 ml-auto">{a.createdAt?.toDate?.()?.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                        </div>
                        <p className="text-sm font-bold text-gray-900">{a.title}</p>
                        {a.message && <p className="text-xs text-gray-500 mt-1">{a.message}</p>}
                        {a.type === 'bazar' && a.bazarDetails && (
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {a.bazarDetails.items?.map((item, i) => (
                              <span key={i} className="px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full text-[10px] font-medium border border-emerald-100">{item.name}</span>
                            ))}
                            {a.bazarDetails.memberName && (
                              <span className="px-2.5 py-1 bg-gray-100 text-gray-600 rounded-full text-[10px] font-medium">→ {a.bazarDetails.memberName}</span>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => toggleActive(a)} className={`p-2 rounded-lg transition-colors ${a.active ? 'bg-green-50 text-green-600 hover:bg-green-100' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}>{a.active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}</button>
                        <button onClick={() => handleEdit(a)} className="p-2 bg-gray-50 text-gray-500 rounded-lg hover:bg-blue-50 hover:text-blue-600"><Edit3 className="w-4 h-4" /></button>
                        <button onClick={() => handleDelete(a.id)} className="p-2 bg-gray-50 text-gray-500 rounded-lg hover:bg-red-50 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            }) : (
              <div className="text-center py-16 bg-white rounded-2xl border border-gray-200">
                <Megaphone className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-sm font-medium text-gray-400">No announcements yet</p>
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
