import { useEffect, useState } from 'react';
import {
  Alert,
  BackHandler,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Button, Chip, Dialog, Portal, Switch } from 'react-native-paper';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { EmptyState } from '@/components/EmptyState';
import { FormField } from '@/components/FormField';
import { Loading } from '@/components/Loading';
import {
  useCreateVehicle,
  useDeleteVehicle,
  useUpdateVehicle,
  useVehicles,
} from '@/hooks/useAccount';
import { getErrorMessage } from '@/lib/api';
import { CONNECTOR_LABELS } from '@/lib/config';
import { toNumber } from '@/lib/format';
import { palette, radius, spacing } from '@/theme';
import type { ConnectorType, Vehicle } from '@/types/api';

const vehicleSchema = z.object({
  make: z.string().trim().min(1, 'Enter the make').max(80),
  model: z.string().trim().min(1, 'Enter the model').max(80),
  connectorType: z.enum(['TYPE_2', 'CCS2', 'CHADEMO', 'TYPE_1', 'GB_T', 'AC_3_PIN', 'OTHER']),
  batteryCapacityKwh: z
    .string()
    .trim()
    .optional()
    .refine((value) => !value || (Number(value) > 0 && Number(value) <= 1000), {
      message: 'Enter a battery size between 1 and 1000 kWh',
    }),
  registrationNumber: z.string().trim().max(30).optional(),
  isPrimary: z.boolean(),
});

type VehicleValues = z.infer<typeof vehicleSchema>;

const CONNECTORS: ConnectorType[] = ['TYPE_2', 'CCS2', 'CHADEMO', 'TYPE_1', 'GB_T', 'AC_3_PIN'];

const DEFAULT_VALUES: VehicleValues = {
  make: '',
  model: '',
  connectorType: 'TYPE_2',
  batteryCapacityKwh: '',
  registrationNumber: '',
  isPrimary: false,
};

