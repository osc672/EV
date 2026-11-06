import React, { useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Button, TextInput } from 'react-native-paper';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FormField } from '@/components/FormField';
import { getErrorMessage } from '@/lib/api';
import { authApi, uploadsApi, usersApi } from '@/lib/endpoints';
import { queryClient } from '@/lib/queryClient';
import { useAuthStore } from '@/store/auth';
import { palette, radius, spacing } from '@/theme';

const registerSchema = z
  .object({
    fullName: z.string().trim().min(2, 'Enter your full name').max(120),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[1-9]\d{7,14}$/, 'Use international format, e.g. +919800000001'),
    email: z.string().trim().email('Enter a valid email').optional().or(z.literal('')),
    password: z
      .string()
      .min(8, 'At least 8 characters')
      .regex(/[a-zA-Z]/, 'Include at least one letter')
      .regex(/[0-9]/, 'Include at least one number'),
    confirmPassword: z.string().min(1, 'Confirm your password'),
    role: z.enum(['DRIVER', 'PROVIDER']),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

type RegisterValues = z.infer<typeof registerSchema>;

export default function RegisterScreen() {
  const insets = useSafeAreaInsets();
  const setSession = useAuthStore((s) => s.setSession);
  const [submitting, setSubmitting] = useState(false);
  const [securePassword, setSecurePassword] = useState(true);
  const [secureConfirmPassword, setSecureConfirmPassword] = useState(true);
  const [photoUri, setPhotoUri] = useState<string | null>(null);

  const [selectedRole, setSelectedRole] = useState<'DRIVER' | 'PROVIDER'>('DRIVER');

  const {
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      fullName: '',
      phone: '',
      email: '',
      password: '',
      confirmPassword: '',
      role: 'DRIVER',
    },
  });

  const selectRole = (role: 'DRIVER' | 'PROVIDER') => {
    setSelectedRole(role);
    setValue('role', role);
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

  const handlePickPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow photo library access to upload your verification photo.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]?.uri) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const onSubmit = async (values: RegisterValues) => {
    if (values.role === 'PROVIDER' && !photoUri) {
      Alert.alert(
        'Host Photo Required',
        'Please upload your personal host photograph. EVRescue requires host verification so drivers can verify you are real before booking.',
      );
      return;
    }

    setSubmitting(true);
    try {
      const tokens = await authApi.register({
        fullName: values.fullName,
        phone: values.phone,
        email: values.email || undefined,
        password: values.password,
        role: values.role,
      });
      await setSession(tokens);

      if (photoUri) {
        try {
          const upload = await uploadsApi.image(photoUri, 'avatars');
          await usersApi.update({ avatarUrl: upload.url });
        } catch (imgErr) {
          console.warn('Could not save avatar during registration:', imgErr);
        }
      }

      queryClient.clear();
      router.replace('/(app)');
      if (values.role === 'PROVIDER') {
        Alert.alert(
          'Account Created',
          'Next, verify your charging point hardware and documents from the My Station tab.',
        );
      }
    } catch (error) {
      Alert.alert('Could not create account', getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Modern Brand Hero Header */}
        <LinearGradient
          colors={isDriver ? [themeDark, themeMid, '#047857'] : [themeDark, themeMid, '#B45309']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.hero, { paddingTop: insets.top + (Platform.OS === 'ios' ? 12 : 20) }]}
        >
          {/* Top Bar with Back Button */}
          <View style={styles.topRow}>
            <Pressable
              onPress={handleBack}
              hitSlop={10}
              style={styles.backButton}
            >
              <MaterialCommunityIcons name="arrow-left" size={22} color="#FFFFFF" />
            </Pressable>

            <View style={styles.logoBadge}>
              <MaterialCommunityIcons name="lightning-bolt" size={18} color="#FFFFFF" />
              <Text style={styles.logoText}>EV RESCUE</Text>
            </View>
          </View>

          {/* Header Title Section */}
          <View style={styles.heroContent}>
            <Text style={styles.heroTitle}>Create Account</Text>
            <Text style={styles.heroSubtitle}>
              {isDriver
                ? 'Join the rapid emergency EV charging and discovery network'
                : 'Turn your charging station or home socket into reliable income'}
            </Text>
          </View>

          {/* Role Segmented Pill (No negative margin collision) */}
          <View style={styles.roleSelectorCard}>
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

        {/* Clean, Non-Overlapping Form Card */}
        <View style={styles.card}>
          <View style={styles.cardHeaderBox}>
            <Text style={styles.formHeaderTitle}>
              {isDriver ? 'Driver Registration' : 'Charger Host Registration'}
            </Text>
            <Text style={styles.formHeaderSub}>
              {isDriver
                ? 'Enter your details to reserve emergency charging slots.'
                : 'Enter your host profile to list your verified charging point.'}
            </Text>
          </View>

          <View style={styles.formGroup}>
            {/* Host Verification Photograph (Provider side only) */}
            {!isDriver ? (
              <View style={[styles.photoPickerCard, { backgroundColor: themeLight, borderColor: themeBorder }]}>
                <Pressable onPress={handlePickPhoto} style={styles.photoAvatarWrap}>
                  {photoUri ? (
                    <Image source={{ uri: photoUri }} style={styles.photoPreview} />
                  ) : (
                    <View style={[styles.photoPlaceholder, { borderColor: themeBorder }]}>
                      <MaterialCommunityIcons name="camera-plus-outline" size={26} color={themeColor} />
                    </View>
                  )}
                  <View style={[styles.photoPlusBadge, { backgroundColor: themeColor }]}>
                    <MaterialCommunityIcons
                      name={photoUri ? 'check' : 'plus'}
                      size={12}
                      color="#FFFFFF"
                    />
                  </View>
                </Pressable>

                <View style={styles.photoTextWrap}>
                  <Text style={styles.photoPickerTitle}>
                    {photoUri ? 'Host Photo Selected ✓' : 'Host / Premises Photo'}
                  </Text>
                  <Text style={styles.photoPickerDesc}>
                    Required so drivers can verify you are a genuine host before booking.
                  </Text>
                  <Pressable onPress={handlePickPhoto} hitSlop={6} style={styles.photoActionBtn}>
                    <Text style={[styles.photoActionText, { color: themeColor }]}>
                      {photoUri ? 'Change Photo' : '+ Upload Host Photograph'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            <Controller
              control={control}
              name="fullName"
              render={({ field: { onChange, onBlur, value } }) => (
                <FormField
                  label="Full Name"
                  placeholder="e.g. Ramesh Reddy"
                  autoCapitalize="words"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.fullName?.message}
                  left={<TextInput.Icon icon="account-outline" color="#64748B" />}
                />
              )}
            />

            <Controller
              control={control}
              name="phone"
              render={({ field: { onChange, onBlur, value } }) => (
                <FormField
                  label="Mobile Number"
                  placeholder="+91 98000 00001"
                  keyboardType="phone-pad"
                  autoCapitalize="none"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.phone?.message}
                  hint="Used for SMS slot confirmation and live dispatch alerts."
                  left={<TextInput.Icon icon="cellphone" color="#64748B" />}
                />
              )}
            />

            <Controller
              control={control}
              name="email"
              render={({ field: { onChange, onBlur, value } }) => (
                <FormField
                  label="Email Address (Optional)"
                  placeholder="name@example.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.email?.message}
                  left={<TextInput.Icon icon="email-outline" color="#64748B" />}
                />
              )}
            />

            <Controller
              control={control}
              name="password"
              render={({ field: { onChange, onBlur, value } }) => (
                <FormField
                  label="Password"
                  placeholder="Min 8 characters (letters & numbers)"
                  secureTextEntry={securePassword}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.password?.message}
                  left={<TextInput.Icon icon="lock-outline" color="#64748B" />}
                  right={
                    <TextInput.Icon
                      icon={securePassword ? 'eye-outline' : 'eye-off-outline'}
                      color="#64748B"
                      onPress={() => setSecurePassword((prev) => !prev)}
                    />
                  }
                />
              )}
            />

            <Controller
              control={control}
              name="confirmPassword"
              render={({ field: { onChange, onBlur, value } }) => (
                <FormField
                  label="Confirm Password"
                  placeholder="Re-enter your password"
                  secureTextEntry={secureConfirmPassword}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.confirmPassword?.message}
                  left={<TextInput.Icon icon="lock-check-outline" color="#64748B" />}
                  right={
                    <TextInput.Icon
                      icon={secureConfirmPassword ? 'eye-outline' : 'eye-off-outline'}
                      color="#64748B"
                      onPress={() => setSecureConfirmPassword((prev) => !prev)}
                    />
                  }
                />
              )}
            />

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
              {isDriver ? 'Create Driver Account' : 'Register as Charger Host'}
            </Button>
          </View>
        </View>

        {/* Clean Sign In Footer */}
        <View style={styles.footerSection}>
          <View style={styles.signInCard}>
            <Text style={styles.footerPrompt}>Already have an account?</Text>
            <Pressable
              onPress={() => router.replace('/(auth)/login')}
              style={({ pressed }) => [
                styles.signInBtn,
                { borderColor: themeBorder, backgroundColor: themeLight },
                pressed && { opacity: 0.8 },
              ]}
            >
              <MaterialCommunityIcons name="login" size={19} color={themeColor} />
              <Text style={[styles.signInBtnText, { color: themeColor }]}>
                Sign In to Your Account
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
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
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },
  logoText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.8,
  },
  heroContent: {
    marginBottom: 18,
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  heroSubtitle: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.82)',
    marginTop: 5,
    lineHeight: 18,
  },
  roleSelectorCard: {
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
  card: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  cardHeaderBox: {
    marginBottom: 16,
  },
  formHeaderTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  formHeaderSub: {
    fontSize: 12.5,
    color: '#64748B',
    marginTop: 3,
    lineHeight: 17,
  },
  formGroup: {
    width: '100%',
  },
  photoPickerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1.2,
    marginBottom: 16,
  },
  photoAvatarWrap: {
    position: 'relative',
  },
  photoPreview: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  photoPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoPlusBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoTextWrap: {
    flex: 1,
  },
  photoPickerTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#1E293B',
  },
  photoPickerDesc: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 16,
  },
  photoActionBtn: {
    marginTop: 6,
  },
  photoActionText: {
    fontSize: 12,
    fontWeight: '800',
  },
  submitBtn: {
    borderRadius: 14,
    marginTop: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  submitBtnContent: {
    height: 50,
  },
  submitBtnLabel: {
    fontSize: 15.5,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  footerSection: {
    paddingHorizontal: 16,
    marginTop: 18,
    gap: 16,
  },
  signInCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  footerPrompt: {
    fontSize: 13.5,
    color: '#64748B',
    marginBottom: 10,
    fontWeight: '500',
  },
  signInBtn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1.2,
  },
  signInBtnText: {
    fontSize: 14.5,
    fontWeight: '800',
  },
});
