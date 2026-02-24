# Music League - Product Requirements Document

## Original Problem Statement
Create a mobile app called "Music League" - a "fantasy sports for music" game where users join leagues, submit songs to themed rounds, and vote on submissions.

## Product Overview
A "fantasy sports for music" app where users join leagues, submit songs to rounds based on a theme, and vote on each other's submissions.

## Core Features (Implemented)
- **Authentication**: JWT-based custom auth with email/username/password
- **Song Search**: Deezer API integration for song search and 30-second previews
- **Leagues**: Create leagues, join with code (locked after first round starts), league chat
- **Rounds**: Submission phase, voting phase, results phase with auto-advancing timers
- **Submission Locking**: "Lock It In" feature for both submissions and votes
- **Results & Standings**: 100-point pool voting system with mean scores and std deviation tie-breaking
- **Shareable Results**: Generate shareable image of final results
- **Profile**: User profile with photo upload, stacked member avatars on home page
- **Deep Links**: Shareable league codes that generate deep links

## Technical Stack
- **Frontend**: React Native, Expo, Expo Router, TypeScript
- **Backend**: FastAPI, Python, Pydantic
- **Database**: MongoDB (via motor async driver)
- **Authentication**: JWT with 7-day expiry

## Deployment Status (Always-On)
- **Backend**: Railway - https://amiable-learning-production.up.railway.app
- **Database**: MongoDB on Railway
- **Frontend**: Expo - Published via eas-cli from user's Mac
- **Expo Project ID**: dd76a4f6-d539-4b42-8ac7-ed5dd9aa920b

## Key Files
- `/app/frontend/src/context/AuthContext.tsx` - Authentication logic (hardcoded Railway URL)
- `/app/frontend/src/services/api.ts` - API service layer (hardcoded Railway URL as fallback)
- `/app/frontend/app/round/[id].tsx` - Round detail screen (submission/voting/results)
- `/app/frontend/app/league/[id].tsx` - League detail screen
- `/app/frontend/app/(tabs)/home.tsx` - Home screen with leagues list
- `/app/backend/main.py` - FastAPI backend (all routes, renamed from server.py for Railway)

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
4. User runs `npx eas-cli update --channel production` to publish to Expo

## Bug Fixes Applied (December 2025)
- **FIXED**: `TypeError: undefined is not an object (evaluating 'round.total_members')` crash
  - Root cause: Race condition when navigating to round screen; state not properly reset
  - Solution: Reset loading and round state at start of fetchData(); added null checks; defined missing `userSubmission` variable

## Areas Needing Refactoring
- Backend URL hardcoded in frontend (should use .env properly)
- `main.py` is monolithic - could be split into routes/models/utils
- Large component files could be broken down

## Date
December 2025

## Notes
- Backend and database are permanently hosted on Railway (independent of Emergent)
- The Expo frontend must be republished from user's local machine after code changes
- Backend auto-deploys when code is pushed to GitHub
