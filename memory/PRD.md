# Music League - Product Requirements Document

## Overview
"Fantasy sports for music" game. Users create/join leagues, submit songs to themed rounds, vote on each other's submissions, and see rankings.

## Tech Stack
- **Frontend**: React Native, Expo, Expo Router, TypeScript
- **Backend**: FastAPI, Python, motor (async MongoDB)
- **Database**: MongoDB

## CRITICAL: Railway Backend Issue
I tested the Railway backend directly and confirmed it does NOT return `league_image` in responses. The code here is correct but Railway is running an old version. A `Procfile` has been added to force `uvicorn server:app`. The frontend now has a LOCAL IMAGE CACHE workaround using AsyncStorage - when you create a league with an image, the image is saved locally on your phone and displayed from cache even if the backend doesn't return it.

## Latest Fixes (Mar 12, 2026 - Session 2, Round 2)
1. **League image local cache** - Images saved to AsyncStorage on create, loaded from cache on home page. Works regardless of backend version.
2. **Start Round button** - Fixed duplicate backgroundColor bug (cream was overriding). Now white + dark border.
3. **Song search X button** - Lowered close button from status bar area
4. **Procfile added** - `web: uvicorn server:app --host 0.0.0.0 --port ${PORT:-8001}` for Railway
5. **Backend _id exclusion** - All MongoDB queries exclude _id for proper serialization

## Key Files
- Backend: `/app/backend/server.py`, `/app/backend/main.py`, `/app/backend/Procfile`
- Tabs: `_layout.tsx`, `home.tsx`, `discovery.tsx`, `add.tsx`, `inbox.tsx`, `profile.tsx`
- Screens: `round/[id].tsx`, `league/[id].tsx`
- API: `src/services/api.ts`
- SharedChat: `src/components/SharedChat.tsx`

## Backlog
- **P1**: WebSocket for real-time chat
- **P2**: Password reset via email
- **P2**: Refactor monolithic files
