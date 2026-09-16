import { STORAGE_KEYS } from '../config';
import { compressDataUrl } from './image';

export const PROFILE_PHOTO_EVENT = 'dtr:profile-photo';

const MAX_EDGE = 384;
const QUALITY = 0.8;

export function profilePhotoKey(employeeId: string): string {
  return `${STORAGE_KEYS.profilePhotoPrefix}${employeeId}`;
}

export function getProfilePhoto(employeeId: string): string | null {
  if (!employeeId) return null;
  try {
    const value = localStorage.getItem(profilePhotoKey(employeeId));
    if (!value || !value.startsWith('data:image/')) return null;
    return value;
  } catch {
    return null;
  }
}

function notify(employeeId: string): void {
  try {
    window.dispatchEvent(new CustomEvent(PROFILE_PHOTO_EVENT, { detail: { employeeId } }));
  } catch {
    // ignore
  }
}

export function setProfilePhoto(employeeId: string, dataUrl: string): void {
  if (!employeeId) throw new Error('employee_id_required');
  if (!dataUrl.startsWith('data:image/')) throw new Error('invalid_image');
  localStorage.setItem(profilePhotoKey(employeeId), dataUrl);
  notify(employeeId);
}

export function removeProfilePhoto(employeeId: string): void {
  if (!employeeId) return;
  try {
    localStorage.removeItem(profilePhotoKey(employeeId));
  } catch {
    // ignore
  }
  notify(employeeId);
}

export async function fileToProfilePhotoDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('not_an_image');
  }
  const dataUrl = await readFileAsDataUrl(file);
  const compressed = await compressDataUrl(dataUrl, MAX_EDGE, QUALITY);
  if (!compressed.startsWith('data:image/')) {
    throw new Error('image_decode_failed');
  }
  return compressed;
}

/** Save an already-cropped JPEG/PNG data URL (re-compress if needed). */
export async function normalizeProfilePhotoDataUrl(dataUrl: string): Promise<string> {
  if (!dataUrl.startsWith('data:image/')) {
    throw new Error('invalid_image');
  }
  const compressed = await compressDataUrl(dataUrl, MAX_EDGE, QUALITY);
  if (!compressed.startsWith('data:image/')) {
    throw new Error('image_decode_failed');
  }
  return compressed;
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') resolve(result);
      else reject(new Error('read_failed'));
    };
    reader.onerror = () => reject(new Error('read_failed'));
    reader.readAsDataURL(file);
  });
}

export function subscribeProfilePhoto(listener: () => void): () => void {
  const onCustom = () => listener();
  const onStorage = (e: StorageEvent) => {
    if (e.key && e.key.startsWith(STORAGE_KEYS.profilePhotoPrefix)) listener();
  };
  window.addEventListener(PROFILE_PHOTO_EVENT, onCustom);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(PROFILE_PHOTO_EVENT, onCustom);
    window.removeEventListener('storage', onStorage);
  };
}
