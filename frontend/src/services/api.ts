import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiCache } from './apiCache';

// User-stat caches go stale when the user submits or votes. Wipe both
// prefixes (auth-* covers stats/submissions/lifetime/taste; users-me-stats-*
// covers the dedicated My Game endpoints).
const invalidateMyStats = () => {
  apiCache.invalidate('auth-');
  apiCache.invalidate('users-me-stats-');
};

export const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'https://music-league-v2-production.up.railway.app';

const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
  maxContentLength: Infinity,
  maxBodyLength: Infinity,
  timeout: 30000,
});

// Add auth token to requests
api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export interface Song {
  deezer_id: number;
  title: string;
  artist: string;
  album: string;
  preview_url: string;
  cover_url: string;
  duration: number;
}

export interface League {
  id: string;
  name: string;
  league_code: string;
  creator_id: string;
  creator_username: string;
  total_rounds: number;
  league_image?: string | null;
  members: { id: string; username: string; profile_photo?: string }[];
  // Users who left the league mid-flight. Their existing
  // submissions/votes are preserved as historical record but they
  // can't participate further.
  left_members?: {
    user_id: string;
    username: string;
    points_at_leave: number;
    left_at?: string | null;
  }[];
  current_round: number;
  status: string;
  created_at: string;
  submission_hours?: number | null;
  voting_hours?: number | null;
  themes?: string[] | null;
  genre?: string | null;
  is_public?: boolean;
  starts_at?: string | null;
  member_cap?: number | null;
}

export interface Round {
  id: string;
  league_id: string;
  round_number: number;
  theme: string;
  status: 'locked' | 'ready' | 'scheduled' | 'submission' | 'voting' | 'completed' | 'skipped';
  submission_hours: number;
  voting_hours: number;
  // Null for "locked", "ready", and "scheduled" rounds — no submission
  // timer has been set yet.
  submission_deadline: string | null;
  voting_deadline: string | null;
  // Only set for "scheduled" rounds (public-league R1 auto-start time).
  starts_at?: string | null;
  submissions_count: number;
  votes_count: number;
  total_members: number;
  has_user_submitted: boolean;
  has_user_voted: boolean;
  user_vote_locked: boolean;
  user_submission_locked: boolean;
  created_at: string;
}

export interface Submission {
  id: string;
  round_id: string;
  user_id: string;
  username: string;
  song: Song;
  locked: boolean;
  submitted_at: string;
}

export interface Vote {
  id: string;
  round_id: string;
  user_id: string;
  rankings: string[];
  locked: boolean;
  created_at: string;
}

export interface RoundResult {
  id: string;
  round_id: string;
  rankings: {
    submission_id: string;
    song: Song;
    user_id: string;
    username: string;
    points: number;
    rank: number;
  }[];
  winners: {
    submission_id: string;
    song: Song;
    user_id: string;
    username: string;
    points: number;
    rank: number;
  }[];
  is_tie: boolean;
  total_voters: number;
  votes?: {
    voter_id: string;
    voter_username: string;
    voter_profile_photo?: string | null;
    rankings: string[];
  }[];
  non_submitters?: {
    user_id: string;
    username: string;
    profile_photo?: string | null;
  }[];
}

export interface LeagueStandings {
  league_id: string;
  standings: {
    user_id: string;
    username: string;
    total_points: number;
    wins: number;
    rounds_played: number;
    // True if the user has left the league. Left users always render
    // below all active rows regardless of point totals.
    left?: boolean;
  }[];
  rounds_completed: number;
  total_rounds: number;
}

export interface Message {
  id: string;
  league_id: string;
  user_id: string;
  username: string;
  content: string;
  created_at: string;
}

export interface ChatStatus {
  has_unread: boolean;
  last_message_at: string | null;
}

export interface UserStats {
  total_wins: number;
  rounds_played: number;
  win_rate: number;
  leagues_count: number;
}

// User Stats API
export const getUserStats = () => api.get<UserStats>('/auth/stats');

export interface LifetimeStats {
  all_time_points: number;
  total_wins: number;
  total_submissions: number;
}
export const getLifetimeStats = () =>
  api.get<LifetimeStats>('/auth/lifetime-stats');

