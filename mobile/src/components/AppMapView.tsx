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
  Platform,
  StyleSheet,
  View,
  StyleProp,
  ViewStyle,
  ActivityIndicator,
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
  if (latitudeDelta <= 0.005) return 17;
  if (latitudeDelta <= 0.01) return 16;
  if (latitudeDelta <= 0.02) return 15;
  if (latitudeDelta <= 0.05) return 14;
  if (latitudeDelta <= 0.1) return 13;
  if (latitudeDelta <= 0.2) return 12;
  if (latitudeDelta <= 0.5) return 10;
  return 9;
}

const LEAFLET_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css" />
  <script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
  <style>
    * { box-sizing: border-box; }
    html, body, #map {
      margin: 0; padding: 0; width: 100%; height: 100%;
      background: #0B1914; overflow: hidden;
    }
    .leaflet-control-attribution, .leaflet-control-zoom { display: none !important; }
    
    .ev-station-pin {
      width: 38px; height: 38px; border-radius: 50%;
      background: #10B981; border: 3px solid #FFFFFF;
      box-shadow: 0 4px 14px rgba(0,0,0,0.4);
      display: flex; align-items: center; justify-content: center;
      color: #FFFFFF; font-size: 18px; font-weight: 800;
      transition: transform 0.18s ease;
      cursor: pointer;
    }
    .ev-station-pin:hover, .ev-station-pin:active {
      transform: scale(1.18);
    }
    .ev-station-pin.busy {
      background: #F59E0B;
    }

    .ev-user-marker {
      width: 22px; height: 22px; border-radius: 50%;
      background: #3B82F6; border: 3px solid #FFFFFF;
      box-shadow: 0 0 14px rgba(59,130,246,0.85);
      position: relative;
    }
    .ev-user-marker::after {
      content: '';
      position: absolute; top: -6px; left: -6px; right: -6px; bottom: -6px;
      border-radius: 50%;
      background: rgba(59,130,246,0.3);
      animation: pulse 2s infinite ease-out;
    }
    @keyframes pulse {
      0% { transform: scale(0.8); opacity: 1; }
      100% { transform: scale(2.2); opacity: 0; }
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

      // Standard OpenStreetMap tiles (matching https://www.openstreetmap.org)
      var osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        subdomains: ['a', 'b', 'c'],
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(map);

      // Fallback to Esri World Street Map if primary OSM tile fails
      osmLayer.on('tileerror', function() {
        if (!map._fallbackAdded) {
          map._fallbackAdded = true;
          L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 }).addTo(map);
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

      // 1. Update markers
      markersLayer.clearLayers();
      if (markers && markers.length) {
        markers.forEach(function(m) {
          var iconHtml = '';
          var iconClass = 'ev-marker';
          var iconSize = [38, 38];
          var iconAnchor = [19, 19];

          if (m.isUserLocation) {
            iconHtml = '<div class="ev-user-marker"></div>';
            iconSize = [22, 22];
            iconAnchor = [11, 11];
          } else {
            var isBusy = m.pinColor === '#F59E0B' || m.pinColor === 'amber' || m.pinColor === '#EF4444';
            iconHtml = '<div class="ev-station-pin ' + (isBusy ? 'busy' : '') + '">⚡</div>';
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

      // 2. Update polylines
      polylinesLayer.clearLayers();
      if (polylines && polylines.length) {
        polylines.forEach(function(p) {
          if (!p.coordinates || p.coordinates.length < 2) return;
          var latLngs = p.coordinates.map(function(c) { return [c.latitude, c.longitude]; });
          var polyline = L.polyline(latLngs, {
            color: p.strokeColor || '#10B981',
            weight: p.strokeWidth || 5,
            lineCap: 'round',
            lineJoin: 'round',
            opacity: 0.95
          });
          polylinesLayer.addLayer(polyline);
        });
      }

      // 3. Update circles
      circlesLayer.clearLayers();
      if (circles && circles.length) {
        circles.forEach(function(c) {
          if (!c.center || !c.radius) return;
          var circle = L.circle([c.center.latitude, c.center.longitude], {
            radius: c.radius,
            color: c.strokeColor || 'rgba(16, 185, 129, 0.4)',
            fillColor: c.fillColor || 'rgba(16, 185, 129, 0.12)',
            fillOpacity: 0.2,
            weight: 2
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

  // Expose methods matching react-native-maps handle
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
          const isUser = Boolean(
            p.title?.toLowerCase().includes('you') ||
            p.title?.toLowerCase().includes('my location') ||
            p.title?.toLowerCase().includes('current') ||
            p.description?.toLowerCase().includes('accuracy')
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

        // Search nested children (e.g. inside View wrapper)
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

  // Sync elements when map is ready or elements change
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

  // Handle messages from Leaflet
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
      // ignore JSON parse error
    }
  }, [onPress, onRegionChangeComplete, markerCallbacks]);

  const initialZoom = deltaToZoom(activeRegion.latitudeDelta);
  const initScript = `initMap(${activeRegion.latitude}, ${activeRegion.longitude}, ${initialZoom}, ${scrollEnabled}, ${zoomEnabled}); true;`;

  return (
    <View style={[styles.container, style]}>
      <WebViewComponent
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ html: LEAFLET_HTML }}
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
    backgroundColor: '#0B1914',
  },
  webView: {
    flex: 1,
    backgroundColor: '#0B1914',
  },
});

export { Marker, Polyline, Circle, Callout };
export default AppMapView;
