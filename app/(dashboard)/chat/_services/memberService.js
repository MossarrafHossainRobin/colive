import { collection, doc, getDoc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { CHAT_COLLECTIONS } from '../_constants/chatCollections';
import { isMemberOnline } from '@/lib/presence';

function hasOriginalEmail(member) {
  return typeof member?.email === 'string' && member.email.trim().includes('@');
}

function memberDisplayName(member) {
  return (
    member?.name ||
    member?.displayName ||
    member?.email ||
    ''
  ).trim();
}

function normalizeMember(id, data = {}) {
  return {
    id,
    ...data,
    name: data.name || data.displayName || data.email || '',
    displayName: data.displayName || data.name || data.email || '',
    email: data.email || '',
    isActive: isMemberOnline(data),
    role: data.role || 'member',
  };
}

export function isOriginalMember(member) {
  return Boolean(member?.id && hasOriginalEmail(member));
}

export function subscribeMembers(currentUserId, callback, onError) {
  const usersRef = collection(db, CHAT_COLLECTIONS.USERS);

  return onSnapshot(
    usersRef,
    (snapshot) => {
      const members = snapshot.docs
        .map((item) => normalizeMember(item.id, item.data()))
        .filter((member) => member.id !== currentUserId)
        .filter((member) => member.isBlocked !== true)
        .filter(isOriginalMember)
        .sort((a, b) => {
          if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;

          const aRole = String(a.role || '').toLowerCase() === 'admin' ? 0 : 1;
          const bRole = String(b.role || '').toLowerCase() === 'admin' ? 0 : 1;
          if (aRole !== bRole) return aRole - bRole;

          return memberDisplayName(a).localeCompare(memberDisplayName(b));
        });

      callback(members);
    },
    onError
  );
}

export async function getMemberById(memberId) {
  if (!memberId) return null;

  const snap = await getDoc(doc(db, CHAT_COLLECTIONS.USERS, memberId));
  if (!snap.exists()) return null;

  const member = normalizeMember(snap.id, snap.data());
  if (!isOriginalMember(member) || member.isBlocked === true) return null;

  return member;
}

export async function getMembersByIds(ids = []) {
  const uniqueIds = [...new Set(ids)].filter(Boolean);
  const members = await Promise.all(uniqueIds.map(getMemberById));
  return members.filter(isOriginalMember);
}

export function subscribeActiveMembers(callback, onError) {
  const q = query(collection(db, CHAT_COLLECTIONS.USERS), where('isOnline', '==', true));

  return onSnapshot(
    q,
    (snapshot) => {
      const members = snapshot.docs
        .map((item) => normalizeMember(item.id, item.data()))
        .filter(isOriginalMember)
        .filter((member) => member.isBlocked !== true);

      callback(members);
    },
    onError
  );
}
