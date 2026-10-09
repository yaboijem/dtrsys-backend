/**
 * Shift-start punch storm (~1000 concurrent time-ins).
 *
 * Env:
 *   BASE_URL  API origin (default http://localhost:8000)
 *   TOKEN     Pre-issued Sanctum bearer token (preferred). If empty, login sets an httpOnly cookie for the VU.
 *   LAT, LNG  Branch GPS (defaults: Makati HQ seed)
 *
 * Example:
 *   k6 run -e BASE_URL=https://api.example.com -e TOKEN=... -e LAT=14.554729 -e LNG=121.0244452 scripts/load/punch-storm.k6.js
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import encoding from 'k6/encoding';

export const options = {
  scenarios: {
    shift_start: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 1000 },
        { duration: '1m', target: 1000 },
        { duration: '30s', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<3000'],
  },
};

const BASE_URL = (__ENV.BASE_URL || 'http://localhost:8000').replace(/\/$/, '');
const LAT = __ENV.LAT || '14.554729';
const LNG = __ENV.LNG || '121.0244452';

// Minimal valid 1×1 JPEG (bytes)
const TINY_JPEG = encoding.b64decode(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA8A/9k='
);

function clientUuid() {
  return `k6-${__VU}-${__ITER}-${Date.now()}`;
}

function authHeaders(token) {
  const headers = {
    Accept: 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  };
  if (token && token !== 'cookie') {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

function resolveToken() {
  if (__ENV.TOKEN) {
    return __ENV.TOKEN;
  }

  const employeeId = __ENV.LOGIN_EMPLOYEE_ID;
  const password = __ENV.LOGIN_PASSWORD || 'password';
  if (!employeeId) {
    throw new Error('Set TOKEN or LOGIN_EMPLOYEE_ID (+ optional LOGIN_PASSWORD)');
  }

  const res = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ employee_id: employeeId, password }),
    { headers: { 'Content-Type': 'application/json', Accept: 'application/json' } }
  );

  if (res.status !== 200) {
    throw new Error(`login failed: ${res.status} ${res.body}`);
  }

  return 'cookie';
}

let vuToken;

export function setup() {
  // Prefer a shared pre-issued token for true punch load (avoids login stampede).
  if (__ENV.TOKEN) {
    return { token: __ENV.TOKEN };
  }
  return { token: null };
}

export default function (data) {
  if (!vuToken) {
    vuToken = data.token || resolveToken();
  }

  const payload = {
    latitude: LAT,
    longitude: LNG,
    accuracy_meters: '10',
    client_uuid: clientUuid(),
    selfie: http.file(TINY_JPEG, 'selfie.jpg', 'image/jpeg'),
  };

  const res = http.post(`${BASE_URL}/api/attendance/time-in`, payload, {
    headers: authHeaders(vuToken),
  });

  check(res, {
    'time-in accepted (2xx)': (r) => r.status >= 200 && r.status < 300,
  });

  sleep(0.5);
}
