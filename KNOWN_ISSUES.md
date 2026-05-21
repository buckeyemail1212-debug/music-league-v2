# Known Issues — Music Leeg

## Logged 2026-05-21

### 1. Heart unlike requires long-press
- File: `frontend/src/components/profile-tabs/LikedSongsTab.tsx`
- Symptom: Quick tap on heart button does nothing. Long-press eventually triggers unlike but the song briefly disappears then reappears.
- Diagnosis: Gesture conflict inside parent ScrollView. Pressable + larger hitSlop fix attempted but did not resolve.
- Workaround for users: Long-press to unlike.
- Next session: Add instrumentation logs to confirm where the tap is being intercepted. Consider testing the component outside ScrollView to isolate.

### 2. Full-screen loader flash on league detail
- File: `frontend/app/league/[id].tsx` lines 643-649
- Symptom: Brief purple ActivityIndicator takeover (~500ms) when navigating into a league.
- Diagnosis: `if (loading && !dataLoaded.current)` block returns full-screen spinner before render.
- Full fix requires: Adding `?.` null guards to 20+ `league.X` references throughout the file, plus null checks in handler functions.
- Defer to: Focused refactor session.

### 3. Background 403s in Expo log
- File: `frontend/app/league/[id].tsx` useFocusEffect
- Symptom: 403 errors print to Expo console when Profile loads, for leagues the user no longer has access to (deleted/removed/made private).
- User-facing impact: None (alert popup fixed in commit a21a0134-ish, see git log for "Silence 403/404 alert on stale league detail screens")
- Cause: Stale league detail screens remain in nav stack and refire useFocusEffect on any focus change.
- Full fix requires: Removing screens from nav stack when user loses access — interacts with React Navigation's stack management.
- Defer to: Future architectural session.
