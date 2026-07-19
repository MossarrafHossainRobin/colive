import { addDoc, collection, doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { CHAT_COLLECTIONS } from '../_constants/chatCollections';
import {
  ADMIN_CHAT_FOLLOW_UP_DELAY_MS,
  PUSH_NOTIFICATION_DELAY_MS,
  schedulePushNotification,
} from '@/lib/notificationPolicy';
import { sendPushToUser } from '@/lib/notificationDelivery';

export { ADMIN_CHAT_FOLLOW_UP_DELAY_MS, PUSH_NOTIFICATION_DELAY_MS };

export async function createChatNotification({
  receiverId,
  senderId,
  conversationId,
  title,
  body,
  url = '/chat',
}) {
  if (!receiverId) return;

  try {
    const ref = await addDoc(collection(db, CHAT_COLLECTIONS.NOTIFICATIONS), {
      userId: receiverId,
      title: title || 'New message',
      body: body || '',
      type: 'chat',
      senderId: senderId || '',
      conversationId: conversationId || '',
      link: url,
      read: false,
      pushStatus: 'queued',
      createdAt: serverTimestamp(),
    });
    return ref.id;
  } catch (error) {
    console.error('Create notification failed:', error);
    return null;
  }
}

export async function sendPushNotification({
  receiverId,
  title,
  body,
  icon,
  url = '/chat',
  conversationId,
  type = 'chat',
  delayMs = 0,
  notificationId = '',
}) {
  if (!receiverId) return;

  try {
    const settings = await getDoc(doc(db, 'notificationSettings', receiverId));
    const policy = settings.data() || {};

    const notificationBody =
      policy.showPreviews === false
        ? type === 'chat'
          ? 'Sent you a message'
          : 'You have a new update'
        : body;
    await sendPushToUser({
      userId: receiverId,
      title,
      body: notificationBody,
      icon: icon || '',
      url,
      type,
      conversationId,
      delayMs,
      notificationId,
    });
  } catch (error) {
    console.error('Push notification failed:', error);
  }
}

async function markNotificationMuted(notificationId) {
  if (!notificationId) return;
  await updateDoc(doc(db, CHAT_COLLECTIONS.NOTIFICATIONS, notificationId), {
    pushStatus: 'muted',
    pushUpdatedAt: serverTimestamp(),
  }).catch(() => null);
}

export async function notifyAdminActivity({
  receiverId,
  senderId,
  senderName,
  senderPhoto,
  updateTitle,
  updateBody,
  updateUrl = '/notifications',
  conversationId,
  followUpDelayMs = ADMIN_CHAT_FOLLOW_UP_DELAY_MS,
}) {
  if (!receiverId || !conversationId) return;

  const chatUrl = senderId
    ? `/chat?member=${encodeURIComponent(senderId)}`
    : '/chat';
  const adminName = senderName || 'NestHub Admin';
  const conversation = await getDoc(
    doc(db, CHAT_COLLECTIONS.CONVERSATIONS, conversationId)
  );
  const conversationData = conversation.data() || {};

  const notificationId = await createChatNotification({
    receiverId,
    senderId,
    conversationId,
    title: `${adminName} sent you a message`,
    body: updateTitle || 'Open your inbox to view the update.',
    url: chatUrl,
  });

  if (conversationData.mutedBy?.includes(receiverId)) {
    await markNotificationMuted(notificationId);
    return;
  }

  await Promise.all([
    sendPushNotification({
      receiverId,
      title: updateTitle || 'NestHub update',
      body: updateBody || 'Your information has been updated.',
      icon: senderPhoto,
      url: updateUrl,
      type: 'update',
      conversationId,
      notificationId,
    }),
    sendPushNotification({
      receiverId,
      title: `${adminName} sent you a message`,
      body: updateTitle || 'Open your inbox to view the update.',
      icon: senderPhoto,
      url: chatUrl,
      type: 'chat',
      conversationId,
      delayMs: followUpDelayMs,
      notificationId,
    }),
  ]);
}

export async function notifyNewMessage({
  receiverId,
  senderId,
  senderName,
  senderPhoto,
  messageText,
  conversationId,
  pushDelayMs = PUSH_NOTIFICATION_DELAY_MS,
}) {
  const url = senderId ? `/chat?member=${encodeURIComponent(senderId)}` : '/chat';
  const conversation = await getDoc(doc(db, CHAT_COLLECTIONS.CONVERSATIONS, conversationId));
  const conversationData = conversation.data() || {};

  const notificationId = await createChatNotification({
    receiverId,
    senderId,
    conversationId,
    title: senderName || 'New message',
    body: messageText || '',
    icon: senderPhoto,
    url,
  });

  if (conversationData.mutedBy?.includes(receiverId)) {
    await markNotificationMuted(notificationId);
    return;
  }

  const pushPayload = {
    receiverId,
    title: senderName || 'New message',
    body: messageText || '',
    icon: senderPhoto,
    url,
    conversationId,
    notificationId,
  };

  if (pushDelayMs > 0) {
    schedulePushNotification(
      () => sendPushNotification(pushPayload),
      pushDelayMs
    );
    return;
  }

  await sendPushNotification(pushPayload);
}
