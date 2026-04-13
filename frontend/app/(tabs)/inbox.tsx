import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { getLeagues, getLeagueMessages } from '../../src/services/api';
import { SharedChat } from '../../src/components/SharedChat';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface League {
  id: string;
  name: string;
  league_code: string;
  league_image?: string;
  members: Array<{ id: string; username: string; display_name?: string }>;
}

interface ChatMessage {
  id: string;
  user_id: string;
  username: string;
  display_name?: string;
  content: string;
  created_at: string;
}

export default function InboxScreen() {
  const { user } = useAuth();
  const [leagues, setLeagues] = useState<League[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [latestMessages, setLatestMessages] = useState<{ [leagueId: string]: ChatMessage | null }>({});
  const [activeLeague, setActiveLeague] = useState<League | null>(null);
  const [cachedImages, setCachedImages] = useState<{ [leagueId: string]: string }>({});
  const lastFetchTime = useRef<number>(0);
  const dataLoaded    = useRef(false);

  const fetchLeagues = async () => {
    lastFetchTime.current = Date.now();
    try {
      const response = await getLeagues();
      const leagueList = response.data;
      
      // Load cached images for leagues without one from API
      const imgCache: { [id: string]: string } = {};
      await Promise.all(leagueList.map(async (league: League) => {
        if (!league.league_image) {
          try {
            const cached = await AsyncStorage.getItem(`league_image_${league.id}`);
            if (cached) {
              imgCache[league.id] = cached;
              league.league_image = cached;
            }
          } catch {}
        }
      }));
      setCachedImages(imgCache);
      setLeagues(leagueList);
      dataLoaded.current = true;
      
      const msgMap: { [id: string]: ChatMessage | null } = {};
      await Promise.all(leagueList.map(async (league: League) => {
        try {
          const msgRes = await getLeagueMessages(league.id);
          if (msgRes.data && msgRes.data.length > 0) {
            msgMap[league.id] = msgRes.data[msgRes.data.length - 1];
          } else {
            msgMap[league.id] = null;
          }
        } catch {
          msgMap[league.id] = null;
        }
      }));
      setLatestMessages(msgMap);
    } catch (error) {
      console.error('Failed to fetch leagues:', error);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      setActiveLeague(null);
      if (Date.now() - lastFetchTime.current > 30000) {
        lastFetchTime.current = Date.now();
        fetchLeagues();
      }
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchLeagues();
    setRefreshing(false);
  };

  const closeChat = () => {
    setActiveLeague(null);
    fetchLeagues();
  };

  if (activeLeague) {
    return (
      <SafeAreaView style={styles.container}>
        <SharedChat
          leagueId={activeLeague.id}
          leagueName={activeLeague.name}
          onClose={closeChat}
        />
      </SafeAreaView>
    );
  }

  if (loading && !dataLoaded.current) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}><Text style={styles.title}>Inbox</Text></View>
        <View style={styles.loadingContainer}><ActivityIndicator size="large" color="#7C3AED" /></View>
      </SafeAreaView>
    );
  }

  const renderLeagueChat = ({ item }: { item: League }) => {
    const latest = latestMessages[item.id];
    return (
      <TouchableOpacity
        style={styles.chatItem}
        onPress={() => setActiveLeague(item)}
        activeOpacity={0.7}
        data-testid={`inbox-league-${item.id}`}
      >
        <View style={styles.chatAvatar}>
          {item.league_image ? (
            <Image source={{ uri: item.league_image }} style={styles.chatAvatarImage} />
          ) : (
            <View style={styles.chatAvatarPlaceholder}>
              <Text style={styles.chatAvatarText}>{item.name.charAt(0).toUpperCase()}</Text>
            </View>
          )}
        </View>
        <View style={styles.chatInfo}>
          <Text style={styles.chatName} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.chatPreview} numberOfLines={1}>
            {latest
              ? `${latest.display_name || latest.username}: ${latest.content}`
              : 'Send a chat to your league mates!'
            }
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#6A6A6A" />
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}><Text style={styles.title}>Inbox</Text></View>
      {leagues.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="chatbubbles-outline" size={64} color="#7C3AED" />
          <Text style={styles.emptyTitle}>No Chats Yet</Text>
          <Text style={styles.emptyText}>Join or create a league to start chatting.</Text>
        </View>
      ) : (
        <FlatList
          data={leagues}
          keyExtractor={(item) => item.id}
          renderItem={renderLeagueChat}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7C3AED" />}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  title: { fontSize: 24, fontWeight: '700', color: '#FFFFFF' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { paddingHorizontal: 16 },
  chatItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 4 },
  chatAvatar: { width: 50, height: 50, borderRadius: 25, marginRight: 14 },
  chatAvatarImage: { width: 50, height: 50, borderRadius: 25 },
  chatAvatarPlaceholder: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#282828', alignItems: 'center', justifyContent: 'center' },
  chatAvatarText: { fontSize: 20, fontWeight: '600', color: '#FFFFFF' },
  chatInfo: { flex: 1 },
  chatName: { fontSize: 14, fontWeight: '600', color: '#FFFFFF' },
  chatPreview: { fontSize: 12, color: '#B3B3B3', marginTop: 2 },
  separator: { height: 0.5, backgroundColor: 'rgba(255,255,255,0.1)', marginLeft: 68 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyTitle: { fontSize: 24, fontWeight: '700', color: '#FFFFFF', marginTop: 16 },
  emptyText: { fontSize: 14, color: '#B3B3B3', textAlign: 'center', marginTop: 8 },
});
