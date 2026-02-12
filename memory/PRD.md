# Music League - Product Requirements Document

## Original Problem Statement
Create a mobile app called "Music League". It has three pages: home, discovery, and profile. Users sign in to create or join leagues.

## Core Features
A "fantasy sports for music" app where users:
- Join leagues and create or join with a code
- Submit songs to rounds based on a theme
- Vote on each other's submissions
- Compete for points based on rankings

## Technical Stack
- **Frontend**: React Native, Expo, TypeScript
- **Backend**: FastAPI, Python
- **Database**: MongoDB
- **Authentication**: JWT stored in AsyncStorage

## Design System - Neutral Blue/Slate Palette
- **Background**: Dark slate (`#212F36`)
- **Containers/Cards**: Mid-dark blue (`#4A6070`) with border `#5A7080`, `12px` border radius
- **Primary Buttons**: Off-white/cream (`#F9FCF2`) with dark text/icons (`#212F36`)
- **Accents/Icons**: Muted sage green (`#B8C5B0`)
- **Text**: Headlines cream (`#F9FCF2`), subtext grey-green (`#8DA19B`)
- **Navigation**: Dark slate tabs with active icon in cream

## Completed Features
- [x] JWT-based authentication with autofill disabled
- [x] League creation/joining with invite codes
- [x] Round management (Submission → Voting → Results phases)
- [x] Song search via Deezer API with 30-second previews
- [x] Audio playback stops on navigation
- [x] Countdown timers (timezone-aware)
- [x] Tie-handling for rankings and standings
- [x] Cumulative league standings
- [x] League chat with auto-refresh and unread indicators
- [x] Shareable results card (image export)
- [x] Profile photo persistence across sessions
- [x] Complete UI/UX overhaul to Neutral Blue/Slate theme
- [x] UI color visibility fixes (Dec 2025)

## Latest Changes (December 2025)
- Fixed result card highlighting (removed yellow background)
- Fixed points text visibility on result cards
- Fixed button text/icon colors on cream buttons throughout app
- Fixed chat message text and send button colors
- **Fixed "Voting" status pill** - Changed from orange to cream background with dark text
- **Fixed tab icons** - Changed Rounds flag and Standings trophy from purple to theme colors (cream when active, grey-green when inactive)
- **Fixed loading indicators** - Changed from purple to sage green (#B8C5B0)
- **Fixed refresh control tint** - Changed from purple to sage green
- **Fixed play button in song search modal** - Icon now uses dark color for visibility

## Known Issues
None currently.

## Future Backlog
- Backend refactoring: Split `server.py` into routes/models/services
- Frontend refactoring: Extract complex logic from `league/[id].tsx` and `round/[id].tsx` into custom hooks

## Key Files
- `/app/frontend/app/league/[id].tsx` - League detail, chat, standings
- `/app/frontend/app/round/[id].tsx` - Round gameplay (submit, vote, results)
- `/app/backend/server.py` - All API endpoints
- `/app/frontend/src/services/api.ts` - API client
