import { ApiClient } from '../api/client';
import { OfflinePunch, PunchType, SyncResult } from '../api/types';
import { STORAGE_KEYS } from '../config';
import { newUuid } from './format';
import { idbGet, idbSet } from './idbQueue';

const MAX_BATCH = 50;
const MAX_BATCH_WITH_PHOTOS = 5;
const IDB_QUEUE_KEY = 'offline_queue';

export function dataUrlToFile(dataUrl: string, filename: string): File | null {
  try {
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
  } catch {
    return null;
  }
}

function sanitizeForSync(p: OfflinePunch): Record<string, unknown> {
  return {
    client_uuid: p.client_uuid,
    type: p.type,
    timestamp: p.timestamp,
    latitude: p.latitude,
    longitude: p.longitude,
    accuracy_meters: p.accuracy_meters,
    ...(p.notes !== undefined ? { notes: p.notes } : {}),
  };
}

function readLocalStorageQueue(): OfflinePunch[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.offlineQueue);
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as OfflinePunch[]) : null;
  } catch {
    return null;
  }
}

export async function setOfflineQueue(items: OfflinePunch[]): Promise<void> {
  await idbSet(IDB_QUEUE_KEY, items);
}

export async function getOfflineQueue(): Promise<OfflinePunch[]> {
  try {
    const stored = await idbGet<OfflinePunch[]>(IDB_QUEUE_KEY);
    if (Array.isArray(stored) && stored.length > 0) {
      return stored;
    }

    // One-time migration from localStorage (selfies exceed 5MB quota there).
    const legacy = readLocalStorageQueue();
    if (legacy && legacy.length > 0) {
      await setOfflineQueue(legacy);
      localStorage.removeItem(STORAGE_KEYS.offlineQueue);
      return legacy;
    }

    // Empty array in IDB still counts as initialized — avoid re-migrating wiped queues.
    if (Array.isArray(stored)) {
      return stored;
    }

    return [];
  } catch {
    // Fall back to legacy localStorage if IndexedDB is unavailable.
    return readLocalStorageQueue() ?? [];
  }
}

export async function enqueueOfflinePunch(
  type: PunchType,
  coords: { latitude: number; longitude: number; accuracy: number | null },
  selfieUri?: string | null,
  clientUuid?: string,
): Promise<OfflinePunch[]> {
  const queue = await getOfflineQueue();
  const entry: OfflinePunch = {
    client_uuid: clientUuid ?? newUuid(),
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
  await setOfflineQueue(queue);
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
  form.append('records', JSON.stringify(batch.map(sanitizeForSync)));

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
    let remaining = await getOfflineQueue();
    if (remaining.length === 0) {
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
        remaining: remaining.length,
        hadQueue: true,
        syncedItems: [],
      };
    }

    let synced = 0;
    let failed = 0;
    let duplicates = 0;
    let faceIssues = 0;
    const syncedItems: OfflinePunch[] = [];

    while (remaining.length > 0) {
      const window = remaining.slice(0, MAX_BATCH);
      const hasPhotos = window.some((p) => p.selfieUri);
      const batch = window.slice(0, hasPhotos ? MAX_BATCH_WITH_PHOTOS : MAX_BATCH);
      const tail = remaining.slice(batch.length);

      let result: SyncResult;
      try {
        result = hasPhotos
          ? await flushBatchWithPhotos(api, batch, token, deviceId)
          : await api.post<SyncResult>(
              '/api/attendance/sync',
              {
                device_id: deviceId ?? undefined,
                records: batch.map(sanitizeForSync),
              },
              token,
            );
      } catch (err) {
        // Leave remaining queue intact (including this batch). Persist any prior progress.
        // Network/429/5xx and other HTTP errors must not clear the queue.
        await setOfflineQueue(remaining);
        throw err;
      }

      synced += result.synced;
      failed += result.failed;
      duplicates += result.duplicates;

      const kept: OfflinePunch[] = [];
      for (let index = 0; index < batch.length; index++) {
        const punch = batch[index];
        const status = result.records?.[index];
        if (status?.status === 'created' || status?.status === 'duplicate') {
          if (status.photo?.present && status.photo.face_detected === false) {
            faceIssues++;
          }
          syncedItems.push(punch);
          continue;
        }
        // failed or missing status — keep with attempt metadata
        kept.push({
          ...punch,
          attempts: (punch.attempts ?? 0) + 1,
          last_error: status?.message ?? (status ? 'Sync failed' : 'Missing sync status'),
        });
      }

      remaining = [...kept, ...tail];
      await setOfflineQueue(remaining);
    }

    return {
      synced,
      failed,
      duplicates,
      faceIssues,
      remaining: remaining.length,
      hadQueue: true,
      syncedItems,
    };
  } finally {
    flushing = false;
  }
}
