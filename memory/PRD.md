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

## What's Been Implemented

### Session 1 (Previous)
- Full auth system (register, login, delete account, forgot password flow)
- League CRUD (create, join, leave, delete, update image)
- Round management (create, advance, auto-advance on deadline)
- Song submission and voting
- Timezone-aware deadlines with python-dateutil
- Custom league images with camera + gallery picker
- Display name feature
- Reopen submission feature (2hr extensions)
- Complete UI overhaul to light/cream theme
- Chat system with unread indicators

### Session 2 (Feb 2026)
- **Voting Logic Overhaul** - N-1 point system, accumulated standings, auto-distribution, tie handling
- **Results Page** - Confetti cannon, removed yellow highlight, removed points text
- **Apple Music Logo** - Updated to `logo-apple` in all contexts (results, submission, voting, search)
- **Consistent Service Link Colors** - Spotify (#1DB954), Apple (#FA243C), YouTube (#FF0000) everywhere
- **Song Search Modal** - Added service links under each search result, added close-circle X button
- **Timer Fixes** - League timer black not orange, home timer box white bg + blue border
- **Messages Navigation** - Chat icon on home league cards navigates directly to chat via openChat param
- **Submission Info Box** - White background + blue border, proper width matching submission card
- **Chat Keyboard** - SafeAreaView wrapping, KeyboardAvoidingView with proper offset
- **Discovery Audio** - Stops when leaving tab, no longer plays in background
- **Tab UI** - Removed flag/trophy icons from Rounds/Standings tabs
- **Advance Buttons** - Removed arrows from "Advance to..." buttons
- **Start New Round** - White background with border
- **Modal Fixes** - All close button icons dark (#212F36) for visibility on light bg
- **Rank Options** - Fixed colors for light theme readability
- **0-Point Users** - Non-submitters correctly appear in standings with 0 points

### Testing
- **20/20 backend tests passed** (iteration_2.json)
- Covers: Auth, League, Round, Voting (N-1, ties, non-voter), Standings, Chat, Zero-point users

## Backlog / Future Tasks
- P1: Tab switching scroll to top (partially addressed)
- P2: Real password reset (email/SMS) instead of "Delete & Start Fresh"
- P2: Refactor monolithic files (server.py, league/[id].tsx, round/[id].tsx)
- P2: Expo EAS republish needed after this session's changes

## Key Files
- Backend: `/app/backend/server.py`, `/app/backend/main.py`
- Frontend: `/app/frontend/app/round/[id].tsx`, `/app/frontend/app/league/[id].tsx`, `/app/frontend/app/(tabs)/home.tsx`, `/app/frontend/app/(tabs)/discovery.tsx`
- Tests: `/app/backend/tests/test_music_league.py`

## Test Reports
- `/app/test_reports/iteration_1.json` - 14/14 backend tests passed
- `/app/test_reports/iteration_2.json` - 20/20 backend tests passed (regression + new)
