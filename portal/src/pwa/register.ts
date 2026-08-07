import { registerSW } from 'virtual:pwa-register';

export type PwaUpdateHandler = (update: () => void) => void;

export type SwStatus =
  | 'dev'
  | 'unsupported'
  | 'registering'
  | 'ready'
  | 'registered'
  | 'error';

let needRefreshHandler: PwaUpdateHandler | null = null;
let offlineReadyHandler: (() => void) | null = null;
let statusHandler: ((status: SwStatus, detail?: string) => void) | null = null;
let updateSW: ((reloadPage?: boolean) => Promise<void>) | null = null;
let currentStatus: SwStatus = import.meta.env.PROD ? 'registering' : 'dev';
let currentDetail = '';

function setStatus(status: SwStatus, detail = ''): void {
  currentStatus = status;
  currentDetail = detail;
  statusHandler?.(status, detail);
}

export function getSwStatus(): { status: SwStatus; detail: string } {
  return { status: currentStatus, detail: currentDetail };
}

export function onSwStatus(handler: (status: SwStatus, detail?: string) => void): () => void {
  statusHandler = handler;
  handler(currentStatus, currentDetail);
  return () => {
    if (statusHandler === handler) {
      statusHandler = null;
    }
  };
}

export function onNeedRefresh(handler: PwaUpdateHandler): () => void {
  needRefreshHandler = handler;
  return () => {
    if (needRefreshHandler === handler) {
      needRefreshHandler = null;
    }
  };
}

export function onOfflineReady(handler: () => void): () => void {
  offlineReadyHandler = handler;
  return () => {
    if (offlineReadyHandler === handler) {
      offlineReadyHandler = null;
    }
  };
}

export function registerPortalSW(): void {
  if (!import.meta.env.PROD) {
    // vite dev has no offline shell (devOptions.enabled: false).
    setStatus('dev', 'Dev server has no offline pack. Use build + preview.');
    return;
  }

  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    setStatus('unsupported', 'This browser does not support service workers.');
    return;
  }

  setStatus('registering', 'Installing offline pack…');

  updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      needRefreshHandler?.(() => {
        void updateSW?.(true);
      });
    },
    onOfflineReady() {
      setStatus('ready', 'Offline pack installed. Refresh while offline should work.');
      offlineReadyHandler?.();
    },
    onRegisteredSW(_swUrl, registration) {
      if (registration?.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
      if (currentStatus !== 'ready') {
        setStatus('registered', 'Service worker registered. Wait for “Ready for offline use”.');
      }
      void navigator.serviceWorker.ready
        .then(() => {
          if (currentStatus !== 'ready') {
            setStatus('ready', 'Service worker active.');
          }
        })
        .catch((err: unknown) => {
          setStatus('error', err instanceof Error ? err.message : 'Service worker failed.');
        });
    },
    onRegisterError(error) {
      setStatus(
        'error',
        error instanceof Error
          ? error.message
          : 'Service worker registration failed (common with self-signed HTTPS on phones).',
      );
    },
  });
}
