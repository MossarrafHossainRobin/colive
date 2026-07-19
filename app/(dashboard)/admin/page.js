'use client'

import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, getDocs, doc, updateDoc, orderBy, setDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { 
  Users, Search, Edit3, Loader2,
  UserCheck, UserX, Trash2, AlertTriangle, Ban, Shield, Eye, EyeOff,
  Building, Hash, User, Mail, Phone, Home, Copy, Check, Key, Clock, 
  Wifi, Monitor, Smartphone, Activity, Fingerprint, History, FileText,
  UserPlus, Plus, X, ChevronRight, ArrowLeft, MoreHorizontal,
  AlertCircle, CheckCircle, XCircle
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { sendAdminChatUpdate } from '@/lib/adminChatMessage';
import { deleteMemberEverywhere } from '@/lib/memberCleanup';
import { normalizeEmail } from '@/lib/memberIdentity';
import SystemMaintenancePanel from '@/components/admin/SystemMaintenancePanel';
import {
  isMemberAccountActive,
  isMembershipEnabled,
  membershipStatusFor,
} from '@/lib/memberPolicy';

function generateMemberId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
  return result;
}

async function getUniqueMemberId(existingIds) {
  let id;
  do { id = generateMemberId(); } while (existingIds.includes(id));
  return id;
}

async function logMemberActivity(memberId, action, details = {}) {
  try {
    await setDoc(doc(collection(db, "memberLogs")), { memberId, action, details, timestamp: serverTimestamp() });
  } catch (error) {}
}

