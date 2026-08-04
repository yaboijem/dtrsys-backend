export interface Position {
  latitude: number;
  longitude: number;
  accuracy: number | null;
}

export type GpsResult =
  | { status: 'ok'; position: Position }
  | { status: 'denied' }
  | { status: 'disabled' }
  | { status: 'unavailable' }
  | { status: 'timeout' }
  | { status: 'insecure' };

const GPS_TIMEOUT_MS = 15000;

function readPosition(
  options: PositionOptions,
): Promise<{ ok: true; position: GeolocationPosition } | { ok: false; code?: number }> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ ok: false });
      return;
    }

    const timer = window.setTimeout(() => resolve({ ok: false, code: 3 }), GPS_TIMEOUT_MS + 500);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        window.clearTimeout(timer);
        resolve({ ok: true, position });
      },
      (error) => {
        window.clearTimeout(timer);
        resolve({ ok: false, code: error?.code });
      },
      options,
    );
  });
}

function toResult(position: GeolocationPosition): GpsResult {
  return {
    status: 'ok',
    position: {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy ?? null,
    },
  };
}

/**
 * Resolve device GPS for punches.
 * Tries high accuracy, then low accuracy + cached position.
 * Maps browser errors so the UI can show a useful message.
 */
export async function resolveGpsPosition(): Promise<GpsResult> {
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    // Many mobile browsers block geolocation on plain http:// LAN IPs.
    return { status: 'insecure' };
  }

  if (!navigator.geolocation) {
    return { status: 'unavailable' };
  }

  // 1) High accuracy
  const high = await readPosition({
    enableHighAccuracy: true,
    timeout: GPS_TIMEOUT_MS,
    maximumAge: 30_000,
  });
  if (high.ok) {
    return toResult(high.position);
  }

  // 2) Low accuracy / network location (often works indoors when GPS lock fails)
  const low = await readPosition({
    enableHighAccuracy: false,
    timeout: GPS_TIMEOUT_MS,
    maximumAge: 120_000,
  });
  if (low.ok) {
    return toResult(low.position);
  }

  const code = low.code ?? high.code;
  if (code === 1) {
    return { status: 'denied' };
  }
  if (code === 2) {
    return { status: 'disabled' };
  }
  if (code === 3) {
    return { status: 'timeout' };
  }
  return { status: 'unavailable' };
}

export function gpsFailureMessage(status: Exclude<GpsResult['status'], 'ok'>): string {
  switch (status) {
    case 'denied':
      return 'Location permission is blocked. Allow location for this site in browser settings, then try again.';
    case 'disabled':
      return 'Turn on Location / GPS in phone settings, then try again.';
    case 'timeout':
      return 'Could not get a GPS fix in time. Move outdoors or near a window and try again.';
    case 'insecure':
      return 'Browsers block GPS on plain HTTP. Open the portal via HTTPS, or use localhost / a secure tunnel.';
    default:
      return 'Location is required to punch. Check GPS and site permissions, then try again.';
  }
}
