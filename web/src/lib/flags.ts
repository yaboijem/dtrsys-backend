import type { FraudFlagSeverity, FraudFlagStatus, FraudFlagType } from '../api/types';

export const FLAG_LABELS: Record<FraudFlagType, string> = {
  gps_spoof: 'GPS spoofing',
  impossible_jump: 'Impossible travel',
  rapid_clock: 'Rapid clock in/out',
  out_of_radius: 'Out of radius',
  // legacy (no longer generated)
  face_mismatch: 'Face mismatch',
  no_face: 'No face detected',
};

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