export default function VehiclesScreen() {
  const { from } = useLocalSearchParams<{ from?: string }>();
  const { data: vehicles, isLoading, isError, refetch, isRefetching } = useVehicles();
  const createVehicle = useCreateVehicle();
  const updateVehicle = useUpdateVehicle();
  const deleteVehicle = useDeleteVehicle();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [busy, setBusy] = useState(false);

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

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<VehicleValues>({
    resolver: zodResolver(vehicleSchema),
    defaultValues: DEFAULT_VALUES,
  });

  const openCreate = () => {
    setEditing(null);
    reset({ ...DEFAULT_VALUES, isPrimary: !vehicles || vehicles.length === 0 });
    setOpen(true);
  };

  const openEdit = (vehicle: Vehicle) => {
    setEditing(vehicle);
    reset({
      make: vehicle.make,
      model: vehicle.model,
      connectorType: vehicle.connectorType,
      batteryCapacityKwh: vehicle.batteryCapacityKwh ? String(toNumber(vehicle.batteryCapacityKwh)) : '',
      registrationNumber: vehicle.registrationNumber ?? '',
      isPrimary: vehicle.isPrimary,
    });
    setOpen(true);
  };

  const submit = async (values: VehicleValues) => {
    setBusy(true);
    const body = {
      make: values.make.trim(),
      model: values.model.trim(),
      connectorType: values.connectorType,
      batteryCapacityKwh: values.batteryCapacityKwh ? Number(values.batteryCapacityKwh) : undefined,
      registrationNumber: values.registrationNumber?.trim() || undefined,
      isPrimary: values.isPrimary,
    };
    try {
      if (editing) {
        await updateVehicle.mutateAsync({ id: editing.id, body });
      } else {
        await createVehicle.mutateAsync(body);
      }
      setOpen(false);
    } catch (error) {
      Alert.alert('Could not save vehicle', getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const setPrimary = async (vehicle: Vehicle) => {
    if (vehicle.isPrimary) return;
    try {
      await updateVehicle.mutateAsync({ id: vehicle.id, body: { isPrimary: true } });
    } catch (error) {
      Alert.alert('Could not update', getErrorMessage(error));
    }
  };

  const confirmDelete = (vehicle: Vehicle) => {
    Alert.alert(
      'Remove vehicle',
      `Remove ${vehicle.make} ${vehicle.model}? Existing bookings keep their history.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteVehicle.mutateAsync(vehicle.id);
            } catch (error) {
              Alert.alert('Could not remove', getErrorMessage(error));
            }
          },
        },
      ],
    );
  };

  if (isLoading) return <Loading label="Loading your vehicles…" />;

  return (
    <View style={styles.flex}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'My vehicles',
          headerLeft: () => (
            <Pressable onPress={handleBack} hitSlop={10} style={{ paddingRight: 12 }}>
              <MaterialCommunityIcons name="arrow-left" size={24} color={palette.ink} />
            </Pressable>
          ),
        }}
      />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={palette.primary} />
        }
      >
        <View style={styles.intro}>
          <Text style={styles.introTitle}>Your garage</Text>
          <Text style={styles.introText}>
            Add each EV with its connector so booking a charger only takes one tap.
          </Text>
        </View>

        {isError ? (
          <EmptyState
            icon="wifi-off"
            title="Could not load vehicles"
            message="Check your connection and try again."
            actionLabel="Retry"
            onAction={() => void refetch()}
          />
        ) : !vehicles || vehicles.length === 0 ? (
          <EmptyState
            icon="car-electric"
            title="No vehicles yet"
            message="Add your EV to speed up bookings and match the right connector."
            actionLabel="Add a vehicle"
            onAction={openCreate}
          />
        ) : (
          vehicles.map((vehicle) => (
            <Pressable
              key={vehicle.id}
              onPress={() => openEdit(vehicle)}
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
            >
              <View style={styles.cardTop}>
                <View style={styles.iconWrap}>
                  <MaterialCommunityIcons name="car-electric" size={22} color={palette.primary} />
                </View>
                <View style={styles.cardTitleWrap}>
                  <Text style={styles.cardTitle}>
                    {vehicle.make} {vehicle.model}
                  </Text>
                  <Text style={styles.cardMeta}>
                    {CONNECTOR_LABELS[vehicle.connectorType] ?? vehicle.connectorType}
                    {vehicle.batteryCapacityKwh
                      ? ` · ${toNumber(vehicle.batteryCapacityKwh)} kWh battery`
                      : ''}
                  </Text>
                </View>
                {vehicle.isPrimary ? (
                  <View style={styles.primaryPill}>
                    <MaterialCommunityIcons name="star" size={12} color="#8A6100" />
                    <Text style={styles.primaryText}>Primary</Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.cardBottom}>
                <Text style={styles.registration}>
                  {vehicle.registrationNumber ?? 'No registration added'}
                </Text>
                <View style={styles.cardActions}>
                  {!vehicle.isPrimary ? (
                    <Pressable onPress={() => void setPrimary(vehicle)} hitSlop={6} style={styles.actionLink}>
                      <Text style={styles.actionText}>Set primary</Text>
                    </Pressable>
                  ) : null}
                  <Pressable onPress={() => confirmDelete(vehicle)} hitSlop={6} style={styles.actionLink}>
                    <Text style={[styles.actionText, styles.deleteText]}>Remove</Text>
                  </Pressable>
                </View>
              </View>
            </Pressable>
          ))
        )}

        {vehicles && vehicles.length > 0 ? (
          <Button
            mode="outlined"
            icon="plus"
            onPress={openCreate}
            style={styles.addButton}
            contentStyle={styles.addButtonContent}
          >
            Add another vehicle
          </Button>
        ) : null}

        <Pressable style={styles.tip} onPress={() => router.push('/(app)')}>
          <MaterialCommunityIcons name="lightbulb-on-outline" size={18} color={palette.primary} />
          <Text style={styles.tipText}>
            Find a charger near you and request an emergency top-up.
          </Text>
          <MaterialCommunityIcons name="chevron-right" size={18} color={palette.primary} />
        </Pressable>
      </ScrollView>

      <Portal>
        <Dialog visible={open} onDismiss={() => setOpen(false)} style={styles.dialog}>
          <Dialog.Title>{editing ? 'Edit vehicle' : 'Add vehicle'}</Dialog.Title>
          <Dialog.ScrollArea style={styles.dialogScroll}>
            <ScrollView contentContainerStyle={styles.dialogContent} keyboardShouldPersistTaps="handled">
              <Controller
                control={control}
                name="make"
                render={({ field: { onChange, onBlur, value } }) => (
                  <FormField
                    label="Make"
                    placeholder="Tata"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    error={errors.make?.message}
                  />
                )}
              />
              <Controller
                control={control}
                name="model"
                render={({ field: { onChange, onBlur, value } }) => (
                  <FormField
                    label="Model"
                    placeholder="Nexon EV"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    error={errors.model?.message}
                  />
                )}
              />

              <Text style={styles.dialogLabel}>Connector</Text>
              <Controller
                control={control}
                name="connectorType"
                render={({ field: { onChange, value } }) => (
                  <View style={styles.chipRow}>
                    {CONNECTORS.map((connector) => (
                      <Chip
                        key={connector}
                        selected={value === connector}
                        onPress={() => onChange(connector)}
                        style={[styles.chip, value === connector && styles.chipActive]}
                        textStyle={[styles.chipText, value === connector && styles.chipTextActive]}
                        showSelectedOverlay={false}
                      >
                        {CONNECTOR_LABELS[connector]}
                      </Chip>
                    ))}
                  </View>
                )}
              />

              <Controller
                control={control}
                name="batteryCapacityKwh"
                render={({ field: { onChange, onBlur, value } }) => (
                  <FormField
                    label="Battery capacity (kWh, optional)"
                    placeholder="40"
                    keyboardType="decimal-pad"
                    value={value ?? ''}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    error={errors.batteryCapacityKwh?.message}
                  />
                )}
              />
              <Controller
                control={control}
                name="registrationNumber"
                render={({ field: { onChange, onBlur, value } }) => (
                  <FormField
                    label="Registration number (optional)"
                    placeholder="MH 12 AB 1234"
                    autoCapitalize="characters"
                    value={value ?? ''}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    error={errors.registrationNumber?.message}
                  />
                )}
              />

              <Controller
                control={control}
                name="isPrimary"
                render={({ field: { onChange, value } }) => (
                  <Pressable style={styles.switchRow} onPress={() => onChange(!value)}>
                    <View style={styles.switchText}>
                      <Text style={styles.switchLabel}>Use as primary vehicle</Text>
                      <Text style={styles.switchHint}>Selected first when you book a charge.</Text>
                    </View>
                    <Switch value={value} onValueChange={onChange} color={palette.primary} />
                  </Pressable>
                )}
              />
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setOpen(false)}>Cancel</Button>
            <Button
              loading={busy}
              disabled={busy}
              onPress={() => {
                void handleSubmit(submit)();
              }}
            >
              {editing ? 'Save changes' : 'Add vehicle'}
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: palette.background },
  content: { padding: spacing.lg, paddingBottom: 100 },
  intro: { marginBottom: spacing.lg },
  introTitle: { fontSize: 22, fontWeight: '800', color: palette.ink },
  introText: { fontSize: 13.5, color: palette.muted, marginTop: 4, lineHeight: 20 },
  card: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardPressed: { opacity: 0.92 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: palette.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitleWrap: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: palette.ink },
  cardMeta: { fontSize: 12.5, color: palette.muted, marginTop: 3 },
  primaryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FFF4D6',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  primaryText: { fontSize: 10.5, fontWeight: '800', color: '#8A6100' },
  cardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: '#F0F4F2',
  },
  registration: { fontSize: 12, color: palette.muted, fontWeight: '600' },
  cardActions: { flexDirection: 'row', gap: spacing.md },
  actionLink: { paddingVertical: 2 },
  actionText: { fontSize: 12, fontWeight: '800', color: palette.primary },
  deleteText: { color: palette.danger },
  addButton: { borderRadius: radius.md, borderColor: palette.border, marginTop: spacing.sm },
  addButtonContent: { paddingVertical: 5 },
  tip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: palette.primaryLight,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.xl,
  },
  tipText: { flex: 1, fontSize: 12.5, color: palette.primaryDark, fontWeight: '600', lineHeight: 18 },
  dialog: { borderRadius: radius.lg, backgroundColor: palette.surface },
  dialogScroll: { maxHeight: 460, paddingHorizontal: 0 },
  dialogContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  dialogLabel: { fontSize: 13, fontWeight: '600', color: palette.ink, marginBottom: 6, marginLeft: 2 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: spacing.md },
  chip: { backgroundColor: '#F4F7F5', borderWidth: 1, borderColor: palette.border },
  chipActive: { backgroundColor: palette.primary, borderColor: palette.primary },
  chipText: { fontSize: 11.5, fontWeight: '700', color: palette.muted },
  chipTextActive: { color: '#FFFFFF' },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  switchText: { flex: 1 },
  switchLabel: { fontSize: 13.5, fontWeight: '700', color: palette.ink },
  switchHint: { fontSize: 11.5, color: palette.muted, marginTop: 2 },
});
