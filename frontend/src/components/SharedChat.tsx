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
import { Ionicons } from '@expo/vector-icons';
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

export function SharedChat({ leagueId, leagueName, onClose }: SharedChatProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const chatListRef = useRef<FlatList>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isMe = item.user_id === user?.id;
    return (
      <View style={[styles.msgRow, isMe && styles.msgRowMe]} data-testid={`chat-message-${item.id}`}>
        <View style={[styles.msgBubble, isMe ? styles.msgBubbleMe : styles.msgBubbleOther]}>
          {!isMe && <Text style={styles.msgSender}>{item.display_name || item.username}</Text>}
          <Text style={[styles.msgText, isMe && styles.msgTextMe]}>{item.content}</Text>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 20}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.backBtn} data-testid="chat-back-button">
          <Ionicons name="arrow-back" size={24} color="#212F36" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{leagueName}</Text>
        <View style={{ width: 32 }} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#5A7A6B" />
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

      <View style={styles.inputRow}>
        <TextInput
          style={styles.chatInput}
          placeholder="Type a message..."
          placeholderTextColor="#8B9A94"
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
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="send" size={18} color="#FFFFFF" />
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F0E8',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0D8CC',
    backgroundColor: '#FFFFFF',
    gap: 12,
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#212F36',
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
    color: '#6B7A82',
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
    backgroundColor: '#5A7A6B',
    borderBottomRightRadius: 4,
  },
  msgBubbleOther: {
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#E0D8CC',
  },
  msgSender: {
    fontSize: 12,
    fontWeight: '600',
    color: '#5A7A6B',
    marginBottom: 4,
  },
  msgText: {
    fontSize: 15,
    color: '#212F36',
    lineHeight: 20,
  },
  msgTextMe: {
    color: '#FFFFFF',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
    paddingBottom: Platform.OS === 'ios' ? 24 : 8,
    borderTopWidth: 1,
    borderTopColor: '#E0D8CC',
    backgroundColor: '#FFFFFF',
    gap: 8,
  },
  chatInput: {
    flex: 1,
    backgroundColor: '#F5F0E8',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: '#212F36',
    maxHeight: 100,
    borderWidth: 1,
    borderColor: '#E0D8CC',
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#5A7A6B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#B8C5B0',
  },
});
