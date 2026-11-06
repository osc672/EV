import Constants from 'expo-constants';
import { NativeModules } from 'react-native';
import * as SecureStore from 'expo-secure-store';

type Extra = { apiUrl?: string };

const extra = (Constants.expoConfig?.extra ?? {}) as Extra;
const API_OVERRIDE_KEY = 'evrescue.custom_api_url';

let customApiUrl: string | null = null;

// Synchronous initial attempt to load cached override if available
try {
  const cached = SecureStore.getItem(API_OVERRIDE_KEY);
  if (cached) {
    customApiUrl = cached.trim().replace(/\/$/, '');
  }
} catch {
  // SecureStore sync may not be supported on all architectures, safe to ignore
}

export function setCustomApiUrl(url: string) {
  customApiUrl = url.trim().replace(/\/$/, '');
}

export async function loadSavedApiUrl(): Promise<string | null> {
  try {
    const saved = await SecureStore.getItemAsync(API_OVERRIDE_KEY);
    if (saved) {
      customApiUrl = saved.trim().replace(/\/$/, '');
      return customApiUrl;
    }
  } catch {
    // ignore
  }
  return null;
}

export async function saveCustomApiUrl(url: string): Promise<void> {
  const clean = url.trim().replace(/\/$/, '');
  customApiUrl = clean;
  try {
    await SecureStore.setItemAsync(API_OVERRIDE_KEY, clean);
  } catch {
    // ignore
  }
}

export async function clearCustomApiUrl(): Promise<void> {
  customApiUrl = null;
  try {
    await SecureStore.deleteItemAsync(API_OVERRIDE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Detects the host machine IP address that the phone used to load this bundle.
 */
function detectHostIp(): string | null {
  // 1. From NativeModules SourceCode (the actual bundle download URL)
  const scriptUrl: string | undefined = NativeModules.SourceCode?.scriptURL;
  if (scriptUrl) {
    const match = scriptUrl.match(/^https?:\/\/([^:/]+)/i) || scriptUrl.match(/^exp:\/\/([^:/]+)/i);
    if (match && match[1] && match[1] !== 'localhost' && match[1] !== '127.0.0.1') {
      return match[1];
    }
  }

  // 2. From Expo configuration objects
  const hostUri =
    Constants.expoConfig?.hostUri ||
    (Constants as unknown as { expoGoConfig?: { debuggerHost?: string } }).expoGoConfig?.debuggerHost ||
    (Constants as unknown as { manifest?: { debuggerHost?: string } }).manifest?.debuggerHost ||
    (Constants as unknown as { manifest2?: { extra?: { expoGo?: { debuggerHost?: string } } } }).manifest2?.extra?.expoGo?.debuggerHost;

  const hostIp = hostUri?.split(':')?.[0];
  if (hostIp && hostIp !== 'localhost' && hostIp !== '127.0.0.1') {
    return hostIp;
  }

  return null;
}

export function getApiUrl(): string {
  if (customApiUrl) {
    return customApiUrl;
  }

  // 1. Explicit environment variable configured in .env (if non-localhost)
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envUrl && !envUrl.includes('localhost') && !envUrl.includes('127.0.0.1')) {
    return envUrl.replace(/\/$/, '');
  }

  // 2. In development, prioritize dynamically detected Metro host IP so Wi-Fi/hotspot IP changes never break connections
  const detected = detectHostIp();
  if (detected) {
    return `http://${detected}:4000/api/v1`;
  }

  // 3. Fallback to extra or fallback address
  if (extra.apiUrl) {
    return extra.apiUrl.replace(/\/$/, '');
  }

  const fallback = 'http://10.30.80.86:4000/api/v1';
  return fallback;
}

export const API_URL = getApiUrl();

/**
 * Resolves any image URL so it always points to the active server reachable by the phone.
 * Handles:
 * 1. URLs containing outdated LAN IPs (e.g. 10.195.232.86 -> 10.30.80.86)
 * 2. URLs containing "localhost" or "127.0.0.1" (which fail on real Android/iOS devices)
 * 3. Relative paths (e.g. "/uploads/avatars/...")
 */
export function resolveImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  // Active server base URL (e.g. "http://10.30.80.86:4000")
  const currentApiBase = getApiUrl().replace(/\/api\/v1\/?$/, '');

  // 1. Relative path starting with /uploads
  if (trimmed.startsWith('/uploads/')) {
    return `${currentApiBase}${trimmed}`;
  }

  // 2. Full URL containing /uploads/ (rewrites old IP or localhost to current dynamic server)
  const uploadsMatch = trimmed.match(/^https?:\/\/[^/]+(\/uploads\/.+)$/i);
  if (uploadsMatch && uploadsMatch[1]) {
    return `${currentApiBase}${uploadsMatch[1]}`;
  }

  return trimmed;
}

export const APP_NAME = 'EV Rescue';

export const DEFAULT_MAP_REGION = {
  latitude: 16.5002, // Benz Circle, Vijayawada, Andhra Pradesh
  longitude: 80.648,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

export const CONNECTOR_LABELS: Record<string, string> = {
  TYPE_2: 'Type 2',
  CCS2: 'CCS2',
  CHADEMO: 'CHAdeMO',
  TYPE_1: 'Type 1',
  GB_T: 'GB/T',
  AC_3_PIN: '3-pin AC',
  OTHER: 'Other',
};

export const PROVIDER_TYPE_LABELS: Record<string, string> = {
  HOME: 'Home charger',
  SHOP: 'Shop',
  OFFICE: 'Office',
  HOTEL: 'Hotel',
  REPAIR_SHOP: 'Repair shop',
  BUSINESS: 'Business',
};
