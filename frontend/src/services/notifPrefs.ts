import AsyncStorage from '@react-native-async-storage/async-storage';

export const NOTIF_PREF_IDS = [
  'league_start','submit_open','vote_open','submit_30','vote_30','results',
  'follow_req','new_follower','reactions',
  'dm','group',
] as const;
export type NotifPrefId = typeof NOTIF_PREF_IDS[number];
export type NotifPrefs = Record<NotifPrefId, boolean>;

const STORAGE_KEY = 'notif_prefs';

export const defaultNotifPrefs = (): NotifPrefs =>
  NOTIF_PREF_IDS.reduce((acc, id) => { acc[id] = true; return acc; }, {} as NotifPrefs);

export async function loadNotifPrefs(): Promise<NotifPrefs> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultNotifPrefs();
    const parsed = JSON.parse(raw);
    // Merge with defaults so newly-added ids are present
    return { ...defaultNotifPrefs(), ...parsed };
  } catch {
    return defaultNotifPrefs();
  }
}

export async function saveNotifPrefs(prefs: NotifPrefs): Promise<void> {
  try { await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch {}
}
