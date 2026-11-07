import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  StyleSheet,
  View,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import type { MapViewProps, Region } from 'react-native-maps';
import { Marker, Polyline, Circle, Callout } from 'react-native-maps';

export interface AppMapViewProps extends Omit<MapViewProps, 'ref'> {
  style?: StyleProp<ViewStyle>;
  initialRegion?: Region;
  region?: Region;
  onRegionChangeComplete?: (region: Region) => void;
  onPress?: (event: { nativeEvent: { coordinate: { latitude: number; longitude: number } } }) => void;
  children?: React.ReactNode;
  scrollEnabled?: boolean;
  zoomEnabled?: boolean;
  showsUserLocation?: boolean;
}

export interface AppMapViewHandle {
  animateToRegion: (targetRegion: Region, duration?: number) => void;
  fitToCoordinates: (
    coordinates: { latitude: number; longitude: number }[],
    options?: { edgePadding?: { top: number; right: number; bottom: number; left: number }; animated?: boolean },
  ) => void;
}

interface ParsedMarker {
  id: string;
  latitude: number;
  longitude: number;
  title?: string;
  description?: string;
  pinColor?: string;
  draggable?: boolean;
  isUserLocation?: boolean;
  isDestination?: boolean;
  onPress?: () => void;
  onDragEnd?: (coord: { latitude: number; longitude: number }) => void;
}

interface ParsedPolyline {
  coordinates: { latitude: number; longitude: number }[];
  strokeColor?: string;
  strokeWidth?: number;
}

interface ParsedCircle {
  center: { latitude: number; longitude: number };
  radius: number;
  fillColor?: string;
  strokeColor?: string;
}

function deltaToZoom(latitudeDelta = 0.04): number {
  if (latitudeDelta <= 0.003) return 17;
  if (latitudeDelta <= 0.007) return 16;
  if (latitudeDelta <= 0.015) return 15;
  if (latitudeDelta <= 0.035) return 14;
  if (latitudeDelta <= 0.08) return 13;
  if (latitudeDelta <= 0.16) return 12;
  if (latitudeDelta <= 0.4) return 10;
  return 9;
}

