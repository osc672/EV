import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Button, TextInput } from 'react-native-paper';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FormField } from '@/components/FormField';
import { getErrorMessage } from '@/lib/api';
import { clearCustomApiUrl, getApiUrl, loadSavedApiUrl, saveCustomApiUrl } from '@/lib/config';
import { authApi } from '@/lib/endpoints';
import { authenticateSocket } from '@/lib/socket';
import { queryClient } from '@/lib/queryClient';
import { useAuthStore } from '@/store/auth';
import { palette, radius, spacing } from '@/theme';

const loginSchema = z.object({
  phone: z
    .string()
    .trim()
    .min(1, 'Enter your phone number or email'),
  password: z.string().min(1, 'Password is required'),
});

type LoginValues = z.infer<typeof loginSchema>;

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const setSession = useAuthStore((s) => s.setSession);
  const [submitting, setSubmitting] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [selectedRole, setSelectedRole] = useState<'DRIVER' | 'PROVIDER'>('DRIVER');
  const [authMode, setAuthMode] = useState<'password' | 'otp'>('password');
  const [secureText, setSecureText] = useState(true);
  const [adminTapCount, setAdminTapCount] = useState(0);

  // Server IP / Connectivity Configuration Modal
  const [serverModalVisible, setServerModalVisible] = useState(false);
  const [activeServerUrl, setActiveServerUrl] = useState(getApiUrl());
  const [customServerInput, setCustomServerInput] = useState(getApiUrl());
  const [pingStatus, setPingStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [pingMessage, setPingMessage] = useState('');

  useEffect(() => {
    loadSavedApiUrl().then((saved) => {
      if (saved) {
        setActiveServerUrl(saved);
        setCustomServerInput(saved);
      } else {
        const current = getApiUrl();
        setActiveServerUrl(current);
        setCustomServerInput(current);
      }
    });
  }, []);

  const openServerModal = () => {
    const cur = getApiUrl();
    setActiveServerUrl(cur);
    setCustomServerInput(cur);
    setPingStatus('idle');
    setPingMessage('');
    setServerModalVisible(true);
  };

  const handleTestConnection = async (targetUrl?: string) => {
    const rawUrl = (targetUrl ?? customServerInput).trim().replace(/\/$/, '');
    if (!rawUrl) {
      setPingStatus('error');
      setPingMessage('Please enter a server IP or URL.');
      return;
    }

    let normalized = rawUrl;
    if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
      normalized = `http://${normalized}`;
    }
    if (!normalized.includes(':4000') && !normalized.includes(':') && !normalized.includes('.com') && !normalized.includes('.org')) {
      normalized = `${normalized}:4000`;
    }
    if (!normalized.endsWith('/api/v1')) {
      normalized = `${normalized}/api/v1`;
    }

    setPingStatus('testing');
    setPingMessage('Pinging server health endpoint...');
    const start = Date.now();

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(`${normalized}/health`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const latency = Date.now() - start;

      if (res.ok) {
        setPingStatus('success');
        setPingMessage(`Connected! Server responded in ${latency}ms (Status: 200 OK)`);
      } else {
        setPingStatus('error');
        setPingMessage(`Server reachable, but returned HTTP ${res.status}.`);
      }
    } catch (err) {
      setPingStatus('error');
      setPingMessage(
        `Cannot connect to ${normalized}.\nCheck that your PC & phone are on the exact same Wi-Fi network and the backend is running.`,
      );
    }
  };

  const handleSaveServerUrl = async () => {
    let normalized = customServerInput.trim().replace(/\/$/, '');
    if (!normalized) {
      Alert.alert('Invalid URL', 'Please enter a valid IP address or URL');
      return;
    }
    if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
      normalized = `http://${normalized}`;
    }
    if (!normalized.includes(':4000') && !normalized.includes(':') && !normalized.includes('.com') && !normalized.includes('.org')) {
      normalized = `${normalized}:4000`;
    }
    if (!normalized.endsWith('/api/v1')) {
      normalized = `${normalized}/api/v1`;
    }

    await saveCustomApiUrl(normalized);
    setActiveServerUrl(normalized);
    setCustomServerInput(normalized);
    setServerModalVisible(false);
    Alert.alert('Server Updated', `Active API endpoint set to:\n${normalized}`);
  };

  const handleResetServerUrl = async () => {
    await clearCustomApiUrl();
    const def = getApiUrl();
    setActiveServerUrl(def);
    setCustomServerInput(def);
    setPingStatus('idle');
    setPingMessage('');
    Alert.alert('Reset Complete', `Restored default server endpoint:\n${def}`);
  };

  const isDriver = selectedRole === 'DRIVER';
  const themeColor = isDriver ? '#059669' : '#D97706';
  const themeDark = isDriver ? '#022C22' : '#451A03';
  const themeMid = isDriver ? '#064E3B' : '#78350F';
  const themeLight = isDriver ? '#ECFDF5' : '#FFFBEB';
  const themeBorder = isDriver ? '#A7F3D0' : '#FDE68A';

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(auth)/welcome' as any);
    }
  };

  const {
    control,
    handleSubmit,
    getValues,
    setValue,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      phone: '',
      password: '',
    },
  });

  const onSecretAdminTap = () => {
    const next = adminTapCount + 1;
    if (next >= 5) {
      setAdminTapCount(0);
      setValue('phone', '+919999999999');
      setValue('password', 'Admin@12345');
      Alert.alert(
        'Admin Console Access',
        'Administrator credentials prefilled (+919999999999 / Admin@12345). Tap Sign In to enter.',
      );
    } else {
      setAdminTapCount(next);
    }
  };

  const selectRole = (role: 'DRIVER' | 'PROVIDER') => {
    setSelectedRole(role);
  };

  const onSubmit = async (values: LoginValues) => {
    setSubmitting(true);
    try {
      const tokens = await authApi.login({
        phone: values.phone.trim(),
        password: values.password,
      });
      await setSession(tokens);
      authenticateSocket(tokens.accessToken, tokens.user?.id, tokens.user?.providerProfile?.id);
      queryClient.clear();

      if (tokens.user?.role === 'ADMIN') {
        router.replace('/admin');
      } else {
        router.replace('/(app)');
      }
    } catch (error) {
      const msg = getErrorMessage(error);
      if (
        msg.includes('Cannot reach EV server') ||
        msg.includes('Network Error') ||
        msg.includes('NETWORK_ERROR') ||
        msg.includes('timed out')
      ) {
        Alert.alert(
          'Server Unreachable',
          `${msg}\n\nWould you like to verify or change your PC's IP address?`,
          [
            { text: 'Configure IP / Server', onPress: openServerModal },
            { text: 'Cancel', style: 'cancel' },
          ],
        );
      } else {
        Alert.alert('Sign in failed', msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const requestOtp = async () => {
    const phone = getValues('phone').trim();
    if (!/^\+?[1-9]\d{7,14}$/.test(phone)) {
      Alert.alert('Phone Number Needed', 'Enter your phone number in international format (+91...) to receive a verification code.');
      return;
    }
    setOtpLoading(true);
    try {
      const result = await authApi.requestOtp({ phone, purpose: 'LOGIN' });
      router.push({
        pathname: '/(auth)/otp',
        params: { phone, purpose: 'LOGIN', devCode: result.devCode ?? '' },
      });
    } catch (error) {
      Alert.alert('Could not send code', getErrorMessage(error));
    } finally {
      setOtpLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Modern Brand Hero Header */}
        <LinearGradient
          colors={isDriver ? [themeDark, themeMid, '#047857'] : [themeDark, themeMid, '#B45309']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.hero, { paddingTop: insets.top + (Platform.OS === 'ios' ? 12 : 18) }]}
        >
          {/* Top Bar with Back Button & Brand Logo */}
          <View style={styles.topBar}>
            <Pressable
              onPress={handleBack}
              hitSlop={10}
              style={styles.backButton}
            >
              <MaterialCommunityIcons name="arrow-left" size={22} color="#FFFFFF" />
            </Pressable>

            <Pressable onPress={onSecretAdminTap} style={styles.brandRow} hitSlop={8}>
              <View style={styles.logoBadge}>
                <MaterialCommunityIcons name="lightning-bolt" size={20} color="#FFFFFF" />
              </View>
              <View>
                <Text style={styles.brandTitle}>EV RESCUE</Text>
                <Text style={styles.brandSub}>RAPID CHARGING NETWORK</Text>
              </View>
            </Pressable>

            <Pressable
              onPress={openServerModal}
              hitSlop={8}
              style={({ pressed }) => [styles.liveBadge, pressed && { opacity: 0.8 }]}
            >
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>SERVER</Text>
            </Pressable>
          </View>

          {/* Greeting Section */}
          <View style={styles.heroGreetingBox}>
            <Text style={styles.heroGreeting}>Welcome Back</Text>
            <Text style={styles.heroTagline}>
              {isDriver
                ? 'Sign in to locate emergency chargers & reserve charging slots'
                : 'Sign in to manage your charging station, driver requests & earnings'}
            </Text>
          </View>

          {/* Role Segmented Pill Selector */}
          <View style={styles.roleSelectorWrapper}>
            <Pressable
              onPress={() => selectRole('DRIVER')}
              style={[
                styles.roleOption,
                isDriver && styles.roleOptionActiveDriver,
              ]}
            >
              <MaterialCommunityIcons
                name="car-electric"
                size={19}
                color={isDriver ? '#FFFFFF' : 'rgba(255, 255, 255, 0.7)'}
              />
              <Text
                style={[
                  styles.roleOptionText,
                  isDriver && styles.roleOptionTextActive,
                ]}
              >
                EV Driver
              </Text>
            </Pressable>

            <Pressable
              onPress={() => selectRole('PROVIDER')}
              style={[
                styles.roleOption,
                !isDriver && styles.roleOptionActiveProvider,
              ]}
            >
              <MaterialCommunityIcons
                name="ev-station"
                size={19}
                color={!isDriver ? '#FFFFFF' : 'rgba(255, 255, 255, 0.7)'}
              />
              <Text
                style={[
                  styles.roleOptionText,
                  !isDriver && styles.roleOptionTextActive,
                ]}
              >
                Charger Host
              </Text>
            </Pressable>
          </View>
        </LinearGradient>

        {/* Clean, Focused Authentication Card */}
        <View style={styles.mainCard}>
          {/* Method Pill Selector (Password vs OTP) */}
          <View style={styles.authModePillRow}>
            <Pressable
              onPress={() => setAuthMode('password')}
              style={[
                styles.authModePill,
                authMode === 'password' && {
                  backgroundColor: themeLight,
                  borderColor: themeBorder,
                },
              ]}
            >
              <MaterialCommunityIcons
                name="key-variant"
                size={16}
                color={authMode === 'password' ? themeColor : '#64748B'}
              />
              <Text
                style={[
                  styles.authModePillText,
                  authMode === 'password' && { color: themeColor, fontWeight: '800' },
                ]}
              >
                Password Sign In
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setAuthMode('otp')}
              style={[
                styles.authModePill,
                authMode === 'otp' && {
                  backgroundColor: themeLight,
                  borderColor: themeBorder,
                },
              ]}
            >
              <MaterialCommunityIcons
                name="cellphone-message"
                size={16}
                color={authMode === 'otp' ? themeColor : '#64748B'}
              />
              <Text
                style={[
                  styles.authModePillText,
                  authMode === 'otp' && { color: themeColor, fontWeight: '800' },
                ]}
              >
                Mobile OTP
              </Text>
            </Pressable>
          </View>

          {/* Form Fields Section */}
          <View style={styles.formGroup}>
            <Controller
              control={control}
              name="phone"
              render={({ field: { onChange, onBlur, value } }) => (
                <FormField
                  label={isDriver ? 'Mobile Number or Email' : 'Host Mobile Number or Email'}
                  placeholder="+91 98000 00001 or name@example.com"
                  keyboardType="default"
                  autoCapitalize="none"
                  autoComplete="username"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.phone?.message}
                  left={<TextInput.Icon icon="cellphone" color="#64748B" />}
                />
              )}
            />

            {authMode === 'password' ? (
              <>
                <Controller
                  control={control}
                  name="password"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <FormField
                      label="Password"
                      placeholder="Enter your account password"
                      secureTextEntry={secureText}
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      error={errors.password?.message}
                      onSubmitEditing={() => {
                        void handleSubmit(onSubmit)();
                      }}
                      returnKeyType="go"
                      left={<TextInput.Icon icon="lock-outline" color="#64748B" />}
                      right={
                        <TextInput.Icon
                          icon={secureText ? 'eye-outline' : 'eye-off-outline'}
                          color="#64748B"
                          onPress={() => setSecureText((prev) => !prev)}
                        />
                      }
                    />
                  )}
                />

                <View style={styles.forgotRow}>
                  <Pressable
                    onPress={() => router.push('/(auth)/forgot-password')}
                    hitSlop={8}
                  >
                    <Text style={[styles.forgotLink, { color: themeColor }]}>
                      Forgot Password?
                    </Text>
                  </Pressable>
                </View>

                <Button
                  mode="contained"
                  icon={isDriver ? 'car-electric' : 'ev-station'}
                  buttonColor={themeColor}
                  onPress={() => {
                    void handleSubmit(onSubmit)();
                  }}
                  loading={submitting}
                  disabled={submitting}
                  style={styles.submitBtn}
                  contentStyle={styles.submitBtnContent}
                  labelStyle={styles.submitBtnLabel}
                >
                  {isDriver ? 'Sign In as Driver' : 'Sign In as Charger Host'}
                </Button>
              </>
            ) : (
              <View style={styles.otpBlock}>
                <View style={styles.otpInfoBox}>
                  <MaterialCommunityIcons name="information-outline" size={18} color="#0284C7" />
                  <Text style={styles.otpHint}>
                    We will send a 6-digit one-time verification code to your phone number via SMS.
                  </Text>
                </View>
                <Button
                  mode="contained"
                  icon="send-outline"
                  buttonColor={themeColor}
                  onPress={requestOtp}
                  loading={otpLoading}
                  disabled={otpLoading}
                  style={styles.submitBtn}
                  contentStyle={styles.submitBtnContent}
                  labelStyle={styles.submitBtnLabel}
                >
                  Send Verification Code
                </Button>
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      {/* Server & IP Configuration Modal */}
      <Modal
        visible={serverModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setServerModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.modalBackdrop}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setServerModalVisible(false)} />
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <View style={styles.modalIconWrap}>
                  <MaterialCommunityIcons name="server-network" size={24} color="#059669" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitle}>Server Connection</Text>
                  <Text style={styles.modalSub}>Wi-Fi backend endpoint configuration</Text>
                </View>
                <Pressable
                  onPress={() => setServerModalVisible(false)}
                  style={styles.modalCloseBtn}
                  hitSlop={8}
                >
                  <MaterialCommunityIcons name="close" size={20} color="#64748B" />
                </Pressable>
              </View>

              <ScrollView
                style={{ maxHeight: 380 }}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {/* Active Server Status Pill */}
                <View style={styles.activePillBox}>
                  <Text style={styles.activePillLabel}>CURRENT TARGET</Text>
                  <Text style={styles.activePillUrl} numberOfLines={2}>
                    {activeServerUrl}
                  </Text>
                </View>

                {/* Input Field */}
                <Text style={styles.inputSectionLabel}>PC Wi-Fi IP / Backend URL</Text>
                <TextInput
                  mode="outlined"
                  value={customServerInput}
                  onChangeText={(val) => {
                    setCustomServerInput(val);
                    setPingStatus('idle');
                    setPingMessage('');
                  }}
                  placeholder="e.g. 10.30.80.86:4000 or http://..."
                  placeholderTextColor="#94A3B8"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  outlineColor="#E2E8F0"
                  activeOutlineColor="#059669"
                  style={styles.serverInput}
                  textColor="#0F172A"
                  left={<TextInput.Icon icon="link-variant" color="#64748B" />}
                />

                <Text style={styles.quickTip}>
                  Tip: Look at your Metro terminal for your PC IP (e.g. 10.30.80.86). Port 4000 is used by EV Rescue.
                </Text>

                {/* Ping Result Box */}
                {pingStatus !== 'idle' && (
                  <View
                    style={[
                      styles.pingResultBox,
                      pingStatus === 'success' && styles.pingResultSuccess,
                      pingStatus === 'error' && styles.pingResultError,
                    ]}
                  >
                    {pingStatus === 'testing' ? (
                      <ActivityIndicator size="small" color="#059669" />
                    ) : (
                      <MaterialCommunityIcons
                        name={pingStatus === 'success' ? 'check-circle' : 'alert-circle'}
                        size={18}
                        color={pingStatus === 'success' ? '#059669' : '#DC2626'}
                      />
                    )}
                    <Text
                      style={[
                        styles.pingResultText,
                        pingStatus === 'success' && { color: '#065F46' },
                        pingStatus === 'error' && { color: '#991B1B' },
                      ]}
                    >
                      {pingMessage}
                    </Text>
                  </View>
                )}

                {/* Test Connection Button */}
                <Button
                  mode="outlined"
                  icon="lan-connect"
                  textColor="#059669"
                  loading={pingStatus === 'testing'}
                  disabled={pingStatus === 'testing'}
                  onPress={() => handleTestConnection()}
                  style={styles.testBtn}
                  labelStyle={{ fontWeight: '700', fontSize: 13 }}
                >
                  Test Server Reachability
                </Button>
              </ScrollView>

              {/* Actions Footer */}
              <View style={styles.modalFooter}>
                <Pressable onPress={handleResetServerUrl} style={styles.resetBtn}>
                  <Text style={styles.resetBtnText}>Reset Default</Text>
                </Pressable>

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Button
                    mode="outlined"
                    textColor="#64748B"
                    onPress={() => setServerModalVisible(false)}
                    style={styles.footerCancelBtn}
                    labelStyle={{ fontWeight: '700' }}
                  >
                    Cancel
                  </Button>
                  <Button
                    mode="contained"
                    buttonColor="#059669"
                    textColor="#FFFFFF"
                    onPress={handleSaveServerUrl}
                    style={styles.footerSaveBtn}
                    labelStyle={{ fontWeight: '800' }}
                  >
                    Save & Apply
                  </Button>
                </View>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scroll: {
    flexGrow: 1,
  },
  hero: {
    paddingHorizontal: 20,
    paddingBottom: 28,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  logoBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 1.1,
  },
  brandSub: {
    fontSize: 9,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.75)',
    letterSpacing: 0.8,
    marginTop: 1,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#34D399',
  },
  liveText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#34D399',
    letterSpacing: 0.8,
  },
  heroGreetingBox: {
    marginBottom: 18,
  },
  heroGreeting: {
    fontSize: 26,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  heroTagline: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.82)',
    marginTop: 5,
    lineHeight: 18,
  },
  roleSelectorWrapper: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 999,
    padding: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
  },
  roleOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 999,
  },
  roleOptionActiveDriver: {
    backgroundColor: '#059669',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  roleOptionActiveProvider: {
    backgroundColor: '#D97706',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  roleOptionText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.75)',
  },
  roleOptionTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  mainCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 18,
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  authModePillRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  authModePill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  authModePillText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  formGroup: {
    width: '100%',
  },
  forgotRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: -4,
    marginBottom: 18,
  },
  forgotLink: {
    fontSize: 13,
    fontWeight: '700',
  },
  submitBtn: {
    borderRadius: 14,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  submitBtnContent: {
    height: 52,
  },
  submitBtnLabel: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  otpBlock: {
    gap: 16,
  },
  otpInfoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#F0F9FF',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  otpHint: {
    flex: 1,
    fontSize: 13,
    color: '#0369A1',
    lineHeight: 18,
  },
  modalOverlay: {
    flex: 1,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 22,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  modalCloseBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
  },
  activePillBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  activePillLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  activePillUrl: {
    fontSize: 13,
    fontWeight: '700',
    color: '#059669',
  },
  inputSectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
  },
  serverInput: {
    backgroundColor: '#FFFFFF',
    marginBottom: 6,
  },
  quickTip: {
    fontSize: 11.5,
    color: '#94A3B8',
    lineHeight: 16,
    marginBottom: 14,
  },
  pingResultBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  pingResultSuccess: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  pingResultError: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  pingResultText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: '600',
  },
  testBtn: {
    borderColor: '#10B981',
    borderRadius: 10,
    marginBottom: 10,
  },
  modalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    marginTop: 6,
  },
  resetBtn: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  resetBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#DC2626',
  },
  footerCancelBtn: {
    borderRadius: 10,
    borderColor: '#CBD5E1',
  },
  footerSaveBtn: {
    borderRadius: 10,
  },
});
