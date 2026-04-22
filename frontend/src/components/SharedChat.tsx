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
  Animated,
} from 'react-native';
import { GestureHandlerRootView, Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/AuthContext';
import { getLeagueMessages, sendLeagueMessage } from '../services/api';

interface ChatMessage {
  id: string;
  user_id: string;
  username: string;
  display_name?: string;
  content: string;
  created_at: string;
}

interface SharedChatProps {
  leagueId: string;
  leagueName: string;
  onClose: () => void;
}

const dismissedChatKey = (userId: string) => `chat_dismissed_${userId}`;

export function SharedChat({ leagueId, leagueName, onClose }: SharedChatProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const chatListRef = useRef<FlatList>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load dismissed message IDs for the current user on mount
  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(dismissedChatKey(user.id));
        if (raw) setDismissed(new Set(JSON.parse(raw)));
      } catch {}
    })();
  }, [user?.id]);

  const persistDismissed = async (next: Set<string>) => {
    if (!user?.id) return;
    try {
      await AsyncStorage.setItem(dismissedChatKey(user.id), JSON.stringify([...next]));
    } catch {}
  };

  const fetchMessages = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await getLeagueMessages(leagueId);
      const newMsgs = res.data || [];
      const hasNew = newMsgs.length > messages.length;
      setMessages(newMsgs);
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

  const handleSend = async () => {
    if (!newMessage.trim() || sending) return;
    const content = newMessage.trim();
    setNewMessage('');
    setSending(true);
    try {
      const res = await sendLeagueMessage(leagueId, content);
      setMessages(prev => [...prev, res.data]);
      setTimeout(() => chatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch {
      setNewMessage(content);
    } finally {
      setSending(false);
    }
  };

  const handleDismissMessage = (msg: ChatMessage) => {
    const next = new Set(dismissed);
    next.add(msg.id);
    setDismissed(next);
    persistDismissed(next);
  };

  const renderRightActions = (
    progress: Animated.AnimatedInterpolation<number>,
    msg: ChatMessage,
  ) => {
    const translateX = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [80, 0],
      extrapolate: 'clamp',
    });
    return (
      <Animated.View style={[styles.swipeActionWrap, { transform: [{ translateX }] }]}>
        <TouchableOpacity
          style={styles.trashBtn}
          onPress={() => handleDismissMessage(msg)}
          activeOpacity={0.8}
        >
          <Ionicons name="trash" size={22} color="#FFFFFF" />
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isMe = item.user_id === user?.id;
    return (
      <Swipeable
        renderRightActions={(p) => renderRightActions(p, item)}
        rightThreshold={40}
        friction={2}
        overshootRight={false}
      >
        <View style={[styles.msgRow, isMe && styles.msgRowMe]} data-testid={`chat-message-${item.id}`}>
          <View style={[styles.msgBubble, isMe ? styles.msgBubbleMe : styles.msgBubbleOther]}>
            {!isMe && <Text style={styles.msgSender}>{item.display_name || item.username}</Text>}
            <Text style={[styles.msgText, isMe && styles.msgTextMe]}>{item.content}</Text>
          </View>
        </View>
      </Swipeable>
    );
  };

  const visibleMessages = messages.filter(m => !dismissed.has(m.id));

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 20}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backBtn} data-testid="chat-back-button">
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
              data={visibleMessages}
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

        <View style={styles.inputRow}>
          <TextInput
            style={styles.chatInput}
            placeholder="Type a message..."
            placeholderTextColor="#B3B3B3"
            value={newMessage}
            onChangeText={setNewMessage}
            multiline
            maxLength={500}
            onSubmitEditing={handleSend}
            data-testid="chat-message-input"
          />
          <TouchableOpacity
            style={[styles.sendButton, (!newMessage.trim() || sending) && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!newMessage.trim() || sending}
            data-testid="chat-send-button"
          >
            {sending ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons name="send" size={18} color="#FFFFFF" />
            )}
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
    paddingVertical: 12,
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
  msgTextMe: {
    color: '#FFFFFF',
  },
  swipeActionWrap: {
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: 4,
    marginBottom: 8,
  },
  trashBtn: {
    width: 60,
    height: '100%',
    backgroundColor: '#EF4444',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
    paddingBottom: Platform.OS === 'ios' ? 24 : 8,
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
