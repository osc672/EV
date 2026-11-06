import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { palette, radius, spacing } from '@/theme';

interface SignOutModalProps {
  visible: boolean;
  onDismiss: () => void;
  onConfirm: () => Promise<void>;
  role?: 'DRIVER' | 'PROVIDER' | 'ADMIN';
  userName?: string;
}

export function SignOutModal({
  visible,
  onDismiss,
  onConfirm,
  role = 'DRIVER',
  userName,
}: SignOutModalProps) {
  const [isSigningOut, setIsSigningOut] = useState(false);

  // Animation values
  const scaleAnim = useRef(new Animated.Value(0.85)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const spinAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Spin loop for the signing-out state
  useEffect(() => {
    if (isSigningOut) {
      const spinLoop = Animated.loop(
        Animated.timing(spinAnim, {
          toValue: 1,
          duration: 1000,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      );
      const pulseLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.12,
            duration: 600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 0.95,
            duration: 600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );
      spinLoop.start();
      pulseLoop.start();
      return () => {
        spinLoop.stop();
        pulseLoop.stop();
      };
    }
  }, [isSigningOut, spinAnim, pulseAnim]);

  // Entrance animation
  useEffect(() => {
    if (visible) {
      setIsSigningOut(false);
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 8,
          tension: 40,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, fadeAnim, scaleAnim]);

  const handleSignOutPress = async () => {
    setIsSigningOut(true);
    // Smooth delay so the user appreciates the animation before session wipes
    try {
      await new Promise((r) => setTimeout(r, 850));
      await onConfirm();
    } catch {
      setIsSigningOut(false);
      onDismiss();
    }
  };

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const roleTheme = {
    PROVIDER: {
      color: '#D97706',
      bg: '#FEF3C7',
      label: 'Host Session',
      icon: 'ev-station' as const,
    },
    ADMIN: {
      color: '#DC2626',
      bg: '#FEE2E2',
      label: 'Admin Console',
      icon: 'shield-account' as const,
    },
    DRIVER: {
      color: '#059669',
      bg: '#ECFDF5',
      label: 'Driver Account',
      icon: 'car-electric' as const,
    },
  }[role];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={() => {
        if (!isSigningOut) onDismiss();
      }}
    >
      <View style={styles.backdrop}>
        <Animated.View
          style={[
            styles.card,
            {
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          {isSigningOut ? (
            /* Animated Signing-Out State */
            <View style={styles.signingOutContainer}>
              <View style={styles.spinnerWrapper}>
                <Animated.View
                  style={[
                    styles.spinnerRing,
                    {
                      borderColor: roleTheme.color,
                      transform: [{ rotate: spin }],
                    },
                  ]}
                />
                <Animated.View
                  style={[
                    styles.centerIconWrap,
                    {
                      backgroundColor: roleTheme.bg,
                      transform: [{ scale: pulseAnim }],
                    },
                  ]}
                >
                  <MaterialCommunityIcons
                    name={roleTheme.icon}
                    size={28}
                    color={roleTheme.color}
                  />
                </Animated.View>
              </View>

              <Text style={styles.signingOutTitle}>Signing Out…</Text>
              <Text style={styles.signingOutSub}>
                Safely clearing your session credentials and active cache
              </Text>

              <View style={[styles.rolePill, { backgroundColor: roleTheme.bg }]}>
                <View style={[styles.roleDot, { backgroundColor: roleTheme.color }]} />
                <Text style={[styles.rolePillText, { color: roleTheme.color }]}>
                  {roleTheme.label}
                </Text>
              </View>
            </View>
          ) : (
            /* Confirmation Dialog State */
            <View>
              <View style={styles.topIconRow}>
                <View style={[styles.iconCircle, { backgroundColor: '#FEE2E2' }]}>
                  <MaterialCommunityIcons name="logout-variant" size={28} color="#DC2626" />
                </View>
                <View style={[styles.rolePill, { backgroundColor: roleTheme.bg }]}>
                  <MaterialCommunityIcons
                    name={roleTheme.icon}
                    size={12}
                    color={roleTheme.color}
                  />
                  <Text style={[styles.rolePillText, { color: roleTheme.color }]}>
                    {roleTheme.label}
                  </Text>
                </View>
              </View>

              <Text style={styles.title}>Sign out of EV Rescue?</Text>
              <Text style={styles.description}>
                {userName ? `Signed in as ${userName}. ` : ''}
                You will need your password or one-time verification to access your charging stations
                and reservations again.
              </Text>

              <View style={styles.buttonRow}>
                <Pressable
                  style={styles.cancelBtn}
                  onPress={onDismiss}
                  android_ripple={{ color: '#E2E8F0' }}
                >
                  <Text style={styles.cancelBtnText}>Stay signed in</Text>
                </Pressable>

                <Pressable
                  style={styles.signOutBtn}
                  onPress={() => void handleSignOutPress()}
                  android_ripple={{ color: '#B91C1C' }}
                >
                  <MaterialCommunityIcons name="logout" size={16} color="#FFFFFF" />
                  <Text style={styles.signOutBtnText}>Sign out</Text>
                </Pressable>
              </View>
            </View>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 27, 20, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.28,
    shadowRadius: 20,
    elevation: 16,
  },
  topIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rolePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  roleDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  rolePillText: {
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: palette.ink,
    letterSpacing: -0.3,
    marginBottom: 6,
  },
  description: {
    fontSize: 13.5,
    color: palette.muted,
    lineHeight: 20,
    marginBottom: 20,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#475569',
  },
  signOutBtn: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#DC2626',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  signOutBtnText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  signingOutContainer: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  spinnerWrapper: {
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  spinnerRing: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3.5,
    borderTopColor: 'transparent',
    borderRightColor: 'transparent',
  },
  centerIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signingOutTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: palette.ink,
    marginBottom: 6,
  },
  signingOutSub: {
    fontSize: 12.5,
    color: palette.muted,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 14,
  },
});

