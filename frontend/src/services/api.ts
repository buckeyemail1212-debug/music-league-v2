import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
  current_round: number;
  status: string;
  created_at: string;
  submission_hours?: number | null;
  voting_hours?: number | null;
  themes?: string[] | null;
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
}

export interface LeagueStandings {
  league_id: string;
  standings: {
    user_id: string;
    username: string;
    total_points: number;
    wins: number;
    rounds_played: number;
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

export interface MySubmission {
  submission_id: string;
  song: Song;
  submitted_at: string;
  round_id: string;
  round_number: number;
  round_theme: string;
  round_status: 'submission' | 'voting' | 'completed';
  league_id: string;
  league_name: string;
  league_image?: string | null;
  points: number | null;
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
  is_public?: boolean;
  starts_at?: string | null;
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
}

export interface PastLeagueSubmission {
  submission_id: string;
  round_id: string;
  round_number: number | null;
  round_theme: string | null;
  song: Song | null;
  submitted_at: string | null;
}

export interface PastLeague {
  id: string;
  name: string;
  league_code?: string | null;
  league_image?: string | null;
  total_rounds: number;
  rounds_completed: number;
  members_count: number;
  is_deleted: boolean;
  deleted_at: string | null;
  finished_at: string | null;
  my_place: number | null;
  winner: {
    user_id: string;
    username: string;
    profile_photo?: string | null;
    total_points: number;
  } | null;
  standings: PastLeagueStanding[];
  my_submissions: PastLeagueSubmission[];
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
  api.post<{ message: string; league_deleted?: boolean }>(`/leagues/${id}/leave`);

// Public-league discovery.
export interface DiscoverLeague {
  id: string;
  name: string;
  total_rounds: number;
  starts_at: string;
  member_count: number;
  member_cap: number;
  has_current_user_joined: boolean;
  league_image?: string | null;
  creator_username?: string | null;
}

export const getDiscoverLeagues = (params?: { q?: string; limit?: number; offset?: number }) =>
  api.get<{ leagues: DiscoverLeague[]; count: number }>('/leagues/discover', { params });

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
export const submitSong = (roundId: string, song: Song, locked: boolean = false) => 
  api.post<Submission>(`/rounds/${roundId}/submit`, { song, locked });

export const getSubmissions = (roundId: string) => 
  api.get<Submission[]>(`/rounds/${roundId}/submissions`);

// Vote APIs
export const submitVote = (roundId: string, rankings: string[], locked: boolean = false) => 
  api.post<Vote>(`/rounds/${roundId}/vote`, { rankings, locked });

export const getMyVote = (roundId: string) => 
  api.get<Vote>(`/rounds/${roundId}/my-vote`);

export const getResults = (roundId: string) => 
  api.get<RoundResult>(`/rounds/${roundId}/results`);

// Song Search
export const searchSongs = (query: string) => 
  api.get<{ data: Song[] }>('/songs/search', { params: { q: query } });

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

export default api;
