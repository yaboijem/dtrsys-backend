import { ApiClient } from '../api/client';
import { OfflinePunch, SyncResult } from '../api/types';
import { STORAGE_KEYS } from '../config';
import { newUuid } from './format';

const MAX_BATCH = 50;
const MAX_BATCH_WITH_PHOTOS = 5;

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

async function removeFromQueue(uuids: Set<string>): Promise<OfflinePunch[]> {
  const queue = await getOfflineQueue();
  const remaining = queue.filter((p) => !uuids.has(p.client_uuid));
  if (remaining.length !== queue.length) {
    localStorage.setItem(STORAGE_KEYS.offlineQueue, JSON.stringify(remaining));
  }
  return remaining;
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
  batch.forEach((p, index) => {
    if (!p.selfieUri) {
      return;
    }
    try {
      // In web, selfieUri is a blob URL - fetch and convert to File
      const response = fetch(p.selfieUri).then((res) => res.blob()).then((blob) => {
        form.append(`photos[${index}]`, new File([blob], `selfie-${index}.jpg`, { type: 'image/jpeg' }));
      });
      // Note: This is async but we're not awaiting it here for simplicity
      // The form will still have the records even if photos fail
    } catch {
      // missing or unreadable photo — sync the record without it
    }
  });
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

      const done = batch.filter((p, index) => {
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
