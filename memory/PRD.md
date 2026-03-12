# Music League - Product Requirements Document

## Original Problem Statement
Build a "Music League" mobile app - "fantasy sports for music" game using Expo (React Native) and FastAPI.

## 5-Tab Navigation Layout
1. **Home** - Your leagues with image/initial, active round timers
2. **Discover** - Deezer song search with 30s previews
3. **Add** (raised center button) - Popup with Create League or Join League
4. **Inbox** - All league chats with latest message preview, full inline chat
5. **Profile** - User settings, stats, account management

## What's Been Implemented

### Core Features
- JWT auth with display name + phone number
- League CRUD with custom images (camera + gallery)
- Round management with timezone-aware deadlines
- N-1 voting point system with tie handling, auto-distribution
- Deezer song search with Spotify/Apple Music/YouTube links
- League chat with real-time polling
- Confetti on results page

### Latest Session Changes (Feb 2026)
- **Add button → popup** (not its own page), Create League with round circles (1-10, 5 per row), Join League with code input
- **Plus button color** → dark navy matching nav bar
- **Removed chat icon** from home page league cards
- **League page**: moved code to header (still copiable), replaced code bar with chat preview showing latest message
- **Inbox**: shows latest message per league, full inline chat on tap (no league redirect)
- **Delete account** fixed (now cleans up chat messages and league data)
- **Spacing fixes**: banners have proper marginTop from X/X text
- **Send button** visible (green with white icon)
- **Keyboard dismiss** on tap, proper KeyboardAvoidingView on chat
- **League icon** shows image or initial (not trophy)
- **All user data cleared** per user request

### Testing
- 20/20 backend tests passed
- Delete account verified working

## Key Files
- Backend: `/app/backend/server.py`, `/app/backend/main.py`
- Tabs: `_layout.tsx`, `home.tsx`, `discovery.tsx`, `add.tsx`, `inbox.tsx`, `profile.tsx`
- Screens: `round/[id].tsx`, `league/[id].tsx`

## Backlog
- P2: Real password reset, refactor monolithic files, Expo EAS republish
