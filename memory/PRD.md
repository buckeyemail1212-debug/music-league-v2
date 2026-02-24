# Music League - Product Requirements Document

## Original Problem Statement
Create a mobile app called "Music League". It has three pages: home, discovery, and profile. Users sign in to create or join leagues.

## Product Overview
A "fantasy sports for music" app where users join leagues, submit songs to rounds based on a theme, and vote on each other's submissions.

## Core Features (Implemented)
- **Authentication**: JWT-based custom auth with email/username/password
- **Song Search**: Deezer API integration for song search and 30-second previews
- **Leagues**: Create leagues, join with code, league chat
- **Rounds**: Submission phase, voting phase, results phase with timers
- **Results & Standings**: Ranked results with tie handling, cumulative leaderboard
- **Shareable Results**: Generate shareable image of final results
- **Profile**: User profile with photo upload

## Technical Stack
- **Frontend**: React Native, Expo, Expo Router, TypeScript
- **Backend**: FastAPI, Python, Pydantic
- **Database**: MongoDB (via motor async driver)
- **Authentication**: JWT with secret key from environment variable

## Deployment Status
- **Backend**: Running on Emergent preview server (https://vote-and-play.preview.emergentagent.com)
- **Frontend**: Published to Expo (https://expo.dev/accounts/puchalski.12/projects/music-league)
- **QR Code**: Permanent QR code available for sharing via Expo Go app

## Key Files
- `/app/frontend/src/context/AuthContext.tsx` - Authentication logic
- `/app/frontend/src/services/api.ts` - API service layer
- `/app/backend/server.py` - FastAPI backend
- `/app/frontend/app.json` - Expo configuration

## Environment Variables
- `EXPO_PUBLIC_BACKEND_URL` - Backend API URL
- `JWT_SECRET` - JWT signing secret
- `MONGO_URL` - MongoDB connection string
- `DB_NAME` - Database name

## Publishing History
- v1.0 - Initial publish (backend URL missing)
- v1.1 - Added .env file with backend URL
- v1.2 - Hardcoded fallback API URL in source files (WORKING)

## User Account
- Expo username: puchalski.12
- Project: music-league

## Date
February 12, 2026

## Notes
- The app uses Expo Go for distribution (no App Store/TestFlight yet)
- Backend runs on Emergent preview which may sleep during inactivity
- For permanent always-on backend, would need separate hosting (Railway, Render, etc.)
