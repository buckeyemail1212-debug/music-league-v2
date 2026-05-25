import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, ReactNode } from 'react';
import { AppState } from 'react-native';
import { useAuth } from './AuthContext';
import {
  getInboxFeed,
  getNotifications,
  getDmConversations,
  InboxFeedItem,
  AppNotification,
  DmConversation,
} from '../services/api';
import { getCategoryViews } from '../services/inboxReadState';

function parseTs(s?: string | null): number {
  if (!s) return 0;
  const t = new Date(s.endsWith('Z') || s.includes('+') ? s : s + 'Z').getTime();
  return isNaN(t) ? 0 : t;
}

interface InboxData {
  notifs: InboxFeedItem[];
  serverNotifs: AppNotification[];
  conversations: DmConversation[];
  categoryViews: Record<string, number>;
  loading: boolean;
  totalUnread: number;
  refresh: () => Promise<void>;
}

const InboxDataContext = createContext<InboxData | null>(null);

export function InboxDataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? '';

  const [notifs, setNotifs] = useState<InboxFeedItem[]>([]);
  const [serverNotifs, setServerNotifs] = useState<AppNotification[]>([]);
  const [conversations, setConversations] = useState<DmConversation[]>([]);
  const [categoryViews, setCategoryViews] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const feedRes = await getInboxFeed();
      if (mountedRef.current) setNotifs(feedRes.data?.data?.items ?? []);
    } catch {}
    try {
      const notifRes = await getNotifications();
      if (mountedRef.current) setServerNotifs(notifRes.data?.data?.notifications ?? []);
    } catch {}
    try {
      const dmRes = await getDmConversations();
      if (mountedRef.current) setConversations(dmRes.data?.data?.conversations ?? []);
    } catch {}
    try {
      const views = await getCategoryViews(userId);
      if (mountedRef.current) setCategoryViews(views);
    } catch {}
    if (mountedRef.current) setLoading(false);
  }, [userId]);

  useEffect(() => {
    mountedRef.current = true;
    refresh();
    return () => { mountedRef.current = false; };
  }, [refresh]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  const totalUnread = useMemo(() => {
    const lastFollows = categoryViews['follows'] ?? 0;
    const lastResults = categoryViews['results'] ?? 0;
    const lastLeague = categoryViews['league'] ?? 0;
    const lastSystem = categoryViews['system'] ?? 0;

    const followsUnread = serverNotifs
      .filter(n => n.category === 'follows' && parseTs(n.created_at) > lastFollows).length;
    const systemUnread = serverNotifs
      .filter(n => n.category === 'system' && parseTs(n.created_at) > lastSystem).length;
    const resultsUnread = notifs
      .filter(n => n.type === 'RESULT' && n.timestamp > lastResults).length;
    const leagueUnread = notifs
      .filter(n => n.type === 'COMMENT' && n.timestamp > lastLeague).length;

    const categoryUnread = followsUnread + systemUnread + resultsUnread + leagueUnread;
    const dmUnread = conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0);
    return categoryUnread + dmUnread;
  }, [notifs, serverNotifs, conversations, categoryViews]);

  const value = useMemo<InboxData>(() => ({
    notifs,
    serverNotifs,
    conversations,
    categoryViews,
    loading,
    totalUnread,
    refresh,
  }), [notifs, serverNotifs, conversations, categoryViews, loading, totalUnread, refresh]);

  return (
    <InboxDataContext.Provider value={value}>
      {children}
    </InboxDataContext.Provider>
  );
}

export function useInboxData(): InboxData {
  const ctx = useContext(InboxDataContext);
  if (!ctx) throw new Error('useInboxData must be used within InboxDataProvider');
  return ctx;
}
