// Dispatch immediately. A delayed browser timer can be cancelled when the
// sender closes or backgrounds the app before the timer fires.
export const PUSH_NOTIFICATION_DELAY_MS = 0;
export const ADMIN_CHAT_FOLLOW_UP_DELAY_MS = 1500;

export function schedulePushNotification(task, delayMs = PUSH_NOTIFICATION_DELAY_MS) {
  const delay = Math.max(0, Number(delayMs) || 0);

  if (delay === 0) {
    return Promise.resolve()
      .then(task)
      .catch((error) => console.error('Push notification failed:', error));
  }

  return globalThis.setTimeout(() => {
    Promise.resolve()
      .then(task)
      .catch((error) => console.error('Scheduled push notification failed:', error));
  }, delay);
}