export interface TasteBreakdown {
  total: number;
  breakdown: { genre: string; count: number; pct: number }[];
}
export const getUserTaste = () =>
  api.get<TasteBreakdown>('/auth/taste');

export const getWeeklyPoints = () =>
  api.get<{ weekly_points: number }>('/auth/weekly-points');

// ── My Game: detailed stats (league-wins, etc.) ──────────────────────────────

export interface CountStat { count: number }
export interface TopVoter {
  user_id: string;
  username: string;
  avatar_url: string | null;
  vote_count: number;
}

export const getLeagueWins = () =>
  api.get<{ data: CountStat }>('/users/me/stats/league-wins');
export const getRoundsPlayed = () =>
  api.get<{ data: CountStat }>('/users/me/stats/rounds-played');
export const getTopVoters = () =>
  api.get<{ data: TopVoter[] }>('/users/me/stats/top-voters');

export interface MySubmission {
  submission_id: string;
  song: Song;
  submitted_at: string;
  round_id: string;
  round_number: number;
  round_theme: string;
  round_status: 'submission' | 'voting' | 'completed' | 'skipped';
  league_id: string;
  league_name: string;
  league_image?: string | null;
  // "active" | "completed" | "deleted" — derived from league.status +
  // league.deleted_at on the backend so the client doesn't have to
  // reason about soft-deletes.
  league_status?: 'active' | 'completed' | 'deleted';
  // Legacy field kept for backward compatibility. Prefer points_earned.
  points: number | null;
  points_earned?: number | null;
  // User's rank in the round (standard competition: ties share a rank).
  // Null until the round is completed.
  placement?: number | null;
  total_submissions_in_round?: number | null;
}

export const getMySubmissions = () =>
  api.get<{ submissions: MySubmission[] }>('/auth/submissions');

// League APIs
export const createLeague = (data: {
  name: string;
  total_rounds: number;
  league_image?: string | null;
  submission_hours?: number | null;
  voting_hours?: number | null;
  themes?: string[] | null;
  genre?: string | null;
  is_public?: boolean;
  starts_at?: string | null;
  member_cap?: number | null;
}) => api.post<League>('/leagues', data);

export const updateLeague = (id: string, data: {
  league_image?: string | null;
}) => api.put<League>(`/leagues/${id}`, data);

export const getLeagues = () => api.get<League[]>('/leagues');

export const getLeague = (id: string) => api.get<League>(`/leagues/${id}`);

export interface LeagueSnapshot {
  league_id: string;
  name: string;
  league_image?: string | null;
  updated_at?: string;
}
export const getLeagueSnapshot = (id: string) =>
  api.get<LeagueSnapshot>(`/leagues/${id}/snapshot`);

export const joinLeague = (code: string) => 
  api.post<League>('/leagues/join', { league_code: code });

export const deleteLeague = (id: string) =>
  api.delete(`/leagues/${id}`);

export interface DeletedLeague {
  id: string;
  name: string;
  league_code?: string;
  league_image?: string | null;
  total_rounds: number;
  members_count: number;
  deleted_at: string;
  expires_at: string;
}

export const getDeletedLeagues = () =>
  api.get<{ leagues: DeletedLeague[] }>('/leagues/deleted');

export const restoreLeague = (id: string) =>
  api.post<League>(`/leagues/${id}/restore`);

export interface PastLeagueStanding {
  user_id: string;
  username: string;
  profile_photo?: string | null;
  total_points: number;
  wins: number;
  rounds_played: number;
  // True if this row represents a user who left the league before it
  // ended. Left users render below all active rows regardless of points.
  left?: boolean;
}

export interface PastLeagueSubmission {
  submission_id: string;
  round_id: string;
  round_number: number | null;
  round_theme: string | null;
  song: Song | null;
  submitted_at: string | null;
}

export interface PastLeagueRoundSummary {
  round_id: string;
  round_number: number | null;
  theme: string | null;
  status: string | null;
  winner?: {
    user_id: string;
    username: string;
    song: Song | null;
    total_points: number;
  } | null;
  placements?: Record<string, number>;
}

