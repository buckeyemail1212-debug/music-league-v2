export interface InboxCategoryItem {
  id: string;
  text: string;
  timestamp: number;
  tapType: 'user' | 'round' | 'chat' | 'league' | 'none';
  tapId?: string;
  tapLabel?: string;
  avatar?: string | null;
  title?: string;
  subtitle?: string;
  actorId?: string;
  followsBack?: boolean;
  showFollowPill?: boolean;
  rowType?: 'invite';
  inviteId?: string;
  inviteStatus?: 'pending' | 'accepted' | 'declined';
  leagueId?: string;
}

export interface PendingInboxCategory {
  category: string;
  label: string;
  items: InboxCategoryItem[];
}

let pending: PendingInboxCategory | null = null;

export const setPendingInboxCategory = (data: PendingInboxCategory) => {
  pending = data;
};

export const consumePendingInboxCategory = (): PendingInboxCategory | null => {
  const d = pending;
  pending = null;
  return d;
};
