export interface Paginated<T> {
  data: T[];
  current_page: number;
  per_page: number;
  total: number;
  last_page: number;
  from: number | null;
  to: number | null;
  next_page_url: string | null;
  prev_page_url: string | null;
}

export interface BranchRef {
  id: number;
  name: string;
  code: string;
}

export interface User {
  id: number;
  employee_id: string;
  name: string;
  email: string;
  is_active: boolean;
  roles: string[];
  employee: {
    id: number;
    first_name: string;
    middle_name: string | null;
    last_name: string;
    full_name: string;
    department: string;
    position: string;
    date_hired: string | null;
    branch: (BranchRef & { latitude: number; longitude: number; radius_meters: number }) | null;
  } | null;
}

export interface LoginResponse {
  message: string;
  token: string;
  user: User;
}

export interface MfaRequiredResponse {
  message: string;
  mfa_required: boolean;
  mfa_setup_required: boolean;
  mfa_token: string;
}

export interface DashboardSummary {
  date: string;
  time_ins_today: number;
  time_ins_yesterday: number;
  late_ins_today: number;
  late_ins_yesterday: number;
  early_time_outs_today: number;
  early_time_outs_yesterday: number;
  absent_today: number;
  absent_yesterday: number;
  open_fraud_flags: number;
  open_fraud_by_severity: { high: number; medium: number; low: number };
}

export type AttendanceType = 'time_in' | 'time_out' | 'break_in' | 'break_out';
export type AttendanceSource = 'online' | 'sync';
export type FraudFlagType =
  | 'gps_spoof'
  | 'impossible_jump'
  | 'face_mismatch'
  | 'rapid_clock'
  | 'out_of_radius'
  | 'no_face';
export type FraudFlagSeverity = 'low' | 'medium' | 'high';
export type FraudFlagStatus = 'open' | 'reviewed' | 'dismissed';

export interface AttendanceAdmin {
  id: number;
  uuid: string;
  type: AttendanceType;
  timestamp: string;
  is_late: boolean;
  is_early_timeout: boolean;
  work_minutes: number | null;
  break_minutes: number | null;
  is_overbreak: boolean;
  source: AttendanceSource;
  is_offline: boolean;
  notes: string | null;
  employee: {
    id: number;
    employee_id: string;
    name: string;
    department: string;
    position: string;
  };
  branch: BranchRef;
  device: { id: number; device_id: string; name: string | null } | null;
  photo: { path: string; is_verified: boolean; liveness_status: string | null } | null;
  gps_location: {
    latitude: number;
    longitude: number;
    accuracy_meters: number | null;
    distance_from_branch_meters: number | null;
    is_within_radius: boolean | null;
  } | null;
  fraud_flags: {
    id: number;
    type: FraudFlagType;
    severity: FraudFlagSeverity;
    status: FraudFlagStatus;
  }[];
  created_at: string;
}

export interface FraudFlag {
  id: number;
  type: FraudFlagType;
  severity: FraudFlagSeverity;
  status: FraudFlagStatus;
  details: Record<string, unknown> | null;
  notes: string | null;
  reviewed_at: string | null;
  reviewer: { id: number; employee_id: string; name: string } | null;
  attendance: {
    id: number;
    type: AttendanceType;
    timestamp: string;
    is_late: boolean;
    work_minutes: number | null;
    source: AttendanceSource;
    is_offline: boolean;
    branch: string | null;
    employee: { id: number; employee_id: string; name: string; department: string } | null;
    photo: { path: string | null; is_verified: boolean | null; liveness_status: string | null } | null;
    gps_location: {
      is_within_radius: boolean | null;
      distance_from_branch_meters: number | null;
      latitude: number | null;
      longitude: number | null;
    } | null;
  };
  created_at: string;
}

export interface Employee {
  id: number;
  user_id: number;
  employee_id: string;
  email: string;
  full_name: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  department: string;
  position: string;
  date_hired: string | null;
  is_active: boolean;
  roles: string[] | null;
  branch: BranchRef | null;
  active_device: {
    id: number;
    device_id: string;
    name: string | null;
    is_shared: boolean;
  } | null;
  reference_photo_path: string | null;
}

export interface Branch {
  id: number;
  name: string;
  code: string;
  address: string | null;
  latitude: number;
  longitude: number;
  radius_meters: number;
  is_active: boolean;
  employee_count: number;
  created_at?: string;
  updated_at?: string;
}

export interface Shift {
  id: number;
  name: string;
  start_time: string;
  end_time: string;
  grace_minutes: number | null;
  break_start: string | null;
  break_end: string | null;
  is_active: boolean;
}

export interface AppSettings {
  breaks_enabled: boolean;
}

export interface ScheduleAdmin {
  id: number;
  date: string;
  employee: { id: number; employee_id: string; name: string; department: string; branch_id: number };
  shift: { id: number; name: string; start_time: string; end_time: string; grace_minutes: number | null };
}

export interface AuditLog {
  id: number;
  action: string;
  model_type: string | null;
  model_id: number | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  actor: { id: number; employee_id: string; name: string } | null;
  created_at: string;
}
