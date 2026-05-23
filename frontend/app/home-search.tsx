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
          <Ionicons name="close" size={26} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Search</Text>
        <View style={styles.headerBtn} />
      </View>

      <View style={styles.searchWrap}>
        <Ionicons
          name="search"
          size={18}
          color="#6A6A6A"
          style={styles.searchIcon}
        />
        <TextInput
          style={styles.searchInput}
          placeholder="Search leagues and members"
          placeholderTextColor="#6A6A6A"
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
        />
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

      <View style={styles.content}>
        {activeTab === 'leagues' ? (
          <LeaguesSearchTab query={query} />
        ) : (
          <View style={styles.placeholderCenter}>
            <Text style={styles.placeholder}>
              Member results will appear here
            </Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255,255,255,0.08)',
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
    color: '#FFFFFF',
    textAlign: 'center',
  },

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#282828',
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
    color: '#FFFFFF',
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
    color: '#6A6A6A',
    paddingVertical: 10,
    letterSpacing: 0.5,
  },
  tabLabelActive: {
    color: '#FFFFFF',
  },
  tabUnderline: {
    height: 2,
    width: '100%',
    backgroundColor: 'transparent',
  },
  tabUnderlineActive: {
    backgroundColor: '#7C3AED',
  },

  content: {
    flex: 1,
  },
  placeholderCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  placeholder: {
    color: '#6A6A6A',
    fontSize: 14,
    textAlign: 'center',
  },
});
