import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
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
  members: { id: string; username: string }[];
  current_round: number;
  status: string;
  created_at: string;
}

export interface Round {
  id: string;
  league_id: string;
  round_number: number;
  theme: string;
  status: 'submission' | 'voting' | 'completed';
  submission_hours: number;
  voting_hours: number;
  submission_deadline: string;
  voting_deadline: string;
  submissions_count: number;
  has_user_submitted: boolean;
  has_user_voted: boolean;
  user_vote_locked: boolean;
  created_at: string;
}

export interface Submission {
  id: string;
  round_id: string;
  user_id: string;
  username: string;
  song: Song;
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

export interface UserStats {
  total_wins: number;
  rounds_played: number;
  win_rate: number;
  leagues_count: number;
}

// User Stats API
export const getUserStats = () => api.get<UserStats>('/auth/stats');

// League APIs
export const createLeague = (data: {
  name: string;
  total_rounds: number;
}) => api.post<League>('/leagues', data);

export const getLeagues = () => api.get<League[]>('/leagues');

export const getLeague = (id: string) => api.get<League>(`/leagues/${id}`);

export const joinLeague = (code: string) => 
  api.post<League>('/leagues/join', { league_code: code });

export const deleteLeague = (id: string) => 
  api.delete(`/leagues/${id}`);

export const leaveLeague = (id: string) => 
  api.post(`/leagues/${id}/leave`);

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
}) => api.post<Round>(`/leagues/${leagueId}/rounds`, data);

export const getRounds = (leagueId: string) => 
  api.get<Round[]>(`/leagues/${leagueId}/rounds`);

export const getRound = (roundId: string) => 
  api.get<Round>(`/rounds/${roundId}`);

export const advanceRound = (roundId: string) => 
  api.post(`/rounds/${roundId}/advance`);

// Submission APIs
export const submitSong = (roundId: string, song: Song) => 
  api.post<Submission>(`/rounds/${roundId}/submit`, { song });

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

export default api;
