import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  BackHandler,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Button, Chip, Switch, TextInput } from 'react-native-paper';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/EmptyState';
import { Loading } from '@/components/Loading';
import { SignOutModal } from '@/components/SignOutModal';
import { StatusBadge } from '@/components/StatusBadge';
import {
  useAdminAuditLogs,
  useAdminBookings,
  useAdminHelpdesk,
  useAdminPlans,
  useAdminProviders,
  useAdminReviews,
  useAdminStats,
  useAdminUsers,
  useCreateAdminPlan,
  useDeleteAdminPlan,
  useDeleteAdminReview,
  useReviewProvider,
  useSetUserStatus,
  useUpdateAdminHelpdesk,
  useUpdateAdminPlan,
} from '@/hooks/useAdmin';
import { getErrorMessage } from '@/lib/api';
import { CONNECTOR_LABELS, PROVIDER_TYPE_LABELS, resolveImageUrl } from '@/lib/config';
import { authApi } from '@/lib/endpoints';
import { formatCurrency, timeAgo } from '@/lib/format';
import { queryClient } from '@/lib/queryClient';
import { authenticateSocket } from '@/lib/socket';
import { useAuthStore } from '@/store/auth';
import { palette, radius, spacing } from '@/theme';
import type { AdminBookingItem, AdminHelpdeskTicket, AdminReviewItem, ProviderDetail, SubscriptionPlanOption, User } from '@/types/api';

type AdminTab = 'overview' | 'providers' | 'users' | 'plans' | 'support';
type ProviderFilter = 'ALL' | 'PENDING' | 'APPROVED' | 'SUSPENDED' | 'REJECTED';
type RoleFilter = 'ALL' | 'DRIVER' | 'PROVIDER' | 'ADMIN';
type SupportSubTab = 'helpdesk' | 'reviews' | 'audit';

