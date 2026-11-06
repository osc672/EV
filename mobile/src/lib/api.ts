import axios, {
  AxiosError,
  AxiosRequestConfig,
  InternalAxiosRequestConfig,
  isAxiosError,
} from 'axios';
import { API_URL, getApiUrl } from './config';
import { useAuthStore } from '@/store/auth';
import type { AuthTokens } from '@/types/api';

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  meta?: Record<string, unknown>;
}

interface ApiErrorBody {
  success: false;
  error: {
    code: string;
    message: string;
    details?: { path: string; message: string }[];
  };
}

export class ApiError extends Error {
  code: string;
  status: number;
  details?: { path: string; message: string }[];

  constructor(message: string, code: string, status: number, details?: { path: string; message: string }[]) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

// eslint-disable-next-line import/no-named-as-default-member
export const client = axios.create({
  baseURL: API_URL,
  timeout: 25_000,
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
});

client.interceptors.request.use((config) => {
  config.baseURL = getApiUrl();
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  // When uploading FormData, delete Content-Type so Axios/networking generates the proper multipart boundary
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type'];
  }
  return config;
});

const AUTH_PATHS = ['/auth/login', '/auth/register', '/auth/otp/', '/auth/refresh', '/auth/password/'];

function isAuthPath(url?: string): boolean {
  if (!url) return false;
  return AUTH_PATHS.some((path) => url.includes(path));
}

let refreshPromise: Promise<AuthTokens | null> | null = null;

async function performRefresh(): Promise<AuthTokens | null> {
  const refreshToken = useAuthStore.getState().refreshToken;
  if (!refreshToken) return null;
  try {
    const res = await axios.post<ApiEnvelope<AuthTokens>>(
      `${getApiUrl()}/auth/refresh`,
      { refreshToken },
      { timeout: 20_000, headers: { 'Content-Type': 'application/json' } },
    );
    const tokens = res.data.data;
    await useAuthStore.getState().setSession(tokens);
    return tokens;
  } catch {
    await useAuthStore.getState().signOut();
    return null;
  }
}

client.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    const status = error.response?.status;

    if (!original || status !== 401 || original._retry || isAuthPath(original.url)) {
      return Promise.reject(error);
    }

    original._retry = true;
    if (!refreshPromise) {
      refreshPromise = performRefresh().finally(() => {
        refreshPromise = null;
      });
    }
    const tokens = await refreshPromise;
    if (!tokens) return Promise.reject(error);

    original.headers = original.headers ?? {};
    original.headers.Authorization = `Bearer ${tokens.accessToken}`;
    return client(original);
  },
);

function normalizeError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  if (isAxiosError<ApiErrorBody>(error)) {
    const body = error.response?.data;
    if (body?.error) {
      return new ApiError(
        body.error.message ?? 'Request failed',
        body.error.code ?? 'REQUEST_FAILED',
        error.response?.status ?? 0,
        body.error.details,
      );
    }
    if (error.code === 'ECONNABORTED') {
      return new ApiError('The request timed out. Check your connection and try again.', 'TIMEOUT', 0);
    }
    return new ApiError(
      error.response
        ? `Server error (${error.response.status})`
        : `Cannot reach EV server at: ${getApiUrl()}\n\nMake sure your phone and PC are on the same Wi-Fi, and port 4000 is open in Windows Firewall.`,
      'NETWORK_ERROR',
      error.response?.status ?? 0,
    );
  }

  return new ApiError((error as Error)?.message || 'Something went wrong', 'UNKNOWN', 0);
}

export function getErrorMessage(error: unknown): string {
  return normalizeError(error).message;
}

async function unwrap<T>(promise: Promise<{ data: ApiEnvelope<T> }>): Promise<T> {
  try {
    const response = await promise;
    return response.data.data;
  } catch (error) {
    throw normalizeError(error);
  }
}

async function unwrapWithMeta<T>(
  promise: Promise<{ data: ApiEnvelope<T> }>,
): Promise<{ data: T; meta: Record<string, unknown> }> {
  try {
    const response = await promise;
    return { data: response.data.data, meta: response.data.meta ?? {} };
  } catch (error) {
    throw normalizeError(error);
  }
}

export function apiGet<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  return unwrap<T>(client.get<ApiEnvelope<T>>(url, config));
}

export function apiGetWithMeta<T>(
  url: string,
  config?: AxiosRequestConfig,
): Promise<{ data: T; meta: Record<string, unknown> }> {
  return unwrapWithMeta<T>(client.get<ApiEnvelope<T>>(url, config));
}

export function apiPost<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
  return unwrap<T>(client.post<ApiEnvelope<T>>(url, body, config));
}

export function apiPatch<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
  return unwrap<T>(client.patch<ApiEnvelope<T>>(url, body, config));
}

export function apiPut<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
  return unwrap<T>(client.put<ApiEnvelope<T>>(url, body, config));
}

export function apiDelete<T = void>(url: string, config?: AxiosRequestConfig): Promise<T> {
  return unwrap<T>(client.delete<ApiEnvelope<T>>(url, config));
}

export function apiUpload<T>(url: string, formData: FormData): Promise<T> {
  const token = useAuthStore.getState().accessToken;
  return unwrap<T>(
    client.post<ApiEnvelope<T>>(url, formData, {
      headers: {
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      transformRequest: (data) => data,
      timeout: 60_000,
    }),
  );
}
