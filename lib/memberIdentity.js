import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import { isMembershipEnabled, membershipStatusFor } from './memberPolicy';

const USER_ID_COLLECTION_FIELDS = [
  { collectionName: 'meals', fields: ['userId'] },
  { collectionName: 'bazar', fields: ['userId'] },
  { collectionName: 'bills', fields: ['userId'] },
  { collectionName: 'expenses', fields: ['userId'] },
  { collectionName: 'serviceCharges', fields: ['userId'] },
  { collectionName: 'notifications', fields: ['userId', 'senderId'] },
  { collectionName: 'reportedIssues', fields: ['userId', 'uid'] },
  { collectionName: 'balanceAdjustments', fields: ['userId', 'fromUserId', 'toUserId'] },
  { collectionName: 'announcements', fields: ['bazarDetails.memberId'] },
];

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

async function commitBatch(batch, count) {
  if (count > 0) {
    await batch.commit();
  }
}

async function batchUpdateSnapshot(snapshot, buildPayload) {
  let batch = writeBatch(db);
  let count = 0;

  for (const item of snapshot.docs) {
    const payload = buildPayload(item);
    if (!payload || Object.keys(payload).length === 0) continue;

    batch.update(item.ref, payload);
    count += 1;

    if (count >= 450) {
      await commitBatch(batch, count);
      batch = writeBatch(db);
      count = 0;
    }
  }

  await commitBatch(batch, count);
}

async function getUserDocsByEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return [];

  const usersRef = collection(db, 'users');
  const results = new Map();
  const addSnapshot = (snapshot) => {
    snapshot?.docs?.forEach((item) => {
      results.set(item.id, { id: item.id, ref: item.ref, data: item.data() });
    });
  };

  await Promise.all([
    getDocs(query(usersRef, where('emailLower', '==', normalized)))
      .then(addSnapshot)
      .catch(() => null),
    getDocs(query(usersRef, where('email', '==', normalized)))
      .then(addSnapshot)
      .catch(() => null),
    getDocs(query(usersRef, where('email', '==', email)))
      .then(addSnapshot)
      .catch(() => null),
  ]);

  return Array.from(results.values()).filter((item) => {
    return normalizeEmail(item.data?.email) === normalized;
  });
}

function chooseAuthoritativeProfile(currentData, legacyDocs) {
  const legacyData = legacyDocs.map((item) => item.data || {});
  const candidates = [currentData, ...legacyData].filter(Boolean);

  return (
    candidates.find((item) => item.role === 'admin') ||
    legacyData.find((item) => item.memberId || item.room || item.role) ||
    currentData ||
    legacyData[0] ||
    {}
  );
}

function buildUserProfile({ firebaseUser, currentData, legacyDocs }) {
  const source = chooseAuthoritativeProfile(currentData, legacyDocs);
  const hasAdminRole =
    currentData?.role === 'admin' ||
    legacyDocs.some((item) => item.data?.role === 'admin');
  const accountActive = isMembershipEnabled(source);
  const normalized = normalizeEmail(firebaseUser.email || source.email);
  const providerIds = firebaseUser.providerData
    ?.map((provider) => provider.providerId)
    .filter(Boolean) || [];

  const clientData = {
    uid: firebaseUser.uid,
    authUid: firebaseUser.uid,
    linkedLegacyIds: legacyDocs.map((item) => item.id),
    name:
      source.name ||
      source.displayName ||
      firebaseUser.displayName ||
      firebaseUser.email?.split('@')[0] ||
      'User',
    email: source.email || firebaseUser.email || '',
    emailLower: normalized,
    displayName: source.displayName || firebaseUser.displayName || '',
    room: source.room || '',
    role: hasAdminRole ? 'admin' : source.role || 'member',
    memberId: source.memberId || '',
    balance: Number(source.balance || 0),
    totalDues: Number(source.totalDues || 0),
    rentAmount: Number(source.rentAmount || 0),
    serviceCharge: Number(source.serviceCharge || 0),
    isActive: accountActive,
    membershipStatus: source.membershipStatus || membershipStatusFor(accountActive),
    isBlocked: source.isBlocked === true,
    notificationEnabled: source.notificationEnabled === true,
    phone: source.phone || '',
    photo: source.photo || source.photoURL || firebaseUser.photoURL || '',
    isOnline: source.isOnline === true,
    presenceStatus: source.presenceStatus || 'away',
    presenceMode: source.presenceMode || 'auto',
    presenceUpdatedAt: source.presenceUpdatedAt || null,
    lastSeen: source.lastSeen || null,
    providerIds,
    lastLoginAt: new Date(),
  };

  const databaseData = {
    ...clientData,
    createdAt: source.createdAt || currentData?.createdAt || serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastLoginAt: serverTimestamp(),
  };

  return { clientData, databaseData };
}

