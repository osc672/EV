import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

const { width } = Dimensions.get('window');

interface AppSplashScreenProps {
  onFinish?: () => void;
  fadeOut?: boolean;
}

export function AppSplashScreen({ onFinish, fadeOut }: AppSplashScreenProps) {
  const containerOpacity = useRef(new Animated.Value(1)).current;
  const radar1 = useRef(new Animated.Value(0)).current;
  const radar2 = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.85)).current;
  const floatAnim = useRef(new Animated.Value(0)).current;
  const pulseDot = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    // 1. Radar wave 1
    const loopRadar1 = Animated.loop(
      Animated.timing(radar1, {
        toValue: 1,
        duration: 2200,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    );

    // 2. Radar wave 2
    const loopRadar2 = Animated.loop(
      Animated.sequence([
        Animated.delay(700),
        Animated.timing(radar2, {
          toValue: 1,
          duration: 2200,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );

    // 3. Gentle logo float
    const loopFloat = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: -8,
          duration: 1500,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: 0,
          duration: 1500,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );

    // 4. Subtle pulse for loading indicator
    const loopPulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseDot, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(pulseDot, {
          toValue: 0.4,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    );

    // Initial logo spring
    Animated.spring(logoScale, {
      toValue: 1,
      friction: 6,
      tension: 40,
      useNativeDriver: true,
    }).start();

    loopRadar1.start();
    loopRadar2.start();
    loopFloat.start();
    loopPulse.start();

    return () => {
      loopRadar1.stop();
      loopRadar2.stop();
      loopFloat.stop();
      loopPulse.stop();
    };
  }, []);

  useEffect(() => {
    if (fadeOut) {
      Animated.timing(containerOpacity, {
        toValue: 0,
        duration: 350,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start(() => {
        onFinish?.();
      });
    }
  }, [fadeOut, onFinish]);

  const radarScale1 = radar1.interpolate({
    inputRange: [0, 1],
    outputRange: [0.9, 2.3],
  });
  const radarOpacity1 = radar1.interpolate({
    inputRange: [0, 0.6, 1],
    outputRange: [0.6, 0.2, 0],
  });

  const radarScale2 = radar2.interpolate({
    inputRange: [0, 1],
    outputRange: [0.9, 2.7],
  });
  const radarOpacity2 = radar2.interpolate({
    inputRange: [0, 0.6, 1],
    outputRange: [0.5, 0.15, 0],
  });

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.root, { opacity: containerOpacity }]}>
      <LinearGradient
        colors={['#021B14', '#043425', '#064E3B', '#021B14']}
        locations={[0, 0.35, 0.7, 1]}
        style={styles.gradient}
      >
        {/* Ambient Top & Bottom Glows */}
        <View style={styles.ambientTop} pointerEvents="none" />
        <View style={styles.ambientBottom} pointerEvents="none" />

        {/* Center Hero Logo & Radar */}
        <View style={styles.centerHero}>
          {/* Radar Ring 1 */}
          <Animated.View
            style={[
              styles.radarRing,
              {
                transform: [{ scale: radarScale1 }],
                opacity: radarOpacity1,
              },
            ]}
          />
          {/* Radar Ring 2 */}
          <Animated.View
            style={[
              styles.radarRing,
              {
                transform: [{ scale: radarScale2 }],
                opacity: radarOpacity2,
              },
            ]}
          />

          {/* Floating Logo Badge */}
          <Animated.View
            style={[
              styles.logoBadge,
              {
                transform: [{ scale: logoScale }, { translateY: floatAnim }],
              },
            ]}
          >
            <LinearGradient
              colors={['#10B981', '#059669', '#047857']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.logoGradient}
            >
              <MaterialCommunityIcons name="car-electric" size={54} color="#FFFFFF" />
            </LinearGradient>

            {/* Gold Lightning Bolt Badge */}
            <View style={styles.lightningBadge}>
              <MaterialCommunityIcons name="lightning-bolt" size={20} color="#F59E0B" />
            </View>
          </Animated.View>

          {/* Typography */}
          <Text style={styles.brandTitle}>EV RESCUE</Text>
          <Text style={styles.brandSubtitle}>RAPID CHARGING NETWORK</Text>
        </View>

        {/* Bottom Loading Indicator */}
        <View style={styles.bottomLoader}>
          <Animated.View style={[styles.pulsePill, { opacity: pulseDot }]}>
            <View style={styles.pulseDot} />
            <Text style={styles.loadingText}>Initializing verified network…</Text>
          </Animated.View>
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    zIndex: 9999,
    backgroundColor: '#021B14',
  },
  gradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ambientTop: {
    position: 'absolute',
    top: -80,
    width: width * 1.2,
    height: 320,
    borderRadius: width,
    backgroundColor: 'rgba(16, 185, 129, 0.16)',
  },
  ambientBottom: {
    position: 'absolute',
    bottom: -120,
    width: width * 1.3,
    height: 360,
    borderRadius: width,
    backgroundColor: 'rgba(5, 150, 105, 0.18)',
  },
  centerHero: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 280,
    height: 280,
  },
  radarRing: {
    position: 'absolute',
    width: 170,
    height: 170,
    borderRadius: 85,
    borderWidth: 2,
    borderColor: '#34D399',
  },
  logoBadge: {
    width: 110,
    height: 110,
    borderRadius: 32,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.55,
    shadowRadius: 24,
    elevation: 16,
    position: 'relative',
    marginBottom: 24,
  },
  logoGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  lightningBadge: {
    position: 'absolute',
    bottom: -6,
    right: -6,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#021B14',
    borderWidth: 2.5,
    borderColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 8,
  },
  brandTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 6,
    textAlign: 'center',
    textShadowColor: 'rgba(16, 185, 129, 0.6)',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 16,
  },
  brandSubtitle: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#34D399',
    letterSpacing: 4,
    marginTop: 6,
    textAlign: 'center',
  },
  bottomLoader: {
    position: 'absolute',
    bottom: 50,
    alignItems: 'center',
  },
  pulsePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(6, 78, 59, 0.6)',
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.25)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  loadingText: {
    fontSize: 12,
    color: '#A7F3D0',
    fontWeight: '600',
    letterSpacing: 0.5,
  },
});
