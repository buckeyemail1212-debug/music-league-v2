# Music League - Product Requirements Document

## Overview
"Fantasy sports for music" game. Users create/join leagues, submit songs to themed rounds, vote on each other's submissions, and see rankings.

## Tech Stack
- **Frontend**: React Native, Expo, Expo Router, TypeScript
- **Backend**: FastAPI, Python, motor (async MongoDB)
- **Database**: MongoDB
- **Testing**: pytest (backend), Playwright (frontend)

## 5-Tab Navigation
1. **Home** - Leagues with image/initial, active round timers, scroll-to-top on focus
2. **Discover** - Deezer song search with 30s previews
3. **Add** (raised 60px circular button) - Modal popup: Create League or Join League
4. **Inbox** - League chats using SharedChat component, latest message preview
5. **Profile** - User stats, logout only (no delete account)

## Core Features

### Authentication
- JWT-based auth (register, login)
- Profile photo upload (base64)

### Leagues
- Create with name, rounds (1-10), optional image
- Join by 6-char code
- League image displayed on cards and inbox
- League code copiable in header

### Rounds
- Themed rounds with submission + voting phases
- Timezone-aware deadlines (EST/PST)
- Submission extensions by league creator

### Voting & Scoring
- N-1 point system (1st gets N-1 points, 2nd gets N-2, etc.)
- Tie handling, missed vote handling
- Standings with share-as-image feature

### Chat
- Unified SharedChat component used in both Inbox and League Detail
- 3-second polling for real-time updates
- Keyboard avoiding behavior for mobile
- Unread message indicators

## Key Files
- Backend: `/app/backend/server.py`, `/app/backend/main.py`
- Tabs: `_layout.tsx`, `home.tsx`, `discovery.tsx`, `add.tsx`, `inbox.tsx`, `profile.tsx`
- Screens: `round/[id].tsx`, `league/[id].tsx`
- API: `src/services/api.ts`
- SharedChat: `src/components/SharedChat.tsx`

## Implemented Features (Feb-Mar 2026)

### Latest Changes (Mar 12, 2026)
- **Add button**: 60px raised circle opens modal popup (not separate page)
- **League images**: Fixed _id exclusion in MongoDB queries for proper serialization
- **SharedChat component**: Unified chat UI replacing duplicate code in inbox and league pages
- **Profile cleanup**: Removed delete account button/function
- **Navigation polish**: Scroll-to-top on tab focus, chat modal reset on page return
- **Backend sync**: server.py and main.py kept in sync

### Previous Changes
- JWT auth, league CRUD, round management, timezone-aware deadlines
- N-1 voting, tie handling, auto-distribution, confetti on results
- Deezer search with Spotify/Apple Music/YouTube links
- League chat with polling
- 5-tab navigation layout
- Inbox with latest message preview
- League page with code in header (copiable)
- All user data cleared

## Backlog
- **P0**: WebSocket for real-time chat (replace polling)
- **P1**: Password reset via email
- **P2**: Refactor monolithic files (league/[id].tsx, round/[id].tsx)
- **P2**: Backend restructuring (routers, models, services)

## DB Schema
- **users**: `{id, email, username, display_name, password_hash, profile_photo, created_at}`
- **leagues**: `{id, name, league_code, creator_id, creator_username, total_rounds, league_image, members[], current_round, status, created_at}`
- **rounds**: `{id, league_id, round_number, theme, status, submission_hours, voting_hours, submission_deadline, voting_deadline, ...}`
- **messages**: `{id, league_id, user_id, username, display_name, content, created_at}`
- **submissions**: `{id, round_id, user_id, username, song, locked, submitted_at}`
- **votes**: `{id, round_id, user_id, rankings[], locked, created_at}`

## 3rd Party Integrations
- **Deezer API**: Song search and 30-second previews
- **Expo**: React Native framework and build service
- **Railway**: Backend and database hosting (for deployment)