async function relinkCollectionField({ collectionName, field, oldUserId, newUserId }) {
  const snapshot = await getDocs(
    query(collection(db, collectionName), where(field, '==', oldUserId))
  ).catch(() => null);

  if (!snapshot || snapshot.empty) return;

  await batchUpdateSnapshot(snapshot, () => ({
    [field]: newUserId,
    updatedAt: serverTimestamp(),
  }));
}

async function relinkConversation(conversationDoc, oldUserId, newUserId) {
  const data = conversationDoc.data() || {};
  const participants = Array.isArray(data.participants)
    ? [...new Set(data.participants.map((id) => (id === oldUserId ? newUserId : id)))]
    : [];
  const unreadCount = { ...(data.unreadCount || {}) };

  if (Object.prototype.hasOwnProperty.call(unreadCount, oldUserId)) {
    unreadCount[newUserId] = Number(unreadCount[newUserId] || 0) + Number(unreadCount[oldUserId] || 0);
    delete unreadCount[oldUserId];
  }

  await updateDoc(conversationDoc.ref, {
    participants,
    unreadCount,
    updatedAt: serverTimestamp(),
  }).catch(() => null);

  const messagesRef = collection(db, 'conversations', conversationDoc.id, 'messages');
  const senderSnapshot = await getDocs(
    query(messagesRef, where('senderId', '==', oldUserId))
  ).catch(() => null);
  const senderUidSnapshot = await getDocs(
    query(messagesRef, where('senderUid', '==', oldUserId))
  ).catch(() => null);
  const receiverSnapshot = await getDocs(
    query(messagesRef, where('receiverId', '==', oldUserId))
  ).catch(() => null);

  if (senderSnapshot && !senderSnapshot.empty) {
    await batchUpdateSnapshot(senderSnapshot, () => ({
      senderId: newUserId,
      senderUid: newUserId,
      'sender.id': newUserId,
      'sender.uid': newUserId,
      updatedAt: serverTimestamp(),
    }));
  }

  if (senderUidSnapshot && !senderUidSnapshot.empty) {
    await batchUpdateSnapshot(senderUidSnapshot, () => ({
      senderId: newUserId,
      senderUid: newUserId,
      'sender.id': newUserId,
      'sender.uid': newUserId,
      updatedAt: serverTimestamp(),
    }));
  }

  if (receiverSnapshot && !receiverSnapshot.empty) {
    await batchUpdateSnapshot(receiverSnapshot, () => ({
      receiverId: newUserId,
      updatedAt: serverTimestamp(),
    }));
  }
}

async function relinkConversations(oldUserId, newUserId) {
  const snapshot = await getDocs(
    query(collection(db, 'conversations'), where('participants', 'array-contains', oldUserId))
  ).catch(() => null);

  if (!snapshot || snapshot.empty) return;

  for (const conversationDoc of snapshot.docs) {
    await relinkConversation(conversationDoc, oldUserId, newUserId);
  }
}

export async function relinkUserReferences(oldUserId, newUserId) {
  if (!oldUserId || !newUserId || oldUserId === newUserId) return;

  for (const item of USER_ID_COLLECTION_FIELDS) {
    for (const field of item.fields) {
      await relinkCollectionField({
        collectionName: item.collectionName,
        field,
        oldUserId,
        newUserId,
      });
    }
  }

  await relinkConversations(oldUserId, newUserId);
}

export async function ensureAuthUserProfile(firebaseUser) {
  if (!firebaseUser?.uid) return null;

  const userDocRef = doc(db, 'users', firebaseUser.uid);
  const userDoc = await getDoc(userDocRef);
  const currentData = userDoc.exists() ? userDoc.data() : null;
  const emailMatches = await getUserDocsByEmail(firebaseUser.email || currentData?.email);
  const legacyDocs = emailMatches.filter((item) => item.id !== firebaseUser.uid);
  const { clientData, databaseData } = buildUserProfile({
    firebaseUser,
    currentData,
    legacyDocs,
  });

  await setDoc(userDocRef, databaseData, { merge: true });

  for (const legacy of legacyDocs) {
    await relinkUserReferences(legacy.id, firebaseUser.uid);
    await deleteDoc(doc(db, 'users', legacy.id)).catch(() => null);
  }

  return {
    id: firebaseUser.uid,
    ...currentData,
    ...clientData,
  };
}
