import { useCallback, useEffect, useRef, useState } from 'react';

import { Camera, Clock, Coffee, MapPin, Timer, WifiOff } from 'lucide-react';

import { ApiError } from '../api/client';
import { Attendance, Paginated, PunchType, Schedule, GpsOutOfRangeDetails, OfflinePunch } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/Button';
import { CameraModal } from '../components/CameraModal';
import { Avatar, Banner, SectionCard, Tag } from '../components/Feedback';
import { Screen } from '../components/Screen';
import { Stamp } from '../components/Stamp';
import {
  distanceLabel,
  errorMessage,
  formatClockTime,
  formatDateTime,
  formatTime,
  minutesToDuration,
  newUuid,
  shiftProgress,
  toLocalDate,
} from '../lib/format';
import { gpsFailureMessage, resolveGpsPosition } from '../lib/location';
import { dataUrlToFile, enqueueOfflinePunch, flushOfflineQueue, getOfflineQueue } from '../lib/offlineQueue';
import { useUnread } from '../notifications/UnreadContext';
import { fontSize, spacing, useThemeColors } from '../theme';

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

interface FlushResultView {
  synced: number;
  failed: number;
  duplicates: number;
  faceIssues: number;
}

export function Home() {
  const colors = useThemeColors();
  const { api, token, user, deviceId } = useAuth();
  const { refreshUnread } = useUnread();

  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [scheduleMessage, setScheduleMessage] = useState<string | null>(null);
  const [todayPunches, setTodayPunches] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [punching, setPunching] = useState(false);
  const [cameraVisible, setCameraVisible] = useState(false);
  const [result, setResult] = useState<PunchResult | null>(null);
  const [pendingCoords, setPendingCoords] = useState<{ latitude: number; longitude: number; accuracy: number | null } | null>(null);
  const [queue, setQueue] = useState<OfflinePunch[]>([]);
  const [syncedLocal, setSyncedLocal] = useState<OfflinePunch[]>([]);
  const [flushing, setFlushing] = useState(false);
  const [flushResult, setFlushResult] = useState<FlushResultView | null>(null);
  const [networkOffline, setNetworkOffline] = useState(!navigator.onLine);
  const [gpsHint, setGpsHint] = useState<'unknown' | 'ok' | 'bad'>('unknown');
  const [breakTick, setBreakTick] = useState(0);
  const flushBusyRef = useRef(false);

  const toLocalAttendance = (p: OfflinePunch, source: 'local_queue' | 'local_queue_synced'): Attendance => ({
    id: -1,
    uuid: p.client_uuid,
    type: p.type,
    timestamp: p.timestamp,
    is_offline: true,
    is_late: false,
    is_early_timeout: false,
    work_minutes: null,
    break_minutes: null,
    is_overbreak: false,
    source,
    notes: null,
    synced_at: null,
  });

  const serverUuids = new Set(todayPunches.map((p) => p.uuid).filter(Boolean));
  const syncedUuids = new Set(syncedLocal.map((p) => p.client_uuid));
  const queueUuids = new Set(queue.map((p) => p.client_uuid));
  const localPunches = [...queue.filter((p) => !syncedUuids.has(p.client_uuid)), ...syncedLocal]
    .filter((p) => !serverUuids.has(p.client_uuid))
    .map((p) => toLocalAttendance(p, queueUuids.has(p.client_uuid) ? 'local_queue' : 'local_queue_synced'));
  const effectivePunches: Attendance[] = [...todayPunches, ...localPunches].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  const workPunches = effectivePunches.filter((p) => p.type === 'time_in' || p.type === 'time_out');
  const lastWork = workPunches[workPunches.length - 1] ?? null;
  const isOpen = lastWork?.type === 'time_in';
  const lastPunch = lastWork;

  let onBreak = false;
  let breakUsed = false;
  let openBreakStartedAt: string | null = null;
  if (isOpen && lastWork) {
    let openBreak: Attendance | null = null;
    for (const p of effectivePunches) {
      if (new Date(p.timestamp).getTime() < new Date(lastWork.timestamp).getTime()) continue;
      if (p.type === 'break_in') openBreak = p;
      if (p.type === 'break_out' && openBreak) {
        breakUsed = true;
        openBreak = null;
      }
    }
    if (openBreak) {
      onBreak = true;
      openBreakStartedAt = openBreak.timestamp;
    }
  }

  useEffect(() => {
    if (!onBreak) return;
    const id = window.setInterval(() => setBreakTick((t) => t + 1), 30_000);
    return () => window.clearInterval(id);
  }, [onBreak]);
  void breakTick;
  const breakElapsedMin = openBreakStartedAt
    ? Math.max(0, Math.floor((Date.now() - new Date(openBreakStartedAt).getTime()) / 60000))
    : 0;

  const loadToday = useCallback(async (): Promise<boolean> => {
    if (!token) {
      return false;
    }
    let historyOk = false;
    try {
      const today = toLocalDate(new Date());
      await Promise.all([
        api
          .get<{ data: Schedule }>('/api/schedule/today', undefined, token)
          .then((s) => {
            setSchedule(s.data);
            setScheduleMessage(null);
          })
          .catch((err: unknown) => {
            setSchedule(null);
            if (err instanceof ApiError && err.code === 'no_schedule') {
              setScheduleMessage('No schedule assigned for today.');
            } else {
              setScheduleMessage(errorMessage(err));
            }
          }),
        api
          .get<Paginated<Attendance>>(
            '/api/attendance/history',
            { from: today, to: today, per_page: 10 },
            token,
          )
          .then((res) => {
            setTodayPunches(res.data);
            historyOk = true;
          })
          .catch(() => {
            // keep previous data so queued punches remain visible
          }),
      ]);
    } catch {
      // individual fetches already surface errors
    } finally {
      setLoading(false);
    }
    return historyOk;
  }, [api, token]);

  const runFlush = useCallback(async () => {
    if (flushBusyRef.current) {
      return;
    }
    flushBusyRef.current = true;
    setFlushing(true);
    setFlushResult(null);
    try {
      const res = await flushOfflineQueue(api, token, deviceId);
      if (res.hadQueue) {
        setFlushResult({
          synced: res.synced,
          failed: res.failed,
          duplicates: res.duplicates,
          faceIssues: res.faceIssues,
        });
        if (res.syncedItems.length > 0) {
          setSyncedLocal((prev) => [...prev, ...res.syncedItems]);
        }
      }
      setQueue(await getOfflineQueue());
      const ok = await loadToday();
      if (ok) {
        setSyncedLocal([]);
      }
    } catch {
      // still offline / HTTP error — reload queue so UI reflects retained items
      setQueue(await getOfflineQueue());
    } finally {
      flushBusyRef.current = false;
      setFlushing(false);
    }
  }, [api, token, loadToday]);

  useEffect(() => {
    const handleOnline = () => {
      setNetworkOffline(false);
      void runFlush();
    };
    const handleOffline = () => {
      setNetworkOffline(true);
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [runFlush]);

  useEffect(() => {
    getOfflineQueue().then((q) => {
      if (!flushBusyRef.current) {
        setQueue(q);
      }
    });
    void loadToday().then((ok) => {
      if (ok) {
        setSyncedLocal([]);
      }
    });
    void runFlush();
    refreshUnread();
  }, [loadToday, runFlush, refreshUnread]);

  const submitPunch = async (
    uri: string,
    type: 'time_in' | 'time_out',
    coords: { latitude: number; longitude: number; accuracy: number | null },
  ) => {
    setResult(null);
    setPunching(true);
    const clientUuid = newUuid();
    try {
      const form = new FormData();
      // Convert base64 data URL to File for FormData
      const selfieFile = dataUrlToFile(uri, 'selfie.jpg');
      if (!selfieFile) {
        setResult({
          kind: 'error',
          title: 'Photo unavailable',
          detail: 'The captured selfie could not be read. Tap the button again to retake it.',
        });
        setPunching(false);
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
      const attendance = res.data;

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
      await loadToday();
      refreshUnread();
      void runFlush();
    } catch (err) {
      if (shouldQueueOffline(err)) {
        const queued = await enqueueOfflinePunch(type, coords, uri, clientUuid);
        setQueue(queued);
        setResult({
          kind: 'success',
          title: 'Queued offline',
          detail: `${type === 'time_in' ? 'Clock-in' : 'Clock-out'} recorded locally at ${formatDateTime(new Date().toISOString())}.\nNo face verification was possible offline.\nQueued offline — will sync when you're back online.`,
        });
        await loadToday();
      } else if (err instanceof ApiError) {
        if (err.code === 'gps_out_of_range') {
          const details = (err.details ?? {}) as GpsOutOfRangeDetails;
          setResult({
            kind: 'error',
            title: 'Outside GPS radius',
            detail: `${err.message}${details.distance_meters !== undefined ? ` (${distanceLabel(details.distance_meters)} from branch)` : ''}`,
          });
        } else if (err.code === 'attendance_conflict') {
          setResult({ kind: 'error', title: 'Conflict', detail: err.message });
          await loadToday();
        } else if (err.code === 'face_verification_failed') {
          setResult({ kind: 'error', title: 'Face verification failed', detail: 'Retake your selfie with better lighting and look directly at the camera.' });
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
    }
  };

  const handlePunchPress = async () => {
    if (onBreak) {
      setResult({ kind: 'error', title: 'On break', detail: 'End your break before clocking out.' });
      return;
    }
    setResult(null);
    setPunching(true);
    try {
      const gps = await resolveGpsPosition();
      if (gps.status !== 'ok') {
        setGpsHint('bad');
        setResult({
          kind: 'error',
          title: 'Location needed',
          detail: gpsFailureMessage(gps.status),
        });
        return;
      }
      setGpsHint('ok');
      setPendingCoords(gps.position);
      setCameraVisible(true);
    } catch {
      setGpsHint('bad');
      setResult({
        kind: 'error',
        title: 'Location needed',
        detail: gpsFailureMessage('unavailable'),
      });
    } finally {
      setPunching(false);
    }
  };

  const handleBreakPress = async () => {
    if (!token || !isOpen) return;
    setResult(null);
    setPunching(true);
    const breakType: PunchType = onBreak ? 'break_out' : 'break_in';
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
      const path = onBreak ? '/api/attendance/break-out' : '/api/attendance/break-in';
      const res = await api.post<{ data: Attendance }>(
        path,
        {
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy_meters: coords.accuracy,
          device_id: deviceId ?? undefined,
          client_uuid: clientUuid,
        },
        token,
      );
      setResult({
        kind: 'success',
        title: onBreak ? 'Break ended' : 'Break started',
        detail: onBreak
          ? res.data.break_minutes != null
            ? `Break lasted ${res.data.break_minutes} min${res.data.is_overbreak ? ' (overbreak)' : ''}.`
            : undefined
          : 'GPS verified. Remember to Break Out within 1 hour.',
      });
      await loadToday();
      refreshUnread();
      void runFlush();
    } catch (err) {
      if (shouldQueueOffline(err) && coords) {
        const queued = await enqueueOfflinePunch(breakType, coords, null, clientUuid);
        setQueue(queued);
        setResult({
          kind: 'success',
          title: 'Queued offline',
          detail: `${breakType === 'break_in' ? 'Break in' : 'Break out'} recorded locally at ${formatDateTime(new Date().toISOString())}.\nQueued offline — will sync when you're back online.`,
        });
        await loadToday();
      } else if (err instanceof ApiError) {
        if (err.code === 'gps_out_of_range') {
          const d = (err.details ?? {}) as GpsOutOfRangeDetails;
          setResult({
            kind: 'error',
            title: 'Outside GPS radius',
            detail: `${err.message}${d.distance_meters !== undefined ? ` (${distanceLabel(d.distance_meters)} from branch)` : ''}`,
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
      return;
    }
    void submitPunch(uri, isOpen ? 'time_out' : 'time_in', coords);
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
  const progress = isOpen ? shiftProgress(schedule?.shift?.start_time, schedule?.shift?.end_time) : 0;

  const statusLabel = loading
    ? 'Checking…'
    : networkOffline
      ? 'Offline'
      : onBreak
        ? 'On Break'
        : isOpen
          ? 'On Shift'
          : 'Off Shift';

  const statusTone = loading
    ? colors.muted
    : networkOffline
      ? colors.warningText
      : onBreak
        ? colors.warningText
        : isOpen
          ? colors.successText
          : colors.muted;

  return (
    <Screen>
      <div className="portal-card portal-card-pad" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Avatar name={displayName} size={48} />
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

      {networkOffline ? (
        <Banner
          kind="warning"
          title="You're offline"
          detail={`Punches queue locally and sync when you're back online.${queue.length > 0 ? ` ${queue.length} queued.` : ''}`}
        />
      ) : null}

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
            {networkOffline ? <WifiOff size={18} /> : <MapPin size={18} />}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: fontSize.sm, fontWeight: 700, color: colors.ink }}>
              {networkOffline
                ? 'Network offline'
                : gpsHint === 'ok'
                  ? 'GPS ready'
                  : gpsHint === 'bad'
                    ? 'GPS unavailable'
                    : 'Checking location…'}
            </div>
            <div style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
              {onBreak
                ? `On break for ${breakElapsedMin} min (max 60). GPS check on Break Out.`
                : isOpen
                  ? `Clocked in since ${formatTime(lastPunch?.timestamp)}. Selfie required to clock out.`
                  : 'Location verified against your branch radius on punch.'}
            </div>
          </div>
        </div>

        {onBreak ? (
          <Button
            title="Break Out"
            variant="primary"
            size="large"
            onClick={handleBreakPress}
            loading={punching}
            icon={<Coffee size={18} />}
          />
        ) : (
          <>
            <Button
              title={isOpen ? 'Time Out' : 'Time In'}
              variant={isOpen ? 'danger' : 'success'}
              size="large"
              onClick={handlePunchPress}
              loading={punching}
              icon={<Camera size={18} />}
            />
            {isOpen && !breakUsed ? (
              <Button
                title="Break In"
                variant="secondary"
                onClick={handleBreakPress}
                loading={punching}
                icon={<Coffee size={16} />}
                style={{ marginTop: 10 }}
              />
            ) : null}
          </>
        )}
      </div>

      {result ? <Stamp kind={result.kind} title={result.title} detail={result.detail} /> : null}

      <SectionCard title="Today's schedule">
        {loading ? (
          <div style={{ fontSize: fontSize.sm, color: colors.muted }}>Loading…</div>
        ) : schedule ? (
          <>
            <div className="metric-grid-2">
              {(
                [
                  { icon: <Clock size={14} />, label: 'Shift', value: schedule.shift?.name ?? '—' },
                  {
                    icon: <Timer size={14} />,
                    label: 'Grace',
                    value: schedule.shift?.grace_minutes != null ? `${schedule.shift.grace_minutes} min` : '—',
                  },
                  { icon: <Clock size={14} />, label: 'Start', value: formatClockTime(schedule.shift?.start_time) },
                  { icon: <Clock size={14} />, label: 'End', value: formatClockTime(schedule.shift?.end_time) },
                ] as const
              ).map((m) => (
                <div
                  key={m.label}
                  style={{
                    borderRadius: 12,
                    border: `1px solid ${colors.border}`,
                    padding: '10px 12px',
                    background: 'color-mix(in srgb, var(--muted) 6%, var(--card))',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: colors.muted, fontSize: 11, fontWeight: 700 }}>
                    {m.icon}
                    {m.label}
                  </div>
                  <div className="tnum" style={{ marginTop: 4, fontSize: 14, fontWeight: 700, color: colors.ink }}>
                    {m.value}
                  </div>
                </div>
              ))}
            </div>
            {isOpen && !onBreak ? (
              <div style={{ marginTop: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: colors.muted }}>Shift progress</span>
                  <span className="tnum" style={{ fontSize: 12, fontWeight: 700, color: colors.ink }}>
                    {progress}%
                  </span>
                </div>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${progress}%` }} />
                </div>
              </div>
            ) : null}
            {onBreak ? (
              <div style={{ marginTop: 14, fontSize: 13, fontWeight: 600, color: colors.warningText }}>
                Break elapsed: {breakElapsedMin} / 60 min
                {breakElapsedMin >= 50 ? ' — wrap up soon' : ''}
              </div>
            ) : null}
          </>
        ) : (
          <div style={{ fontSize: fontSize.sm, color: colors.muted }}>{scheduleMessage ?? 'No schedule for today.'}</div>
        )}
      </SectionCard>

      {effectivePunches.length > 0 ? (
        <SectionCard title="Today's punches">
          {effectivePunches.map((p, idx) => (
            <div
              key={p.uuid ?? p.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingTop: spacing.sm,
                paddingBottom: spacing.sm,
                borderBottom: idx === effectivePunches.length - 1 ? 'none' : `1px solid ${colors.border}`,
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                  {punchTypeLabel(p.type)}
                </div>
                <div className="tnum" style={{ fontSize: 18, fontWeight: 800, marginTop: 2, color: colors.ink }}>
                  {formatTime(p.timestamp)}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  {p.is_late ? <Tag label="Late" tone="warning" /> : null}
                  {p.is_overbreak ? <Tag label="Overbreak" tone="danger" /> : null}
                  {p.source === 'local_queue' ? <Tag label="Pending" tone="neutral" /> : null}
                  {p.source !== 'local_queue' && p.is_offline ? <Tag label="Offline" tone="neutral" /> : null}
                  {p.gps_location?.distance_from_branch_meters != null ? (
                    <Tag label={distanceLabel(p.gps_location.distance_from_branch_meters)} tone="neutral" />
                  ) : null}
                </div>
              </div>
              {p.type === 'time_out' && p.work_minutes !== null ? (
                <div className="tnum" style={{ fontSize: 16, fontWeight: 800, marginLeft: spacing.md, color: colors.ink }}>
                  {minutesToDuration(p.work_minutes)}
                </div>
              ) : null}
              {p.type === 'break_out' && p.break_minutes != null ? (
                <div className="tnum" style={{ fontSize: 16, fontWeight: 800, marginLeft: spacing.md, color: colors.ink }}>
                  {p.break_minutes}m
                </div>
              ) : null}
            </div>
          ))}
        </SectionCard>
      ) : null}

      {queue.length > 0 ? (
        <SectionCard title="Offline queue">
          {queue.map((p) => (
            <div
              key={p.client_uuid}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingTop: spacing.sm,
                paddingBottom: spacing.sm,
                borderBottom: `1px solid ${colors.border}`,
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: colors.muted, textTransform: 'uppercase' }}>
                  {punchTypeLabel(p.type)}
                </div>
                <div className="tnum" style={{ fontSize: 18, fontWeight: 800, marginTop: 2, color: colors.ink }}>
                  {formatTime(p.timestamp)}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  <Tag label="Pending sync" tone="neutral" />
                  {p.selfieUri ? <Tag label="Photo attached" tone="neutral" /> : null}
                  {p.attempts && p.attempts > 0 ? <Tag label={`Retry ${p.attempts}`} tone="warning" /> : null}
                </div>
              </div>
            </div>
          ))}
          <Button title="Sync now" variant="secondary" onClick={runFlush} loading={flushing} style={{ marginTop: spacing.md }} />
          {flushResult ? (
            <div style={{ marginTop: spacing.md, fontSize: fontSize.sm, color: colors.ink }}>
              Synced: {flushResult.synced} · Failed: {flushResult.failed} · Duplicates: {flushResult.duplicates}
              {flushResult.faceIssues > 0 ? (
                <div style={{ marginTop: 4, color: colors.dangerText, fontWeight: 600 }}>
                  Face not detected in {flushResult.faceIssues} selfie(s).
                </div>
              ) : null}
            </div>
          ) : null}
        </SectionCard>
      ) : null}

      <CameraModal visible={cameraVisible} onCapture={handleCapture} onClose={() => setCameraVisible(false)} />
    </Screen>
  );
}
