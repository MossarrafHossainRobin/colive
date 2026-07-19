import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import { normalizeEmail } from './memberIdentity';

const OWNED_COLLECTIONS = [
  'meals',
  'bazar',
  'bills',
  'expenses',
  'serviceCharges',
  'notifications',
  'reportedIssues',
];

const RELATED_FIELD_QUERIES = [
  { collectionName: 'balanceAdjustments', fields: ['userId', 'fromUserId', 'toUserId'] },
  { collectionName: 'announcements', fields: ['bazarDetails.memberId'] },
];

async function commitBatch(batch, count) {
  if (count > 0) {
    await batch.commit();
  }
}

async function batchDeleteSnapshot(snapshot) {
  if (!snapshot || snapshot.empty) return 0;

  let deleted = 0;
  let count = 0;
  let batch = writeBatch(db);

  for (const item of snapshot.docs) {
    batch.delete(item.ref);
    count += 1;
    deleted += 1;

    if (count >= 450) {
      await commitBatch(batch, count);
      batch = writeBatch(db);
      count = 0;
    }
  }

  await commitBatch(batch, count);
  return deleted;
}

async function getDocsWhere(collectionName, field, value) {
  if (!value) return [];

  const snapshot = await getDocs(
    query(collection(db, collectionName), where(field, '==', value))
  ).catch(() => null);

  return snapshot?.docs || [];
}

async function getOwnedDocs(collectionName, userIds) {
  const results = new Map();

  for (const userId of userIds) {
    const docs = await getDocsWhere(collectionName, 'userId', userId);
    docs.forEach((item) => results.set(item.id, item));
  }

  return Array.from(results.values());
}

async function archiveCollection(collectionName, userIds) {
  const docs = await getOwnedDocs(collectionName, userIds);
  return docs.map((item) => ({ id: item.id, ...item.data() }));
}

async function deleteDocsByField(collectionName, field, userId) {
  const snapshot = await getDocs(
    query(collection(db, collectionName), where(field, '==', userId))
  ).catch(() => null);

  return batchDeleteSnapshot(snapshot);
}

async function deleteOwnedCollection(collectionName, userIds) {
  let count = 0;

  for (const userId of userIds) {
    count += await deleteDocsByField(collectionName, 'userId', userId);
  }

  return count;
}

async function deleteConversation(conversationDoc) {
  const messagesSnapshot = await getDocs(
    collection(db, 'conversations', conversationDoc.id, 'messages')
  ).catch(() => null);

  await batchDeleteSnapshot(messagesSnapshot);
  await deleteDoc(conversationDoc.ref).catch(() => null);
}

async function deleteConversationsForUser(userId) {
  const snapshot = await getDocs(
    query(collection(db, 'conversations'), where('participants', 'array-contains', userId))
  ).catch(() => null);

  if (!snapshot || snapshot.empty) return 0;

  for (const conversationDoc of snapshot.docs) {
    await deleteConversation(conversationDoc);
  }

  return snapshot.size;
}

async function deleteFcmTokens(userId) {
  const devicesSnapshot = await getDocs(
    collection(db, 'fcmTokens', userId, 'devices')
  ).catch(() => null);

  await batchDeleteSnapshot(devicesSnapshot);
  await deleteDoc(doc(db, 'fcmTokens', userId)).catch(() => null);
}

async function findRelatedUserIds({ userId, email }) {
  const normalized = normalizeEmail(email);
  const ids = new Set([userId].filter(Boolean));

  if (!normalized) return Array.from(ids);

  const usersSnapshot = await getDocs(collection(db, 'users')).catch(() => null);
  usersSnapshot?.docs?.forEach((item) => {
    const data = item.data();
    if (normalizeEmail(data.email || data.emailLower) === normalized) {
      ids.add(item.id);
    }
  });

  return Array.from(ids);
}