const NAVIGATION_MAP_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css" />
  <script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body, #map {
      width: 100%; height: 100%;
      background: #F8FAFC; overflow: hidden;
    }
    .leaflet-control-attribution, .leaflet-control-zoom { display: none !important; }

    /* High-contrast, clean navigation map (Rapido & Ola style) - No invert filters */
    .leaflet-tile-pane {
      background: #F8FAFC !important;
    }

    /* User Live GPS Marker - Crisp white center, electric blue halo, pulsing radar */
    .ev-user-marker {
      width: 22px; height: 22px; border-radius: 50%;
      background: #0284C7; border: 3px solid #FFFFFF;
      box-shadow: 0 2px 10px rgba(0,0,0,0.3), 0 0 12px rgba(2,132,199,0.8);
      position: relative;
      display: flex; align-items: center; justify-content: center;
    }
    .ev-user-marker::before {
      content: '';
      width: 8px; height: 8px; border-radius: 50%;
      background: #FFFFFF;
    }
    .ev-user-marker::after {
      content: '';
      position: absolute; top: -8px; left: -8px; right: -8px; bottom: -8px;
      border-radius: 50%;
      background: rgba(2,132,199,0.25);
      animation: pulse 2s infinite ease-out;
    }
    @keyframes pulse {
      0% { transform: scale(0.7); opacity: 1; }
      100% { transform: scale(2.4); opacity: 0; }
    }

    /* Red Destination Teardrop Marker matching navigation */
    .ev-destination-pin {
      width: 28px; height: 38px; position: relative;
      cursor: pointer;
    }
    .pin-head {
      width: 28px; height: 28px; border-radius: 50% 50% 50% 0;
      background: #EF4444;
      transform: rotate(-45deg);
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 4px 14px rgba(0,0,0,0.35);
    }
    .pin-dot {
      width: 9px; height: 9px; border-radius: 50%;
      background: #FFFFFF;
    }

    /* EV Charging Station Pin (Rapido / Ola high-contrast emerald pin) */
    .ev-station-pin {
      width: 36px; height: 36px; border-radius: 50%;
      background: #059669;
      border: 3px solid #FFFFFF;
      box-shadow: 0 4px 14px rgba(0,0,0,0.35), 0 0 10px rgba(5,150,105,0.4);
      display: flex; align-items: center; justify-content: center;
      color: #FFFFFF; font-size: 17px; font-weight: 800;
      cursor: pointer;
      transition: transform 0.15s ease;
    }
    .ev-station-pin:active {
      transform: scale(1.18);
    }
    .ev-station-pin.busy {
      background: #D97706;
      box-shadow: 0 4px 14px rgba(0,0,0,0.35), 0 0 10px rgba(217,119,6,0.4);
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = null;
    var markersLayer = null;
    var polylinesLayer = null;
    var circlesLayer = null;
    var initialized = false;

    function initMap(lat, lng, zoom, scrollEnabled, zoomEnabled) {
      if (initialized && map) return;
      initialized = true;

      map = L.map('map', {
        zoomControl: false,
        attributionControl: false,
        dragging: scrollEnabled,
        touchZoom: zoomEnabled,
        scrollWheelZoom: zoomEnabled,
        doubleClickZoom: zoomEnabled,
      }).setView([lat, lng], zoom);

      // Clean, professional navigation street map (Esri World Street Map - free, high-contrast, zero watermark)
      var streetLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        attribution: 'Esri'
      }).addTo(map);

      // Fallback to OSM
      streetLayer.on('tileerror', function() {
        if (!map._fallbackAdded) {
          map._fallbackAdded = true;
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            subdomains: ['a', 'b', 'c']
          }).addTo(map);
        }
      });

      markersLayer = L.layerGroup().addTo(map);
      polylinesLayer = L.layerGroup().addTo(map);
      circlesLayer = L.layerGroup().addTo(map);

      map.on('click', function(e) {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'mapPress',
            coordinate: { latitude: e.latlng.lat, longitude: e.latlng.lng }
          }));
        }
      });

      map.on('moveend', function() {
        if (window.ReactNativeWebView && map) {
          var center = map.getCenter();
          var bounds = map.getBounds();
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'regionChangeComplete',
            region: {
              latitude: center.lat,
              longitude: center.lng,
              latitudeDelta: Math.abs(bounds.getNorth() - bounds.getSouth()),
              longitudeDelta: Math.abs(bounds.getEast() - bounds.getWest())
            }
          }));
        }
      });

      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
      }
    }

    window.flyToRegion = function(lat, lng, zoom, durationSec) {
      if (!map) return;
      map.flyTo([lat, lng], zoom, { duration: durationSec || 0.6 });
    };

    window.fitCoords = function(coords) {
      if (!map || !coords || !coords.length) return;
      var latLngs = coords.map(function(c) { return [c.latitude, c.longitude]; });
      map.fitBounds(latLngs, { padding: [40, 40] });
    };

    window.updateElements = function(markers, polylines, circles) {
      if (!map) return;

      // 1. Update HTML Markers
      markersLayer.clearLayers();
      if (markers && markers.length) {
        markers.forEach(function(m) {
          var iconHtml = '';
          var iconClass = '';
          var iconSize = [36, 36];
          var iconAnchor = [18, 18];

          if (m.isUserLocation) {
            iconHtml = '<div class="ev-user-marker"></div>';
            iconSize = [22, 22];
            iconAnchor = [11, 11];
          } else if (m.isDestination) {
            iconHtml = '<div class="ev-destination-pin"><div class="pin-head"><div class="pin-dot"></div></div></div>';
            iconSize = [28, 38];
            iconAnchor = [14, 38];
          } else {
            var isBusy = m.pinColor === '#F59E0B' || m.pinColor === 'amber' || m.pinColor === '#EF4444';
            iconHtml = '<div class="ev-station-pin ' + (isBusy ? 'busy' : '') + '">⚡</div>';
            iconSize = [36, 36];
            iconAnchor = [18, 18];
          }

          var customIcon = L.divIcon({
            html: iconHtml,
            className: iconClass,
            iconSize: iconSize,
            iconAnchor: iconAnchor
          });

          var marker = L.marker([m.latitude, m.longitude], {
            icon: customIcon,
            draggable: !!m.draggable
          });

          marker.on('click', function() {
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'markerPress',
                id: m.id
              }));
            }
          });

          if (m.draggable) {
            marker.on('dragend', function(e) {
              var pos = e.target.getLatLng();
              if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'markerDragEnd',
                  id: m.id,
                  coordinate: { latitude: pos.lat, longitude: pos.lng }
                }));
              }
            });
          }

          markersLayer.addLayer(marker);
        });
      }

      // 2. Update Polylines: Clean High-Contrast Navigation Polyline (Rapido / Ola style)
      polylinesLayer.clearLayers();
      if (polylines && polylines.length) {
        polylines.forEach(function(p) {
          if (!p.coordinates || p.coordinates.length < 2) return;
          var latLngs = p.coordinates.map(function(c) { return [c.latitude, c.longitude]; });

          // Outer dark casing for sharp road contrast
          L.polyline(latLngs, {
            color: '#1E3A8A',
            weight: 8,
            lineCap: 'round',
            lineJoin: 'round',
            opacity: 0.95
          }).addTo(polylinesLayer);

          // Inner vibrant electric blue navigation line
          L.polyline(latLngs, {
            color: '#0284C7',
            weight: 5,
            lineCap: 'round',
            lineJoin: 'round',
            opacity: 1.0
          }).addTo(polylinesLayer);
        });
      }

      // 3. Update Circles (soft navigation radar)
      circlesLayer.clearLayers();
      if (circles && circles.length) {
        circles.forEach(function(c) {
          if (!c.center || !c.radius) return;
          var circle = L.circle([c.center.latitude, c.center.longitude], {
            radius: c.radius,
            color: 'rgba(2, 132, 199, 0.5)',
            fillColor: 'rgba(2, 132, 199, 0.08)',
            fillOpacity: 0.2,
            weight: 1.5
          });
          circlesLayer.addLayer(circle);
        });
      }
    };
  </script>