export interface PastLeague {
  id: string;
  name: string;
  league_code?: string | null;
  league_image?: string | null;
  creator_id?: string | null;
  creator_username?: string | null;
  total_rounds: number;
  rounds_completed: number;
  members_count: number;
  is_deleted: boolean;
  deleted_at: string | null;
  finished_at: string | null;
  // "completed" for normal end-of-rounds finish, "not_finished" when the
  // creator deleted the league mid-flight. Legacy snapshots default to
  // "completed".
  ended_status: 'completed' | 'not_finished';
  my_place: number | null;
  winner: {
    user_id: string;
    username: string;
    profile_photo?: string | null;
    total_points: number;
  } | null;
  standings: PastLeagueStanding[];
  left_members?: {
    user_id: string;
    username: string;
    points_at_leave: number;
    left_at?: string | null;
  }[];
  my_submissions: PastLeagueSubmission[];
  rounds?: PastLeagueRoundSummary[];
}

export const getPastLeagues = () =>
  api.get<{ leagues: PastLeague[] }>('/leagues/past');

// Remove a single past league from the current user's archive. Does not
// affect other members' copies — the underlying snapshot is preserved
// unless this user was its last member.
export const deletePastLeague = (leagueId: string) =>
  api.delete<{ message: string; snapshots_touched: number }>(
    `/leagues/past/${leagueId}`,
  );

export const clearPastLeagues = () =>
  api.delete<{ message: string; hard_deleted_leagues: number; cleared_at: string }>(
    '/leagues/past',
  );

// Clears personal gameplay data (past league snapshots, Your Taste,
// recent submissions, lifetime stats). Active leagues are untouched.
export const clearAccountData = () =>
  api.post<{
    message: string;
    deleted: Record<string, number>;
  }>('/users/me/clear-data');

// Hard-deletes the account. After success the same email/username can
// be used to register fresh.
export const deleteAccountFull = () =>
  api.delete<{
    message: string;
    deleted: Record<string, number>;
  }>('/users/me');

export const leaveLeague = (id: string) =>
  api.post<{
    message: string;
    league_deleted?: boolean;
    // Set when the caller left an already-active league. Their points
    // are frozen at this value and they no longer appear as an active
    // member in standings.
    left_active_league?: boolean;
    points_at_leave?: number;
  }>(`/leagues/${id}/leave`);

// Summary rows for the Public Leagues page (GET /leagues/public).
export interface PublicLeagueSummary {
  id: string;
  name: string;
  total_rounds: number;
  starts_at: string;
  member_count: number;
  member_cap: number;
  has_current_user_joined: boolean;
  league_image?: string | null;
  creator_username?: string | null;
  genre?: string | null;
}

export const getPublicLeagues = (params?: { q?: string; limit?: number; offset?: number }) =>
  api.get<{ leagues: PublicLeagueSummary[]; count: number }>('/leagues/public', { params });

export interface LeagueSearchResult {
  id: string;
  name: string;
  total_rounds: number;
  starts_at: string | null;
  member_count: number;
  member_cap: number;
  genre: string | null;
  has_current_user_joined: boolean;
  league_image: string | null;
  creator_username: string | null;
  is_public: boolean;
}

export const searchLeagues = (q: string, limit: number = 50) =>
  api.get<{ leagues: LeagueSearchResult[]; count: number }>('/leagues/search', { params: { q, limit } });

export interface UserSearchResult {
  id: string;
  username: string;
  profile_photo: string | null;
  is_private: boolean;
  follow_state: 'none' | 'following' | 'follows_you' | 'friends' | 'requested';
}

export const searchUsers = (q: string, limit: number = 50) =>
  api.get<{ users: UserSearchResult[]; count: number }>('/users/search', { params: { q, limit } });

export const joinPublicLeague = (id: string) =>
  api.post<League>(`/leagues/${id}/join-public`);

export const getLeagueStandings = (leagueId: string) => 
  api.get<LeagueStandings>(`/leagues/${leagueId}/standings`);

// User Profile APIs
export const updateProfile = (data: { username?: string; profile_photo?: string }) =>
  api.put('/auth/me', data);

// Round APIs
export const createRound = (leagueId: string, data: {
  theme: string;
  submission_hours: number;
  voting_hours: number;
  timezone?: string;
}) => api.post<Round>(`/leagues/${leagueId}/rounds`, data);