async function collectDeletedMemberArchive({ userIds, profile, deletedBy }) {
  const [
    meals,
    bazar,
    bills,
    expenses,
    serviceCharges,
    notifications,
    reportedIssues,
  ] = await Promise.all([
    archiveCollection('meals', userIds),
    archiveCollection('bazar', userIds),
    archiveCollection('bills', userIds),
    archiveCollection('expenses', userIds),
    archiveCollection('serviceCharges', userIds),
    archiveCollection('notifications', userIds),
    archiveCollection('reportedIssues', userIds),
  ]);

  const primaryUserId = userIds[0];
  const settingsSnapshot = await getDoc(doc(db, 'notificationSettings', primaryUserId)).catch(() => null);
  const fcmDevicesSnapshot = await getDocs(
    collection(db, 'fcmTokens', primaryUserId, 'devices')
  ).catch(() => null);

  return {
    userId: primaryUserId,
    relatedUserIds: userIds,
    email: profile.email || '',
    displayName: profile.displayName || profile.name || '',
    name: profile.name || profile.displayName || '',
    phone: profile.phone || '',
    photo: profile.photo || '',
    room: profile.room || '',
    role: profile.role || 'member',
    memberId: profile.memberId || '',
    balance: Number(profile.balance || 0),
    totalDues: Number(profile.totalDues || 0),
    isActive: false,
    isBlocked: true,
    meals,
    bazar,
    bills,
    expenses,
    serviceCharges,
    notifications,
    reportedIssues,
    notificationSettings: settingsSnapshot?.exists?.() ? settingsSnapshot.data() : null,
    fcmTokens: fcmDevicesSnapshot?.docs?.map((item) => ({
      deviceId: item.id,
      ...item.data(),
    })) || [],
    deletedAt: serverTimestamp(),
    deletedBy,
    canRetrieve: true,
    retrievalStatus: 'pending',
    originalCreatedAt: profile.createdAt || null,
    stats: {
      totalMeals: meals.reduce(
        (sum, meal) =>
          sum +
          (Number(meal.lunch) || 0) +
          (Number(meal.dinner) || 0) +
          (Number(meal.guestMeal) || 0),
        0
      ),
      totalBazar: bazar.reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0),
      totalBills: bills.reduce((sum, bill) => sum + (Number(bill.amount) || 0), 0),
      totalExpenses: expenses.reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0),
      mealCount: meals.length,
      bazarCount: bazar.length,
      billCount: bills.length,
      expenseCount: expenses.length,
    },
  };
}

export async function deleteMemberEverywhere({
  userId,
  email,
  profile = {},
  deletedBy = 'admin',
  archive = true,
}) {
  if (!userId) {
    throw new Error('Missing user id for member deletion.');
  }

  const relatedUserIds = await findRelatedUserIds({ userId, email: email || profile.email });
  const primaryProfile = {
    ...profile,
    email: profile.email || email || '',
  };

  if (archive) {
    const archiveData = await collectDeletedMemberArchive({
      userIds: relatedUserIds,
      profile: primaryProfile,
      deletedBy,
    });

    await setDoc(doc(db, 'deletedUsers', userId), archiveData, { merge: true });
  }

  const deletedCounts = {
    users: 0,
    conversations: 0,
  };

  for (const collectionName of OWNED_COLLECTIONS) {
    deletedCounts[collectionName] = await deleteOwnedCollection(collectionName, relatedUserIds);
  }

  for (const related of RELATED_FIELD_QUERIES) {
    let count = 0;
    for (const userIdValue of relatedUserIds) {
      for (const field of related.fields) {
        count += await deleteDocsByField(related.collectionName, field, userIdValue);
      }
    }
    deletedCounts[related.collectionName] = count;
  }

  for (const userIdValue of relatedUserIds) {
    deletedCounts.conversations += await deleteConversationsForUser(userIdValue);
    await deleteFcmTokens(userIdValue);
    await deleteDoc(doc(db, 'notificationSettings', userIdValue)).catch(() => null);
    await deleteDoc(doc(db, 'users', userIdValue)).then(() => {
      deletedCounts.users += 1;
    }).catch(() => null);
  }

  if (primaryProfile.memberId) {
    deletedCounts.memberLogs = await deleteDocsByField(
      'memberLogs',
      'memberId',
      primaryProfile.memberId
    );
  }

  return {
    relatedUserIds,
    deletedCounts,
  };
}
