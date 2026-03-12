import React, { useState, useCallback } from 'react';
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

  const fetchLeagues = async () => {
    try {
      const response = await getLeagues();
      const leagueList = response.data;
      setLeagues(leagueList);
      
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
      fetchLeagues();
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

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}><Text style={styles.title}>Inbox</Text></View>
        <View style={styles.loadingContainer}><ActivityIndicator size="large" color="#5A7A6B" /></View>
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
        <Ionicons name="chevron-forward" size={18} color="#B8C5B0" />
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}><Text style={styles.title}>Inbox</Text></View>
      {leagues.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="chatbubbles-outline" size={64} color="#B8C5B0" />
          <Text style={styles.emptyTitle}>No Chats Yet</Text>
          <Text style={styles.emptyText}>Join or create a league to start chatting.</Text>
        </View>
      ) : (
        <FlatList
          data={leagues}
          keyExtractor={(item) => item.id}
          renderItem={renderLeagueChat}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#5A7A6B" />}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F0E8' },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#212F36' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { paddingHorizontal: 16 },
  chatItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 4 },
  chatAvatar: { width: 50, height: 50, borderRadius: 25, marginRight: 14 },
  chatAvatarImage: { width: 50, height: 50, borderRadius: 25 },
  chatAvatarPlaceholder: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#5A7A6B', alignItems: 'center', justifyContent: 'center' },
  chatAvatarText: { fontSize: 20, fontWeight: 'bold', color: '#FFFFFF' },
  chatInfo: { flex: 1 },
  chatName: { fontSize: 16, fontWeight: '600', color: '#212F36' },
  chatPreview: { fontSize: 13, color: '#6B7A82', marginTop: 2 },
  separator: { height: 1, backgroundColor: '#E0D8CC', marginLeft: 68 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyTitle: { fontSize: 20, fontWeight: 'bold', color: '#212F36', marginTop: 16 },
  emptyText: { fontSize: 14, color: '#6B7A82', textAlign: 'center', marginTop: 8 },
});
