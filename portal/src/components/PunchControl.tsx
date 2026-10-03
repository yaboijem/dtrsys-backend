import { useState } from 'react';

import { BREAK_OPTIONS, type BreakKind } from '../api/types';
import type { PunchControlState } from '../lib/punchPolicy';
import { fontSize, spacing, useThemeColors } from '../theme';
import { Button } from './Button';

type Props = {
  state: PunchControlState;
  breaksEnabled: boolean;
  punching: boolean;
  now: number;
  onTimeIn: () => void;
  onTimeOut: () => void;
  onBreak: (kind: BreakKind) => void;
  onDoneBreak: () => void;
};

function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function PunchControl({
  state,
  breaksEnabled,
  punching,
  now,
  onTimeIn,
  onTimeOut,
  onBreak,
  onDoneBreak,
}: Props) {
  const colors = useThemeColors();
  const [open, setOpen] = useState(false);

  if (state.mode === 'time_in') {
    return <Button title="Time In" variant="success" size="large" onClick={onTimeIn} loading={punching} />;
  }

  if (state.mode === 'on_break') {
    const remaining = state.expectedEndAt ? new Date(state.expectedEndAt).getTime() - now : null;
    const timed = remaining !== null;
    const aboutToEnd = timed && remaining > 0 && remaining <= 120_000;
    const pastDue = timed && remaining <= 0;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
        {timed && remaining > 0 ? (
          <div style={{ fontSize: fontSize.sm, color: colors.muted, textAlign: 'center' }}>{formatRemaining(remaining)} left</div>
        ) : null}
        {aboutToEnd ? (
          <div style={{ fontSize: fontSize.sm, fontWeight: 700, color: colors.warningText, textAlign: 'center' }}>
            Your break is about to end.
          </div>
        ) : null}
        {pastDue ? (
          <div style={{ fontSize: fontSize.sm, fontWeight: 700, color: colors.dangerText, textAlign: 'center' }}>Past due</div>
        ) : null}
        <Button title="Done Break" variant="primary" size="large" onClick={onDoneBreak} loading={punching} />
        <Button title="Time Out" variant="danger" size="large" onClick={onTimeOut} loading={punching} />
      </div>
    );
  }

  if (!breaksEnabled) {
    return <Button title="Time Out" variant="danger" size="large" onClick={onTimeOut} loading={punching} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
      <Button title="Choose action" variant="primary" size="large" onClick={() => setOpen((value) => !value)} loading={punching} />
      {open ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
          {BREAK_OPTIONS.map((option) => (
            <Button
              key={option.kind}
              title={option.label}
              variant="secondary"
              onClick={() => {
                setOpen(false);
                onBreak(option.kind);
              }}
              disabled={punching}
            />
          ))}
          <Button
            title="Time Out"
            variant="danger"
            onClick={() => {
              setOpen(false);
              onTimeOut();
            }}
            disabled={punching}
          />
        </div>
      ) : null}
    </div>
  );
}
