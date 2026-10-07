import assert from 'node:assert/strict';
import test from 'node:test';
import { coerceAttendance } from '../src/lib/punchPolicy.ts';
import { sessionFromPunch, sessionToControl } from '../src/lib/sessionControl.ts';
import type { Attendance } from '../src/api/types.ts';

const timeIn = {
  id: 1,
  uuid: 'time-in',
  type: 'time_in',
  timestamp: '2026-10-07T08:00:00.000Z',
} as Attendance;

test('break-in response keeps due time so the timer can show without a refresh', () => {
  const due = '2026-10-07T12:15:00.000Z';
  const punch = coerceAttendance(
    {
      id: 9,
      uuid: 'break-1',
      type: 'break_in',
      timestamp: '2026-10-07T12:00:00.000Z',
      break_kind: '15_min',
      expected_end_at: due,
    },
    { type: 'break_in', uuid: 'break-1' },
  );
  const session = sessionFromPunch(
    { open: true, on_break: false, time_in: timeIn, break: null },
    punch,
  );
  const control = sessionToControl(session, true);

  assert.equal(control.mode, 'on_break');
  if (control.mode !== 'on_break') return;
  assert.equal(control.expectedEndAt, due);
  assert.equal(control.kind, '15_min');
});
