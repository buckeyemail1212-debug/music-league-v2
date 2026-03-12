# Music League - Product Requirements Document

## Overview
"Fantasy sports for music" game. Users create/join leagues, submit songs to themed rounds, vote on each other's submissions, and see rankings.

## Tech Stack
- **Frontend**: React Native, Expo, Expo Router, TypeScript
- **Backend**: FastAPI, Python, motor (async MongoDB)
- **Database**: MongoDB
- **Testing**: pytest (backend), Playwright (frontend)

## CRITICAL: Backend Deployment Required
The Railway backend has OLD code that does NOT return `league_image` in API responses. The user MUST redeploy the backend folder to Railway for league images to work.

## 5-Tab Navigation
1. **Home** - Leagues with image/initial, active round timers, scroll-to-top on focus
2. **Discover** - Deezer song search with 30s previews
3. **Add** (raised 60px dark circle matching nav bar) - Modal popup: Create League or Join League
4. **Inbox** - League chats using SharedChat component
5. **Profile** - User stats, logout only

## Key Files
- Backend: `/app/backend/server.py`, `/app/backend/main.py`
- Tabs: `_layout.tsx`, `home.tsx`, `discovery.tsx`, `add.tsx`, `inbox.tsx`, `profile.tsx`
- Screens: `round/[id].tsx`, `league/[id].tsx`
- API: `src/services/api.ts`
- SharedChat: `src/components/SharedChat.tsx`

## Latest Fixes (Mar 12, 2026 - Session 2)
1. **Start Round button** - Fixed duplicate backgroundColor bug (cream was overriding dark). Now white with dark border.
2. **Song search X button** - Added more padding to push X down from status bar area
3. **League image backend** - Backend correctly stores/returns league_image with `_id` exclusion, logging, Infinity body limits
4. **Add button color** - Dark blue (#212F36) matching nav bar
5. **Chat keyboard** - fullScreen modal for proper keyboard avoiding
6. **Unified SharedChat** - Used in both inbox and league detail

## Previous Fixes (Mar 12, 2026 - Session 1)
- Profile cleanup (removed delete account)
- Navigation scroll-to-top on focus
- Chat modal reset on page return

## Backlog
- **P0**: Redeploy backend to Railway (league images won't work until this is done)
- **P1**: WebSocket for real-time chat
- **P2**: Password reset via email
- **P2**: Refactor monolithic files

## Deploy Instructions
### Frontend (Expo update):
```bash
cd ~/Downloads/music-league-v2-main\ 8/frontend
npm install
npx eas-cli update --branch preview --message "v7"
```

### Backend (Railway redeploy - REQUIRED for league images):
Deploy the `/backend` folder to Railway. The `main.py` file is the entry point.
