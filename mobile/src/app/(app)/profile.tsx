import { useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as ImagePicker from 'expo-image-picker';
import { Button, Dialog, Divider, Portal, TextInput } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';

import { SignOutModal } from '@/components/SignOutModal';
import { StatusBadge } from '@/components/StatusBadge';
import { useProfile, useUnreadNotifications, useUpdateProfile, useUserStats } from '@/hooks/useAccount';
import { useMyProvider, useProviderDocuments, useProviderStats } from '@/hooks/useProviders';
import { authApi, uploadsApi, providersApi, notificationsApi } from '@/lib/endpoints';
import { getErrorMessage } from '@/lib/api';
import { initials } from '@/lib/format';
import { resolveImageUrl } from '@/lib/config';
import { queryClient, queryKeys } from '@/lib/queryClient';
import { useAuthStore } from '@/store/auth';
import { palette, radius, spacing } from '@/theme';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

export default function ProfileScreen() {
  const storedUser = useAuthStore((s) => s.user);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const signOut = useAuthStore((s) => s.signOut);

  const { data: profile } = useProfile();
  const { data: stats } = useUserStats();
  const { data: unread } = useUnreadNotifications();
  const { data: myProvider } = useMyProvider();
  const { data: providerDocs, refetch: refetchDocs } = useProviderDocuments();
  const { data: providerStats } = useProviderStats();
  const updateProfile = useUpdateProfile();

  const [editOpen, setEditOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [helpdeskOpen, setHelpdeskOpen] = useState(false);
  const [previewQrOpen, setPreviewQrOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [helpdeskSubject, setHelpdeskSubject] = useState('');
  const [helpdeskMessage, setHelpdeskMessage] = useState('');
  const [submittingHelpdesk, setSubmittingHelpdesk] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploadingHostPhoto, setUploadingHostPhoto] = useState(false);
  const [uploadingChargerPhoto, setUploadingChargerPhoto] = useState(false);
  const [uploadingQrScanner, setUploadingQrScanner] = useState(false);

  const user = profile ?? storedUser;
  const providerProfile = user?.providerProfile ?? null;
  const isProvider = user?.role === 'PROVIDER';
  const isAdmin = user?.role === 'ADMIN';
  const unreadCount = unread?.count ?? 0;

  // Active charger hardware photo
  const chargerDoc = useMemo(() => {
    const list = providerDocs ?? myProvider?.documents ?? [];
    return list.find((d) => d.type === 'CHARGER_PHOTO' || d.type === 'SITE_PHOTO') ?? null;
  }, [providerDocs, myProvider?.documents]);

  // Active UPI / Payment QR Scanner photo (ProviderDocument: type OTHER)
  const qrScannerDoc = useMemo(() => {
    const list = providerDocs ?? myProvider?.documents ?? [];
    return (
      list.find(
        (d) =>
          d.type === 'OTHER' ||
          (d.type as string) === 'UPI_QR' ||
          (d.type as string) === 'PAYMENT_QR',
      ) ?? null
    );
  }, [providerDocs, myProvider?.documents]);

  // 1. Host / Profile Personal Photo (user.avatarUrl)
  const handlePickHostPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Permission needed',
        isProvider
          ? 'Allow photo library access to upload your personal host photo.'
          : 'Allow photo library access to upload your profile photo.',
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.canceled || !result.assets[0]?.uri) return;

    setUploadingHostPhoto(true);
    try {
      const upload = await uploadsApi.image(result.assets[0].uri, 'avatars');
      await updateProfile.mutateAsync({ avatarUrl: upload.url });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      Alert.alert(
        isProvider ? 'Host photo updated! ✓' : 'Profile photo updated! ✓',
        isProvider
          ? 'Your personal host identity photo has been updated. Drivers see this photo to verify the host before booking.'
          : 'Your profile picture has been updated.',
      );
    } catch (error) {
      Alert.alert('Upload failed', getErrorMessage(error));
    } finally {
      setUploadingHostPhoto(false);
    }
  };

  // 2. Charging Point Hardware Photo (ProviderDocument: CHARGER_PHOTO)
  const handlePickChargerPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Permission needed',
        'Allow photo library access to upload your charging point hardware photo.',
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.85,
    });

    if (result.canceled || !result.assets[0]?.uri) return;

    setUploadingChargerPhoto(true);
    try {
      const upload = await uploadsApi.image(result.assets[0].uri, 'documents');
      await providersApi.addDocument({
        type: 'CHARGER_PHOTO',
        fileUrl: upload.url,
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.providers.mine() });
      await queryClient.invalidateQueries({ queryKey: queryKeys.providers.documents() });
      void refetchDocs();
      Alert.alert(
        'Charging Point Photo Saved! ✓',
        'Your EV charging point photo has been saved and submitted for administrator review.',
      );
    } catch (error) {
      Alert.alert('Upload failed', getErrorMessage(error));
    } finally {
      setUploadingChargerPhoto(false);
    }
  };

  // 3. Payment QR Scanner Photo (ProviderDocument: OTHER)
  const handlePickQrScanner = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Permission needed',
        'Allow photo library access to upload your UPI / Payment QR Scanner image.',
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });

    if (result.canceled || !result.assets[0]?.uri) return;

    setUploadingQrScanner(true);
    try {
      const upload = await uploadsApi.image(result.assets[0].uri, 'documents');
      await providersApi.addDocument({
        type: 'OTHER',
        fileUrl: upload.url,
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.providers.mine() });
      await queryClient.invalidateQueries({ queryKey: queryKeys.providers.documents() });
      void refetchDocs();
      Alert.alert(
        'UPI QR Scanner Uploaded! ✓',
        'Your Payment QR Scanner has been saved. Drivers can now scan this QR code after completing charging sessions to pay you directly.',
      );
    } catch (error) {
      Alert.alert('Upload failed', getErrorMessage(error));
    } finally {
      setUploadingQrScanner(false);
    }
  };

  const openEdit = () => {
    setFullName(user?.fullName ?? '');
    setEmail(user?.email ?? '');
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!fullName.trim()) {
      Alert.alert('Name required', 'Please enter your name.');
      return;
    }
    setBusy(true);
    try {
      await updateProfile.mutateAsync({
        fullName: fullName.trim(),
        email: email.trim() || undefined,
      });
      setEditOpen(false);
    } catch (error) {
      Alert.alert('Could not update profile', getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const savePassword = async () => {
    if (!currentPassword || !newPassword) {
      Alert.alert('Missing fields', 'Enter your current and new password.');
      return;
    }
    if (newPassword.length < 8) {
      Alert.alert('Password too short', 'New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Mismatch', 'New passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await authApi.changePassword({ currentPassword, newPassword });
      setPasswordOpen(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      Alert.alert('Password changed', 'Use your new password next time you sign in.');
    } catch (error) {
      Alert.alert('Could not change password', getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const handleSignOutConfirm = async () => {
    try {
      await authApi.logout(refreshToken ?? undefined);
    } catch {
      // Local sign-out still proceeds if the network call fails.
    }
    queryClient.clear();
    await signOut();
  };

  const handleSendHelpdesk = async () => {
    if (helpdeskSubject.trim().length < 3) {
      Alert.alert('Subject required', 'Please enter a brief subject for your issue.');
      return;
    }
    if (helpdeskMessage.trim().length < 5) {
      Alert.alert('Message required', 'Please describe your inquiry or issue for the administrator.');
      return;
    }
    setSubmittingHelpdesk(true);
    try {
      const res = await notificationsApi.submitSupport({
        subject: helpdeskSubject.trim(),
        message: helpdeskMessage.trim(),
      });
      setHelpdeskOpen(false);
      setHelpdeskSubject('');
      setHelpdeskMessage('');
      Alert.alert(
        'Inquiry Delivered to Admin ✓',
        `Your inquiry has been delivered directly to the Administrator (${res.adminEmail || 'admin@evrescue.local'}). The admin team will review it and get back to you shortly.`,
      );
    } catch (err) {
      Alert.alert('Submission failed', getErrorMessage(err));
    } finally {
      setSubmittingHelpdesk(false);
    }
  };

  const roleLabel = isAdmin ? 'Administrator' : isProvider ? 'Verified Host' : 'EV Driver';

  const heroColors = isProvider
    ? (['#78350F', '#B45309', '#D97706'] as const)
    : (['#064E3B', '#047857', '#059669'] as const);

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* ============================================================= */}
      {/* 1. HERO PROFILE CARD WITH GRADIENT                            */}
      {/* ============================================================= */}
      <LinearGradient
        colors={heroColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.heroCard}
      >
        <View style={styles.heroTopActions}>
          <View style={styles.roleHeaderPill}>
            <MaterialCommunityIcons
              name={isAdmin ? 'shield-crown' : isProvider ? 'ev-station' : 'car-electric'}
              size={13}
              color="#FFFFFF"
            />
            <Text style={styles.roleHeaderPillText}>{roleLabel}</Text>
          </View>

          <Pressable onPress={openEdit} style={styles.editPillBtn} hitSlop={8}>
            <MaterialCommunityIcons name="pencil-outline" size={13} color="#FFFFFF" />
            <Text style={styles.editPillText}>Edit</Text>
          </Pressable>
        </View>

        <View style={styles.heroProfileRow}>
          <Pressable
            onPress={handlePickHostPhoto}
            style={styles.avatarWrapper}
            disabled={uploadingHostPhoto}
          >
            {user?.avatarUrl ? (
              <Image
                source={{ uri: resolveImageUrl(user.avatarUrl) || user.avatarUrl }}
                style={styles.avatarImage}
              />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarText}>{initials(user?.fullName ?? 'EV')}</Text>
              </View>
            )}
            <View style={styles.cameraIconBadge}>
              <MaterialCommunityIcons
                name={uploadingHostPhoto ? 'loading' : 'camera-plus'}
                size={12}
                color="#FFFFFF"
              />
            </View>
          </Pressable>

          <View style={styles.heroTextCol}>
            <Text style={styles.heroName} numberOfLines={1}>
              {user?.fullName ?? (isProvider ? 'Charging Host' : 'EV Driver')}
            </Text>

            <View style={styles.heroMetaRow}>
              <MaterialCommunityIcons name="phone" size={12} color="rgba(255,255,255,0.85)" />
              <Text style={styles.heroPhoneText}>{user?.phone ?? 'Phone Verified'}</Text>
            </View>

            {user?.email ? (
              <View style={styles.heroMetaRow}>
                <MaterialCommunityIcons name="email-outline" size={12} color="rgba(255,255,255,0.85)" />
                <Text style={styles.heroEmailText} numberOfLines={1}>{user.email}</Text>
              </View>
            ) : null}

            <View style={styles.heroBadgeRow}>
              <View style={styles.verifiedMicroPill}>
                <MaterialCommunityIcons name="check-decagram" size={11} color="#10B981" />
                <Text style={styles.verifiedMicroText}>Verified Identity</Text>
              </View>
              {isProvider && myProvider?.isOpenNow ? (
                <View style={styles.liveMicroPill}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveMicroText}>Station Online</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        <Pressable
          onPress={handlePickHostPhoto}
          disabled={uploadingHostPhoto}
          style={styles.changePhotoStrip}
        >
          <MaterialCommunityIcons name="camera-flip-outline" size={13} color="rgba(255,255,255,0.9)" />
          <Text style={styles.changePhotoStripText}>
            {uploadingHostPhoto
              ? 'Uploading new photo…'
              : user?.avatarUrl
              ? 'Tap to update personal profile photo'
              : '+ Upload verified profile photo'}
          </Text>
        </Pressable>
      </LinearGradient>

      {/* ============================================================= */}
      {/* 2. PROVIDER MEDIA: CHARGER HARDWARE & PAYMENT QR CARDS        */}
      {/* ============================================================= */}
      {isProvider ? (
        <View style={styles.providerMediaSection}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Station Verification & Media</Text>
            {providerProfile?.verificationStatus ? (
              <StatusBadge status={providerProfile.verificationStatus} />
            ) : null}
          </View>

          <View style={styles.mediaGrid}>
            {/* 1. Charger Hardware Photo */}
            <View style={styles.mediaCard}>
              <View style={styles.mediaCardHeader}>
                <View style={styles.mediaCardTitleRow}>
                  <MaterialCommunityIcons name="ev-station" size={16} color="#D97706" />
                  <Text style={styles.mediaCardTitle} numberOfLines={1}>Charger Stall</Text>
                </View>
                <View
                  style={[
                    styles.mediaStatusPill,
                    { backgroundColor: chargerDoc?.fileUrl ? '#ECFDF5' : '#FEF3C7' },
                  ]}
                >
                  <Text
                    style={[
                      styles.mediaStatusText,
                      { color: chargerDoc?.fileUrl ? '#065F46' : '#B45309' },
                    ]}
                  >
                    {chargerDoc?.fileUrl ? 'Uploaded ✓' : 'Required'}
                  </Text>
                </View>
              </View>

              {chargerDoc?.fileUrl ? (
                <View style={styles.mediaPreviewWrap}>
                  <Image
                    source={{ uri: resolveImageUrl(chargerDoc.fileUrl) || chargerDoc.fileUrl }}
                    style={styles.mediaPreviewImg}
                    resizeMode="cover"
                  />
                  <Pressable
                    onPress={handlePickChargerPhoto}
                    disabled={uploadingChargerPhoto}
                    style={styles.mediaActionBtn}
                  >
                    <MaterialCommunityIcons name="camera-flip-outline" size={12} color="#D97706" />
                    <Text style={styles.mediaActionBtnText}>
                      {uploadingChargerPhoto ? 'Uploading…' : 'Change Stall Photo'}
                    </Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  onPress={handlePickChargerPhoto}
                  disabled={uploadingChargerPhoto}
                  style={styles.mediaEmptyBox}
                >
                  <MaterialCommunityIcons
                    name={uploadingChargerPhoto ? 'loading' : 'camera-plus-outline'}
                    size={28}
                    color="#D97706"
                  />
                  <Text style={styles.mediaEmptyTitle}>Upload Stall Photo</Text>
                  <Text style={styles.mediaEmptySub}>Socket or wallbox photo</Text>
                </Pressable>
              )}
            </View>

            {/* 2. Payment UPI QR Scanner */}
            <View style={styles.mediaCard}>
              <View style={styles.mediaCardHeader}>
                <View style={styles.mediaCardTitleRow}>
                  <MaterialCommunityIcons name="qrcode-scan" size={16} color="#059669" />
                  <Text style={styles.mediaCardTitle} numberOfLines={1}>Payment QR</Text>
                </View>
                <View
                  style={[
                    styles.mediaStatusPill,
                    { backgroundColor: qrScannerDoc?.fileUrl ? '#ECFDF5' : '#FEF3C7' },
                  ]}
                >
                  <Text
                    style={[
                      styles.mediaStatusText,
                      { color: qrScannerDoc?.fileUrl ? '#065F46' : '#B45309' },
                    ]}
                  >
                    {qrScannerDoc?.fileUrl ? 'Ready ✓' : 'Required'}
                  </Text>
                </View>
              </View>

              {qrScannerDoc?.fileUrl ? (
                <View style={styles.mediaPreviewWrap}>
                  <Pressable
                    onPress={() => setPreviewQrOpen(true)}
                    style={styles.qrThumbWrap}
                  >
                    <Image
                      source={{ uri: resolveImageUrl(qrScannerDoc.fileUrl) || qrScannerDoc.fileUrl }}
                      style={styles.qrThumbImg}
                      resizeMode="contain"
                    />
                    <View style={styles.qrZoomHint}>
                      <MaterialCommunityIcons name="magnify-plus-outline" size={12} color="#FFFFFF" />
                      <Text style={styles.qrZoomHintText}>Tap to view</Text>
                    </View>
                  </Pressable>
                  <Pressable
                    onPress={handlePickQrScanner}
                    disabled={uploadingQrScanner}
                    style={styles.mediaActionBtn}
                  >
                    <MaterialCommunityIcons name="qrcode-edit" size={12} color="#059669" />
                    <Text style={[styles.mediaActionBtnText, { color: '#059669' }]}>
                      {uploadingQrScanner ? 'Uploading…' : 'Change QR'}
                    </Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  onPress={handlePickQrScanner}
                  disabled={uploadingQrScanner}
                  style={[styles.mediaEmptyBox, { borderColor: '#A7F3D0', backgroundColor: '#F0FDF4' }]}
                >
                  <MaterialCommunityIcons
                    name={uploadingQrScanner ? 'loading' : 'qrcode-plus'}
                    size={28}
                    color="#059669"
                  />
                  <Text style={[styles.mediaEmptyTitle, { color: '#065F46' }]}>Upload Payment QR</Text>
                  <Text style={styles.mediaEmptySub}>GPay / PhonePe / Paytm</Text>
                </Pressable>
              )}
            </View>
          </View>
        </View>
      ) : null}

      {/* ============================================================= */}
      {/* 3. PERFORMANCE STATS GRID                                     */}
      {/* ============================================================= */}
      <View style={styles.statsSection}>
        <Text style={styles.sectionTitle}>
          {isProvider ? 'Station Performance' : 'Activity & Trips'}
        </Text>

        <View style={styles.statsGrid}>
          {isProvider ? (
            <>
              <View style={styles.statCard}>
                <View style={[styles.statIconDisc, { backgroundColor: '#FEF3C7' }]}>
                  <MaterialCommunityIcons name="ev-station" size={18} color="#D97706" />
                </View>
                <Text style={styles.statVal}>{myProvider?.isOpenNow ? 'Online' : 'Active'}</Text>
                <Text style={styles.statLabel}>Station Status</Text>
              </View>

              <View style={styles.statCard}>
                <View style={[styles.statIconDisc, { backgroundColor: '#EFF6FF' }]}>
                  <MaterialCommunityIcons name="lightning-bolt" size={18} color="#2563EB" />
                </View>
                <Text style={styles.statVal}>{providerStats?.completedBookings ?? 0}</Text>
                <Text style={styles.statLabel}>Sessions</Text>
              </View>

              <View style={styles.statCard}>
                <View style={[styles.statIconDisc, { backgroundColor: '#ECFDF5' }]}>
                  <MaterialCommunityIcons name="cash-multiple" size={18} color="#059669" />
                </View>
                <Text style={[styles.statVal, { color: '#059669' }]}>
                  ₹{providerStats?.totalRevenue ?? 0}
                </Text>
                <Text style={styles.statLabel}>Total Revenue</Text>
              </View>

              <View style={styles.statCard}>
                <View style={[styles.statIconDisc, { backgroundColor: '#FFFBEB' }]}>
                  <MaterialCommunityIcons name="star" size={18} color="#F59E0B" />
                </View>
                <Text style={styles.statVal}>{providerStats?.rating ?? '5.0'} ★</Text>
                <Text style={styles.statLabel}>Host Rating</Text>
              </View>
            </>
          ) : (
            <>
              <View style={styles.statCard}>
                <View style={[styles.statIconDisc, { backgroundColor: '#EFF6FF' }]}>
                  <MaterialCommunityIcons name="car-electric" size={18} color="#2563EB" />
                </View>
                <Text style={styles.statVal}>{stats?.vehicles ?? 0}</Text>
                <Text style={styles.statLabel}>My Vehicles</Text>
              </View>

              <View style={styles.statCard}>
                <View style={[styles.statIconDisc, { backgroundColor: '#ECFDF5' }]}>
                  <MaterialCommunityIcons name="calendar-check" size={18} color="#059669" />
                </View>
                <Text style={styles.statVal}>{stats?.bookings ?? 0}</Text>
                <Text style={styles.statLabel}>Charging Trips</Text>
              </View>

              <View style={styles.statCard}>
                <View style={[styles.statIconDisc, { backgroundColor: '#FEE2E2' }]}>
                  <MaterialCommunityIcons name="heart-outline" size={18} color="#DC2626" />
                </View>
                <Text style={styles.statVal}>{stats?.favorites ?? 0}</Text>
                <Text style={styles.statLabel}>Saved Stations</Text>
              </View>

              <View style={styles.statCard}>
                <View style={[styles.statIconDisc, { backgroundColor: '#FEF3C7' }]}>
                  <MaterialCommunityIcons name="bell-outline" size={18} color="#D97706" />
                </View>
                <Text style={styles.statVal}>
                  {stats?.unreadNotifications ?? unreadCount}
                </Text>
                <Text style={styles.statLabel}>Unread Alerts</Text>
              </View>
            </>
          )}
        </View>
      </View>

      {/* ============================================================= */}
      {/* 4. ROLE SPECIFIC MENUS                                         */}
      {/* ============================================================= */}
      {isProvider ? (
        <>
          <Text style={styles.groupTitle}>Station Command Center</Text>
          <View style={styles.menuCard}>
            <MenuRow
              icon="ev-station"
              iconBg="#FEF3C7"
              iconColor="#D97706"
              label={myProvider?.businessName ?? 'My Charging Station'}
              subtitle={`Power: ${myProvider?.maxPowerKw ?? 60} kW • ₹${myProvider?.pricePerKwh ?? 18}/kWh`}
              onPress={() => router.push('/provider-dashboard')}
            />
            <Divider style={styles.menuDivider} />
            <MenuRow
              icon="cash-multiple"
              iconBg="#ECFDF5"
              iconColor="#059669"
              label="Earnings & Revenue"
              subtitle="View total earnings, payouts & charging revenue"
              onPress={() =>
                router.push({ pathname: '/(app)/search', params: { from: 'profile' } })
              }
            />
            <Divider style={styles.menuDivider} />
            <MenuRow
              icon="clipboard-list-outline"
              iconBg="#EFF6FF"
              iconColor="#2563EB"
              label="Station Requests"
              subtitle="Incoming driver charging reservations & queue"
              onPress={() =>
                router.push({ pathname: '/(app)/bookings', params: { from: 'profile' } })
              }
            />
          </View>

          <Text style={styles.groupTitle}>Support & Alerts</Text>
          <View style={styles.menuCard}>
            <MenuRow
              icon="bell-outline"
              iconBg="#FEF3C7"
              iconColor="#D97706"
              label="Notifications"
              subtitle="Booking requests, payments & system updates"
              badge={unreadCount > 0 ? String(unreadCount) : undefined}
              onPress={() => router.push({ pathname: '/notifications', params: { from: 'profile' } })}
            />
            <Divider style={styles.menuDivider} />
            <MenuRow
              icon="headset"
              iconBg="#F3E8FF"
              iconColor="#9333EA"
              label="Host Helpdesk & Support"
              subtitle="Contact admin (admin@evrescue.local) & raise priority ticket"
              onPress={() => setHelpdeskOpen(true)}
            />
          </View>
        </>
      ) : (
        <>
          <Text style={styles.groupTitle}>Driver Essentials</Text>
          <View style={styles.menuCard}>
            <MenuRow
              icon="car-electric"
              iconBg="#EFF6FF"
              iconColor="#2563EB"
              label="My Vehicles"
              subtitle="Manage your EV models, battery sizes & plugs"
              onPress={() => router.push({ pathname: '/vehicles', params: { from: 'profile' } })}
            />
            <Divider style={styles.menuDivider} />
            <MenuRow
              icon="heart-outline"
              iconBg="#FEE2E2"
              iconColor="#DC2626"
              label="Saved Charging Points"
              subtitle="Your favorite emergency & fast chargers"
              onPress={() => router.push({ pathname: '/favorites', params: { from: 'profile' } })}
            />
            <Divider style={styles.menuDivider} />
            <MenuRow
              icon="calendar-clock-outline"
              iconBg="#ECFDF5"
              iconColor="#059669"
              label="Charging Trips & Invoices"
              subtitle="Emergency charging history and payment receipts"
              onPress={() =>
                router.push({ pathname: '/(app)/bookings', params: { from: 'profile' } })
              }
            />
            <Divider style={styles.menuDivider} />
            <MenuRow
              icon="bell-outline"
              iconBg="#FEF3C7"
              iconColor="#D97706"
              label="Notifications"
              subtitle="Charging session updates and alerts"
              badge={unreadCount > 0 ? String(unreadCount) : undefined}
              onPress={() => router.push({ pathname: '/notifications', params: { from: 'profile' } })}
            />
            <Divider style={styles.menuDivider} />
            <MenuRow
              icon="headset"
              iconBg="#F3E8FF"
              iconColor="#9333EA"
              label="Driver Helpdesk & Support"
              subtitle="Contact admin (admin@evrescue.local) & submit support form"
              onPress={() => setHelpdeskOpen(true)}
            />
          </View>

          <Text style={styles.groupTitle}>Earn with EVRescue</Text>
          <View style={styles.menuCard}>
            <MenuRow
              icon="ev-station"
              iconBg="#FEF3C7"
              iconColor="#D97706"
              label="Become a Charger Host"
              subtitle="List your home, shop or commercial socket & earn"
              onPress={() =>
                router.push({ pathname: '/provider-setup', params: { from: 'profile' } })
              }
            />
          </View>
        </>
      )}

      {/* Admin Access If Permitted */}
      {isAdmin ? (
        <>
          <Text style={styles.groupTitle}>Administration</Text>
          <View style={styles.menuCard}>
            <MenuRow
              icon="shield-account-outline"
              iconBg="#FEE2E2"
              iconColor="#DC2626"
              label="Admin Console"
              subtitle="Manage approvals, users, plans and audit logs"
              onPress={() => router.push('/admin')}
            />
          </View>
        </>
      ) : null}

      {/* ============================================================= */}
      {/* 5. SECURITY & SIGN OUT                                         */}
      {/* ============================================================= */}
      <Text style={styles.groupTitle}>Security & Account</Text>
      <View style={styles.menuCard}>
        <MenuRow
          icon="lock-reset"
          iconBg="#F1F5F9"
          iconColor="#475569"
          label="Change Password"
          subtitle="Update your sign-in credentials"
          onPress={() => setPasswordOpen(true)}
        />
        <Divider style={styles.menuDivider} />
        <MenuRow
          icon="logout"
          iconBg="#FEE2E2"
          iconColor="#DC2626"
          label="Sign Out"
          subtitle="Safely end your active session on this device"
          danger
          onPress={() => setSignOutOpen(true)}
        />
      </View>

      <Text style={styles.versionText}>EVRescue v1.4.2 · Secure EV Network</Text>

      {/* ============================================================= */}
      {/* 6. MODALS & DIALOGS                                            */}
      {/* ============================================================= */}
      <Portal>
        {/* Edit Profile Dialog */}
        <Dialog visible={editOpen} onDismiss={() => setEditOpen(false)} style={styles.dialog}>
          <Dialog.Title style={styles.dialogTitle}>Edit Profile</Dialog.Title>
          <Dialog.Content>
            <TextInput
              mode="outlined"
              label="Full Name"
              value={fullName}
              onChangeText={setFullName}
              style={styles.dialogInput}
              outlineColor={palette.border}
              activeOutlineColor={isProvider ? '#D97706' : palette.primary}
            />
            <TextInput
              mode="outlined"
              label="Email Address (optional)"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              style={styles.dialogInput}
              outlineColor={palette.border}
              activeOutlineColor={isProvider ? '#D97706' : palette.primary}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setEditOpen(false)} textColor="#64748B">Cancel</Button>
            <Button
              mode="contained"
              loading={busy}
              disabled={busy}
              onPress={saveEdit}
              buttonColor={isProvider ? '#D97706' : palette.primary}
              style={{ borderRadius: 10 }}
            >
              Save Changes
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* Change Password Dialog */}
        <Dialog visible={passwordOpen} onDismiss={() => setPasswordOpen(false)} style={styles.dialog}>
          <Dialog.Title style={styles.dialogTitle}>Change Password</Dialog.Title>
          <Dialog.Content>
            <TextInput
              mode="outlined"
              label="Current Password"
              value={currentPassword}
              onChangeText={setCurrentPassword}
              secureTextEntry
              style={styles.dialogInput}
              outlineColor={palette.border}
              activeOutlineColor={isProvider ? '#D97706' : palette.primary}
            />
            <TextInput
              mode="outlined"
              label="New Password (min 8 characters)"
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
              style={styles.dialogInput}
              outlineColor={palette.border}
              activeOutlineColor={isProvider ? '#D97706' : palette.primary}
            />
            <TextInput
              mode="outlined"
              label="Confirm New Password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              style={styles.dialogInput}
              outlineColor={palette.border}
              activeOutlineColor={isProvider ? '#D97706' : palette.primary}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setPasswordOpen(false)} textColor="#64748B">Cancel</Button>
            <Button
              mode="contained"
              loading={busy}
              disabled={busy}
              onPress={savePassword}
              buttonColor={isProvider ? '#D97706' : palette.primary}
              style={{ borderRadius: 10 }}
            >
              Update Password
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* Helpdesk Dialog */}
        <Dialog visible={helpdeskOpen} onDismiss={() => setHelpdeskOpen(false)} style={styles.dialog}>
          <Dialog.Title style={styles.dialogTitle}>
            {isProvider ? 'Host Priority Support' : 'Driver Support Helpdesk'}
          </Dialog.Title>
          <Dialog.Content>
            <View style={styles.adminEmailBox}>
              <MaterialCommunityIcons name="email-seal-outline" size={22} color="#059669" />
              <View style={{ flex: 1 }}>
                <Text style={styles.adminEmailLabel}>Admin Support Channel</Text>
                <Text style={styles.adminEmailValue}>admin@evrescue.local</Text>
              </View>
            </View>

            <TextInput
              mode="outlined"
              label="Subject / Topic"
              placeholder={isProvider ? 'e.g. Charging station hardware or payout question' : 'e.g. Booking issue or host inquiry'}
              value={helpdeskSubject}
              onChangeText={setHelpdeskSubject}
              style={styles.dialogInput}
              outlineColor={palette.border}
              activeOutlineColor={isProvider ? '#D97706' : palette.primary}
            />
            <TextInput
              mode="outlined"
              label="Message / Issue details"
              placeholder="Describe your inquiry in detail for the administrator…"
              value={helpdeskMessage}
              onChangeText={setHelpdeskMessage}
              multiline
              numberOfLines={4}
              style={[styles.dialogInput, { minHeight: 90 }]}
              outlineColor={palette.border}
              activeOutlineColor={isProvider ? '#D97706' : palette.primary}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setHelpdeskOpen(false)} textColor="#64748B">Cancel</Button>
            <Button
              mode="contained"
              loading={submittingHelpdesk}
              disabled={submittingHelpdesk}
              onPress={handleSendHelpdesk}
              buttonColor={isProvider ? '#D97706' : palette.primary}
              style={{ borderRadius: 10 }}
            >
              Send Ticket
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* Payment QR Scanner Preview Modal */}
        <Dialog visible={previewQrOpen} onDismiss={() => setPreviewQrOpen(false)} style={styles.dialog}>
          <Dialog.Title style={styles.dialogTitle}>Payment QR Scanner</Dialog.Title>
          <Dialog.Content>
            {qrScannerDoc?.fileUrl ? (
              <View style={{ alignItems: 'center' }}>
                <Image
                  source={{ uri: resolveImageUrl(qrScannerDoc.fileUrl) || qrScannerDoc.fileUrl }}
                  style={styles.qrFullPreviewImg}
                  resizeMode="contain"
                />
                <View style={styles.qrActiveRow}>
                  <MaterialCommunityIcons name="check-decagram" size={16} color="#059669" />
                  <Text style={styles.qrActiveText}>Active UPI Payment Scanner ✓</Text>
                </View>
                <Text style={styles.qrModalHint}>
                  Drivers will scan this QR code to settle session charges directly into your bank account.
                </Text>
              </View>
            ) : null}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setPreviewQrOpen(false)} textColor="#64748B">Close</Button>
            <Button
              mode="contained"
              loading={uploadingQrScanner}
              disabled={uploadingQrScanner}
              onPress={() => {
                setPreviewQrOpen(false);
                void handlePickQrScanner();
              }}
              buttonColor="#059669"
              style={{ borderRadius: 10 }}
            >
              Upload New QR
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      {/* ============================================================= */}
      {/* 7. ANIMATED SIGN OUT MODAL                                     */}
      {/* ============================================================= */}
      <SignOutModal
        visible={signOutOpen}
        onDismiss={() => setSignOutOpen(false)}
        onConfirm={handleSignOutConfirm}
        role={isProvider ? 'PROVIDER' : isAdmin ? 'ADMIN' : 'DRIVER'}
        userName={user?.fullName || (isProvider ? 'Host' : 'Driver')}
      />
    </ScrollView>
  );
}

