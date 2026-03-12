# Music League - Product Requirements Document

## Original Problem Statement
Build a "Music League" mobile app - "fantasy sports for music" game using Expo (React Native) and FastAPI.

## Core Features
- **Authentication**: JWT-based auth with name + phone number at sign-up, "Delete & Start Fresh" flow
- **Leagues & Rounds**: Create/join leagues with themed rounds cycling through Submission → Voting → Results phases
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
- Custom league images
- Display name feature
- Reopen submission feature (2hr extensions)
- Complete UI overhaul to light/cream theme
- Chat system with unread indicators

### Session 2 (Current - Feb 2026)
- **P0: Voting Logic Overhaul** ✅
  - Implemented N-1 point system: 1st gets (N-1) pts from each voter, 2nd gets (N-2), etc.
  - Fixed standings to accumulate points correctly across rounds with same N-1 logic
  - Fixed user stats to use same N-1 point calculation
  - Non-voter auto-distribution: points evenly split to other songs
  - Non-submitters get 0 points and cannot vote
  - Proper tie handling (same score = same rank)
  - All 14 backend tests passed (100%)

- **P0: Results Page UI** ✅
  - Added confetti cannon on results page
  - Removed yellow winner card highlight/border
  - Removed points explanation text
  - Updated music service links with branded colors (Spotify green, Apple red, YouTube red)
  - Used Apple logo icon instead of generic musical-note for Apple Music

- **P0: UI/UX Bug Fixes** ✅
  - Fixed back button color (white→dark) on light background
  - Fixed timer icon color (white→dark) on round and home pages
  - Fixed modal close button (white→dark) visibility
  - Fixed modal header border color for light theme
  - Removed arrows from "Advance to..." buttons
  - Fixed song search close button size and color
  - Fixed submission info card colors for light theme
  - Fixed rank option button colors for light theme
  - Fixed reopen button background for light theme

- **P1: UI Polish** ✅
  - Removed flag/trophy icons from Rounds/Standings tabs
  - Made league code smaller (24px→18px)
  - Made "Start New Round" button white with border
  - Replaced flag icon with musical-notes in empty state
  - Fixed rank option text colors for readability

- **P2: Audio Playback Fix** ✅
  - Discovery page now stops audio when leaving tab
  - Clears search query when navigating away
  - Changed from staysActiveInBackground:true to false

## Backlog / Future Tasks
- P1: Add message icon on home league cards to navigate to chat
- P1: Tab switching should scroll to top
- P2: Real password reset (email/SMS) instead of "Delete & Start Fresh"
- P2: Refactor monolithic files (server.py, league/[id].tsx, round/[id].tsx)

## Key Files
- Backend: `/app/backend/server.py`, `/app/backend/main.py`
- Frontend: `/app/frontend/app/round/[id].tsx`, `/app/frontend/app/league/[id].tsx`, `/app/frontend/app/(tabs)/home.tsx`, `/app/frontend/app/(tabs)/discovery.tsx`
- API: `/app/frontend/src/services/api.ts`
- Tests: `/app/backend/tests/test_music_league.py`

## Test Reports
- `/app/test_reports/iteration_1.json` - All 14 backend tests passed (100%)
