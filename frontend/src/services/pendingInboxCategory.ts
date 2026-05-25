export interface InboxCategoryItem {
  id: string;
  text: string;
  timestamp: number;
  tapType: 'user' | 'round' | 'none';
  tapId?: string;
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