</body>
</html>`;

const WebViewComponent = WebView as any;

export const AppMapView = forwardRef<AppMapViewHandle, AppMapViewProps>((props, ref) => {
  const {
    children,
    style,
    initialRegion,
    region,
    onPress,
    onRegionChangeComplete,
    scrollEnabled = true,
    zoomEnabled = true,
  } = props;

  const webViewRef = useRef<any>(null);
  const [mapReady, setMapReady] = useState(false);

  const activeRegion = region ?? initialRegion ?? {
    latitude: 16.506,
    longitude: 80.648,
    latitudeDelta: 0.04,
    longitudeDelta: 0.04,
  };

  // Expose imperative handle methods
  useImperativeHandle(ref, () => ({
    animateToRegion: (targetRegion: Region, duration = 500) => {
      const zoom = deltaToZoom(targetRegion.latitudeDelta);
      const script = `window.flyToRegion && window.flyToRegion(${targetRegion.latitude}, ${targetRegion.longitude}, ${zoom}, ${duration / 1000}); true;`;
      webViewRef.current?.injectJavaScript(script);
    },
    fitToCoordinates: (coordinates: { latitude: number; longitude: number }[]) => {
      const script = `window.fitCoords && window.fitCoords(${JSON.stringify(coordinates)}); true;`;
      webViewRef.current?.injectJavaScript(script);
    },
  }));

  // Parse children (Markers, Polylines, Circles)
  const { parsedMarkers, parsedPolylines, parsedCircles, markerCallbacks } = useMemo(() => {
    const markers: ParsedMarker[] = [];
    const polylines: ParsedPolyline[] = [];
    const circles: ParsedCircle[] = [];
    const callbacks = new Map<string, { onPress?: () => void; onDragEnd?: (coord: { latitude: number; longitude: number }) => void }>();

    let markerIndex = 0;

    const crawl = (nodes: React.ReactNode) => {
      React.Children.forEach(nodes, (node) => {
        if (!React.isValidElement(node)) return;

        if (node.type === React.Fragment) {
          crawl((node.props as any)?.children);
          return;
        }

        const p = node.props as any;

        // Check for Marker
        if (p?.coordinate && typeof p.coordinate.latitude === 'number' && typeof p.coordinate.longitude === 'number') {
          const markerId = String(node.key ?? `marker_${markerIndex++}`);
          const titleLower = String(p.title ?? '').toLowerCase();
          const descLower = String(p.description ?? '').toLowerCase();

          const isUser = Boolean(
            titleLower.includes('you') ||
            titleLower.includes('my location') ||
            titleLower.includes('current') ||
            descLower.includes('accuracy')
          );

          const isDest = Boolean(
            titleLower.includes('destination') ||
            titleLower.includes('arrival') ||
            p.pinColor === '#EF4444' ||
            p.pinColor === 'red'
          );

          markers.push({
            id: markerId,
            latitude: p.coordinate.latitude,
            longitude: p.coordinate.longitude,
            title: p.title,
            description: p.description,
            pinColor: p.pinColor,
            draggable: p.draggable,
            isUserLocation: isUser,
            isDestination: isDest,
          });

          callbacks.set(markerId, {
            onPress: p.onPress,
            onDragEnd: p.onDragEnd,
          });
          return;
        }

        // Check for Polyline
        if (Array.isArray(p?.coordinates) && p.coordinates.length > 0) {
          polylines.push({
            coordinates: p.coordinates,
            strokeColor: p.strokeColor,
            strokeWidth: p.strokeWidth,
          });
          return;
        }

        // Check for Circle
        if (p?.center && typeof p.center.latitude === 'number' && typeof p.radius === 'number') {
          circles.push({
            center: p.center,
            radius: p.radius,
            fillColor: p.fillColor,
            strokeColor: p.strokeColor,
          });
          return;
        }

        if (p?.children) {
          crawl(p.children);
        }
      });
    };

    crawl(children);

    return {
      parsedMarkers: markers,
      parsedPolylines: polylines,
      parsedCircles: circles,
      markerCallbacks: callbacks,
    };
  }, [children]);

  // Push updated elements to map
  useEffect(() => {
    if (!mapReady || !webViewRef.current) return;

    const payload = JSON.stringify({
      markers: parsedMarkers,
      polylines: parsedPolylines,
      circles: parsedCircles,
    });

    const script = `window.updateElements && window.updateElements(${payload}.markers, ${payload}.polylines, ${payload}.circles); true;`;
    webViewRef.current.injectJavaScript(script);
  }, [mapReady, parsedMarkers, parsedPolylines, parsedCircles]);

  // Handle messages from WebView
  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'ready') {
        setMapReady(true);
      } else if (data.type === 'mapPress' && onPress) {
        onPress({ nativeEvent: { coordinate: data.coordinate } });
      } else if (data.type === 'regionChangeComplete' && onRegionChangeComplete) {
        onRegionChangeComplete(data.region);
      } else if (data.type === 'markerPress') {
        const cb = markerCallbacks.get(data.id);
        cb?.onPress?.();
      } else if (data.type === 'markerDragEnd') {
        const cb = markerCallbacks.get(data.id);
        cb?.onDragEnd?.(data.coordinate);
      }
    } catch {
      // ignore
    }
  }, [onPress, onRegionChangeComplete, markerCallbacks]);

  const initialZoom = deltaToZoom(activeRegion.latitudeDelta);
  const initScript = `initMap(${activeRegion.latitude}, ${activeRegion.longitude}, ${initialZoom}, ${scrollEnabled}, ${zoomEnabled}); true;`;

  return (
    <View style={[styles.container, style]}>
      <WebViewComponent
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ html: NAVIGATION_MAP_HTML }}
        injectedJavaScript={initScript}
        onMessage={handleMessage}
        style={styles.webView}
        userAgent="EVRescueApp/1.0 (contact: admin@evrescue.com)"
        scrollEnabled={false}
        overScrollMode="never"
        bounces={false}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        androidLayerType="hardware"
      />
    </View>
  );
});

AppMapView.displayName = 'AppMapView';

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    backgroundColor: '#F8FAFC',
  },
  webView: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
});

export { Marker, Polyline, Circle, Callout };
export default AppMapView;
