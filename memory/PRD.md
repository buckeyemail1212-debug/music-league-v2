# Music League - Product Requirements Document

## Original Problem Statement
Create a mobile app called "Music League" - a "fantasy sports for music" game where users join leagues, submit songs to themed rounds, and vote on submissions.

## Product Overview
A "fantasy sports for music" app where users join leagues, submit songs to rounds based on a theme, and vote on each other's submissions.

## Core Features (Implemented)
- **Authentication**: JWT-based custom auth with email/username/password/phone
- **Phone Number Recovery**: Users can delete account with email + phone to re-register
- **Song Search**: Deezer API integration for song search and 30-second previews
- **Song Preview**: Playable 30-second previews on all screens with music links (Spotify, YouTube, Apple Music)
- **Leagues**: Create leagues, join with code (locked after first round starts), league chat
- **Members Modal**: View all league members with avatars and "Creator" badge
- **Copy Code**: Tap league code to copy to clipboard
- **Rounds**: Submission phase, voting phase, results phase with timezone-aware deadlines
- **Timezone-Aware Deadlines**: "Same clock time tomorrow" logic handles DST correctly. Users select EST or PST when creating rounds.
- **Submission Locking**: "Lock It In" feature for both submissions and votes
- **Results & Standings**: 100-point pool voting system with mean scores and std deviation tie-breaking
- **Shareable Results**: Generate shareable image of final results
- **Profile**: User profile with photo upload, long-press to zoom, delete account option
- **Tab Navigation**: Home, Join, Music (renamed from Discovery), Profile

## Technical Stack
- **Frontend**: React Native, Expo, Expo Router, TypeScript
- **Backend**: FastAPI, Python, Pydantic, pytz, python-dateutil
- **Database**: MongoDB (via motor async driver)
- **Authentication**: JWT with 7-day expiry
- **Timezone Handling**: ZoneInfo + dateutil.relativedelta for DST-safe "same clock time" calculations

## Deployment Status (Always-On)
- **Backend**: Railway - https://amiable-learning-production.up.railway.app
- **Database**: MongoDB on Railway
- **Frontend**: Expo - Published via eas-cli from user's Mac
- **Expo Project ID**: dd76a4f6-d539-4b42-8ac7-ed5dd9aa920b

## Key Files
- `/app/frontend/src/context/AuthContext.tsx` - Authentication logic
- `/app/frontend/src/services/api.ts` - API service layer
- `/app/frontend/app/round/[id].tsx` - Round detail screen (submission/voting/results)
- `/app/frontend/app/league/[id].tsx` - League detail screen with members modal, timezone selector
- `/app/frontend/app/(tabs)/home.tsx` - Home screen with leagues list
- `/app/frontend/app/(tabs)/join.tsx` - Join league page
- `/app/frontend/app/(auth)/forgot-password.tsx` - Delete account & start fresh
- `/app/backend/main.py` - FastAPI backend (Railway deployment)
- `/app/backend/server.py` - FastAPI backend (local development - MUST be synced with main.py)

## Environment Variables
### Backend (.env)
- `JWT_SECRET` - JWT signing secret
- `MONGO_URL` - MongoDB connection string (Railway MongoDB)
- `DB_NAME` - Database name

### Frontend (.env - user must create locally)
- `EXPO_PUBLIC_BACKEND_URL` - Backend API URL

## Workflow for Updates
1. Agent modifies code in Emergent environment
2. Code is automatically saved to GitHub
3. User downloads new code to their Mac
4. User runs `npx eas-cli update --branch preview --message "version"` to publish to Expo

## Recent Updates (March 2025)
1. **DST-Aware Deadlines** - Implemented "same clock time tomorrow" logic using `relativedelta(days=N)` instead of `timedelta(hours=24*N)`. This ensures a "1 day" deadline ends at the same local clock time, correctly handling Daylight Saving Time transitions.
2. **Timezone Selector UI** - Added EST/PST toggle in the "Start Round" modal so users can specify their timezone when creating rounds.
3. **Auto-detect Timezone** - The app now auto-detects the user's device timezone and pre-selects EST or PST accordingly when creating rounds.
4. **Custom League Images** - League creators can now upload a custom image (camera or gallery) for their league that displays on the home page instead of the default trophy icon.
5. **Display Name** - Added display name field to registration. "Welcome back" now shows the user's display name instead of username.
6. **Join League UI** - Fixed "Enter League Code" text size, removed checkmark icon from button.
7. **Active Leagues Text** - Properly capitalized and handles singular/plural ("Active League" vs "Active Leagues").
8. **Reopen Submission Feature** - League creators can grant a 2-hour extension window to specific users who missed the submission deadline (during voting phase). Once they submit, the extension is removed and voting deadline stays the same.

## Previous Updates (February 2025)
1. **Phone Number on Signup** - Added phone field for account recovery
2. **"Can't access your account?"** - Delete account with email + phone to re-register
3. **Tab Navigation Updates** - Added "Join" tab, renamed "Discovery" to "Music"
4. **Copy Code** - Replaced share link with copy to clipboard
5. **Members Modal** - Person icon in league header shows all members
6. **Music Links Everywhere** - Spotify, YouTube, Apple Music links on all song displays
7. **Play Buttons Everywhere** - 30-second preview playable on all screens including results
8. **Profile Photo Zoom** - Long press profile photo on home to view full size
9. **Delete Account** - Added delete account option in profile settings
10. **Chat Keyboard Fix** - Input stays above keyboard when typing

## Bug Fixes Applied
- **FIXED**: `TypeError: round.total_members` crash - proper state management
- **FIXED**: Backend datetime comparison issues - timezone handling
- **FIXED**: MongoDB `_id` serialization errors - excluded from responses
- **FIXED**: DST deadline calculation - using relativedelta for calendar day calculations

## Future Tasks / Backlog
- **Real Password Reset**: Integrate email (SendGrid) or SMS (Twilio) for proper password reset instead of the "Delete & Start Fresh" workaround
- **Code Refactoring**: Break down monolithic files (`main.py`/`server.py`, `league/[id].tsx`, `round/[id].tsx`) into smaller modules

## Critical Notes for Developers
- **ALWAYS sync `main.py` and `server.py`** - Railway deploys `main.py`, but local dev uses `server.py`. Any backend changes must be applied to both files.
- **Expo Go Compatibility** - Do not add native module dependencies. All packages must be JavaScript-only.

## Date
March 2025
