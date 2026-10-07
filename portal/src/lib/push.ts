import { ApiClient, ApiError } from '../api/client';

function urlBase64ToArrayBuffer(value: string): ArrayBuffer {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const output = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return buffer;
}

export function pushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export async function enableDevicePush(api: ApiClient, token: string): Promise<string> {
  if (!window.isSecureContext) {
    throw new Error('Device alerts need HTTPS. Open the tunnel link, not a plain http address.');
  }
  if (!pushSupported()) {
    throw new Error('This browser cannot receive device alerts.');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notification permission was denied.');
  }

  let registration: ServiceWorkerRegistration;
  try {
    registration = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (/ssl|certificate|security/i.test(message)) {
      throw new Error('This address uses an untrusted certificate. Open the https://….trycloudflare.com link, not the self-signed one.');
    }
    throw err;
  }
  await navigator.serviceWorker.ready;

  const key = await api.get<{ public_key: string }>('/api/push/vapid-public-key', undefined, token);
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToArrayBuffer(key.public_key),
    }));

  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
    throw new Error('The browser did not return a push subscription.');
  }

  await api.post('/api/push/subscribe', {
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    content_encoding: 'aes128gcm',
  }, token);

  return json.endpoint;
}

export async function disableDevicePush(api: ApiClient, token: string): Promise<void> {
  if (!pushSupported()) {
    return;
  }

  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();

  if (!subscription) {
    return;
  }

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  await api.delete('/api/push/subscribe', token, { endpoint });
}

export function pushErrorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Could not enable device alerts.';
}
