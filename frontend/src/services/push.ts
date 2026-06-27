import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { registerPushToken } from './api';

// How notifications display while the app is foregrounded
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    // shouldShowBanner / shouldShowList replace the deprecated shouldShowAlert
    // in this expo-notifications version (0.32.x) and are required by its types.
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

const PROJECT_ID = '1d5542b6-129f-44be-9a86-516abc2effb7';

// Requests permission, gets the Expo push token, and registers it with the backend.
// Returns { granted: boolean }. Safe to call repeatedly.
export async function registerForPushNotifications(): Promise<{ granted: boolean }> {
  try {
    if (!Device.isDevice) return { granted: false }; // push doesn't work on simulators
    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (existing !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== 'granted') return { granted: false };

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const tokenResp = await Notifications.getExpoPushTokenAsync({ projectId: PROJECT_ID });
    const token = tokenResp.data;
    if (token) {
      try { await registerPushToken(token); } catch {}
    }
    return { granted: true };
  } catch {
    return { granted: false };
  }
}

// Silently refresh the token for an already-permitted user (called on app load).
// Does NOT prompt — only registers if permission is already granted.
export async function refreshPushTokenIfGranted(): Promise<void> {
  try {
    if (!Device.isDevice) return;
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;
    const tokenResp = await Notifications.getExpoPushTokenAsync({ projectId: PROJECT_ID });
    if (tokenResp.data) { try { await registerPushToken(tokenResp.data); } catch {} }
  } catch {}
}
