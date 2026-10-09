import type { Attendance, BreakKind, PunchType } from '../api/types';

export type PunchControlState =
  | { mode: 'time_in' }
  | { mode: 'choose' }
  | { mode: 'on_break'; kind: BreakKind | null; expectedEndAt: string | null; startedAt: string };

export function derivePunchControl(punches: Attendance[], breaksEnabled: boolean): PunchControlState {
  void breaksEnabled;
  const ordered = [...punches].sort((a, b) => {
    const byTime = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    return byTime !== 0 ? byTime : a.id - b.id;
  });
  let openShift: Attendance | null = null;
  for (const punch of ordered) {
    if (punch.type === 'time_in') openShift = punch;
    if (punch.type === 'time_out') openShift = null;
  }
  if (!openShift) return { mode: 'time_in' };

  let openBreak: Attendance | null = null;
  for (const punch of ordered) {
    if (new Date(punch.timestamp).getTime() < new Date(openShift.timestamp).getTime()) continue;
    if (punch.id <= openShift.id) continue;
    if (punch.type === 'break_in') openBreak = punch;
    if (punch.type === 'break_out') openBreak = null;
  }
  if (!openBreak) return { mode: 'choose' };
  return {
    mode: 'on_break',
    kind: openBreak.break_kind ?? null,
    expectedEndAt: openBreak.expected_end_at ?? null,
    startedAt: openBreak.timestamp,
  };
}

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
    break_kind: row?.break_kind ?? null,
    expected_end_at: row?.expected_end_at ?? null,
    source: row?.source ?? 'app',
    notes: row?.notes ?? null,
    synced_at: row?.synced_at ?? null,
    branch: row?.branch,
    gps_location: row?.gps_location,
    photo: row?.photo,
    fraud_flags: row?.fraud_flags,
  };
}
