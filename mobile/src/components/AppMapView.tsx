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

const DARK_MAP_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/4.7.1/maplibre-gl.min.css" />
  <script src="https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/4.7.1/maplibre-gl.min.js"></script>
  <style>
    * { box-sizing: border-box; }
    html, body, #map {
      margin: 0; padding: 0; width: 100%; height: 100%;
      background: #0E1626; overflow: hidden;
    }
    .maplibregl-ctrl-attrib, .maplibregl-ctrl-logo { display: none !important; }

    /* EV Charging Station Pin */
    .ev-station-pin {
      width: 36px; height: 36px; border-radius: 50%;
      background: linear-gradient(135deg, #10B981 0%, #059669 100%);
      border: 3px solid #FFFFFF;
      box-shadow: 0 4px 14px rgba(0,0,0,0.5), 0 0 10px rgba(16,185,129,0.5);
      display: flex; align-items: center; justify-content: center;
      color: #FFFFFF; font-size: 17px; font-weight: 800;
      cursor: pointer;
      transition: transform 0.15s ease;
    }
    .ev-station-pin:active {
      transform: scale(1.2);
    }
    .ev-station-pin.busy {
      background: linear-gradient(135deg, #F59E0B 0%, #D97706 100%);
      box-shadow: 0 4px 14px rgba(0,0,0,0.5), 0 0 10px rgba(245,158,11,0.5);
    }

    /* User Live GPS Marker - White inner dot, blue core, pulsing radar */
    .ev-user-marker {
      width: 22px; height: 22px; border-radius: 50%;
      background: #0284C7; border: 3px solid #FFFFFF;
      box-shadow: 0 0 14px rgba(2,132,199,0.9);
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
      background: rgba(2,132,199,0.35);
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
      box-shadow: 0 4px 12px rgba(0,0,0,0.5);
    }
    .pin-dot {
      width: 9px; height: 9px; border-radius: 50%;
      background: #FFFFFF;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = null;
    var activeMarkers = [];
    var initialized = false;

    var darkVectorStyle = 'https://tiles.openfreemap.org/styles/dark';
    var fallbackRasterStyle = {
      version: 8,
      sources: {
        'esri-dark': {
          type: 'raster',
          tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}'],
          tileSize: 256
        },
        'esri-labels': {
          type: 'raster',
          tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}'],
          tileSize: 256
        }
      },
      layers: [
        { id: 'base', type: 'raster', source: 'esri-dark' },
        { id: 'labels', type: 'raster', source: 'esri-labels' }
      ]
    };

    function initMap(lat, lng, zoom, scrollEnabled, zoomEnabled) {
      if (initialized && map) return;
      initialized = true;

      try {
        map = new maplibregl.Map({
          container: 'map',
          style: darkVectorStyle,
          center: [lng, lat],
          zoom: zoom,
          dragPan: scrollEnabled,
          scrollZoom: zoomEnabled,
          touchZoomRotate: zoomEnabled,
          doubleClickZoom: zoomEnabled,
          attributionControl: false
        });

        map.on('error', function(e) {
          if (!map._fallbackTriggered && e.error && (e.error.status === 404 || e.error.status === 403 || e.error.message)) {
            map._fallbackTriggered = true;
            map.setStyle(fallbackRasterStyle);
          }
        });

        map.on('click', function(e) {
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'mapPress',
              coordinate: { latitude: e.lngLat.lat, longitude: e.lngLat.lng }
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

        map.on('load', function() {
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
          }
        });
      } catch (err) {
        console.error('Map init error:', err);
      }
    }

    window.flyToRegion = function(lat, lng, zoom, durationSec) {
      if (!map) return;
      map.flyTo({ center: [lng, lat], zoom: zoom, duration: (durationSec || 0.6) * 1000 });
    };

    window.fitCoords = function(coords) {
      if (!map || !coords || !coords.length) return;
      var bounds = new maplibregl.LngLatBounds();
      coords.forEach(function(c) { bounds.extend([c.longitude, c.latitude]); });
      map.fitBounds(bounds, { padding: 40 });
    };

    function createCircleGeoJSON(centerLng, centerLat, radiusMeters) {
      var points = 64;
      var coords = [];
      var distanceX = radiusMeters / (111320 * Math.cos(centerLat * Math.PI / 180));
      var distanceY = radiusMeters / 110540;
      for (var i = 0; i < points; i++) {
        var theta = (i / points) * (2 * Math.PI);
        coords.push([centerLng + distanceX * Math.cos(theta), centerLat + distanceY * Math.sin(theta)]);
      }
      coords.push(coords[0]);
      return {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [coords] }
      };
    }

    window.updateElements = function(markers, polylines, circles) {
      if (!map) return;

      // 1. Update HTML Markers
      activeMarkers.forEach(function(m) { m.remove(); });
      activeMarkers = [];

      if (markers && markers.length) {
        markers.forEach(function(m) {
          var el = document.createElement('div');
          var anchor = 'center';

          if (m.isUserLocation) {
            el.className = 'ev-user-marker';
          } else if (m.isDestination) {
            el.className = 'ev-destination-pin';
            el.innerHTML = '<div class="pin-head"><div class="pin-dot"></div></div>';
            anchor = 'bottom';
          } else {
            var isBusy = m.pinColor === '#F59E0B' || m.pinColor === 'amber' || m.pinColor === '#EF4444';
            el.className = 'ev-station-pin' + (isBusy ? ' busy' : '');
            el.innerHTML = '⚡';
          }

          var marker = new maplibregl.Marker({
            element: el,
            draggable: !!m.draggable,
            anchor: anchor
          })
            .setLngLat([m.longitude, m.latitude])
            .addTo(map);

          el.addEventListener('click', function(e) {
            e.stopPropagation();
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'markerPress',
                id: m.id
              }));
            }
          });

          if (m.draggable) {
            marker.on('dragend', function() {
              var pos = marker.getLngLat();
              if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'markerDragEnd',
                  id: m.id,
                  coordinate: { latitude: pos.lat, longitude: pos.lng }
                }));
              }
            });
          }

          activeMarkers.push(marker);
        });
      }

      // 2. Update Polylines (Glowing Electric Cyan Navigation Line matching Image 2)
      var features = [];
      if (polylines && polylines.length) {
        polylines.forEach(function(p) {
          if (!p.coordinates || p.coordinates.length < 2) return;
          features.push({
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: p.coordinates.map(function(c) { return [c.longitude, c.latitude]; })
            }
          });
        });
      }

      if (map.getSource('routes')) {
        map.getSource('routes').setData({ type: 'FeatureCollection', features: features });
      } else if (map.isStyleLoaded()) {
        map.addSource('routes', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: features }
        });

        // Casing for cyan navigation glow
        map.addLayer({
          id: 'routes-casing',
          type: 'line',
          source: 'routes',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': '#0284C7',
            'line-width': 8,
            'line-opacity': 0.85
          }
        });

        // Inner glowing electric cyan line
        map.addLayer({
          id: 'routes-line',
          type: 'line',
          source: 'routes',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': '#00E5FF',
            'line-width': 5
          }
        });
      }

      // 3. Update Circles
      var circleFeatures = [];
      if (circles && circles.length) {
        circles.forEach(function(c) {
          if (!c.center || !c.radius) return;
          circleFeatures.push(createCircleGeoJSON(c.center.longitude, c.center.latitude, c.radius));
        });
      }

      if (map.getSource('circles')) {
        map.getSource('circles').setData({ type: 'FeatureCollection', features: circleFeatures });
      } else if (map.isStyleLoaded()) {
        map.addSource('circles', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: circleFeatures }
        });

        map.addLayer({
          id: 'circles-fill',
          type: 'fill',
          source: 'circles',
          paint: {
            'fill-color': '#00E5FF',
            'fill-opacity': 0.08
          }
        });

        map.addLayer({
          id: 'circles-stroke',
          type: 'line',
          source: 'circles',
          paint: {
            'line-color': '#00E5FF',
            'line-width': 1.5,
            'line-opacity': 0.5
          }
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
          const isDest = Boolean(
            p.title?.toLowerCase().includes('destination') ||
            p.title?.toLowerCase().includes('station') ||
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
            isDestination: isDest && !isUser,
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

        // Search nested children
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

  // Handle messages from MapLibre
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
        source={{ html: DARK_MAP_HTML }}
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
    backgroundColor: '#0E1626',
  },
  webView: {
    flex: 1,
    backgroundColor: '#0E1626',
  },
});

export { Marker, Polyline, Circle, Callout };
export default AppMapView;
