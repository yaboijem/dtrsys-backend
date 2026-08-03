import NetInfo from '@react-native-community/netinfo';
import { useFocusEffect } from '@react-navigation/native';
import { File } from 'expo-file-system';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ApiError } from '../api/client';
import { Attendance, Paginated, Schedule, GpsOutOfRangeDetails, OfflinePunch } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { BadgeFace } from '../components/BadgeFace';
import { Button } from '../components/Button';
import { CameraModal } from '../components/CameraModal';
import { Banner, Row, SectionCard, Tag } from '../components/Feedback';
import { GateLamp } from '../components/GateLamp';
import { Screen } from '../components/Screen';
import { Stamp } from '../components/Stamp';
import { distanceLabel, errorMessage, formatDateTime, formatTime, minutesToDuration, toLocalDate } from '../lib/format';
import { photoFileInfo, resolveGpsPosition } from '../lib/location';
import { enqueueOfflinePunch, flushOfflineQueue, getOfflineQueue } from '../lib/offlineQueue';
import { useUnread } from '../notifications/UnreadContext';
import { fontSize, microLabel, spacing, useThemeColors } from '../theme';

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

export function HomeScreen() {
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
  const [networkOffline, setNetworkOffline] = useState(false);
  const flushBusyRef = useRef(false);

  const toLocalAttendance = (p: OfflinePunch, source: 'local_queue' | 'local_queue_synced'): Attendance => ({
    id: -1,
    uuid: p.client_uuid,
    type: p.type,
    timestamp: p.timestamp,
    is_offline: true,
    is_late: false,
    work_minutes: null,
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
  const lastPunch = effectivePunches[effectivePunches.length - 1] ?? null;
  const isOpen = lastPunch?.type === 'time_in';

  const loadToday = useCallback(async (): Promise<boolean> => {
    if (!token) {
      return false;
    }
    let historyOk = false;
    try {
      const today = toLocalDate(new Date());
      await Promise.all([
        api
          .get<Schedule>('/api/schedule/today', undefined, token)
          .then((s) => {
            setSchedule(s);
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
      // still offline — queue retained
    } finally {
      flushBusyRef.current = false;
      setFlushing(false);
    }
  }, [api, token, loadToday]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setNetworkOffline(state.isConnected === false);
      if (state.isConnected === true && state.isInternetReachable !== false) {
        void runFlush();
      }
    });
    return unsubscribe;
  }, [runFlush]);

  useFocusEffect(
    useCallback(() => {
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
    }, [loadToday, runFlush, refreshUnread]),
  );

  const gpsErrorDetail = (): string =>
    'Your location is required to clock in and out. Turn on GPS or location services on this device, then tap Time In/Out again.';

  const submitPunch = async (
    uri: string,
    type: 'time_in' | 'time_out',
    coords: { latitude: number; longitude: number; accuracy: number | null },
  ) => {
    setResult(null);
    setPunching(true);
    try {
      const photoInfo = photoFileInfo(uri);
      if (photoInfo.checkOk && (!photoInfo.exists || photoInfo.size === 0)) {
        setResult({
          kind: 'error',
          title: 'Photo unavailable',
          detail: 'The captured selfie could not be read. Tap the button again to retake it.',
        });
        return;
      }

      const form = new FormData();
      form.append('selfie', new File(uri) as unknown as Blob);
      form.append('latitude', String(coords.latitude));
      form.append('longitude', String(coords.longitude));
      if (coords.accuracy !== null && Number.isFinite(coords.accuracy)) {
        form.append('accuracy_meters', String(coords.accuracy));
      }
      form.append('device_id', deviceId);

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
      if (err instanceof ApiError) {
        if (err.code === 'network_error') {
          const queued = await enqueueOfflinePunch(type, coords, uri);
          setQueue(queued);
          setResult({
            kind: 'success',
            title: 'Queued offline',
            detail: `${type === 'time_in' ? 'Clock-in' : 'Clock-out'} recorded locally at ${formatDateTime(new Date().toISOString())}.\nNo face verification was possible offline.\nYour selfie will be verified when it syncs, and it will sync automatically when you're back online.`,
          });
          await loadToday();
        } else if (err.code === 'gps_out_of_range') {
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
        } else if (err.status === 429) {
          setResult({ kind: 'error', title: 'Too many attempts', detail: 'Wait a minute before punching again.' });
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
    setResult(null);
    setPunching(true);
    try {
      const gps = await resolveGpsPosition();
      if (gps.status !== 'ok') {
        setResult({ kind: 'error', title: 'GPS required', detail: gpsErrorDetail() });
        return;
      }
      setPendingCoords(gps.position);
      setCameraVisible(true);
    } catch {
      setResult({ kind: 'error', title: 'GPS required', detail: gpsErrorDetail() });
    } finally {
      setPunching(false);
    }
  };

  const handleCapture = (uri: string) => {
    setCameraVisible(false);
    const coords = pendingCoords;
    setPendingCoords(null);
    if (!coords) {
      setResult({ kind: 'error', title: 'GPS required', detail: gpsErrorDetail() });
      return;
    }
    void submitPunch(uri, isOpen ? 'time_out' : 'time_in', coords);
  };

  const lampState = loading
    ? { tone: 'muted' as const, label: 'Checking…', sub: undefined as string | undefined }
    : networkOffline
      ? {
          tone: 'warning' as const,
          label: 'Offline',
          sub: `Punches queue locally and sync automatically when the connection returns.${queue.length > 0 ? ` ${queue.length} queued.` : ''}`,
        }
      : isOpen
        ? { tone: 'danger' as const, label: 'Clocked in', sub: `Since ${formatTime(lastPunch.timestamp)}. Ready to clock out.` }
        : { tone: 'success' as const, label: 'Gate open', sub: 'Ready to clock in.' };

  return (
    <Screen>
      <BadgeFace
        name={user?.employee?.full_name ?? user?.name ?? '—'}
        employeeId={user?.employee_id ?? '—'}
        position={user?.employee?.position ?? undefined}
        branch={user?.employee?.branch?.name ?? undefined}
        roles={user?.roles ?? []}
      />

      {networkOffline ? (
        <Banner
          kind="warning"
          title="You're offline"
          detail={`Punches queue locally and sync automatically when the connection returns.${queue.length > 0 ? ` ${queue.length} queued.` : ''}`}
        />
      ) : null}

      <View style={styles.slotArea}>
        <GateLamp tone={lampState.tone} label={lampState.label} sub={lampState.sub} />

        <View style={styles.slot}>
          <Button
            title={isOpen ? 'Time Out' : 'Time In'}
            variant={isOpen ? 'danger' : 'success'}
            size="large"
            onPress={handlePunchPress}
            loading={punching}
          />
        </View>
        <Text style={[styles.hint, { color: colors.muted }]}>
          {isOpen
            ? 'Capture a selfie to clock out. Your location is verified against the branch GPS radius.'
            : 'Capture a selfie to clock in. Your location is verified against the branch GPS radius.'}
        </Text>
      </View>

      {result ? (
        <View style={styles.resultWrap}>
          <Stamp kind={result.kind} title={result.title} detail={result.detail} />
        </View>
      ) : null}

      <SectionCard title="Today's schedule">
        {loading ? (
          <Text style={[styles.muted, { color: colors.muted }]}>Loading…</Text>
        ) : schedule ? (
          <>
            <Row label="Shift" value={schedule.shift?.name ?? 'No shift'} />
            <Row label="Start" value={schedule.shift?.start_time ?? '—'} />
            <Row label="End" value={schedule.shift?.end_time ?? '—'} />
            {schedule.shift?.grace_minutes != null ? (
              <Row label="Grace period" value={`${schedule.shift.grace_minutes} min`} />
            ) : null}
          </>
        ) : (
          <Text style={[styles.muted, { color: colors.muted }]}>{scheduleMessage ?? 'No schedule for today.'}</Text>
        )}
      </SectionCard>

      {effectivePunches.length > 0 ? (
        <SectionCard title="Today's punches">
          {effectivePunches.map((p) => (
            <View key={p.uuid ?? p.id} style={[styles.punchRow, { borderBottomColor: colors.border }]}>
              <View style={styles.punchMeta}>
                <Text style={[microLabel, { color: colors.muted }]}>
                  {p.type === 'time_in' ? 'Time in' : 'Time out'}
                </Text>
                <Text style={[styles.punchTime, { color: colors.ink }]}>{formatTime(p.timestamp)}</Text>
                <View style={styles.punchBadges}>
                  {p.is_late ? <Tag label="late" tone="warning" /> : null}
                  {p.source === 'local_queue' ? <Tag label="pending" tone="neutral" /> : null}
                  {p.source !== 'local_queue' && p.is_offline ? <Tag label="offline" tone="neutral" /> : null}
                  {p.gps_location?.distance_from_branch_meters !== null &&
                  p.gps_location?.distance_from_branch_meters !== undefined ? (
                    <Tag label={distanceLabel(p.gps_location.distance_from_branch_meters)} tone="neutral" />
                  ) : null}
                </View>
              </View>
              {p.type === 'time_out' && p.work_minutes !== null ? (
                <Text style={[styles.workMinutes, { color: colors.ink }]}>{minutesToDuration(p.work_minutes)}</Text>
              ) : null}
            </View>
          ))}
        </SectionCard>
      ) : null}

      {queue.length > 0 ? (
        <SectionCard title="Offline queue">
          {queue.map((p) => (
            <View key={p.client_uuid} style={[styles.punchRow, { borderBottomColor: colors.border }]}>
              <View style={styles.punchMeta}>
                <Text style={[microLabel, { color: colors.muted }]}>{p.type === 'time_in' ? 'Time in' : 'Time out'}</Text>
                <Text style={[styles.punchTime, { color: colors.ink }]}>{formatTime(p.timestamp)}</Text>
                <View style={styles.punchBadges}>
                  <Tag label="pending sync" tone="neutral" />
                  {p.selfieUri ? <Tag label="photo attached" tone="neutral" /> : null}
                </View>
              </View>
            </View>
          ))}
          <Button title="Sync now" variant="secondary" onPress={runFlush} loading={flushing} style={styles.topSpacing} />
          {flushResult ? (
            <View style={styles.syncResult}>
              <Text style={[styles.syncLine, { color: colors.ink }]}>
                Synced: {flushResult.synced} · Failed: {flushResult.failed} · Duplicates: {flushResult.duplicates}
              </Text>
              {flushResult.faceIssues > 0 ? (
                <Text style={[styles.syncLine, { color: colors.dangerText, fontWeight: '600' }]}>
                  Face not detected in {flushResult.faceIssues} selfie(s) — flagged for review.
                </Text>
              ) : null}
            </View>
          ) : null}
        </SectionCard>
      ) : null}

      <CameraModal visible={cameraVisible} onCapture={handleCapture} onClose={() => setCameraVisible(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  slotArea: {
    marginBottom: spacing.md,
  },
  slot: {
    marginTop: spacing.lg,
  },
  hint: {
    fontSize: fontSize.sm,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  muted: {
    fontSize: fontSize.sm,
  },
  resultWrap: {
    marginBottom: spacing.lg,
  },
  topSpacing: {
    marginTop: spacing.md,
  },
  syncResult: {
    marginTop: spacing.md,
  },
  syncLine: {
    fontSize: fontSize.sm,
    paddingVertical: 2,
  },
  punchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  punchMeta: {
    flex: 1,
  },
  punchTime: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    marginTop: 2,
  },
  punchBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  workMinutes: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    marginLeft: spacing.md,
  },
});
