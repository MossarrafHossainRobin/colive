'use client';

import { useMemo, useState } from 'react';

function hasOriginalEmail(member) {
  return typeof member?.email === 'string' && member.email.trim().includes('@');
}

function roomLabel(member) {
  return (
    member?.roomName ||
    member?.roomNo ||
    member?.roomNumber ||
    member?.room ||
    member?.assignedRoom ||
    member?.roomId ||
    ''
  );
}

export function useChatSearch({ conversations = [], members = [] } = {}) {
  const [searchTerm, setSearchTerm] = useState('');

  const normalizedSearch = searchTerm.trim().toLowerCase();

  const originalConversations = useMemo(
    () => conversations.filter((conversation) => hasOriginalEmail(conversation.otherUser)),
    [conversations]
  );

  const originalMembers = useMemo(
    () => members.filter(hasOriginalEmail),
    [members]
  );

  const filteredConversations = useMemo(() => {
    if (!normalizedSearch) return originalConversations;

    return originalConversations.filter((conversation) => {
      const user = conversation.otherUser || {};
      const name = user.name || user.displayName || '';
      const email = user.email || '';
      const phone = user.phone || '';
      const role = user.role || '';
      const room = roomLabel(user);
      const active = user.isActive ? 'active online available' : 'inactive offline away';
      const lastMessage = conversation.convData?.lastMessage || '';

      return `${name} ${email} ${phone} ${role} ${room} ${active} ${lastMessage}`
        .toLowerCase()
        .includes(normalizedSearch);
    });
  }, [originalConversations, normalizedSearch]);

  const filteredMembers = useMemo(() => {
    if (!normalizedSearch) return originalMembers;

    return originalMembers.filter((member) => {
      const name = member.name || member.displayName || '';
      const email = member.email || '';
      const phone = member.phone || '';
      const role = member.role || '';
      const room = roomLabel(member);
      const active = member.isActive ? 'active online available' : 'inactive offline away';

      return `${name} ${email} ${phone} ${role} ${room} ${active}`
        .toLowerCase()
        .includes(normalizedSearch);
    });
  }, [originalMembers, normalizedSearch]);

  return { searchTerm, setSearchTerm, filteredConversations, filteredMembers };
}