export const getRounds = (leagueId: string) => 
  api.get<Round[]>(`/leagues/${leagueId}/rounds`);

export const getRound = (roundId: string) => 
  api.get<Round>(`/rounds/${roundId}`);

export const advanceRound = (roundId: string) =>
  api.post(`/rounds/${roundId}/advance`);

// Creator-only: transitions a "ready" round into "submission" phase and
// starts its timer. Returns the updated round.
export const startRound = (leagueId: string, roundNumber: number) =>
  api.post<Round>(`/leagues/${leagueId}/rounds/${roundNumber}/start`);

export const reopenSubmission = (roundId: string, userId: string) =>
  api.post(`/rounds/${roundId}/reopen-submission`, { user_id: userId });

export const getMissingSubmissions = (roundId: string) =>
  api.get<{
    round_id: string;
    round_status: string;
    missing_users: Array<{
      user_id: string;
      username: string;
      has_extension: boolean;
      extension_deadline: string | null;
    }>;
  }>(`/rounds/${roundId}/missing-submissions`);

// Submission APIs
export const submitSong = async (roundId: string, song: Song, locked: boolean = false) => {
  const res = await api.post<Submission>(`/rounds/${roundId}/submit`, { song, locked });
  invalidateMyStats();
  return res;
};

export const getSubmissions = (roundId: string) =>
  api.get<Submission[]>(`/rounds/${roundId}/submissions`);

// Vote APIs
export const submitVote = async (roundId: string, rankings: string[], locked: boolean = false) => {
  const res = await api.post<Vote>(`/rounds/${roundId}/vote`, { rankings, locked });
  invalidateMyStats();
  return res;
};

export const getMyVote = (roundId: string) => 
  api.get<Vote>(`/rounds/${roundId}/my-vote`);

export const getResults = (roundId: string) => 
  api.get<RoundResult>(`/rounds/${roundId}/results`);

// Song Search
export const searchSongs = (query: string) =>
  api.get<{ data: Song[] }>('/songs/search', { params: { q: query } });

export const getSongsRadar = (limit: number = 50) =>
  api.get<{ data: Song[] }>('/songs/radar', { params: { limit } });

export interface CreateStoryPayload {
  song: { deezer_id: number; title: string; artist: string; cover_url: string; preview_url: string };
  photo_url?: string | null;
  caption?: string | null;
  sticker?: {
    x: number;
    y: number;
    scale?: number;
    rotation?: number;
    style?: 'card' | 'album';
  } | null;
}

export const createStory = (payload: CreateStoryPayload) =>
  api.post<{ data: { story_id: string } }>('/stories', payload);

export const deleteStory = (storyId: string) =>
  api.delete<{ data: { deleted: boolean } }>(`/stories/${storyId}`);

export const recordStoryView = (storyId: string) =>
  api.post<{ data: { recorded: boolean } }>(`/stories/${storyId}/view`);

export const uploadImage = (dataUri: string) =>
  api.post<{ data: { url: string } }>('/upload-image', { image: dataUri });

// Chat APIs
export const getLeagueMessages = (leagueId: string) => 
  api.get<Message[]>(`/leagues/${leagueId}/messages`);

export const sendLeagueMessage = (leagueId: string, content: string) => 
  api.post<Message>(`/leagues/${leagueId}/messages`, { content });

export const getChatStatus = (leagueId: string) => 
  api.get<ChatStatus>(`/leagues/${leagueId}/chat-status`);

// Password Reset APIs
export const forgotPassword = (phone_number: string) =>
  api.post('/auth/forgot-password', { phone_number });

export const verifyResetCode = (phone_number: string, code: string) =>
  api.post('/auth/verify-reset-code', { phone_number, code });

export const resetPassword = (phone_number: string, code: string, new_password: string) =>
  api.post('/auth/reset-password', { phone_number, code, new_password });

// Delete Account
export const deleteAccount = () =>
  api.delete('/auth/account');

// Wipe gameplay data (points, wins, submissions, leagues, taste) but keep the account.
export const clearAllData = () =>
  api.delete<{ message: string; leagues_deleted: number }>('/auth/data');

