"""
Spotify Web API helper — Client Credentials flow with token caching.

Used by /api/songs/search. Falls back to a None client when credentials are
missing so callers can degrade gracefully (Deezer backup).
"""

import logging
import os
import threading
from typing import Optional

logger = logging.getLogger(__name__)

try:
    import spotipy
    from spotipy.oauth2 import SpotifyClientCredentials
except ImportError:  # spotipy not installed yet (e.g. local dev before pip install)
    spotipy = None
    SpotifyClientCredentials = None


_client_lock = threading.Lock()
_client: Optional["spotipy.Spotify"] = None
_creds_checked = False


def get_spotify_client() -> Optional["spotipy.Spotify"]:
    """
    Return a cached spotipy.Spotify client, or None if credentials are missing
    or spotipy isn't installed. The SpotifyClientCredentials auth manager
    handles access-token caching and auto-refresh on expiry (1h tokens).
    """
    global _client, _creds_checked

    if _client is not None:
        return _client

    with _client_lock:
        if _client is not None:
            return _client

        if spotipy is None:
            if not _creds_checked:
                logger.warning("spotipy not installed; Spotify search disabled")
                _creds_checked = True
            return None

        client_id = os.environ.get("SPOTIFY_CLIENT_ID", "").strip()
        client_secret = os.environ.get("SPOTIFY_CLIENT_SECRET", "").strip()

        if not client_id or not client_secret:
            if not _creds_checked:
                logger.warning(
                    "SPOTIFY_CLIENT_ID/SPOTIFY_CLIENT_SECRET not set; "
                    "song search will fall back to Deezer"
                )
                _creds_checked = True
            return None

        try:
            auth = SpotifyClientCredentials(
                client_id=client_id,
                client_secret=client_secret,
            )
            _client = spotipy.Spotify(auth_manager=auth, requests_timeout=10)
            logger.info("Spotify client initialized (Client Credentials flow)")
        except Exception as e:
            logger.error(f"Failed to initialize Spotify client: {type(e).__name__}: {e}")
            return None

        _creds_checked = True
        return _client


def search_tracks(q: str, limit: int = 20) -> list[dict]:
    """
    Search Spotify for tracks. Returns the raw `tracks.items` list (empty if
    no client or no results). Always passes market='US' — Spotify's search
    rejects market=None (returns 400 "Invalid limit", confusingly) and US is
    our primary user base; this also filters out tracks unplayable in-market.
    Limit is clamped to Spotify's accepted range [1, 50] and forced to int
    in case it arrives from a query string as a numeric str.
    """
    sp = get_spotify_client()
    if sp is None:
        return []
    safe_limit = max(1, min(int(limit), 50))
    result = sp.search(q=q, type="track", limit=safe_limit, market="US")
    return ((result or {}).get("tracks", {}) or {}).get("items", []) or []


def map_spotify_track(track: dict) -> dict:
    """
    Map a Spotify track object to the existing search response shape.

    The frontend Song interface uses these field names (api.ts:25):
        deezer_id, title, artist, album, preview_url, cover_url, duration

    We keep the same keys so no frontend change is needed. `deezer_id` now
    carries a Spotify track ID (string like "1A2GTWGtFfWp7KSQTwWOyo") for
    newly-searched songs; existing Deezer-ID rows in the DB are unaffected.
    """
    album = track.get("album") or {}
    images = album.get("images") or []
    # Spotify returns images largest-first: [640x640, 300x300, 64x64]
    # Frontend used Deezer's cover_medium (~250px) and upscales via getHighResCover;
    # picking the 300x300 (index 1) keeps payload sane and matches prior visual size.
    cover = ""
    if images:
        cover = (images[1].get("url") if len(images) > 1 else images[0].get("url")) or ""

    artists = track.get("artists") or []
    artist_name = ", ".join(a.get("name", "") for a in artists if a.get("name"))

    duration_ms = track.get("duration_ms") or 0
    duration_sec = int(round(duration_ms / 1000)) if duration_ms else 30

    return {
        "deezer_id":   track.get("id", ""),
        "title":       track.get("name", ""),
        "artist":      artist_name,
        "album":       album.get("name", ""),
        "preview_url": track.get("preview_url") or "",
        "cover_url":   cover,
        "duration":    duration_sec,
    }
