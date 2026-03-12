import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ActivityIndicator,
  Image,
  RefreshControl,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { getLeagues, getMessages, sendLeagueMessage } from '../../src/services/api';

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

  // Active chat state
  const [activeLeague, setActiveLeague] = useState<League | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const chatListRef = useRef<FlatList>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const fetchLeagues = async () => {
    try {
      const response = await getLeagues();
      const leagueList = response.data;
      setLeagues(leagueList);
      
      // Fetch latest message for each league
      const msgMap: { [id: string]: ChatMessage | null } = {};
      await Promise.all(leagueList.map(async (league: League) => {
        try {
          const msgRes = await getMessages(league.id);
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
      fetchLeagues();
      return () => {
        if (pollRef.current) clearInterval(pollRef.current);
      };
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchLeagues();
    setRefreshing(false);
  };

  const openChat = async (league: League) => {
    setActiveLeague(league);
    setLoadingMessages(true);
    try {
      const res = await getMessages(league.id);
      setMessages(res.data || []);
      setTimeout(() => chatListRef.current?.scrollToEnd({ animated: false }), 100);
    } catch {
      Alert.alert('Error', 'Failed to load messages');
    } finally {
      setLoadingMessages(false);
    }
    // Poll for new messages
    pollRef.current = setInterval(async () => {
      try {
        const res = await getMessages(league.id);
        setMessages(res.data || []);
      } catch {}
    }, 3000);
  };

  const closeChat = () => {
    setActiveLeague(null);
    setMessages([]);
    setNewMessage('');
    if (pollRef.current) clearInterval(pollRef.current);
    fetchLeagues(); // Refresh latest messages
  };

  const handleSendMessage = async () => {
    if (!activeLeague || !newMessage.trim() || sendingMessage) return;
    setSendingMessage(true);
    try {
      await sendLeagueMessage(activeLeague.id, newMessage.trim());
      setNewMessage('');
      const res = await getMessages(activeLeague.id);
      setMessages(res.data || []);
      setTimeout(() => chatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch {
      Alert.alert('Error', 'Failed to send message');
    } finally {
      setSendingMessage(false);
    }
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isMe = item.user_id === user?.id;
    return (
      <View style={[styles.msgRow, isMe && styles.msgRowMe]}>
        <View style={[styles.msgBubble, isMe ? styles.msgBubbleMe : styles.msgBubbleOther]}>
          {!isMe && <Text style={styles.msgSender}>{item.display_name || item.username}</Text>}
          <Text style={[styles.msgText, isMe && styles.msgTextMe]}>{item.content}</Text>
        </View>
      </View>
    );
  };

  // Active chat view
  if (activeLeague) {
    return (
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 20}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={{ flex: 1 }}>
              <View style={styles.chatHeader}>
                <TouchableOpacity onPress={closeChat} style={{ padding: 4 }}>
                  <Ionicons name="arrow-back" size={24} color="#212F36" />
                </TouchableOpacity>
                <Text style={styles.chatHeaderTitle} numberOfLines={1}>{activeLeague.name}</Text>
                <View style={{ width: 32 }} />
              </View>
              
              {loadingMessages ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color="#5A7A6B" />
                </View>
              ) : (
                <FlatList
                  ref={chatListRef}
                  data={messages}
                  keyExtractor={(item) => item.id}
                  renderItem={renderMessage}
                  contentContainerStyle={styles.chatContent}
                  onContentSizeChange={() => chatListRef.current?.scrollToEnd({ animated: false })}
                  ListEmptyComponent={
                    <View style={styles.emptyChat}>
                      <Text style={styles.emptyChatText}>No messages yet. Say hi!</Text>
                    </View>
                  }
                />
              )}

              <View style={styles.inputRow}>
                <TextInput
                  style={styles.chatInput}
                  placeholder="Type a message..."
                  placeholderTextColor="#8B9A94"
                  value={newMessage}
                  onChangeText={setNewMessage}
                  multiline
                  maxLength={500}
                  onSubmitEditing={handleSendMessage}
                />
                <TouchableOpacity
                  style={[styles.sendButton, (!newMessage.trim() || sendingMessage) && styles.sendButtonDisabled]}
                  onPress={handleSendMessage}
                  disabled={!newMessage.trim() || sendingMessage}
                >
                  {sendingMessage ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name="send" size={18} color="#FFFFFF" />
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // League list view
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
      <TouchableOpacity style={styles.chatItem} onPress={() => openChat(item)} activeOpacity={0.7}>
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
  // Chat view styles
  chatHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#E0D8CC', gap: 12 },
  chatHeaderTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: '#212F36' },
  chatContent: { padding: 16, paddingBottom: 8 },
  emptyChat: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  emptyChatText: { fontSize: 14, color: '#6B7A82' },
  msgRow: { marginBottom: 8, flexDirection: 'row' },
  msgRowMe: { justifyContent: 'flex-end' },
  msgBubble: { maxWidth: '75%', padding: 12, borderRadius: 16 },
  msgBubbleMe: { backgroundColor: '#5A7A6B', borderBottomRightRadius: 4 },
  msgBubbleOther: { backgroundColor: '#FFFFFF', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: '#E0D8CC' },
  msgSender: { fontSize: 12, fontWeight: '600', color: '#5A7A6B', marginBottom: 4 },
  msgText: { fontSize: 15, color: '#212F36', lineHeight: 20 },
  msgTextMe: { color: '#FFFFFF' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#E0D8CC', backgroundColor: '#F5F0E8', gap: 8 },
  chatInput: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, color: '#212F36', maxHeight: 100, borderWidth: 1, borderColor: '#E0D8CC' },
  sendButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#5A7A6B', justifyContent: 'center', alignItems: 'center' },
  sendButtonDisabled: { backgroundColor: '#B8C5B0' },
});
