# Music League - Product Requirements Document

## Original Problem Statement
Build a "Music League" mobile app - "fantasy sports for music" game using Expo (React Native) and FastAPI.

## Core Features
- **Authentication**: JWT-based auth with name + phone number at sign-up, "Delete & Start Fresh" flow
- **Leagues & Rounds**: Create/join leagues with themed rounds cycling through Submission -> Voting -> Results phases
- **Voting System**: N-1 point system (1st gets N-1 pts, 2nd gets N-2, etc.), tie handling, auto-distribution for missed votes
- **Song Search**: Deezer API for 30-second previews, links to Spotify/YouTube/Apple Music
- **Chat**: League chat with unread indicators
- **UI/UX**: Light/cream theme (#F5F0E8 bg, #212F36 text, #5A7A6B accent)

## Architecture
- **Frontend**: Expo (React Native), TypeScript, Expo Router
- **Backend**: FastAPI, Python, MongoDB (motor async driver)
- **API**: Deezer for song search

## 5-Tab Navigation Layout
1. **Home** - Your leagues, active rounds, profile photo
2. **Discover** - Deezer song search with 30s previews
3. **Add** (raised center button) - Create League or Join League
4. **Inbox** - All league chats in one place
5. **Profile** - User settings, stats, account management

## What's Been Implemented

### Session 1 (Previous)
- Full auth system, League CRUD, Round management
- Song submission and voting, Timezone-aware deadlines
- Custom league images, Display name, Reopen submission
- Complete UI overhaul to light/cream theme, Chat system

### Session 2 (Current - Feb 2026)
- **Voting Logic Overhaul**: N-1 point system, accumulated standings, auto-distribution, ties
- **5-Tab Navigation**: Home, Discover, raised Add button, Inbox, Profile
- **Inbox Tab**: New screen showing all league chats, tap to go directly to chat
- **Add Tab**: Create League (with camera + gallery image picker) or Join League
- **Results Page**: Confetti, removed yellow highlight, removed points text
- **Apple Music Logo**: Updated to logo-apple everywhere
- **Consistent Service Link Colors**: Spotify (#1DB954), Apple (#FA243C), YouTube (#FF0000)
- **Song Search Modal**: Service links under each result, close-circle X button
- **Timer Fixes**: Black in league, white bg + blue border on home
- **Chat Navigation**: Direct from inbox + home page chat icon
- **Submission Info Box**: White bg + blue border
- **Chat Keyboard**: SafeAreaView + KeyboardAvoidingView
- **Discovery Audio**: Stops when leaving tab
- **UI Cleanup**: Removed flag/trophy, arrows, fixed colors/fonts

### Testing
- 20/20 backend tests passed (iteration_2.json)

## Backlog
- P1: Tab switching scroll-to-top
- P2: Real password reset (email/SMS)
- P2: Refactor monolithic files
- P2: Expo EAS republish

## Key Files
- Backend: `/app/backend/server.py`, `/app/backend/main.py`
- Frontend Tabs: `/app/frontend/app/(tabs)/_layout.tsx`, `home.tsx`, `discovery.tsx`, `add.tsx`, `inbox.tsx`, `profile.tsx`
- Screens: `/app/frontend/app/round/[id].tsx`, `/app/frontend/app/league/[id].tsx`
- API: `/app/frontend/src/services/api.ts`
