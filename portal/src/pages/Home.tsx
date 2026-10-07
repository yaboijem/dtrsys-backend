import { useCallback, useEffect, useRef, useState } from 'react';

import { MapPin } from 'lucide-react';

import { ApiError } from '../api/client';
import { Attendance, BreakKind, PunchSession, PunchType, GpsOutOfRangeDetails } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/Button';
import { PunchControl } from '../components/PunchControl';
import { CameraModal } from '../components/CameraModal';
import { Avatar, SectionCard, Tag } from '../components/Feedback';
import { Screen } from '../components/Screen';
import { Stamp } from '../components/Stamp';
import {
  distanceLabel,
  errorMessage,
  formatDateTime,
  formatPunchTime,
  formatTime,
  minutesToDuration,
  newUuid,
} from '../lib/format';
import { gpsFailureMessage, resolveGpsPosition } from '../lib/location';
import { compressDataUrl, dataUrlToFile } from '../lib/image';
import { coerceAttendance, mergeServerAttendance, upsertAttendance } from '../lib/punchPolicy';
import { sessionFromPunch, sessionToControl } from '../lib/sessionControl';
import { MAX_UPLOAD_SENDS, shouldReplayUpload } from '../lib/uploadReplay';
import { useProfilePhoto } from '../lib/useProfilePhoto';
import { useUnread } from '../notifications/UnreadContext';
import { fontSize, spacing, useThemeColors } from '../theme';

const BREAKS_ENABLED_KEY = 'dtr.breaks_enabled';

function readCachedBreaksEnabled(): boolean {
  try {
    const raw = localStorage.getItem(BREAKS_ENABLED_KEY);
    if (raw === 'false') return false;
    return true; // default on if missing
  } catch {
    return true;
  }
}

function writeCachedBreaksEnabled(value: boolean): void {
  try {
    localStorage.setItem(BREAKS_ENABLED_KEY, value ? 'true' : 'false');
  } catch {
    /* ignore quota / private mode */
  }
}

type PendingUpload = {
  clientUuid: string;
  kind: 'time_in' | 'time_out' | 'break_in' | 'break_out';
  latitude: number;
  longitude: number;
  accuracy: number | null;
  selfieDataUrl?: string;
  breakKind?: BreakKind;
  sends: number;
};

const EMPTY_SESSION: PunchSession = {
  open: false,
  on_break: false,
  time_in: null,
  break: null,
};

function punchTypeLabel(type: PunchType): string {
  switch (type) {
    case 'time_in':
      return 'Time in';
    case 'time_out':
      return 'Time out';
    case 'break_in':
      return 'Break in';
    case 'break_out':
      return 'Break out';
  }
}

interface PunchResult {
  kind: 'success' | 'error';
  title: string;
  detail?: string;
}

