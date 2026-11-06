import fs from 'fs';
import path from 'path';

export interface SubscriptionPlanOption {
  key: string;
  name: string;
  durationLabel: string;
  price: number;
  priceFormatted: string;
  minRadiusM: number;
  maxRadiusM: number;
  visibilityRange: string;
  priorityLabel: string;
  priorityTier: number;
  badge?: string;
  badgeColor?: string;
  features: string[];
}

const DEFAULT_PLANS: SubscriptionPlanOption[] = [
  {
    key: 'MONTH_1',
    name: '1 Month Plan',
    durationLabel: '30 Days Validity',
    price: 350,
    priceFormatted: '₹350',
    minRadiusM: 500,
    maxRadiusM: 2000,
    visibilityRange: '500m to 2 km radius',
    priorityLabel: 'Standard Visibility',
    priorityTier: 1,
    badge: 'Starter',
    badgeColor: '#0284C7',
    features: [
      'Visible from 500m to 2 km radius for users',
      'Ranked by driver reviews',
      'Instant booking push notifications',
    ],
  },
  {
    key: 'MONTH_5',
    name: '5 Months Plan',
    durationLabel: '150 Days Validity',
    price: 650,
    priceFormatted: '₹650',
    minRadiusM: 100,
    maxRadiusM: 5000,
    visibilityRange: '100m to 5 km radius',
    priorityLabel: 'High Preference',
    priorityTier: 2,
    badge: 'Popular Choice',
    badgeColor: '#059669',
    features: [
      'Visible from 100m to 5 km radius for users',
      'High priority over 1-month plans',
      'Driver review booster & priority ranking',
    ],
  },
  {
    key: 'YEAR_1',
    name: '1 Year Plan',
    durationLabel: '365 Days Validity',
    price: 1250,
    priceFormatted: '₹1,250',
    minRadiusM: 100,
    maxRadiusM: 10000,
    visibilityRange: '100m to 10 km radius',
    priorityLabel: '1st Preference',
    priorityTier: 3,
    badge: '1st Preference ⭐',
    badgeColor: '#D97706',
    features: [
      'Visible from 100m to 10 km radius for users',
      '1st Preference on map search & emergency alerts',
      'Top algorithm ranking for all nearby drivers',
      'Priority host badge & verified listing',
    ],
  },
];

const DATA_DIR = path.resolve(__dirname, '../../../data');
const PLANS_FILE = path.join(DATA_DIR, 'plans.json');

function ensureDataFile() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(PLANS_FILE)) {
      fs.writeFileSync(PLANS_FILE, JSON.stringify(DEFAULT_PLANS, null, 2), 'utf-8');
    }
  } catch (err) {
    console.error('Failed to init plans data directory', err);
  }
}

export function getAllPlans(): SubscriptionPlanOption[] {
  ensureDataFile();
  try {
    if (fs.existsSync(PLANS_FILE)) {
      const raw = fs.readFileSync(PLANS_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.error('Failed to read plans.json, using default', err);
  }
  return DEFAULT_PLANS;
}

export function createPlan(data: {
  key?: string;
  name: string;
  price: number;
  durationLabel: string;
  minRadiusM?: number;
  maxRadiusM?: number;
  visibilityRange?: string;
  priorityLabel?: string;
  priorityTier?: number;
  badge?: string;
  badgeColor?: string;
  features?: string[];
}): SubscriptionPlanOption {
  const plans = getAllPlans();
  const slug = (data.name || 'PLAN')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '_')
    .slice(0, 15);
  const key = data.key || `PLAN_${slug}_${Date.now().toString(36).toUpperCase()}`;

  const minR = data.minRadiusM !== undefined ? Number(data.minRadiusM) : 100;
  const maxR = data.maxRadiusM !== undefined ? Number(data.maxRadiusM) : 5000;
  const vis = data.visibilityRange || `${minR >= 1000 ? `${(minR / 1000).toFixed(1)} km` : `${minR}m`} to ${(maxR / 1000).toFixed(0)} km radius`;

  const newPlan: SubscriptionPlanOption = {
    key,
    name: data.name.trim(),
    durationLabel: data.durationLabel.trim() || 'Custom Validity',
    price: Number(data.price),
    priceFormatted: `₹${Number(data.price).toLocaleString('en-IN')}`,
    minRadiusM: minR,
    maxRadiusM: maxR,
    visibilityRange: vis,
    priorityLabel: data.priorityLabel?.trim() || 'Custom Priority',
    priorityTier: data.priorityTier !== undefined ? Number(data.priorityTier) : 2,
    badge: data.badge?.trim() || 'Special',
    badgeColor: data.badgeColor?.trim() || '#10B981',
    features: Array.isArray(data.features) && data.features.length > 0
      ? data.features
      : [
          `Visible up to ${(maxR / 1000).toFixed(0)} km radius`,
          'Verified charging host listing',
          'Instant driver booking requests',
        ],
  };

  plans.push(newPlan);

  try {
    ensureDataFile();
    fs.writeFileSync(PLANS_FILE, JSON.stringify(plans, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to write plans.json', err);
  }

  return newPlan;
}

export function updatePlanByKey(
  key: string,
  updates: Partial<Omit<SubscriptionPlanOption, 'key'>>,
): SubscriptionPlanOption {
  const plans = getAllPlans();
  const idx = plans.findIndex((p) => p.key === key);
  if (idx === -1) {
    throw new Error(`Plan with key ${key} not found`);
  }

  const existing = plans[idx];
  const updatedPrice = updates.price !== undefined ? Number(updates.price) : existing.price;
  const minR = updates.minRadiusM !== undefined ? Number(updates.minRadiusM) : existing.minRadiusM;
  const maxR = updates.maxRadiusM !== undefined ? Number(updates.maxRadiusM) : existing.maxRadiusM;

  const updated: SubscriptionPlanOption = {
    ...existing,
    ...updates,
    price: updatedPrice,
    priceFormatted: `₹${updatedPrice.toLocaleString('en-IN')}`,
    minRadiusM: minR,
    maxRadiusM: maxR,
    visibilityRange: updates.visibilityRange || `${minR >= 1000 ? `${(minR / 1000).toFixed(1)} km` : `${minR}m`} to ${(maxR / 1000).toFixed(0)} km radius`,
    priorityTier: updates.priorityTier !== undefined ? Number(updates.priorityTier) : existing.priorityTier,
  };

  plans[idx] = updated;

  try {
    ensureDataFile();
    fs.writeFileSync(PLANS_FILE, JSON.stringify(plans, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to write plans.json', err);
  }

  return updated;
}

export function deletePlanByKey(key: string): boolean {
  const plans = getAllPlans();
  const filtered = plans.filter((p) => p.key !== key);
  if (filtered.length === plans.length) {
    throw new Error(`Plan with key ${key} not found`);
  }

  try {
    ensureDataFile();
    fs.writeFileSync(PLANS_FILE, JSON.stringify(filtered, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to delete plan from plans.json', err);
  }

  return true;
}
