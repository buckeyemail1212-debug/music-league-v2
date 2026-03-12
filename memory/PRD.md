# Music League - Product Requirements Document

## 5-Tab Navigation
1. **Home** - Leagues with image/initial, active round timers
2. **Discover** - Deezer song search with 30s previews
3. **Add** (raised center button, 60px) - Popup: Create League or Join League
4. **Inbox** - League chats with latest message preview, full inline chat
5. **Profile** - User stats, logout (no delete account)

## Implemented Features

### Core
- JWT auth, league CRUD, round management, timezone-aware deadlines
- N-1 voting, tie handling, auto-distribution, confetti on results
- Deezer search with Spotify/Apple Music/YouTube links
- League chat with polling

### Latest Changes (Feb 2026)
- **Add button**: bigger (60px), dark navy, popup-style cards (not own page)
- **Inbox**: fixed `getLeagueMessages` call (was 404), latest message preview, full inline chat
- **League page**: code in header (copiable), chat preview bar with latest message
- **Chat**: green send button with white icon, KeyboardAvoidingView, tap to dismiss
- **Profile**: removed delete account, logout only
- **Spacing**: banners have proper marginTop from X/X text
- **League icons**: show image or name initial (not trophy)
- **All user data cleared**

## Key Files
- Backend: `/app/backend/server.py`, `/app/backend/main.py`
- Tabs: `_layout.tsx`, `home.tsx`, `discovery.tsx`, `add.tsx`, `inbox.tsx`, `profile.tsx`
- Screens: `round/[id].tsx`, `league/[id].tsx`
- API: `src/services/api.ts`

## Backlog
- P2: Real password reset, refactor large files
