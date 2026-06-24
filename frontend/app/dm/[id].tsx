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
import { colors } from '../../src/theme/colors';

export default function DmConversationScreen() {
  const { id, username, avatar, otherUserId } = useLocalSearchParams<{ id: string; username: string; avatar?: string; otherUserId?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [messages, setMessages] = useState<DmMessage[]>(
    () => apiCache.getStale<DmMessage[]>(`dm-messages:${id}`) ?? []
  );
  const [newMessage, setNewMessage] = useState('');
  const [canSend, setCanSend] = useState(true);
  const [loading, setLoading] = useState(
    () => !apiCache.getStale(`dm-messages:${id}`)
  );
  const chatListRef = useRef<FlatList>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const friendAlertShownRef = useRef(false);

  const fetchMessages = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await getDmMessages(id!);
      const newMsgs: DmMessage[] = res.data?.data?.messages ?? [];
      const hasNew = newMsgs.length > messages.length;
      setMessages(newMsgs);
      apiCache.set(`dm-messages:${id}`, newMsgs);
      const friendOk = res.data?.data?.is_friend !== false; // treat missing as ok
      setCanSend(friendOk);
      if (!friendOk && !friendAlertShownRef.current) {
        friendAlertShownRef.current = true;
        Alert.alert(
          'Not friends yet',
          "You can only message someone you're friends with — you both need to follow each other.",
        );
      }
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
    fetchMessages(apiCache.getStale(`dm-messages:${id}`) != null);
    pollRef.current = setInterval(() => fetchMessages(true), 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [id]);

  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', () => {
      setTimeout(() => chatListRef.current?.scrollToEnd({ animated: true }), 50);
    });
    return () => sub.remove();
  }, []);

  const handleSend = async () => {
    const text = newMessage.trim();
    if (!text) return;
    setNewMessage('');

    // Optimistic message — show it immediately with a temp id.
    const tempId = `temp-${Date.now()}`;
    const optimistic: DmMessage = {
      id: tempId,
      conversation_id: id!,
      sender_id: user?.id ?? '',
      text,
      created_at: new Date().toISOString(),
      read_by: [user?.id ?? ''],
    };
    setMessages(prev => {
      const next = [...prev, optimistic];
      apiCache.set(`dm-messages:${id}`, next);
      return next;
    });
    setTimeout(() => chatListRef.current?.scrollToEnd({ animated: true }), 50);

    try {
      const res = await sendDmMessage(id!, text);
      const real = res.data?.data?.message;
      if (real) {
        // Replace the temp message with the server's real one.
        setMessages(prev => {
          const next = prev.map(m => (m.id === tempId ? real : m));
          apiCache.set(`dm-messages:${id}`, next);
          return next;
        });
      }
    } catch (e: any) {
      // Remove the optimistic message and restore the text.
      setMessages(prev => {
        const next = prev.filter(m => m.id !== tempId);
        apiCache.set(`dm-messages:${id}`, next);
        return next;
      });
      setNewMessage(text);
      if (e?.response?.status === 403 && e?.response?.data?.detail === 'not_friends') {
        Alert.alert(
          'Not friends yet',
          "You can only message someone you're friends with — you both need to follow each other.",
        );
      }
    }
  };

  const renderMessage = ({ item }: { item: DmMessage }) => {
    const isMe = item.sender_id === user?.id;
    return (
      <View style={[styles.msgRow, isMe && styles.msgRowMe]}>
        <View style={[styles.msgBubble, isMe ? styles.msgBubbleMe : styles.msgBubbleOther]}>
          <Text style={[styles.msgText, isMe ? styles.msgTextMe : styles.msgTextOther]}>{item.text}</Text>
        </View>
      </View>
    );
  };

  const sendDisabled = !newMessage.trim() || !canSend;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerUserTap}
            activeOpacity={0.7}
            onPress={() => { if (otherUserId) router.push(`/user/${otherUserId}` as any); }}
            disabled={!otherUserId}
          >
            {avatar ? (
              <Image source={{ uri: avatar }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Ionicons name="person" size={16} color={colors.textSecondary} />
              </View>
            )}
            <Text style={styles.headerTitle} numberOfLines={1}>{username}</Text>
          </TouchableOpacity>
          <View style={{ width: 32 }} />
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.accent} />
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
            placeholder={canSend ? "Type a message..." : "You must be friends to send a message"}
            placeholderTextColor={colors.textPlaceholder}
            value={newMessage}
            onChangeText={setNewMessage}
            multiline
            maxLength={2000}
            onSubmitEditing={handleSend}
            editable={canSend}
          />
          <TouchableOpacity
            style={[styles.sendButton, sendDisabled && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={sendDisabled}
          >
            <Ionicons name="send" size={18} color={sendDisabled ? colors.textTertiary : colors.onAccent} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
    backgroundColor: colors.bg,
    gap: 12,
  },
  backBtn: {
    padding: 4,
  },
  headerUserTap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  avatarFallback: {
    backgroundColor: colors.surface4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '500',
    color: colors.textPrimary,
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
    color: colors.textSecondary,
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
    backgroundColor: colors.accent,
    borderBottomRightRadius: 4,
  },
  msgBubbleOther: {
    backgroundColor: colors.surface3,
    borderBottomLeftRadius: 4,
  },
  msgText: {
    fontSize: 15,
    lineHeight: 20,
  },
  msgTextMe: {
    color: colors.onAccent,
  },
  msgTextOther: {
    color: colors.textPrimary,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
    gap: 8,
  },
  chatInput: {
    flex: 1,
    backgroundColor: colors.surface3,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.textPrimary,
    maxHeight: 100,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: colors.surface3,
  },
});
