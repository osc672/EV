import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Redirect, router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { selectIsAuthenticated, useAuthStore } from '@/store/auth';

const { width } = Dimensions.get('window');

const HIGHLIGHTS = [
  {
    icon: 'flash' as const,
    title: 'Rapid Emergency Top-Up',
    desc: 'Instant roadside EV charging dispatch when battery is critical',
  },
  {
    icon: 'radar' as const,
    title: '500m Radar Discovery',
    desc: 'Find verified community & commercial chargers in your radius',
  },
  {
    icon: 'shield-check-outline' as const,
    title: 'Verified Host Network',
    desc: 'Face-verified hosts with upfront pricing per kilowatt-hour',
  },
];

export default function LandingScreen() {
  const insets = useSafeAreaInsets();
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const isHydrated = useAuthStore((s) => s.isHydrated);

  // Animation drivers
  const screenFade = useRef(new Animated.Value(1)).current;
  const radar1 = useRef(new Animated.Value(0)).current;
  const radar2 = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.4)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const floatAnim = useRef(new Animated.Value(0)).current;
  const contentFade = useRef(new Animated.Value(0)).current;
  const contentSlide = useRef(new Animated.Value(24)).current;
  const featuresFade = useRef(new Animated.Value(0)).current;
  const featuresSlide = useRef(new Animated.Value(30)).current;
  const buttonFade = useRef(new Animated.Value(0)).current;

  const navigateTo = (route: '/(auth)/login' | '/(auth)/register') => {
    router.push(route);
  };

  useEffect(() => {
    if (isHydrated && isAuthenticated) {
      return;
    }

    // 1. Radar wave loops
    const loopRadar1 = Animated.loop(
      Animated.timing(radar1, {
        toValue: 1,
        duration: 2400,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    );
    const loopRadar2 = Animated.loop(
      Animated.sequence([
        Animated.delay(800),
        Animated.timing(radar2, {
          toValue: 1,
          duration: 2400,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loopRadar1.start();
    loopRadar2.start();

    // 2. Floating emblem bounce loop
    const loopFloat = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: -6,
          duration: 1600,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: 4,
          duration: 1600,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );

    // 3. Staggered reveal sequence
    Animated.parallel([
      Animated.spring(logoScale, {
        toValue: 1,
        friction: 6,
        tension: 40,
        useNativeDriver: true,
      }),
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start(() => {
      loopFloat.start();
    });

    Animated.sequence([
      Animated.delay(250),
      Animated.parallel([
        Animated.timing(contentFade, {
          toValue: 1,
          duration: 450,
          useNativeDriver: true,
        }),
        Animated.timing(contentSlide, {
          toValue: 0,
          duration: 450,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(100),
      Animated.parallel([
        Animated.timing(featuresFade, {
          toValue: 1,
          duration: 450,
          useNativeDriver: true,
        }),
        Animated.timing(featuresSlide, {
          toValue: 0,
          duration: 450,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(buttonFade, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    return () => {
      loopRadar1.stop();
      loopRadar2.stop();
      loopFloat.stop();
    };
  }, [isAuthenticated, isHydrated]);

  if (isHydrated && isAuthenticated) {
    if (useAuthStore.getState().user?.role === 'ADMIN') {
      return <Redirect href="/admin" />;
    }
    return <Redirect href="/(app)" />;
  }

  // Radar ring interpolations
  const radarScale1 = radar1.interpolate({
    inputRange: [0, 1],
    outputRange: [0.9, 2.2],
  });
  const radarOpacity1 = radar1.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.65, 0.25, 0],
  });

  const radarScale2 = radar2.interpolate({
    inputRange: [0, 1],
    outputRange: [0.9, 2.6],
  });
  const radarOpacity2 = radar2.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.5, 0.2, 0],
  });

  return (
    <Animated.View style={[styles.root, { opacity: screenFade }]}>
      <LinearGradient
        colors={['#021B14', '#043425', '#064E3B', '#022118']}
        locations={[0, 0.35, 0.7, 1]}
        style={styles.gradient}
      >
        {/* Background Ambient Glow Orbs */}
        <View style={styles.ambientGlowTop} pointerEvents="none" />
        <View style={styles.ambientGlowBottom} pointerEvents="none" />

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingTop: insets.top + (Platform.OS === 'ios' ? 12 : 18),
              paddingBottom: insets.bottom + 24,
            },
          ]}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {/* Top Header Status Pill */}
          <View style={styles.headerBar}>
            <View style={styles.badgeTop}>
              <MaterialCommunityIcons name="lightning-bolt" size={15} color="#34D399" />
              <Text style={styles.badgeTopText}>EV RESCUE NETWORK</Text>
            </View>
          </View>

          {/* Center Animated Hero */}
          <View style={styles.heroSection}>
            {/* Radar energy wave 1 */}
            <Animated.View
              style={[
                styles.radarRing,
                {
                  transform: [{ scale: radarScale1 }],
                  opacity: radarOpacity1,
                },
              ]}
            />
            {/* Radar energy wave 2 */}
            <Animated.View
              style={[
                styles.radarRing,
                {
                  transform: [{ scale: radarScale2 }],
                  opacity: radarOpacity2,
                },
              ]}
            />

            {/* Central floating emblem */}
            <Animated.View
              style={[
                styles.emblemContainer,
                {
                  opacity: logoOpacity,
                  transform: [{ scale: logoScale }, { translateY: floatAnim }],
                },
              ]}
            >
              <LinearGradient
                colors={['#10B981', '#059669', '#047857']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.emblemGradient}
              >
                <MaterialCommunityIcons name="car-electric" size={52} color="#FFFFFF" />
              </LinearGradient>

              {/* Glowing energy badge pill */}
              <View style={styles.lightningBadge}>
                <MaterialCommunityIcons name="flash" size={15} color="#F59E0B" />
              </View>
            </Animated.View>

            {/* Title & Tagline with slide animation */}
            <Animated.View
              style={[
                styles.titleGroup,
                {
                  opacity: contentFade,
                  transform: [{ translateY: contentSlide }],
                },
              ]}
            >
              <View style={styles.brandTitleRow}>
                <Text style={styles.brandTitle}>EV RESCUE</Text>
                <View style={styles.dotIndicator} />
              </View>
              <Text style={styles.brandTagline}>
                Instant roadside power & emergency charging at your fingertips
              </Text>
            </Animated.View>

            {/* Feature Highlights Staggered */}
            <Animated.View
              style={[
                styles.featuresContainer,
                {
                  opacity: featuresFade,
                  transform: [{ translateY: featuresSlide }],
                },
              ]}
            >
              {HIGHLIGHTS.map((item, index) => (
                <View key={index} style={styles.featureItem}>
                  <View style={styles.featureIconBox}>
                    <MaterialCommunityIcons name={item.icon} size={18} color="#34D399" />
                  </View>
                  <View style={styles.featureTextBox}>
                    <Text style={styles.featureTitle}>{item.title}</Text>
                    <Text style={styles.featureDesc} numberOfLines={1}>
                      {item.desc}
                    </Text>
                  </View>
                </View>
              ))}
            </Animated.View>
          </View>

          {/* Bottom Dual Action Buttons (Login & Register) */}
          <Animated.View style={[styles.bottomSection, { opacity: buttonFade }]}>
            <Pressable
              onPress={() => navigateTo('/(auth)/login')}
              style={({ pressed }) => [
                styles.primaryBtn,
                pressed && styles.btnPressed,
              ]}
            >
              <LinearGradient
                colors={['#10B981', '#059669', '#047857']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.primaryBtnGradient}
              >
                <MaterialCommunityIcons name="login" size={20} color="#FFFFFF" />
                <Text style={styles.primaryBtnText}>Sign In to Account</Text>
                <MaterialCommunityIcons name="arrow-right" size={18} color="#FFFFFF" />
              </LinearGradient>
            </Pressable>

            <Pressable
              onPress={() => navigateTo('/(auth)/register')}
              style={({ pressed }) => [
                styles.secondaryBtn,
                pressed && styles.btnPressed,
              ]}
            >
              <MaterialCommunityIcons name="account-plus-outline" size={19} color="#34D399" />
              <Text style={styles.secondaryBtnText}>Create New Account</Text>
            </Pressable>
          </Animated.View>
        </ScrollView>
      </LinearGradient>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#021B14',
  },
  gradient: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'space-between',
  },
  ambientGlowTop: {
    position: 'absolute',
    top: -60,
    right: -40,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(52, 211, 153, 0.12)',
  },
  ambientGlowBottom: {
    position: 'absolute',
    bottom: -80,
    left: -60,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(5, 150, 105, 0.14)',
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
    zIndex: 10,
    marginBottom: 8,
  },
  badgeTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(16, 185, 129, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.35)',
  },
  badgeTopText: {
    color: '#34D399',
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: 1,
  },
  heroSection: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  radarRing: {
    position: 'absolute',
    top: 40,
    width: 130,
    height: 130,
    borderRadius: 65,
    borderWidth: 2,
    borderColor: '#34D399',
    backgroundColor: 'rgba(52, 211, 153, 0.08)',
  },
  emblemContainer: {
    width: 104,
    height: 104,
    borderRadius: 32,
    marginBottom: 20,
    shadowColor: '#34D399',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.45,
    shadowRadius: 24,
    elevation: 12,
  },
  emblemGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.28)',
  },
  lightningBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#022C22',
    borderWidth: 2,
    borderColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 6,
  },
  titleGroup: {
    alignItems: 'center',
    marginBottom: 20,
  },
  brandTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  brandTitle: {
    fontSize: 30,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 1.5,
  },
  dotIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#34D399',
    marginTop: 6,
  },
  brandTagline: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.75)',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
    maxWidth: width * 0.85,
  },
  featuresContainer: {
    width: '100%',
    gap: 9,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 12,
  },
  featureIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(52, 211, 153, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureTextBox: {
    flex: 1,
  },
  featureTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  featureDesc: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 11,
    marginTop: 2,
  },
  bottomSection: {
    paddingHorizontal: 22,
    gap: 12,
    marginTop: 16,
  },
  primaryBtn: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 8,
  },
  btnPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.985 }],
  },
  primaryBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    paddingHorizontal: 20,
    gap: 10,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1.2,
    borderColor: 'rgba(52, 211, 153, 0.4)',
    gap: 8,
  },
  secondaryBtnText: {
    color: '#34D399',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
});
