export function newUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function toLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) {
    return '—';
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) {
    return '—';
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) {
    return '—';
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function formatClockTime(time: string | null | undefined): string {
  if (!time) {
    return '—';
  }
  const match = /^(\d{1,2}):(\d{2})/.exec(time);
  if (!match) {
    return time;
  }
  let hours = Number(match[1]);
  const minutes = match[2];
  const suffix = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  if (hours === 0) {
    hours = 12;
  }
  return `${hours}:${minutes} ${suffix}`;
}

export function minutesToDuration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) {
    return '—';
  }
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) {
    return `${m}m`;
  }
  return `${h}h ${m}m`;
}

export function distanceLabel(meters: number | null | undefined): string {
  if (meters === null || meters === undefined) {
    return '—';
  }
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(2)} km`;
  }
  return `${Math.round(meters)} m`;
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return 'Something went wrong.';
}

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const diffSec = Math.round((date.getTime() - Date.now()) / 1000);
  const abs = Math.abs(diffSec);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  if (abs < 60) return rtf.format(diffSec, 'second');
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour');
  if (abs < 86400 * 7) return rtf.format(Math.round(diffSec / 86400), 'day');
  return formatDateTime(iso);
}

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function parseClockToToday(time: string | null | undefined): Date | null {
  if (!time) return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(time);
  if (!match) return null;
  const now = new Date();
  const out = new Date(now);
  out.setHours(Number(match[1]), Number(match[2]), 0, 0);
  return out;
}

export function shiftProgress(start: string | null | undefined, end: string | null | undefined): number {
  const s = parseClockToToday(start);
  const e = parseClockToToday(end);
  if (!s || !e) return 0;
  let endMs = e.getTime();
  if (endMs <= s.getTime()) endMs += 86400000;
  const now = Date.now();
  if (now <= s.getTime()) return 0;
  if (now >= endMs) return 100;
  return Math.round(((now - s.getTime()) / (endMs - s.getTime())) * 100);
}

export type ShiftSkyKind = 'sun' | 'mid' | 'night';

/** Classify shift sky from start/end clock times (overnight → night). */
export function shiftSkyKind(
  start: string | null | undefined,
  end: string | null | undefined,
): ShiftSkyKind {
  const match = start ? /^(\d{1,2}):(\d{2})/.exec(start) : null;
  if (!match) {
    return 'mid';
  }
  const startHour = Number(match[1]);
  const endMatch = end ? /^(\d{1,2}):(\d{2})/.exec(end) : null;
  const endHour = endMatch ? Number(endMatch[1]) : null;
  // Overnight shift (e.g. 22:00–06:00)
  if (endHour != null && endHour <= startHour) {
    return 'night';
  }
  if (startHour >= 5 && startHour < 11) {
    return 'sun';
  }
  if (startHour >= 11 && startHour < 17) {
    return 'mid';
  }
  return 'night';
}

export function shiftSkyStyle(kind: ShiftSkyKind): {
  background: string;
  border: string;
  labelColor: string;
  valueColor: string;
  iconColor: string;
} {
  switch (kind) {
    case 'sun':
      return {
        background: 'linear-gradient(145deg, #7dd3fc 0%, #bae6fd 42%, #fde68a 100%)',
        border: '1px solid rgba(14, 165, 233, 0.35)',
        labelColor: '#0c4a6e',
        valueColor: '#0f172a',
        iconColor: '#ea580c',
      };
    case 'mid':
      return {
        background: 'linear-gradient(145deg, #fb923c 0%, #fdba74 40%, #fed7aa 72%, #ffedd5 100%)',
        border: '1px solid rgba(234, 88, 12, 0.35)',
        labelColor: '#9a3412',
        valueColor: '#0f172a',
        iconColor: '#ea580c',
      };
    case 'night':
      return {
        background: 'linear-gradient(145deg, #0f172a 0%, #1e3a5f 55%, #312e81 100%)',
        border: '1px solid rgba(148, 163, 184, 0.25)',
        labelColor: '#cbd5e1',
        valueColor: '#f8fafc',
        iconColor: '#fde68a',
      };
  }
}

