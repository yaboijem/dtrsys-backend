import { useCallback, useEffect, useRef, useState } from 'react';

import { MapPin } from 'lucide-react';

import { ApiError } from '../api/client';
import { Attendance, BreakKind, Paginated, PunchType, GpsOutOfRangeDetails } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { PunchControl } from '../components/PunchControl';
import { CameraModal } from '../components/CameraModal';
import { Avatar, SectionCard, Tag } from '../components/Feedback';
import { Screen } from '../components/Screen';
import { Stamp } from '../components/Stamp';
import {
  distanceLabel,
  errorMessage,
  formatDateTime,
  formatTime,
  minutesToDuration,
  newUuid,
  toLocalDate,
} from '../lib/format';
import { gpsFailureMessage, resolveGpsPosition } from '../lib/location';
import { compressDataUrl, dataUrlToFile } from '../lib/image';
import { coerceAttendance, derivePunchControl, mergeServerAttendance, upsertAttendance } from '../lib/punchPolicy';
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

function shouldQueueOffline(err: unknown): boolean {
  if (!(err instanceof ApiError)) return false;
  if (err.code === 'network_error') return true;
  return [429, 502, 503, 504].includes(err.status);
}

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

  const [todayPunches, setTodayPunches] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [punching, setPunching] = useState(false);
  const [cameraVisible, setCameraVisible] = useState(false);
  const [result, setResult] = useState<PunchResult | null>(null);
  const [pendingCoords, setPendingCoords] = useState<{ latitude: number; longitude: number; accuracy: number | null } | null>(null);
  const [gpsHint, setGpsHint] = useState<'unknown' | 'ok' | 'bad'>('unknown');
  const [breaksEnabled, setBreaksEnabled] = useState<boolean>(() => readCachedBreaksEnabled());
  const punchBusyRef = useRef(false);
  const loadGenRef = useRef(0);
  const pendingPunchTypeRef = useRef<'time_in' | 'time_out'>('time_in');

  const todayKey = toLocalDate(new Date());
  const todaysPunches = todayPunches.filter((p) => toLocalDate(new Date(p.timestamp)) === todayKey);
  const punchControl = derivePunchControl(todayPunches, breaksEnabled);
  const isOpen = punchControl.mode !== 'time_in';
  const onBreak = punchControl.mode === 'on_break';
  const [punchNow, setPunchNow] = useState(() => Date.now());

  const workPunches = todayPunches.filter((p) => p.type === 'time_in' || p.type === 'time_out');
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
      const today = toLocalDate(new Date());
      // Include yesterday so overnight open sessions still flip Time Out.
      const historyFrom = toLocalDate(new Date(Date.now() - 86400000));
      await Promise.all([
        api
          .get<Paginated<Attendance>>(
            '/api/attendance/history',
            { from: historyFrom, to: today, per_page: 50 },
            token,
          )
          .then((res) => {
            if (gen !== loadGenRef.current) return;
            // Newest-first API page → chronological for open-session derivation.
            const sorted = [...res.data].sort(
              (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
            );
            // Keep just-applied punches if history is empty/stale for a moment.
            setTodayPunches((prev) => mergeServerAttendance(sorted, prev));
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

  useEffect(() => {
    void loadToday();
    refreshUnread();
  }, [loadToday, refreshUnread]);

  const submitPunch = async (
    uri: string,
    type: 'time_in' | 'time_out',
    coords: { latitude: number; longitude: number; accuracy: number | null },
  ) => {
    setResult(null);
    setPunching(true);
    punchBusyRef.current = true;
    const clientUuid = newUuid();
    // Compress before live upload or offline enqueue to cut upload/CPU cost.
    const compressedUri = await compressDataUrl(uri);
    try {
      const form = new FormData();
      // Convert base64 data URL to File for FormData
      const selfieFile = dataUrlToFile(compressedUri, 'selfie.jpg');
      if (!selfieFile) {
        setResult({
          kind: 'error',
          title: 'Photo unavailable',
          detail: 'The captured selfie could not be read. Tap the button again to retake it.',
        });
        return;
      }
      form.append('selfie', selfieFile);
      form.append('latitude', String(coords.latitude));
      form.append('longitude', String(coords.longitude));
      if (coords.accuracy !== null && Number.isFinite(coords.accuracy)) {
        form.append('accuracy_meters', String(coords.accuracy));
      }
      form.append('device_id', deviceId);
      form.append('client_uuid', clientUuid);

      const res = await api.postForm<{ data: Attendance }>(
        `/api/attendance/${type === 'time_in' ? 'time-in' : 'time-out'}`,
        form,
        token,
      );
      // Always flip from request type + uuid so a partial payload cannot leave the button stuck.
      const attendance = coerceAttendance(res?.data, { type, uuid: clientUuid });
      setTodayPunches((prev) => upsertAttendance(prev, attendance));

      const distance = attendance.gps_location?.distance_from_branch_meters;
      setResult({
        kind: 'success',
        title: type === 'time_in' ? 'Clocked in' : 'Clocked out',
        detail: [
          formatDateTime(attendance.timestamp),
          attendance.is_late ? 'Late (past grace period)' : 'On time',
          distance !== null && distance !== undefined ? `Distance from branch: ${distanceLabel(distance)}` : '',
          type === 'time_out' && attendance.work_minutes !== null
            ? `Work duration: ${minutesToDuration(attendance.work_minutes)}`
            : '',
        ]
          .filter(Boolean)
          .join('\n'),
      });
      // Background refresh only — button already reflects the punch.
      void loadToday();
      refreshUnread();
    } catch (err) {
      if (shouldQueueOffline(err)) {
        setResult({
          kind: 'error',
          title: 'Punch failed',
          detail: 'Connect to the internet and try again.',
        });
      } else if (err instanceof ApiError) {
        if (err.code === 'gps_out_of_range') {
          const details = (err.details ?? {}) as GpsOutOfRangeDetails;
          const target = details.verified_against_type === 'home_location' ? 'home' : 'branch';
          setResult({
            kind: 'error',
            title: 'Outside GPS radius',
            detail: `${err.message}${details.distance_meters !== undefined ? ` (${distanceLabel(details.distance_meters)} from ${target})` : ''}`,
          });
        } else if (err.code === 'home_location_required') {
          setResult({
            kind: 'error',
            title: 'Home location required',
            detail: 'Go to More → Home location and submit your home pin for HR approval.',
          });
        } else if (err.code === 'home_location_pending') {
          setResult({
            kind: 'error',
            title: 'Home location pending',
            detail: 'Your home pin is waiting for HR approval. You cannot punch until it is approved.',
          });
        } else if (err.code === 'attendance_conflict') {
          setResult({ kind: 'error', title: 'Conflict', detail: err.message });
          // Server is source of truth — resync button state after conflict/spam.
          await loadToday();
        } else if (err.code === 'unauthenticated') {
          setResult({ kind: 'error', title: 'Session expired', detail: 'Log in again.' });
        } else {
          setResult({ kind: 'error', title: 'Punch failed', detail: errorMessage(err) });
        }
      } else {
        setResult({ kind: 'error', title: 'Punch failed', detail: errorMessage(err) });
      }
    } finally {
      setPunching(false);
      punchBusyRef.current = false;
    }
  };

  const handlePunchPress = async (type: 'time_in' | 'time_out') => {
    if (punchBusyRef.current || punching || cameraVisible) {
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
    if (punchBusyRef.current || punching) return;
    setResult(null);
    setPunching(true);
    punchBusyRef.current = true;
    const breakType: PunchType = kind ? 'break_in' : 'break_out';
    const clientUuid = newUuid();
    let coords: { latitude: number; longitude: number; accuracy: number | null } | null = null;
    try {
      const gps = await resolveGpsPosition();
      if (gps.status !== 'ok') {
        setGpsHint('bad');
        setResult({ kind: 'error', title: 'Location needed', detail: gpsFailureMessage(gps.status) });
        return;
      }
      setGpsHint('ok');
      coords = gps.position;
      const path = kind ? '/api/attendance/break-in' : '/api/attendance/break-out';
      const res = await api.post<{ data: Attendance }>(
        path,
        {
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy_meters: coords.accuracy,
          device_id: deviceId ?? undefined,
          client_uuid: clientUuid,
          ...(kind ? { break_kind: kind } : {}),
        },
        token,
      );
      const attendance = coerceAttendance(res?.data, { type: breakType, uuid: clientUuid });
      setTodayPunches((prev) => upsertAttendance(prev, attendance));
      setResult({
        kind: 'success',
        title: kind ? 'Break started' : 'Break ended',
        detail: kind
          ? 'GPS verified.'
          : attendance.break_minutes != null
            ? `Break lasted ${attendance.break_minutes} min${attendance.is_overbreak ? ' (overbreak)' : ''}.`
            : undefined,
      });
      void loadToday();
      refreshUnread();
    } catch (err) {
      if (shouldQueueOffline(err)) {
        setResult({
          kind: 'error',
          title: 'Punch failed',
          detail: 'Connect to the internet and try again.',
        });
      } else if (err instanceof ApiError) {
        if (err.code === 'gps_out_of_range') {
          const d = (err.details ?? {}) as GpsOutOfRangeDetails;
          const target = d.verified_against_type === 'home_location' ? 'home' : 'branch';
          setResult({
            kind: 'error',
            title: 'Outside GPS radius',
            detail: `${err.message}${d.distance_meters !== undefined ? ` (${distanceLabel(d.distance_meters)} from ${target})` : ''}`,
          });
        } else if (err.code === 'home_location_required') {
          setResult({
            kind: 'error',
            title: 'Home location required',
            detail: 'Go to More → Home location and submit your home pin for HR approval.',
          });
        } else if (err.code === 'home_location_pending') {
          setResult({
            kind: 'error',
            title: 'Home location pending',
            detail: 'Your home pin is waiting for HR approval.',
          });
        } else if (err.code === 'attendance_conflict') {
          setResult({ kind: 'error', title: 'Conflict', detail: err.message });
          await loadToday();
        } else {
          setResult({ kind: 'error', title: 'Break failed', detail: errorMessage(err) });
        }
      } else {
        setResult({ kind: 'error', title: 'Break failed', detail: errorMessage(err) });
      }
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
          ? 'On Shift'
          : 'Off Shift';

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
                  ? `Clocked in since ${formatTime(lastPunch?.timestamp)}. Selfie required to clock out.`
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
      </div>

      {result ? <Stamp kind={result.kind} title={result.title} detail={result.detail} /> : null}

      {todaysPunches.length > 0 ? (
        <SectionCard title="Today's punches">
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
              <div style={{ flexShrink: 0, minWidth: 48, textAlign: 'right' }}>Duration</div>
            </div>
            {todaysPunches.map((p, idx) => {
              const meta: string[] = [];
              if (p.is_late) meta.push('Late');
              if (p.is_overbreak) meta.push('Overbreak');
              if (p.break_kind) {
                const label = {
                  '15_min': '15 mins break',
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
                    ? `${p.break_minutes}m`
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
                    borderBottom: idx === todaysPunches.length - 1 ? 'none' : `1px solid ${colors.border}`,
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
                    {formatTime(p.timestamp)}
                  </div>
                  <div
                    className="tnum"
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: colors.muted,
                      flexShrink: 0,
                      minWidth: 48,
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
