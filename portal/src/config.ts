export const DEFAULT_API_URL = '';

export const DEFAULT_DEVICE_ID = 'web-portal-1';

export const APP_VERSION = '1.0.0';

export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';

export const STORAGE_KEYS = {
  token: 'dtr_token',
  user: 'dtr_user',
  serverUrl: 'dtr_server_url',
  deviceId: 'dtr_device_id',
  theme: 'dtr_theme',
  profilePhotoPrefix: 'dtr_profile_photo_',
} as const;
