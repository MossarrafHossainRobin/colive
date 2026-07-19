'use client';

import { useState } from 'react';
import Avatar from '../common/Avatar';

export default function ForwardMessageModal({ members = [], message, onForward, onClose }) {
  const [query, setQuery] = useState('');
  const filtered = members.filter((member) => `${member.name || member.displayName || ''} ${member.email || ''}`.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="fixed inset-0 z-[1200] flex items-end bg-black/40 lg:items-center lg:justify-center">
      <div className="max-h-[80dvh] w-full overflow-hidden rounded-t-3xl bg-white shadow-xl lg:max-w-md lg:rounded-3xl">
        <div className="flex h-14 items-center justify-between border-b border-gray-100 px-4">
          <h3 className="text-lg font-bold text-[#050505]">Forward message</h3>
          <button type="button" onClick={onClose} className="h-9 w-9 rounded-full hover:bg-[#F0F2F5]">×</button>
        </div>

        <div className="border-b border-gray-100 p-4">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search member"
            className="h-10 w-full rounded-full bg-[#F0F2F5] px-4 text-sm outline-none"
          />
          <p className="mt-3 line-clamp-2 rounded-2xl bg-[#F0F2F5] p-3 text-sm text-[#65676B]">{message?.text || 'Message'}</p>
        </div>

        <div className="max-h-[50dvh] overflow-y-auto p-2">
          {filtered.map((member) => (
            <button
              key={member.id}
              type="button"
              onClick={() => onForward(member)}
              className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left hover:bg-[#F0F2F5]"
            >
              <Avatar user={member} size="md" showStatus />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-[#050505]">{member.name || member.displayName || 'Member'}</p>
                <p className="truncate text-xs text-[#65676B]">{member.email}</p>
              </div>
              <span className="text-sm font-semibold text-[#0084FF]">Send</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
