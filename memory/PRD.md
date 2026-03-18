# Music League - Product Requirements Document

## Overview
"Fantasy sports for music" game. Users create/join leagues, submit songs to themed rounds, vote on each other's submissions, and see rankings.

## Tech Stack
- **Frontend**: React Native, Expo, Expo Router, TypeScript
- **Backend**: FastAPI, Python, motor (async MongoDB)
- **Database**: MongoDB
- **Deployment**: Railway (backend), Expo/EAS (frontend)

## Core Requirements
- JWT-based auth
- Leagues with custom images, join codes
- Rounds cycle: Submission -> Voting -> Results (with timers)
- Voting: dropdown to rank songs, N-1 point system (1st = N-1 pts)
- Song search via Deezer API with 30-second previews
- Links to Spotify, Apple Music, YouTube
- 5-tab bottom nav: Home, Discovery, Add (modal), Inbox, Profile
- Light/cream color theme

## Voting System (Verified & Updated Mar 17, 2026)
- Dropdown shows 1 to (N-1) options where N = total submissions
- Dropdown shows place values only (1st, 2nd, 3rd) - NO points shown
- Dropdown trigger shows "Rank" placeholder (not "#"), changes to selected rank
- Green text in white box with green border for rank display
- Dropdown scrolls up to 5 visible items, scroll within for more
- Dropdown renders ABOVE other cards (z-index fix)
- Vote saved/Lock it in section has proper spacing from song cards

## Audio Playback (Updated Mar 17, 2026)
- 30-second preview always playable infinite times
- Each press creates a fresh sound instance (old one fully unloaded)
- Sound unloads on finish so next press works reliably
- Audio stops when navigating away (useFocusEffect cleanup)
- Fixed on both Round page and Discovery page

## Key Files
- Backend: `/app/backend/server.py`, `/app/backend/main.py`
- Tabs: `_layout.tsx`, `home.tsx`, `discovery.tsx`, `add.tsx`, `inbox.tsx`, `profile.tsx`
- Screens: `round/[id].tsx`, `league/[id].tsx`
- API: `src/services/api.ts`
- SharedChat: `src/components/SharedChat.tsx`
- Event Emitter: `src/utils/event-emitter.ts`

## Completed Features
- Auth (register, login, profile)
- Leagues (create, join, leave, delete, images)
- Rounds (create, submit, vote, results)
- Voting dropdown with dynamic N-1 ranking (green themed, proper z-index)
- Chat (polling-based)
- Discovery page with song search
- Audio playback with infinite replay and stop-on-navigate
- Winner banners, confetti, standings
- League creator can grant submission extensions
- Home screen auto-refresh after create/join

## Backlog
- **P1**: WebSocket for real-time chat (replace polling)
- **P2**: Password reset via email
- **P2**: Refactor monolithic files (league/[id].tsx, round/[id].tsx, server.py)
