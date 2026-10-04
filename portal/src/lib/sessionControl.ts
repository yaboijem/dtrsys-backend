import type { Attendance, PunchSession } from '../api/types';
import type { PunchControlState } from './punchPolicy';

export function sessionToControl(session: PunchSession, breaksEnabled: boolean): PunchControlState {
  void breaksEnabled;
  if (!session.open || !session.time_in) {
    return { mode: 'time_in' };
  }
  if (!session.on_break || !session.break) {
    return { mode: 'choose' };
  }
  return {
    mode: 'on_break',
    kind: session.break.break_kind ?? null,
    expectedEndAt: session.break.expected_end_at ?? null,
    startedAt: session.break.timestamp,
  };
}

export function sessionFromPunch(current: PunchSession, punch: Attendance): PunchSession {
  if (punch.type === 'time_in') {
    return { open: true, on_break: false, time_in: punch, break: null };
  }
  if (punch.type === 'time_out') {
    return { open: false, on_break: false, time_in: null, break: null };
  }
  if (punch.type === 'break_in') {
    return { open: true, on_break: true, time_in: current.time_in, break: punch };
  }
  return { open: true, on_break: false, time_in: current.time_in, break: null };
}
