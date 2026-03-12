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
3. **Add** (raised 60px dark circle matching nav bar) - Modal popup: Create League or Join League
4. **Inbox** - League chats using SharedChat component, latest message preview
5. **Profile** - User stats, logout only (no delete account)

## Core Features

### Authentication
- JWT-based auth (register, login)
- Profile photo upload (base64)

### Leagues
- Create with name, rounds (1-10), optional image (quality 0.15 for small size)
- Join by 6-char code
- League image displayed on cards and inbox
- League code copiable in header

### Rounds
- Themed rounds with submission + voting phases
- Timezone-aware deadlines (EST/PST)
- Submission extensions by league creator
- Start Round button: white background, black text, dark border

### Voting & Scoring
- N-1 point system (1st gets N-1 points, 2nd gets N-2, etc.)
- Tie handling, missed vote handling
- Standings with share-as-image feature

### Chat
- Unified SharedChat component used in both Inbox and League Detail
- 3-second polling for real-time updates
- Keyboard avoiding behavior for mobile (fullScreen modal)
- Unread message indicators

## Key Files
- Backend: `/app/backend/server.py`, `/app/backend/main.py`
- Tabs: `_layout.tsx`, `home.tsx`, `discovery.tsx`, `add.tsx`, `inbox.tsx`, `profile.tsx`
- Screens: `round/[id].tsx`, `league/[id].tsx`
- API: `src/services/api.ts`
- SharedChat: `src/components/SharedChat.tsx`

## Implemented Features (Mar 12, 2026 - Latest Session)

### Fixes Applied
1. **League image**: Reduced quality to 0.15, added Axios maxBodyLength, backend logging, _id exclusion
2. **Add button**: Changed color from green to dark blue (#212F36) matching nav bar, with shadow underneath
3. **Song search X button**: Reduced paddingTop from 16 to 8 to bring it down from status bar area
4. **Start Round button**: Changed border from subtle #E0D8CC to visible #212F36 (1.5px)
5. **League chat keyboard**: Changed modal from pageSheet to fullScreen for proper KeyboardAvoidingView
6. **Unified chat**: SharedChat component used in both inbox and league detail
7. **Profile cleanup**: Removed delete account button/function
8. **Navigation polish**: Scroll-to-top on tab focus, chat modal reset
9. **Backend sync**: server.py and main.py kept in sync

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

## Deploy Instructions (for user)
```bash
cd ~/Downloads/music-league-v2-main\ 7/frontend
npm install
npx eas-cli update --branch preview --message "v6 - fixes"
```
