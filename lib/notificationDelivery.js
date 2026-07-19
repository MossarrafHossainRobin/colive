import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db, getAllFCMTokens } from './firebase';
import { schedulePushNotification } from './notificationPolicy';

function notificationText(payload) {
  return String(payload.body || payload.message || '').trim();
}

function notificationUrl(payload) {
  return payload.link || payload.url || '/notifications';
}

async function markNotification(notificationId, payload) {
  if (!notificationId) return;

  await updateDoc(doc(db, 'notifications', notificationId), {
    ...payload,
    pushUpdatedAt: serverTimestamp(),
  }).catch(() => null);
}

async function hasPushPermission(userId) {
  const settings = await getDoc(doc(db, 'notificationSettings', userId)).catch(() => null);
  const policy = settings?.data?.() || {};

  return policy.permission !== 'denied';
}

export async function sendPushToUser({
  userId,
  title,
  body,
  icon = '',
  url = '/notifications',
  type = 'general',
  conversationId = '',
  notificationId = '',
  delayMs = 0,
}) {
  if (!userId) return { sent: 0, failed: 0, skipped: true };

  if (!(await hasPushPermission(userId))) {
    await markNotification(notificationId, {
      pushStatus: 'blocked',
      pushError: 'Notification permission denied',
    });
    return { sent: 0, failed: 0, blocked: true };
  }

  const runDelivery = async () => {
    const devices = await getAllFCMTokens(userId);

    if (!devices.length) {
      await markNotification(notificationId, {
        pushStatus: 'queued',
        pushError: 'No registered device token yet',
      });
      return { sent: 0, failed: 0, queued: true };
    }

    let sent = 0;
    let failed = 0;
    const errors = [];

    for (const device of devices) {
      try {
        const response = await fetch('/api/send-notification', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: device.token,
            title: title || 'NestHub',
            body: body || 'You have a new update',
            icon,
            url,
            type,
            conversationId,
            timestamp: Date.now().toString(),
          }),
        });

        if (!response.ok) {
          const result = await response.json().catch(() => ({}));
          throw new Error(result.error || 'Push delivery request failed');
        }

        sent += 1;
      } catch (error) {
        failed += 1;
        errors.push(error.message || 'Push delivery failed');
      }
    }

    await markNotification(notificationId, {
      pushStatus: sent > 0 && failed === 0 ? 'sent' : sent > 0 ? 'partial' : 'queued',
      pushSentAt: sent > 0 ? serverTimestamp() : null,
      pushDeviceCount: devices.length,
      pushSentCount: sent,
      pushFailedCount: failed,
      pushError: errors[0] || '',
    });

    return { sent, failed };
  };

  if (Number(delayMs) > 0) {
    await markNotification(notificationId, {
      pushStatus: 'scheduled',
      pushScheduledAt: serverTimestamp(),
    });
    schedulePushNotification(runDelivery, delayMs);
    return { sent: 0, failed: 0, scheduled: true };
  }

  return runDelivery();
}

export async function createUserNotification({
  userId,
  title,
  body,
  message,
  type = 'general',
  link,
  url,
  data = {},
  senderId = '',
  conversationId = '',
  read = false,
  push = true,
  icon = '',
  delayMs = 0,
}) {
  if (!userId) return null;

  const cleanBody = notificationText({ body, message });
  const targetUrl = notificationUrl({ link, url });
  const ref = await addDoc(collection(db, 'notifications'), {
    userId,
    title: title || 'NestHub',
    body: cleanBody,
    message: message || cleanBody,
    type,
    link: targetUrl,
    url: targetUrl,
    data,
    senderId,
    conversationId,
    read,
    pushStatus: push ? 'queued' : 'not_requested',
    createdAt: serverTimestamp(),
  });

  if (push) {
    await sendPushToUser({
      userId,
      title,
      body: cleanBody,
      icon,
      url: targetUrl,
      type,
      conversationId,
      notificationId: ref.id,
      delayMs,
    });
  }

  return ref.id;
}

export async function flushQueuedPushNotifications(userId, maxItems = 25) {
  if (!userId) return 0;

  const snapshot = await getDocs(
    query(
      collection(db, 'notifications'),
      where('userId', '==', userId),
      where('read', '==', false),
      limit(maxItems)
    )
  ).catch(() => null);

  if (!snapshot || snapshot.empty) return 0;

  let flushed = 0;

  for (const item of snapshot.docs) {
    const data = item.data();
    if (['sent', 'blocked', 'muted', 'not_requested'].includes(data.pushStatus)) continue;

    const result = await sendPushToUser({
      userId,
      title: data.title,
      body: notificationText(data),
      icon: data.icon || '',
      url: notificationUrl(data),
      type: data.type || 'general',
      conversationId: data.conversationId || '',
      notificationId: item.id,
    });

    if (result.sent || result.queued || result.scheduled) {
      flushed += 1;
    }
  }

  return flushed;
}
