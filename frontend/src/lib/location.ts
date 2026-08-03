import { File } from 'expo-file-system';
import * as Location from 'expo-location';

export interface Position {
  latitude: number;
  longitude: number;
  accuracy: number | null;
}

export interface PhotoInfo {
  exists: boolean;
  size: number;
  checkOk: boolean;
}

export type GpsResult =
  | { status: 'ok'; position: Position }
  | { status: 'denied' }
  | { status: 'disabled' }
  | { status: 'unavailable' };

const GPS_TIMEOUT_MS = 12000;

export function photoFileInfo(uri: string): PhotoInfo {
  try {
    const file = new File(uri);
    if (!file.exists) {
      return { exists: false, size: 0, checkOk: true };
    }
    return { exists: true, size: file.info().size ?? 0, checkOk: true };
  } catch (error) {
    console.warn('Photo file check failed; proceeding with upload', error);
    return { exists: true, size: 0, checkOk: false };
  }
}

export async function resolveGpsPosition(): Promise<GpsResult> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    return { status: 'denied' };
  }

  let servicesEnabled = true;
  try {
    servicesEnabled = await Location.hasServicesEnabledAsync();
  } catch {
    // location provider status not available; let the fix attempt below surface failures
  }
  if (!servicesEnabled) {
    return { status: 'disabled' };
  }

  const withTimeout = <T>(promise: Promise<T>) =>
    new Promise<T | null>((resolve) => {
      const timer = setTimeout(() => resolve(null), GPS_TIMEOUT_MS);
      promise.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        () => {
          clearTimeout(timer);
          resolve(null);
        },
      );
    });

  let pos = await withTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }));
  if (!pos) {
    pos = await withTimeout(Location.getLastKnownPositionAsync({ requiredAccuracy: 150 }));
  }

  if (!pos) {
    return { status: 'unavailable' };
  }

  return {
    status: 'ok',
    position: {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      accuracy: pos.coords.accuracy ?? null,
    },
  };
}
