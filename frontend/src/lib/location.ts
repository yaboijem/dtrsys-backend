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

export async function getCurrentPosition(): Promise<Position | null> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    return null;
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
    return null;
  }

  return {
    latitude: pos.coords.latitude,
    longitude: pos.coords.longitude,
    accuracy: pos.coords.accuracy ?? null,
  };
}
