export interface Position {
  latitude: number;
  longitude: number;
  accuracy: number | null;
}

export type GpsResult =
  | { status: 'ok'; position: Position }
  | { status: 'denied' }
  | { status: 'disabled' }
  | { status: 'unavailable' };

const GPS_TIMEOUT_MS = 12000;

export async function resolveGpsPosition(): Promise<GpsResult> {
  if (!navigator.geolocation) {
    return { status: 'unavailable' };
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

  const position = await withTimeout(
    new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: GPS_TIMEOUT_MS,
        maximumAge: 60000,
      });
    }),
  );

  if (!position) {
    return { status: 'unavailable' };
  }

  return {
    status: 'ok',
    position: {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy ?? null,
    },
  };
}
