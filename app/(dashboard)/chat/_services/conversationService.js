import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { CHAT_COLLECTIONS } from '../_constants/chatCollections';
import { buildConversationId } from '../_utils/buildConversationId';
import { sortConversations } from '../_utils/sortConversations';
import { getMemberById, isOriginalMember } from './memberService';

export function conversationDoc(conversationId) {
  return doc(db, CHAT_COLLECTIONS.CONVERSATIONS, conversationId);
}

function isArchivedForUser(data, userId) {
  return Array.isArray(data?.archivedBy) && data.archivedBy.includes(userId);
}

function isDeletedForUser(data, userId) {
  return Array.isArray(data?.deletedFor) && data.deletedFor.includes(userId);
}

function isMutedForUser(data, userId) {
  return Array.isArray(data?.mutedBy) && data.mutedBy.includes(userId);
}

function isPinnedForUser(data, userId) {
  return Array.isArray(data?.pinnedBy) && data.pinnedBy.includes(userId);
}

export function subscribeConversations(userId, callback, onError) {
  if (!userId) return () => {};

  const q = query(
    collection(db, CHAT_COLLECTIONS.CONVERSATIONS),
    where('participants', 'array-contains', userId)
  );

  return onSnapshot(
    q,
    async (snapshot) => {
      const conversations = await Promise.all(
        snapshot.docs.map(async (item) => {
          const data = item.data() || {};
          const otherUserId =
            data.participants?.find((id) => id !== userId) || null;

          const otherUser = otherUserId ? await getMemberById(otherUserId) : null;

          if (!isOriginalMember(otherUser)) return null;

          return {
            id: item.id,
            convData: {
              archivedBy: [],
              deletedFor: [],
              mutedBy: [],
              pinnedBy: [],
              blockedBy: [],
              nickname: {},
              unreadCount: {},
              ...data,
            },
            otherUser,
            unreadForMe: Number(data.unreadCount?.[userId] || 0),

            // These are useful for sidebar UI.
            isPinned: isPinnedForUser(data, userId),
            isArchived: isArchivedForUser(data, userId),
            isDeleted: isDeletedForUser(data, userId),
            isMuted: isMutedForUser(data, userId),
          };
        })
      );

      callback(sortConversations(conversations.filter(Boolean)));
    },
    onError
  );
}

export async function openOrCreateConversation(currentUserId, targetMemberId) {
  if (!currentUserId || !targetMemberId || currentUserId === targetMemberId) {
    return null;
  }

  const otherUser = await getMemberById(targetMemberId);

  if (!isOriginalMember(otherUser)) return null;

  const conversationId = buildConversationId(currentUserId, targetMemberId);
  const participants = [currentUserId, targetMemberId].sort();
  const ref = conversationDoc(conversationId);
  const existing = await getDoc(ref);

  if (!existing.exists()) {
    await setDoc(ref, {
      participants,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastMessage: '',
      lastMessageAt: serverTimestamp(),
      lastSenderId: '',
      unreadCount: {
        [currentUserId]: 0,
        [targetMemberId]: 0,
      },

      // Messenger-like per-user state.
      blockedBy: [],
      mutedBy: [],
      archivedBy: [],
      deletedFor: [],
      pinnedBy: [],

      nickname: {},
    });
  } else {
    // Important:
    // If current user manually opens a previously deleted/archived chat,
    // bring it back for only that current user.
    await updateDoc(ref, {
      deletedFor: arrayRemove(currentUserId),
      archivedBy: arrayRemove(currentUserId),
      updatedAt: serverTimestamp(),
    }).catch(() => null);
  }

  const fresh = await getDoc(ref);
  const data = fresh.data() || {};

  return {
    id: conversationId,
    convData: {
      archivedBy: [],
      deletedFor: [],
      mutedBy: [],
      pinnedBy: [],
      blockedBy: [],
      nickname: {},
      unreadCount: {},
      ...data,
    },
    otherUser,
    unreadForMe: Number(data.unreadCount?.[currentUserId] || 0),
    isPinned: isPinnedForUser(data, currentUserId),
    isArchived: isArchivedForUser(data, currentUserId),
    isDeleted: isDeletedForUser(data, currentUserId),
    isMuted: isMutedForUser(data, currentUserId),
  };
}

export async function markConversationRead(conversationId, userId) {
  if (!conversationId || !userId) return;

  await updateDoc(conversationDoc(conversationId), {
    [`unreadCount.${userId}`]: 0,
    updatedAt: serverTimestamp(),
  }).catch(async () => {
    await setDoc(
      conversationDoc(conversationId),
      {
        unreadCount: {
          [userId]: 0,
        },
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  });
}

export async function updateConversationPreference(conversationId, payload) {
  if (!conversationId) return;

  await setDoc(
    conversationDoc(conversationId),
    {
      ...payload,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function setConversationNickname(conversationId, userId, nickname) {
  if (!conversationId || !userId) return;

  await updateDoc(conversationDoc(conversationId), {
    [`nickname.${userId}`]: nickname || '',
    updatedAt: serverTimestamp(),
  });
}

export async function setMuted(conversationId, userId, muted) {
  if (!conversationId || !userId) return;

  await updateDoc(conversationDoc(conversationId), {
    mutedBy: muted ? arrayUnion(userId) : arrayRemove(userId),
    updatedAt: serverTimestamp(),
  });
}

export async function setBlocked(conversationId, userId, blocked) {
  if (!conversationId || !userId) return;

  await updateDoc(conversationDoc(conversationId), {
    blockedBy: blocked ? arrayUnion(userId) : arrayRemove(userId),
    updatedAt: serverTimestamp(),
  });
}

export async function archiveConversation(
  conversationId,
  userId,
  archived = true
) {
  if (!conversationId || !userId) return;

  await updateDoc(conversationDoc(conversationId), {
    archivedBy: archived ? arrayUnion(userId) : arrayRemove(userId),

    // If user archives, it should not stay deleted.
    deletedFor: archived ? arrayRemove(userId) : arrayRemove(userId),

    updatedAt: serverTimestamp(),
  });
}

export async function deleteConversationForUser(conversationId, userId) {
  if (!conversationId || !userId) return;

  await updateDoc(conversationDoc(conversationId), {
    deletedFor: arrayUnion(userId),
    archivedBy: arrayRemove(userId),
    updatedAt: serverTimestamp(),
  });
}

export async function restoreConversationForUser(conversationId, userId) {
  if (!conversationId || !userId) return;

  await updateDoc(conversationDoc(conversationId), {
    deletedFor: arrayRemove(userId),
    archivedBy: arrayRemove(userId),
    updatedAt: serverTimestamp(),
  });
}

export async function pinConversation(conversationId, userId, pinned = true) {
  if (!conversationId || !userId) return;

  await updateDoc(conversationDoc(conversationId), {
    pinnedBy: pinned ? arrayUnion(userId) : arrayRemove(userId),
    updatedAt: serverTimestamp(),
  }).catch(async () => {
    // Old fallback support if your old pinnedChats collection exists.
    const id = `${userId}_${conversationId}`;
    const ref = doc(db, CHAT_COLLECTIONS.PINNED_CHATS, id);

    if (pinned) {
      await setDoc(
        ref,
        {
          userId,
          conversationId,
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );
    } else {
      await deleteDoc(ref).catch(() => null);
    }
  });
}