// ── Social graph: follow / profile ─────────────────────────────────────────

export type FollowStatus = 'none' | 'following' | 'follows_you' | 'friends' | 'requested' | 'self';

export interface FollowCounts {
  followers: number;
  following: number;
}

export interface UserProfileStats {
  round_wins: number;
  league_wins: number;
  rounds_played: number;
  total_points: number;
  submissions_count: number;
  leagues_count: number;
}

export interface UserProfileTopVoter {
  user_id: string;
  username: string;
  avatar_url: string | null;
  vote_count: number;
}

// Limited shape (when target is private and viewer isn't an approved
// follower) drops the heavy blocks. is_limited tells the UI which
// branch to render — both shapes share the header fields.
export interface UserProfileResponse {
  user_id: string;
  username: string;
  avatar_url: string | null;
  is_private: boolean;
  follower_count: number;
  following_count: number;
  is_limited: boolean;
  pronouns?: string | null;
  bio?: string | null;
  stats?: UserProfileStats;
  taste?: TasteBreakdown;
  recent_submissions?: MySubmission[];
  top_voters?: UserProfileTopVoter[];
}

export const getFollowStatus = (userId: string) =>
  api.get<{ data: { status: FollowStatus } }>(`/users/${userId}/follow-status`);

export const getFollowCounts = (userId: string) =>
  api.get<{ data: FollowCounts }>(`/users/${userId}/follow-counts`);

export const followUser = (userId: string) =>
  api.post<{ data: { status: 'approved' | 'pending' } }>('/follow', { user_id: userId });

export const unfollowUser = (userId: string) =>
  api.delete<{ data: { removed: true } }>(`/follow/${userId}`);

export const getUserProfile = (userId: string) =>
  api.get<{ data: UserProfileResponse }>(`/users/${userId}/profile`);

// Common shape for both list responses. The reciprocity flag's key
// differs between followers (is_following_me_back) and following
// (follows_me_back), so both keys are optional on this row type and
// the screens read whichever one is set.
export interface FollowListUser {
  user_id: string;
  username: string;
  avatar_url: string | null;
  is_following_me_back?: boolean;
  follows_me_back?: boolean;
}

export interface FollowListResponse {
  users: FollowListUser[];
  total: number;
}

// ── Liked songs (backend-backed) ───────────────────────────────────────────

export interface LikedSong {
  deezer_id: number;
  title: string;
  artist: string;
  album?: string;
  cover_url?: string;
  preview_url?: string;
}

export interface LikedSongsResponse {
  songs: LikedSong[];
  total: number;
}

export const likeSong = (song: LikedSong) =>
  api.post<{ data: { liked: true; deezer_id: number } }>('/likes', song);

export const unlikeSong = (deezerId: number) =>
  api.delete<{ data: { liked: false; deezer_id: number } }>(`/likes/${deezerId}`);

export const getLikedSongs = (limit: number = 50, offset: number = 0) =>
  api.get<{ data: LikedSongsResponse }>('/likes', { params: { limit, offset } });

export const getUserLikedSongs = (
  userId: string,
  limit: number = 50,
  offset: number = 0,
) =>
  api.get<{ data: LikedSongsResponse }>(`/users/${userId}/likes`, {
    params: { limit, offset },
  });

// Cross-user leagues read — used by the other-user profile's Leagues
// tab. invite_code is always null for non-self viewers (backend
// enforced); see `_users_leagues` for the redaction rule.
export interface UserLeagueSummary {
  id: string;
  name: string;
  image_url: string | null;
  member_count: number;
  is_private: boolean;
  is_completed: boolean;
  invite_code: string | null;
}

export const getUserLeagues = (userId: string) =>
  api.get<{ data: { leagues: UserLeagueSummary[] } }>(`/users/${userId}/leagues`);

export const migrateLikedSongs = (songs: LikedSong[]) =>
  api.post<{ data: { migrated: number; already_existed: number } }>(
    '/likes/migrate',
    { songs },
  );

// ── Blocking ──────────────────────────────────────────────────────────────

export interface BlockedUser {
  user_id: string;
  username: string;
  avatar_url?: string | null;
}

