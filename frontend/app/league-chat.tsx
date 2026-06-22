import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../src/context/AuthContext';
import { getLeagueMessages, sendLeagueMessage } from '../src/services/api';
import { apiCache } from '../src/services/apiCache';
import { markCategoryViewed } from '../src/services/inboxReadState';

interface ChatMessage {
  id: string;
  user_id: string;
  username: string;
  display_name?: string;
  content: string;
  created_at: string;
}

export default function LeagueChatScreen() {
  const { leagueId, leagueName } = useLocalSearchParams<{ leagueId: string; leagueName: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const chatListRef = useRef<FlatList>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  if (!leagueId) {
    router.back();
    return null;
  }

  const fetchMessages = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await getLeagueMessages(leagueId);
      const newMsgs: ChatMessage[] = res.data || [];
      const hasNew = newMsgs.length > messages.length;
      setMessages(newMsgs);
      apiCache.set(`league-messages:${leagueId}`, newMsgs);
      if (hasNew || !silent) {
        setTimeout(() => chatListRef.current?.scrollToEnd({ animated: silent }), 100);
      }
    } catch {
      // silent
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages();
    pollRef.current = setInterval(() => fetchMessages(true), 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [leagueId]);

  // Opening the chat counts as reading the league category — clear the
  // inbox's COMMENT/unread indicator (it re-reads category views on poll/focus).
  useEffect(() => {
    if (user?.id) {
      markCategoryViewed(user.id, 'league');
    }
  }, [user?.id, leagueId]);

  const handleSend = async () => {
    const text = newMessage.trim();
    if (!text) return;
    setNewMessage('');

    // Optimistic message — show it immediately with a temp id.
    const tempId = `temp-${Date.now()}`;
    const optimistic: ChatMessage = {
      id: tempId,
      user_id: user?.id ?? '',
      username: user?.username ?? '',
      display_name: user?.display_name ?? user?.username ?? '',
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => {
      const next = [...prev, optimistic];
      apiCache.set(`league-messages:${leagueId}`, next);
      return next;
    });
    setTimeout(() => chatListRef.current?.scrollToEnd({ animated: true }), 50);

    try {
      const res = await sendLeagueMessage(leagueId, text);
      const real = res.data;
      if (real) {
        // Replace the temp message with the server's real one.
        setMessages(prev => {
          const next = prev.map(m => (m.id === tempId ? real : m));
          apiCache.set(`league-messages:${leagueId}`, next);
          return next;
        });
      }
    } catch {
      // Remove the optimistic message and restore the text.
      setMessages(prev => {
        const next = prev.filter(m => m.id !== tempId);
        apiCache.set(`league-messages:${leagueId}`, next);
        return next;
      });
      setNewMessage(text);
    }
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isMe = item.user_id === user?.id;
    return (
      <View style={[styles.msgRow, isMe && styles.msgRowMe]}>
        <View style={[styles.msgBubble, isMe ? styles.msgBubbleMe : styles.msgBubbleOther]}>
          {!isMe && <Text style={styles.msgSender}>{item.display_name || item.username}</Text>}
          <Text style={styles.msgText}>{item.content}</Text>
        </View>
      </View>
    );
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 20}
      >
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>{leagueName}</Text>
          <View style={{ width: 32 }} />
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#7C3AED" />
          </View>
        ) : (
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <FlatList
              ref={chatListRef}
              data={messages}
              keyExtractor={(item) => item.id}
              renderItem={renderMessage}
              contentContainerStyle={styles.chatContent}
              keyboardShouldPersistTaps="handled"
              onContentSizeChange={() => chatListRef.current?.scrollToEnd({ animated: false })}
              ListEmptyComponent={
                <View style={styles.emptyChat}>
                  <Text style={styles.emptyChatText}>No messages yet. Say hi!</Text>
                </View>
              }
            />
          </TouchableWithoutFeedback>
        )}

        <View style={[styles.inputRow, { paddingBottom: Platform.OS === 'ios' ? insets.bottom : 8 }]}>
          <TextInput
            style={styles.chatInput}
            placeholder="Type a message..."
            placeholderTextColor="#B3B3B3"
            value={newMessage}
            onChangeText={setNewMessage}
            multiline
            maxLength={2000}
            onSubmitEditing={handleSend}
          />
          <TouchableOpacity
            style={[styles.sendButton, !newMessage.trim() && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!newMessage.trim()}
          >
            <Ionicons name="send" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    backgroundColor: '#121212',
    gap: 12,
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chatContent: {
    padding: 16,
    paddingBottom: 8,
    flexGrow: 1,
  },
  emptyChat: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
  },
  emptyChatText: {
    fontSize: 14,
    color: '#B3B3B3',
  },
  msgRow: {
    marginBottom: 8,
    flexDirection: 'row',
  },
  msgRowMe: {
    justifyContent: 'flex-end',
  },
  msgBubble: {
    maxWidth: '75%',
    padding: 12,
    borderRadius: 16,
  },
  msgBubbleMe: {
    backgroundColor: '#7C3AED',
    borderBottomRightRadius: 4,
  },
  msgBubbleOther: {
    backgroundColor: '#282828',
    borderBottomLeftRadius: 4,
  },
  msgSender: {
    fontSize: 12,
    fontWeight: '600',
    color: '#B3B3B3',
    marginBottom: 4,
  },
  msgText: {
    fontSize: 15,
    color: '#FFFFFF',
    lineHeight: 20,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(255,255,255,0.1)',
    backgroundColor: '#121212',
    gap: 8,
  },
  chatInput: {
    flex: 1,
    backgroundColor: '#3E3E3E',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: '#FFFFFF',
    maxHeight: 100,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#7C3AED',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
});
