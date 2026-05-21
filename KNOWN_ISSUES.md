# Known Issues — Music Leeg

## Logged 2026-05-21

### ~~1. Heart unlike requires long-press~~ FIXED 2026-05-21
- Root cause: LikedSongsTab subscriber called load() which routed through apiCache.swr and returned stale data, overwriting the optimistic setSongs(filter) in onUnlike.
- Fix: subscriber now calls setSongs(getCachedLikedSongs(userId)) directly, reading from the in-memory cache instead of triggering a refetch.
- Earlier gesture-conflict hypothesis (Pressable + hitSlop) was wrong. Bug was a state-sync race, not a touch event issue.

### 2. Full-screen loader flash on league detail
- File: `frontend/app/league/[id].tsx` lines 643-649
- Symptom: Brief purple ActivityIndicator takeover (~500ms) when navigating into a league.
- Diagnosis: `if (loading && !dataLoaded.current)` block returns full-screen spinner before render.
- Full fix requires: Adding `?.` null guards to 20+ `league.X` references throughout the file, plus null checks in handler functions.
- Defer to: Focused refactor session.

### 3. Background 403s in Expo log
- File: `frontend/app/league/[id].tsx` useFocusEffect
- Symptom: 403 errors print to Expo console when Profile loads, for leagues the user no longer has access to (deleted/removed/made private).
- User-facing impact: None (alert popup fixed earlier today)
- Cause: Stale league detail screens remain in nav stack and refire useFocusEffect on any focus change.
- Full fix requires: Removing screens from nav stack when user loses access — interacts with React Navigation's stack management.
- Defer to: Future architectural session.