export default function AdminScreen() {
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const setSession = useAuthStore((s) => s.setSession);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const signOut = useAuthStore((s) => s.signOut);
  const isAdmin = user?.role === 'ADMIN';

  const [signOutOpen, setSignOutOpen] = useState(false);
  const [adminPhone, setAdminPhone] = useState('+919999999999');
  const [adminPassword, setAdminPassword] = useState('Admin@12345');
  const [unlocking, setUnlocking] = useState(false);

  // Navigation tab state (bottom nav like user & provider panels)
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [supportSubTab, setSupportSubTab] = useState<SupportSubTab>('helpdesk');

  // Filters & search
  const [providerFilter, setProviderFilter] = useState<ProviderFilter>('ALL');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('ALL');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');

  // Provider review states
  const [rejectTarget, setRejectTarget] = useState<ProviderDetail | null>(null);
  const [rejectionNote, setRejectionNote] = useState('');
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [statusBusyId, setStatusBusyId] = useState<string | null>(null);
  const [expandedProviderId, setExpandedProviderId] = useState<string | null>(null);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);

  // Plan editing & creation states
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlanOption | null>(null);
  const [editPlanName, setEditPlanName] = useState('');
  const [editPlanPrice, setEditPlanPrice] = useState('');
  const [editPlanDuration, setEditPlanDuration] = useState('');
  const [editPlanMinRadius, setEditPlanMinRadius] = useState('');
  const [editPlanMaxRadius, setEditPlanMaxRadius] = useState('');
  const [editPlanPriority, setEditPlanPriority] = useState('');
  const [savingPlan, setSavingPlan] = useState(false);

  // New Plan Creation Modal
  const [showAddPlanModal, setShowAddPlanModal] = useState(false);
  const [newPlanName, setNewPlanName] = useState('');
  const [newPlanDuration, setNewPlanDuration] = useState('');
  const [newPlanPrice, setNewPlanPrice] = useState('');
  const [newPlanMinRadius, setNewPlanMinRadius] = useState('100');
  const [newPlanMaxRadius, setNewPlanMaxRadius] = useState('5000');
  const [newPlanPriority, setNewPlanPriority] = useState('High Priority');
  const [newPlanBadge, setNewPlanBadge] = useState('Special');
  const [creatingPlan, setCreatingPlan] = useState(false);

  // Debounced search query
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 400);
    return () => clearTimeout(timer);
  }, [search]);

  // Queries
  const stats = useAdminStats();
  const pendingProviders = useAdminProviders({ status: 'PENDING' });
  const providers = useAdminProviders({
    status: providerFilter === 'ALL' ? undefined : providerFilter,
    q: query || undefined,
  });
  const users = useAdminUsers({ role: roleFilter === 'ALL' ? undefined : roleFilter, q: query || undefined });
  const bookings = useAdminBookings({ pageSize: 25 });
  const plansQuery = useAdminPlans();
  const helpdeskQuery = useAdminHelpdesk();
  const reviewsQuery = useAdminReviews();
  const audit = useAdminAuditLogs();

  // Mutations
  const reviewProvider = useReviewProvider();
  const setUserStatus = useSetUserStatus();
  const createPlanMutation = useCreateAdminPlan();
  const updatePlanMutation = useUpdateAdminPlan();
  const deletePlanMutation = useDeleteAdminPlan();
  const updateHelpdeskMutation = useUpdateAdminHelpdesk();
  const deleteReviewMutation = useDeleteAdminReview();

  // Dynamic Time-Based Greeting
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    if (hour < 21) return 'Good evening';
    return 'Good night';
  }, []);

  const pendingCount = (pendingProviders.data ?? []).length;
  const openTicketsCount = (helpdeskQuery.data ?? []).filter(
    (t) => t.metadata?.ticketStatus !== 'RESOLVED',
  ).length;

  const refresh = async () => {
    if (activeTab === 'overview') {
      await Promise.all([stats.refetch(), bookings.refetch(), pendingProviders.refetch()]);
    } else if (activeTab === 'providers') {
      await providers.refetch();
    } else if (activeTab === 'users') {
      await users.refetch();
    } else if (activeTab === 'plans') {
      await plansQuery.refetch();
    } else {
      await Promise.all([helpdeskQuery.refetch(), reviewsQuery.refetch(), audit.refetch()]);
    }
  };

  const refreshing =
    stats.isRefetching ||
    providers.isRefetching ||
    users.isRefetching ||
    bookings.isRefetching ||
    plansQuery.isRefetching ||
    helpdeskQuery.isRefetching ||
    reviewsQuery.isRefetching ||
    audit.isRefetching;

  // Provider review actions
  const review = async (
    provider: ProviderDetail,
    status: 'APPROVED' | 'REJECTED' | 'SUSPENDED',
    reason?: string,
  ) => {
    // Guard: prevent double-fire if already reviewing this provider
    if (reviewingId === provider.id) return;
    setReviewingId(provider.id);
    try {
      await reviewProvider.mutateAsync({ id: provider.id, status, note: reason });
      setRejectTarget(null);
      setRejectionNote('');
    } catch (error) {
      Alert.alert('Could not update provider', getErrorMessage(error));
    } finally {
      setReviewingId(null);
    }
  };

  const confirmApprove = (provider: ProviderDetail) => {
    const hasHost = Boolean(provider.user?.avatarUrl || provider.documents?.some((d) => d.type === 'ID_PROOF'));
    const hasCharger = Boolean(provider.documents?.some((d) => d.type === 'CHARGER_PHOTO' || d.type === 'SITE_PHOTO'));

    if (!hasHost || !hasCharger) {
      Alert.alert(
        'Missing Verification Photos',
        'Cannot approve station. Both host personal photo and charging point photo must be uploaded.',
      );
      return;
    }

    Alert.alert(
      'Approve Station',
      `Verify and approve ${provider.businessName}? The station will immediately be visible to nearby drivers.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Approve', onPress: () => void review(provider, 'APPROVED') },
      ],
    );
  };

  const confirmSuspend = (provider: ProviderDetail) => {
    Alert.alert(
      'Suspend Station',
      `Immediately hide ${provider.businessName} from all driver searches?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Suspend', style: 'destructive', onPress: () => void review(provider, 'SUSPENDED') },
      ],
    );
  };

  const submitReject = async () => {
    if (!rejectTarget) return;
    if (rejectionNote.trim().length < 5) {
      Alert.alert('Reason required', 'Write a short message explaining why this application is rejected.');
      return;
    }
    await review(rejectTarget, 'REJECTED', rejectionNote.trim());
  };

  const toggleUserActive = async (target: User, next: boolean) => {
    // Guard: prevent double-fire if already in progress for this user
    if (statusBusyId === target.id) return;
    setStatusBusyId(target.id);
    try {
      await setUserStatus.mutateAsync({ id: target.id, isActive: next });
    } catch (error) {
      Alert.alert('Could not update user', getErrorMessage(error));
    } finally {
      setStatusBusyId(null);
    }
  };

  // Plan Editing Handlers
  const openEditPlan = (plan: SubscriptionPlanOption) => {
    setEditingPlan(plan);
    setEditPlanName(plan.name || '');
    setEditPlanPrice(String(plan.price ?? ''));
    setEditPlanDuration(plan.durationLabel || '');
    setEditPlanMinRadius(String(plan.minRadiusM ?? '100'));
    setEditPlanMaxRadius(String(plan.maxRadiusM ?? '5000'));
    setEditPlanPriority(plan.priorityLabel || '');
  };

  const handleSavePlan = async () => {
    if (!editingPlan) return;
    const priceNum = Number(editPlanPrice);
    if (isNaN(priceNum) || priceNum <= 0) {
      Alert.alert('Invalid price', 'Please enter a valid positive number for price.');
      return;
    }
    setSavingPlan(true);
    try {
      await updatePlanMutation.mutateAsync({
        key: editingPlan.key,
        body: {
          name: editPlanName.trim(),
          price: priceNum,
          durationLabel: editPlanDuration.trim(),
          minRadiusM: Number(editPlanMinRadius) || editingPlan.minRadiusM,
          maxRadiusM: Number(editPlanMaxRadius) || editingPlan.maxRadiusM,
          priorityLabel: editPlanPriority.trim() || editingPlan.priorityLabel,
        },
      });
      setEditingPlan(null);
      Alert.alert('Plan Updated ✓', `${editPlanName} has been updated.`);
    } catch (err) {
      Alert.alert('Update failed', getErrorMessage(err));
    } finally {
      setSavingPlan(false);
    }
  };

  // Create New Plan Handler
  const handleCreateNewPlan = async () => {
    if (!newPlanName.trim() || !newPlanDuration.trim() || !newPlanPrice.trim()) {
      Alert.alert('Missing fields', 'Plan name, duration label, and price are required.');
      return;
    }
    const priceNum = Number(newPlanPrice);
    if (isNaN(priceNum) || priceNum <= 0) {
      Alert.alert('Invalid price', 'Please enter a valid positive price.');
      return;
    }

    setCreatingPlan(true);
    try {
      await createPlanMutation.mutateAsync({
        name: newPlanName.trim(),
        durationLabel: newPlanDuration.trim(),
        price: priceNum,
        minRadiusM: Number(newPlanMinRadius) || 100,
        maxRadiusM: Number(newPlanMaxRadius) || 5000,
        priorityLabel: newPlanPriority.trim() || 'Custom Priority',
        badge: newPlanBadge.trim() || 'Special',
      });
      setShowAddPlanModal(false);
      setNewPlanName('');
      setNewPlanDuration('');
      setNewPlanPrice('');
      Alert.alert('New Plan Created ✓', 'The new subscription plan is live and available for providers.');
    } catch (err) {
      Alert.alert('Could not create plan', getErrorMessage(err));
    } finally {
      setCreatingPlan(false);
    }
  };

  const handleDeletePlan = (plan: SubscriptionPlanOption) => {
    Alert.alert('Delete Plan', `Are you sure you want to delete ${plan.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deletePlanMutation.mutateAsync(plan.key);
            Alert.alert('Plan Deleted', `${plan.name} has been removed.`);
          } catch (err) {
            Alert.alert('Could not delete', getErrorMessage(err));
          }
        },
      },
    ]);
  };

  const handleResolveTicket = async (ticket: AdminHelpdeskTicket) => {
    try {
      await updateHelpdeskMutation.mutateAsync({
        id: ticket.id,
        body: { status: 'RESOLVED', note: 'Marked resolved by Administrator' },
      });
      Alert.alert('Ticket Resolved ✓', 'Ticket marked as resolved.');
    } catch (err) {
      Alert.alert('Update failed', getErrorMessage(err));
    }
  };

  const handleDeleteReview = (item: AdminReviewItem) => {
    Alert.alert('Delete Review', `Delete review from ${item.driver?.fullName ?? 'driver'}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteReviewMutation.mutateAsync(item.id);
            Alert.alert('Review Removed', 'Review deleted successfully.');
          } catch (err) {
            Alert.alert('Could not delete', getErrorMessage(err));
          }
        },
      },
    ]);
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(app)');
    }
  };

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleBack();
      return true;
    });
    return () => sub.remove();
  }, []);

  const handleUnlockAdmin = async () => {
    if (!adminPhone.trim() || !adminPassword.trim()) {
      Alert.alert('Required', 'Please enter admin phone/email and password.');
      return;
    }
    setUnlocking(true);
    try {
      const tokens = await authApi.login({
        phone: adminPhone.trim(),
        password: adminPassword,
      });
      await setSession(tokens);
      authenticateSocket(tokens.accessToken, tokens.user?.id, tokens.user?.providerProfile?.id);
      queryClient.clear();
      Alert.alert('Admin Console Unlocked! ✓', 'Welcome, Administrator.');
    } catch (err) {
      Alert.alert('Authentication Failed', getErrorMessage(err));
    } finally {
      setUnlocking(false);
    }
  };

  if (!isAdmin) {
    return (
      <View style={[styles.flex, { paddingTop: insets.top, backgroundColor: '#090D16' }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 }}>
          <Pressable onPress={handleBack} style={styles.backButton}>
            <MaterialCommunityIcons name="arrow-left" size={22} color="#FFFFFF" />
          </Pressable>
          <Text style={{ fontSize: 18, fontWeight: '800', color: '#FFFFFF', marginLeft: 12 }}>
            Admin Verification
          </Text>
        </View>

        <ScrollView contentContainerStyle={{ padding: 24, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(239, 68, 68, 0.12)', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <MaterialCommunityIcons name="shield-crown" size={38} color="#EF4444" />
          </View>

          <Text style={{ fontSize: 22, fontWeight: '900', color: '#FFFFFF', textAlign: 'center', marginBottom: 6 }}>
            Admin Console Access
          </Text>
          <Text style={{ fontSize: 13, color: '#94A3B8', textAlign: 'center', marginBottom: 28, lineHeight: 20 }}>
            Enter administrator credentials to unlock station approvals, plan controls, user management, and audit logs.
          </Text>

          <View style={{ width: '100%', backgroundColor: '#131B2E', borderRadius: 18, padding: 20, borderWidth: 1, borderColor: '#1E293B', marginBottom: 20 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', marginBottom: 6 }}>
              Administrator Identifier
            </Text>
            <TextInput
              mode="outlined"
              value={adminPhone}
              onChangeText={setAdminPhone}
              placeholder="+919999999999 or admin@evrescue.local"
              textColor="#FFFFFF"
              outlineColor="#334155"
              activeOutlineColor="#10B981"
              style={{ backgroundColor: '#0A101D', marginBottom: 16 }}
            />

            <Text style={{ fontSize: 12, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', marginBottom: 6 }}>
              Admin Master Password
            </Text>
            <TextInput
              mode="outlined"
              value={adminPassword}
              onChangeText={setAdminPassword}
              secureTextEntry
              placeholder="Admin@12345"
              textColor="#FFFFFF"
              outlineColor="#334155"
              activeOutlineColor="#10B981"
              style={{ backgroundColor: '#0A101D', marginBottom: 20 }}
            />

            <Button
              mode="contained"
              loading={unlocking}
              disabled={unlocking}
              onPress={handleUnlockAdmin}
              buttonColor="#10B981"
              textColor="#FFFFFF"
              style={{ borderRadius: 12, paddingVertical: 4 }}
              icon="shield-check"
            >
              Unlock Console
            </Button>
          </View>

          <Button
            mode="text"
            onPress={() => {
              setAdminPhone('+919999999999');
              setAdminPassword('Admin@12345');
            }}
            textColor="#38BDF8"
            icon="auto-fix"
          >
            Prefill Default Admin Credentials
          </Button>
        </ScrollView>
      </View>
    );
  }

  if (stats.isLoading && !stats.data) {
    return <Loading label="Loading Admin Control Center…" />;
  }

  return (
    <View style={[styles.flex, { paddingTop: insets.top }]}>
      {/* ============================================================= */}
      {/* 1. TOP EXECUTIVE HEADER                                       */}
      {/* ============================================================= */}
      <View style={styles.topHeader}>
        <View style={styles.topHeaderLeft}>
          <Pressable onPress={handleBack} style={styles.backButton} hitSlop={10}>
            <MaterialCommunityIcons name="arrow-left" size={22} color="#FFFFFF" />
          </Pressable>
          <View style={styles.shieldIconWrap}>
            <MaterialCommunityIcons name="shield-crown" size={18} color="#10B981" />
          </View>
          <View style={{ flexShrink: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.appTitle}>Admin</Text>
              <View style={styles.liveSystemPill}>
                <View style={styles.pulseGreenDot} />
                <Text style={styles.liveSystemText}>LIVE</Text>
              </View>
            </View>
            <Text style={styles.appSubtitle} numberOfLines={1}>
              EV Rescue Management System
            </Text>
          </View>
        </View>

        <View style={styles.topHeaderRight}>
          <Pressable onPress={() => void refresh()} style={styles.headerIconButton} hitSlop={8}>
            <MaterialCommunityIcons name="refresh" size={20} color="#A7F3D0" />
          </Pressable>
          <Pressable
            onPress={() => setSignOutOpen(true)}
            style={styles.headerIconButton}
            hitSlop={8}
          >
            <MaterialCommunityIcons name="logout" size={19} color="#F87171" />
          </Pressable>
        </View>
      </View>

      {/* ============================================================= */}
      {/* 2. DYNAMIC TIME-BASED GREETING CARD                           */}
      {/* ============================================================= */}
      <View style={styles.greetingCard}>
        <View style={{ flex: 1, paddingRight: 8 }}>
          <Text style={styles.greetingTitle} numberOfLines={1}>
            {greeting}, {user?.fullName?.split(' ')[0] || 'Admin'} 👋
          </Text>
          <Text style={styles.greetingSub} numberOfLines={2}>
            Platform revenue, real-time stations, user traffic and active slots.
          </Text>
        </View>
        <View style={styles.adminAvatarBox}>
          <Text style={styles.adminAvatarText}>AD</Text>
        </View>
      </View>

      {/* ============================================================= */}
      {/* 3. MAIN CONTENT BODY (SCROLLABLE, NEVER OVERLAPPED)           */}
      {/* ============================================================= */}
      <View style={styles.contentBody}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor="#10B981" />
          }
        >
          {/* =========================================================== */}
          {/* TAB 1: OVERVIEW & REAL-TIME MONITOR                         */}
          {/* =========================================================== */}
          {activeTab === 'overview' ? (
            <View>
              {/* Executive Gross Revenue Card */}
              <View style={styles.revenueCard}>
                <View style={styles.revenueTop}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={styles.revenueLabel}>TOTAL GROSS PLATFORM REVENUE</Text>
                    <Text style={styles.revenueAmount} numberOfLines={1} adjustsFontSizeToFit>
                      {formatCurrency(stats.data?.grossRevenue ?? 0)}
                    </Text>
                  </View>
                  <View style={styles.revenueIconWrap}>
                    <MaterialCommunityIcons name="cash-multiple" size={28} color="#10B981" />
                  </View>
                </View>

                <View style={styles.revenueDivider} />

                <View style={styles.metricsRow}>
                  <View style={styles.metricItem}>
                    <Text style={styles.metricVal} numberOfLines={1}>{stats.data?.drivers ?? 0}</Text>
                    <Text style={styles.metricLbl} numberOfLines={1}>Active Drivers</Text>
                  </View>
                  <View style={styles.metricDivider} />
                  <View style={styles.metricItem}>
                    <Text style={styles.metricVal} numberOfLines={1}>{stats.data?.providers ?? 0}</Text>
                    <Text style={styles.metricLbl} numberOfLines={1}>Station Hosts</Text>
                  </View>
                  <View style={styles.metricDivider} />
                  <View style={styles.metricItem}>
                    <Text style={styles.metricVal} numberOfLines={1}>{stats.data?.completedBookings ?? 0}</Text>
                    <Text style={styles.metricLbl} numberOfLines={1}>Completed</Text>
                  </View>
                </View>
              </View>

              {/* Quick Action Tiles */}
              <View style={styles.quickGrid}>
                <Pressable
                  style={styles.quickTile}
                  onPress={() => {
                    setProviderFilter('PENDING');
                    setActiveTab('providers');
                  }}
                >
                  <View style={[styles.quickTileIcon, { backgroundColor: '#FEF3C7' }]}>
                    <MaterialCommunityIcons name="shield-alert-outline" size={20} color="#D97706" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.quickTileTitle} numberOfLines={1}>Approvals</Text>
                    <Text style={styles.quickTileSub} numberOfLines={1}>{pendingCount} pending KYC</Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={18} color="#94A3B8" />
                </Pressable>

                <Pressable style={styles.quickTile} onPress={() => setActiveTab('support')}>
                  <View style={[styles.quickTileIcon, { backgroundColor: '#DBEAFE' }]}>
                    <MaterialCommunityIcons name="headset" size={20} color="#2563EB" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.quickTileTitle} numberOfLines={1}>Helpdesk</Text>
                    <Text style={styles.quickTileSub} numberOfLines={1}>{openTicketsCount} tickets</Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={18} color="#94A3B8" />
                </Pressable>
              </View>

              {/* Live Payments & Booking Transactions Monitor */}
              <View style={styles.sectionHeaderWrap}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <MaterialCommunityIcons name="radar" size={18} color="#059669" />
                  <Text style={styles.sectionHeaderTitle}>Live Bookings & User Payments</Text>
                </View>
                <Text style={styles.sectionHeaderSub}>Real-time charging sessions stream</Text>
              </View>

              {bookings.isLoading ? (
                <Loading label="Fetching live bookings…" />
              ) : (bookings.data ?? []).length === 0 ? (
                <View style={styles.emptyCard}>
                  <MaterialCommunityIcons name="calendar-blank-outline" size={32} color="#94A3B8" />
                  <Text style={styles.emptyCardText}>No booking transactions recorded yet.</Text>
                </View>
              ) : (
                (bookings.data ?? []).slice(0, 10).map((b) => (
                  <View key={b.id} style={styles.bookingCard}>
                    <View style={styles.bookingCardTop}>
                      <View style={{ flex: 1, paddingRight: 6 }}>
                        <Text style={styles.bookingDriverName} numberOfLines={1}>
                          {b.driver?.fullName || 'Driver'} • {b.driver?.phone || 'No phone'}
                        </Text>
                        <Text style={styles.bookingStationName} numberOfLines={1}>
                          📍 Going to: <Text style={{ fontWeight: '700', color: '#0F172A' }}>{b.provider?.businessName || 'Charging Station'}</Text>
                        </Text>
                      </View>
                      <StatusBadge status={b.status} />
                    </View>

                    <View style={styles.bookingDetailsRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 }}>
                        <MaterialCommunityIcons name="car-electric" size={15} color="#64748B" />
                        <Text style={styles.bookingMetaText} numberOfLines={1}>
                          {b.vehicle ? `${b.vehicle.make} ${b.vehicle.model}` : 'EV'}
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <MaterialCommunityIcons name="clock-outline" size={15} color="#64748B" />
                        <Text style={styles.bookingMetaText}>{timeAgo(b.createdAt)}</Text>
                      </View>
                      <Text style={styles.bookingAmountText}>
                        {formatCurrency(b.totalAmount || b.estimatedCost || 0)}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          ) : null}

          {/* =========================================================== */}
          {/* TAB 2: PROVIDERS & THEIR USER VISITS                        */}
          {/* =========================================================== */}
          {activeTab === 'providers' ? (
            <View>
              {/* Search Input */}
              <TextInput
                mode="outlined"
                placeholder="Search station name or city…"
                value={search}
                onChangeText={setSearch}
                style={styles.searchBar}
                outlineColor="#E2E8F0"
                activeOutlineColor="#10B981"
                left={<TextInput.Icon icon="magnify" color="#64748B" />}
                right={search ? <TextInput.Icon icon="close" onPress={() => setSearch('')} /> : undefined}
              />

              {/* Filter Chips */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
                {(['ALL', 'PENDING', 'APPROVED', 'SUSPENDED', 'REJECTED'] as ProviderFilter[]).map((f) => {
                  const active = providerFilter === f;
                  return (
                    <Chip
                      key={f}
                      selected={active}
                      onPress={() => setProviderFilter(f)}
                      style={[styles.filterChip, active && styles.filterChipActive]}
                      textStyle={[styles.filterChipText, active && styles.filterChipTextActive]}
                    >
                      {f}
                    </Chip>
                  );
                })}
              </ScrollView>

              {providers.isLoading ? (
                <Loading label="Loading stations…" />
              ) : (providers.data ?? []).length === 0 ? (
                <EmptyState icon="ev-station" title="No providers found" message="Try adjusting your filter or search query." />
              ) : (
                (providers.data ?? []).map((p) => {
                  const isExpanded = expandedProviderId === p.id;
                  const bookingsCount = p.bookings?.length ?? p._count?.bookings ?? 0;
                  const revenue = p.totalRevenue ?? 0;

                  return (
                    <View key={p.id} style={styles.providerCard}>
                      {/* Provider Main Info */}
                      <View style={styles.providerHead}>
                        <View style={{ flex: 1, paddingRight: 6 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <Text style={styles.providerBusinessName} numberOfLines={1}>
                              {p.businessName}
                            </Text>
                            <StatusBadge status={p.verificationStatus} />
                          </View>
                          <Text style={styles.providerHostName} numberOfLines={1}>
                            Host: {p.user?.fullName || 'Owner'} • {p.user?.phone || p.phone}
                          </Text>
                          <Text style={styles.providerCityText} numberOfLines={2}>
                            📍 {p.city || 'Station City'}{p.addressLine ? `, ${p.addressLine}` : ''}
                          </Text>
                        </View>
                      </View>

                      {/* Revenue & Users Metric Bar */}
                      <View style={styles.providerStatsBar}>
                        <View style={styles.providerStatCol}>
                          <Text style={styles.providerStatVal} numberOfLines={1}>{formatCurrency(revenue)}</Text>
                          <Text style={styles.providerStatLbl} numberOfLines={1}>Total Earnings</Text>
                        </View>
                        <View style={styles.providerStatDivider} />
                        <View style={styles.providerStatCol}>
                          <Text style={styles.providerStatVal} numberOfLines={1}>{bookingsCount}</Text>
                          <Text style={styles.providerStatLbl} numberOfLines={1}>Users Booked</Text>
                        </View>
                        <View style={styles.providerStatDivider} />
                        <View style={styles.providerStatCol}>
                          <Text style={styles.providerStatVal} numberOfLines={1}>₹{p.pricePerKwh ?? 20}/kWh</Text>
                          <Text style={styles.providerStatLbl} numberOfLines={1}>Tariff Rate</Text>
                        </View>
                      </View>

                      {/* Toggle User Incoming Bookings */}
                      <Pressable
                        style={styles.expandUsersToggle}
                        onPress={() => setExpandedProviderId(isExpanded ? null : p.id)}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
                          <MaterialCommunityIcons name="account-clock-outline" size={18} color="#059669" />
                          <Text style={styles.expandUsersText} numberOfLines={1}>
                            {isExpanded ? 'Hide User Bookings' : `View Users Coming (${bookingsCount})`}
                          </Text>
                        </View>
                        <MaterialCommunityIcons
                          name={isExpanded ? 'chevron-up' : 'chevron-down'}
                          size={20}
                          color="#059669"
                        />
                      </Pressable>

                      {/* Expanded Users List */}
                      {isExpanded ? (
                        <View style={styles.expandedUsersContainer}>
                          <Text style={styles.expandedUsersTitle}>DRIVERS VISITING THIS STATION:</Text>
                          {bookingsCount === 0 ? (
                            <Text style={styles.noUsersText}>No drivers have booked this station yet.</Text>
                          ) : (
                            (p.bookings ?? []).map((b) => (
                              <View key={b.id} style={styles.userBookingRow}>
                                <View style={{ flex: 1, paddingRight: 6 }}>
                                  <Text style={styles.userBookingDriver} numberOfLines={1}>
                                    👤 {b.driver?.fullName || 'Driver'} ({b.driver?.phone || 'No phone'})
                                  </Text>
                                  <Text style={styles.userBookingVehicle} numberOfLines={1}>
                                    🚗 {b.vehicle ? `${b.vehicle.make} ${b.vehicle.model}` : 'EV'}
                                  </Text>
                                  <Text style={styles.userBookingTime} numberOfLines={1}>
                                    📅 {b.scheduledAt ? new Date(b.scheduledAt).toLocaleDateString() : 'Direct'}
                                  </Text>
                                </View>
                                <View style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
                                  <StatusBadge status={b.status} />
                                  <Text style={styles.userBookingAmount}>
                                    {formatCurrency(b.totalAmount || b.estimatedCost || 0)}
                                  </Text>
                                </View>
                              </View>
                            ))
                          )}
                        </View>
                      ) : null}

                      {/* KYC Photos Preview */}
                      {p.documents && p.documents.length > 0 ? (
                        <View style={styles.docsPreviewRow}>
                          <Text style={styles.docsLabel}>KYC Photos:</Text>
                          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                            {p.documents.map((doc) => (
                              <View key={doc.id} style={styles.docThumbWrap}>
                                <Image
                                  source={{ uri: resolveImageUrl(doc.fileUrl) || doc.fileUrl }}
                                  style={styles.docThumb}
                                />
                                <Text style={styles.docTypeLabel} numberOfLines={1}>{doc.type}</Text>
                              </View>
                            ))}
                          </ScrollView>
                        </View>
                      ) : null}

                      {/* Provider Action Buttons */}
                      <View style={styles.providerActionsRow}>
                        {p.verificationStatus === 'PENDING' ? (
                          <>
                            <Button
                              mode="contained"
                              buttonColor="#059669"
                              onPress={() => confirmApprove(p)}
                              loading={reviewingId === p.id}
                              style={{ flex: 1, marginRight: 8 }}
                            >
                              Approve Station
                            </Button>
                            <Button
                              mode="outlined"
                              textColor="#DC2626"
                              onPress={() => setRejectTarget(p)}
                              style={{ flex: 1 }}
                            >
                              Reject
                            </Button>
                          </>
                        ) : p.verificationStatus === 'APPROVED' ? (
                          <Button
                            mode="outlined"
                            textColor="#D97706"
                            onPress={() => confirmSuspend(p)}
                            style={{ flex: 1 }}
                          >
                            Suspend Station
                          </Button>
                        ) : (
                          <Button
                            mode="contained"
                            buttonColor="#059669"
                            onPress={() => confirmApprove(p)}
                            style={{ flex: 1 }}
                          >
                            Re-Approve Station
                          </Button>
                        )}
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          ) : null}

          {/* =========================================================== */}
          {/* TAB 3: USERS & DRIVERS DATA WITH PAYMENTS                   */}
          {/* =========================================================== */}
          {activeTab === 'users' ? (
            <View>
              <TextInput
                mode="outlined"
                placeholder="Search user by name, phone or email…"
                value={search}
                onChangeText={setSearch}
                style={styles.searchBar}
                outlineColor="#E2E8F0"
                activeOutlineColor="#10B981"
                left={<TextInput.Icon icon="magnify" color="#64748B" />}
                right={search ? <TextInput.Icon icon="close" onPress={() => setSearch('')} /> : undefined}
              />

              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
                {(['ALL', 'DRIVER', 'PROVIDER', 'ADMIN'] as RoleFilter[]).map((r) => {
                  const active = roleFilter === r;
                  return (
                    <Chip
                      key={r}
                      selected={active}
                      onPress={() => setRoleFilter(r)}
                      style={[styles.filterChip, active && styles.filterChipActive]}
                      textStyle={[styles.filterChipText, active && styles.filterChipTextActive]}
                    >
                      {r}
                    </Chip>
                  );
                })}
              </ScrollView>

              {users.isLoading ? (
                <Loading label="Loading users…" />
              ) : (users.data ?? []).length === 0 ? (
                <EmptyState icon="account-group-outline" title="No users found" message="Try searching with a different term." />
              ) : (
                (users.data ?? []).map((u) => {
                  const isExpanded = expandedUserId === u.id;
                  const totalSpent = (u as { totalSpent?: number }).totalSpent ?? 0;
                  const userBookings = (u as { bookings?: AdminBookingItem[] }).bookings ?? [];

                  return (
                    <View key={u.id} style={styles.userCard}>
                      <View style={styles.userCardHead}>
                        <View style={styles.userAvatarWrap}>
                          <Text style={styles.userAvatarText}>{u.fullName ? u.fullName.charAt(0).toUpperCase() : 'U'}</Text>
                        </View>
                        <View style={{ flex: 1, paddingRight: 6 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <Text style={styles.userNameText} numberOfLines={1}>{u.fullName}</Text>
                            <View
                              style={[
                                styles.roleBadge,
                                { backgroundColor: u.role === 'PROVIDER' ? '#FEF3C7' : u.role === 'ADMIN' ? '#FEE2E2' : '#E0E7FF' },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.roleBadgeText,
                                  { color: u.role === 'PROVIDER' ? '#92400E' : u.role === 'ADMIN' ? '#991B1B' : '#3730A3' },
                                ]}
                              >
                                {u.role}
                              </Text>
                            </View>
                          </View>
                          <Text style={styles.userPhoneText} numberOfLines={1}>📞 {u.phone || 'No phone'}</Text>
                          <Text style={styles.userEmailText} numberOfLines={1}>✉️ {u.email || 'No email'}</Text>
                        </View>

                        {/* Active/Suspended Account Toggle */}
                        <View style={{ alignItems: 'center' }}>
                          <Switch
                            value={u.isActive}
                            onValueChange={(val) => void toggleUserActive(u, val)}
                            color="#059669"
                            disabled={statusBusyId === u.id || u.role === 'ADMIN'}
                          />
                          <Text style={{ fontSize: 9.5, color: u.isActive ? '#059669' : '#DC2626', fontWeight: '700' }}>
                            {u.isActive ? 'Active' : 'Suspended'}
                          </Text>
                        </View>
                      </View>

                      {/* User Spend & Vehicle Summary */}
                      <View style={styles.userFinancialBar}>
                        <View style={styles.userFinancialCol}>
                          <Text style={styles.userFinancialVal} numberOfLines={1}>{formatCurrency(totalSpent)}</Text>
                          <Text style={styles.userFinancialLbl} numberOfLines={1}>Total Spent</Text>
                        </View>
                        <View style={styles.userFinancialDivider} />
                        <View style={styles.userFinancialCol}>
                          <Text style={styles.userFinancialVal} numberOfLines={1}>{u.vehicles?.length ?? 0}</Text>
                          <Text style={styles.userFinancialLbl} numberOfLines={1}>EVs Registered</Text>
                        </View>
                        <View style={styles.userFinancialDivider} />
                        <View style={styles.userFinancialCol}>
                          <Text style={styles.userFinancialVal} numberOfLines={1}>{userBookings.length}</Text>
                          <Text style={styles.userFinancialLbl} numberOfLines={1}>Charging Trips</Text>
                        </View>
                      </View>

                      {/* Toggle User Charging Sessions */}
                      <Pressable
                        style={styles.expandUsersToggle}
                        onPress={() => setExpandedUserId(isExpanded ? null : u.id)}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
                          <MaterialCommunityIcons name="history" size={18} color="#0284C7" />
                          <Text style={[styles.expandUsersText, { color: '#0284C7' }]} numberOfLines={1}>
                            {isExpanded ? 'Hide Charging Trips' : `View Stations Visited & Payments (${userBookings.length})`}
                          </Text>
                        </View>
                        <MaterialCommunityIcons
                          name={isExpanded ? 'chevron-up' : 'chevron-down'}
                          size={20}
                          color="#0284C7"
                        />
                      </Pressable>

                      {isExpanded ? (
                        <View style={styles.expandedUsersContainer}>
                          <Text style={styles.expandedUsersTitle}>STATIONS VISITED & PAID TRIPS:</Text>
                          {userBookings.length === 0 ? (
                            <Text style={styles.noUsersText}>No charging sessions logged yet.</Text>
                          ) : (
                            userBookings.map((b) => (
                              <View key={b.id} style={styles.userBookingRow}>
                                <View style={{ flex: 1, paddingRight: 6 }}>
                                  <Text style={styles.userBookingDriver} numberOfLines={1}>
                                    ⚡ {b.provider?.businessName || 'Host'} ({b.provider?.city || 'Nearby'})
                                  </Text>
                                  <Text style={styles.userBookingTime} numberOfLines={1}>
                                    📅 {b.scheduledAt ? new Date(b.scheduledAt).toLocaleDateString() : 'Direct'}
                                  </Text>
                                </View>
                                <View style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
                                  <StatusBadge status={b.status} />
                                  <Text style={styles.userBookingAmount}>{formatCurrency(b.totalAmount || 0)}</Text>
                                </View>
                              </View>
                            ))
                          )}
                        </View>
                      ) : null}
                    </View>
                  );
                })
              )}
            </View>
          ) : null}

          {/* =========================================================== */}
          {/* TAB 4: SUBSCRIPTION PLANS (VIEW, EDIT, & ADD NEW PLANS)    */}
          {/* =========================================================== */}
          {activeTab === 'plans' ? (
            <View>
              {/* Header with "+ Add New Plan" Button */}
              <View style={styles.plansHeaderWrap}>
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <Text style={styles.plansHeaderTitle}>Provider Listing Plans</Text>
                  <Text style={styles.plansHeaderDesc}>
                    Live-edit pricing, validity, radar radius, or add custom plans anytime.
                  </Text>
                </View>
                <Button
                  mode="contained"
                  buttonColor="#059669"
                  icon="plus"
                  onPress={() => setShowAddPlanModal(true)}
                  style={styles.addPlanButton}
                  contentStyle={{ paddingHorizontal: 4 }}
                >
                  Add Plan
                </Button>
              </View>

              {plansQuery.isLoading ? (
                <Loading label="Loading subscription plans…" />
              ) : (plansQuery.data ?? []).length === 0 ? (
                <EmptyState icon="tag-multiple-outline" title="No plans available" message="Add a new plan to get started." />
              ) : (
                (plansQuery.data ?? []).map((p) => {
                  const isCustom = !['MONTH_1', 'MONTH_5', 'YEAR_1'].includes(p.key);
                  return (
                    <View key={p.key} style={styles.planCard}>
                      <View style={styles.planCardHead}>
                        <View style={{ flex: 1, paddingRight: 10 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <Text style={styles.planNameText} numberOfLines={1}>{p.name}</Text>
                            {p.badge ? (
                              <View style={[styles.planBadgeWrap, { backgroundColor: p.badgeColor || '#059669' }]}>
                                <Text style={styles.planBadgeText} numberOfLines={1}>{p.badge}</Text>
                              </View>
                            ) : null}
                          </View>
                          <Text style={styles.planDurationText} numberOfLines={1}>⏱️ {p.durationLabel}</Text>
                        </View>
                        <Text style={styles.planPriceText}>{p.priceFormatted || `₹${p.price}`}</Text>
                      </View>

                      <View style={styles.planSpecsBox}>
                        <View style={styles.planSpecCol}>
                          <Text style={styles.planSpecVal} numberOfLines={1}>
                            {p.visibilityRange || `${p.minRadiusM}m - ${p.maxRadiusM}m`}
                          </Text>
                          <Text style={styles.planSpecLbl} numberOfLines={1}>Radar Radius</Text>
                        </View>
                        <View style={styles.planSpecDivider} />
                        <View style={styles.planSpecCol}>
                          <Text style={styles.planSpecVal} numberOfLines={1}>{p.priorityLabel}</Text>
                          <Text style={styles.planSpecLbl} numberOfLines={1}>Priority Tier</Text>
                        </View>
                      </View>

                      {/* Plan Features */}
                      {p.features && p.features.length > 0 ? (
                        <View style={styles.planFeaturesWrap}>
                          {p.features.map((feat, idx) => (
                            <View key={idx} style={styles.featureItemRow}>
                              <MaterialCommunityIcons name="check-circle" size={14} color="#059669" />
                              <Text style={styles.featureItemText} numberOfLines={2}>{feat}</Text>
                            </View>
                          ))}
                        </View>
                      ) : null}

                      {/* Action Buttons */}
                      <View style={styles.planActionsRow}>
                        <Button
                          mode="contained-tonal"
                          icon="pencil"
                          onPress={() => openEditPlan(p)}
                          style={{ flex: 1, marginRight: isCustom ? 8 : 0 }}
                        >
                          Edit Plan Details
                        </Button>
                        {isCustom ? (
                          <Button
                            mode="outlined"
                            textColor="#DC2626"
                            icon="delete"
                            onPress={() => handleDeletePlan(p)}
                          >
                            Delete
                          </Button>
                        ) : null}
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          ) : null}

          {/* =========================================================== */}
          {/* TAB 5: SUPPORT (HELPDESK, REVIEWS & AUDIT)                  */}
          {/* =========================================================== */}
          {activeTab === 'support' ? (
            <View>
              {/* Sub-tab Navigation */}
              <View style={styles.supportSubTabsWrap}>
                <Pressable
                  style={[styles.supportSubTab, supportSubTab === 'helpdesk' && styles.supportSubTabActive]}
                  onPress={() => setSupportSubTab('helpdesk')}
                >
                  <Text style={[styles.supportSubTabText, supportSubTab === 'helpdesk' && styles.supportSubTabTextActive]}>
                    Helpdesk ({openTicketsCount})
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.supportSubTab, supportSubTab === 'reviews' && styles.supportSubTabActive]}
                  onPress={() => setSupportSubTab('reviews')}
                >
                  <Text style={[styles.supportSubTabText, supportSubTab === 'reviews' && styles.supportSubTabTextActive]}>
                    Reviews
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.supportSubTab, supportSubTab === 'audit' && styles.supportSubTabActive]}
                  onPress={() => setSupportSubTab('audit')}
                >
                  <Text style={[styles.supportSubTabText, supportSubTab === 'audit' && styles.supportSubTabTextActive]}>
                    Audit
                  </Text>
                </Pressable>
              </View>

              {/* Subtab 1: Helpdesk */}
              {supportSubTab === 'helpdesk' ? (
                helpdeskQuery.isLoading ? (
                  <Loading label="Loading support tickets…" />
                ) : (helpdeskQuery.data ?? []).length === 0 ? (
                  <EmptyState icon="headset" title="No helpdesk tickets" message="Drivers and hosts have not submitted any inquiries." />
                ) : (
                  (helpdeskQuery.data ?? []).map((t) => {
                    const isResolved = t.metadata?.ticketStatus === 'RESOLVED';
                    return (
                      <View key={t.id} style={styles.ticketCard}>
                        <View style={styles.ticketCardHead}>
                          <View style={{ flex: 1, paddingRight: 6 }}>
                            <Text style={styles.ticketSubject} numberOfLines={1}>{t.metadata?.subject || 'Support Request'}</Text>
                            <Text style={styles.ticketSender} numberOfLines={1}>
                              From: {t.actor?.fullName || 'User'} ({t.actor?.role || 'DRIVER'}) • {t.actor?.phone || ''}
                            </Text>
                            <Text style={styles.ticketTime}>{timeAgo(t.createdAt)}</Text>
                          </View>
                          <View style={[styles.ticketBadge, { backgroundColor: isResolved ? '#DCFCE7' : '#FEF3C7' }]}>
                            <Text style={[styles.ticketBadgeText, { color: isResolved ? '#15803D' : '#B45309' }]}>
                              {isResolved ? 'RESOLVED' : 'OPEN'}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.ticketMessageBox}>
                          <Text style={styles.ticketMessageText}>{t.metadata?.message || 'No details provided.'}</Text>
                        </View>

                        {!isResolved ? (
                          <Button
                            mode="contained"
                            buttonColor="#059669"
                            icon="check"
                            onPress={() => void handleResolveTicket(t)}
                            style={{ marginTop: 8 }}
                          >
                            Mark as Resolved
                          </Button>
                        ) : null}
                      </View>
                    );
                  })
                )
              ) : null}

              {/* Subtab 2: Reviews */}
              {supportSubTab === 'reviews' ? (
                reviewsQuery.isLoading ? (
                  <Loading label="Loading reviews…" />
                ) : (reviewsQuery.data ?? []).length === 0 ? (
                  <EmptyState icon="star-outline" title="No reviews yet" message="Driver ratings for stations will show here." />
                ) : (
                  (reviewsQuery.data ?? []).map((r) => (
                    <View key={r.id} style={styles.reviewCard}>
                      <View style={styles.reviewCardHead}>
                        <View style={{ flex: 1, paddingRight: 6 }}>
                          <Text style={styles.reviewDriverName} numberOfLines={1}>👤 {r.driver?.fullName || 'Driver'}</Text>
                          <Text style={styles.reviewStationName} numberOfLines={1}>⚡ For: {r.provider?.businessName || 'Station'}</Text>
                          <Text style={styles.reviewTime}>{timeAgo(r.createdAt)}</Text>
                        </View>
                        <View style={styles.starBadgeWrap}>
                          <MaterialCommunityIcons name="star" size={16} color="#F59E0B" />
                          <Text style={styles.starBadgeText}>{r.rating}.0</Text>
                        </View>
                      </View>

                      {r.comment ? <Text style={styles.reviewComment}>"{r.comment}"</Text> : null}

                      <Button
                        mode="text"
                        textColor="#DC2626"
                        icon="delete-outline"
                        onPress={() => handleDeleteReview(r)}
                        style={{ alignSelf: 'flex-end', marginTop: 4 }}
                      >
                        Delete Review
                      </Button>
                    </View>
                  ))
                )
              ) : null}

              {/* Subtab 3: Audit */}
              {supportSubTab === 'audit' ? (
                audit.isLoading ? (
                  <Loading label="Loading audit trail…" />
                ) : (audit.data ?? []).length === 0 ? (
                  <EmptyState icon="history" title="No audit entries" message="System events will appear here." />
                ) : (
                  (audit.data ?? []).map((a) => (
                    <View key={a.id} style={styles.auditRow}>
                      <View style={styles.auditIconBox}>
                        <MaterialCommunityIcons name="shield-check-outline" size={16} color="#059669" />
                      </View>
                      <View style={{ flex: 1, paddingRight: 6 }}>
                        <Text style={styles.auditActionText} numberOfLines={1}>{a.action}</Text>
                        <Text style={styles.auditActorText} numberOfLines={1}>
                          By: {a.actor?.fullName || 'Admin'} • {a.entity}
                        </Text>
                      </View>
                      <Text style={styles.auditTimeText}>{timeAgo(a.createdAt)}</Text>
                    </View>
                  ))
                )
              ) : null}
            </View>
          ) : null}
        </ScrollView>
      </View>

      {/* ============================================================= */}
      {/* 4. EXECUTIVE BOTTOM TAB BAR (FLEX CHILD: NEVER OVERLAPS)     */}
      {/* ============================================================= */}
      <View style={[styles.bottomTabBar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        <Pressable style={styles.tabButton} onPress={() => setActiveTab('overview')}>
          <MaterialCommunityIcons
            name={activeTab === 'overview' ? 'view-dashboard' : 'view-dashboard-outline'}
            size={23}
            color={activeTab === 'overview' ? '#10B981' : '#64748B'}
          />
          <Text style={[styles.tabButtonLabel, activeTab === 'overview' && styles.tabButtonLabelActive]}>
            Overview
          </Text>
        </Pressable>

        <Pressable style={styles.tabButton} onPress={() => setActiveTab('providers')}>
          <View>
            <MaterialCommunityIcons
              name="ev-station"
              size={23}
              color={activeTab === 'providers' ? '#10B981' : '#64748B'}
            />
            {pendingCount > 0 ? (
              <View style={styles.tabBadgeDot}>
                <Text style={styles.tabBadgeDotText}>{pendingCount}</Text>
              </View>
            ) : null}
          </View>
          <Text style={[styles.tabButtonLabel, activeTab === 'providers' && styles.tabButtonLabelActive]}>
            Providers
          </Text>
        </Pressable>

        <Pressable style={styles.tabButton} onPress={() => setActiveTab('users')}>
          <MaterialCommunityIcons
            name={activeTab === 'users' ? 'account-group' : 'account-group-outline'}
            size={23}
            color={activeTab === 'users' ? '#10B981' : '#64748B'}
          />
          <Text style={[styles.tabButtonLabel, activeTab === 'users' && styles.tabButtonLabelActive]}>
            Users
          </Text>
        </Pressable>

        <Pressable style={styles.tabButton} onPress={() => setActiveTab('plans')}>
          <MaterialCommunityIcons
            name={activeTab === 'plans' ? 'tag-multiple' : 'tag-multiple-outline'}
            size={23}
            color={activeTab === 'plans' ? '#10B981' : '#64748B'}
          />
          <Text style={[styles.tabButtonLabel, activeTab === 'plans' && styles.tabButtonLabelActive]}>
            Plans
          </Text>
        </Pressable>

        <Pressable style={styles.tabButton} onPress={() => setActiveTab('support')}>
          <View>
            <MaterialCommunityIcons
              name={activeTab === 'support' ? 'headset' : 'headset'}
              size={23}
              color={activeTab === 'support' ? '#10B981' : '#64748B'}
            />
            {openTicketsCount > 0 ? (
              <View style={[styles.tabBadgeDot, { backgroundColor: '#2563EB' }]}>
                <Text style={styles.tabBadgeDotText}>{openTicketsCount}</Text>
              </View>
            ) : null}
          </View>
          <Text style={[styles.tabButtonLabel, activeTab === 'support' && styles.tabButtonLabelActive]}>
            Support
          </Text>
        </Pressable>
      </View>

      {/* ============================================================= */}
      {/* 5. MODAL: EDIT PLAN (KEYBOARD-SAFE & RESPONSIVE)              */}
      {/* ============================================================= */}
      <Modal
        visible={Boolean(editingPlan)}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingPlan(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}
        >
          <View style={styles.modalContainer}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={styles.modalTitle} numberOfLines={1}>Edit Plan Details</Text>
                <Text style={styles.modalSubTitle} numberOfLines={1}>{editingPlan?.name}</Text>
              </View>
              <Pressable
                onPress={() => setEditingPlan(null)}
                style={styles.modalCloseButton}
                hitSlop={10}
              >
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </Pressable>
            </View>

            {/* Modal Body Form */}
            <ScrollView
              style={styles.modalScrollBody}
              contentContainerStyle={{ paddingBottom: 16 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.inputSectionLabel}>PLAN NAME</Text>
              <TextInput
                value={editPlanName}
                onChangeText={setEditPlanName}
                mode="outlined"
                textColor="#0F172A"
                style={styles.formInput}
                outlineColor="#CBD5E1"
                activeOutlineColor="#10B981"
              />

              <Text style={styles.inputSectionLabel}>PRICE (₹)</Text>
              <TextInput
                value={editPlanPrice}
                onChangeText={setEditPlanPrice}
                keyboardType="numeric"
                mode="outlined"
                textColor="#0F172A"
                style={styles.formInput}
                outlineColor="#CBD5E1"
                activeOutlineColor="#10B981"
              />

              <Text style={styles.inputSectionLabel}>DURATION / VALIDITY LABEL</Text>
              <TextInput
                value={editPlanDuration}
                onChangeText={setEditPlanDuration}
                mode="outlined"
                textColor="#0F172A"
                style={styles.formInput}
                outlineColor="#CBD5E1"
                activeOutlineColor="#10B981"
              />

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputSectionLabel}>MIN RADIUS (M)</Text>
                  <TextInput
                    value={editPlanMinRadius}
                    onChangeText={setEditPlanMinRadius}
                    keyboardType="numeric"
                    mode="outlined"
                    textColor="#0F172A"
                    style={styles.formInput}
                    outlineColor="#CBD5E1"
                    activeOutlineColor="#10B981"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputSectionLabel}>MAX RADIUS (M)</Text>
                  <TextInput
                    value={editPlanMaxRadius}
                    onChangeText={setEditPlanMaxRadius}
                    keyboardType="numeric"
                    mode="outlined"
                    textColor="#0F172A"
                    style={styles.formInput}
                    outlineColor="#CBD5E1"
                    activeOutlineColor="#10B981"
                  />
                </View>
              </View>

              <Text style={styles.inputSectionLabel}>PRIORITY ALGORITHM LABEL</Text>
              <TextInput
                value={editPlanPriority}
                onChangeText={setEditPlanPriority}
                mode="outlined"
                textColor="#0F172A"
                style={styles.formInput}
                outlineColor="#CBD5E1"
                activeOutlineColor="#10B981"
              />
            </ScrollView>

            {/* Modal Actions */}
            <View style={styles.modalActionRow}>
              <Button
                mode="outlined"
                textColor="#475569"
                onPress={() => setEditingPlan(null)}
                style={{ flex: 1, borderColor: '#CBD5E1' }}
              >
                Cancel
              </Button>
              <Button
                mode="contained"
                buttonColor="#059669"
                onPress={() => void handleSavePlan()}
                loading={savingPlan}
                disabled={savingPlan}
                style={{ flex: 1.4 }}
              >
                Save Changes
              </Button>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ============================================================= */}
      {/* 6. MODAL: ADD NEW SUBSCRIPTION PLAN                           */}
      {/* ============================================================= */}
      <Modal
        visible={showAddPlanModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAddPlanModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}
        >
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={styles.modalTitle}>+ Add New Listing Plan</Text>
                <Text style={styles.modalSubTitle}>Create custom pricing & radar tier</Text>
              </View>
              <Pressable
                onPress={() => setShowAddPlanModal(false)}
                style={styles.modalCloseButton}
                hitSlop={10}
              >
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </Pressable>
            </View>

            <ScrollView
              style={styles.modalScrollBody}
              contentContainerStyle={{ paddingBottom: 16 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.inputSectionLabel}>PLAN NAME *</Text>
              <TextInput
                value={newPlanName}
                onChangeText={setNewPlanName}
                placeholder="e.g. 3 Months Super Host"
                mode="outlined"
                textColor="#0F172A"
                style={styles.formInput}
                outlineColor="#CBD5E1"
                activeOutlineColor="#10B981"
              />

              <Text style={styles.inputSectionLabel}>VALIDITY DURATION *</Text>
              <TextInput
                value={newPlanDuration}
                onChangeText={setNewPlanDuration}
                placeholder="e.g. 90 Days Validity"
                mode="outlined"
                textColor="#0F172A"
                style={styles.formInput}
                outlineColor="#CBD5E1"
                activeOutlineColor="#10B981"
              />

              <Text style={styles.inputSectionLabel}>PRICE (₹) *</Text>
              <TextInput
                value={newPlanPrice}
                onChangeText={setNewPlanPrice}
                placeholder="e.g. 500"
                keyboardType="numeric"
                mode="outlined"
                textColor="#0F172A"
                style={styles.formInput}
                outlineColor="#CBD5E1"
                activeOutlineColor="#10B981"
              />

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputSectionLabel}>MIN RADIUS (M)</Text>
                  <TextInput
                    value={newPlanMinRadius}
                    onChangeText={setNewPlanMinRadius}
                    placeholder="100"
                    keyboardType="numeric"
                    mode="outlined"
                    textColor="#0F172A"
                    style={styles.formInput}
                    outlineColor="#CBD5E1"
                    activeOutlineColor="#10B981"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputSectionLabel}>MAX RADIUS (M)</Text>
                  <TextInput
                    value={newPlanMaxRadius}
                    onChangeText={setNewPlanMaxRadius}
                    placeholder="5000"
                    keyboardType="numeric"
                    mode="outlined"
                    textColor="#0F172A"
                    style={styles.formInput}
                    outlineColor="#CBD5E1"
                    activeOutlineColor="#10B981"
                  />
                </View>
              </View>

              <Text style={styles.inputSectionLabel}>PRIORITY BADGE</Text>
              <TextInput
                value={newPlanPriority}
                onChangeText={setNewPlanPriority}
                placeholder="e.g. High Priority"
                mode="outlined"
                textColor="#0F172A"
                style={styles.formInput}
                outlineColor="#CBD5E1"
                activeOutlineColor="#10B981"
              />
            </ScrollView>

            <View style={styles.modalActionRow}>
              <Button
                mode="outlined"
                textColor="#475569"
                onPress={() => setShowAddPlanModal(false)}
                style={{ flex: 1, borderColor: '#CBD5E1' }}
              >
                Cancel
              </Button>
              <Button
                mode="contained"
                buttonColor="#059669"
                onPress={() => void handleCreateNewPlan()}
                loading={creatingPlan}
                disabled={creatingPlan}
                style={{ flex: 1.4 }}
              >
                Create Plan
              </Button>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ============================================================= */}
      {/* 7. MODAL: REJECT PROVIDER APPLICATION                         */}
      {/* ============================================================= */}
      <Modal
        visible={Boolean(rejectTarget)}
        transparent
        animationType="fade"
        onRequestClose={() => setRejectTarget(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}
        >
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Reject Application</Text>
                <Text style={styles.modalSubTitle}>{rejectTarget?.businessName}</Text>
              </View>
              <Pressable
                onPress={() => setRejectTarget(null)}
                style={styles.modalCloseButton}
                hitSlop={10}
              >
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </Pressable>
            </View>

            <View style={{ paddingVertical: 12 }}>
              <Text style={styles.inputSectionLabel}>SPECIFY REJECTION REASON:</Text>
              <TextInput
                value={rejectionNote}
                onChangeText={setRejectionNote}
                placeholder="Explain why this station application is rejected..."
                multiline
                numberOfLines={3}
                mode="outlined"
                textColor="#0F172A"
                style={[styles.formInput, { height: 90 }]}
                outlineColor="#CBD5E1"
                activeOutlineColor="#DC2626"
              />
            </View>

            <View style={styles.modalActionRow}>
              <Button
                mode="outlined"
                textColor="#475569"
                onPress={() => setRejectTarget(null)}
                style={{ flex: 1, borderColor: '#CBD5E1' }}
              >
                Cancel
              </Button>
              <Button
                mode="contained"
                buttonColor="#DC2626"
                onPress={() => void submitReject()}
                loading={reviewingId === rejectTarget?.id}
                style={{ flex: 1.5 }}
              >
                Confirm Rejection
              </Button>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <SignOutModal
        visible={signOutOpen}
        onDismiss={() => setSignOutOpen(false)}
        onConfirm={async () => {
          try {
            await authApi.logout(refreshToken ?? undefined);
          } catch {}
          queryClient.clear();
          await signOut();
        }}
        role="ADMIN"
        userName={user?.fullName || 'Administrator'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: '#021B14',
  },
  centerAll: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  contentBody: {
    flex: 1,
  },

  // 1. Top Header
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#021B14',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  topHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    paddingRight: 6,
  },
  backButton: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  shieldIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  appTitle: {
    fontSize: 19,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  appSubtitle: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '600',
  },
  liveSystemPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 0.8,
    borderColor: '#10B981',
  },
  pulseGreenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  liveSystemText: {
    fontSize: 9,
    color: '#34D399',
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  topHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerIconButton: {
    padding: 7,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },

  // 2. Greeting Card
  greetingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(6, 78, 59, 0.5)',
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 6,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.25)',
  },
  greetingTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  greetingSub: {
    fontSize: 11,
    color: '#A7F3D0',
    marginTop: 2,
    lineHeight: 15,
  },
  adminAvatarBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  adminAvatarText: {
    color: '#021B14',
    fontWeight: '900',
    fontSize: 12.5,
  },

  // Scroll Content
  scrollContent: {
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 24, // Clean natural padding; no absolute bar overlapping
  },

  // Revenue Hero
  revenueCard: {
    backgroundColor: '#0F291E',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    marginBottom: 10,
  },
  revenueTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  revenueLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#34D399',
    letterSpacing: 0.8,
  },
  revenueAmount: {
    fontSize: 26,
    fontWeight: '900',
    color: '#FFFFFF',
    marginTop: 2,
  },
  revenueIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#10B981',
  },
  revenueDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginVertical: 12,
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  metricItem: {
    alignItems: 'center',
    flex: 1,
  },
  metricVal: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  metricLbl: {
    fontSize: 9.5,
    color: '#94A3B8',
    marginTop: 2,
    fontWeight: '600',
  },
  metricDivider: {
    width: 1,
    height: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },

  // Quick Action Tiles
  quickGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  quickTile: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 10,
    borderRadius: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  quickTileIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickTileTitle: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  quickTileSub: {
    fontSize: 9.5,
    color: '#64748B',
    marginTop: 1,
  },

  // Section Headers
  sectionHeaderWrap: {
    marginBottom: 8,
    marginTop: 4,
  },
  sectionHeaderTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  sectionHeaderSub: {
    fontSize: 10.5,
    color: '#94A3B8',
    marginTop: 1,
  },

  // Booking Cards
  bookingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  bookingCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  bookingDriverName: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  bookingStationName: {
    fontSize: 11,
    color: '#475569',
    marginTop: 1,
  },
  bookingDetailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 6,
    marginTop: 4,
    gap: 6,
  },
  bookingMetaText: {
    fontSize: 10.5,
    color: '#64748B',
    fontWeight: '500',
  },
  bookingAmountText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#059669',
  },
  emptyCard: {
    backgroundColor: '#0F291E',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  emptyCardText: {
    color: '#94A3B8',
    fontSize: 11.5,
    marginTop: 6,
  },

  // Search & Chips
  searchBar: {
    backgroundColor: '#FFFFFF',
    marginBottom: 8,
    fontSize: 12.5,
    height: 44,
  },
  chipsScroll: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  filterChip: {
    marginRight: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  filterChipActive: {
    backgroundColor: '#10B981',
  },
  filterChipText: {
    color: '#94A3B8',
    fontSize: 10.5,
    fontWeight: '700',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },

  // Provider Card
  providerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  providerHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  providerBusinessName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    flexShrink: 1,
  },
  providerHostName: {
    fontSize: 11,
    color: '#475569',
    marginTop: 2,
  },
  providerCityText: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 1,
  },
  providerStatsBar: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  providerStatCol: {
    flex: 1,
    alignItems: 'center',
  },
  providerStatVal: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#059669',
  },
  providerStatLbl: {
    fontSize: 9,
    color: '#64748B',
    marginTop: 1,
    fontWeight: '600',
  },
  providerStatDivider: {
    width: 1,
    height: 18,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
  },
  expandUsersToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    marginTop: 8,
    borderWidth: 0.8,
    borderColor: '#A7F3D0',
  },
  expandUsersText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
    flexShrink: 1,
  },
  expandedUsersContainer: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 8,
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  expandedUsersTitle: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  noUsersText: {
    fontSize: 10.5,
    color: '#94A3B8',
    fontStyle: 'italic',
  },
  userBookingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 0.8,
    borderBottomColor: '#E2E8F0',
  },
  userBookingDriver: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0F172A',
  },
  userBookingVehicle: {
    fontSize: 10,
    color: '#475569',
    marginTop: 1,
  },
  userBookingTime: {
    fontSize: 9.5,
    color: '#64748B',
    marginTop: 1,
  },
  userBookingAmount: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#059669',
    marginTop: 2,
  },
  docsPreviewRow: {
    marginTop: 8,
  },
  docsLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 4,
  },
  docThumbWrap: {
    alignItems: 'center',
    marginRight: 8,
  },
  docThumb: {
    width: 54,
    height: 54,
    borderRadius: 6,
    backgroundColor: '#E2E8F0',
  },
  docTypeLabel: {
    fontSize: 8,
    color: '#64748B',
    marginTop: 2,
    maxWidth: 54,
    textAlign: 'center',
  },
  providerActionsRow: {
    flexDirection: 'row',
    marginTop: 10,
    gap: 6,
  },

  // User Card
  userCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  userCardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  userAvatarWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userAvatarText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
  userNameText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  userPhoneText: {
    fontSize: 10.5,
    color: '#475569',
    marginTop: 1,
  },
  userEmailText: {
    fontSize: 10,
    color: '#64748B',
  },
  roleBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  roleBadgeText: {
    fontSize: 8.5,
    fontWeight: '800',
  },
  userFinancialBar: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  userFinancialCol: {
    flex: 1,
    alignItems: 'center',
  },
  userFinancialVal: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0284C7',
  },
  userFinancialLbl: {
    fontSize: 9,
    color: '#64748B',
    marginTop: 1,
    fontWeight: '600',
  },
  userFinancialDivider: {
    width: 1,
    height: 18,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
  },

  // Plans Tab
  plansHeaderWrap: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  plansHeaderTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  plansHeaderDesc: {
    fontSize: 10.5,
    color: '#94A3B8',
    marginTop: 1,
    lineHeight: 14,
  },
  addPlanButton: {
    borderRadius: 8,
  },
  planCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  planCardHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  planNameText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  planDurationText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '600',
  },
  planPriceText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#059669',
  },
  planBadgeWrap: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  planBadgeText: {
    fontSize: 8.5,
    color: '#FFFFFF',
    fontWeight: '800',
  },
  planSpecsBox: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  planSpecCol: {
    flex: 1,
    alignItems: 'center',
  },
  planSpecVal: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  planSpecLbl: {
    fontSize: 9,
    color: '#64748B',
    marginTop: 1,
  },
  planSpecDivider: {
    width: 1,
    height: 18,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
  },
  planFeaturesWrap: {
    marginTop: 8,
    gap: 3,
  },
  featureItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  featureItemText: {
    fontSize: 10.5,
    color: '#475569',
    flexShrink: 1,
  },
  planActionsRow: {
    flexDirection: 'row',
    marginTop: 10,
    gap: 6,
  },

  // Support Tab
  supportSubTabsWrap: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 8,
    padding: 3,
    marginBottom: 10,
  },
  supportSubTab: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: 6,
  },
  supportSubTabActive: {
    backgroundColor: '#10B981',
  },
  supportSubTabText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
  },
  supportSubTabTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  ticketCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  ticketCardHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  ticketSubject: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  ticketSender: {
    fontSize: 10.5,
    color: '#475569',
    marginTop: 2,
  },
  ticketTime: {
    fontSize: 9.5,
    color: '#94A3B8',
    marginTop: 1,
  },
  ticketBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 4,
  },
  ticketBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
  },
  ticketMessageBox: {
    backgroundColor: '#F8FAFC',
    padding: 8,
    borderRadius: 6,
    marginTop: 6,
  },
  ticketMessageText: {
    fontSize: 11,
    color: '#334155',
    lineHeight: 15,
  },
  reviewCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  reviewCardHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  reviewDriverName: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  reviewStationName: {
    fontSize: 10.5,
    color: '#059669',
    marginTop: 1,
    fontWeight: '600',
  },
  reviewTime: {
    fontSize: 9.5,
    color: '#94A3B8',
    marginTop: 1,
  },
  starBadgeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  starBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#92400E',
  },
  reviewComment: {
    fontSize: 11.5,
    color: '#334155',
    fontStyle: 'italic',
    marginTop: 6,
  },
  auditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 10,
    borderRadius: 8,
    marginBottom: 6,
    gap: 6,
  },
  auditIconBox: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  auditActionText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  auditActorText: {
    fontSize: 9.5,
    color: '#64748B',
    marginTop: 1,
  },
  auditTimeText: {
    fontSize: 9.5,
    color: '#94A3B8',
  },

  // 4. Executive Bottom Tab Bar (Standard flex child; never covers scroll content)
  bottomTabBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingTop: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 8,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabButtonLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    marginTop: 2,
  },
  tabButtonLabelActive: {
    color: '#10B981',
    fontWeight: '800',
  },
  tabBadgeDot: {
    position: 'absolute',
    top: -2,
    right: -7,
    minWidth: 15,
    height: 15,
    borderRadius: 7.5,
    backgroundColor: '#D97706',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2.5,
  },
  tabBadgeDotText: {
    fontSize: 8.5,
    color: '#FFFFFF',
    fontWeight: '800',
  },

  // Responsive Keyboard-Safe Modals
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  modalContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    width: '100%',
    maxWidth: 420,
    maxHeight: '85%',
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 10,
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalSubTitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  modalCloseButton: {
    padding: 4,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
  },
  modalScrollBody: {
    flexShrink: 1,
  },
  inputSectionLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 0.5,
    marginTop: 8,
    marginBottom: 3,
  },
  formInput: {
    backgroundColor: '#FFFFFF',
    fontSize: 12.5,
    height: 42,
  },
  modalActionRow: {
    flexDirection: 'row',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 12,
    marginTop: 6,
  },
});
