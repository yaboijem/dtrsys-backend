import type { ReactNode } from 'react';
import {
  Activity,
  AlertTriangle,
  Building2,
  CalendarDays,
  Clock,
  FileText,
  Flag,
  ShieldCheck,
  Smartphone,
  UserCog,
  Users,
  XCircle,
} from 'lucide-react';

interface ActivityDef {
  label: string;
  icon: ReactNode;
  tone: string;
}

const FALLBACK: ActivityDef = { label: 'System activity', icon: <Activity size={15} />, tone: 'bg-slate-100 text-muted' };

const ACTION_DEFS: Record<string, ActivityDef> = {
  'attendance.created': { label: 'punched in', icon: <Clock size={15} />, tone: 'bg-cyan-50 text-primary' },
  'attendance.updated': { label: 'updated attendance', icon: <Clock size={15} />, tone: 'bg-cyan-50 text-primary' },
  'attendance.deleted': { label: 'deleted an attendance record', icon: <XCircle size={15} />, tone: 'bg-red-50 text-danger' },
  'attendance.restored': { label: 'restored an attendance record', icon: <Clock size={15} />, tone: 'bg-cyan-50 text-primary' },
  'device.updated': { label: 'updated a device', icon: <Smartphone size={15} />, tone: 'bg-violet-50 text-violet-700' },
  'device_change_request.reviewed': { label: 'reviewed a device change request', icon: <Smartphone size={15} />, tone: 'bg-violet-50 text-violet-700' },
  'data_request.created': { label: 'submitted a data request', icon: <FileText size={15} />, tone: 'bg-violet-50 text-violet-700' },
  'data_request.reviewed': { label: 'reviewed a data request', icon: <FileText size={15} />, tone: 'bg-violet-50 text-violet-700' },
  'employee.created': { label: 'created an employee', icon: <Users size={15} />, tone: 'bg-emerald-50 text-emerald-700' },
  'employee.updated': { label: 'updated an employee', icon: <UserCog size={15} />, tone: 'bg-emerald-50 text-emerald-700' },
  'employee.deactivated': { label: 'deactivated an employee', icon: <XCircle size={15} />, tone: 'bg-red-50 text-danger' },
  'employee.reference_photo_updated': { label: 'updated a reference photo', icon: <Users size={15} />, tone: 'bg-emerald-50 text-emerald-700' },
  'branch.created': { label: 'created a branch', icon: <Building2 size={15} />, tone: 'bg-blue-50 text-blue-700' },
  'branch.updated': { label: 'updated a branch', icon: <Building2 size={15} />, tone: 'bg-blue-50 text-blue-700' },
  'branch.deleted': { label: 'deleted a branch', icon: <AlertTriangle size={15} />, tone: 'bg-red-50 text-danger' },
  'shift.created': { label: 'created a shift', icon: <Clock size={15} />, tone: 'bg-blue-50 text-blue-700' },
  'shift.updated': { label: 'updated a shift', icon: <Clock size={15} />, tone: 'bg-blue-50 text-blue-700' },
  'shift.deleted': { label: 'deleted a shift', icon: <AlertTriangle size={15} />, tone: 'bg-red-50 text-danger' },
  'schedule.created': { label: 'created a schedule', icon: <CalendarDays size={15} />, tone: 'bg-blue-50 text-blue-700' },
  'schedule.updated': { label: 'updated a schedule', icon: <CalendarDays size={15} />, tone: 'bg-blue-50 text-blue-700' },
  'schedule.deleted': { label: 'deleted a schedule', icon: <AlertTriangle size={15} />, tone: 'bg-red-50 text-danger' },
  'fraud_flag.reviewed': { label: 'reviewed a fraud flag', icon: <Flag size={15} />, tone: 'bg-red-50 text-danger' },
  'mfa.enabled': { label: 'enabled two-factor authentication', icon: <ShieldCheck size={15} />, tone: 'bg-emerald-50 text-emerald-700' },
  'mfa.disabled': { label: 'disabled two-factor authentication', icon: <ShieldCheck size={15} />, tone: 'bg-amber-50 text-warning' },
};

export function activityDef(action: string | null | undefined): ActivityDef {
  if (!action) return FALLBACK;
  return ACTION_DEFS[action] ?? FALLBACK;
}
