import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import LeaguesSearchTab from '../src/components/LeaguesSearchTab';
import MembersSearchTab from '../src/components/MembersSearchTab';
import { colors } from '../src/theme/colors';

type Tab = 'leagues' | 'members';

export default function HomeSearchScreen() {
  const router = useRouter();

  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('leagues');

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.headerBtn}
          activeOpacity={0.75}
        >
          <Ionicons name="close" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Search</Text>
        <View style={styles.headerBtn} />
      </View>

      <View style={styles.tabRow}>
        {(['leagues', 'members'] as const).map((tab) => {
          const active = activeTab === tab;
          const label = tab === 'leagues' ? 'Leagues' : 'Members';
          return (
            <TouchableOpacity
              key={tab}
              style={styles.tabBtn}
              activeOpacity={0.75}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                {label}
              </Text>
              <View
                style={[
                  styles.tabUnderline,
                  active && styles.tabUnderlineActive,
                ]}
              />
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.searchWrap}>
        <Ionicons
          name="search"
          size={18}
          color={colors.textTertiary}
          style={styles.searchIcon}
        />
        <TextInput
          style={styles.searchInput}
          placeholder={activeTab === 'leagues' ? 'Search all leagues' : 'Search members'}
          placeholderTextColor={colors.textPlaceholder}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
        />
      </View>

      <View style={styles.content}>
        {activeTab === 'leagues' ? (
          <LeaguesSearchTab query={query} />
        ) : (
          <MembersSearchTab query={query} />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  headerBtn: {
    minWidth: 40,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
  },

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface3,
    borderRadius: 10,
    marginHorizontal: 20,
    marginTop: 12,
    paddingHorizontal: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 15,
    paddingVertical: 12,
  },

  tabRow: {
    flexDirection: 'row',
    marginTop: 16,
    paddingHorizontal: 20,
  },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textTertiary,
    paddingVertical: 10,
    letterSpacing: 0.5,
  },
  tabLabelActive: {
    color: colors.textPrimary,
  },
  tabUnderline: {
    height: 2,
    width: '100%',
    backgroundColor: 'transparent',
  },
  tabUnderlineActive: {
    backgroundColor: colors.accent,
  },

  content: {
    flex: 1,
  },
});
