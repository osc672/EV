import { useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, TextInput } from 'react-native-paper';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router, useLocalSearchParams } from 'expo-router';

import { getErrorMessage } from '@/lib/api';
import { authApi } from '@/lib/endpoints';
import { queryClient } from '@/lib/queryClient';
import { useAuthStore } from '@/store/auth';
import { palette, radius, spacing } from '@/theme';

export default function OtpScreen() {
  const params = useLocalSearchParams<{ phone?: string; purpose?: string; devCode?: string }>();
  const phone = typeof params.phone === 'string' ? params.phone : '';
  const purpose = typeof params.purpose === 'string' ? params.purpose : 'LOGIN';

  const setSession = useAuthStore((s) => s.setSession);
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState(typeof params.devCode === 'string' ? params.devCode : '');
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [seconds, setSeconds] = useState(45);

  useEffect(() => {
    if (seconds <= 0) return;
    const timer = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [seconds]);

  const maskedPhone = useMemo(() => {
    if (phone.length < 4) return phone;
    return `${phone.slice(0, 3)}•••••${phone.slice(-3)}`;
  }, [phone]);

  const verify = async () => {
    if (!/^\d{4,8}$/.test(code)) {
      Alert.alert('Enter the code', 'Type the numeric code from the SMS.');
      return;
    }
    setSubmitting(true);
    try {
      const tokens = await authApi.verifyOtp({ phone, code, purpose });
      await setSession(tokens);
      queryClient.clear();
      router.replace('/(app)');
    } catch (error) {
      Alert.alert('Verification failed', getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const resend = async () => {
    setResending(true);
    try {
      const result = await authApi.requestOtp({ phone, purpose });
      setDevCode(result.devCode ?? '');
      setSeconds(45);
      Alert.alert('Code sent', 'A new one-time code is on its way.');
    } catch (error) {
      Alert.alert('Could not resend', getErrorMessage(error));
    } finally {
      setResending(false);
    }
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(auth)/login');
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.container}>
        <Pressable onPress={handleBack} hitSlop={10} style={styles.backButton}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={palette.ink} />
        </Pressable>

        <View style={styles.iconWrap}>
          <MaterialCommunityIcons name="message-processing-outline" size={32} color={palette.primary} />
        </View>

        <Text style={styles.title}>Enter your code</Text>
        <Text style={styles.subtitle}>
          We sent a one-time code to <Text style={styles.phone}>{maskedPhone}</Text>
        </Text>

        {devCode ? (
          <View style={styles.devBanner}>
            <MaterialCommunityIcons name="flask-outline" size={16} color="#8A6100" />
            <Text style={styles.devText}>Development code: {devCode}</Text>
          </View>
        ) : null}

        <TextInput
          mode="outlined"
          value={code}
          onChangeText={(next) => setCode(next.replace(/\D/g, '').slice(0, 6))}
          keyboardType="number-pad"
          maxLength={6}
          placeholder="000000"
          style={styles.codeInput}
          outlineColor={palette.border}
          activeOutlineColor={palette.primary}
          textColor={palette.ink}
          contentStyle={styles.codeContent}
          autoFocus
        />

        <Button
          mode="contained"
          onPress={verify}
          loading={submitting}
          disabled={submitting}
          style={styles.button}
          contentStyle={styles.buttonContent}
        >
          Verify and continue
        </Button>

        <View style={styles.resendRow}>
          <Text style={styles.resendText}>
            {seconds > 0 ? `Resend code in ${seconds}s` : 'Did not receive the code?'}
          </Text>
          <Pressable onPress={resend} disabled={seconds > 0 || resending} hitSlop={8}>
            <Text style={[styles.resendLink, (seconds > 0 || resending) && styles.disabled]}>
              {resending ? 'Sending...' : 'Resend'}
            </Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: palette.background },
  container: { flex: 1, paddingHorizontal: spacing.xl, paddingTop: 56 },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: palette.border,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 22,
    backgroundColor: palette.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xxl,
  },
  title: { fontSize: 26, fontWeight: '800', color: palette.ink, marginTop: spacing.lg },
  subtitle: { fontSize: 14, color: palette.muted, marginTop: 8, lineHeight: 20 },
  phone: { color: palette.ink, fontWeight: '700' },
  devBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFF4D6',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    marginTop: spacing.lg,
    alignSelf: 'flex-start',
  },
  devText: { color: '#8A6100', fontSize: 12.5, fontWeight: '700' },
  codeInput: { marginTop: spacing.xl, backgroundColor: palette.surface },
  codeContent: { fontSize: 28, letterSpacing: 12, textAlign: 'center', paddingVertical: 10 },
  button: { marginTop: spacing.lg, borderRadius: radius.md },
  buttonContent: { paddingVertical: 6 },
  resendRow: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: spacing.xl },
  resendText: { color: palette.muted, fontSize: 13 },
  resendLink: { color: palette.primary, fontWeight: '800', fontSize: 13 },
  disabled: { opacity: 0.45 },
});
