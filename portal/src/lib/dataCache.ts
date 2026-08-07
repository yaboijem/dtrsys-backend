import type { AppNotification, Attendance } from '../api/types';
import { idbDelete, idbGet, idbSet } from './idbQueue';

export type CachedHistory = {
  records: Attendance[];
  from: string;
  to: string;
  type: string;
  page: number;
  lastPage: number;
  savedAt: string;
};

export type CachedAlerts = {
  items: AppNotification[];
  savedAt: string;
};

function historyKey(userKey: string): string {
  return `cache:history:${userKey}`;
}

function alertsKey(userKey: string): string {
  return `cache:alerts:${userKey}`;
}

export async function saveHistoryCache(userKey: string, data: Omit<CachedHistory, 'savedAt'>): Promise<void> {
  const payload: CachedHistory = { ...data, savedAt: new Date().toISOString() };
  await idbSet(historyKey(userKey), payload);
}

export async function loadHistoryCache(userKey: string): Promise<CachedHistory | undefined> {
  return idbGet<CachedHistory>(historyKey(userKey));
}

export async function saveAlertsCache(userKey: string, items: AppNotification[]): Promise<void> {
  const payload: CachedAlerts = { items, savedAt: new Date().toISOString() };
  await idbSet(alertsKey(userKey), payload);
}

export async function loadAlertsCache(userKey: string): Promise<CachedAlerts | undefined> {
  return idbGet<CachedAlerts>(alertsKey(userKey));
}

export async function clearUserDataCache(userKey: string): Promise<void> {
  await Promise.all([idbDelete(historyKey(userKey)), idbDelete(alertsKey(userKey))]);
}
