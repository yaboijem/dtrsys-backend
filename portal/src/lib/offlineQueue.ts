import { ApiClient } from '../api/client';
import { OfflinePunch, SyncResult } from '../api/types';
import { STORAGE_KEYS } from '../config';
import { newUuid } from './format';

const MAX_BATCH = 50;
const MAX_BATCH_WITH_PHOTOS = 5;

export function dataUrlToFile(dataUrl: string, filename: string): File | null {
  const match = dataUrl.match(/^data:(.+);base64,(.*)$/);
  if (!match) {
    return null;
  }
  const mime = match[1];
  const base64 = match[2];
  const byteChars = atob(base64);
  const byteNumbers = new Array<number>(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    byteNumbers[i] = byteChars.charCodeAt(i);
  }
  const bytes = new Uint8Array(byteNumbers);
  return new File([bytes], filename, { type: mime });
}

export async function getOfflineQueue(): Promise<OfflinePunch[]> {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.offlineQueue);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as OfflinePunch[]) : [];
  } catch {
    return [];
  }
}

export async function enqueueOfflinePunch(
  type: 'time_in' | 'time_out',
  coords: { latitude: number; longitude: number; accuracy: number | null },
  selfieUri?: string | null,
): Promise<OfflinePunch[]> {
  const queue = await getOfflineQueue();
  const entry: OfflinePunch = {
    client_uuid: newUuid(),
    type,
    timestamp: new Date().toISOString(),
    latitude: coords.latitude,
    longitude: coords.longitude,
    accuracy_meters: coords.accuracy,
    queued_at: new Date().toISOString(),
  };
  if (selfieUri) {
    entry.selfieUri = selfieUri;
  }
  queue.push(entry);
  localStorage.setItem(STORAGE_KEYS.offlineQueue, JSON.stringify(queue));
  return queue;
}

export interface FlushResult {
  synced: number;
  failed: number;
  duplicates: number;
  faceIssues: number;
  remaining: number;
  hadQueue: boolean;
  syncedItems: OfflinePunch[];
}

async function flushBatchWithPhotos(
  api: ApiClient,
  batch: OfflinePunch[],
  token: string | null,
  deviceId: string | null,
): Promise<SyncResult> {
  const form = new FormData();
  if (deviceId) {
    form.append('device_id', deviceId);
  }
  form.append(
    'records',
    JSON.stringify(batch.map((p) => ({ ...p, selfieUri: undefined, queued_at: undefined }))),
  );

  const photoEntries = batch
    .map((p, index) => ({ index, uri: p.selfieUri }))
    .filter((entry): entry is { index: number; uri: string } => entry.uri !== undefined);

  await Promise.all(
    photoEntries.map(async ({ index, uri }) => {
      try {
        const file = dataUrlToFile(uri, `selfie-${index}.jpg`);
        if (file) {
          form.append(`photos[${index}]`, file);
        }
      } catch {
        // missing or unreadable photo — sync the record without it
      }
    }),
  );

  return api.postForm<SyncResult>('/api/attendance/sync', form, token);
}

let flushing = false;

export async function flushOfflineQueue(
  api: ApiClient,
  token: string | null,
  deviceId: string | null,
): Promise<FlushResult> {
  if (flushing) {
    return {
      synced: 0,
      failed: 0,
      duplicates: 0,
      faceIssues: 0,
      remaining: 0,
      hadQueue: false,
      syncedItems: [],
    };
  }

  flushing = true;
  try {
    const queue = await getOfflineQueue();
    if (queue.length === 0) {
      return {
        synced: 0,
        failed: 0,
        duplicates: 0,
        faceIssues: 0,
        remaining: 0,
        hadQueue: false,
        syncedItems: [],
      };
    }
    if (!token) {
      return {
        synced: 0,
        failed: 0,
        duplicates: 0,
        faceIssues: 0,
        remaining: queue.length,
        hadQueue: true,
        syncedItems: [],
      };
    }

    let synced = 0;
    let failed = 0;
    let duplicates = 0;
    let faceIssues = 0;
    const syncedItems: OfflinePunch[] = [];

    for (let i = 0; i < queue.length; ) {
      const window = queue.slice(i, i + MAX_BATCH);
      const hasPhotos = window.some((p) => p.selfieUri);
      const batch = window.slice(0, hasPhotos ? MAX_BATCH_WITH_PHOTOS : MAX_BATCH);

      const result = hasPhotos
        ? await flushBatchWithPhotos(api, batch, token, deviceId)
        : await api.post<SyncResult>(
            '/api/attendance/sync',
            {
              device_id: deviceId ?? undefined,
              records: batch.map((p) => ({ ...p, selfieUri: undefined, queued_at: undefined })),
            },
            token,
          );

      synced += result.synced;
      failed += result.failed;
      duplicates += result.duplicates;

      const done = batch.filter((_, index) => {
        const status = result.records?.[index];
        if (!status || status.status === 'failed') {
          return false;
        }
        if (status.photo?.present && status.photo.face_detected === false) {
          faceIssues++;
        }
        return true;
      });
      syncedItems.push(...done);
      queue.splice(i, batch.length, ...batch.filter((p) => !done.includes(p)));
      i += batch.length;
    }

    localStorage.setItem(STORAGE_KEYS.offlineQueue, JSON.stringify(queue));
    return { synced, failed, duplicates, faceIssues, remaining: queue.length, hadQueue: true, syncedItems };
  } finally {
    flushing = false;
  }
}
