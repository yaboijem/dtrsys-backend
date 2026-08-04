export interface Branch {
  id: number;
  name: string;
  code: string;
  latitude: number;
  longitude: number;
  radius_meters: number;
}

export interface EmployeeInfo {
  id: number;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  full_name: string;
  department: string | null;
  position: string | null;
  date_hired: string | null;
  branch: Branch | null;
}

export interface User {
  id: number;
  employee_id: string;
  name: string;
  email: string;
  is_active: boolean;
  roles: string[];
  employee: EmployeeInfo | null;
}

export interface GpsLocation {
  latitude: number;
  longitude: number;
  accuracy_meters: number | null;
  distance_from_branch_meters: number | null;
  is_within_radius: boolean;
}

export interface AttendancePhoto {
  path: string;
  is_verified: boolean;
  liveness_status: string;
}

export interface FraudFlag {
  type: string;
  severity: string;
}

export interface Attendance {
  id: number;
  uuid: string;
  type: 'time_in' | 'time_out' | 'break_in' | 'break_out';
  timestamp: string;
  is_offline: boolean;
  is_late: boolean;
  is_early_timeout: boolean;
  work_minutes: number | null;
  break_minutes?: number | null;
  is_overbreak?: boolean;
  source: string | null;
  notes: string | null;
  synced_at: string | null;
  branch?: { id: number; name: string } | null;
  gps_location?: GpsLocation | null;
  photo?: AttendancePhoto | null;
  fraud_flags?: FraudFlag[] | null;
}

export interface Shift {
  id: number;
  name: string;
  start_time: string;
  end_time: string;
  grace_minutes: number;
  break_start: string | null;
  break_end: string | null;
}

export interface Schedule {
  id: number;
  date: string;
  shift: Shift | null;
}

export interface AppNotification {
  id: string;
  title: string | null;
  body: string | null;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

export interface Consent {
  id: number;
  type: 'biometric_photos' | 'gps_location';
  granted: boolean;
  granted_at: string | null;
  revoked_at: string | null;
  updated_at: string | null;
}

export interface Paginated<T> {
  data: T[];
  links: Record<string, string | null>;
  meta: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
  };
}

export interface LoginSuccess {
  token: string;
  user: User;
}

export interface MfaChallenge {
  mfa_required: true;
  mfa_setup_required: boolean;
  mfa_token: string;
}

export type LoginResult = LoginSuccess | MfaChallenge;

export interface MfaStatus {
  mfa_enabled: boolean;
  mfa_required_by_role: boolean;
}

export interface SyncRecordResult {
  index: number;
  status: 'created' | 'duplicate' | 'failed';
  uuid?: string;
  message?: string;
  photo?: {
    present: boolean;
    is_verified?: boolean;
    face_detected?: boolean | null;
    flags?: string[];
  };
}

export interface SyncResult {
  message: string;
  synced: number;
  failed: number;
  duplicates: number;
  records: SyncRecordResult[];
}

export type PunchType = 'time_in' | 'time_out' | 'break_in' | 'break_out';

export interface OfflinePunch {
  client_uuid: string;
  type: PunchType;
  timestamp: string;
  latitude: number;
  longitude: number;
  accuracy_meters: number | null;
  notes?: string;
  queued_at: string;
  selfieUri?: string;
  attempts?: number;
  last_error?: string;
}

export interface GpsOutOfRangeDetails {
  distance_meters?: number;
  branch_latitude?: number;
  branch_longitude?: number;
  radius_meters?: number;
}
