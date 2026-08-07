import type { Attendance, OfflinePunch, PunchType } from '../api/types';

export type AttendanceState = {
  isOpen: boolean;
  onBreak: boolean;
  openBreakStartedAt: string | null;
};

export function attendanceKey(row: { uuid?: string | null; id?: number | null }): string {
  if (row.uuid) return row.uuid;
  if (row.id != null) return String(row.id);
  return '';
}

/** Insert or replace one attendance row, sorted oldest → newest. */
export function upsertAttendance(list: Attendance[], row: Attendance): Attendance[] {
  const key = attendanceKey(row);
  const next = list.filter((p) => attendanceKey(p) !== key);
  next.push(row);
  next.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  return next;
}

/**
 * Prefer server rows, but keep very recent client rows when history has not caught up
 * (race right after time-in, timezone edge, or slow reload).
 */
export function mergeServerAttendance(
  server: Attendance[],
  previous: Attendance[],
  retainMs = 60_000,
): Attendance[] {
  let next = [...server].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
  const keys = new Set(next.map(attendanceKey).filter(Boolean));
  const now = Date.now();

  for (const row of previous) {
    const key = attendanceKey(row);
    if (!key || keys.has(key)) continue;
    const age = now - new Date(row.timestamp).getTime();
    if (!Number.isFinite(age) || age < 0 || age > retainMs) continue;
    next = upsertAttendance(next, row);
    keys.add(key);
  }

  return next;
}

/** Normalize punch API payload so button state never depends on a partial response. */
export function coerceAttendance(
  row: Partial<Attendance> | null | undefined,
  fallback: { type: PunchType; uuid: string; timestamp?: string },
): Attendance {
  return {
    id: row?.id ?? -1,
    uuid: row?.uuid || fallback.uuid,
    type: (row?.type as PunchType | undefined) || fallback.type,
    timestamp: row?.timestamp || fallback.timestamp || new Date().toISOString(),
    is_offline: Boolean(row?.is_offline),
    is_late: Boolean(row?.is_late),
    is_early_timeout: Boolean(row?.is_early_timeout),
    work_minutes: row?.work_minutes ?? null,
    break_minutes: row?.break_minutes ?? null,
    is_overbreak: Boolean(row?.is_overbreak),
    source: row?.source ?? 'app',
    notes: row?.notes ?? null,
    synced_at: row?.synced_at ?? null,
    branch: row?.branch,
    gps_location: row?.gps_location,
    photo: row?.photo,
    fraud_flags: row?.fraud_flags,
  };
}

type ChronoPunch = {
  type: PunchType;
  timestamp: string;
  uuid: string;
};

/**
 * Merge server attendance with offline queue (skipping queue rows already on
 * the server) and derive open-shift / open-break UI state chronologically.
 */
export function deriveAttendanceState(
  server: Attendance[],
  queue: OfflinePunch[],
): AttendanceState {
  const serverUuids = new Set(
    server.map((p) => p.uuid).filter((u): u is string => Boolean(u)),
  );

  const merged: ChronoPunch[] = [
    ...server.map((p) => ({
      type: p.type,
      timestamp: p.timestamp,
      uuid: p.uuid,
    })),
    ...queue
      .filter((p) => !serverUuids.has(p.client_uuid))
      .map((p) => ({
        type: p.type,
        timestamp: p.timestamp,
        uuid: p.client_uuid,
      })),
  ].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  const workPunches = merged.filter(
    (p) => p.type === 'time_in' || p.type === 'time_out',
  );
  const lastWork = workPunches[workPunches.length - 1] ?? null;
  const isOpen = lastWork?.type === 'time_in';

  if (!isOpen || !lastWork) {
    return { isOpen: false, onBreak: false, openBreakStartedAt: null };
  }

  const lastWorkAt = new Date(lastWork.timestamp).getTime();
  let openBreakStartedAt: string | null = null;

  for (const p of merged) {
    if (new Date(p.timestamp).getTime() < lastWorkAt) continue;
    if (p.type === 'break_in') {
      openBreakStartedAt = p.timestamp;
    } else if (p.type === 'break_out' && openBreakStartedAt) {
      openBreakStartedAt = null;
    }
  }

  return {
    isOpen: true,
    onBreak: openBreakStartedAt != null,
    openBreakStartedAt,
  };
}
