import { createUserNotification } from '@/lib/notificationDelivery';

function recipientId(recipient) {
  return recipient?.id || recipient?.uid || recipient?.userId || '';
}

export async function sendReviewedWorkspaceNotification({
  recipients = [],
  title,
  body,
  type,
  link,
  data = {},
  channels = ['inApp', 'push'],
}) {
  const push = channels.includes('push');
  const uniqueRecipients = [...new Map(
    recipients.map((recipient) => [recipientId(recipient), recipient]).filter(([id]) => id)
  ).values()];
  const results = [];

  // Keep delivery deliberately sequential to avoid flooding the browser/API.
  for (const recipient of uniqueRecipients) {
    const userId = recipientId(recipient);
    try {
      const notificationId = await createUserNotification({
        userId,
        title,
        body,
        type,
        link,
        data: {
          ...data,
          channels,
          reviewed: true,
          recipientId: userId,
        },
        push,
      });
      results.push({ userId, notificationId, success: true });
    } catch (error) {
      results.push({ userId, success: false, error: error.message || 'Delivery failed' });
    }
  }

  return {
    total: uniqueRecipients.length,
    sent: results.filter((item) => item.success).length,
    failed: results.filter((item) => !item.success).length,
    results,
  };
}
