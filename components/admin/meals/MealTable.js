'use client'

import { useState } from 'react';
import { db } from '@/lib/firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { 
  Trash2, Edit3, Check, X, Loader2, Sun, Moon, UserPlus,
  Search, Filter, Calendar, ChevronDown, MoreVertical,
  AlertTriangle, Clock, Hash, ArrowUpDown, Utensils
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { sendAdminChatUpdate } from '@/lib/adminChatMessage';

// Delete Confirmation Modal
function DeleteConfirmModal({ isOpen, onClose, onConfirm, userName, mealDate, isDeleting }) {
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-in zoom-in-95 duration-200">
        <div className="w-12 h-12 rounded-2xl bg-red-100 flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-6 h-6 text-red-600" />
        </div>
        <h3 className="text-lg font-extrabold text-gray-900 text-center">Delete Meal Entry</h3>
        <p className="text-sm text-gray-500 text-center mt-2">
          Are you sure you want to delete <span className="font-bold text-gray-700">{userName}&apos;s</span> meal entry for <span className="font-bold text-gray-700">{mealDate}</span>?
        </p>
        <p className="text-xs text-red-500 text-center mt-2 font-medium">This action cannot be undone.</p>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} disabled={isDeleting}
            className="flex-1 py-3 px-4 bg-gray-100 text-gray-700 rounded-xl font-bold text-sm hover:bg-gray-200 transition-colors">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={isDeleting}
            className="flex-1 py-3 px-4 bg-red-600 text-white rounded-xl font-bold text-sm hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            {isDeleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MealTable({ meals, users, selectedMonth, onUpdate, notificationsEnabled = false }) {
  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [deletingId, setDeletingId] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('date');
  const [sortOrder, setSortOrder] = useState('desc');
  const [showFilters, setShowFilters] = useState(false);

  const getUserName = (userId) => users.find(u => u.id === userId)?.name || 'Unknown';
  const getUserRoom = (userId) => users.find(u => u.id === userId)?.room || '';

  // Filter and sort meals
  const monthlyMeals = meals
    .filter(m => m.month === selectedMonth)
    .filter(m => {
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      const userName = getUserName(m.userId).toLowerCase();
      const date = (m.date || '').toLowerCase();
      return userName.includes(term) || date.includes(term);
    })
    .sort((a, b) => {
      let valA, valB;
      if (sortBy === 'date') { valA = a.date || ''; valB = b.date || ''; }
      else if (sortBy === 'name') { valA = getUserName(a.userId); valB = getUserName(b.userId); }
      else if (sortBy === 'total') { valA = (a.lunch || 0) + (a.dinner || 0) + (a.guestMeal || 0); valB = (b.lunch || 0) + (b.dinner || 0) + (b.guestMeal || 0); }
      else { valA = a[sortBy] || 0; valB = b[sortBy] || 0; }
      
      if (typeof valA === 'string') return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      return sortOrder === 'asc' ? valA - valB : valB - valA;
    });

  const startEdit = (meal) => {
    setEditingId(meal.id);
    setEditValues({
      lunch: meal.lunch || 0,
      dinner: meal.dinner || 0,
      guestMeal: meal.guestMeal || 0,
      notes: meal.notes || '',
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValues({});
  };

  const saveEdit = async (meal) => {
    const oldLunch = meal.lunch || 0;
    const oldDinner = meal.dinner || 0;
    const oldGuest = meal.guestMeal || 0;
    const oldTotal = oldLunch + oldDinner + oldGuest;
    
    const newLunch = editValues.lunch || 0;
    const newDinner = editValues.dinner || 0;
    const newGuest = editValues.guestMeal || 0;
    const newTotal = newLunch + newDinner + newGuest;

    if (newTotal === 0 && oldTotal === 0) {
      toast.error('Please enter at least one meal');
      return;
    }

    try {
      await updateDoc(doc(db, "meals", meal.id), {
        lunch: newLunch,
        dinner: newDinner,
        guestMeal: newGuest,
        notes: editValues.notes || '',
        totalMeal: newTotal,
        updatedAt: serverTimestamp(),
      });

      // Send update notification if values changed
      if (notificationsEnabled && (oldLunch !== newLunch || oldDinner !== newDinner || oldGuest !== newGuest)) {
        const member = users.find((user) => user.id === meal.userId);
        await sendAdminChatUpdate({
          member,
          category: 'meal',
          title: 'Meal entry updated',
          summary: 'Your meal entry has been updated by the admin.',
          fields: [
            { label: 'Date', value: meal.date },
            { label: 'Lunch', value: newLunch },
            { label: 'Dinner', value: newDinner },
            { label: 'Guest meal', value: newGuest },
            { label: 'Total meals', value: newTotal },
            { label: 'Notes', value: editValues.notes || '' },
          ],
          details: {
            date: meal.date,
            lunch: newLunch,
            dinner: newDinner,
            guestMeal: newGuest,
            totalMeal: newTotal,
          },
          notify: true,
        }).catch((error) => console.error('Meal update chat failed:', error));
      }

      toast.success('Meal updated!');
      setEditingId(null);
      setEditValues({});
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error('Error updating:', error);
      toast.error('Failed to update');
    }
  };

  const confirmDelete = (meal) => {
    setDeleteTarget(meal);
    setDeleteModalOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await updateDoc(doc(db, "meals", deleteTarget.id), {
        isDeleted: true,
        status: 'deleted',
        deletedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      const member = users.find((user) => user.id === deleteTarget.userId);
      if (notificationsEnabled) await sendAdminChatUpdate({
        member,
        category: 'meal',
        title: 'Meal entry deleted',
        summary: 'A meal entry was deleted by the admin.',
        fields: [
          { label: 'Date', value: deleteTarget.date },
          { label: 'Lunch', value: deleteTarget.lunch || 0 },
          { label: 'Dinner', value: deleteTarget.dinner || 0 },
          { label: 'Guest meal', value: deleteTarget.guestMeal || 0 },
        ],
        details: { ...deleteTarget, action: 'deleted' },
        notify: true,
      }).catch((error) => console.error('Meal deletion chat failed:', error));
      toast.success('Meal entry deleted!');
      setDeleteModalOpen(false);
      setDeleteTarget(null);
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error('Error deleting:', error);
      toast.error('Failed to delete');
    } finally {
      setIsDeleting(false);
    }
  };

  const toggleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  const getSortIcon = (field) => {
    if (sortBy !== field) return <ArrowUpDown className="w-3 h-3 text-gray-300" />;
    return <ArrowUpDown className={`w-3 h-3 ${sortOrder === 'asc' ? 'text-violet-500' : 'text-violet-500 rotate-180'}`} />;
  };

  if (monthlyMeals.length === 0 && !searchTerm) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-5 border-b border-gray-100">
          <h2 className="text-base font-extrabold text-gray-900">Meal Entries ({selectedMonth})</h2>
        </div>
        <div className="p-12 text-center">
          <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Utensils className="w-8 h-8 text-gray-300" />
          </div>
          <p className="text-sm font-bold text-gray-400">No meal entries for {selectedMonth}</p>
          <p className="text-xs text-gray-400 mt-1">Add your first meal entry using the form</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-purple-900 to-slate-900 px-5 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-white/10 backdrop-blur-xl border border-white/10 flex items-center justify-center">
                <Clock className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h2 className="text-base font-extrabold text-white">Meal Entries</h2>
                <p className="text-xs text-white/60">{selectedMonth} • {monthlyMeals.length} entries</p>
              </div>
            </div>
            
            {/* Search & Filters */}
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search name or date..."
                  className="w-full sm:w-48 pl-9 pr-4 py-2.5 bg-white/10 border border-white/20 rounded-xl text-sm text-white placeholder:text-white/30 focus:ring-2 focus:ring-white/20 focus:border-white/30 outline-none transition-all"
                />
                {searchTerm && (
                  <button onClick={() => setSearchTerm('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-white/10 rounded-lg">
                    <X className="w-3 h-3 text-white/60" />
                  </button>
                )}
              </div>
              <button onClick={() => setShowFilters(!showFilters)}
                className={`p-2.5 rounded-xl transition-all ${showFilters ? 'bg-white/20 text-white' : 'bg-white/10 text-white/60 hover:bg-white/20'}`}>
                <Filter className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Sort Options */}
          {showFilters && (
            <div className="mt-3 pt-3 border-t border-white/10 flex flex-wrap gap-2">
              {[
                { key: 'date', label: 'Date' },
                { key: 'name', label: 'Name' },
                { key: 'total', label: 'Total Meals' },
              ].map(f => (
                <button key={f.key} onClick={() => toggleSort(f.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    sortBy === f.key ? 'bg-white/20 text-white' : 'bg-white/5 text-white/60 hover:bg-white/10'
                  }`}>
                  {f.label} {getSortIcon(f.key)}
                </button>
              ))}
              <span className="text-[10px] text-white/40 ml-auto self-center">
                {sortOrder === 'asc' ? 'Ascending' : 'Descending'}
              </span>
            </div>
          )}
        </div>

        {/* Desktop Table */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50/80 border-b border-gray-100">
                <th className="px-4 py-3.5 text-left">
                  <button onClick={() => toggleSort('date')} className="flex items-center gap-1 text-[11px] font-bold text-gray-400 uppercase tracking-wider hover:text-gray-600 transition-colors">
                    Date {getSortIcon('date')}
                  </button>
                </th>
                <th className="px-4 py-3.5 text-left">
                  <button onClick={() => toggleSort('name')} className="flex items-center gap-1 text-[11px] font-bold text-gray-400 uppercase tracking-wider hover:text-gray-600 transition-colors">
                    Member {getSortIcon('name')}
                  </button>
                </th>
                <th className="px-3 py-3.5 text-center">
                  <span className="flex items-center justify-center gap-1 text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                    <Sun className="w-3 h-3 text-amber-500" /> Lunch
                  </span>
                </th>
                <th className="px-3 py-3.5 text-center">
                  <span className="flex items-center justify-center gap-1 text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                    <Moon className="w-3 h-3 text-blue-500" /> Dinner
                  </span>
                </th>
                <th className="px-3 py-3.5 text-center">
                  <span className="flex items-center justify-center gap-1 text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                    <UserPlus className="w-3 h-3 text-emerald-500" /> Guest
                  </span>
                </th>
                <th className="px-3 py-3.5 text-center">
                  <button onClick={() => toggleSort('total')} className="flex items-center justify-center gap-1 text-[11px] font-bold text-gray-400 uppercase tracking-wider hover:text-gray-600 transition-colors">
                    Total {getSortIcon('total')}
                  </button>
                </th>
                <th className="px-4 py-3.5 text-center text-[11px] font-bold text-gray-400 uppercase tracking-wider w-24">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {monthlyMeals.map(meal => {
                const total = (meal.lunch || 0) + (meal.dinner || 0) + (meal.guestMeal || 0);
                const isEditing = editingId === meal.id;
                
                return (
                  <tr key={meal.id} className={`group transition-all ${isEditing ? 'bg-violet-50/30' : 'hover:bg-gray-50/50'}`}>
                    <td className="px-4 py-3">
                      <span className="text-sm font-semibold text-gray-900">{meal.date}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-sm font-bold text-gray-900">{getUserName(meal.userId)}</p>
                        {getUserRoom(meal.userId) && (
                          <p className="text-[10px] font-medium text-gray-400">{getUserRoom(meal.userId)}</p>
                        )}
                      </div>
                    </td>
                    
                    {isEditing ? (
                      <>
                        <td className="px-2 py-3">
                          <input type="number" min="0" max="99" value={editValues.lunch}
                            onChange={(e) => setEditValues({...editValues, lunch: parseInt(e.target.value) || 0})}
                            className="w-16 px-2 py-2 border-2 border-amber-200 rounded-xl text-sm font-bold text-center text-amber-700 focus:ring-2 focus:ring-amber-400 focus:border-amber-400 outline-none bg-amber-50" />
                        </td>
                        <td className="px-2 py-3">
                          <input type="number" min="0" max="99" value={editValues.dinner}
                            onChange={(e) => setEditValues({...editValues, dinner: parseInt(e.target.value) || 0})}
                            className="w-16 px-2 py-2 border-2 border-blue-200 rounded-xl text-sm font-bold text-center text-blue-700 focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none bg-blue-50" />
                        </td>
                        <td className="px-2 py-3">
                          <input type="number" min="0" max="99" value={editValues.guestMeal}
                            onChange={(e) => setEditValues({...editValues, guestMeal: parseInt(e.target.value) || 0})}
                            className="w-16 px-2 py-2 border-2 border-emerald-200 rounded-xl text-sm font-bold text-center text-emerald-700 focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 outline-none bg-emerald-50" />
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className="text-sm font-black text-gray-900">
                            {(editValues.lunch || 0) + (editValues.dinner || 0) + (editValues.guestMeal || 0)}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center justify-center gap-1.5">
                            <button onClick={() => saveEdit(meal)}
                              className="p-2 bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20">
                              <Check className="w-4 h-4" />
                            </button>
                            <button onClick={cancelEdit}
                              className="p-2 bg-gray-200 text-gray-600 rounded-xl hover:bg-gray-300 transition-all">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-3 text-center">
                          <span className="text-sm font-bold text-amber-700">{meal.lunch || 0}</span>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className="text-sm font-bold text-blue-700">{meal.dinner || 0}</span>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className="text-sm font-bold text-emerald-700">{meal.guestMeal || 0}</span>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className="text-sm font-black text-gray-900">{total}</span>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => startEdit(meal)}
                              className="p-2 bg-violet-50 text-violet-600 rounded-xl hover:bg-violet-100 transition-all">
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button onClick={() => confirmDelete(meal)}
                              className="p-2 bg-red-50 text-red-500 rounded-xl hover:bg-red-100 transition-all">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards */}
        <div className="sm:hidden divide-y divide-gray-50">
          {monthlyMeals.map(meal => {
            const total = (meal.lunch || 0) + (meal.dinner || 0) + (meal.guestMeal || 0);
            const isEditing = editingId === meal.id;
            
            return (
              <div key={meal.id} className={`p-4 ${isEditing ? 'bg-violet-50/30' : ''}`}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-sm font-extrabold text-gray-900">{getUserName(meal.userId)}</p>
                    <p className="text-[11px] text-gray-400">{meal.date} {getUserRoom(meal.userId) ? `• ${getUserRoom(meal.userId)}` : ''}</p>
                  </div>
                  {!isEditing && (
                    <div className="flex items-center gap-1">
                      <button onClick={() => startEdit(meal)}
                        className="p-2 bg-violet-50 text-violet-600 rounded-xl hover:bg-violet-100 transition-all">
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button onClick={() => confirmDelete(meal)}
                        className="p-2 bg-red-50 text-red-500 rounded-xl hover:bg-red-100 transition-all">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                {isEditing ? (
                  <div>
                    <div className="grid grid-cols-3 gap-2 mb-3">
                      <div>
                        <label className="text-[9px] font-bold text-amber-600 uppercase block mb-1">Lunch</label>
                        <input type="number" min="0" value={editValues.lunch}
                          onChange={(e) => setEditValues({...editValues, lunch: parseInt(e.target.value) || 0})}
                          className="w-full px-2 py-2 border-2 border-amber-200 rounded-lg text-sm font-bold text-center text-amber-700 bg-amber-50 outline-none" />
                      </div>
                      <div>
                        <label className="text-[9px] font-bold text-blue-600 uppercase block mb-1">Dinner</label>
                        <input type="number" min="0" value={editValues.dinner}
                          onChange={(e) => setEditValues({...editValues, dinner: parseInt(e.target.value) || 0})}
                          className="w-full px-2 py-2 border-2 border-blue-200 rounded-lg text-sm font-bold text-center text-blue-700 bg-blue-50 outline-none" />
                      </div>
                      <div>
                        <label className="text-[9px] font-bold text-emerald-600 uppercase block mb-1">Guest</label>
                        <input type="number" min="0" value={editValues.guestMeal}
                          onChange={(e) => setEditValues({...editValues, guestMeal: parseInt(e.target.value) || 0})}
                          className="w-full px-2 py-2 border-2 border-emerald-200 rounded-lg text-sm font-bold text-center text-emerald-700 bg-emerald-50 outline-none" />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => saveEdit(meal)}
                        className="flex-1 py-2.5 bg-emerald-500 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-1.5">
                        <Check className="w-4 h-4" /> Save
                      </button>
                      <button onClick={cancelEdit}
                        className="flex-1 py-2.5 bg-gray-200 text-gray-600 rounded-xl font-bold text-sm flex items-center justify-center gap-1.5">
                        <X className="w-4 h-4" /> Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div className="bg-amber-50 rounded-lg p-2">
                      <p className="text-[9px] text-amber-500 uppercase font-bold">Lunch</p>
                      <p className="text-sm font-extrabold text-amber-700">{meal.lunch || 0}</p>
                    </div>
                    <div className="bg-blue-50 rounded-lg p-2">
                      <p className="text-[9px] text-blue-500 uppercase font-bold">Dinner</p>
                      <p className="text-sm font-extrabold text-blue-700">{meal.dinner || 0}</p>
                    </div>
                    <div className="bg-emerald-50 rounded-lg p-2">
                      <p className="text-[9px] text-emerald-500 uppercase font-bold">Guest</p>
                      <p className="text-sm font-extrabold text-emerald-700">{meal.guestMeal || 0}</p>
                    </div>
                    <div className="bg-violet-50 rounded-lg p-2">
                      <p className="text-[9px] text-violet-500 uppercase font-bold">Total</p>
                      <p className="text-sm font-extrabold text-violet-700">{total}</p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Empty search results */}
        {monthlyMeals.length === 0 && searchTerm && (
          <div className="p-12 text-center">
            <Search className="w-8 h-8 text-gray-300 mx-auto mb-3" />
            <p className="text-sm font-bold text-gray-400">No results found</p>
            <p className="text-xs text-gray-400 mt-1">Try a different search term</p>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={deleteModalOpen}
        onClose={() => { setDeleteModalOpen(false); setDeleteTarget(null); }}
        onConfirm={handleDelete}
        userName={deleteTarget ? getUserName(deleteTarget.userId) : ''}
        mealDate={deleteTarget?.date || ''}
        isDeleting={isDeleting}
      />
    </>
  );
}
