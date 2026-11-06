import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from 'react-native-paper';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { FormField } from '@/components/FormField';
import { getErrorMessage } from '@/lib/api';
import { authApi } from '@/lib/endpoints';
import { palette, radius, spacing } from '@/theme';

const phoneSchema = z.object({
  phone: z
    .string()
    .trim()
    .regex(/^\+?[1-9]\d{7,14}$/, 'Use international format, e.g. +919800000001'),
});

const resetSchema = z
  .object({
    code: z.string().regex(/^\d{4,8}$/, 'Enter the numeric reset code'),
    newPassword: z
      .string()
      .min(8, 'At least 8 characters')
      .regex(/[a-zA-Z]/, 'Include a letter')
      .regex(/[0-9]/, 'Include a number'),
    confirmPassword: z.string().min(1, 'Confirm the new password'),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

type PhoneValues = z.infer<typeof phoneSchema>;
type ResetValues = z.infer<typeof resetSchema>;

export default function ForgotPasswordScreen() {
  const [step, setStep] = useState<'phone' | 'reset'>('phone');
  const [phone, setPhone] = useState('');
  const [devCode, setDevCode] = useState('');
  const [busy, setBusy] = useState(false);

  const phoneForm = useForm<PhoneValues>({
    resolver: zodResolver(phoneSchema),
    defaultValues: { phone: '' },
  });

  const resetForm = useForm<ResetValues>({
    resolver: zodResolver(resetSchema),
    defaultValues: { code: '', newPassword: '', confirmPassword: '' },
  });

  const requestCode = async (values: PhoneValues) => {
    setBusy(true);
    try {
      const result = await authApi.forgotPassword(values.phone);
      setPhone(values.phone);
      setDevCode(result.devCode ?? '');
      setStep('reset');
    } catch (error) {
      Alert.alert('Could not send reset code', getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async (values: ResetValues) => {
    setBusy(true);
    try {
      await authApi.resetPassword({
        phone,
        code: values.code,
        newPassword: values.newPassword,
      });
      Alert.alert('Password updated', 'Sign in with your new password.', [
        { text: 'OK', onPress: () => router.replace('/(auth)/login') },
      ]);
    } catch (error) {
      Alert.alert('Reset failed', getErrorMessage(error));
    } finally {
      setBusy(false);
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
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Pressable onPress={handleBack} hitSlop={10} style={styles.backButton}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={palette.ink} />
        </Pressable>

        <Text style={styles.title}>{step === 'phone' ? 'Reset your password' : 'Set a new password'}</Text>
        <Text style={styles.subtitle}>
          {step === 'phone'
            ? 'Enter the phone number on your account and we will send a reset code.'
            : `Enter the code sent to ${phone} and choose a new password.`}
        </Text>

        {step === 'phone' ? (
          <View style={styles.card}>
            <Controller
              control={phoneForm.control}
              name="phone"
              render={({ field: { onChange, onBlur, value } }) => (
                <FormField
                  label="Phone number"
                  placeholder="+919800000001"
                  keyboardType="phone-pad"
                  autoCapitalize="none"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={phoneForm.formState.errors.phone?.message}
                />
              )}
            />
            <Button
              mode="contained"
              onPress={() => {
                void phoneForm.handleSubmit(requestCode)();
              }}
              loading={busy}
              disabled={busy}
              style={styles.button}
              contentStyle={styles.buttonContent}
            >
              Send reset code
            </Button>
          </View>
        ) : (
          <View style={styles.card}>
            {devCode ? (
              <View style={styles.devBanner}>
                <MaterialCommunityIcons name="flask-outline" size={16} color="#8A6100" />
                <Text style={styles.devText}>Development code: {devCode}</Text>
              </View>
            ) : null}

            <Controller
              control={resetForm.control}
              name="code"
              render={({ field: { onChange, onBlur, value } }) => (
                <FormField
                  label="Reset code"
                  placeholder="000000"
                  keyboardType="number-pad"
                  value={value}
                  onChangeText={(next) => onChange(next.replace(/\D/g, '').slice(0, 8))}
                  onBlur={onBlur}
                  error={resetForm.formState.errors.code?.message}
                />
              )}
            />
            <Controller
              control={resetForm.control}
              name="newPassword"
              render={({ field: { onChange, onBlur, value } }) => (
                <FormField
                  label="New password"
                  secureTextEntry
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={resetForm.formState.errors.newPassword?.message}
                />
              )}
            />
            <Controller
              control={resetForm.control}
              name="confirmPassword"
              render={({ field: { onChange, onBlur, value } }) => (
                <FormField
                  label="Confirm new password"
                  secureTextEntry
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={resetForm.formState.errors.confirmPassword?.message}
                />
              )}
            />
            <Button
              mode="contained"
              onPress={() => {
                void resetForm.handleSubmit(resetPassword)();
              }}
              loading={busy}
              disabled={busy}
              style={styles.button}
              contentStyle={styles.buttonContent}
            >
              Update password
            </Button>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: palette.background },
  scroll: { flexGrow: 1, paddingHorizontal: spacing.lg, paddingTop: 56, paddingBottom: 60 },
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
  title: { fontSize: 26, fontWeight: '800', color: palette.ink, marginTop: spacing.xl },
  subtitle: { fontSize: 14, color: palette.muted, marginTop: 8, lineHeight: 20, marginBottom: spacing.xl },
  card: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.lg,
  },
  devBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFF4D6',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    marginBottom: spacing.md,
  },
  devText: { color: '#8A6100', fontSize: 12.5, fontWeight: '700' },
  button: { marginTop: spacing.md, borderRadius: radius.md },
  buttonContent: { paddingVertical: 6 },
});