function MenuRow({
  icon,
  iconBg = '#ECFDF5',
  iconColor = palette.primary,
  label,
  subtitle,
  badge,
  danger,
  onPress,
}: {
  icon: IconName;
  iconBg?: string;
  iconColor?: string;
  label: string;
  subtitle?: string;
  badge?: string;
  danger?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.menuRow, pressed && styles.menuPressed]}
      android_ripple={{ color: '#F1F5F9' }}
    >
      <View
        style={[
          styles.menuIconBox,
          { backgroundColor: danger ? '#FEE2E2' : iconBg },
        ]}
      >
        <MaterialCommunityIcons
          name={icon}
          size={20}
          color={danger ? '#DC2626' : iconColor}
        />
      </View>

      <View style={styles.menuTextWrap}>
        <Text style={[styles.menuLabel, danger && styles.menuLabelDanger]}>{label}</Text>
        {subtitle ? (
          <Text style={styles.menuSubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {badge ? (
        <View style={styles.badgePill}>
          <Text style={styles.badgePillText}>{badge}</Text>
        </View>
      ) : null}

      <MaterialCommunityIcons name="chevron-right" size={20} color="#CBD5E1" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { paddingHorizontal: spacing.lg, paddingTop: 50, paddingBottom: 130 },

  // 1. Hero Card
  heroCard: {
    borderRadius: 24,
    padding: 20,
    marginBottom: spacing.lg,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 8,
  },
  heroTopActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  roleHeaderPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    paddingHorizontal: 12,
    paddingVertical: 4.5,
    borderRadius: radius.pill,
  },
  roleHeaderPillText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  editPillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  editPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  heroProfileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  avatarWrapper: {
    position: 'relative',
  },
  avatarImage: {
    width: 72,
    height: 72,
    borderRadius: 26,
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
  },
  avatarFallback: {
    width: 72,
    height: 72,
    borderRadius: 26,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
  },
  cameraIconBadge: {
    position: 'absolute',
    bottom: -3,
    right: -3,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  heroTextCol: {
    flex: 1,
  },
  heroName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.2,
    marginBottom: 4,
  },
  heroMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  heroPhoneText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.92)',
  },
  heroEmailText: {
    fontSize: 11.5,
    color: 'rgba(255,255,255,0.85)',
  },
  heroBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  verifiedMicroPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: radius.pill,
  },
  verifiedMicroText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#065F46',
  },
  liveMicroPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: radius.pill,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  liveMicroText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  changePhotoStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.16)',
    borderRadius: 12,
    paddingVertical: 7,
    marginTop: 16,
  },
  changePhotoStripText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // 2. Provider Media Cards
  providerMediaSection: {
    marginBottom: spacing.lg,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  mediaGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  mediaCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  mediaCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  mediaCardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flex: 1,
  },
  mediaCardTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: palette.ink,
  },
  mediaStatusPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  mediaStatusText: {
    fontSize: 9.5,
    fontWeight: '800',
  },
  mediaPreviewWrap: {
    alignItems: 'center',
  },
  mediaPreviewImg: {
    width: '100%',
    height: 96,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
  },
  qrThumbWrap: {
    width: '100%',
    height: 96,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  qrThumbImg: {
    width: 78,
    height: 78,
  },
  qrZoomHint: {
    position: 'absolute',
    bottom: 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  qrZoomHintText: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  mediaActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  mediaActionBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#D97706',
  },
  mediaEmptyBox: {
    height: 128,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#FDE68A',
    backgroundColor: '#FFFBEB',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  mediaEmptyTitle: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#B45309',
    marginTop: 6,
    textAlign: 'center',
  },
  mediaEmptySub: {
    fontSize: 9.5,
    color: '#92400E',
    marginTop: 2,
    textAlign: 'center',
  },

  // 3. Stats Section
  statsSection: {
    marginBottom: spacing.lg,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: spacing.sm,
  },
  statCard: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 5,
    elevation: 2,
  },
  statIconDisc: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  statVal: {
    fontSize: 18,
    fontWeight: '800',
    color: palette.ink,
    letterSpacing: -0.2,
  },
  statLabel: {
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 2,
  },

  // 4. Menu Cards
  groupTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    marginLeft: 4,
  },
  menuCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 14,
  },
  menuPressed: {
    backgroundColor: '#F8FAFC',
  },
  menuIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuTextWrap: {
    flex: 1,
  },
  menuLabel: {
    fontSize: 14.5,
    fontWeight: '700',
    color: palette.ink,
  },
  menuLabelDanger: {
    color: '#DC2626',
  },
  menuSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  menuDivider: {
    backgroundColor: '#F1F5F9',
    height: 1,
    marginLeft: 66,
  },
  badgePill: {
    backgroundColor: '#DC2626',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  badgePillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  versionText: {
    textAlign: 'center',
    color: '#94A3B8',
    fontSize: 11.5,
    fontWeight: '600',
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },

  // Dialogs
  dialog: {
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
  },
  dialogTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: palette.ink,
  },
  dialogInput: {
    marginBottom: spacing.md,
    backgroundColor: '#FFFFFF',
  },
  adminEmailBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    padding: spacing.md,
    borderRadius: 14,
    marginBottom: spacing.md,
  },
  adminEmailLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#065F46',
    textTransform: 'uppercase',
  },
  adminEmailValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#064E3B',
    marginTop: 2,
  },
  qrFullPreviewImg: {
    width: 230,
    height: 230,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  qrActiveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
  },
  qrActiveText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#065F46',
  },
  qrModalHint: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 17,
  },
});
