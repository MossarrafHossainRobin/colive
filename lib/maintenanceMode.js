export const MAINTENANCE_SETTINGS_COLLECTION = 'announcements';
export const MAINTENANCE_SETTINGS_ID = 'systemMaintenance';

export const MAINTENANCE_SETTINGS_HIDDEN_FIELDS = {
  active: false,
  hidden: true,
  type: 'system',
};

export const DEFAULT_MAINTENANCE_SETTINGS = {
  enabled: false,
  title: "We'll be back in no time",
  message:
    'NestHub is getting a quick system tune-up. Please follow the Excel sheet for your meal tracking until service is back online.',
  etaLabel: 'Back in no time',
  allowedUserIds: [],
};

export function normalizeMaintenanceSettings(data = {}) {
  const allowedUserIds = Array.isArray(data.allowedUserIds)
    ? [...new Set(data.allowedUserIds.filter(Boolean))]
    : [];

  return {
    ...DEFAULT_MAINTENANCE_SETTINGS,
    ...data,

    enabled: data.enabled === true,

    title:
      typeof data.title === 'string' && data.title.trim()
        ? data.title.trim()
        : DEFAULT_MAINTENANCE_SETTINGS.title,

    message:
      typeof data.message === 'string' && data.message.trim()
        ? data.message.trim()
        : DEFAULT_MAINTENANCE_SETTINGS.message,

    etaLabel:
      typeof data.etaLabel === 'string' && data.etaLabel.trim()
        ? data.etaLabel.trim()
        : DEFAULT_MAINTENANCE_SETTINGS.etaLabel,

    allowedUserIds,
  };
}

export function canAccessDuringMaintenance({
  settings,
  user,
  userData,
}) {
  if (!settings?.enabled) return true;

  if (userData?.role === 'admin') return true;

  const allowedUserIds = new Set(settings?.allowedUserIds || []);

  const candidateIds = [
    user?.uid,
    userData?.id,
    userData?.uid,
  ].filter(Boolean);

  return candidateIds.some((id) => allowedUserIds.has(id));
}