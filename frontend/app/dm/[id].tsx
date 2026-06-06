import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  TouchableWithoutFeedback,
  Alert,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../src/context/AuthContext';
import { getDmMessages, sendDmMessage, DmMessage } from '../../src/services/api';
import { apiCache } from '../../src/services/apiCache';

export default function DmConversationScreen() {
  const { id, username, avatar } = useLocalSearchParams<{ id: string; username: string; avatar?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [messages, setMessages] = useState<DmMessage[]>(
    () => apiCache.getStale<DmMessage[]>(`dm-messages:${id}`) ?? []
  );
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(
    () => !apiCache.getStale(`dm-messages:${id}`)
  );
  const chatListRef = useRef<FlatList>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchMessages = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await getDmMessages(id!);
      const newMsgs: DmMessage[] = res.data?.data?.messages ?? [];
      const hasNew = newMsgs.length > messages.length;
      setMessages(newMsgs);
      apiCache.set(`dm-messages:${id}`, newMsgs);
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
  }, [id]);

  const handleSend = async () => {
    if (!newMessage.trim() || sending) return;
    const text = newMessage.trim();
    setNewMessage('');
    setSending(true);
    try {
      const res = await sendDmMessage(id!, text);
      const msg = res.data?.data?.message;
      if (msg) {
        setMessages(prev => {
          const next = [...prev, msg];
          apiCache.set(`dm-messages:${id}`, next);
          return next;
        });
        setTimeout(() => chatListRef.current?.scrollToEnd({ animated: true }), 100);
      }
    } catch (e: any) {
      setNewMessage(text);
      if (e?.response?.status === 403 && e?.response?.data?.detail === 'not_friends') {
        Alert.alert(
          'Not friends yet',
          "You can only message someone you're friends with — you both need to follow each other.",
        );
      }
    } finally {
      setSending(false);
    }
  };

  const renderMessage = ({ item }: { item: DmMessage }) => {
    const isMe = item.sender_id === user?.id;
    return (
      <View style={[styles.msgRow, isMe && styles.msgRowMe]}>
        <View style={[styles.msgBubble, isMe ? styles.msgBubbleMe : styles.msgBubbleOther]}>
          <Text style={styles.msgText}>{item.text}</Text>
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
          {avatar ? (
            <Image source={{ uri: avatar }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Ionicons name="person" size={16} color="#B3B3B3" />
            </View>
          )}
          <Text style={styles.headerTitle} numberOfLines={1}>{username}</Text>
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
            style={[styles.sendButton, (!newMessage.trim() || sending) && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!newMessage.trim() || sending}
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
    paddingBottom: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    backgroundColor: '#121212',
    gap: 12,
  },
  backBtn: {
    padding: 4,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  avatarFallback: {
    backgroundColor: '#3E3E3E',
    alignItems: 'center',
    justifyContent: 'center',
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
