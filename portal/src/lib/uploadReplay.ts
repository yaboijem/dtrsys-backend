import { ApiError } from '../api/client';

export const MAX_UPLOAD_SENDS = 3;

export function shouldReplayUpload(err: unknown): boolean {
  if (!(err instanceof ApiError)) return false;
  if (err.code === 'network_error') return true;
  return err.status === 502 || err.status === 503 || err.status === 504;
}
