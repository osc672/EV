import React, { forwardRef } from 'react';
import { Platform, StyleSheet } from 'react-native';
import MapView, { MapViewProps, UrlTile, Marker, Polyline, Circle, Callout } from 'react-native-maps';

// High-DPI CartoDB Voyager map tiles (free, reliable, high-speed CDN, EV styling)
const CARTODB_VOYAGER_URL = 'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png';
const OSM_FALLBACK_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

export interface AppMapViewProps extends MapViewProps {
  useOpenTiles?: boolean;
}

export const AppMapView = forwardRef<MapView, AppMapViewProps>((props, ref) => {
  const { children, mapType, style, useOpenTiles = true, ...rest } = props;

  // On Android, Google Maps without a paid Google Cloud API key fails to load proprietary tiles.
  // Using mapType="none" with UrlTile provides high-definition, beautiful maps that load instantly.
  const isAndroid = Platform.OS === 'android';
  const effectiveMapType = mapType ?? (isAndroid && useOpenTiles ? 'none' : 'standard');
  const showTileOverlay = effectiveMapType === 'none' || useOpenTiles;

  return (
    <MapView
      ref={ref}
      mapType={effectiveMapType}
      style={style ?? StyleSheet.absoluteFill}
      {...rest}
    >
      {showTileOverlay && (
        <UrlTile
          urlTemplate={CARTODB_VOYAGER_URL}
          maximumZ={19}
          flipY={false}
          zIndex={-1}
          doubleTileSize={true}
        />
      )}
      {children}
    </MapView>
  );
});

AppMapView.displayName = 'AppMapView';

export { Marker, Polyline, Circle, Callout };
export default AppMapView;
