export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: Record<string, unknown>;
  readonly errors?: Record<string, string[]>;

  constructor(
    message: string,
    status: number,
    code?: string,
    details?: Record<string, unknown>,
    errors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.errors = errors;
  }
}

interface RequestOptions {
  token?: string | null;
  json?: unknown;
  form?: FormData;
  timeoutMs?: number;
  raw?: boolean;
}

function describeFetchError(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === 'AbortError' || /abort/i.test(error.message)) {
      return 'Request timed out.';
    }
    return error.message || 'Unknown network error.';
  }
  return String(error);
}

function buildUrl(baseUrl: string, path: string, params?: Record<string, string | number | boolean | undefined>): string {
  const url = baseUrl + path;
  if (!params) return url;
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }
  }
  return parts.length ? `${url}${url.includes('?') ? '&' : '?'}${parts.join('&')}` : url;
}

export class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  async request<T>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, options: RequestOptions = {}): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    let body: BodyInit | null = null;

    if (options.json !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.json);
    } else if (options.form !== undefined) {
      body = options.form;
    }

    if (options.token) {
      headers.Authorization = `Bearer ${options.token}`;
    }

    const isFormUpload = options.form !== undefined;
    const controller = new AbortController();
    const timer = isFormUpload ? null : setTimeout(() => controller.abort(), options.timeoutMs ?? 30000);

    let response: Response;
    try {
      const url = /^https?:\/\//i.test(path) ? path : this.baseUrl + path;
      response = await fetch(url, {
        method,
        headers,
        body,
        ...(isFormUpload ? {} : { signal: controller.signal }),
      });
    } catch (error) {
      throw new ApiError(
        `Cannot reach the server. Check your connection and server URL. (${describeFetchError(error)})`,
        0,
        'network_error',
      );
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }

    if (options.raw) {
      if (!response.ok) {
        let message = `Request failed (HTTP ${response.status}).`;
        try {
          const json = (await response.json()) as { message?: string };
          if (json.message) message = json.message;
        } catch {
          /* non-JSON error body */
        }
        throw new ApiError(message, response.status);
      }
      return response as T;
    }

    let payload: unknown = null;
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      payload = await response.json().catch(() => null);
    }

    if (!response.ok) {
      const json = (payload ?? {}) as {
        message?: string;
        code?: string;
        details?: Record<string, unknown>;
        errors?: Record<string, string[]>;
      };
      throw new ApiError(
        json.message ?? `Request failed (HTTP ${response.status}).`,
        response.status,
        json.code,
        json.details,
        json.errors,
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return payload as T;
  }

  get<T>(path: string, params?: Record<string, string | number | boolean | undefined>, token?: string | null): Promise<T> {
    return this.request<T>('GET', buildUrl(this.baseUrl, path, params), { token });
  }

  post<T>(path: string, json: unknown, token?: string | null): Promise<T> {
    return this.request<T>('POST', path, { token, json });
  }

  postForm<T>(path: string, form: FormData, token?: string | null): Promise<T> {
    return this.request<T>('POST', path, { token, form });
  }

  patch<T>(path: string, json: unknown, token?: string | null): Promise<T> {
    return this.request<T>('PATCH', path, { token, json });
  }

  delete<T>(path: string, token?: string | null): Promise<T> {
    return this.request<T>('DELETE', path, { token });
  }
}

/** Production static admin sets VITE_API_URL to the Laravel API origin. Dev leaves it empty (Vite proxy). */
const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, '') ?? '';

export const api = new ApiClient(API_BASE);
