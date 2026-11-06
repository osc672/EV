import { Platform, Vibration } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Speech from 'expo-speech';

export const ALERT_CHANNEL_ID = 'rapido_alerts_v2';

let channelInitialized = false;

// Configure foreground notification behavior
try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
} catch {
  // Ignore if handler setup fails
}

/**
 * Initialize Android notification channel with maximum priority & alert sound,
 * and request permissions if needed.
 */
export async function initNotificationChannel(): Promise<void> {
  if (channelInitialized) return;

  try {
    if (Platform.OS === 'android') {
      try {
        await Notifications.setNotificationChannelAsync(ALERT_CHANNEL_ID, {
          name: 'EV Rescue Dispatch Alerts',
          importance: ((Notifications as any).AndroidImportance?.MAX ?? 5) as Notifications.AndroidImportance,
          vibrationPattern: [0, 250, 150, 250],
          enableVibrate: true,
          showBadge: true,
        });
      } catch (channelErr) {
        // In Expo Go on Android SDK 53, notification channels may throw NullPointerException
        console.log('[NotificationChannel] Safe fallback for Expo Go channel:', channelErr);
      }
    }

    if (Platform.OS !== 'web') {
      try {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        if (existingStatus !== 'granted') {
          await Notifications.requestPermissionsAsync();
        }
      } catch {
        // Ignore permission inquiry errors
      }
    }

    channelInitialized = true;
  } catch (err) {
    console.log('[NotificationChannel] Channel setup error:', err);
    channelInitialized = true;
  }
}

/**
 * Play signature alert chime and haptic vibration via Android notification channel
 */
export async function playNotificationChime(
  title = '⚡ EV Rescue Alert',
  body = 'New notification received',
): Promise<void> {
  try {
    // 1. Haptic dual-pulse vibration
    try {
      Vibration.vibrate([0, 250, 150, 250]);
    } catch {
      // ignore
    }

    if (Platform.OS !== 'web') {
      try {
        await initNotificationChannel();
      } catch {
        // ignore
      }

      // Schedule instant alert notification with loud system chime on Android & iOS
      try {
        await Notifications.scheduleNotificationAsync({
          content: {
            title,
            body,
            priority: Notifications.AndroidNotificationPriority.MAX,
          },
          trigger: null,
        });
      } catch (schedErr) {
        console.log('[NotificationSchedule] Immediate notification fallback error:', schedErr);
      }
    }
  } catch (err) {
    console.log('[AudioNotification] Chime notification error:', err);
  }
}

/**
 * Stop any ongoing speech
 */
export async function stopNotificationAudio(): Promise<void> {
  try {
    await Speech.stop();
  } catch {
    // ignore
  }
}

let lastSpokenText = '';
let lastSpokenTimestamp = 0;

/**
 * Speak text announcement reliably on all devices
 */
export async function speakNotification(text: string): Promise<void> {
  if (!text || !text.trim()) return;

  const now = Date.now();
  // Prevent duplicate concurrent speech for identical text within 2 seconds
  if (text === lastSpokenText && now - lastSpokenTimestamp < 2000) {
    return;
  }
  lastSpokenText = text;
  lastSpokenTimestamp = now;

  try {
    await Speech.stop();
  } catch {
    // ignore
  }

  try {
    Speech.speak(text, {
      language: 'en',
      pitch: 1.0,
      rate: 0.95,
      onError: (err) => {
        console.log('[AudioNotification] Speech fallback:', err);
        Speech.speak(text, { pitch: 1.0, rate: 0.95 });
      },
    });
  } catch (err) {
    console.log('[AudioNotification] Speech error, falling back:', err);
    try {
      Speech.speak(text, { pitch: 1.0, rate: 0.95 });
    } catch {
      // ignore
    }
  }
}

/**
 * Format slot time for natural speech (e.g. "Today at 4:30 PM")
 */
export function formatSlotSpeech(dateInput?: string | Date | null): string {
  if (!dateInput) return 'the scheduled time';
  try {
    const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    if (isNaN(date.getTime())) return 'the scheduled time';

    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const isTomorrow = date.toDateString() === tomorrow.toDateString();

    const timeStr = date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });

    if (isToday) return `Today at ${timeStr}`;
    if (isTomorrow) return `Tomorrow at ${timeStr}`;
    return `${date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} at ${timeStr}`;
  } catch {
    return 'the scheduled time';
  }
}

/**
 * Provider alert: rings notification chime and announces driver name and slot time
 */
export async function playProviderBookingAlert(driverName: string, scheduledAt?: string | Date | null): Promise<void> {
  const slotText = formatSlotSpeech(scheduledAt);
  const speech = `New charging request! Driver ${driverName || 'A driver'}, for slot ${slotText}. Please accept or decline.`;
  void playNotificationChime('⚡ New Charging Request!', `Driver ${driverName || 'A driver'} · Slot: ${slotText}`);
  void speakNotification(speech);
}

/**
 * Driver alert: rings notification chime and announces that charging slot is confirmed
 */
export async function playDriverSlotConfirmedAlert(stationName?: string, scheduledAt?: string | Date | null): Promise<void> {
  const slotText = formatSlotSpeech(scheduledAt);
  const station = stationName || 'your charging station';
  const speech = `Slot confirmed! Your charging slot at ${station} is confirmed for ${slotText}. Your charger is ready.`;
  void playNotificationChime('✅ Charging Slot Confirmed!', `Station: ${station} · Slot: ${slotText}`);
  void speakNotification(speech);
}

/**
 * General in-app notification alert: rings notification chime and speaks title & body
 */
export async function playGeneralNotificationAlert(title: string, body?: string): Promise<void> {
  void playNotificationChime(title, body ?? '');
  const text = body ? `${title}. ${body}` : title;
  void speakNotification(text);
}
