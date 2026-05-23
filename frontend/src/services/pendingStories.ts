import { Story } from './api';

export interface PendingStoryGroup {
  username: string;
  avatarUrl: string;
  userId: string;
  isOwn: boolean;
  stories: Story[];
}

let pending: PendingStoryGroup[] | null = null;

export const setPendingStories = (groups: PendingStoryGroup[]) => {
  pending = groups;
};

export const consumePendingStories = (): PendingStoryGroup[] | null => {
  const g = pending;
  pending = null; // consume — read once, then cleared
  return g;
};