export function Home() {
  const colors = useThemeColors();
  const { api, token, user, deviceId } = useAuth();
  const { refreshUnread } = useUnread();
  const { src: photoSrc } = useProfilePhoto(user?.employee_id);

  const [punches, setPunches] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [punching, setPunching] = useState(false);
  const [cameraVisible, setCameraVisible] = useState(false);
  const [result, setResult] = useState<PunchResult | null>(null);
  const [pendingCoords, setPendingCoords] = useState<{ latitude: number; longitude: number; accuracy: number | null } | null>(null);
  const [gpsHint, setGpsHint] = useState<'unknown' | 'ok' | 'bad'>('unknown');
  const [breaksEnabled, setBreaksEnabled] = useState<boolean>(() => readCachedBreaksEnabled());
  const [session, setSession] = useState<PunchSession>(EMPTY_SESSION);
  const [retryReady, setRetryReady] = useState(false);
  const punchBusyRef = useRef(false);
  const loadGenRef = useRef(0);
  const sessionGenRef = useRef(0);
  const pendingRef = useRef<PendingUpload | null>(null);
  const pendingPunchTypeRef = useRef<'time_in' | 'time_out'>('time_in');

  const punchControl = sessionToControl(session, breaksEnabled);
  const isOpen = session.open;
  const onBreak = session.on_break;
  const [punchNow, setPunchNow] = useState(() => Date.now());

  const workPunches = punches.filter((p) => p.type === 'time_in' || p.type === 'time_out');
  const lastWork = workPunches[workPunches.length - 1] ?? null;
  const lastPunch = lastWork;

  useEffect(() => {
    if (punchControl.mode !== 'on_break' || !punchControl.expectedEndAt) return;
    const id = window.setInterval(() => setPunchNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [punchControl]);

  const loadToday = useCallback(async (): Promise<boolean> => {
    if (!token) {
      return false;
    }
    const gen = ++loadGenRef.current;
    let historyOk = false;
    try {
      await Promise.all([
        api
          .get<{ data: Attendance[] }>('/api/attendance/work', undefined, token)
          .then((res) => {
            if (gen !== loadGenRef.current) return;
            const sorted = [...res.data].sort(
              (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
            );
            setPunches((prev) => mergeServerAttendance(sorted, prev));
            historyOk = true;
          })
          .catch(() => {
            // keep previous data so queued punches remain visible
          }),
        api
          .get<{ data: { breaks_enabled: boolean } }>('/api/settings', undefined, token)
          .then((res) => {
            if (gen !== loadGenRef.current) return;
            const enabled = Boolean(res.data.breaks_enabled);
            setBreaksEnabled(enabled);
            writeCachedBreaksEnabled(enabled);
          })
          .catch(() => {
            // keep cached value
          }),
      ]);
    } catch {
      // individual fetches already surface errors
    } finally {
      if (gen === loadGenRef.current) {
        setLoading(false);
      }
    }
    return historyOk;
  }, [api, token, user]);

  const applySession = (next: PunchSession) => {
    sessionGenRef.current += 1;
    setSession(next);
  };

  const loadSession = useCallback(async () => {
    if (!token) return;
    const gen = ++sessionGenRef.current;
    try {
      const res = await api.get<{ data: PunchSession }>('/api/attendance/session', undefined, token);
      if (gen !== sessionGenRef.current) return;
      setSession(res.data);
    } catch {
      // Keep the last applied session. History must not move the button.
    }
  }, [api, token]);

  useEffect(() => {
    void loadToday();
    void loadSession();
    refreshUnread();
  }, [loadToday, loadSession, refreshUnread]);

  useEffect(() => {
    return () => {
      pendingRef.current = null;
    };
  }, []);

  const clearPending = () => {
    pendingRef.current = null;
    setRetryReady(false);
  };

  const postPending = async (pending: PendingUpload): Promise<Attendance> => {
    if (pending.kind === 'time_in' || pending.kind === 'time_out') {
      const selfieFile = dataUrlToFile(pending.selfieDataUrl ?? '', 'selfie.jpg');
      if (!selfieFile) {
        throw new ApiError('The captured selfie could not be read. Tap the button again to retake it.', 0, 'photo_unavailable');
      }
      const form = new FormData();
      form.append('selfie', selfieFile);
      form.append('latitude', String(pending.latitude));
      form.append('longitude', String(pending.longitude));
      if (pending.accuracy !== null && Number.isFinite(pending.accuracy)) {
        form.append('accuracy_meters', String(pending.accuracy));
      }
      form.append('device_id', deviceId);
      form.append('client_uuid', pending.clientUuid);
      const res = await api.postForm<{ data: Attendance }>(
        `/api/attendance/${pending.kind === 'time_in' ? 'time-in' : 'time-out'}`,
        form,
        token,
      );
      return coerceAttendance(res?.data, { type: pending.kind, uuid: pending.clientUuid });
    }

    const res = await api.post<{ data: Attendance }>(
      pending.kind === 'break_in' ? '/api/attendance/break-in' : '/api/attendance/break-out',
      {
        latitude: pending.latitude,
        longitude: pending.longitude,
        accuracy_meters: pending.accuracy,
        device_id: deviceId || undefined,
        client_uuid: pending.clientUuid,
        ...(pending.breakKind ? { break_kind: pending.breakKind } : {}),
      },
      token,
    );
    return coerceAttendance(res?.data, { type: pending.kind, uuid: pending.clientUuid });
  };

  const finishSuccess = (attendance: Attendance, kind: PendingUpload['kind']) => {
    clearPending();
    setPunches((prev) => upsertAttendance(prev, attendance));
    sessionGenRef.current += 1;
    setSession((current) => sessionFromPunch(current, attendance));
    if (kind === 'break_in') setPunchNow(Date.now());
    const distance = attendance.gps_location?.distance_from_branch_meters;
    if (kind === 'time_in' || kind === 'time_out') {
      setResult({
        kind: 'success',
        title: kind === 'time_in' ? 'Clocked in' : 'Clocked out',
        detail: [
          formatDateTime(attendance.timestamp),
          attendance.is_late ? 'Late (past grace period)' : 'On time',
          distance !== null && distance !== undefined ? `Distance from branch: ${distanceLabel(distance)}` : '',
          kind === 'time_out' && attendance.work_minutes !== null
            ? `Work duration: ${minutesToDuration(attendance.work_minutes)}`
            : '',
        ]
          .filter(Boolean)
          .join('\n'),
      });
    } else {
      setResult({
        kind: 'success',
        title: kind === 'break_in' ? 'Break started' : 'Break ended',
        detail:
          kind === 'break_in'
            ? 'GPS verified.'
            : attendance.break_minutes != null
              ? `Break lasted ${attendance.break_minutes} min${attendance.is_overbreak ? ' (overbreak)' : ''}.`
              : undefined,
      });
    }
    void loadToday();
    void loadSession();
    refreshUnread();
  };

  const explainFailure = (err: unknown, fallbackTitle: string) => {
    if (err instanceof ApiError && err.code === 'attendance_conflict' && err.session) {
      clearPending();
      applySession(err.session);
      setResult({
        kind: 'error',
        title: err.session.open ? 'Already clocked in.' : 'Conflict',
        detail: err.message,
      });
      return;
    }
    if (shouldReplayUpload(err)) {
      setRetryReady(true);
      setResult({
        kind: 'error',
        title: 'Punch failed',
        detail: 'Not recorded. Connect and tap Retry to send this same punch.',
      });
      return;
    }
    clearPending();
    if (err instanceof ApiError && err.code === 'gps_out_of_range') {
      const details = (err.details ?? {}) as GpsOutOfRangeDetails;
      const target = details.verified_against_type === 'home_location' ? 'home' : 'branch';
      setResult({
        kind: 'error',
        title: 'Outside GPS radius',
        detail: `${err.message}${details.distance_meters !== undefined ? ` (${distanceLabel(details.distance_meters)} from ${target})` : ''}`,
      });
      return;
    }
    if (err instanceof ApiError && err.code === 'home_location_required') {
      setResult({
        kind: 'error',
        title: 'Home location required',
        detail: 'Go to More → Home location and submit your home pin for HR approval.',
      });
      return;
    }
    if (err instanceof ApiError && err.code === 'home_location_pending') {
      setResult({
        kind: 'error',
        title: 'Home location pending',
        detail: 'Your home pin is waiting for HR approval. You cannot punch until it is approved.',
      });
      return;
    }
    if (err instanceof ApiError && err.code === 'unauthenticated') {
      setResult({ kind: 'error', title: 'Session expired', detail: 'Log in again.' });
      return;
    }
    setResult({ kind: 'error', title: fallbackTitle, detail: errorMessage(err) });
  };

  const sendWithReplay = async (pending: PendingUpload): Promise<Attendance> => {
    let lastError: unknown;
    while (pending.sends < MAX_UPLOAD_SENDS) {
      pending.sends += 1;
      try {
        return await postPending(pending);
      } catch (err) {
        lastError = err;
        if (!shouldReplayUpload(err)) throw err;
      }
    }
    setRetryReady(true);
    throw lastError;
  };

  const submitPunch = async (
    uri: string,
    type: 'time_in' | 'time_out',
    coords: { latitude: number; longitude: number; accuracy: number | null },
  ) => {
    setResult(null);
    setPunching(true);
    punchBusyRef.current = true;
    const compressedUri = await compressDataUrl(uri);
    const pending: PendingUpload = {
      clientUuid: newUuid(),
      kind: type,
      latitude: coords.latitude,
      longitude: coords.longitude,
      accuracy: coords.accuracy,
      selfieDataUrl: compressedUri,
      sends: 0,
    };
    pendingRef.current = pending;
    try {
      const attendance = await sendWithReplay(pending);
      finishSuccess(attendance, type);
    } catch (err) {
      explainFailure(err, 'Punch failed');
    } finally {
      setPunching(false);
      punchBusyRef.current = false;
    }
  };

  const handlePunchPress = async (type: 'time_in' | 'time_out') => {
    if (punchBusyRef.current || punching || cameraVisible || pendingRef.current) {
      return;
    }
    setResult(null);
    setPunching(true);
    punchBusyRef.current = true;
    pendingPunchTypeRef.current = type;
    try {
      const gps = await resolveGpsPosition();
      if (gps.status !== 'ok') {
        setGpsHint('bad');
        setResult({
          kind: 'error',
          title: 'Location needed',
          detail: gpsFailureMessage(gps.status),
        });
        punchBusyRef.current = false;
        return;
      }
      setGpsHint('ok');
      setPendingCoords(gps.position);
      setCameraVisible(true);
      // Keep punchBusyRef until capture finishes or camera closes.
    } catch {
      setGpsHint('bad');
      setResult({
        kind: 'error',
        title: 'Location needed',
        detail: gpsFailureMessage('unavailable'),
      });
      punchBusyRef.current = false;
    } finally {
      setPunching(false);
    }
  };

  const handleBreakPress = async (kind: BreakKind | null) => {
    if (!token) return;
    if (punchBusyRef.current || punching || pendingRef.current) return;
    setResult(null);
    setPunching(true);
    punchBusyRef.current = true;
    try {
      const gps = await resolveGpsPosition();
      if (gps.status !== 'ok') {
        setGpsHint('bad');
        setResult({ kind: 'error', title: 'Location needed', detail: gpsFailureMessage(gps.status) });
        return;
      }
      setGpsHint('ok');
      const pending: PendingUpload = {
        clientUuid: newUuid(),
        kind: kind ? 'break_in' : 'break_out',
        latitude: gps.position.latitude,
        longitude: gps.position.longitude,
        accuracy: gps.position.accuracy,
        breakKind: kind ?? undefined,
        sends: 0,
      };
      pendingRef.current = pending;
      const attendance = await sendWithReplay(pending);
      finishSuccess(attendance, pending.kind);
    } catch (err) {
      explainFailure(err, 'Break failed');
    } finally {
      setPunching(false);
      punchBusyRef.current = false;
    }
  };

  const handleRetry = async () => {
    const pending = pendingRef.current;
    if (!pending || punchBusyRef.current) return;
    setResult(null);
    setPunching(true);
    punchBusyRef.current = true;
    try {
      pending.sends += 1;
      const attendance = await postPending(pending);
      finishSuccess(attendance, pending.kind);
    } catch (err) {
      explainFailure(err, 'Punch failed');
    } finally {
      setPunching(false);
      punchBusyRef.current = false;
    }
  };

  const handleCapture = (uri: string) => {
    setCameraVisible(false);
    const coords = pendingCoords;
    setPendingCoords(null);
    if (!coords) {
      setResult({
        kind: 'error',
        title: 'Location needed',
        detail: gpsFailureMessage('unavailable'),
      });
      punchBusyRef.current = false;
      return;
    }
    void submitPunch(uri, pendingPunchTypeRef.current, coords);
  };

  const handleCameraClose = () => {
    setCameraVisible(false);
    setPendingCoords(null);
    punchBusyRef.current = false;
    setPunching(false);
  };

  useEffect(() => {
    let cancelled = false;
    void resolveGpsPosition().then((gps) => {
      if (cancelled) return;
      setGpsHint(gps.status === 'ok' ? 'ok' : 'bad');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const displayName = user?.employee?.full_name ?? user?.name ?? 'there';
  const firstName = displayName.split(' ')[0] ?? displayName;
  const statusLabel = loading
    ? 'Checking…'
    : onBreak
        ? 'On Break'
        : isOpen
          ? 'Clocked in'
          : 'Clocked out';

  const statusTone = loading
    ? colors.muted
    : onBreak
        ? colors.warningText
        : isOpen
          ? colors.successText
          : colors.muted;

  return (
    <Screen>
      <div className="portal-card portal-card-pad" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Avatar name={displayName} size={48} src={photoSrc} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: fontSize.lg, fontWeight: 800, color: colors.ink, letterSpacing: '-0.02em' }}>
            Hello, {firstName}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4, alignItems: 'center' }}>
            {user?.employee?.position ? <Tag label={user.employee.position} tone="neutral" /> : null}
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: statusTone,
                background: 'color-mix(in srgb, currentColor 12%, transparent)',
                borderRadius: 999,
                padding: '3px 8px',
              }}
            >
              {statusLabel}
            </span>
          </div>
        </div>
      </div>

      <div className="portal-card portal-card-pad">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div
            className={gpsHint === 'ok' ? 'gps-pulse-ok' : gpsHint === 'bad' ? 'gps-pulse-bad' : undefined}
            style={{
              width: 36,
              height: 36,
              borderRadius: 999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background:
                gpsHint === 'ok'
                  ? 'color-mix(in srgb, var(--success) 15%, transparent)'
                  : gpsHint === 'bad'
                    ? 'color-mix(in srgb, var(--danger) 15%, transparent)'
                    : 'color-mix(in srgb, var(--muted) 12%, transparent)',
              color: gpsHint === 'ok' ? colors.successText : gpsHint === 'bad' ? colors.dangerText : colors.muted,
            }}
          >
            <MapPin size={18} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: fontSize.sm, fontWeight: 700, color: colors.ink }}>
              {gpsHint === 'ok'
                ? 'GPS ready'
                : gpsHint === 'bad'
                  ? 'GPS unavailable'
                  : 'Checking location…'}
            </div>
            <div style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
              {punchControl.mode === 'on_break'
                ? 'GPS check on Done Break. Selfie required to clock out.'
                : punchControl.mode === 'choose'
                  ? `Clocked in since ${formatTime(session.time_in?.timestamp ?? lastPunch?.timestamp)}. Selfie required to clock out.`
                  : 'Location verified against your branch radius on punch.'}
            </div>
          </div>
        </div>

        <PunchControl
          state={punchControl}
          breaksEnabled={breaksEnabled}
          punching={punching}
          now={punchNow}
          onTimeIn={() => void handlePunchPress('time_in')}
          onTimeOut={() => void handlePunchPress('time_out')}
          onBreak={(kind) => void handleBreakPress(kind)}
          onDoneBreak={() => void handleBreakPress(null)}
        />
        {retryReady ? (
          <Button
            title="Retry"
            variant="primary"
            onClick={() => void handleRetry()}
            loading={punching}
            style={{ marginTop: spacing.sm }}
          />
        ) : null}
      </div>

      {result ? <Stamp kind={result.kind} title={result.title} detail={result.detail} /> : null}

      {punches.length > 0 ? (
        <SectionCard title="Work Punches">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: spacing.sm,
                paddingBottom: 6,
                borderBottom: `1px solid ${colors.border}`,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 0.6,
                textTransform: 'uppercase',
                color: colors.muted,
              }}
            >
              <div style={{ width: 6, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>Activity</div>
              <div style={{ flexShrink: 0 }}>Time</div>
              <div style={{ flexShrink: 0, minWidth: 72, textAlign: 'right' }}>Duration</div>
            </div>
            {punches.map((p, idx) => {
              const meta: string[] = [];
              if (p.is_late) meta.push('Late');
              if (p.is_overbreak) meta.push('Overbreak');
              if (p.break_kind) {
                const label = {
                  '15_min': '15 mins break',
                  '5_min': '5 mins break (test)',
                  lunch_60: '1hr Lunch Break',
                  bio: 'Bio break',
                  phone: 'Phone time',
                  coaching: 'Coaching',
                  huddle: 'Huddle',
                  training: 'Training',
                }[p.break_kind];
                if (label) meta.push(label);
              }
              const duration =
                p.type === 'time_out' && p.work_minutes != null
                  ? minutesToDuration(p.work_minutes)
                  : p.type === 'break_out' && p.break_minutes != null
                    ? minutesToDuration(p.break_minutes)
                    : null;

              return (
                <div
                  key={p.uuid ?? p.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: spacing.sm,
                    minHeight: 36,
                    paddingTop: 4,
                    paddingBottom: 4,
                    borderBottom: idx === punches.length - 1 ? 'none' : `1px solid ${colors.border}`,
                  }}
                >
                  <div
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 999,
                      flexShrink: 0,
                      background:
                        p.type === 'time_in'
                          ? colors.success
                          : p.type === 'time_out'
                            ? colors.danger
                            : colors.muted,
                    }}
                  />
                  <div
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontSize: 12,
                      fontWeight: 700,
                      color: colors.ink,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {punchTypeLabel(p.type)}
                    {meta.length > 0 ? (
                      <span style={{ fontWeight: 600, color: colors.muted }}> · {meta.join(' · ')}</span>
                    ) : null}
                  </div>
                  <div className="tnum" style={{ fontSize: 13, fontWeight: 700, color: colors.ink, flexShrink: 0 }}>
                    {formatPunchTime(p.timestamp)}
                  </div>
                  <div
                    className="tnum"
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: colors.muted,
                      flexShrink: 0,
                      minWidth: 72,
                      textAlign: 'right',
                    }}
                  >
                    {duration ?? '—'}
                  </div>
                </div>
              );
            })}
          </div>
        </SectionCard>
      ) : null}

      <CameraModal visible={cameraVisible} onCapture={handleCapture} onClose={handleCameraClose} />
    </Screen>
  );
}
