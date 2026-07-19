'use client'

import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Loader2, AlertCircle, CheckCircle, XCircle, Clock, 
  User, Calendar, ChevronDown, Filter
} from 'lucide-react';
import { sendAdminChatUpdate } from '@/lib/adminChatMessage';

export default function AdminIssuesPage() {
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all, pending, resolved, dismissed
  const [selectedIssue, setSelectedIssue] = useState(null);

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
          { label: 'Issue type', value: getIssueTypeLabel(issue?.issueType) },
          { label: 'Month', value: issue?.billMonth || issue?.month || '' },
          { label: 'Status', value: status },
        ],
        details: { issueId, status, issueType: issue?.issueType || '' },
        notify: true,
      }).catch((error) => console.error('Issue status chat update failed:', error));
      toast.success(`Issue ${status}`);
      setSelectedIssue(null);
    } catch (error) {
      toast.error('Failed to update');
    }
  };

  const filteredIssues = filter === 'all' 
    ? issues 
    : issues.filter(i => i.status === filter);

  const getStatusBadge = (status) => {
    const badges = {
      pending: 'bg-amber-100 text-amber-700 border-amber-200',
      resolved: 'bg-green-100 text-green-700 border-green-200',
      dismissed: 'bg-gray-100 text-gray-600 border-gray-200'
    };
    return badges[status] || badges.pending;
  };

  const getIssueTypeLabel = (type) => {
    const labels = {
      wrong_meal: 'Wrong Meal Count',
      missing_meal: 'Missing Meal',
      billing_mistake: 'Billing Mistake',
      general: 'General Issue'
    };
    return labels[type] || type;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-white">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      
      {/* Header */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Reported Issues</h1>
            <p className="text-sm text-gray-500">{issues.length} total issues</p>
          </div>
          
          {/* Filter */}
          <div className="flex items-center gap-2">
            {['all', 'pending', 'resolved', 'dismissed'].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  filter === f 
                    ? 'bg-gray-900 text-white' 
                    : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
                {f === 'pending' && ` (${issues.filter(i => i.status === 'pending').length})`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Issues List */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-3">
          {filteredIssues.length > 0 ? (
            filteredIssues.map(issue => (
              <div 
                key={issue.id} 
                className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-sm transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    {/* Status & Type */}
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getStatusBadge(issue.status)}`}>
                        {issue.status.toUpperCase()}
                      </span>
                      <span className="text-xs text-gray-500">
                        {getIssueTypeLabel(issue.issueType)}
                      </span>
                    </div>

                    {/* Description */}
                    <p className="text-sm text-gray-800 mb-2">{issue.description}</p>

                    {/* Meta */}
                    <div className="flex items-center gap-4 text-xs text-gray-400">
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {issue.userName || 'User'}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {issue.createdAt?.toDate?.()?.toLocaleDateString('en-US', { 
                          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
                        }) || '—'}
                      </span>
                      <span>Bill: {issue.billMonth}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                    {issue.status === 'pending' && (
                      <>
                        <button
                          onClick={() => updateIssueStatus(issue.id, 'resolved')}
                          className="p-1.5 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition-colors"
                          title="Mark as Resolved"
                        >
                          <CheckCircle className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => updateIssueStatus(issue.id, 'dismissed')}
                          className="p-1.5 bg-gray-50 text-gray-500 rounded-lg hover:bg-gray-100 transition-colors"
                          title="Dismiss"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      </>
                    )}
                    {issue.status === 'resolved' && (
                      <button
                        onClick={() => updateIssueStatus(issue.id, 'pending')}
                        className="p-1.5 bg-amber-50 text-amber-600 rounded-lg hover:bg-amber-100 transition-colors"
                        title="Reopen"
                      >
                        <Clock className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-16">
              <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-400">No issues found</p>
              <p className="text-xs text-gray-300 mt-1">
                {filter === 'all' ? 'No reported issues yet' : `No ${filter} issues`}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
