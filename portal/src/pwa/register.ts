import { registerSW } from 'virtual:pwa-register';

export type PwaUpdateHandler = (update: () => void) => void;

let needRefreshHandler: PwaUpdateHandler | null = null;
let offlineReadyHandler: (() => void) | null = null;
let updateSW: ((reloadPage?: boolean) => Promise<void>) | null = null;

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
    return;
  }

  updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      needRefreshHandler?.(() => {
        void updateSW?.(true);
      });
    },
    onOfflineReady() {
      offlineReadyHandler?.();
    },
  });
}
