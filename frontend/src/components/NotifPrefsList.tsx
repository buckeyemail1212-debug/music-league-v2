import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import {
  NotifPrefId,
  NotifPrefs,
  NOTIF_PREF_IDS,
  defaultNotifPrefs,
  loadNotifPrefs,
  saveNotifPrefs,
} from '../services/notifPrefs';
import { saveNotifPrefsRemote } from '../services/api';

type Item = {
  id: NotifPrefId;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
};

type Group = { label: string; items: Item[] };

const GROUPS: Group[] = [
  {
    label: 'Leagues & rounds',
    items: [
      { id: 'league_start', title: 'A league starts', subtitle: 'When a league you joined kicks off', icon: 'trophy-outline' },
      { id: 'submit_open', title: 'Time to submit', subtitle: 'A new round is open for your track', icon: 'musical-notes-outline' },
      { id: 'vote_open', title: 'Time to vote', subtitle: 'Submissions are in — cast your votes', icon: 'checkbox-outline' },
      { id: 'submit_30', title: '30 min left to submit', subtitle: 'Last call before submissions close', icon: 'time-outline' },
      { id: 'vote_30', title: '30 min left to vote', subtitle: 'Last call before voting closes', icon: 'time-outline' },
      { id: 'results', title: 'Results are in', subtitle: 'See who won the round', icon: 'podium-outline' },
    ],
  },
  {
    label: 'Social',
    items: [
      { id: 'follow_req', title: 'Follow requests', subtitle: 'Someone wants to follow you', icon: 'person-add-outline' },
      { id: 'new_follower', title: 'New followers', subtitle: 'Someone started following you', icon: 'people-outline' },
      { id: 'reactions', title: 'Likes & mentions', subtitle: 'Reactions to your submissions', icon: 'heart-outline' },
    ],
  },
  {
    label: 'Inbox & chat',
    items: [
      { id: 'dm', title: 'Direct messages', subtitle: 'New messages in your inbox', icon: 'chatbubble-outline' },
      { id: 'group', title: 'League chat', subtitle: 'Activity in your league group chats', icon: 'chatbubbles-outline' },
    ],
  },
];

export default function NotifPrefsList() {
  const [prefs, setPrefs] = useState<NotifPrefs>(defaultNotifPrefs());

  useEffect(() => {
    loadNotifPrefs().then(setPrefs);
  }, []);

  const persist = (next: NotifPrefs) => {
    setPrefs(next);
    saveNotifPrefs(next);
    // Keep the backend (push-gating source) in sync with the local cache.
    saveNotifPrefsRemote(next).catch(() => {});
  };

  const allOn = NOTIF_PREF_IDS.every((id) => prefs[id]);
  const noneOn = NOTIF_PREF_IDS.every((id) => !prefs[id]);

  const masterSubtitle = allOn
    ? 'Everything is on'
    : noneOn
    ? 'Everything is off'
    : 'Some turned off below';

  const toggleMaster = (value: boolean) => {
    const next = NOTIF_PREF_IDS.reduce((acc, id) => {
      acc[id] = value;
      return acc;
    }, {} as NotifPrefs);
    persist(next);
  };

  const toggleOne = (id: NotifPrefId, value: boolean) => {
    persist({ ...prefs, [id]: value });
  };

  return (
    <View>
      {/* Master row */}
      <View style={styles.masterCard}>
        <View style={styles.masterTile}>
          <Ionicons name="notifications" size={20} color={colors.onAccent} />
        </View>
        <View style={styles.rowText}>
          <Text style={styles.masterTitle}>All notifications</Text>
          <Text style={styles.rowSubtitle}>{masterSubtitle}</Text>
        </View>
        <Switch
          value={allOn}
          onValueChange={toggleMaster}
          trackColor={{ true: colors.accent, false: colors.surface3 }}
          thumbColor={colors.onAccent}
        />
      </View>

      {/* Groups */}
      {GROUPS.map((group) => (
        <View key={group.label}>
          <Text style={styles.groupLabel}>{group.label.toUpperCase()}</Text>
          <View style={styles.card}>
            {group.items.map((item, i) => {
              const on = prefs[item.id];
              return (
                <View
                  key={item.id}
                  style={[styles.row, i > 0 && styles.rowDivider]}
                >
                  <View style={[styles.tile, on ? styles.tileOn : styles.tileOff]}>
                    <Ionicons
                      name={item.icon}
                      size={19}
                      color={on ? colors.accent : colors.textTertiary}
                    />
                  </View>
                  <View style={styles.rowText}>
                    <Text style={styles.rowTitle}>{item.title}</Text>
                    <Text style={styles.rowSubtitle}>{item.subtitle}</Text>
                  </View>
                  <Switch
                    value={on}
                    onValueChange={(v) => toggleOne(item.id, v)}
                    trackColor={{ true: colors.accent, false: colors.surface3 }}
                    thumbColor={colors.onAccent}
                  />
                </View>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  masterCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 18,
  },
  masterTile: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  masterTitle: {
    fontSize: 15.5,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  groupLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: colors.textTertiary,
    paddingHorizontal: 4,
    paddingBottom: 8,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 18,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  rowDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  tile: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  tileOn: {
    backgroundColor: colors.accentFaint,
  },
  tileOff: {
    backgroundColor: colors.surface3,
  },
  rowText: {
    flex: 1,
    marginRight: 12,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  rowSubtitle: {
    fontSize: 12.5,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
