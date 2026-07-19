import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { CHAT_COLLECTIONS } from '../_constants/chatCollections';

export async function setTypingValue(conversationId, userId, value) {
  if (!conversationId || !userId) return;

  await setDoc(
    doc(db, CHAT_COLLECTIONS.TYPING_STATUS, conversationId),
    {
      [userId]: value,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export const setTypingStatus = setTypingValue;