export interface BlockedUsersResponse {
  users: BlockedUser[];
  total: number;
}

export const blockUser = (userId: string) =>
  api.post<{ data: { blocked: true } }>('/block', { user_id: userId });

export const unblockUser = (userId: string) =>
  api.delete<{ data: { blocked: false } }>(`/block/${userId}`);

export const getBlockedUsers = (limit: number = 50, offset: number = 0) =>
  api.get<{ data: BlockedUsersResponse }>('/blocked', { params: { limit, offset } });

export const getUserFollowers = (
  userId: string,
  params?: { limit?: number; offset?: number },
) =>
  api.get<{ data: FollowListResponse }>(`/users/${userId}/followers`, { params });

export const getUserFollowing = (
  userId: string,
  params?: { limit?: number; offset?: number },
) =>
  api.get<{ data: FollowListResponse }>(`/users/${userId}/following`, { params });

export interface LeaderboardEntry {
  user_id: string;
  username: string;
  avatar_url: string | null;
  all_time_points: number;
  rank: number;
}

export interface LeaderboardResponse {
  entries: LeaderboardEntry[];
  total: number;
  current_user_rank: number | null;
}

export const getLeaderboard = (scope: 'all' | 'following' | 'friends' = 'all') =>
  api.get<{ data: LeaderboardResponse }>('/leaderboard', { params: { scope } });

export interface StorySong {
  deezer_id: number;
  title: string;
  artist: string;
  cover_url: string;
  preview_url: string;
}

export interface Story {
  id: string;
  song: StorySong;
  photo_url: string | null;
  caption: string | null;
  sticker: {
    x: number;
    y: number;
    scale?: number;
    rotation?: number;
    style?: 'card' | 'album';
  } | null;
  created_at: string;
  expires_at: string;
  seen: boolean;
}

export interface StoryGroup {
  user_id: string;
  username: string;
  avatar_url: string | null;
  stories: Story[];
}

export interface StoriesFeedResponse {
  your_stories: Story[];
  following: StoryGroup[];
}

export const getStoriesFeed = () =>
  api.get<{ data: StoriesFeedResponse }>('/stories/feed');

export const getArchivedStories = () =>
  api.get<{ data: { stories: Story[] } }>('/stories/archived');

export interface AppNotification {
  id: string;
  user_id: string;
  type: string;
  category: string;
  title: string;
  body: string;
  actor_id: string | null;
  ref_id: string | null;
  created_at: string;
  read: boolean;
}

export const getNotifications = () =>
  api.get<{ data: { notifications: AppNotification[] } }>('/notifications');

export interface DmConversation {
  id: string;
  participant_ids: string[];
  created_at: string;
  last_message_at: string;
  last_message_text: string;
  other_user: { user_id: string; username: string; avatar_url: string | null };
  unread_count: number;
}

export interface DmMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  text: string;
  created_at: string;
  read_by: string[];
}

export const startConversation = (userId: string) =>
  api.post<{ data: { conversation: DmConversation } }>('/dm/conversations', { user_id: userId });

export const sendDmMessage = (conversationId: string, text: string) =>
  api.post<{ data: { message: DmMessage } }>(`/dm/conversations/${conversationId}/messages`, { text });

export const getDmMessages = (conversationId: string) =>
  api.get<{ data: { messages: DmMessage[] } }>(`/dm/conversations/${conversationId}/messages`);

export const getDmConversations = () =>
  api.get<{ data: { conversations: DmConversation[] } }>('/dm/conversations');

export const hideConversation = (conversationId: string) =>
  api.post(`/dm/conversations/${conversationId}/hide`);

export interface FriendSummary {
  user_id: string;
  username: string;
  avatar_url: string | null;
}

export const getMyFriends = () =>
  api.get<{ data: { friends: FriendSummary[] } }>('/users/me/friends');

export interface InboxFeedItem {
  id: string;
  type: string;
  leagueId: string;
  leagueName: string;
  leagueImage: string | null;
  message: string;
  timestamp: number;
  onTap: string;
  roundId?: string;
  roundInfo?: string;
}

export const getInboxFeed = () =>
  api.get<{ data: { items: InboxFeedItem[] } }>('/inbox/feed');

export default api;
