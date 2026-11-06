import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Platform } from 'react-native';
import * as Location from 'expo-location';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

let cachedCoords: Coordinates | null = null;
let cachedPermission: 'unknown' | 'granted' | 'denied' = 'unknown';
let pendingLocationPromise: Promise<boolean> | null = null;

interface LocationState {
  coords: Coordinates | null;
  loading: boolean;
  permission: 'unknown' | 'granted' | 'denied';
  error: string | null;
  refresh: () => Promise<void>;
  requestLocation: (userInitiated?: boolean) => Promise<boolean>;
}

/**
 * Foreground location for the nearby-provider map.
 * When requested or on enable, checks OS permissions and prompts device
 * to turn on native GPS/Network location hardware (via Google Play Services dialog on Android).
 */
export function useCurrentLocation(): LocationState {
  const [coords, setCoords] = useState<Coordinates | null>(cachedCoords);
  const [loading, setLoading] = useState(false);
  const [permission, setPermission] = useState<LocationState['permission']>(cachedPermission);
  const [error, setError] = useState<string | null>(null);

  const requestLocation = useCallback(async (userInitiated = false): Promise<boolean> => {
    if (pendingLocationPromise && !userInitiated) {
      return pendingLocationPromise;
    }

    const run = async (): Promise<boolean> => {
      setLoading(true);
      setError(null);

      try {
        // 1. Check and request app foreground permissions
        let perm = await Location.getForegroundPermissionsAsync();
        if (perm.status !== 'granted') {
          perm = await Location.requestForegroundPermissionsAsync();
        }

        if (perm.status !== 'granted') {
          setPermission('denied');
          cachedPermission = 'denied';
          setError('Location permission denied.');
          if (userInitiated && !perm.canAskAgain) {
            Alert.alert(
              'Location Permission Required',
              'EVRescue needs location access to discover verified charging points near you. Please enable location permission in App Settings.',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Open Settings', onPress: () => void Linking.openSettings() },
              ],
            );
          }
          return false;
        }

        setPermission('granted');
        cachedPermission = 'granted';

        // 2. Check hardware location services (GPS toggle)
        let services = await Location.hasServicesEnabledAsync();
        if (!services) {
          if (Platform.OS === 'android') {
            try {
              await Location.enableNetworkProviderAsync();
              services = await Location.hasServicesEnabledAsync();
            } catch {
              services = await Location.hasServicesEnabledAsync();
            }
          }
        }

        if (!services) {
          setError('Location services are turned off.');
          if (userInitiated) {
            Alert.alert(
              'Enable Location Services',
              'Device location (GPS) is turned off. Please enable Location in your quick settings or system settings to find nearby EV charging stations.',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Open Settings', onPress: () => void Linking.openSettings() },
              ],
            );
          }
          return false;
        }

        // 3. Immediately read cached last known position for instant response
        try {
          const last = await Location.getLastKnownPositionAsync();
          if (last?.coords) {
            const pos = {
              latitude: last.coords.latitude,
              longitude: last.coords.longitude,
            };
            cachedCoords = pos;
            setCoords(pos);
          }
        } catch {
          // Fall through to getCurrentPositionAsync
        }

        // 4. Retrieve fresh accurate position
        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        const newPos = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        cachedCoords = newPos;
        setCoords(newPos);
        setError(null);
        return true;
      } catch (err) {
        const msg = (err as Error)?.message ?? 'Could not determine your location.';
        setError(msg);
        return false;
      } finally {
        setLoading(false);
        pendingLocationPromise = null;
      }
    };

    pendingLocationPromise = run();
    return pendingLocationPromise;
  }, []);

  const refresh = useCallback(async () => {
    await requestLocation(true);
  }, [requestLocation]);

  useEffect(() => {
    // Attempt non-intrusive initial location check on mount
    const timer = setTimeout(() => {
      void requestLocation(false);
    }, 0);
    return () => clearTimeout(timer);
  }, [requestLocation]);

  return { coords, loading, permission, error, refresh, requestLocation };
}
