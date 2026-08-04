import type { Attendance, OfflinePunch, PunchType } from '../api/types';

export type AttendanceState = {
  isOpen: boolean;
  onBreak: boolean;
  openBreakStartedAt: string | null;
};

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
