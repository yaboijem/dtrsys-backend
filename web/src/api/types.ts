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
    department_id?: number | null;
    position_id?: number | null;
    department: string | null;
    position: string | null;
    date_hired: string | null;
    branch: (BranchRef & { latitude: number; longitude: number; radius_meters: number }) | null;
  } | null;
}

export interface LoginResponse {
  message: string;
  user: User;
}

export interface DashboardSummary {
  date: string;
  time_ins_today: number;
  time_ins_yesterday: number;
  open_fraud_flags: number;
  open_fraud_by_severity: { high: number; medium: number; low: number };
  employees_total: number;
  on_break: number;
  on_break_by_kind: Record<string, number>;
}

export interface OpenSession {
  employee_id: number;
  employee_code: string | null;
  name: string;
  branch: string | null;
  department: string | null;
  status: 'time_in' | 'on_break';
  time_in_at: string;
  break_kind: string | null;
  break_started_at: string | null;
}

export type AttendanceType = 'time_in' | 'time_out' | 'break_in' | 'break_out';
export type AttendanceSource = 'online' | 'sync';
export type FraudFlagType =
  | 'gps_spoof'
  | 'impossible_jump'
  | 'rapid_clock'
  | 'out_of_radius'
  | 'face_mismatch'
  | 'no_face'
  | 'overbreak';
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
  photo: { path: string } | null;
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
    photo: { path: string | null } | null;
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
  department_id: number | null;
  position_id: number | null;
  department: string | null;
  position: string | null;
  date_hired: string | null;
  is_active: boolean;
  work_arrangement?: 'onsite' | 'wfh' | 'hybrid';
  home_location_status?: 'none' | 'pending' | 'approved';
  roles: string[] | null;
  branch: BranchRef | null;
  active_device: {
    id: number;
    device_id: string;
    name: string | null;
    is_shared: boolean;
  } | null;
}

export interface HomeLocation {
  id: number;
  label: string | null;
  latitude: number;
  longitude: number;
  radius_meters: number;
  address_text: string | null;
  street: string | null;
  city: string | null;
  province: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'retired';
  created_by: number;
  reviewed_by: number | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string | null;
  employees?: Array<{
    id: number;
    full_name: string;
    employee_id: string | null;
    is_primary: boolean;
  }>;
}

export interface Branch {
  id: number;
  name: string;
  code: string;
  address: string | null;
  latitude: number;
  longitude: number;
  radius_meters: number;
  accuracy_ceiling_meters: number;
  accuracy_allowance_meters: number;
  is_active: boolean;
  employee_count: number;
  created_at?: string;
  updated_at?: string;
}

export interface Department {
  id: number;
  name: string;
  employees_count?: number;
  created_at?: string;
}

export interface Position {
  id: number;
  name: string;
  employees_count?: number;
  created_at?: string;
}

export interface AppSettings {
  breaks_enabled: boolean;
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
