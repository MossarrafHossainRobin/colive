'use client'

import { useState, useMemo } from 'react';
import { db } from '@/lib/firebase';
import { doc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';

export default function BazarTable({ bazars, users, selectedMonth, onUpdate }) {
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('date');
  const [sortDir, setSortDir] = useState('desc');
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [selected, setSelected] = useState(new Set());
  const [showDeleteAll, setShowDeleteAll] = useState(false);

  const filtered = useMemo(() => {
    let data = bazars.filter(b => b.month === selectedMonth);
    if (search) {
      const q = search.toLowerCase();
      data = data.filter(b => {
        const user = users.find(u => u.id === b.userId);
        return user?.name?.toLowerCase().includes(q) || b.date?.includes(q) || b.place?.toLowerCase().includes(q);
      });
    }
    data.sort((a, b) => {
      let valA = a[sortBy] || '', valB = b[sortBy] || '';
      if (sortBy === 'date') { valA = a.date; valB = b.date; }
      if (sortBy === 'amount') { valA = a.amount||0; valB = b.amount||0; }
      return sortDir === 'asc' ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1);
    });
    return data;
  }, [bazars, selectedMonth, search, sortBy, sortDir, users]);

  const handleSort = (field) => {
    if (sortBy === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(field); setSortDir('desc'); }
  };

  const toggleSelect = (id) => { const ns = new Set(selected); ns.has(id) ? ns.delete(id) : ns.add(id); setSelected(ns); };
  const toggleSelectAll = () => selected.size === filtered.length ? setSelected(new Set()) : setSelected(new Set(filtered.map(b => b.id)));

  const startEdit = (b) => { setEditing(b.id); setEditForm({ amount: b.amount||0, place: b.place||'', items: b.items?.join(', ')||'' }); };
  
  const saveEdit = async (id) => {
    await updateDoc(doc(db, "bazar", id), {
      amount: Number(editForm.amount) || 0,
      place: editForm.place || '',
      items: editForm.items.split(',').map(i => i.trim()).filter(i => i),
      updatedAt: new Date(),
    });
    setEditing(null);
    onUpdate && onUpdate();
  };

  const deleteSingle = async (id) => { await deleteDoc(doc(db, "bazar", id)); onUpdate && onUpdate(); };
  
  const deleteSelected = async () => {
    const batch = writeBatch(db);
    selected.forEach(id => batch.delete(doc(db, "bazar", id)));
    await batch.commit();
    setSelected(new Set()); setShowDeleteAll(false);
    onUpdate && onUpdate();
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-4 border-b flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <h2 className="font-bold text-gray-900">Bazar Records ({filtered.length})</h2>
        <div className="flex gap-2 flex-wrap">
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." className="px-3 py-2 border border-gray-200 rounded-xl text-sm w-40 focus:ring-2 focus:ring-emerald-400 outline-none" />
          {selected.size > 0 && (
            <button onClick={() => setShowDeleteAll(true)} className="px-3 py-2 bg-red-50 text-red-600 rounded-xl text-sm font-medium hover:bg-red-100">
              Delete ({selected.size})
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left">
              <th className="px-4 py-3 w-10"><input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={toggleSelectAll} className="rounded" /></th>
              {['MEMBER','DATE','AMOUNT','PLACE','ITEMS',''].map((h,i) => (
                <th key={i} onClick={() => h && handleSort(h.toLowerCase())} className={`px-4 py-3 text-xs font-semibold text-gray-500 uppercase ${h ? 'cursor-pointer hover:text-gray-900' : ''}`}>
                  {h} {sortBy === h.toLowerCase() && (sortDir === 'asc' ? '^' : 'v')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.map(b => {
              const user = users.find(u => u.id === b.userId);
              const isEditing = editing === b.id;
              return (
                <tr key={b.id} className={`hover:bg-gray-50 transition ${selected.has(b.id) ? 'bg-gray-50' : ''}`}>
                  <td className="px-4 py-3"><input type="checkbox" checked={selected.has(b.id)} onChange={() => toggleSelect(b.id)} className="rounded" /></td>
                  <td className="px-4 py-3 font-medium text-gray-900">{user?.name||'N/A'}</td>
                  <td className="px-4 py-3 text-gray-600">{b.date}</td>
                  <td className="px-4 py-3">
                    {isEditing ? (
                      <input type="number" value={editForm.amount} onChange={e=>setEditForm({...editForm,amount:e.target.value})} className="w-20 border border-gray-200 rounded px-2 py-1 text-sm" />
                    ) : (
                      <span className="font-bold text-emerald-600">৳{b.amount}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {isEditing ? (
                      <input type="text" value={editForm.place} onChange={e=>setEditForm({...editForm,place:e.target.value})} className="w-28 border border-gray-200 rounded px-2 py-1 text-sm" />
                    ) : b.place}
                  </td>
                  <td className="px-4 py-3 text-gray-500 max-w-[200px] truncate">
                    {isEditing ? (
                      <input type="text" value={editForm.items} onChange={e=>setEditForm({...editForm,items:e.target.value})} className="w-40 border border-gray-200 rounded px-2 py-1 text-sm" />
                    ) : (b.items?.join(', ') || '-')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {isEditing ? (
                        <>
                          <button onClick={()=>saveEdit(b.id)} className="text-gray-900 text-xs font-semibold hover:underline">Save</button>
                          <button onClick={()=>setEditing(null)} className="text-gray-400 text-xs hover:underline">Cancel</button>
                        </>
                      ) : (
                        <>
                          <button onClick={()=>startEdit(b)} className="text-gray-500 text-xs hover:text-gray-900 font-medium">Edit</button>
                          <button onClick={()=>deleteSingle(b.id)} className="text-red-500 text-xs hover:text-red-700 font-medium">Delete</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="p-12 text-center text-sm text-gray-400">No bazar records found for {selectedMonth}</div>
        )}
      </div>

      {showDeleteAll && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={()=>setShowDeleteAll(false)}>
          <div className="bg-white rounded-2xl p-6 w-96 shadow-xl" onClick={e=>e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Delete Selected</h3>
            <p className="text-sm text-gray-500 mb-4">Delete {selected.size} bazar entries? This cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={()=>setShowDeleteAll(false)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium">Cancel</button>
              <button onClick={deleteSelected} className="flex-1 py-2.5 bg-red-500 text-white rounded-xl text-sm font-semibold hover:bg-red-600">Delete All</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}