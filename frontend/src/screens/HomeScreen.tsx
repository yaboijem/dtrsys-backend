import { useFocusEffect } from '@react-navigation/native';
import { File } from 'expo-file-system';
import { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { ApiError } from '../api/client';
import { Attendance, Paginated, Schedule, SyncResult, GpsOutOfRangeDetails } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/Button';
import { CameraModal } from '../components/CameraModal';
import { Banner, Row, SectionCard, Tag } from '../components/Feedback';
import { LabeledInput } from '../components/Inputs';
import { Screen } from '../components/Screen';
import { distanceLabel, errorMessage, formatDateTime, formatTime, minutesToDuration, newUuid, toLocalDate } from '../lib/format';
import { getCurrentPosition, photoFileInfo } from '../lib/location';
import { useUnread } from '../notifications/UnreadContext';
import { colors, fontSize, spacing } from '../theme';

interface PunchResult {
  kind: 'success' | 'error';
  title: string;
  detail?: string;
}

export function HomeScreen() {
  const { api, token, user, deviceId } = useAuth();
  const { refreshUnread } = useUnread();

  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [scheduleMessage, setScheduleMessage] = useState<string | null>(null);
  const [todayPunches, setTodayPunches] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [punching, setPunching] = useState(false);
  const [cameraVisible, setCameraVisible] = useState(false);
  const [result, setResult] = useState<PunchResult | null>(null);
  const [gpsMode, setGpsMode] = useState<'auto' | 'manual'>('auto');
  const [gpsNote, setGpsNote] = useState<string | null>(null);
  const [manualLat, setManualLat] = useState('');
  const [manualLng, setManualLng] = useState('');
  const [manualAccuracy, setManualAccuracy] = useState('25');
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);

  const branch = user?.employee?.branch ?? null;
  const isOpen = todayPunches[0]?.type === 'time_in';

  const loadToday = useCallback(async () => {
    if (!token) {
      return;
    }
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
          .then((res) => setTodayPunches(res.data)),
      ]);
    } catch {
      // individual fetches already surface errors
    } finally {
      setLoading(false);
    }
  }, [api, token]);

  useFocusEffect(
    useCallback(() => {
      loadToday();
      refreshUnread();
    }, [loadToday, refreshUnread]),
  );

  const resolveCoordinates = async (): Promise<{ latitude: number; longitude: number; accuracy: number | null } | null> => {
    if (gpsMode === 'manual') {
      const latitude = Number(manualLat);
      const longitude = Number(manualLng);
      if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
        setResult({
          kind: 'error',
          title: 'Invalid coordinates',
          detail: 'Enter valid latitude and longitude, or enable GPS location.',
        });
        return null;
      }
      return { latitude, longitude, accuracy: manualAccuracy ? Number(manualAccuracy) || null : null };
    }

    try {
      const position = await getCurrentPosition();
      if (position) {
        return position;
      }
    } catch {
      // fall through to manual mode
    }

    setGpsMode('manual');
    if (branch) {
      setManualLat(String(branch.latitude));
      setManualLng(String(branch.longitude));
    }
    setGpsNote('GPS unavailable — using manual coordinates. Tap Time In/Out again.');
    return null;
  };

  const submitPunch = async (uri: string, type: 'time_in' | 'time_out') => {
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

      const coords = await resolveCoordinates();
      if (!coords) {
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
    } catch (err) {
      if (err instanceof ApiError) {
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
        } else if (err.status === 429) {
          setResult({ kind: 'error', title: 'Too many attempts', detail: 'Wait a minute before punching again.' });
        } else if (err.code === 'network_error') {
          setResult({
            kind: 'error',
            title: 'Could not reach the server',
            detail: `${err.message}\n\nTap Time In/Out to retry. If this keeps happening, check your Wi-Fi and the server URL in More.`,
          });
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

  const handlePunchPress = () => {
    setGpsNote(null);
    setResult(null);
    setCameraVisible(true);
  };

  const handleCapture = (uri: string) => {
    setCameraVisible(false);
    submitPunch(uri, isOpen ? 'time_out' : 'time_in');
  };

  const handleSyncDemo = async () => {
    setSyncResult(null);
    setSyncing(true);
    try {
      const timestamp = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const lat = branch ? branch.latitude : 14.554729;
      const lng = branch ? branch.longitude : 121.0244452;
      const res = await api.post<SyncResult>(
        '/api/attendance/sync',
        {
          device_id: deviceId,
          records: [
            {
              client_uuid: newUuid(),
              type: 'time_in',
              timestamp,
              latitude: lat,
              longitude: lng,
              accuracy_meters: 25,
              notes: 'Demo offline record',
            },
          ],
        },
        token,
      );
      setSyncResult(res);
      await loadToday();
    } catch (err) {
      Alert.alert('Sync failed', errorMessage(err));
    } finally {
      setSyncing(false);
    }
  };

  const clockedLabel = loading ? 'Checking…' : isOpen ? 'Currently clocked in' : 'Not clocked in yet today';

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.greeting}>Hi, {user?.employee?.full_name ?? user?.name}</Text>
        <View style={styles.tags}>
          {user?.roles?.map((role) => (
            <Tag key={role} label={role} tone={role === 'Employee' ? 'neutral' : 'success'} />
          ))}
        </View>
        <Text style={styles.subtext}>
          {user?.employee_id} · {user?.employee?.branch?.name ?? 'No branch assigned'}
          {user?.employee?.position ? ` · ${user.employee.position}` : ''}
        </Text>
      </View>

      <SectionCard title="Today's schedule">
        {loading ? (
          <Text style={styles.muted}>Loading…</Text>
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
          <Text style={styles.muted}>{scheduleMessage ?? 'No schedule for today.'}</Text>
        )}
      </SectionCard>

      <SectionCard title="Punch">
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, isOpen ? styles.statusDotOpen : styles.statusDotClosed]} />
          <Text style={styles.statusText}>{clockedLabel}</Text>
        </View>

        {gpsNote ? <Banner kind="warning" title="GPS note" detail={gpsNote} /> : null}

        <Button
          title={isOpen ? 'Time Out' : 'Time In'}
          variant={isOpen ? 'danger' : 'success'}
          onPress={handlePunchPress}
          loading={punching}
        />
        <Text style={styles.hint}>
          {isOpen
            ? 'Capture a selfie to clock out. Your location is verified against the branch GPS radius.'
            : 'Capture a selfie to clock in. Your location is verified against the branch GPS radius.'}
        </Text>

        {result ? (
          <View style={[styles.resultBox, result.kind === 'success' ? styles.resultSuccess : styles.resultError]}>
            <Text style={[styles.resultTitle, { color: result.kind === 'success' ? colors.success : colors.danger }]}>
              {result.title}
            </Text>
            {result.detail ? <Text style={styles.resultDetail}>{result.detail}</Text> : null}
          </View>
        ) : null}

        {gpsMode === 'manual' ? (
          <View style={styles.manualBox}>
            <Text style={styles.manualTitle}>Manual coordinates (GPS unavailable)</Text>
            <LabeledInput label="Latitude" value={manualLat} onChangeText={setManualLat} keyboardType="decimal-pad" />
            <LabeledInput label="Longitude" value={manualLng} onChangeText={setManualLng} keyboardType="decimal-pad" />
            <LabeledInput label="Accuracy (m)" value={manualAccuracy} onChangeText={setManualAccuracy} keyboardType="decimal-pad" />
            {branch ? (
              <Button
                title="Use branch coordinates"
                variant="secondary"
                onPress={() => {
                  setManualLat(String(branch.latitude));
                  setManualLng(String(branch.longitude));
                }}
              />
            ) : null}
          </View>
        ) : null}
      </SectionCard>

      <SectionCard title="Offline sync (demo)">
        <Text style={styles.muted}>
          Sends a sample offline time-in record (5 minutes ago) to the server via the sync endpoint.
        </Text>
        <Button title="Run sync demo" variant="secondary" onPress={handleSyncDemo} loading={syncing} style={styles.topSpacing} />
        {syncResult ? (
          <View style={styles.syncResult}>
            <Text style={styles.syncLine}>Synced: {syncResult.synced}</Text>
            <Text style={styles.syncLine}>Failed: {syncResult.failed}</Text>
            <Text style={styles.syncLine}>Duplicates: {syncResult.duplicates}</Text>
          </View>
        ) : null}
      </SectionCard>

      {todayPunches.length > 0 ? (
        <SectionCard title="Today's punches">
          {todayPunches.map((p) => (
            <View key={p.id} style={styles.punchRow}>
              <View style={styles.punchMeta}>
                <Text style={styles.punchTime}>{formatTime(p.timestamp)}</Text>
                <Text style={styles.muted}>
                  {p.type === 'time_in' ? 'Time in' : 'Time out'}
                  {p.is_late ? ' · late' : ''}
                  {p.is_offline ? ' · offline' : ''}
                  {p.gps_location?.distance_from_branch_meters !== undefined && p.gps_location?.distance_from_branch_meters !== null
                    ? ` · ${distanceLabel(p.gps_location.distance_from_branch_meters)} from branch`
                    : ''}
                </Text>
              </View>
              {p.type === 'time_out' && p.work_minutes !== null ? (
                <Text style={styles.workMinutes}>{minutesToDuration(p.work_minutes)}</Text>
              ) : null}
            </View>
          ))}
        </SectionCard>
      ) : null}

      <CameraModal visible={cameraVisible} onCapture={handleCapture} onClose={() => setCameraVisible(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: spacing.lg,
  },
  greeting: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: colors.text,
  },
  tags: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  subtext: {
    fontSize: fontSize.sm,
    color: colors.muted,
    marginTop: spacing.sm,
  },
  muted: {
    fontSize: fontSize.sm,
    color: colors.muted,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: spacing.sm,
  },
  statusDotOpen: {
    backgroundColor: colors.success,
  },
  statusDotClosed: {
    backgroundColor: colors.muted,
  },
  statusText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
  },
  hint: {
    fontSize: fontSize.sm,
    color: colors.muted,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  resultBox: {
    borderRadius: 10,
    borderWidth: 1,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  resultSuccess: {
    backgroundColor: '#f0fdf4',
    borderColor: '#bbf7d0',
  },
  resultError: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  resultTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  resultDetail: {
    fontSize: fontSize.sm,
    color: colors.text,
    marginTop: spacing.xs,
  },
  manualBox: {
    marginTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  manualTitle: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  topSpacing: {
    marginTop: spacing.md,
  },
  syncResult: {
    marginTop: spacing.md,
  },
  syncLine: {
    fontSize: fontSize.sm,
    color: colors.text,
    paddingVertical: 2,
  },
  punchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  punchMeta: {
    flex: 1,
  },
  punchTime: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
  },
  workMinutes: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.primary,
  },
});
