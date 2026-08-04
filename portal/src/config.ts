export const DEFAULT_API_URL = '';

export const DEFAULT_DEVICE_ID = 'web-portal-1';

export const APP_VERSION = '1.0.0';

export const STORAGE_KEYS = {
  token: 'dtr_token',
  user: 'dtr_user',
  serverUrl: 'dtr_server_url',
  deviceId: 'dtr_device_id',
  offlineQueue: 'dtr_offline_queue',
  theme: 'dtr_theme',
} as const;

export const DEV_OTP_ENABLED = import.meta.env.DEV;
