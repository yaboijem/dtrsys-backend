import type { FraudFlagSeverity, FraudFlagStatus, FraudFlagType } from '../api/types';

export const FLAG_LABELS: Record<FraudFlagType, string> = {
  impossible_jump: 'Impossible travel',
  rapid_clock: 'Rapid clock in/out',
  out_of_radius: 'Out of radius',
  // legacy (no longer generated; kept so old rows still have a label)
  gps_spoof: 'GPS spoofing',
  face_mismatch: 'Face mismatch',
  no_face: 'No face detected',
};

export const FLAG_FILTER_TYPES: FraudFlagType[] = [
  'impossible_jump',
  'rapid_clock',
  'out_of_radius',
];

export const FLAG_RULES: { type: FraudFlagType; rule: string }[] = [
  {
    type: 'out_of_radius',
    rule: 'The punch is outside both the branch geofence and the approved home geofence. The allowed radius includes GPS accuracy.',
  },
  {
    type: 'impossible_jump',
    rule: 'Travel from the previous GPS point is faster than 120 km/h.',
  },
  {
    type: 'rapid_clock',
    rule: 'The same punch type was recorded again within 1 minute.',
  },
];

export const FLAG_TONES: Record<FraudFlagType, 'red' | 'amber' | 'violet' | 'blue' | 'gray'> = {
  gps_spoof: 'red',
  impossible_jump: 'violet',
  rapid_clock: 'amber',
  out_of_radius: 'amber',
  face_mismatch: 'red',
  no_face: 'red',
};

export const SEVERITY_TONES: Record<FraudFlagSeverity, 'red' | 'amber' | 'gray' | 'solidRed' | 'solidAmber' | 'solidGray'> = {
  high: 'solidRed',
  medium: 'solidAmber',
  low: 'solidGray',
};

export const STATUS_TONES: Record<FraudFlagStatus, 'amber' | 'green' | 'gray'> = {
  open: 'amber',
  reviewed: 'green',
  dismissed: 'gray',
};