function DeleteConfirmModal({ isOpen, onClose, onConfirm, memberId, userName, isDeleting }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }}
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 border border-gray-200">
        <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
          <Trash2 className="w-6 h-6 text-gray-600" />
        </div>
        <h3 className="text-lg font-bold text-gray-900 text-center">Remove Member</h3>
        <p className="text-sm text-gray-500 text-center mt-2">Delete <b>{userName}</b> permanently?</p>
        <div className="bg-gray-50 rounded-xl p-3 mt-3">
          <p className="text-xs text-gray-500">ID <code className="bg-gray-200 px-1.5 py-0.5 rounded text-gray-700 font-mono">{memberId}</code> will be archived</p>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium text-sm">Cancel</button>
          <button onClick={onConfirm} disabled={isDeleting}
            className="flex-1 py-3 bg-black text-white rounded-xl font-medium text-sm hover:bg-gray-800 disabled:opacity-50 flex items-center justify-center gap-2">
            {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            Remove
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ============ ISSUES PANEL ============
function IssuesPanel() {
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    const q = query(collection(db, "reportedIssues"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setIssues(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const updateIssueStatus = async (issueId, status) => {
    try {
      const issue = issues.find((item) => item.id === issueId);
      await updateDoc(doc(db, "reportedIssues", issueId), {
        status,
        resolvedAt: status === 'resolved' ? serverTimestamp() : null,
        updatedAt: serverTimestamp()
      });
      await sendAdminChatUpdate({
        member: {
          id: issue?.userId || issue?.uid,
          name: issue?.userName || issue?.name,
          email: issue?.userEmail || issue?.email,
        },
        category: 'issue',
        title: `Issue ${status}`,
        summary: `Your reported issue has been marked ${status} by the admin.`,
        fields: [
          { label: 'Issue type', value: issue?.issueType || 'General' },
          { label: 'Month', value: issue?.billMonth || issue?.month || '' },
          { label: 'Status', value: status },
        ],
        details: { issueId, status, issueType: issue?.issueType || '' },
        notify: true,
      }).catch((error) => console.error('Issue status chat update failed:', error));
      toast.success(`Issue ${status}`);
    } catch (error) {
      toast.error('Failed to update');
    }
  };

  const filteredIssues = filter === 'all' ? issues : issues.filter(i => i.status === filter);
  const pendingCount = issues.filter(i => i.status === 'pending').length;

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        {['all', 'pending', 'resolved', 'dismissed'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              filter === f ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
            {f === 'pending' && pendingCount > 0 && ` (${pendingCount})`}
          </button>
        ))}
      </div>
      {filteredIssues.length > 0 ? (
        <div className="space-y-2">
          {filteredIssues.map(issue => (
            <div key={issue.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      issue.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                      issue.status === 'resolved' ? 'bg-green-100 text-green-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>{issue.status.toUpperCase()}</span>
                    <span className="text-xs text-gray-500">
                      {{wrong_meal:'Wrong Meal Count', missing_meal:'Missing Meal', billing_mistake:'Billing Mistake', general:'General Issue'}[issue.issueType] || issue.issueType}
                    </span>
                  </div>
                  <p className="text-sm text-gray-800 mb-1.5">{issue.description}</p>
                  <div className="flex items-center gap-3 text-[10px] text-gray-400">
                    <span>{issue.userName || 'User'}</span>
                    <span>{issue.billMonth}</span>
                    <span>{issue.createdAt?.toDate?.()?.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) || ''}</span>
                  </div>
                </div>
                {issue.status === 'pending' && (
                  <div className="flex items-center gap-1 ml-3 flex-shrink-0">
                    <button onClick={() => updateIssueStatus(issue.id, 'resolved')} className="p-1.5 bg-green-50 text-green-600 rounded-lg hover:bg-green-100" title="Resolve">
                      <CheckCircle className="w-4 h-4" />
                    </button>
                    <button onClick={() => updateIssueStatus(issue.id, 'dismissed')} className="p-1.5 bg-gray-50 text-gray-500 rounded-lg hover:bg-gray-100" title="Dismiss">
                      <XCircle className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <AlertCircle className="w-10 h-10 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-400">No issues found</p>
        </div>
      )}
    </div>
  );
}

// ============ MAIN COMPONENT ============
export default function AdminDashboard() {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editMember, setEditMember] = useState(null);
  const [selectedMember, setSelectedMember] = useState(null);
  const [search, setSearch] = useState('');
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [formData, setFormData] = useState({
    role: 'member', room: '', displayName: '', isActive: true, isBlocked: false
  });
  const [addFormData, setAddFormData] = useState({
    name: '', email: '', displayName: '', room: '', role: 'member'
  });
  const [addingMember, setAddingMember] = useState(false);
  const [activeTab, setActiveTab] = useState('members');

  const rooms = ['Room 1', 'Room 2', 'Room 3'];

  useEffect(() => { fetchMembers(); }, []);

  async function fetchMembers() {
    const snap = await getDocs(query(collection(db, "users"), orderBy("name")));
    const memberList = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const existingIds = memberList.filter(m => m.memberId).map(m => m.memberId);
    for (const member of memberList) {
      if (!member.memberId) {
        const newId = await getUniqueMemberId(existingIds);
        existingIds.push(newId);
        await updateDoc(doc(db, "users", member.id), { memberId: newId });
        member.memberId = newId;
      }
    }
    setMembers(memberList);
    setLoading(false);
  }

  const handleAddMember = async (e) => {
    e.preventDefault();
    if (!addFormData.name || !addFormData.email) { toast.error('Name and email are required'); return; }
    setAddingMember(true);
    try {
      const existingUser = members.find(m => m.email?.toLowerCase() === addFormData.email.toLowerCase());
      if (existingUser) {
        await updateDoc(doc(db, "users", existingUser.id), {
          emailLower: normalizeEmail(addFormData.email),
          displayName: addFormData.displayName || existingUser.displayName || '',
          room: addFormData.room || existingUser.room || '',
          role: addFormData.role || existingUser.role || 'member',
          isActive: true, isBlocked: false,
          membershipStatus: 'active',
        });
        await sendAdminChatUpdate({
          member: existingUser,
          category: 'profile',
          title: 'Membership updated',
          summary: 'Your membership details have been updated by the admin.',
          fields: [
            { label: 'Display name', value: addFormData.displayName || existingUser.displayName || existingUser.name },
            { label: 'Room', value: addFormData.room || existingUser.room || 'Not assigned' },
            { label: 'Role', value: addFormData.role || existingUser.role || 'member' },
            { label: 'Account', value: 'Active' },
          ],
          details: { action: 'reactivated' },
          notify: true,
        }).catch((error) => console.error('Membership update chat failed:', error));
        toast.success('Existing member updated!');
      } else {
        const existingIds = members.filter(m => m.memberId).map(m => m.memberId);
        const newMemberId = await getUniqueMemberId(existingIds);
        const newUserRef = doc(collection(db, "users"));
        await setDoc(newUserRef, {
          name: addFormData.name, email: addFormData.email,
          emailLower: normalizeEmail(addFormData.email),
          displayName: addFormData.displayName || '',
          room: addFormData.room || '', role: addFormData.role || 'member',
          memberId: newMemberId, isActive: true, isBlocked: false,
          membershipStatus: 'active',
          createdAt: serverTimestamp(),
        });
        await logMemberActivity(newMemberId, 'MEMBER_CREATED', { name: addFormData.name, email: addFormData.email });
        toast.success('Member added!');
      }
      setShowAddModal(false);
      setAddFormData({ name: '', email: '', displayName: '', room: '', role: 'member' });
      fetchMembers();
    } catch { toast.error('Failed'); }
    finally { setAddingMember(false); }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      await updateDoc(doc(db, "users", editMember.id), {
        role: formData.role, room: formData.room,
        displayName: formData.displayName || '',
        isActive: formData.isActive,
        membershipStatus: membershipStatusFor(formData.isActive),
        isBlocked: formData.isBlocked
      });
      await sendAdminChatUpdate({
        member: editMember,
        category: 'profile',
        title: 'Profile updated',
        summary: 'Your member profile has been updated by the admin.',
        fields: [
          { label: 'Display name', value: formData.displayName || editMember.name },
          { label: 'Room', value: formData.room || 'Not assigned' },
          { label: 'Role', value: formData.role },
          { label: 'Account', value: formData.isActive ? 'Active' : 'Disabled' },
          { label: 'Access', value: formData.isBlocked ? 'Blocked' : 'Allowed' },
        ],
        details: { ...formData },
        notify: true,
      }).catch((error) => console.error('Profile update chat failed:', error));
      toast.success('Updated!'); setShowEditModal(false); setEditMember(null); fetchMembers();
    } catch { toast.error('Failed'); }
  };

  const toggleActive = async (id, current) => {
    const member = members.find((item) => item.id === id);
    await updateDoc(doc(db, "users", id), {
      isActive: !current,
      membershipStatus: membershipStatusFor(!current),
      updatedAt: serverTimestamp(),
    });
    await sendAdminChatUpdate({
      member,
      category: 'membership',
      title: !current ? 'Membership activated' : 'Membership disabled',
      summary: !current
        ? 'Your NestHub membership has been activated by the admin.'
        : 'Your NestHub membership has been disabled by the admin.',
      fields: [{ label: 'Account status', value: !current ? 'Active' : 'Disabled' }],
      details: { isActive: !current },
      notify: true,
    }).catch((error) => console.error('Membership status chat failed:', error));
    fetchMembers();
  };
  const toggleBlock = async (id, current) => {
    const member = members.find((item) => item.id === id);
    const notifyAccessChange = () => sendAdminChatUpdate({
      member,
      category: 'membership',
      title: !current ? 'Account access blocked' : 'Account access restored',
      summary: !current
        ? 'Your NestHub access has been blocked by the admin.'
        : 'Your NestHub access has been restored by the admin.',
      fields: [{ label: 'Access', value: !current ? 'Blocked' : 'Allowed' }],
      details: { isBlocked: !current },
      notify: true,
    }).catch((error) => console.error('Account access chat failed:', error));

    // Send the blocking notice while the conversation is still accessible.
    if (!current) await notifyAccessChange();
    await updateDoc(doc(db, "users", id), { isBlocked: !current, updatedAt: serverTimestamp() });
    if (current) await notifyAccessChange();
    fetchMembers();
  };
  const openEdit = (m) => {
    setEditMember(m);
    setFormData({ role: m.role || 'member', room: m.room || '', displayName: m.displayName || '', isActive: isMembershipEnabled(m), isBlocked: m.isBlocked || false });
    setShowEditModal(true);
  };
  const confirmDelete = (m) => { setDeleteTarget(m); setDeleteModal(true); };
  const handleDelete = async () => {
    if (!deleteTarget) return; setIsDeleting(true);
    try {
      await logMemberActivity(deleteTarget.memberId, 'MEMBER_DELETED', { name: deleteTarget.name });
      await sendAdminChatUpdate({
        member: deleteTarget,
        category: 'membership',
        title: 'Membership removed',
        summary: 'Your NestHub membership has been removed by the admin.',
        fields: [{ label: 'Member ID', value: deleteTarget.memberId || '' }],
        details: { action: 'removed' },
        notify: true,
      }).catch((error) => console.error('Membership removal chat failed:', error));
      await deleteMemberEverywhere({
        userId: deleteTarget.id,
        email: deleteTarget.email,
        profile: deleteTarget,
        deletedBy: 'admin',
        archive: true,
      });
      toast.success('Removed!'); setDeleteModal(false); setDeleteTarget(null); fetchMembers();
    } catch { toast.error('Failed'); }
    finally { setIsDeleting(false); }
  };
  const copyMemberId = (id) => { navigator.clipboard.writeText(id); toast.success('ID copied!'); };
  const getStatusBadge = (m) => {
    if (m.isBlocked) return <span className="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">Blocked</span>;
    if (!isMemberAccountActive(m)) return <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">Disabled</span>;
    return <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Active</span>;
  };

  const filtered = members.filter(m => {
    if (search) {
      const q = search.toLowerCase();
      return m.name?.toLowerCase().includes(q) || m.memberId?.toLowerCase().includes(q) || m.displayName?.toLowerCase().includes(q) || m.email?.toLowerCase().includes(q);
    }
    return true;
  });

  const totalMembers = members.length;
  const flatMembers = members.filter(m => m.room && isMemberAccountActive(m)).length;
  const activeMembers = members.filter(isMemberAccountActive).length;

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-gray-600" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-4 sm:space-y-5 pb-10 px-2 sm:px-4">
      
      {/* Header with Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-black flex items-center justify-center">
            <Users className="w-5 h-5 text-white" />
          </div>
          <div className="flex flex-wrap bg-gray-100 rounded-xl p-1">
            <button onClick={() => setActiveTab('members')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'members' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              Members ({totalMembers})
            </button>
            <button onClick={() => setActiveTab('issues')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'issues' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              Reported Issues
            </button>
            <button onClick={() => setActiveTab('system')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'system' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              System Notice
            </button>
          </div>
        </div>
        {activeTab === 'members' && (
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search..." className="pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm w-44 sm:w-56 focus:ring-2 focus:ring-black/10 outline-none bg-white" />
            </div>
            <button onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-black text-white rounded-xl text-sm font-bold hover:bg-gray-800 transition-colors">
              <UserPlus className="w-4 h-4" /><span className="hidden sm:inline">Add</span>
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      {activeTab === 'members' ? (
        <>
          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-2xl border border-gray-200 p-4"><p className="text-2xl font-bold text-gray-900">{totalMembers}</p><p className="text-[10px] font-bold text-gray-400 uppercase mt-1">Total</p></div>
            <div className="bg-white rounded-2xl border border-gray-200 p-4"><p className="text-2xl font-bold text-gray-900">{activeMembers}</p><p className="text-[10px] font-bold text-gray-400 uppercase mt-1">Active</p></div>
            <div className="bg-white rounded-2xl border border-gray-200 p-4"><p className="text-2xl font-bold text-gray-900">{flatMembers}</p><p className="text-[10px] font-bold text-gray-400 uppercase mt-1">Flat Members</p></div>
          </div>

          {/* Members Table */}
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-3 py-3 text-center text-[10px] font-bold text-gray-400 uppercase w-8">#</th>
                    <th className="px-3 py-3 text-center text-[10px] font-bold text-gray-400 uppercase w-24">ID</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-400 uppercase">Member</th>
                    <th className="px-3 py-3 text-center text-[10px] font-bold text-gray-400 uppercase">Display</th>
                    <th className="px-3 py-3 text-center text-[10px] font-bold text-gray-400 uppercase">Room</th>
                    <th className="px-3 py-3 text-center text-[10px] font-bold text-gray-400 uppercase">Role</th>
                    <th className="px-3 py-3 text-center text-[10px] font-bold text-gray-400 uppercase">Status</th>
                    <th className="px-3 py-3 text-center text-[10px] font-bold text-gray-400 uppercase w-28">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((m, index) => (
                    <tr key={m.id} onClick={() => setSelectedMember(m)}
                      className={`hover:bg-gray-50 cursor-pointer ${m.isBlocked ? 'bg-red-50/30' : m.isActive === false ? 'bg-amber-50/20' : ''}`}>
                      <td className="px-3 py-3 text-center text-xs text-gray-400">{index + 1}</td>
                      <td className="px-3 py-3 text-center">
                        <button onClick={(e) => { e.stopPropagation(); copyMemberId(m.memberId); }}
                          className="text-[10px] font-mono font-bold text-gray-600 hover:text-black bg-gray-100 px-2 py-0.5 rounded">{m.memberId}</button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {m.photo ? <img src={m.photo} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" /> :
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${m.isBlocked ? 'bg-red-500' : m.isActive === false ? 'bg-amber-500' : 'bg-gray-900'}`}>{m.name?.charAt(0)?.toUpperCase()}</div>}
                          <div className="min-w-0"><p className="font-bold text-gray-900 truncate text-xs">{m.name || '—'}</p><p className="text-[10px] text-gray-400 truncate">{m.email || '—'}</p></div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center text-xs font-medium text-gray-600">{m.displayName || '—'}</td>
                      <td className="px-3 py-3 text-center text-xs text-gray-600">{m.room || '—'}</td>
                      <td className="px-3 py-3 text-center"><span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${m.role === 'admin' ? 'bg-gray-100 text-gray-900' : 'text-gray-500'}`}>{m.role || 'member'}</span></td>
                      <td className="px-3 py-3 text-center">{getStatusBadge(m)}</td>
                      <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => toggleActive(m.id, isMembershipEnabled(m))} className={`p-1.5 rounded-lg ${isMembershipEnabled(m) ? 'hover:bg-amber-50 text-gray-400' : 'hover:bg-emerald-50 text-gray-400'}`}>{isMembershipEnabled(m) ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}</button>
                          <button onClick={() => toggleBlock(m.id, m.isBlocked)} className={`p-1.5 rounded-lg ${m.isBlocked ? 'hover:bg-emerald-50 text-gray-400' : 'hover:bg-red-50 text-gray-400'}`}>{m.isBlocked ? <Shield className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}</button>
                          <button onClick={() => openEdit(m)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><Edit3 className="w-3.5 h-3.5" /></button>
                          <button onClick={() => confirmDelete(m)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-gray-100">
              {filtered.map((m, index) => (
                <div key={m.id} onClick={() => setSelectedMember(m)}
                  className={`p-4 cursor-pointer active:bg-gray-50 ${m.isBlocked ? 'bg-red-50/30' : m.isActive === false ? 'bg-amber-50/20' : ''}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">#{index + 1}</span>
                      <code className="text-[10px] font-mono font-bold bg-gray-100 px-2 py-0.5 rounded">{m.memberId}</code>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={(e) => { e.stopPropagation(); toggleActive(m.id, isMembershipEnabled(m)); }} className="p-1.5"><UserX className="w-3.5 h-3.5 text-gray-400" /></button>
                      <button onClick={(e) => { e.stopPropagation(); toggleBlock(m.id, m.isBlocked); }} className="p-1.5"><Ban className="w-3.5 h-3.5 text-gray-400" /></button>
                      <button onClick={(e) => { e.stopPropagation(); openEdit(m); }} className="p-1.5"><Edit3 className="w-3.5 h-3.5 text-gray-400" /></button>
                      <button onClick={(e) => { e.stopPropagation(); confirmDelete(m); }} className="p-1.5"><Trash2 className="w-3.5 h-3.5 text-gray-400" /></button>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {m.photo ? <img src={m.photo} alt="" className="w-10 h-10 rounded-full object-cover" /> :
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${m.isBlocked ? 'bg-red-500' : m.isActive === false ? 'bg-amber-500' : 'bg-gray-900'}`}>{m.name?.charAt(0)?.toUpperCase()}</div>}
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-gray-900 truncate">{m.name || '—'}</p>
                      <p className="text-xs text-gray-500">{m.displayName || m.email || '—'}</p>
                      <div className="flex items-center gap-2 mt-1">{m.room && <span className="text-[10px] bg-gray-100 px-2 py-0.5 rounded">{m.room}</span>}{getStatusBadge(m)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : activeTab === 'issues' ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <IssuesPanel />
        </div>
      ) : (
        <SystemMaintenancePanel members={members} />
      )}

      {/* Messenger-style Detail Panel */}
      <AnimatePresence>
        {selectedMember && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 z-40" onClick={() => setSelectedMember(null)} />
            <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'tween', duration: 0.3 }}
              className="fixed inset-y-0 right-0 w-full max-w-md bg-white z-50 shadow-2xl flex flex-col">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 flex-shrink-0">
                <button onClick={() => setSelectedMember(null)} className="p-1 -ml-1"><ArrowLeft className="w-5 h-5 text-gray-600" /></button>
                <span className="text-sm font-bold text-gray-900">Member Details</span>
                <button onClick={() => copyMemberId(selectedMember.memberId)} className="p-1"><Copy className="w-4 h-4 text-gray-400" /></button>
              </div>
              <div className="flex-1 overflow-y-auto">
                <div className="text-center py-6 px-4 border-b border-gray-100">
                  {selectedMember.photo ? <img src={selectedMember.photo} alt="" className="w-20 h-20 rounded-full mx-auto mb-3 object-cover" /> :
                    <div className="w-20 h-20 rounded-full bg-gray-900 flex items-center justify-center text-white text-2xl font-bold mx-auto mb-3">{selectedMember.name?.charAt(0)?.toUpperCase()}</div>}
                  <h2 className="text-lg font-bold text-gray-900">{selectedMember.name || 'Unknown'}</h2>
                  {selectedMember.displayName && <p className="text-sm text-gray-500 mt-0.5">{selectedMember.displayName}</p>}
                  <div className="inline-flex items-center gap-1 mt-2 bg-gray-100 rounded-lg px-3 py-1"><Fingerprint className="w-3.5 h-3.5 text-gray-500" /><code className="text-sm font-mono font-bold text-gray-700">{selectedMember.memberId}</code></div>
                </div>
                <div className="divide-y divide-gray-100">
                  <div className="flex items-center px-4 py-3.5"><Mail className="w-5 h-5 text-gray-400 mr-3" /><div className="flex-1"><p className="text-xs text-gray-400">Email</p><p className="text-sm text-gray-900 truncate">{selectedMember.email || '—'}</p></div></div>
                  <div className="flex items-center px-4 py-3.5"><Phone className="w-5 h-5 text-gray-400 mr-3" /><div className="flex-1"><p className="text-xs text-gray-400">Phone</p><p className="text-sm text-gray-900">{selectedMember.phone || '—'}</p></div></div>
                  <div className="flex items-center px-4 py-3.5"><Home className="w-5 h-5 text-gray-400 mr-3" /><div className="flex-1"><p className="text-xs text-gray-400">Room</p><p className="text-sm text-gray-900">{selectedMember.room || 'Not assigned'}</p></div>{selectedMember.room ? <span className="text-xs bg-gray-900 text-white px-2 py-0.5 rounded-full">Flat Member</span> : <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">Visitor</span>}</div>
                  <div className="flex items-center px-4 py-3.5"><Shield className="w-5 h-5 text-gray-400 mr-3" /><div className="flex-1"><p className="text-xs text-gray-400">Role</p><p className="text-sm text-gray-900 capitalize">{selectedMember.role || 'member'}</p></div></div>
                  <div className="flex items-center px-4 py-3.5"><Activity className="w-5 h-5 text-gray-400 mr-3" /><div className="flex-1"><p className="text-xs text-gray-400">Status</p><p className="text-sm text-gray-900">{selectedMember.isBlocked ? 'Blocked' : selectedMember.isActive === false ? 'Disabled' : 'Active'}</p></div>{getStatusBadge(selectedMember)}</div>
                  <div className="flex items-center px-4 py-3.5"><Clock className="w-5 h-5 text-gray-400 mr-3" /><div className="flex-1"><p className="text-xs text-gray-400">Member Since</p><p className="text-sm text-gray-900">{selectedMember.createdAt ? new Date(selectedMember.createdAt.seconds * 1000).toLocaleDateString() : '—'}</p></div></div>
                  {selectedMember.lastLogin && (
                    <div className="flex items-center px-4 py-3.5"><History className="w-5 h-5 text-gray-400 mr-3" /><div className="flex-1"><p className="text-xs text-gray-400">Last Login</p><p className="text-sm text-gray-900">{new Date(selectedMember.lastLogin.seconds ? selectedMember.lastLogin.seconds * 1000 : selectedMember.lastLogin).toLocaleString()}</p></div></div>
                  )}
                </div>
                <div className="p-4">
                  <div className="bg-gray-50 rounded-xl p-4">
                    <p className="text-xs text-gray-500">All records (meals, bills, bazar) are linked to ID <code className="bg-gray-200 px-1 py-0.5 rounded font-mono">{selectedMember.memberId}</code>. This ID is permanent and never changes.</p>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Add Member Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowAddModal(false)} />
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }}
              className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 border border-gray-200" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4"><h2 className="text-lg font-bold text-gray-900">Add Member</h2><button onClick={() => setShowAddModal(false)} className="p-1"><X className="w-5 h-5 text-gray-400" /></button></div>
              <form onSubmit={handleAddMember} className="space-y-3">
                <div><label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Name *</label><input type="text" value={addFormData.name} onChange={e => setAddFormData({...addFormData, name: e.target.value})} placeholder="Full name" required className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-black/10 outline-none" /></div>
                <div><label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Email *</label><input type="email" value={addFormData.email} onChange={e => setAddFormData({...addFormData, email: e.target.value})} placeholder="email@example.com" required className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-black/10 outline-none" /><p className="text-[9px] text-gray-400 mt-1">If email exists, account will be linked automatically</p></div>
                <div><label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Display Name</label><input type="text" value={addFormData.displayName} onChange={e => setAddFormData({...addFormData, displayName: e.target.value})} placeholder="For bills & meals" className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-black/10 outline-none" /></div>
                <div><label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Room</label><select value={addFormData.room} onChange={e => setAddFormData({...addFormData, room: e.target.value})} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm"><option value="">No Room</option>{rooms.map(r => <option key={r} value={r}>{r}</option>)}</select></div>
                <div className="flex gap-3 pt-2"><button type="button" onClick={() => setShowAddModal(false)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600">Cancel</button><button type="submit" disabled={addingMember} className="flex-1 py-2.5 bg-black text-white rounded-xl text-sm font-medium hover:bg-gray-800 disabled:opacity-50 flex items-center justify-center gap-2">{addingMember ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}Add</button></div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Modal */}
      <AnimatePresence>
        {showEditModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowEditModal(false)} />
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }}
              className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 border border-gray-200" onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-3 mb-4"><div className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center text-white font-bold">{editMember?.name?.charAt(0)?.toUpperCase()}</div><div><h2 className="text-lg font-bold text-gray-900">{editMember?.name}</h2><p className="text-xs text-gray-400">ID: {editMember?.memberId}</p></div></div>
              <form onSubmit={handleSave} className="space-y-3">
                <div><label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Display Name</label><input type="text" value={formData.displayName} onChange={e => setFormData({...formData, displayName: e.target.value})} placeholder="For bills & meals only" className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-black/10 outline-none" /></div>
                <div><label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Role</label><select value={formData.role} onChange={e => setFormData({...formData, role: e.target.value})} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm"><option value="member">Member</option><option value="admin">Admin</option></select></div>
                <div><label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Room</label><select value={formData.room} onChange={e => setFormData({...formData, room: e.target.value})} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm"><option value="">No Room (Visitor)</option>{rooms.map(r => <option key={r} value={r}>{r}</option>)}</select></div>
                <label className="flex items-center justify-between py-2.5 px-3 bg-gray-50 rounded-xl"><span className="text-sm text-gray-700">Active</span><button type="button" onClick={() => setFormData({...formData, isActive: !formData.isActive})} className={`relative w-10 h-5 rounded-full transition-colors ${formData.isActive ? 'bg-black' : 'bg-gray-300'}`}><span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${formData.isActive ? 'translate-x-5' : 'translate-x-0.5'}`} /></button></label>
                <label className="flex items-center justify-between py-2.5 px-3 bg-gray-50 rounded-xl"><span className="text-sm text-gray-700">Blocked</span><button type="button" onClick={() => setFormData({...formData, isBlocked: !formData.isBlocked})} className={`relative w-10 h-5 rounded-full transition-colors ${formData.isBlocked ? 'bg-red-500' : 'bg-gray-300'}`}><span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${formData.isBlocked ? 'translate-x-5' : 'translate-x-0.5'}`} /></button></label>
                <div className="flex gap-3 pt-2"><button type="button" onClick={() => setShowEditModal(false)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600">Cancel</button><button type="submit" className="flex-1 py-2.5 bg-black text-white rounded-xl text-sm font-medium hover:bg-gray-800">Save</button></div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Modal */}
      <DeleteConfirmModal isOpen={deleteModal} onClose={() => { setDeleteModal(false); setDeleteTarget(null); }} onConfirm={handleDelete} memberId={deleteTarget?.memberId} userName={deleteTarget?.name || ''} isDeleting={isDeleting} />
    </div>
  );
}
