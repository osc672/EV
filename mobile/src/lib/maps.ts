import { Linking, Platform } from 'react-native';

/**
 * Opens Google Maps app in Turn-by-Turn driving direction mode
 * from the user's location to the selected charging point.
 */
export function openGoogleMapsRoute(
  destLat: number,
  destLng: number,
  destLabel?: string,
  userLat?: number,
  userLng?: number,
) {
  const hasUser = Number.isFinite(userLat) && Number.isFinite(userLng);
  const originParam = hasUser ? `&origin=${userLat},${userLng}` : '';
  const label = encodeURIComponent(destLabel ?? 'EV Charging Point');

  // Google Maps Universal Directions URL (Opens native Google Maps App on Android/iOS)
  const universalUrl = `https://www.google.com/maps/dir/?api=1${originParam}&destination=${destLat},${destLng}&destination_place_id=${label}&travelmode=driving`;

  // Fallback intent for Android if universal link fails
  const geoUrl = `geo:${destLat},${destLng}?q=${destLat},${destLng}(${label})`;

  Linking.canOpenURL(universalUrl)
    .then((supported) => {
      if (supported) {
        return Linking.openURL(universalUrl);
      }
      return Platform.OS === 'android' ? Linking.openURL(geoUrl) : Linking.openURL(universalUrl);
    })
    .catch(() => {
      void Linking.openURL(universalUrl);
    });
}

/**
 * Calculates straight-line distance in kilometers using the Haversine formula.
 */
export function calculateDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

/**
 * Estimates driving time in minutes based on distance in km (assumes ~35 km/h city average).
 */
export function estimateDrivingMinutes(distanceKm: number): number {
  if (distanceKm <= 0) return 1;
  const minutes = Math.round((distanceKm / 35) * 60);
  return Math.max(2, minutes);
}

/**
 * Decodes a Google / OSRM encoded polyline string into coordinates array.
 */
export function decodePolyline(encoded: string): { latitude: number; longitude: number }[] {
  const points: { latitude: number; longitude: number }[] = [];
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;

  while (index < len) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }

  return points;
}

interface DrivingRouteResult {
  points: { latitude: number; longitude: number }[];
  distanceKm: number;
  durationMinutes: number;
  midpoint: { latitude: number; longitude: number } | null;
}

const ROUTE_CACHE_TTL_MS = 5 * 60_000; // 5 minutes
const MAX_ROUTE_CACHE_SIZE = 50;
const drivingRouteCache = new Map<string, { result: DrivingRouteResult; expiresAt: number }>();

/**
 * Clears the in-memory driving route cache.
 */
export function clearRouteCache(): void {
  drivingRouteCache.clear();
}

/**
 * Fetches turn-by-turn driving route between two GPS coordinates following actual roads/streets.
 * Tries in-memory LRU cache first, then OSRM with proper User-Agent header, then falls back to street-grid waypoints.
 */
export async function fetchDrivingRoute(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
): Promise<DrivingRouteResult> {
  // Approximate coordinate key (~10-50m bucket) to reuse cached routes effectively
  const cacheKey = `${fromLat.toFixed(3)},${fromLng.toFixed(3)}->${toLat.toFixed(3)},${toLng.toFixed(3)}`;
  const now = Date.now();
  const cached = drivingRouteCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.result;
  }

  let finalResult: DrivingRouteResult;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000); // 4s timeout so UI never hangs
    const url = `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=polyline`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'EVRescueApp/1.0',
        Accept: 'application/json',
      },
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId));

    if (res.ok) {
      const json = await res.json();
      const route = json.routes?.[0];
      if (route?.geometry) {
        const points = decodePolyline(route.geometry);
        if (points.length > 1) {
          const distanceKm = Math.round(((route.distance ?? 1000) / 1000) * 10) / 10;
          const durationMinutes = Math.max(1, Math.round((route.duration ?? 180) / 60));
          const midIdx = Math.floor(points.length / 2);
          finalResult = {
            points,
            distanceKm,
            durationMinutes,
            midpoint: points[midIdx] ?? null,
          };

          // Save in cache
          if (drivingRouteCache.size >= MAX_ROUTE_CACHE_SIZE) {
            const firstKey = drivingRouteCache.keys().next().value;
            if (firstKey !== undefined) drivingRouteCache.delete(firstKey);
          }
          drivingRouteCache.set(cacheKey, { result: finalResult, expiresAt: now + ROUTE_CACHE_TTL_MS });
          return finalResult;
        }
      }
    }
  } catch {
    // Timeout or network error, proceed to fallback
  }

  // Fallback: Multi-segment corner-turned street path (never a diagonal line through buildings)
  const dLat = toLat - fromLat;
  const dLng = toLng - fromLng;
  const corner1 = { latitude: fromLat + dLat * 0.15, longitude: fromLng + dLng * 0.85 };
  const corner2 = { latitude: fromLat + dLat * 0.75, longitude: fromLng + dLng * 0.85 };
  const points = [
    { latitude: fromLat, longitude: fromLng },
    corner1,
    corner2,
    { latitude: toLat, longitude: toLng },
  ];
  const dist = calculateDistanceKm(fromLat, fromLng, toLat, toLng);
  finalResult = {
    points,
    distanceKm: dist,
    durationMinutes: estimateDrivingMinutes(dist),
    midpoint: corner1,
  };

  if (drivingRouteCache.size >= MAX_ROUTE_CACHE_SIZE) {
    const firstKey = drivingRouteCache.keys().next().value;
    if (firstKey !== undefined) drivingRouteCache.delete(firstKey);
  }
  drivingRouteCache.set(cacheKey, { result: finalResult, expiresAt: now + ROUTE_CACHE_TTL_MS });
  return finalResult;
}
