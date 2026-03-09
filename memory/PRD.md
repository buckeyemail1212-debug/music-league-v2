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
- **Rounds**: Submission phase, voting phase, results phase with date/time picker
- **Date/Time Picker**: Scroll-based time picker with timezone support (EST, CST, MST, PST)
- **Submission Locking**: "Lock It In" feature for both submissions and votes
- **Results & Standings**: 100-point pool voting system with mean scores and std deviation tie-breaking
- **Shareable Results**: Generate shareable image of final results
- **Profile**: User profile with photo upload, long-press to zoom, delete account option
- **Tab Navigation**: Home, Join, Music (renamed from Discovery), Profile

## Technical Stack
- **Frontend**: React Native, Expo, Expo Router, TypeScript
- **Backend**: FastAPI, Python, Pydantic
- **Database**: MongoDB (via motor async driver)
- **Authentication**: JWT with 7-day expiry
- **Date Picker**: @react-native-community/datetimepicker

## Deployment Status (Always-On)
- **Backend**: Railway - https://amiable-learning-production.up.railway.app
- **Database**: MongoDB on Railway
- **Frontend**: Expo - Published via eas-cli from user's Mac
- **Expo Project ID**: dd76a4f6-d539-4b42-8ac7-ed5dd9aa920b

## Key Files
- `/app/frontend/src/context/AuthContext.tsx` - Authentication logic
- `/app/frontend/src/services/api.ts` - API service layer
- `/app/frontend/app/round/[id].tsx` - Round detail screen (submission/voting/results)
- `/app/frontend/app/league/[id].tsx` - League detail screen with members modal
- `/app/frontend/app/(tabs)/home.tsx` - Home screen with leagues list
- `/app/frontend/app/(tabs)/join.tsx` - Join league page
- `/app/frontend/app/(auth)/forgot-password.tsx` - Delete account & start fresh
- `/app/backend/main.py` - FastAPI backend (all routes)

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

## Recent Updates (February 2025)
1. **Phone Number on Signup** - Added phone field for account recovery
2. **"Can't access your account?"** - Delete account with email + phone to re-register
3. **Date/Time Picker** - Replaced duration dropdowns with scrollable date/time picker
4. **Timezone Support** - EST, CST, MST, PST options for round deadlines
5. **Tab Navigation Updates** - Added "Join" tab, renamed "Discovery" to "Music"
6. **Copy Code** - Replaced share link with copy to clipboard
7. **Members Modal** - Person icon in league header shows all members
8. **Music Links Everywhere** - Spotify, YouTube, Apple Music links on all song displays
9. **Play Buttons Everywhere** - 30-second preview playable on all screens including results
10. **Profile Photo Zoom** - Long press profile photo on home to view full size
11. **Delete Account** - Added delete account option in profile settings
12. **Chat Keyboard Fix** - Input stays above keyboard when typing

## Bug Fixes Applied
- **FIXED**: `TypeError: round.total_members` crash - proper state management
- **FIXED**: Backend datetime comparison issues - timezone handling
- **FIXED**: MongoDB `_id` serialization errors - excluded from responses

## Date
February 2025
