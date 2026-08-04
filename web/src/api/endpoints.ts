import { api } from './client';
import type {
  AttendanceAdmin,
  AuditLog,
  Branch,
  DashboardSummary,
  Employee,
  FraudFlag,
  LoginResponse,
  MfaRequiredResponse,
  Paginated,
  ScheduleAdmin,
  Shift,
  User,
} from './types';

export interface PaginationParams {
  page?: number;
  per_page?: number;
  [key: string]: string | number | boolean | undefined;
}

interface RawPaginated<T> {
  data: T[];
  meta: {
    current_page: number;
    per_page: number;
    total: number;
    last_page: number;
    from: number | null;
    to: number | null;
  };
  links?: {
    first?: string | null;
    last?: string | null;
    next?: string | null;
    prev?: string | null;
  } | null;
}

function toPaginated<T>(raw: RawPaginated<T>): Paginated<T> {
  return {
    data: raw.data,
    current_page: raw.meta.current_page,
    per_page: raw.meta.per_page,
    total: raw.meta.total,
    last_page: raw.meta.last_page,
    from: raw.meta.from,
    to: raw.meta.to,
    next_page_url: raw.links?.next ?? null,
    prev_page_url: raw.links?.prev ?? null,
  };
}

export function login(employeeId: string, password: string, deviceId?: string): Promise<LoginResponse | MfaRequiredResponse> {
  return api.post<LoginResponse | MfaRequiredResponse>('/api/auth/login', {
    employee_id: employeeId,
    password,
    device_id: deviceId || undefined,
    platform: 'web',
  });
}

export function verifyMfa(mfaToken: string, code?: string, recoveryCode?: string): Promise<LoginResponse> {
  return api.post<LoginResponse>('/api/auth/mfa/verify', {
    mfa_token: mfaToken,
    code,
    recovery_code: recoveryCode || undefined,
  });
}

export function fetchMe(token: string): Promise<User> {
  return api.get<{ data: User }>('/api/auth/me', undefined, token).then((r) => r.data);
}

export function logout(token: string): Promise<void> {
  return api.post<void>('/api/auth/logout', {}, token);
}

export function dashboardSummary(token: string): Promise<DashboardSummary> {
  return api.get<DashboardSummary>('/api/admin/dashboard/summary', undefined, token);
}

export function listAttendance(params: PaginationParams, token: string): Promise<Paginated<AttendanceAdmin>> {
  return api.get<RawPaginated<AttendanceAdmin>>('/api/admin/attendance', params, token).then(toPaginated);
}

export function listFraudFlags(params: PaginationParams, token: string): Promise<Paginated<FraudFlag>> {
  return api.get<RawPaginated<FraudFlag>>('/api/admin/fraud-flags', params, token).then(toPaginated);
}

export function reviewFraudFlag(id: number, status: 'reviewed' | 'dismissed', notes: string | undefined, token: string): Promise<FraudFlag> {
  return api.post<FraudFlag>(`/api/admin/fraud-flags/${id}/review`, { status, notes }, token);
}

export function listEmployees(params: PaginationParams, token: string): Promise<Paginated<Employee>> {
  return api.get<RawPaginated<Employee>>('/api/admin/employees', params, token).then(toPaginated);
}

export interface EmployeePayload {
  employee_id: string;
  name: string;
  email: string;
  password?: string;
  role: string;
  branch_id: number;
  first_name: string;
  middle_name?: string | null;
  last_name: string;
  department: string;
  position: string;
  date_hired?: string | null;
  is_active: boolean;
  device_name?: string | null;
  device_is_shared?: boolean;
}

export function createEmployee(payload: EmployeePayload, token: string): Promise<Employee> {
  return api.post<Employee>('/api/admin/employees', payload, token);
}

export function updateEmployee(id: number, payload: Partial<EmployeePayload>, token: string): Promise<Employee> {
  return api.patch<Employee>(`/api/admin/employees/${id}`, payload, token);
}

export function deactivateEmployee(id: number, token: string): Promise<{ message: string }> {
  return api.delete<{ message: string }>(`/api/admin/employees/${id}`, token);
}

export function uploadReferencePhoto(id: number, file: File, token: string): Promise<Employee> {
  const form = new FormData();
  form.append('photo', file);
  return api.postForm<Employee>(`/api/admin/employees/${id}/reference-photo`, form, token);
}

export function listBranches(params: PaginationParams, token: string): Promise<Paginated<Branch>> {
  return api.get<RawPaginated<Branch>>('/api/admin/branches', params, token).then(toPaginated);
}

export interface BranchPayload {
  name: string;
  code: string;
  address?: string | null;
  latitude: number;
  longitude: number;
  radius_meters: number;
  is_active: boolean;
}

export function createBranch(payload: BranchPayload, token: string): Promise<Branch> {
  return api.post<Branch>('/api/admin/branches', payload, token);
}

export function updateBranch(id: number, payload: Partial<BranchPayload>, token: string): Promise<Branch> {
  return api.patch<Branch>(`/api/admin/branches/${id}`, payload, token);
}

export function deleteBranch(id: number, token: string): Promise<{ message: string }> {
  return api.delete<{ message: string }>(`/api/admin/branches/${id}`, token);
}

export function listShifts(params: PaginationParams, token: string): Promise<Paginated<Shift>> {
  return api.get<RawPaginated<Shift>>('/api/admin/shifts', params, token).then(toPaginated);
}

export interface ShiftPayload {
  name: string;
  start_time: string;
  end_time: string;
  grace_minutes?: number | null;
  break_start?: string | null;
  break_end?: string | null;
  is_active: boolean;
}

export function createShift(payload: ShiftPayload, token: string): Promise<Shift> {
  return api.post<Shift>('/api/admin/shifts', payload, token);
}

export function updateShift(id: number, payload: Partial<ShiftPayload>, token: string): Promise<Shift> {
  return api.patch<Shift>(`/api/admin/shifts/${id}`, payload, token);
}

export function deleteShift(id: number, token: string): Promise<{ message: string }> {
  return api.delete<{ message: string }>(`/api/admin/shifts/${id}`, token);
}

export function listSchedules(params: PaginationParams, token: string): Promise<Paginated<ScheduleAdmin>> {
  return api.get<RawPaginated<ScheduleAdmin>>('/api/admin/schedules', params, token).then(toPaginated);
}

export function createSchedule(payload: { employee_id: number; shift_id: number; date: string }, token: string): Promise<ScheduleAdmin> {
  return api.post<ScheduleAdmin>('/api/admin/schedules', payload, token);
}

export function deleteSchedule(id: number, token: string): Promise<{ message: string }> {
  return api.delete<{ message: string }>(`/api/admin/schedules/${id}`, token);
}

export function listAuditLogs(params: PaginationParams, token: string): Promise<Paginated<AuditLog>> {
  return api.get<RawPaginated<AuditLog>>('/api/admin/audit-logs', params, token).then(toPaginated);
}
