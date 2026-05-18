from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import json
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional
import re
import uuid
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from dateutil.relativedelta import relativedelta
from passlib.context import CryptContext
from jose import JWTError, jwt
import asyncio
import time
import httpx
import requests as _requests
import billboard
import random
import string

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'music_league')]

# JWT Settings
SECRET_KEY = os.environ['JWT_SECRET']
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

# Twilio SMS settings
TWILIO_ACCOUNT_SID = os.environ.get('TWILIO_ACCOUNT_SID', '')
TWILIO_AUTH_TOKEN = os.environ.get('TWILIO_AUTH_TOKEN', '')
TWILIO_PHONE_NUMBER = os.environ.get('TWILIO_PHONE_NUMBER', '')

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Security
security = HTTPBearer()

# Create the main app
app = FastAPI(title="Music League API")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ==================== LIFETIME STATS + TASTE CATEGORIZATION ====================
#
# Running counters live on the user document and never decrease when a league
# is deleted. A durable ``user_submissions`` collection mirrors every song a
# user has ever submitted together with its resolved genre category so the
# profile "Your Taste" breakdown is based on lifetime history independent of
# active/deleted leagues.

TASTE_CATEGORIES = ["Pop", "Hip-Hop", "R&B", "Country", "Rock", "Electronic", "Indie", "Other"]

# Map Deezer genre ids (https://api.deezer.com/genre) to our 8 categories.
_DEEZER_GENRE_TO_CATEGORY: dict[int, str] = {
    132: "Pop",
    116: "Hip-Hop",
    152: "Rock",
    464: "Rock",
    165: "R&B",
    169: "R&B",
    197: "R&B",
    113: "Electronic",
    106: "Electronic",
    84:  "Country",
    85:  "Indie",
    153: "Other",  # Blues
    129: "Other",  # Jazz
    144: "Other",  # Reggae
    173: "Other",  # Films/Games
    219: "Other",  # Asian Music
    466: "Other",  # Latin
    753: "Other",  # Folk
}

_genre_cache: dict[int, str] = {}  # deezer_id -> category


def _categorize_by_genre_id(genre_id: int) -> str:
    if genre_id is None:
        return "Other"
    return _DEEZER_GENRE_TO_CATEGORY.get(int(genre_id), "Other")


def _category_from_genre_name(name: str) -> str:
    """Normalize a Deezer genre name string into one of our categories."""
    if not name:
        return "Other"
    n = name.lower()
    if "rap" in n or "hip" in n or "trap" in n or "drill" in n:
        return "Hip-Hop"
    if "r&b" in n or "soul" in n or "funk" in n or "rnb" in n:
        return "R&B"
    if "country" in n or "bluegrass" in n or "americana" in n:
        return "Country"
    if "electro" in n or "dance" in n or "house" in n or "techno" in n or "edm" in n or "trance" in n or "dubstep" in n:
        return "Electronic"
    if "indie" in n or "alternative" in n or "alt-rock" in n:
        return "Indie"
    if "rock" in n or "metal" in n or "punk" in n or "grunge" in n:
        return "Rock"
    if "pop" in n:
        return "Pop"
    return "Other"


# Hardcoded artist → category map. Matched case-insensitively against the
# Deezer artist name. These are authoritative and bypass the Deezer genre
# lookup entirely — Deezer often returns a generic or empty genre for very
# popular artists.
_ARTIST_CATEGORY: dict[str, str] = {
    # Hip-Hop
    "eminem": "Hip-Hop",
    "drake": "Hip-Hop",
    "kendrick lamar": "Hip-Hop",
    "kanye west": "Hip-Hop",
    "ye": "Hip-Hop",
    "jay-z": "Hip-Hop",
    "lil wayne": "Hip-Hop",
    "travis scott": "Hip-Hop",
    "cardi b": "Hip-Hop",
    "nicki minaj": "Hip-Hop",
    "post malone": "Hip-Hop",
    "j. cole": "Hip-Hop",
    "j cole": "Hip-Hop",
    "future": "Hip-Hop",
    "21 savage": "Hip-Hop",
    "tyler, the creator": "Hip-Hop",
    "asap rocky": "Hip-Hop",
    "a$ap rocky": "Hip-Hop",
    "megan thee stallion": "Hip-Hop",
    "doja cat": "Hip-Hop",
    "snoop dogg": "Hip-Hop",
    "dr. dre": "Hip-Hop",
    "50 cent": "Hip-Hop",
    "ice cube": "Hip-Hop",
    "2pac": "Hip-Hop",
    "notorious b.i.g.": "Hip-Hop",
    "the notorious b.i.g.": "Hip-Hop",
    "nas": "Hip-Hop",
    "run the jewels": "Hip-Hop",
    "lil baby": "Hip-Hop",
    "lil uzi vert": "Hip-Hop",
    "playboi carti": "Hip-Hop",
    "chance the rapper": "Hip-Hop",
    "juice wrld": "Hip-Hop",
    "xxxtentacion": "Hip-Hop",
    "dmx": "Hip-Hop",
    "busta rhymes": "Hip-Hop",
    "eazy-e": "Hip-Hop",
    "gucci mane": "Hip-Hop",
    "roddy ricch": "Hip-Hop",

    # Pop
    "taylor swift": "Pop",
    "ariana grande": "Pop",
    "dua lipa": "Pop",
    "katy perry": "Pop",
    "ed sheeran": "Pop",
    "justin bieber": "Pop",
    "bruno mars": "Pop",
    "harry styles": "Pop",
    "olivia rodrigo": "Pop",
    "billie eilish": "Pop",
    "lady gaga": "Pop",
    "miley cyrus": "Pop",
    "selena gomez": "Pop",
    "camila cabello": "Pop",
    "shawn mendes": "Pop",
    "the weeknd": "Pop",
    "adele": "Pop",
    "sabrina carpenter": "Pop",
    "charli xcx": "Pop",
    "demi lovato": "Pop",
    "one direction": "Pop",
    "chappell roan": "Pop",

    # R&B
    "beyoncé": "R&B",
    "beyonce": "R&B",
    "rihanna": "R&B",
    "sza": "R&B",
    "h.e.r.": "R&B",
    "her": "R&B",
    "usher": "R&B",
    "frank ocean": "R&B",
    "the-dream": "R&B",
    "alicia keys": "R&B",
    "john legend": "R&B",
    "mary j. blige": "R&B",
    "bryson tiller": "R&B",
    "summer walker": "R&B",
    "daniel caesar": "R&B",
    "kehlani": "R&B",
    "jhené aiko": "R&B",
    "jhene aiko": "R&B",
    "chris brown": "R&B",
    "trey songz": "R&B",
    "brandy": "R&B",
    "tems": "R&B",
    "miguel": "R&B",
    "giveon": "R&B",
    "brent faiyaz": "R&B",
    "khalid": "R&B",
    "anderson .paak": "R&B",
    "anderson paak": "R&B",

    # Country
    "luke combs": "Country",
    "morgan wallen": "Country",
    "blake shelton": "Country",
    "carrie underwood": "Country",
    "zach bryan": "Country",
    "luke bryan": "Country",
    "tim mcgraw": "Country",
    "keith urban": "Country",
    "kenny chesney": "Country",
    "kacey musgraves": "Country",
    "chris stapleton": "Country",
    "miranda lambert": "Country",
    "dolly parton": "Country",
    "johnny cash": "Country",
    "willie nelson": "Country",
    "shania twain": "Country",
    "garth brooks": "Country",
    "jason aldean": "Country",

    # Indie
    "radiohead": "Indie",
    "arctic monkeys": "Indie",
    "the strokes": "Indie",
    "tame impala": "Indie",
    "vampire weekend": "Indie",
    "the national": "Indie",
    "mitski": "Indie",
    "phoebe bridgers": "Indie",
    "father john misty": "Indie",
    "bon iver": "Indie",
    "fleet foxes": "Indie",
    "mgmt": "Indie",
    "the 1975": "Indie",
    "lana del rey": "Indie",
    "big thief": "Indie",
    "arcade fire": "Indie",
    "beach house": "Indie",
    "sufjan stevens": "Indie",
    "mac demarco": "Indie",
    "alex g": "Indie",
    "clairo": "Indie",
    "weyes blood": "Indie",
    "car seat headrest": "Indie",

    # Electronic
    "daft punk": "Electronic",
    "calvin harris": "Electronic",
    "skrillex": "Electronic",
    "deadmau5": "Electronic",
    "flume": "Electronic",
    "disclosure": "Electronic",
    "odesza": "Electronic",
    "fred again..": "Electronic",
    "fred again": "Electronic",
    "four tet": "Electronic",
    "aphex twin": "Electronic",
    "the chemical brothers": "Electronic",
    "justice": "Electronic",
    "marshmello": "Electronic",
    "avicii": "Electronic",
    "tiësto": "Electronic",
    "tiesto": "Electronic",
    "david guetta": "Electronic",
    "swedish house mafia": "Electronic",
    "zedd": "Electronic",
    "kaytranada": "Electronic",
    "porter robinson": "Electronic",
    "kygo": "Electronic",
    "diplo": "Electronic",
    "major lazer": "Electronic",
    "alesso": "Electronic",
    "illenium": "Electronic",
    "rüfüs du sol": "Electronic",
    "rufus du sol": "Electronic",

    # Rock
    "ac/dc": "Rock",
    "acdc": "Rock",
    "metallica": "Rock",
    "foo fighters": "Rock",
    "nirvana": "Rock",
    "led zeppelin": "Rock",
    "queen": "Rock",
    "the beatles": "Rock",
    "the rolling stones": "Rock",
    "pink floyd": "Rock",
    "pearl jam": "Rock",
    "red hot chili peppers": "Rock",
    "guns n' roses": "Rock",
    "guns n roses": "Rock",
    "aerosmith": "Rock",
    "bon jovi": "Rock",
    "green day": "Rock",
    "blink-182": "Rock",
    "blink 182": "Rock",
    "weezer": "Rock",
    "soundgarden": "Rock",
    "audioslave": "Rock",
    "muse": "Rock",
    "coldplay": "Rock",
    "imagine dragons": "Rock",
    "twenty one pilots": "Rock",
    "paramore": "Rock",
    "u2": "Rock",
    "the killers": "Rock",
    "linkin park": "Rock",
}


def _category_from_artist(artist_name: str) -> str:
    """Exact/token match against the hardcoded artist → category map."""
    if not artist_name:
        return "Other"
    key = artist_name.strip().lower()
    if key in _ARTIST_CATEGORY:
        return _ARTIST_CATEGORY[key]
    # Featured-artist splits: "Artist feat. X", "A & B", "A, B"
    for sep in (" feat.", " ft.", " feat ", " ft ", " x ", " & ", ","):
        if sep in key:
            first = key.split(sep, 1)[0].strip()
            if first in _ARTIST_CATEGORY:
                return _ARTIST_CATEGORY[first]
    return "Other"


def _fetch_song_category(deezer_id, artist_hint: str = "", title_hint: str = "") -> str:
    """Best-effort lookup of a song's category.

    Precedence:
      1. Hardcoded artist → category map (instant, authoritative).
      2. Deezer track/album genre data.
      3. Keyword lookup against the artist/title string.

    Runs synchronously — callers should wrap with ``asyncio.to_thread``.
    """
    # Layer 1: hardcoded artist map — try hint first so we can short-circuit
    # without any network call when the caller already has the artist name.
    if artist_hint:
        cat = _category_from_artist(artist_hint)
        if cat != "Other":
            return cat

    if not deezer_id:
        # Fall back to keyword lookup on whatever we were given.
        return _category_from_genre_name(f"{artist_hint} {title_hint}")
    try:
        did = int(deezer_id)
    except (TypeError, ValueError):
        return _category_from_genre_name(f"{artist_hint} {title_hint}")
    if did in _genre_cache:
        return _genre_cache[did]

    cat = "Other"
    try:
        # Step 1: /track/{id} — album.genre_id is often usable.
        track = _requests.get(f"https://api.deezer.com/track/{did}", timeout=6).json() or {}
        album = track.get("album") or {}
        track_artist = (track.get("artist") or {}).get("name") or artist_hint
        track_title = track.get("title") or title_hint

        # Re-check the hardcoded map with the Deezer-reported artist name.
        if cat == "Other":
            from_map = _category_from_artist(track_artist)
            if from_map != "Other":
                cat = from_map

        if cat == "Other":
            genre_id = album.get("genre_id")
            if genre_id and int(genre_id) > 0:
                cat = _categorize_by_genre_id(genre_id)

        # Step 2: /album/{id} — has a richer genres.data list when genre_id is 0.
        if cat == "Other" and album.get("id"):
            alb = _requests.get(f"https://api.deezer.com/album/{album['id']}", timeout=6).json() or {}
            for g in ((alb.get("genres") or {}).get("data") or []):
                gid = g.get("id")
                if gid and int(gid) > 0:
                    mapped = _categorize_by_genre_id(gid)
                    if mapped != "Other":
                        cat = mapped
                        break
                name = g.get("name")
                if name:
                    mapped = _category_from_genre_name(name)
                    if mapped != "Other":
                        cat = mapped
                        break

        # Step 3: last-ditch keyword match on artist + title.
        if cat == "Other":
            guess = _category_from_genre_name(f"{track_artist} {track_title}")
            if guess != "Other":
                cat = guess
    except Exception as e:
        logger.debug(f"Deezer genre lookup failed for {did}: {e}")
        # Keyword fallback from hints if everything else failed.
        guess = _category_from_genre_name(f"{artist_hint} {title_hint}")
        if guess != "Other":
            cat = guess

    _genre_cache[did] = cat
    return cat


async def _record_user_submission(current_user: dict, round_doc: dict, submission: dict, league_doc: dict | None = None):
    """Insert or update the permanent user_submissions record for a submission.

    This collection is never purged when leagues are soft-deleted, so the
    profile "Your Taste" breakdown reflects true lifetime history.
    """
    song = submission.get("song") or {}
    category = await asyncio.to_thread(
        _fetch_song_category,
        song.get("deezer_id"),
        song.get("artist", ""),
        song.get("title", ""),
    )
    if league_doc is None:
        league_doc = await db.leagues.find_one({"id": round_doc["league_id"]})

    record = {
        "submission_id": submission["id"],
        "user_id": current_user["id"],
        "username": current_user.get("username", ""),
        "song": song,
        "genre": category,
        "league_id": round_doc.get("league_id"),
        "league_name": (league_doc or {}).get("name", ""),
        "round_id": round_doc["id"],
        "round_number": round_doc.get("round_number"),
        "round_theme": round_doc.get("theme"),
        "points": None,
        "submitted_at": submission.get("submitted_at") or datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }
    await db.user_submissions.update_one(
        {"submission_id": submission["id"]},
        {"$set": record,
         "$setOnInsert": {"finalized": False, "created_at": datetime.now(timezone.utc)}},
        upsert=True,
    )


async def _finalize_round_lifetime(round_id: str):
    """Update lifetime counters on every submitter's user doc once a round is
    marked completed. Idempotent via a round-level ``stats_finalized`` flag so
    repeat advance_round calls or auto-complete sweeps don't double-count.
    """
    round_doc = await db.rounds.find_one({"id": round_id})
    if not round_doc or round_doc.get("status") != "completed":
        return
    if round_doc.get("stats_finalized"):
        return

    submissions = await db.submissions.find({"round_id": round_id}).to_list(200)
    if not submissions:
        await db.rounds.update_one({"id": round_id}, {"$set": {"stats_finalized": True}})
        return
    votes = await db.votes.find({"round_id": round_id}).to_list(500)

    num_submissions = len(submissions)
    num_to_rank = max(0, num_submissions - 1)
    points: dict[str, int] = {s["id"]: 0 for s in submissions}
    sub_owners = {s["id"]: s["user_id"] for s in submissions}

    voters_who_voted = set()
    for v in votes:
        voters_who_voted.add(v.get("voter_id"))
        for idx, sid in enumerate(v.get("rankings", [])):
            if sid in points:
                points[sid] += (num_to_rank - idx)

    # Legacy rule: when a submitter didn't vote, redistribute their point
    # pool evenly across the other submissions. We only still apply this
    # for rounds that entered voting BEFORE the forfeit-pools change —
    # rounds stamped with `forfeit_missing_voter_pools` just drop the
    # missing voter's pool (per-spec, points are simply forfeit).
    if not round_doc.get("forfeit_missing_voter_pools"):
        submitter_ids = set(sub_owners.values())
        non_voters = submitter_ids - voters_who_voted
        if non_voters and num_submissions > 1:
            total_per_voter = sum(range(1, num_to_rank + 1))
            for nv_id in non_voters:
                nv_sub_id = next((s["id"] for s in submissions if s["user_id"] == nv_id), None)
                other_subs = [s["id"] for s in submissions if s["id"] != nv_sub_id]
                if other_subs:
                    base = total_per_voter // len(other_subs)
                    rem = total_per_voter % len(other_subs)
                    for sid in other_subs:
                        points[sid] += base
                    for i in range(rem):
                        points[other_subs[i]] += 1

    max_points = max(points.values()) if points else 0
    league_doc = await db.leagues.find_one({"id": round_doc["league_id"]})
    for sub in submissions:
        uid = sub["user_id"]
        pts = points.get(sub["id"], 0)
        won = (max_points > 0 and pts == max_points)

        inc = {"all_time_points": int(pts)}
        if won:
            inc["total_wins"] = 1
        await db.users.update_one({"id": uid}, {"$inc": inc})

        # Backfill user_submissions row if it's missing (legacy data) then
        # stamp final points so the taste/stats aggregations stay coherent.
        existing = await db.user_submissions.find_one({"submission_id": sub["id"]})
        if not existing:
            user_doc = await db.users.find_one({"id": uid})
            await _record_user_submission(
                {"id": uid, "username": (user_doc or {}).get("username", sub.get("username", ""))},
                round_doc,
                sub,
                league_doc,
            )
        await db.user_submissions.update_one(
            {"submission_id": sub["id"]},
            {"$set": {"points": int(pts), "finalized": True, "updated_at": datetime.now(timezone.utc)}},
        )

    await db.rounds.update_one({"id": round_id}, {"$set": {"stats_finalized": True}})


# ==================== MODELS ====================

class UserCreate(BaseModel):
    email: EmailStr
    username: str
    password: str
    phone_number: str = ""
    display_name: str = ""

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class ForgotPasswordRequest(BaseModel):
    phone_number: str

class VerifyCodeRequest(BaseModel):
    phone_number: str
    code: str

class ResetPasswordRequest(BaseModel):
    phone_number: str
    code: str
    new_password: str

class DeleteByCredentialsRequest(BaseModel):
    email: EmailStr
    phone_number: str

class UserResponse(BaseModel):
    id: str
    email: str
    username: str
    display_name: Optional[str] = None
    profile_photo: Optional[str] = None
    created_at: datetime

class UserUpdate(BaseModel):
    username: Optional[str] = None
    display_name: Optional[str] = None
    profile_photo: Optional[str] = None

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

# Allowed submission/voting durations for league creation (and any other
# place that accepts a user-chosen phase length). In hours:
#   12h, 1d, 2d, 3d, 7d.
ALLOWED_PHASE_HOURS: tuple[int, ...] = (12, 24, 48, 72, 168)


def _validate_phase_hours(field: str, value: Optional[int]) -> None:
    """Raise HTTPException(400) if `value` is set but isn't one of the
    allowed choices. Used by league-create and round-level endpoints so
    the validation lives in one place."""
    if value is not None and value not in ALLOWED_PHASE_HOURS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid {field}. Allowed values: {list(ALLOWED_PHASE_HOURS)}.",
        )

# Genre strings shown on public leagues are capped here. Matches the
# frontend's maxLength on the Genre input.
GENRE_MAX_LENGTH: int = 50


class LeagueCreate(BaseModel):
    name: str
    total_rounds: int = 3  # Number of rounds (1-10)
    league_image: Optional[str] = None  # Custom league image URL
    # Preferred default hours for each phase of each round in this league.
    # Must be one of ALLOWED_PHASE_HOURS when provided.
    submission_hours: Optional[int] = None
    voting_hours: Optional[int] = None
    # Optional per-round themes entered at league creation. Length should be
    # total_rounds when provided; entries may be blank strings when the creator
    # opted out of themes for a specific round.
    themes: Optional[List[str]] = None
    # Genre tag — optional for private leagues, required for public leagues.
    # Trimmed on the server; max 50 chars.
    genre: Optional[str] = None
    # Public-league fields. Private leagues ignore these.
    is_public: bool = False
    starts_at: Optional[datetime] = None  # When Round 1 auto-starts (public only)
    # Optional override for the public league member cap. When omitted we
    # use PUBLIC_MEMBER_CAP_DEFAULT. Validated to be within [10, PUBLIC_MEMBER_CAP_MAX].
    member_cap: Optional[int] = None

class LeagueResponse(BaseModel):
    id: str
    name: str
    league_code: str
    creator_id: str
    creator_username: str
    total_rounds: int
    league_image: Optional[str] = None
    members: List[dict]
    # Users who hit "Leave" mid-league. Their submissions/votes from
    # before they left stay in place; they're blocked from new ones.
    left_members: List[dict] = []
    current_round: int
    status: str
    created_at: datetime
    submission_hours: Optional[int] = None
    voting_hours: Optional[int] = None
    themes: Optional[List[str]] = None
    genre: Optional[str] = None
    is_public: bool = False
    starts_at: Optional[datetime] = None
    member_cap: Optional[int] = None

class JoinLeagueRequest(BaseModel):
    league_code: str

class StartRoundRequest(BaseModel):
    theme: str = ""  # Theme/prompt for this round
    # Fallback defaults mirror the Create League screen. Hours must be one
    # of ALLOWED_PHASE_HOURS — validated at the endpoint.
    submission_hours: int = 48
    voting_hours: int = 72
    timezone: str = "EST"  # User's timezone for "same time tomorrow" calculations

class SongData(BaseModel):
    deezer_id: int
    title: str
    artist: str
    album: str
    preview_url: str
    cover_url: str
    duration: int

class SubmitSongRequest(BaseModel):
    song: SongData
    locked: bool = False  # If true, submission is final

class SubmissionResponse(BaseModel):
    id: str
    round_id: str
    user_id: str
    username: str
    song: SongData
    locked: bool = False
    submitted_at: datetime

class VoteRequest(BaseModel):
    rankings: List[str]  # List of submission IDs in order (best to worst)
    locked: bool = False  # If true, vote is final and cannot be changed

class VoteResponse(BaseModel):
    id: str
    round_id: str
    user_id: str
    rankings: List[str]
    locked: bool
    created_at: datetime

class ReopenSubmissionRequest(BaseModel):
    user_id: str  # User ID to grant extended submission window

class RoundResponse(BaseModel):
    id: str
    league_id: str
    round_number: int
    theme: str
    # "locked" (future, not unlocked), "ready" (unlocked, creator can
    # start), "scheduled" (public league R1, auto-starts at `starts_at`),
    # "submission" (timer running), "voting", "completed", "skipped"
    # (no submissions).
    status: str
    # Fallback defaults kick in only for legacy docs missing the field;
    # every round created after these fields were introduced stores its
    # actual hours. Mirrors the Create League screen defaults.
    submission_hours: int = 48
    voting_hours: int = 72
    # Null for "locked" and "ready" rounds — no timer has been set.
    # Populated once the round transitions to "submission".
    submission_deadline: Optional[datetime] = None
    voting_deadline: Optional[datetime] = None
    # Only set for "scheduled" rounds (public-league R1). The timestamp at
    # which the scheduler flips the round into "submission".
    starts_at: Optional[datetime] = None
    submissions_count: int
    votes_count: int = 0  # Number of users who have voted
    total_members: int = 0  # Total members in the league
    has_user_submitted: bool
    has_user_voted: bool
    user_vote_locked: bool  # Whether user's vote is locked
    user_submission_locked: bool = False  # Whether user's submission is locked
    created_at: datetime
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + 'Z' if v.tzinfo else v.strftime('%Y-%m-%dT%H:%M:%SZ')
        }

class RoundResultResponse(BaseModel):
    id: str
    round_id: str
    rankings: List[dict]  # [{submission_id, song, user_id, username, points, rank}]
    winners: List[dict]  # List of winners (can be multiple in case of tie)
    is_tie: bool
    total_voters: int
    votes: List[dict] = []  # [{voter_id, voter_username, voter_profile_photo, rankings}]
    # League members who didn't submit this round. Shown on the results
    # screen as "X (no submission) — 0 pts" rows.
    non_submitters: List[dict] = []  # [{user_id, username, profile_photo}]

class LeagueStandingsResponse(BaseModel):
    league_id: str
    standings: List[dict]  # [{user_id, username, total_points, wins, rounds_played}]
    rounds_completed: int
    total_rounds: int

class MessageCreate(BaseModel):
    content: str

class MessageResponse(BaseModel):
    id: str
    league_id: str
    user_id: str
    username: str
    content: str
    created_at: datetime
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + 'Z' if v.tzinfo else v.strftime('%Y-%m-%dT%H:%M:%SZ')
        }

class ChatStatusResponse(BaseModel):
    has_unread: bool
    last_message_at: Optional[datetime] = None

# ==================== HELPER FUNCTIONS ====================

# Timezone mapping for "same clock time" calculations
TIMEZONE_MAP = {
    'EST': 'America/New_York',
    'EDT': 'America/New_York',
    'CST': 'America/Chicago',
    'CDT': 'America/Chicago',
    'MST': 'America/Denver',
    'MDT': 'America/Denver',
    'PST': 'America/Los_Angeles',
    'PDT': 'America/Los_Angeles',
}

def calculate_deadline(hours: int, user_timezone: str = "EST") -> datetime:
    """
    Calculate deadline that respects "same clock time" across DST transitions.
    For day-based durations (24h+), uses calendar days instead of exact hours.
    """
    tz_name = TIMEZONE_MAP.get(user_timezone, 'America/New_York')
    user_tz = ZoneInfo(tz_name)
    
    # Get current time in user's local timezone
    now_local = datetime.now(user_tz)
    
    if hours < 24:
        # For short durations (1-6 hours), use exact hours
        deadline_local = now_local + timedelta(hours=hours)
    else:
        # For day-based durations, use relativedelta for "same time tomorrow"
        days = hours // 24
        deadline_local = now_local + relativedelta(days=days)
    
    # Convert to UTC for storage
    deadline_utc = deadline_local.astimezone(timezone.utc)
    return deadline_utc

def generate_league_code() -> str:
    """Generate a unique 6-character league code"""
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))

def ensure_utc(dt: datetime) -> datetime:
    """Ensure datetime is UTC-aware for comparison"""
    if dt is None:
        return datetime.now(timezone.utc)
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    if user is None:
        raise credentials_exception
    return user

# ==================== AUTH ENDPOINTS ====================

@api_router.post("/auth/register", response_model=TokenResponse)
async def register(user_data: UserCreate):
    # Check if email exists
    existing_user = await db.users.find_one({"email": user_data.email}, {"_id": 0, "id": 1})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Check if username exists
    existing_username = await db.users.find_one({"username": user_data.username}, {"_id": 0, "id": 1})
    if existing_username:
        raise HTTPException(status_code=400, detail="Username already taken")

    # Check if phone number exists
    if user_data.phone_number:
        existing_phone = await db.users.find_one({"phone_number": user_data.phone_number}, {"_id": 0, "id": 1})
        if existing_phone:
            raise HTTPException(status_code=400, detail="Phone number already registered")
    else:
        raise HTTPException(status_code=400, detail="Phone number is required")

    # Create user
    user_id = str(uuid.uuid4())
    user = {
        "id": user_id,
        "email": user_data.email,
        "username": user_data.username,
        "display_name": user_data.display_name or user_data.username,
        "password_hash": hash_password(user_data.password),
        "phone_number": user_data.phone_number,
        "created_at": datetime.utcnow()
    }
    await db.users.insert_one(user)
    
    # Create token
    access_token = create_access_token({"sub": user_id})
    
    return TokenResponse(
        access_token=access_token,
        user=UserResponse(
            id=user_id,
            email=user_data.email,
            username=user_data.username,
            display_name=user["display_name"],
            created_at=user["created_at"]
        )
    )

@api_router.post("/auth/login", response_model=TokenResponse)
async def login(credentials: UserLogin):
    user = await db.users.find_one({"email": credentials.email})
    if not user or not verify_password(credentials.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    access_token = create_access_token({"sub": user["id"]})
    
    return TokenResponse(
        access_token=access_token,
        user=UserResponse(
            id=user["id"],
            email=user["email"],
            username=user["username"],
            display_name=user.get("display_name", user["username"]),
            profile_photo=user.get("profile_photo"),
            created_at=user["created_at"]
        )
    )

@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    return UserResponse(
        id=current_user["id"],
        email=current_user["email"],
        username=current_user["username"],
        display_name=current_user.get("display_name", current_user["username"]),
        profile_photo=current_user.get("profile_photo"),
        created_at=current_user["created_at"]
    )

def send_sms(to_phone: str, body: str):
    """Send an SMS via Twilio"""
    if not TWILIO_ACCOUNT_SID or not TWILIO_AUTH_TOKEN or not TWILIO_PHONE_NUMBER:
        logger.warning("Twilio credentials not configured — SMS not sent")
        return
    try:
        twilio_client = TwilioClient(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
        twilio_client.messages.create(
            body=body,
            from_=TWILIO_PHONE_NUMBER,
            to=to_phone,
        )
        logger.info(f"SMS sent to {to_phone}")
    except Exception as e:
        logger.error(f"Failed to send SMS: {e}")

@api_router.post("/auth/forgot-password")
async def forgot_password(request: ForgotPasswordRequest):
    """Send a 6-digit reset code via SMS to the user's phone number"""
    user = await db.users.find_one({"phone_number": request.phone_number}, {"_id": 0, "id": 1})
    if not user:
        # Don't reveal if account exists or not
        return {"message": "If an account exists with this phone number, a code has been sent"}

    # Generate 6-digit code
    code = ''.join(random.choices(string.digits, k=6))

    # Store code with expiry (15 minutes)
    await db.reset_codes.delete_many({"phone_number": request.phone_number})
    await db.reset_codes.insert_one({
        "phone_number": request.phone_number,
        "code": code,
        "created_at": datetime.now(timezone.utc),
        "expires_at": datetime.now(timezone.utc) + timedelta(minutes=15)
    })

    # Send SMS in a background thread
    sms_body = f"Your Music Leeg reset code is: {code}\n\nIt expires in 15 minutes."
    await asyncio.to_thread(send_sms, request.phone_number, sms_body)

    return {"message": "If an account exists with this phone number, a code has been sent"}

@api_router.post("/auth/verify-reset-code")
async def verify_reset_code(request: VerifyCodeRequest):
    """Verify the reset code"""
    reset_doc = await db.reset_codes.find_one({
        "phone_number": request.phone_number,
        "code": request.code
    })

    if not reset_doc:
        raise HTTPException(status_code=400, detail="Invalid code")

    if datetime.now(timezone.utc) > reset_doc["expires_at"].replace(tzinfo=timezone.utc):
        raise HTTPException(status_code=400, detail="Code has expired")

    return {"valid": True}

@api_router.post("/auth/reset-password")
async def reset_password(request: ResetPasswordRequest):
    """Reset password after verifying code, returns token so user is auto-logged in"""
    reset_doc = await db.reset_codes.find_one({
        "phone_number": request.phone_number,
        "code": request.code
    })

    if not reset_doc:
        raise HTTPException(status_code=400, detail="Invalid code")

    if datetime.now(timezone.utc) > reset_doc["expires_at"].replace(tzinfo=timezone.utc):
        raise HTTPException(status_code=400, detail="Code has expired")

    # Find user by phone number and update password
    user = await db.users.find_one({"phone_number": request.phone_number})
    if not user:
        raise HTTPException(status_code=404, detail="Account not found")

    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"password_hash": hash_password(request.new_password)}}
    )

    # Delete used code
    await db.reset_codes.delete_many({"phone_number": request.phone_number})

    # Return token + user so client can auto-login
    access_token = create_access_token({"sub": user["id"]})
    return {
        "message": "Password reset successfully",
        "access_token": access_token,
        "user": {
            "id": user["id"],
            "email": user["email"],
            "username": user["username"],
            "display_name": user.get("display_name", user["username"]),
            "profile_photo": user.get("profile_photo"),
            "created_at": user["created_at"].isoformat() if isinstance(user["created_at"], datetime) else user["created_at"],
        }
    }

@api_router.delete("/auth/data")
async def clear_user_data(current_user: dict = Depends(get_current_user)):
    """Wipe all gameplay data for the current user while keeping the account.

    Removes: leagues they created (and all their rounds/submissions/votes/
    messages), submissions and votes they cast in other leagues, their
    permanent user_submissions history, and resets the lifetime counters on
    their user doc to zero. The account, email, username, and profile photo
    are preserved.
    """
    user_id = current_user["id"]

    # Leagues this user created → fully remove, along with every round/
    # submission/vote/message in those leagues.
    created_leagues = await db.leagues.find(
        {"creator_id": user_id},
        {"_id": 0, "id": 1},
    ).to_list(500)
    created_league_ids = [l["id"] for l in created_leagues]
    if created_league_ids:
        round_docs = await db.rounds.find(
            {"league_id": {"$in": created_league_ids}},
            {"_id": 0, "id": 1},
        ).to_list(2000)
        round_ids = [r["id"] for r in round_docs]
        if round_ids:
            await db.submissions.delete_many({"round_id": {"$in": round_ids}})
            await db.votes.delete_many({"round_id": {"$in": round_ids}})
        await db.rounds.delete_many({"league_id": {"$in": created_league_ids}})
        await db.messages.delete_many({"league_id": {"$in": created_league_ids}})
        await db.leagues.delete_many({"id": {"$in": created_league_ids}})
        await db.league_snapshots.delete_many({"league_id": {"$in": created_league_ids}})

    # Remove any submissions / votes the user cast in other people's leagues.
    await db.submissions.delete_many({"user_id": user_id})
    await db.votes.delete_many({"voter_id": user_id})

    # Remove any chat messages the user authored anywhere.
    await db.messages.delete_many({"user_id": user_id})

    # Wipe the permanent taste/stats history.
    await db.user_submissions.delete_many({"user_id": user_id})

    # Reset lifetime counters on the user doc.
    await db.users.update_one(
        {"id": user_id},
        {"$set": {
            "all_time_points": 0,
            "total_wins": 0,
            "total_submissions": 0,
        }},
    )

    return {"message": "All data cleared successfully"}


@api_router.delete("/auth/account")
async def delete_account(current_user: dict = Depends(get_current_user)):
    """Delete user account and all associated data, fully releasing email and username"""
    user_id = current_user["id"]

    # Delete user's submissions
    await db.submissions.delete_many({"user_id": user_id})

    # Delete user's votes
    await db.votes.delete_many({"voter_id": user_id})

    # Delete user's chat messages
    await db.messages.delete_many({"user_id": user_id})

    # Delete user's chat read receipts
    await db.chat_reads.delete_many({"user_id": user_id})

    # Delete any password reset codes
    await db.reset_codes.delete_many({"phone_number": current_user.get("phone_number", "")})

    # Remove user from extended_submissions in any rounds
    await db.rounds.update_many(
        {"extended_submissions.user_id": user_id},
        {"$pull": {"extended_submissions": {"user_id": user_id}}}
    )

    # Remove user from all leagues
    await db.leagues.update_many(
        {"members.id": user_id},
        {"$pull": {"members": {"id": user_id}}}
    )

    # Delete leagues created by user (and their associated data)
    user_leagues = await db.leagues.find({"creator_id": user_id}, {"_id": 0, "id": 1}).to_list(100)
    league_ids = [l["id"] for l in user_leagues]
    if league_ids:
        # Get all round IDs for these leagues to clean up submissions and votes
        league_rounds = await db.rounds.find(
            {"league_id": {"$in": league_ids}}, {"_id": 0, "id": 1}
        ).to_list(1000)
        round_ids = [r["id"] for r in league_rounds]
        if round_ids:
            await db.submissions.delete_many({"round_id": {"$in": round_ids}})
            await db.votes.delete_many({"round_id": {"$in": round_ids}})
        await db.rounds.delete_many({"league_id": {"$in": league_ids}})
        await db.messages.delete_many({"league_id": {"$in": league_ids}})
        await db.chat_reads.delete_many({"league_id": {"$in": league_ids}})
    await db.leagues.delete_many({"creator_id": user_id})

    # Delete user record (releases email and username for re-registration)
    await db.users.delete_one({"id": user_id})

    return {"message": "Account deleted successfully"}


# ==================== /users/me — CLEAR DATA + DELETE ACCOUNT ==========
# Split behavior from the older /auth/data and /auth/account endpoints.
# /users/me/clear-data wipes personal *gameplay* history (past leagues,
# taste, recent subs, stats) without touching active leagues or the
# account itself. DELETE /users/me hard-deletes the account entirely,
# anonymizing the user's presence in any active league it was part of
# so round integrity is preserved for the other members.

DELETED_USER_DISPLAY = "[deleted user]"


def _effective_cleared_at(user_doc: dict | None) -> Optional[datetime]:
    """Return the timestamp that "hides pre-clear data from the user's
    view." Reads both the new `gameplay_data_cleared_at` and the legacy
    `past_leagues_cleared_at` (set by the older DELETE /leagues/past
    endpoint) and returns the later of the two so we don't regress
    users whose old field is still set.
    """
    if not user_doc:
        return None
    candidates: list[datetime] = []
    for key in ("gameplay_data_cleared_at", "past_leagues_cleared_at"):
        v = user_doc.get(key)
        if v is None:
            continue
        try:
            if isinstance(v, datetime):
                candidates.append(ensure_utc(v))
            else:
                candidates.append(
                    ensure_utc(
                        datetime.fromisoformat(str(v).replace("Z", "+00:00"))
                    )
                )
        except Exception:
            continue
    return max(candidates) if candidates else None


async def _clear_gameplay_data(user_id: str) -> dict:
    """Shared helper for /users/me/clear-data and DELETE /users/me.
    Returns a dict of per-collection deletion counts for logging."""
    counts: dict[str, int] = {}

    # 1. Past league snapshots where the user was a member. Mirrors the
    #    semantics of the older DELETE /leagues/past: pull from member_ids/
    #    members/standings, unset per-user submission map, and drop the
    #    snapshot entirely once the user was the last remaining member.
    past_docs = await db.past_leagues.find(
        {"member_ids": user_id},
        {"_id": 0, "id": 1, "member_ids": 1},
    ).to_list(500)
    past_cleared = 0
    past_deleted = 0
    for d in past_docs:
        remaining = [mid for mid in d.get("member_ids", []) if mid != user_id]
        if remaining:
            await db.past_leagues.update_one(
                {"id": d["id"]},
                {
                    "$pull": {
                        "member_ids": user_id,
                        "members": {"user_id": user_id},
                        "standings": {"user_id": user_id},
                    },
                    "$unset": {f"submissions_by_user.{user_id}": ""},
                },
            )
            past_cleared += 1
        else:
            await db.past_leagues.delete_one({"id": d["id"]})
            past_deleted += 1
    counts["past_league_snapshots_cleared"] = past_cleared
    counts["past_league_snapshots_deleted"] = past_deleted

    # 2. "Your Taste" + "Recent Submissions" history. The user_submissions
    #    collection is the permanent per-user song archive the profile
    #    taste pie chart reads from.
    res = await db.user_submissions.delete_many({"user_id": user_id})
    counts["taste_history_rows_deleted"] = res.deleted_count or 0

    # 3. Reset lifetime stats on the user doc AND stamp a
    #    `gameplay_data_cleared_at` timestamp. All read endpoints
    #    (Past Leagues, /auth/submissions, /auth/stats, /auth/lifetime-
    #    stats) filter out rows dated before this timestamp so the user
    #    sees a fresh slate without us destructively rewriting shared
    #    data (submissions + votes + past_league snapshots are used to
    #    compute standings for OTHER players too).
    cleared_at = datetime.now(timezone.utc)
    await db.users.update_one(
        {"id": user_id},
        {
            "$set": {
                "all_time_points": 0,
                "total_wins": 0,
                "total_submissions": 0,
                "gameplay_data_cleared_at": cleared_at,
            },
        },
    )
    counts["stats_reset"] = 1
    counts["cleared_at_set"] = True
    counts["cleared_at"] = cleared_at.isoformat()

    return counts


@api_router.post("/users/me/clear-data")
async def users_me_clear_data(current_user: dict = Depends(get_current_user)):
    """Clear personal gameplay data (past leagues, taste, recent subs,
    stats). Active leagues the user is currently in are untouched. The
    account itself — email, username, password hash, profile photo —
    stays put."""
    user_id = current_user["id"]
    counts = await _clear_gameplay_data(user_id)
    logger.info(f"users_me_clear_data: user={user_id} counts={counts}")
    return {"message": "Account data cleared", "deleted": counts}


@api_router.delete("/users/me")
async def users_me_delete(current_user: dict = Depends(get_current_user)):
    """Hard-delete the user account and everything derived from it.

    - Anonymize the user's submissions in ACTIVE leagues so round
      integrity is preserved (standings, winners, scoring all depend on
      those rows being there). Usernames on those rows are rewritten to
      "[deleted user]".
    - Remove the user from members[] of every active league they're in.
      If the user was the creator and other members remain, transfer
      creatorship to the first remaining member.
    - If the user was the sole member of any active league, that league
      is hard-deleted entirely (rounds, submissions, votes, messages,
      chat_reads, snapshots). Solo-creator leagues with nobody else to
      play don't need to sit around as zombies.
    - Run the full clear-data sweep (past leagues, taste, stats).
    - Delete the user doc itself so the email/username become available
      for a fresh signup immediately.
    """
    user_id = current_user["id"]

    # 1. Active leagues this user is in.
    my_leagues = await db.leagues.find(
        {
            "members.id": user_id,
            "$or": [{"deleted_at": {"$exists": False}}, {"deleted_at": None}],
        },
        {"_id": 0, "id": 1, "creator_id": 1, "members": 1},
    ).to_list(500)

    for l in my_leagues:
        lid = l["id"]
        # Transfer creatorship if the user is the creator and there's
        # another member to hand it to. If the user was the sole member,
        # the league becomes orphaned and gets hard-deleted in step 1b
        # below — no creator-transfer needed.
        if l.get("creator_id") == user_id:
            remaining = [m for m in l.get("members", []) if m.get("id") != user_id]
            if remaining:
                heir = remaining[0]
                await db.leagues.update_one(
                    {"id": lid},
                    {"$set": {
                        "creator_id": heir["id"],
                        "creator_username": heir.get("username", DELETED_USER_DISPLAY),
                    }},
                )
        # Pull the user from the members array.
        await db.leagues.update_one(
            {"id": lid},
            {"$pull": {"members": {"id": user_id}}},
        )
        # Remove any extended submission grants for this user.
        await db.rounds.update_many(
            {"league_id": lid, "extended_submissions.user_id": user_id},
            {"$pull": {"extended_submissions": {"user_id": user_id}}},
        )

    # 1b. Orphan cleanup — any league whose members array is now empty
    #     because the deleted user was its sole member. Hard-delete the
    #     league and everything attached to it so we don't leave
    #     unplayable zombie leagues around.
    all_my_league_ids = [l["id"] for l in my_leagues]
    orphaned_ids: list[str] = []
    if all_my_league_ids:
        orphaned = await db.leagues.find(
            {"id": {"$in": all_my_league_ids}, "members": {"$size": 0}},
            {"_id": 0, "id": 1},
        ).to_list(500)
        orphaned_ids = [l["id"] for l in orphaned]
        if orphaned_ids:
            orphan_round_docs = await db.rounds.find(
                {"league_id": {"$in": orphaned_ids}},
                {"_id": 0, "id": 1},
            ).to_list(5000)
            orphan_round_ids = [r["id"] for r in orphan_round_docs]
            if orphan_round_ids:
                await db.submissions.delete_many(
                    {"round_id": {"$in": orphan_round_ids}},
                )
                await db.votes.delete_many({"round_id": {"$in": orphan_round_ids}})
                await db.round_results.delete_many(
                    {"round_id": {"$in": orphan_round_ids}},
                )
            await db.rounds.delete_many({"league_id": {"$in": orphaned_ids}})
            await db.messages.delete_many({"league_id": {"$in": orphaned_ids}})
            await db.chat_reads.delete_many({"league_id": {"$in": orphaned_ids}})
            await db.league_snapshots.delete_many(
                {"league_id": {"$in": orphaned_ids}},
            )
            # past_leagues is keyed by league id (not league_id) — the
            # snapshot id is the league id.
            await db.past_leagues.delete_many({"id": {"$in": orphaned_ids}})
            await db.leagues.delete_many({"id": {"$in": orphaned_ids}})
    logger.info(
        f"users_me_delete_orphan_cleanup: user={user_id} "
        f"deleted_leagues={len(orphaned_ids)}"
    )

    # 2. Anonymize the user's submissions in ACTIVE leagues (excluding
    #    leagues we just hard-deleted in step 1b). Keep rows so round
    #    scoring stays intact — we only rewrite the display name.
    orphaned_set = set(orphaned_ids)
    active_league_ids = [lid for lid in all_my_league_ids if lid not in orphaned_set]
    if active_league_ids:
        round_docs = await db.rounds.find(
            {"league_id": {"$in": active_league_ids}},
            {"_id": 0, "id": 1},
        ).to_list(5000)
        round_ids = [r["id"] for r in round_docs]
        if round_ids:
            await db.submissions.update_many(
                {"round_id": {"$in": round_ids}, "user_id": user_id},
                {"$set": {"username": DELETED_USER_DISPLAY}},
            )
            # Votes have no username field — voter_id stays; results code
            # resolves usernames via the users collection, so we overwrite
            # the user's username later anyway (after delete, results
            # queries that look up the user will miss — see note below).

    # 3. Submissions / votes in leagues the user ISN'T a current member
    #    of (e.g. past leagues the scheduler has already archived). Those
    #    rows can be deleted — the past_leagues snapshot already has its
    #    own frozen copy of username + song for the historical display.
    if active_league_ids:
        all_user_sub_rounds = await db.submissions.find(
            {"user_id": user_id},
            {"_id": 0, "round_id": 1},
        ).to_list(5000)
        inactive_round_ids = [
            r["round_id"] for r in all_user_sub_rounds
            if r["round_id"] not in set(round_ids)
        ]
        if inactive_round_ids:
            await db.submissions.delete_many(
                {"user_id": user_id, "round_id": {"$in": inactive_round_ids}},
            )
        # Same for votes.
        await db.votes.delete_many({"voter_id": user_id})
    else:
        await db.submissions.delete_many({"user_id": user_id})
        await db.votes.delete_many({"voter_id": user_id})

    # 4. Chat messages — always deleted.
    await db.messages.delete_many({"user_id": user_id})
    await db.chat_reads.delete_many({"user_id": user_id})

    # 5. Password reset codes.
    await db.reset_codes.delete_many(
        {"phone_number": current_user.get("phone_number", "")},
    )

    # 6. Clear data sweep (past snapshots, taste, lifetime counters).
    counts = await _clear_gameplay_data(user_id)

    # 7. Hard-delete the user doc. After this point, the same email and
    #    username are immediately available for a fresh registration —
    #    there is no soft-delete flag on the user collection.
    await db.users.delete_one({"id": user_id})

    logger.info(f"users_me_delete: user={user_id} clear_counts={counts}")
    return {"message": "Account deleted", "deleted": counts}


@api_router.post("/auth/delete-by-credentials")
async def delete_account_by_credentials(request: DeleteByCredentialsRequest):
    """Delete user account by verifying email and phone number"""
    user = await db.users.find_one({"email": request.email}, {"_id": 0})
    
    if not user:
        raise HTTPException(status_code=404, detail="No account found with this email")
    
    if user.get("phone_number", "") != request.phone_number:
        raise HTTPException(status_code=400, detail="Phone number does not match")
    
    user_id = user["id"]
    
    # Delete user's submissions
    await db.submissions.delete_many({"user_id": user_id})
    
    # Delete user's votes
    await db.votes.delete_many({"voter_id": user_id})
    
    # Remove user from all leagues
    await db.leagues.update_many(
        {"members.id": user_id},
        {"$pull": {"members": {"id": user_id}}}
    )
    
    # Delete leagues created by user
    await db.leagues.delete_many({"creator_id": user_id})
    
    # Delete user
    await db.users.delete_one({"id": user_id})
    
    return {"message": "Account deleted successfully"}

@api_router.get("/auth/stats")
async def get_user_stats(current_user: dict = Depends(get_current_user)):
    """Get user statistics: total wins, rounds played, win rate, leagues count.

    All fields are scoped to activity *after* the user's
    `gameplay_data_cleared_at` cutoff (if set). Raw submissions / rounds
    are not deleted — we just filter them out of this user's view.
    """
    user_id = current_user["id"]
    cleared_at = _effective_cleared_at(current_user)

    # User's submissions — apply the clear cutoff. Everything downstream
    # (rounds_played, total_wins, distinct leagues) keys off this list,
    # so hiding pre-clear submissions here is enough to hide them from
    # every computed field.
    sub_query: dict = {"user_id": user_id}
    if cleared_at:
        sub_query["submitted_at"] = {"$gt": cleared_at}
    submissions = await db.submissions.find(sub_query).to_list(1000)
    rounds_played = len(submissions)

    # leagues_count: count distinct leagues the user has submitted to
    # since the clear cutoff. With no cutoff, fall back to "active
    # leagues I'm currently a member of".
    if cleared_at:
        if submissions:
            post_clear_round_ids = list({s["round_id"] for s in submissions})
            round_league_rows = await db.rounds.find(
                {"id": {"$in": post_clear_round_ids}},
                {"_id": 0, "league_id": 1},
            ).to_list(2000)
            leagues_count = len({r["league_id"] for r in round_league_rows})
        else:
            leagues_count = 0
    else:
        leagues_count = await db.leagues.count_documents({
            "members.id": user_id,
            "$or": [{"deleted_at": {"$exists": False}}, {"deleted_at": None}],
        })

    if not submissions:
        return {
            "total_wins": 0,
            "rounds_played": 0,
            "win_rate": 0,
            "leagues_count": leagues_count
        }
    
    # Get all unique round IDs from submissions
    round_ids = list(set(sub["round_id"] for sub in submissions))
    
    # Batch fetch all completed rounds
    completed_rounds = await db.rounds.find({
        "id": {"$in": round_ids},
        "status": "completed"
    }).to_list(1000)
    completed_round_ids = {r["id"] for r in completed_rounds}
    
    # Batch fetch all submissions and votes for completed rounds
    all_round_submissions = await db.submissions.find({
        "round_id": {"$in": list(completed_round_ids)}
    }, {"_id": 0, "id": 1, "round_id": 1, "user_id": 1}).to_list(1000)
    all_votes = await db.votes.find({
        "round_id": {"$in": list(completed_round_ids)}
    }, {"_id": 0, "round_id": 1, "voter_id": 1, "rankings": 1}).to_list(1000)
    
    # Group by round_id
    submissions_by_round = {}
    votes_by_round = {}
    for sub in all_round_submissions:
        submissions_by_round.setdefault(sub["round_id"], []).append(sub)
    for vote in all_votes:
        votes_by_round.setdefault(vote["round_id"], []).append(vote)
    
    # Calculate wins using N-1 point system (consistent with results endpoint)
    total_wins = 0
    for submission in submissions:
        if submission["round_id"] not in completed_round_ids:
            continue
            
        round_submissions = submissions_by_round.get(submission["round_id"], [])
        votes = votes_by_round.get(submission["round_id"], [])
        
        if round_submissions:
            num_submissions = len(round_submissions)
            num_songs_to_rank = num_submissions - 1
            
            # Calculate points
            points = {}
            sub_owners = {}
            for sub in round_submissions:
                points[sub["id"]] = 0
                sub_owners[sub["id"]] = sub["user_id"]
            
            # Points from actual votes
            voters_who_voted = set()
            for vote in votes:
                voter_id = vote.get("voter_id")
                voters_who_voted.add(voter_id)
                for rank_index, sub_id in enumerate(vote["rankings"]):
                    pts = num_songs_to_rank - rank_index
                    points[sub_id] = points.get(sub_id, 0) + pts
            
            # Auto-distribute for non-voters
            submitter_user_ids = set(sub_owners.values())
            non_voters = submitter_user_ids - voters_who_voted
            if non_voters and num_submissions > 1:
                total_pts_per_voter = sum(range(1, num_songs_to_rank + 1))
                for nv_id in non_voters:
                    nv_sub_id = next((s["id"] for s in round_submissions if s["user_id"] == nv_id), None)
                    other_subs = [s["id"] for s in round_submissions if s["id"] != nv_sub_id]
                    if other_subs:
                        base = total_pts_per_voter // len(other_subs)
                        rem = total_pts_per_voter % len(other_subs)
                        for sid in other_subs:
                            points[sid] += base
                        for i in range(rem):
                            points[other_subs[i]] += 1
            
            # Find winner
            max_points = max(points.values()) if points else 0
            if max_points > 0 and points.get(submission["id"], 0) == max_points:
                total_wins += 1
    
    win_rate = round((total_wins / rounds_played * 100)) if rounds_played > 0 else 0

    return {
        "total_wins": total_wins,
        "rounds_played": rounds_played,
        "win_rate": win_rate,
        "leagues_count": leagues_count
    }

@api_router.get("/auth/lifetime-stats")
async def get_lifetime_stats(current_user: dict = Depends(get_current_user)):
    """Return lifetime running counters for the current user.

    These are never decremented when a league is deleted — the user doc keeps
    the historical totals. As a safety net, this endpoint also back-fills any
    completed rounds whose stats haven't been finalized yet (legacy data).
    """
    user_id = current_user["id"]
    cleared_at = _effective_cleared_at(current_user)

    # Back-fill: finalize any completed rounds the user submitted in
    # that still need lifetime accounting. Scope to post-clear
    # submissions so we don't re-increment the counters we just zeroed.
    my_subs_query: dict = {"user_id": user_id}
    if cleared_at:
        my_subs_query["submitted_at"] = {"$gt": cleared_at}
    my_subs = await db.submissions.find(
        my_subs_query, {"_id": 0, "round_id": 1},
    ).to_list(1000)
    round_ids = list({s["round_id"] for s in my_subs})
    if round_ids:
        pending = await db.rounds.find(
            {
                "id": {"$in": round_ids},
                "status": "completed",
                "$or": [{"stats_finalized": {"$exists": False}}, {"stats_finalized": False}],
            },
            {"_id": 0, "id": 1},
        ).to_list(1000)
        for r in pending:
            try:
                await _finalize_round_lifetime(r["id"])
            except Exception as e:
                logger.warning(f"back-fill finalize failed for round {r['id']}: {e}")

    # Ensure total_submissions matches actual count at minimum (max-only).
    # user_submissions is the permanent archive; clear-data wipes it.
    actual_subs_query: dict = {"user_id": user_id}
    if cleared_at:
        # user_submissions rows written before cleared_at were deleted
        # by clear-data. Filtering by submitted_at here is defensive —
        # if some stray pre-clear row survived we still won't count it.
        actual_subs_query["submitted_at"] = {"$gt": cleared_at}
    actual_subs = await db.user_submissions.count_documents(actual_subs_query)
    user_doc = await db.users.find_one({"id": user_id}) or {}
    all_time_points = int(user_doc.get("all_time_points", 0))
    total_wins = int(user_doc.get("total_wins", 0))
    total_submissions = max(int(user_doc.get("total_submissions", 0)), actual_subs)
    if total_submissions != user_doc.get("total_submissions"):
        await db.users.update_one(
            {"id": user_id},
            {"$set": {"total_submissions": total_submissions}},
        )

    return {
        "all_time_points": all_time_points,
        "total_wins": total_wins,
        "total_submissions": total_submissions,
    }


@api_router.get("/auth/weekly-points")
async def get_weekly_points(current_user: dict = Depends(get_current_user)):
    """Return points the user has earned from rounds finalized in the last 7
    days. This is sourced from ``user_submissions`` (not live leagues), so
    deleting a league does not hide recent earnings.
    """
    user_id = current_user["id"]
    cutoff = datetime.now(timezone.utc) - timedelta(days=7)
    rows = await db.user_submissions.find(
        {
            "user_id": user_id,
            "finalized": True,
            "updated_at": {"$gte": cutoff},
        },
        {"_id": 0, "points": 1},
    ).to_list(2000)
    total = sum(int(r.get("points") or 0) for r in rows)
    return {"weekly_points": total}


@api_router.get("/auth/taste")
async def get_user_taste(current_user: dict = Depends(get_current_user)):
    """Return the current user's all-time genre breakdown as percentages.

    Top 5 genres are returned individually; anything beyond the top 5 (plus
    existing "Other" entries) are rolled up into a single "Other" bucket.
    """
    user_id = current_user["id"]
    rows = await db.user_submissions.find(
        {"user_id": user_id},
        {"_id": 0, "submission_id": 1, "genre": 1, "song": 1},
    ).to_list(5000)

    # Re-resolve any stored "Other" rows — the early submission pipeline
    # sometimes logged "Other" before we could reach Deezer. Cap the number
    # we re-look-up per request so a user with 500 Other rows doesn't stall.
    to_reresolve = [r for r in rows if r.get("genre") in (None, "Other")]
    for r in to_reresolve[:25]:
        song = r.get("song") or {}
        deezer_id = song.get("deezer_id")
        # Quick win: hardcoded artist map doesn't need a network round-trip.
        quick = _category_from_artist(song.get("artist", ""))
        if quick != "Other":
            new_cat = quick
        elif deezer_id:
            new_cat = await asyncio.to_thread(
                _fetch_song_category,
                deezer_id,
                song.get("artist", ""),
                song.get("title", ""),
            )
        else:
            new_cat = _category_from_genre_name(
                f"{song.get('artist', '')} {song.get('title', '')}"
            )
        if new_cat and new_cat != r.get("genre"):
            await db.user_submissions.update_one(
                {"submission_id": r["submission_id"]},
                {"$set": {"genre": new_cat, "updated_at": datetime.now(timezone.utc)}},
            )
            r["genre"] = new_cat

    counts: dict[str, int] = {c: 0 for c in TASTE_CATEGORIES}
    for r in rows:
        cat = r.get("genre")
        if cat not in counts:
            cat = "Other"
        counts[cat] += 1

    total = sum(counts.values())
    if total == 0:
        return {"total": 0, "breakdown": []}

    # Split "Other" aside, rank the real genres by count, take the top 5,
    # everything else (plus the existing "Other" bucket) becomes the Other row.
    other_count = counts.pop("Other", 0)
    ranked = sorted(
        [(g, c) for g, c in counts.items() if c > 0],
        key=lambda x: -x[1],
    )
    top = ranked[:5]
    tail = ranked[5:]
    other_total = other_count + sum(c for _, c in tail)

    breakdown = [{"genre": g, "count": c, "pct": round(c * 100 / total)} for g, c in top]
    if other_total > 0:
        breakdown.append({
            "genre": "Other",
            "count": other_total,
            "pct": round(other_total * 100 / total),
        })
    return {"total": total, "breakdown": breakdown}


@api_router.get("/auth/submissions")
async def get_my_submissions(current_user: dict = Depends(get_current_user)):
    """Return the current user's submissions across all leagues, newest first, with league/round info and points earned."""
    user_id = current_user["id"]
    cleared_at = _effective_cleared_at(current_user)

    # Hide submissions dated before the user's clear-data cutoff so My
    # Game's Recent Submissions honors the "fresh slate" intent. Raw
    # rows stay in db.submissions so other members' standings aren't
    # affected.
    sub_query: dict = {"user_id": user_id}
    if cleared_at:
        sub_query["submitted_at"] = {"$gt": cleared_at}

    submissions = await db.submissions.find(sub_query).sort("submitted_at", -1).to_list(500)
    if not submissions:
        return {"submissions": []}

    round_ids = list({s["round_id"] for s in submissions})
    rounds = await db.rounds.find({"id": {"$in": round_ids}}).to_list(500)
    rounds_by_id = {r["id"]: r for r in rounds}

    league_ids = list({r["league_id"] for r in rounds})
    leagues = await db.leagues.find(
        {"id": {"$in": league_ids}},
        {"_id": 0, "id": 1, "name": 1, "league_image": 1, "status": 1, "deleted_at": 1},
    ).to_list(500)
    leagues_by_id = {l["id"]: l for l in leagues}

    completed_round_ids = [rid for rid, r in rounds_by_id.items() if r.get("status") == "completed"]
    points_by_sub_id: dict[str, int] = {}
    # Per-round: sorted submission ids by points desc so we can compute
    # standard competition rank (1, 2, 2, 4). total_subs_by_round is the
    # "of N" denominator in "3rd of 8".
    sub_rank_by_id: dict[str, int] = {}
    total_subs_by_round: dict[str, int] = {}
    if completed_round_ids:
        all_round_subs = await db.submissions.find(
            {"round_id": {"$in": completed_round_ids}},
            {"_id": 0, "id": 1, "round_id": 1, "user_id": 1},
        ).to_list(2000)
        all_votes = await db.votes.find(
            {"round_id": {"$in": completed_round_ids}},
            {"_id": 0, "round_id": 1, "voter_id": 1, "rankings": 1},
        ).to_list(2000)

        subs_by_round: dict[str, list] = {}
        votes_by_round: dict[str, list] = {}
        for sub in all_round_subs:
            subs_by_round.setdefault(sub["round_id"], []).append(sub)
        for v in all_votes:
            votes_by_round.setdefault(v["round_id"], []).append(v)

        for rid in completed_round_ids:
            round_subs = subs_by_round.get(rid, [])
            votes = votes_by_round.get(rid, [])
            if not round_subs:
                continue
            num_subs = len(round_subs)
            total_subs_by_round[rid] = num_subs
            num_to_rank = num_subs - 1

            pts: dict[str, int] = {s["id"]: 0 for s in round_subs}
            sub_owners = {s["id"]: s["user_id"] for s in round_subs}

            voters_who_voted = set()
            for v in votes:
                voters_who_voted.add(v.get("voter_id"))
                for idx, sid in enumerate(v.get("rankings", [])):
                    if sid in pts:
                        pts[sid] += (num_to_rank - idx)

            submitter_ids = set(sub_owners.values())
            non_voters = submitter_ids - voters_who_voted
            if non_voters and num_subs > 1:
                total_per_voter = sum(range(1, num_to_rank + 1))
                for nv_id in non_voters:
                    nv_sub_id = next((s["id"] for s in round_subs if s["user_id"] == nv_id), None)
                    other_subs = [s["id"] for s in round_subs if s["id"] != nv_sub_id]
                    if other_subs:
                        base = total_per_voter // len(other_subs)
                        rem = total_per_voter % len(other_subs)
                        for sid in other_subs:
                            pts[sid] += base
                        for i in range(rem):
                            pts[other_subs[i]] += 1

            for sid, p in pts.items():
                points_by_sub_id[sid] = p

            # Standard competition ranking: ties share a rank, the next
            # rank skips by the tie size. Sort once by points desc.
            ordered = sorted(pts.items(), key=lambda kv: -kv[1])
            last_points: Optional[int] = None
            last_rank = 0
            for i, (sid, p) in enumerate(ordered, start=1):
                if last_points is None or p != last_points:
                    last_rank = i
                    last_points = p
                sub_rank_by_id[sid] = last_rank

    result = []
    for s in submissions:
        r = rounds_by_id.get(s["round_id"])
        if not r:
            continue
        league = leagues_by_id.get(r["league_id"], {})
        # league_status is derived, not raw. "deleted" wins over the
        # stored status when deleted_at is set — the frontend uses this
        # to decide whether to render the "League deleted" label.
        if league.get("deleted_at"):
            league_status = "deleted"
        else:
            league_status = league.get("status") or "active"

        round_status = r.get("status")
        is_round_completed = round_status == "completed"
        # Points/placement are only meaningful if the round actually
        # finished scoring. For a deleted league whose round was mid-
        # flight at deletion, round_status stays at submission/voting
        # and these fields correctly stay null.
        points_earned = points_by_sub_id.get(s["id"]) if is_round_completed else None
        placement = sub_rank_by_id.get(s["id"]) if is_round_completed else None
        total_in_round = total_subs_by_round.get(r["id"]) if is_round_completed else None

        result.append({
            "submission_id": s["id"],
            "song": s.get("song"),
            "submitted_at": s.get("submitted_at"),
            "round_id": r["id"],
            "round_number": r.get("round_number"),
            "round_theme": r.get("theme"),
            "round_status": round_status,
            "league_id": r["league_id"],
            "league_name": league.get("name", ""),
            "league_image": league.get("league_image"),
            "league_status": league_status,
            # Legacy field, kept for older clients. New code should use
            # points_earned.
            "points": points_earned,
            "points_earned": points_earned,
            "placement": placement,
            "total_submissions_in_round": total_in_round,
        })
    return {"submissions": result}

@api_router.put("/auth/me", response_model=UserResponse)
async def update_profile(update_data: UserUpdate, current_user: dict = Depends(get_current_user)):
    update_fields = {}

    if update_data.username is not None:
        new_name = update_data.username.strip()
        if not new_name:
            raise HTTPException(status_code=400, detail="Username cannot be empty")
        # Check if username is taken by a different user — 409 Conflict is
        # the correct status for a uniqueness collision.
        existing = await db.users.find_one({"username": new_name, "id": {"$ne": current_user["id"]}})
        if existing:
            raise HTTPException(status_code=409, detail="Username already taken")
        update_fields["username"] = new_name

    if update_data.display_name is not None:
        update_fields["display_name"] = update_data.display_name

    if update_data.profile_photo is not None:
        update_fields["profile_photo"] = update_data.profile_photo

    if update_fields:
        await db.users.update_one({"id": current_user["id"]}, {"$set": update_fields})

    # Fetch updated user and return the full record so the client can replace
    # its cached copy in AsyncStorage / AuthContext wholesale.
    user = await db.users.find_one({"id": current_user["id"]})
    return UserResponse(
        id=user["id"],
        email=user["email"],
        username=user["username"],
        display_name=user.get("display_name", user["username"]),
        profile_photo=user.get("profile_photo"),
        created_at=user["created_at"],
    )

# ==================== LEAGUE ENDPOINTS ====================

@api_router.post("/leagues", response_model=LeagueResponse)
async def create_league(league_data: LeagueCreate, current_user: dict = Depends(get_current_user)):
    league_id = str(uuid.uuid4())
    league_code = generate_league_code()

    # Ensure unique league code
    while await db.leagues.find_one({"league_code": league_code}):
        league_code = generate_league_code()

    has_image = league_data.league_image is not None and len(league_data.league_image or "") > 0
    print(f"[CREATE LEAGUE] name={league_data.name}, has_image={has_image}, image_len={len(league_data.league_image or '')}")

    # Validate submission/voting durations. None means "use fallback" —
    # any other value must be one of the allowed choices.
    _validate_phase_hours("submission_hours", league_data.submission_hours)
    _validate_phase_hours("voting_hours", league_data.voting_hours)

    # Genre: trim to None if blank, truncate enforcement via max length check.
    genre = (league_data.genre or "").strip()
    if genre and len(genre) > GENRE_MAX_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Genre must be {GENRE_MAX_LENGTH} characters or fewer.",
        )

    # Public-league guardrails: starts_at is required and must be in the
    # future; member_cap defaults to PUBLIC_MEMBER_CAP_DEFAULT but can be
    # overridden within [PUBLIC_MEMBER_CAP_MIN, PUBLIC_MEMBER_CAP_MAX];
    # genre is required.
    is_public = bool(league_data.is_public)
    starts_at: Optional[datetime] = None
    member_cap: Optional[int] = None
    if is_public:
        if not league_data.starts_at:
            raise HTTPException(
                status_code=400,
                detail="Public leagues require a starts_at (Round 1 auto-start time).",
            )
        starts_at = ensure_utc(league_data.starts_at)
        if starts_at <= datetime.now(timezone.utc):
            raise HTTPException(
                status_code=400,
                detail="Public league starts_at must be in the future.",
            )
        if not genre:
            raise HTTPException(
                status_code=400,
                detail="Genre is required for public leagues",
            )
        if league_data.member_cap is not None:
            if (
                league_data.member_cap < PUBLIC_MEMBER_CAP_MIN
                or league_data.member_cap > PUBLIC_MEMBER_CAP_MAX
            ):
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"member_cap must be between {PUBLIC_MEMBER_CAP_MIN} "
                        f"and {PUBLIC_MEMBER_CAP_MAX}."
                    ),
                )
            member_cap = league_data.member_cap
        else:
            member_cap = PUBLIC_MEMBER_CAP_DEFAULT

    league = {
        "id": league_id,
        "name": league_data.name,
        "league_code": league_code,
        "creator_id": current_user["id"],
        "creator_username": current_user["username"],
        "total_rounds": league_data.total_rounds,
        "league_image": league_data.league_image if has_image else None,
        "members": [{"id": current_user["id"], "username": current_user["username"]}],
        "current_round": 0,
        "status": "active",
        "created_at": datetime.now(timezone.utc),
        "submission_hours": league_data.submission_hours,
        "voting_hours": league_data.voting_hours,
        "themes": league_data.themes,
        "genre": genre or None,
        "is_public": is_public,
        "starts_at": starts_at,
        "member_cap": member_cap,
    }
    await db.leagues.insert_one(league)
    league.pop("_id", None)

    # Durable snapshot used by the inbox to render notifications for this
    # league even after it's been deleted.
    await _upsert_league_snapshot(league_id, league_data.name, league_data.league_image if has_image else None)

    # Pre-generate every round up-front. For private leagues R1 is "ready" —
    # creator taps Start; R2..RN are "locked". For public leagues R1 is
    # "scheduled" with starts_at set — the auto-advance scheduler flips it
    # to submission once starts_at passes; R2..RN stay locked as usual.
    await _pregenerate_rounds(
        league_id=league_id,
        total_rounds=league_data.total_rounds,
        submission_hours=league_data.submission_hours or 48,
        voting_hours=league_data.voting_hours or 72,
        themes=league_data.themes or [],
        r1_scheduled_starts_at=starts_at if is_public else None,
    )
    # Round 1 is live — reflect that in current_round.
    if league_data.total_rounds > 0:
        await db.leagues.update_one(
            {"id": league_id},
            {"$set": {"current_round": 1}},
        )
        league["current_round"] = 1

    return LeagueResponse(**league)


# Sentinel far-future timestamp used as a placeholder for locked rounds'
# deadlines. The deadline fields are required by the Round model, so we use
# an obviously-unreachable value until the round unlocks and the real
# deadline is recomputed.
_LOCKED_PLACEHOLDER_DT = datetime(9999, 1, 1, tzinfo=timezone.utc)

# Public leagues are capacity-capped. Creators may pick a cap between
# PUBLIC_MEMBER_CAP_MIN and PUBLIC_MEMBER_CAP_MAX; when they don't pick,
# we use PUBLIC_MEMBER_CAP_DEFAULT. Private leagues are uncapped.
PUBLIC_MEMBER_CAP_MIN = 10
PUBLIC_MEMBER_CAP_MAX = 100
PUBLIC_MEMBER_CAP_DEFAULT = 50


async def _pregenerate_rounds(
    *,
    league_id: str,
    total_rounds: int,
    submission_hours: int,
    voting_hours: int,
    themes: list[str],
    start_round: int = 1,
    r1_scheduled_starts_at: Optional[datetime] = None,
) -> None:
    """Create round docs for rounds `start_round`..`total_rounds`. Round 1
    is created in "ready" state for private leagues (creator taps Start);
    for public leagues it's created in "scheduled" state with a
    `starts_at` timestamp — the auto-advance scheduler flips it to
    "submission" once the timer hits zero. Rounds 2..N are created in
    "locked" state and get unlocked by the transition helper when the
    previous round finishes. Idempotent — skips round numbers that
    already exist."""
    if total_rounds <= 0:
        return
    existing = await db.rounds.find(
        {"league_id": league_id},
        {"_id": 0, "round_number": 1},
    ).to_list(200)
    existing_numbers = {int(r.get("round_number", 0)) for r in existing}

    now = datetime.now(timezone.utc)
    docs: list[dict] = []
    for rn in range(start_round, total_rounds + 1):
        if rn in existing_numbers:
            continue
        theme = ""
        if rn - 1 < len(themes):
            theme = (themes[rn - 1] or "").strip()
        doc: dict = {
            "id": str(uuid.uuid4()),
            "league_id": league_id,
            "round_number": rn,
            "theme": theme,
            "submission_hours": submission_hours,
            "voting_hours": voting_hours,
            "created_at": now,
        }
        if rn == 1 and not existing:
            if r1_scheduled_starts_at is not None:
                # Public R1: scheduled to auto-start at `starts_at`.
                # Submission/voting deadlines get computed at start time.
                doc["status"] = "scheduled"
                doc["starts_at"] = r1_scheduled_starts_at
                doc["submission_deadline"] = None
                doc["voting_deadline"] = None
            else:
                # Private R1: ready — waiting for the creator to hit Start.
                doc["status"] = "ready"
                doc["submission_deadline"] = None
                doc["voting_deadline"] = None
        else:
            # Future rounds stay locked until their predecessor finishes.
            # Use the placeholder so legacy queries that assume the field
            # is a datetime keep working — the "locked" status is the
            # authoritative gate.
            doc["status"] = "locked"
            doc["submission_deadline"] = _LOCKED_PLACEHOLDER_DT
            doc["voting_deadline"] = _LOCKED_PLACEHOLDER_DT
        docs.append(doc)

    if docs:
        await db.rounds.insert_many(docs)


async def _upsert_league_snapshot(league_id: str, name: str, image: str | None):
    await db.league_snapshots.update_one(
        {"league_id": league_id},
        {"$set": {
            "league_id": league_id,
            "name": name,
            "league_image": image,
            "updated_at": datetime.now(timezone.utc),
        }},
        upsert=True,
    )


@api_router.get("/leagues/{league_id}/snapshot")
async def get_league_snapshot(league_id: str, current_user: dict = Depends(get_current_user)):
    """Return a durable name + image snapshot for a league id. Works even if
    the league has been deleted — this is what the inbox uses to keep
    notification thumbnails after deletion.
    """
    snap = await db.league_snapshots.find_one({"league_id": league_id}, {"_id": 0})
    if snap:
        return snap
    # Fall back to the current league doc if no snapshot exists yet.
    league = await db.leagues.find_one({"id": league_id}, {"_id": 0})
    if not league:
        raise HTTPException(status_code=404, detail="No snapshot available")
    return {
        "league_id": league_id,
        "name": league.get("name"),
        "league_image": league.get("league_image"),
    }


def add_league_defaults(league: dict) -> dict:
    """Add default values for new fields to support existing leagues"""
    league.setdefault("total_rounds", 0)
    league.setdefault("league_image", None)
    league.setdefault("submission_hours", None)
    league.setdefault("voting_hours", None)
    league.setdefault("themes", None)
    league.setdefault("genre", None)
    league.setdefault("is_public", False)
    league.setdefault("starts_at", None)
    league.setdefault("member_cap", None)
    league.setdefault("left_members", [])
    # Remove old fields if they exist (migration)
    league.pop("theme", None)
    league.pop("theme_mode", None)
    return league

@api_router.get("/leagues", response_model=List[LeagueResponse])
async def get_user_leagues(current_user: dict = Depends(get_current_user)):
    leagues = await db.leagues.find(
        {
            "members.id": current_user["id"],
            "$or": [{"deleted_at": {"$exists": False}}, {"deleted_at": None}],
        },
        {"_id": 0},
    ).to_list(100)
    
    # Fetch profile photos for all members
    for league in leagues:
        member_ids = [m["id"] for m in league.get("members", [])]
        users = await db.users.find({"id": {"$in": member_ids}}, {"_id": 0, "id": 1, "username": 1, "profile_photo": 1}).to_list(100)
        user_map = {u["id"]: u for u in users}
        
        # Update members with profile photos
        for member in league.get("members", []):
            user_data = user_map.get(member["id"], {})
            member["profile_photo"] = user_data.get("profile_photo")
    
    return [LeagueResponse(**add_league_defaults(league)) for league in leagues]


# ==================== PUBLIC LEAGUES =====================================
# Surfaces public leagues whose Round 1 hasn't auto-started yet. Results
# are sorted by starts_at ascending so the soonest-to-start leagues appear
# first. Private leagues and already-started/completed/deleted public
# leagues are excluded.

@api_router.get("/leagues/public")
async def list_public_leagues(
    q: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    current_user: dict = Depends(get_current_user),
):
    # Clamp inputs to defensive bounds.
    try:
        limit = max(1, min(int(limit), 50))
    except (TypeError, ValueError):
        limit = 50
    try:
        offset = max(0, int(offset))
    except (TypeError, ValueError):
        offset = 0

    now = datetime.now(timezone.utc)
    filt: dict = {
        "is_public": True,
        "starts_at": {"$gt": now},
        "status": {"$nin": ["deleted", "completed"]},
        "$and": [
            {"$or": [{"deleted_at": {"$exists": False}}, {"deleted_at": None}]},
        ],
    }
    if q:
        # Case-insensitive partial match on name OR genre. Input is
        # regex-escaped so users can't inject regex operators. Nested
        # under $and alongside the deleted_at guard so the two $or
        # clauses don't clobber each other.
        pattern = {"$regex": re.escape(q.strip()), "$options": "i"}
        filt["$and"].append({"$or": [{"name": pattern}, {"genre": pattern}]})

    cursor = db.leagues.find(filt, {"_id": 0}).sort("starts_at", 1)
    # With a search query, ignore offset and return the top 50 matches.
    effective_offset = 0 if q else offset
    if effective_offset:
        cursor = cursor.skip(effective_offset)
    cursor = cursor.limit(limit)
    leagues = await cursor.to_list(limit)

    results = []
    user_id = current_user["id"]
    for l in leagues:
        members = l.get("members", [])
        results.append({
            "id": l["id"],
            "name": l.get("name"),
            "total_rounds": l.get("total_rounds", 0) or 0,
            "starts_at": l.get("starts_at"),
            "member_count": len(members),
            "member_cap": l.get("member_cap") or PUBLIC_MEMBER_CAP_DEFAULT,
            "genre": l.get("genre"),
            "has_current_user_joined": any(m.get("id") == user_id for m in members),
            "league_image": l.get("league_image"),
            "creator_username": l.get("creator_username"),
        })
    return {"leagues": results, "count": len(results)}


# ==================== PAST LEAGUES ====================
# Past leagues live in their own `past_leagues` collection. A snapshot of
# every league (standings, members, rounds, submissions, image) is written
# to that collection when the league finishes — either because all rounds
# completed, or because the creator deleted it. GET /leagues/past reads
# straight from that collection so history stays intact even if the source
# league / rounds / submissions are later cleaned up.
#
# These routes are declared before the generic /leagues/{league_id} path
# parameter so that a GET/DELETE to /leagues/past isn't captured as a
# league-by-id lookup with id="past".

@api_router.get("/leagues/past")
async def get_past_leagues(current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    cleared_at = _effective_cleared_at(current_user)
    hidden_ids: set[str] = set(current_user.get("past_leagues_hidden") or [])

    # Back-fill snapshots for any league this user is/was a member of that
    # qualifies as "past" but isn't in past_leagues yet. Skips leagues
    # that ended before the user's clear-data cutoff so cleared history
    # doesn't re-materialize on every page open.
    await _backfill_past_leagues_for_user(user_id)

    docs = await db.past_leagues.find(
        {"member_ids": user_id},
        {"_id": 0},
    ).to_list(500)

    entries = []
    excluded_left = 0
    excluded_hidden = 0
    excluded_cleared = 0
    for d in docs:
        # Users who left a league before it ended don't see it in their
        # Past Leagues — they didn't finish it. The snapshot still exists
        # for the remaining members.
        left_ids = {
            (lm.get("user_id") if isinstance(lm, dict) else None)
            for lm in (d.get("left_members") or [])
        }
        if user_id in left_ids:
            excluded_left += 1
            continue
        # Individually-hidden past leagues (swipe-to-delete) stay out of
        # the list even if the user is still in member_ids for some
        # reason (e.g. snapshot re-written after they hid it).
        if d.get("id") in hidden_ids:
            excluded_hidden += 1
            continue
        # Respect the per-user "clear history" cutoff.
        if cleared_at and d.get("finished_at"):
            finished_raw = d["finished_at"]
            try:
                finished_dt = (
                    finished_raw if isinstance(finished_raw, datetime)
                    else datetime.fromisoformat(str(finished_raw).replace("Z", "+00:00"))
                )
                if ensure_utc(finished_dt) <= cleared_at:
                    excluded_cleared += 1
                    continue
            except Exception:
                pass
        entries.append(_view_past_league_for_user(d, user_id))

    entries.sort(key=lambda e: e.get("finished_at") or "", reverse=True)
    logger.info(
        f"past_leagues_get: user={user_id} returned={len(entries)} "
        f"matched={len(docs)} excluded_left={excluded_left} "
        f"excluded_hidden={excluded_hidden} excluded_cleared={excluded_cleared}"
    )
    return {"leagues": entries}


@api_router.delete("/leagues/past")
async def delete_past_leagues(current_user: dict = Depends(get_current_user)):
    """Permanently wipe past league history from the current user's view.

    For each snapshot where the user is a member, we remove the user from
    `member_ids`/`members`/`submissions_by_user`/`standings`. When the last
    member is removed, the snapshot document is deleted. We also set a
    `past_leagues_cleared_at` timestamp on the user so anything written
    *before* the clear stays hidden even if we missed it.
    """
    user_id = current_user["id"]
    now = datetime.now(timezone.utc)

    docs = await db.past_leagues.find(
        {"member_ids": user_id},
        {"_id": 0, "id": 1, "member_ids": 1},
    ).to_list(500)

    for d in docs:
        remaining = [mid for mid in d.get("member_ids", []) if mid != user_id]
        if remaining:
            await db.past_leagues.update_one(
                {"id": d["id"]},
                {
                    "$pull": {
                        "member_ids": user_id,
                        "members": {"user_id": user_id},
                        "standings": {"user_id": user_id},
                    },
                    "$unset": {f"submissions_by_user.{user_id}": ""},
                },
            )
        else:
            await db.past_leagues.delete_one({"id": d["id"]})

    await db.users.update_one(
        {"id": user_id},
        {"$set": {"past_leagues_cleared_at": now}},
    )

    return {
        "message": "Past league history cleared",
        "snapshots_cleared": len(docs),
        "cleared_at": now.isoformat(),
    }


@api_router.delete("/leagues/past/{league_id}")
async def delete_one_past_league(
    league_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Remove a single past league from the current user's archive.

    Pulls the user from the snapshot's `member_ids`/`members`/standings
    and unsets their personal submissions entry. If the user was the
    snapshot's sole remaining member, the snapshot doc is deleted so
    nothing stale lingers.

    Also records the league_id in `user.past_leagues_hidden` so the
    lazy backfill doesn't re-materialize the snapshot on the next
    /leagues/past fetch. Other members who still have this league in
    their archive are unaffected.
    """
    user_id = current_user["id"]
    snap = await db.past_leagues.find_one(
        {"id": league_id},
        {"_id": 0, "member_ids": 1},
    )
    snapshots_touched = 0
    if snap:
        remaining = [mid for mid in (snap.get("member_ids") or []) if mid != user_id]
        if remaining:
            await db.past_leagues.update_one(
                {"id": league_id},
                {
                    "$pull": {
                        "member_ids": user_id,
                        "members": {"user_id": user_id},
                        "standings": {"user_id": user_id},
                    },
                    "$unset": {f"submissions_by_user.{user_id}": ""},
                },
            )
        else:
            await db.past_leagues.delete_one({"id": league_id})
        snapshots_touched = 1

    # Remember that this user has suppressed this league_id so the
    # backfill doesn't recreate the snapshot for them next time.
    await db.users.update_one(
        {"id": user_id},
        {"$addToSet": {"past_leagues_hidden": league_id}},
    )

    return {
        "message": "Past league removed from archive",
        "snapshots_touched": snapshots_touched,
    }


@api_router.get("/leagues/{league_id}", response_model=LeagueResponse)
async def get_league(league_id: str, current_user: dict = Depends(get_current_user)):
    league = await db.leagues.find_one({"id": league_id}, {"_id": 0})
    if not league:
        raise HTTPException(status_code=404, detail="League not found")
    
    # Check if user is member
    is_member = any(m["id"] == current_user["id"] for m in league["members"])
    if not is_member:
        raise HTTPException(status_code=403, detail="You are not a member of this league")
    
    # Fetch profile photos for all members
    member_ids = [m["id"] for m in league.get("members", [])]
    users = await db.users.find({"id": {"$in": member_ids}}, {"_id": 0, "id": 1, "username": 1, "profile_photo": 1}).to_list(100)
    user_map = {u["id"]: u for u in users}
    
    # Update members with profile photos
    for member in league.get("members", []):
        user_data = user_map.get(member["id"], {})
        member["profile_photo"] = user_data.get("profile_photo")
    
    return LeagueResponse(**add_league_defaults(league))

# Round statuses that mean a league has actually begun. Ready / locked /
# scheduled rounds don't count — those are pre-play states (creator hasn't
# pressed Start, or the scheduled public-R1 timer hasn't fired yet).
_STARTED_ROUND_STATUSES = ("submission", "voting", "completed", "skipped")


async def _league_has_started(league_id: str) -> bool:
    """A league is "started" once at least one of its rounds has ever
    entered submission status. Used to gate join requests."""
    started = await db.rounds.find_one(
        {"league_id": league_id, "status": {"$in": list(_STARTED_ROUND_STATUSES)}},
        {"_id": 0, "id": 1},
    )
    return started is not None


@api_router.post("/leagues/join", response_model=LeagueResponse)
async def join_league(request: JoinLeagueRequest, current_user: dict = Depends(get_current_user)):
    league = await db.leagues.find_one({"league_code": request.league_code.upper()})
    if not league:
        raise HTTPException(status_code=404, detail="League not found with this code")

    # Check if already member
    is_member = any(m["id"] == current_user["id"] for m in league["members"])
    if is_member:
        raise HTTPException(status_code=400, detail="You are already a member of this league")

    if await _league_has_started(league["id"]):
        raise HTTPException(
            status_code=400,
            detail="This league has already started. New members can only join before the first round begins.",
        )

    # Add user to members
    await db.leagues.update_one(
        {"id": league["id"]},
        {"$push": {"members": {"id": current_user["id"], "username": current_user["username"]}}}
    )

    # Fetch updated league
    league = await db.leagues.find_one({"id": league["id"]}, {"_id": 0})
    return LeagueResponse(**add_league_defaults(league))


@api_router.post("/leagues/{league_id}/join-public", response_model=LeagueResponse)
async def join_public_league(league_id: str, current_user: dict = Depends(get_current_user)):
    """Join a public league by id. Enforces is_public, not-yet-started, under
    member cap, and non-duplicate membership. Returns the updated league."""
    league = await db.leagues.find_one({"id": league_id})
    if not league:
        raise HTTPException(status_code=404, detail="League not found")
    if league.get("deleted_at"):
        raise HTTPException(status_code=404, detail="League not found")
    if not league.get("is_public"):
        raise HTTPException(status_code=400, detail="This league is not public.")

    if await _league_has_started(league_id):
        raise HTTPException(
            status_code=400,
            detail="This league has already started. New members can only join before the first round begins.",
        )

    members = league.get("members", [])
    if any(m.get("id") == current_user["id"] for m in members):
        raise HTTPException(status_code=400, detail="You have already joined this league.")

    cap = league.get("member_cap") or PUBLIC_MEMBER_CAP_DEFAULT
    if len(members) >= cap:
        raise HTTPException(status_code=400, detail="League is full.")

    await db.leagues.update_one(
        {"id": league_id},
        {"$push": {"members": {"id": current_user["id"], "username": current_user["username"]}}},
    )
    updated = await db.leagues.find_one({"id": league_id}, {"_id": 0})
    return LeagueResponse(**add_league_defaults(updated))


@api_router.delete("/leagues/{league_id}")
async def delete_league(league_id: str, current_user: dict = Depends(get_current_user)):
    """Creator-initiated league deletion. The behavior depends on whether
    the league has had any activity:

    - **No activity yet** (no round has reached submission state, even if
      pre-generated rounds exist in `ready` or `locked` status): the league
      and its pre-generated rounds are hard-deleted. Nothing to preserve.
    - **Has activity** (any round in submission/voting/completed/skipped):
      the league is marked `status=completed_early`, soft-deleted, and a
      past-league snapshot is written with `ended_status=not_finished`.
      Members and left users keep their accumulated points exactly as they
      stood at the moment of deletion.
    """
    league = await db.leagues.find_one({"id": league_id})
    if not league:
        raise HTTPException(status_code=404, detail="League not found")

    # Only creator can delete
    if league["creator_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Only the league creator can delete the league")
    if league.get("deleted_at"):
        raise HTTPException(status_code=400, detail="This league has already been deleted.")
    # Already completed leagues already have a past_leagues snapshot
    # with the authoritative final standings; we don't want a delete to
    # overwrite that as not_finished.
    if league.get("status") == "completed":
        raise HTTPException(
            status_code=400,
            detail="This league is already finished. Use Past Leagues to remove it from your archive.",
        )

    now = datetime.now(timezone.utc)

    # "Has activity" → any round has progressed past pre-start.
    has_activity = await db.rounds.find_one(
        {
            "league_id": league_id,
            "status": {"$in": list(_STARTED_ROUND_STATUSES)},
        },
        {"_id": 0, "id": 1},
    ) is not None

    if not has_activity:
        # Nothing meaningful to preserve — hard-delete the league plus
        # all pre-generated round/submission/vote/messages docs.
        round_docs = await db.rounds.find(
            {"league_id": league_id}, {"_id": 0, "id": 1},
        ).to_list(5000)
        round_ids = [r["id"] for r in round_docs]
        if round_ids:
            await db.submissions.delete_many({"round_id": {"$in": round_ids}})
            await db.votes.delete_many({"round_id": {"$in": round_ids}})
            await db.round_results.delete_many({"round_id": {"$in": round_ids}})
        await db.rounds.delete_many({"league_id": league_id})
        await db.messages.delete_many({"league_id": league_id})
        await db.chat_reads.delete_many({"league_id": league_id})
        await db.league_snapshots.delete_many({"league_id": league_id})
        await db.past_leagues.delete_many({"id": league_id})
        await db.leagues.delete_one({"id": league_id})
        logger.info(f"league_hard_deleted: league={league_id} reason=no_activity")
        return {"message": "League deleted successfully", "hard_deleted": True}

    # League has activity: soft-delete + snapshot as not_finished. The
    # snapshot is the durable home for this league going forward; the
    # source league doc stays around for the 7-day restore window.
    await db.leagues.update_one(
        {"id": league_id},
        {
            "$set": {
                "status": "completed_early",
                "deleted_at": now,
                "deleted_by": current_user["id"],
            }
        },
    )

    try:
        await _save_past_league_snapshot(
            league_id,
            is_deleted=True,
            deleted_at=now,
            ended_status="not_finished",
        )
    except Exception as e:
        logger.warning(f"past_leagues snapshot failed for deleted {league_id}: {e}")

    # Clear the league's chat so members stop seeing messages for a league
    # that's been deleted. Notifications live client-side (AsyncStorage) and
    # the inbox code drops any cached notif whose league no longer appears in
    # /leagues on its next fetch.
    try:
        await db.messages.delete_many({"league_id": league_id})
    except Exception as e:
        logger.warning(f"Failed to purge messages for deleted league {league_id}: {e}")

    logger.info(
        f"league_completed_early: league={league_id} "
        f"deleted_by={current_user['id']} had_activity=True"
    )

    return {
        "message": "League ended early",
        "hard_deleted": False,
        "ended_status": "not_finished",
    }


@api_router.get("/leagues/deleted")
async def list_recently_deleted_leagues(current_user: dict = Depends(get_current_user)):
    """Return leagues the current user created that were deleted within the last 7 days."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=7)
    leagues = await db.leagues.find(
        {
            "creator_id": current_user["id"],
            "deleted_at": {"$gte": cutoff},
        },
        {"_id": 0},
    ).to_list(100)

    result = []
    for l in leagues:
        deleted_at = l.get("deleted_at")
        expires_at = deleted_at + timedelta(days=7) if deleted_at else None
        result.append({
            "id": l["id"],
            "name": l["name"],
            "league_code": l.get("league_code"),
            "league_image": l.get("league_image"),
            "total_rounds": l.get("total_rounds", 0),
            "members_count": len(l.get("members", [])),
            "deleted_at": deleted_at.isoformat() if deleted_at else None,
            "expires_at": expires_at.isoformat() if expires_at else None,
        })
    # Newest deletions first
    result.sort(key=lambda x: x["deleted_at"] or "", reverse=True)
    return {"leagues": result}


@api_router.post("/leagues/{league_id}/restore", response_model=LeagueResponse)
async def restore_deleted_league(league_id: str, current_user: dict = Depends(get_current_user)):
    """Restore a soft-deleted league within the 7-day window. Only the creator can restore."""
    league = await db.leagues.find_one({"id": league_id})
    if not league:
        raise HTTPException(status_code=404, detail="League not found")
    if league.get("creator_id") != current_user["id"]:
        raise HTTPException(status_code=403, detail="Only the league creator can restore the league")
    if not league.get("deleted_at"):
        raise HTTPException(status_code=400, detail="League is not deleted")

    deleted_at = league["deleted_at"]
    if isinstance(deleted_at, str):
        deleted_at_dt = datetime.fromisoformat(deleted_at.replace("Z", "+00:00"))
    else:
        deleted_at_dt = deleted_at
    # Ensure timezone-aware
    if deleted_at_dt.tzinfo is None:
        deleted_at_dt = deleted_at_dt.replace(tzinfo=timezone.utc)

    if datetime.now(timezone.utc) - deleted_at_dt > timedelta(days=7):
        raise HTTPException(status_code=410, detail="Restore window expired")

    await db.leagues.update_one(
        {"id": league_id},
        {
            "$unset": {"deleted_at": "", "deleted_by": ""},
            # Clear the `completed_early` marker so the league plays as
            # active again. The auto-advance + read-path handlers
            # recompute the real status from round states.
            "$set": {"status": "active"},
        },
    )

    # The league is active again — drop its past_leagues snapshot so it
    # doesn't show up as both "active" and "past".
    try:
        await db.past_leagues.delete_one({"id": league_id})
    except Exception as e:
        logger.warning(f"past_leagues delete failed on restore {league_id}: {e}")

    restored = await db.leagues.find_one({"id": league_id}, {"_id": 0})
    # Enrich member profile photos like GET /leagues
    member_ids = [m["id"] for m in restored.get("members", [])]
    users = await db.users.find(
        {"id": {"$in": member_ids}},
        {"_id": 0, "id": 1, "username": 1, "profile_photo": 1},
    ).to_list(100)
    user_map = {u["id"]: u for u in users}
    for member in restored.get("members", []):
        member["profile_photo"] = user_map.get(member["id"], {}).get("profile_photo")

    return LeagueResponse(**add_league_defaults(restored))


# ==================== PAST LEAGUES — SNAPSHOT BUILDERS ====================


def _iso(dt) -> Optional[str]:
    """Serialize a datetime-or-None to an ISO string safely."""
    if not dt:
        return None
    if isinstance(dt, str):
        return dt
    return ensure_utc(dt).isoformat()


async def _build_past_league_snapshot(
    league: dict,
    *,
    is_deleted: bool,
    deleted_at: Optional[datetime] = None,
) -> dict:
    """Build a full, viewer-agnostic snapshot of a past league.

    Call this when a league finishes (all rounds complete) or when the
    creator deletes it. The return value is meant to be upserted into the
    `past_leagues` collection.
    """
    league_id = league["id"]
    now = datetime.now(timezone.utc)

    rounds = await db.rounds.find(
        {"league_id": league_id},
        {"_id": 0},
    ).sort("round_number", 1).to_list(500)

    completed_rounds = [r for r in rounds if r.get("status") == "completed"]
    completed_round_ids = [r["id"] for r in completed_rounds]
    all_round_ids = [r["id"] for r in rounds]

    # Finish date: when the league *actually* ended.
    #   - Deleted leagues: the delete timestamp, full stop.
    #   - Completed leagues: `now`, which is the snapshot creation time —
    #     the final round just tipped completed and triggered this call.
    # Previously we used max(voting_deadline) across completed rounds,
    # which is the *scheduled* deadline and can sit days in the future
    # if rounds were advanced manually or the league was cut short.
    if is_deleted:
        finish_dt = ensure_utc(deleted_at) if deleted_at else now
    elif completed_rounds:
        finish_dt = now
    else:
        finish_dt = ensure_utc(league.get("created_at")) or now

    # Members + standings seed.
    members_input = league.get("members", [])
    user_stats: dict[str, dict] = {}
    for m in members_input:
        user_stats[m["id"]] = {
            "user_id": m["id"],
            "username": m["username"],
            "total_points": 0,
            "wins": 0,
            "rounds_played": 0,
        }

    # N-1 point system across all completed rounds.
    all_subs = []
    all_votes = []
    if completed_round_ids:
        all_subs = await db.submissions.find(
            {"round_id": {"$in": completed_round_ids}},
            {"_id": 0, "id": 1, "round_id": 1, "user_id": 1},
        ).to_list(5000)
        all_votes = await db.votes.find(
            {"round_id": {"$in": completed_round_ids}},
            {"_id": 0, "round_id": 1, "voter_id": 1, "rankings": 1},
        ).to_list(5000)

    subs_by_round: dict[str, list] = {}
    votes_by_round: dict[str, list] = {}
    for s in all_subs:
        subs_by_round.setdefault(s["round_id"], []).append(s)
    for v in all_votes:
        votes_by_round.setdefault(v["round_id"], []).append(v)

    for r in completed_rounds:
        subs = subs_by_round.get(r["id"], [])
        votes = votes_by_round.get(r["id"], [])
        if not subs:
            continue
        num_subs = len(subs)
        num_to_rank = max(0, num_subs - 1)
        points: dict[str, int] = {s["id"]: 0 for s in subs}
        submitter_ids = {s["id"]: s["user_id"] for s in subs}
        voters_who_voted: set[str] = set()
        for v in votes:
            voters_who_voted.add(v.get("voter_id"))
            for idx, sid in enumerate(v.get("rankings", [])):
                pts = num_to_rank - idx
                if sid in points:
                    points[sid] += pts
        # See _finalize_round_lifetime: only pre-flag rounds still get the
        # redistribute-missing-voter treatment. New rounds forfeit the pool.
        if not r.get("forfeit_missing_voter_pools"):
            submitter_user_ids = set(submitter_ids.values())
            non_voters = submitter_user_ids - voters_who_voted
            if non_voters and num_subs > 1:
                total_pts_per_voter = sum(range(1, num_to_rank + 1))
                for nv_id in non_voters:
                    nv_sub_id = next((s["id"] for s in subs if s["user_id"] == nv_id), None)
                    others = [s["id"] for s in subs if s["id"] != nv_sub_id]
                    num_other = len(others)
                    if num_other > 0:
                        per = total_pts_per_voter // num_other
                        rem = total_pts_per_voter % num_other
                        for sid in others:
                            points[sid] += per
                        for i in range(rem):
                            points[others[i]] += 1
        max_pts = max(points.values()) if points else 0
        for s in subs:
            uid = s["user_id"]
            if uid in user_stats:
                p = points.get(s["id"], 0)
                user_stats[uid]["total_points"] += p
                user_stats[uid]["rounds_played"] += 1
                if p == max_pts and max_pts > 0:
                    user_stats[uid]["wins"] += 1

    active_standings = sorted(
        user_stats.values(),
        key=lambda x: (-x["total_points"], -x["wins"]),
    )

    # Users who left mid-league: render at the bottom of standings,
    # ranked among themselves by points_at_leave but always below all
    # active members regardless of point totals.
    raw_left = league.get("left_members") or []
    left_rows = []
    for lm in raw_left:
        uid = lm.get("user_id")
        if not uid:
            continue
        left_rows.append({
            "user_id": uid,
            "username": lm.get("username", ""),
            "total_points": int(lm.get("points_at_leave") or 0),
            "wins": 0,
            "rounds_played": 0,
            "left": True,
            "left_at": _iso(lm.get("left_at")),
        })
    left_rows.sort(key=lambda x: -x["total_points"])

    # Mark active rows so the frontend can filter / style consistently.
    for s in active_standings:
        s["left"] = False

    standings = active_standings + left_rows

    # Enrich members/standings with profile photos.
    member_ids = [m["id"] for m in members_input]
    left_user_ids = [r["user_id"] for r in left_rows]
    photo_lookup_ids = list({*member_ids, *left_user_ids})
    users = await db.users.find(
        {"id": {"$in": photo_lookup_ids}},
        {"_id": 0, "id": 1, "username": 1, "profile_photo": 1},
    ).to_list(500)
    photo_by_id = {u["id"]: u.get("profile_photo") for u in users}
    for s in standings:
        s["profile_photo"] = photo_by_id.get(s["user_id"])

    members = [
        {
            "user_id": m["id"],
            "username": m["username"],
            "profile_photo": photo_by_id.get(m["id"]),
        }
        for m in members_input
    ]

    # Winner is taken from active standings only — a user who left
    # before the league finished can never win the league overall, even
    # if their frozen point total tops the active set.
    winner = None
    if active_standings and active_standings[0]["total_points"] > 0:
        w = active_standings[0]
        winner = {
            "user_id": w["user_id"],
            "username": w["username"],
            "profile_photo": w.get("profile_photo"),
            "total_points": w["total_points"],
        }

    # Per-user submissions (everyone's — we filter per-viewer on read).
    round_by_id = {r["id"]: r for r in rounds}
    submissions_by_user: dict[str, list[dict]] = {}
    if all_round_ids:
        full_subs = await db.submissions.find(
            {"round_id": {"$in": all_round_ids}},
            {"_id": 0},
        ).to_list(5000)
        for s in full_subs:
            r = round_by_id.get(s.get("round_id")) or {}
            submitted_at = s.get("submitted_at")
            submissions_by_user.setdefault(s.get("user_id"), []).append(
                {
                    "submission_id": s.get("id"),
                    "round_id": s.get("round_id"),
                    "round_number": r.get("round_number"),
                    "round_theme": r.get("theme"),
                    "song": s.get("song"),
                    "submitted_at": _iso(submitted_at),
                }
            )
        for uid in list(submissions_by_user.keys()):
            submissions_by_user[uid].sort(key=lambda x: x.get("round_number") or 0)

    rounds_snapshot = [
        {
            "round_id": r["id"],
            "round_number": r.get("round_number"),
            "theme": r.get("theme"),
            "status": r.get("status"),
        }
        for r in rounds
    ]

    total_rounds = league.get("total_rounds", 0) or 0
    rounds_completed = len(completed_rounds)

    return {
        "id": league_id,
        "name": league.get("name"),
        "league_code": league.get("league_code"),
        "league_image": league.get("league_image"),
        "creator_id": league.get("creator_id"),
        "creator_username": league.get("creator_username"),
        "total_rounds": total_rounds,
        "rounds_completed": rounds_completed,
        "members_count": len(members_input),
        "member_ids": member_ids,
        "members": members,
        "left_members": left_rows,
        "is_deleted": is_deleted,
        "deleted_at": _iso(ensure_utc(deleted_at)) if is_deleted and deleted_at else None,
        "completed_at": _iso(finish_dt) if not is_deleted else None,
        "finished_at": _iso(finish_dt),
        "standings": standings,
        "winner": winner,
        "rounds": rounds_snapshot,
        "submissions_by_user": submissions_by_user,
        "snapshot_at": _iso(now),
    }


async def _save_past_league_snapshot(
    league_id: str,
    *,
    is_deleted: bool,
    deleted_at: Optional[datetime] = None,
    ended_status: Optional[str] = None,
) -> Optional[dict]:
    """Build and upsert a snapshot for the given league. Safe to call
    multiple times — re-snapshots update the existing document.

    `ended_status` is stored as a top-level field on the snapshot so the
    UI can distinguish between completed and not_finished snapshots.
    Pass "completed" for leagues that finished all rounds, or
    "not_finished" for admin-deleted mid-flight leagues. Legacy
    snapshots without this field are treated as "completed" by readers."""
    league = await db.leagues.find_one({"id": league_id})
    if not league:
        logger.warning(f"snapshot_save_fail: league={league_id} reason=not_found")
        return None
    league.pop("_id", None)
    try:
        snapshot = await _build_past_league_snapshot(
            league, is_deleted=is_deleted, deleted_at=deleted_at,
        )
    except Exception as e:
        logger.warning(f"snapshot_build_fail: league={league_id} error={e}")
        raise
    if ended_status:
        snapshot["ended_status"] = ended_status
    elif is_deleted:
        # No explicit status passed for a deleted snapshot: assume the
        # caller meant the early-termination flow.
        snapshot["ended_status"] = "not_finished"
    else:
        snapshot["ended_status"] = "completed"
    if league.get("creator_username") is not None:
        snapshot["deleted_by_username"] = league.get("creator_username") if is_deleted else None
    await db.past_leagues.update_one(
        {"id": league_id},
        {"$set": snapshot},
        upsert=True,
    )
    logger.info(
        f"snapshot_saved: league={league_id} "
        f"ended_status={snapshot['ended_status']} "
        f"members={len(snapshot.get('member_ids') or [])} "
        f"left_members={len(snapshot.get('left_members') or [])}"
    )
    return snapshot


# A round is in a "terminal" state once its lifecycle is over and it
# can't progress any further. "completed" is the normal end; "skipped"
# means the submission window expired with no songs and the round was
# auto-skipped. Both are valid end-states for the purpose of deciding
# whether a league as a whole has finished playing.
_TERMINAL_ROUND_STATUSES = ("completed", "skipped")


async def _maybe_snapshot_completed_league(league_id: str) -> None:
    """Snapshot to past_leagues if every planned round has reached a
    terminal state (completed or skipped). Returns silently if the
    league isn't ready yet, but logs every decision so a missing snapshot
    is diagnosable from the server log alone."""
    league = await db.leagues.find_one(
        {"id": league_id, "$or": [{"deleted_at": {"$exists": False}}, {"deleted_at": None}]},
    )
    if not league:
        logger.info(f"snapshot_skip: league={league_id} reason=not_found_or_deleted")
        return
    total = league.get("total_rounds", 0) or 0
    if total <= 0:
        logger.info(f"snapshot_skip: league={league_id} reason=total_rounds_zero")
        return
    all_rounds = await db.rounds.find(
        {"league_id": league_id},
        {"_id": 0, "status": 1, "round_number": 1},
    ).to_list(200)
    if len(all_rounds) < total:
        logger.info(
            f"snapshot_skip: league={league_id} reason=rounds_missing "
            f"have={len(all_rounds)} want={total}"
        )
        return
    not_terminal = [
        r for r in all_rounds
        if r.get("status") not in _TERMINAL_ROUND_STATUSES
    ]
    if not_terminal:
        logger.info(
            f"snapshot_skip: league={league_id} reason=rounds_not_terminal "
            f"pending={[r.get('round_number') for r in not_terminal]}"
        )
        return
    try:
        logger.info(f"snapshot_attempt: league={league_id} total_rounds={total}")
        # Mirror the league.status flip the auto-advance helper would do —
        # if every round is terminal but the league doc hasn't been
        # marked "completed" yet, do it here so /leagues/past callers
        # and the self-heal sweep see consistent state.
        if league.get("status") != "completed":
            await db.leagues.update_one(
                {"id": league_id},
                {"$set": {"status": "completed", "current_round": total}},
            )
            logger.info(f"league_status_completed: league={league_id}")
        await _save_past_league_snapshot(league_id, is_deleted=False)
        logger.info(f"snapshot_success: league={league_id}")
    except Exception as e:
        logger.warning(f"snapshot_fail: league={league_id} error={e}")


async def _backfill_past_leagues_for_user(user_id: str) -> None:
    """For legacy data: snapshot any league where the user is a member that
    is already past (completed or soft-deleted) but isn't in past_leagues.
    Safe, idempotent — runs a small amount of work per call and skips
    leagues that already have a snapshot.

    Respects the user's `gameplay_data_cleared_at`: if the league ended
    before the clear cutoff, we skip it so previously-cleared history
    doesn't re-materialize every time the user opens Past Leagues.
    """
    user_doc = await db.users.find_one(
        {"id": user_id},
        {"_id": 0, "gameplay_data_cleared_at": 1, "past_leagues_cleared_at": 1, "past_leagues_hidden": 1},
    )
    cleared_at = _effective_cleared_at(user_doc)
    hidden_ids: set[str] = set((user_doc or {}).get("past_leagues_hidden") or [])

    candidates = await db.leagues.find(
        {"members.id": user_id},
        {"_id": 0, "id": 1, "deleted_at": 1, "total_rounds": 1, "current_round": 1},
    ).to_list(500)
    for l in candidates:
        lid = l["id"]
        # Skip leagues the user has individually removed from their
        # past-leagues archive via swipe-to-delete.
        if lid in hidden_ids:
            continue
        existing = await db.past_leagues.find_one({"id": lid}, {"_id": 0, "id": 1})
        if existing:
            continue
        deleted_at = l.get("deleted_at")
        if deleted_at:
            deleted_dt = ensure_utc(deleted_at)
            # Pre-clear history: skip so the user's cleared view stays
            # clean. Other members' snapshots of this same league are
            # unaffected — they regenerate on their own fetches.
            if cleared_at and deleted_dt <= cleared_at:
                continue
            try:
                await _save_past_league_snapshot(lid, is_deleted=True, deleted_at=deleted_dt)
            except Exception as e:
                logger.warning(f"backfill snapshot (deleted) failed for {lid}: {e}")
            continue
        total = l.get("total_rounds", 0) or 0
        current = l.get("current_round", 0) or 0
        if total <= 0 or current < total:
            continue
        rounds = await db.rounds.find(
            {"league_id": lid},
            {"_id": 0, "status": 1, "voting_deadline": 1},
        ).to_list(500)
        if not rounds or len(rounds) < total:
            continue
        if not all(r.get("status") in _TERMINAL_ROUND_STATUSES for r in rounds):
            continue
        if cleared_at:
            # A completed league's "finished at" is the latest
            # voting_deadline across its rounds. Skip if that's before
            # the user's clear cutoff.
            latest_done = max(
                (ensure_utc(r.get("voting_deadline")) for r in rounds if r.get("voting_deadline")),
                default=None,
            )
            if latest_done and latest_done <= cleared_at:
                continue
        try:
            await _save_past_league_snapshot(lid, is_deleted=False)
        except Exception as e:
            logger.warning(f"backfill snapshot (completed) failed for {lid}: {e}")


def _view_past_league_for_user(doc: dict, user_id: str) -> dict:
    """Project a past_leagues document into the API response for viewer.

    `my_place` is computed against active rows only — a user in
    `left_members` would never see this view (the GET filter excludes
    them), so the rank we surface here is always the viewer's position
    among players who finished the league."""
    standings = doc.get("standings") or []
    # Rank only among active rows (left users don't compete for placement).
    active_rows = [s for s in standings if not s.get("left")]
    my_place = None
    for i, s in enumerate(active_rows):
        if s.get("user_id") == user_id:
            my_place = i + 1
            break
    subs_by_user = doc.get("submissions_by_user") or {}
    my_subs = subs_by_user.get(user_id, [])
    return {
        "id": doc.get("id"),
        "name": doc.get("name"),
        "league_code": doc.get("league_code"),
        "league_image": doc.get("league_image"),
        "creator_id": doc.get("creator_id"),
        "creator_username": doc.get("creator_username"),
        "total_rounds": doc.get("total_rounds", 0),
        "rounds_completed": doc.get("rounds_completed", 0),
        "members_count": doc.get("members_count", len(doc.get("members") or [])),
        "is_deleted": doc.get("is_deleted", False),
        "deleted_at": doc.get("deleted_at"),
        "finished_at": doc.get("finished_at"),
        # Resolve ended_status with legacy back-compat: docs predating
        # this field that were soft-deleted should still surface as
        # "not_finished" so the frontend NOT FINISHED treatment fires.
        # Cleanly-completed legacy snapshots default to "completed".
        "ended_status": doc.get("ended_status") or (
            "not_finished" if doc.get("is_deleted") else "completed"
        ),
        "my_place": my_place,
        "winner": doc.get("winner"),
        "standings": standings,
        "left_members": doc.get("left_members") or [],
        "my_submissions": my_subs,
        "rounds": doc.get("rounds") or [],
    }


class LeagueUpdate(BaseModel):
    league_image: Optional[str] = None

@api_router.put("/leagues/{league_id}", response_model=LeagueResponse)
async def update_league(league_id: str, update_data: LeagueUpdate, current_user: dict = Depends(get_current_user)):
    league = await db.leagues.find_one({"id": league_id})
    if not league:
        raise HTTPException(status_code=404, detail="League not found")
    
    # Only creator can update league
    if league["creator_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Only the league creator can update the league")
    
    update_fields = {}
    if update_data.league_image is not None:
        update_fields["league_image"] = update_data.league_image
    
    if update_fields:
        await db.leagues.update_one({"id": league_id}, {"$set": update_fields})

    # Fetch updated league
    league = await db.leagues.find_one({"id": league_id})
    # Keep the durable snapshot current so the inbox shows the latest photo.
    await _upsert_league_snapshot(league_id, league.get("name"), league.get("league_image"))
    return LeagueResponse(**add_league_defaults(league))

async def _compute_points_for_user(league_id: str, user_id: str) -> int:
    """Compute the user's accumulated points across every completed
    round of the league, using the same N-1 system as the standings
    endpoint. Used to freeze a leaving user's points_at_leave.
    Implementation mirrors get_league_standings."""
    completed_rounds = await db.rounds.find(
        {"league_id": league_id, "status": "completed"},
        {"_id": 0, "id": 1, "forfeit_missing_voter_pools": 1},
    ).to_list(200)
    if not completed_rounds:
        return 0

    round_ids = [r["id"] for r in completed_rounds]
    all_subs = await db.submissions.find(
        {"round_id": {"$in": round_ids}},
        {"_id": 0, "id": 1, "round_id": 1, "user_id": 1},
    ).to_list(2000)
    all_votes = await db.votes.find(
        {"round_id": {"$in": round_ids}},
        {"_id": 0, "round_id": 1, "voter_id": 1, "rankings": 1},
    ).to_list(2000)

    subs_by_round: dict[str, list] = {}
    votes_by_round: dict[str, list] = {}
    for s in all_subs:
        subs_by_round.setdefault(s["round_id"], []).append(s)
    for v in all_votes:
        votes_by_round.setdefault(v["round_id"], []).append(v)

    total = 0
    for r in completed_rounds:
        subs = subs_by_round.get(r["id"], [])
        votes = votes_by_round.get(r["id"], [])
        if not subs:
            continue
        num_subs = len(subs)
        num_to_rank = max(0, num_subs - 1)
        points: dict[str, int] = {s["id"]: 0 for s in subs}
        submitter_ids = {s["id"]: s["user_id"] for s in subs}
        voters_who_voted: set[str] = set()
        for v in votes:
            voters_who_voted.add(v.get("voter_id"))
            for idx, sid in enumerate(v.get("rankings", [])):
                if sid in points:
                    points[sid] += (num_to_rank - idx)
        if not r.get("forfeit_missing_voter_pools"):
            submitter_user_ids = set(submitter_ids.values())
            non_voters = submitter_user_ids - voters_who_voted
            if non_voters and num_subs > 1:
                total_pts_per_voter = sum(range(1, num_to_rank + 1))
                for nv_id in non_voters:
                    nv_sub_id = next(
                        (s["id"] for s in subs if s["user_id"] == nv_id), None
                    )
                    others = [s["id"] for s in subs if s["id"] != nv_sub_id]
                    if others:
                        per = total_pts_per_voter // len(others)
                        rem = total_pts_per_voter % len(others)
                        for sid in others:
                            points[sid] += per
                        for i in range(rem):
                            points[others[i]] += 1
        for s in subs:
            if s["user_id"] == user_id:
                total += points.get(s["id"], 0)
    return int(total)


@api_router.post("/leagues/{league_id}/leave")
async def leave_league(league_id: str, current_user: dict = Depends(get_current_user)):
    """Leave a league.

    Two distinct flows depending on whether the league has started:

    - **Not started** (no round has ever entered submission/voting/etc): the
      caller is removed from `members` outright. Creator transfer or
      hard-delete-if-sole-member apply, as before.
    - **Active** (at least one round is in or past submission): the caller
      is moved into `left_members` instead of being removed from `members`.
      Their accumulated points freeze at the moment of leaving and they're
      blocked from submitting/voting going forward, but their existing
      submissions and votes stay in place as historical record. The user
      will not see this league in their Past Leagues — they didn't finish.

    Creators can never use this endpoint to abandon an active league —
    they should delete it (which now creates a `not_finished` snapshot)
    or transfer creatorship by leaving before the league starts."""
    league = await db.leagues.find_one({"id": league_id})
    if not league:
        raise HTTPException(status_code=404, detail="League not found")
    if league.get("deleted_at"):
        raise HTTPException(status_code=404, detail="League not found")
    if league.get("status") == "completed":
        raise HTTPException(status_code=400, detail="This league has already ended.")

    user_id = current_user["id"]
    members = league.get("members", [])
    if not any(m.get("id") == user_id for m in members):
        raise HTTPException(status_code=400, detail="You are not a member of this league.")

    # Has the league actually started playing? "Started" means any round
    # has moved past the pre-start states.
    started_round = await db.rounds.find_one(
        {
            "league_id": league_id,
            "status": {"$in": ["submission", "voting", "completed", "skipped"]},
        },
        {"_id": 0, "id": 1},
    )
    league_active = started_round is not None
    is_creator = league.get("creator_id") == user_id

    # Active league + non-creator: this is the new "Leave" flow. The user
    # surrenders future participation but keeps their accrued points
    # frozen at points_at_leave.
    if league_active and not is_creator:
        # Don't double-record someone who already left.
        existing_left = league.get("left_members") or []
        if any(lm.get("user_id") == user_id for lm in existing_left):
            raise HTTPException(status_code=400, detail="You have already left this league.")
        # Compute points at leave from completed-round results, mirroring
        # the standings endpoint's N-1 system.
        points_at_leave = await _compute_points_for_user(league_id, user_id)
        username = next(
            (m.get("username") for m in members if m.get("id") == user_id),
            current_user.get("username", ""),
        )
        now = datetime.now(timezone.utc)
        await db.leagues.update_one(
            {"id": league_id},
            {
                "$pull": {"members": {"id": user_id}},
                "$push": {
                    "left_members": {
                        "user_id": user_id,
                        "username": username,
                        "points_at_leave": int(points_at_leave),
                        "left_at": now,
                    }
                },
            },
        )
        logger.info(
            f"league_leave_active: league={league_id} user={user_id} "
            f"points_at_leave={points_at_leave}"
        )
        return {
            "message": "Left league successfully",
            "left_active_league": True,
            "points_at_leave": int(points_at_leave),
        }

    if league_active and is_creator:
        # Creators can't leave an active league — they must delete it,
        # which now snapshots the league as not_finished.
        raise HTTPException(
            status_code=400,
            detail="Creators can't leave an active league. Delete the league instead.",
        )

    remaining = [m for m in members if m.get("id") != user_id]

    # Sole member leaving: hard-delete the league and its pre-generated
    # rounds so we don't leave empty zombies behind.
    if not remaining:
        round_docs = await db.rounds.find(
            {"league_id": league_id}, {"_id": 0, "id": 1},
        ).to_list(5000)
        round_ids = [r["id"] for r in round_docs]
        if round_ids:
            await db.submissions.delete_many({"round_id": {"$in": round_ids}})
            await db.votes.delete_many({"round_id": {"$in": round_ids}})
            await db.round_results.delete_many({"round_id": {"$in": round_ids}})
        await db.rounds.delete_many({"league_id": league_id})
        await db.messages.delete_many({"league_id": league_id})
        await db.chat_reads.delete_many({"league_id": league_id})
        await db.league_snapshots.delete_many({"league_id": league_id})
        await db.past_leagues.delete_many({"id": league_id})
        await db.leagues.delete_many({"id": league_id})
        return {"message": "Left league successfully", "league_deleted": True}

    # Creator leaving but others remain: transfer creatorship to the
    # first remaining member (mirrors the users_me_delete transfer).
    if league.get("creator_id") == user_id:
        heir = remaining[0]
        await db.leagues.update_one(
            {"id": league_id},
            {"$set": {
                "creator_id": heir["id"],
                "creator_username": heir.get("username", ""),
            }},
        )

    await db.leagues.update_one(
        {"id": league_id},
        {"$pull": {"members": {"id": user_id}}},
    )
    return {"message": "Left league successfully"}

# ==================== ROUND ENDPOINTS ====================

@api_router.post("/leagues/{league_id}/rounds", response_model=RoundResponse)
async def create_round(league_id: str, round_data: StartRoundRequest = None, current_user: dict = Depends(get_current_user)):
    league = await db.leagues.find_one({"id": league_id})
    if not league:
        raise HTTPException(status_code=404, detail="League not found")
    
    # Only creator can start rounds
    if league["creator_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Only the league creator can start new rounds")
    
    # Check if there's an active round
    active_round = await db.rounds.find_one({
        "league_id": league_id,
        "status": {"$in": ["submission", "voting"]}
    })
    if active_round:
        raise HTTPException(status_code=400, detail="There is already an active round")
    
    # Check if league has reached max rounds
    total_rounds = league.get("total_rounds", 0)
    if total_rounds > 0 and league["current_round"] >= total_rounds:
        raise HTTPException(status_code=400, detail="League has reached maximum number of rounds")
    
    # Require round_data for theme and times
    if not round_data:
        raise HTTPException(status_code=400, detail="Round configuration required (theme, submission_hours, voting_hours)")

    # Defense in depth: custom per-round durations must land in the
    # allowed set, same as league-create.
    _validate_phase_hours("submission_hours", round_data.submission_hours)
    _validate_phase_hours("voting_hours", round_data.voting_hours)

    round_number = league["current_round"] + 1
    round_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)

    # Use theme and times from round_data
    submission_hours = round_data.submission_hours
    voting_hours = round_data.voting_hours
    theme = round_data.theme
    user_timezone = round_data.timezone
    
    # Calculate deadlines using timezone-aware function for "same clock time"
    submission_deadline = calculate_deadline(submission_hours, user_timezone)
    # For voting deadline, calculate from the submission deadline end time
    # We need to add voting hours to the submission deadline
    voting_deadline = submission_deadline + relativedelta(days=voting_hours // 24) if voting_hours >= 24 else submission_deadline + timedelta(hours=voting_hours)
    
    round_doc = {
        "id": round_id,
        "league_id": league_id,
        "round_number": round_number,
        "theme": theme,
        "status": "submission",
        "submission_hours": submission_hours,
        "voting_hours": voting_hours,
        "submission_deadline": submission_deadline,
        "voting_deadline": voting_deadline,
        "created_at": now
    }
    await db.rounds.insert_one(round_doc)
    
    # Update league current round
    await db.leagues.update_one(
        {"id": league_id},
        {"$set": {"current_round": round_number}}
    )
    
    return RoundResponse(
        **round_doc,
        submissions_count=0,
        votes_count=0,
        total_members=len(league["members"]),
        has_user_submitted=False,
        has_user_voted=False,
        user_vote_locked=False
    )

@api_router.get("/leagues/{league_id}/rounds", response_model=List[RoundResponse])
async def get_rounds(league_id: str, current_user: dict = Depends(get_current_user)):
    league_full = await db.leagues.find_one({"id": league_id}, {"_id": 0})
    if not league_full:
        raise HTTPException(status_code=404, detail="League not found")

    total_members = len(league_full.get("members", []))

    # Lazy backfill: for leagues that were created before the pre-generate
    # model, ensure every round 1..total_rounds exists. Any missing numbers
    # are created as locked rounds; if zero rounds exist we also start R1
    # as active so the league has a live phase.
    planned_total = league_full.get("total_rounds", 0) or 0
    if planned_total > 0:
        try:
            await _pregenerate_rounds(
                league_id=league_id,
                total_rounds=planned_total,
                submission_hours=league_full.get("submission_hours") or 48,
                voting_hours=league_full.get("voting_hours") or 72,
                themes=league_full.get("themes") or [],
            )
        except Exception as e:
            logger.warning(f"lazy pregenerate for {league_id} failed: {e}")

    rounds = await db.rounds.find({"league_id": league_id}, {"_id": 0}).sort("round_number", 1).to_list(200)

    if not rounds:
        return []
    
    # Batch fetch: Get all round IDs
    round_ids = [r["id"] for r in rounds]
    
    # Batch fetch submissions counts using aggregation
    submissions_pipeline = [
        {"$match": {"round_id": {"$in": round_ids}}},
        {"$group": {"_id": "$round_id", "count": {"$sum": 1}}}
    ]
    submissions_counts = {doc["_id"]: doc["count"] async for doc in db.submissions.aggregate(submissions_pipeline)}
    
    # Batch fetch votes counts using aggregation
    votes_pipeline = [
        {"$match": {"round_id": {"$in": round_ids}}},
        {"$group": {"_id": "$round_id", "count": {"$sum": 1}}}
    ]
    votes_counts = {doc["_id"]: doc["count"] async for doc in db.votes.aggregate(votes_pipeline)}
    
    # Batch fetch user's submissions with locked status
    user_submissions = await db.submissions.find(
        {"round_id": {"$in": round_ids}, "user_id": current_user["id"]},
        {"_id": 0, "round_id": 1, "locked": 1}
    ).to_list(100)
    user_submitted_rounds = {s["round_id"] for s in user_submissions}
    user_submissions_map = {s["round_id"]: s.get("locked", False) for s in user_submissions}
    
    # Batch fetch user's votes
    user_votes = await db.votes.find(
        {"round_id": {"$in": round_ids}, "voter_id": current_user["id"]},
        {"_id": 0, "round_id": 1, "locked": 1}
    ).to_list(100)
    user_votes_map = {v["round_id"]: v.get("locked", False) for v in user_votes}
    
    result = []
    now = datetime.now(timezone.utc)
    
    for round_doc in rounds:
        round_id = round_doc["id"]
        status = round_doc["status"]
        
        # Auto-advance logic: check if deadline passed
        submission_deadline = ensure_utc(round_doc.get("submission_deadline"))
        voting_deadline_dt = ensure_utc(round_doc.get("voting_deadline"))
        
        if status == "submission" and submission_deadline < now:
            # Auto-lock all unlocked submissions and advance to voting
            await db.submissions.update_many(
                {"round_id": round_id, "locked": {"$ne": True}},
                {"$set": {"locked": True}}
            )
            voting_hours = round_doc.get("voting_hours", 72)
            new_voting_deadline = now + timedelta(hours=voting_hours)
            await db.rounds.update_one(
                {"id": round_id},
                {"$set": {
                    "status": "voting",
                    "voting_deadline": new_voting_deadline,
                    "forfeit_missing_voter_pools": True,
                }}
            )
            status = "voting"
            round_doc["status"] = status
            round_doc["voting_deadline"] = new_voting_deadline
            round_doc["forfeit_missing_voter_pools"] = True

        elif status == "voting" and voting_deadline_dt < now:
            # Same transition as the scheduler — delegate to the helper so
            # the unlock step can't get skipped on the read path.
            await _complete_round_and_unlock_next(round_doc, now)
            status = round_doc["status"]

        result.append(RoundResponse(
            **round_doc,
            submissions_count=submissions_counts.get(round_id, 0),
            votes_count=votes_counts.get(round_id, 0),
            total_members=total_members,
            has_user_submitted=round_id in user_submitted_rounds,
            has_user_voted=round_id in user_votes_map,
            user_vote_locked=user_votes_map.get(round_id, False),
            user_submission_locked=user_submissions_map.get(round_id, False)
        ))
    
    return result

@api_router.get("/rounds/{round_id}", response_model=RoundResponse)
async def get_round(round_id: str, current_user: dict = Depends(get_current_user)):
    round_doc = await db.rounds.find_one({"id": round_id}, {"_id": 0})
    if not round_doc:
        raise HTTPException(status_code=404, detail="Round not found")
    
    # Get league to count members
    league = await db.leagues.find_one({"id": round_doc["league_id"]})
    total_members = len(league.get("members", [])) if league else 0
    
    now = datetime.now(timezone.utc)
    status = round_doc["status"]
    
    # Auto-advance logic: check if deadline passed
    submission_deadline = ensure_utc(round_doc.get("submission_deadline"))
    voting_deadline = ensure_utc(round_doc.get("voting_deadline"))
    
    if status == "submission" and submission_deadline < now:
        # Auto-lock all unlocked submissions and advance to voting
        await db.submissions.update_many(
            {"round_id": round_id, "locked": {"$ne": True}},
            {"$set": {"locked": True}}
        )
        voting_hours = round_doc.get("voting_hours", 72)
        new_voting_deadline = now + timedelta(hours=voting_hours)
        await db.rounds.update_one(
            {"id": round_id},
            {"$set": {
                "status": "voting",
                "voting_deadline": new_voting_deadline,
                "forfeit_missing_voter_pools": True,
            }}
        )
        status = "voting"
        round_doc["status"] = status
        round_doc["voting_deadline"] = new_voting_deadline
        round_doc["forfeit_missing_voter_pools"] = True

    elif status == "voting" and voting_deadline < now:
        # Shared voting → completed transition. The helper also unlocks
        # the next round so the single-round fetch path doesn't leak a
        # stuck league.
        await _complete_round_and_unlock_next(round_doc, now)
        status = round_doc["status"]

    submissions_count = await db.submissions.count_documents({"round_id": round_id})
    votes_count = await db.votes.count_documents({"round_id": round_id})
    
    user_submission = await db.submissions.find_one({
        "round_id": round_id,
        "user_id": current_user["id"]
    })
    has_submitted = user_submission is not None
    user_submission_locked = user_submission.get("locked", False) if user_submission else False
    
    user_vote = await db.votes.find_one({
        "round_id": round_id,
        "voter_id": current_user["id"]
    })
    has_voted = user_vote is not None
    user_vote_locked = user_vote.get("locked", False) if user_vote else False
    
    return RoundResponse(
        **round_doc,
        submissions_count=submissions_count,
        votes_count=votes_count,
        total_members=total_members,
        has_user_submitted=has_submitted,
        has_user_voted=has_voted,
        user_vote_locked=user_vote_locked,
        user_submission_locked=user_submission_locked
    )

@api_router.post("/leagues/{league_id}/rounds/{round_number}/start", response_model=RoundResponse)
async def start_round(
    league_id: str,
    round_number: int,
    current_user: dict = Depends(get_current_user),
):
    """Transition a round from `ready` to `submission`, setting real
    deadlines from the league's configured submission/voting hours. Only
    the league creator can call this.
    """
    league = await db.leagues.find_one({"id": league_id})
    if not league:
        raise HTTPException(status_code=404, detail="League not found")
    if league.get("creator_id") != current_user["id"]:
        raise HTTPException(
            status_code=403, detail="Only the league creator can start a round",
        )

    round_doc = await db.rounds.find_one(
        {"league_id": league_id, "round_number": round_number},
    )
    if not round_doc:
        raise HTTPException(status_code=404, detail="Round not found")
    if round_doc.get("status") != "ready":
        raise HTTPException(
            status_code=400,
            detail=f"Round is not ready to start (status: {round_doc.get('status')})",
        )

    now = datetime.now(timezone.utc)
    sub_hours = (
        round_doc.get("submission_hours")
        or league.get("submission_hours")
        or 48
    )
    vote_hours = (
        round_doc.get("voting_hours") or league.get("voting_hours") or 72
    )
    new_sub_deadline = now + timedelta(hours=sub_hours)
    new_vote_deadline = new_sub_deadline + timedelta(hours=vote_hours)

    await db.rounds.update_one(
        {"id": round_doc["id"]},
        {"$set": {
            "status": "submission",
            "submission_deadline": new_sub_deadline,
            "voting_deadline": new_vote_deadline,
        }},
    )
    # Make sure current_round reflects this round in case the league was
    # created before we started bumping current_round at creation time.
    if (league.get("current_round") or 0) < round_number:
        await db.leagues.update_one(
            {"id": league_id},
            {"$set": {"current_round": round_number}},
        )

    logger.info(
        f"round_started: league={league_id} round={round_number} "
        f"by={current_user['id']} sub_deadline={new_sub_deadline.isoformat()}"
    )

    # Return the updated round using the same response shape as get_round.
    round_doc["status"] = "submission"
    round_doc["submission_deadline"] = new_sub_deadline
    round_doc["voting_deadline"] = new_vote_deadline
    submissions_count = await db.submissions.count_documents({"round_id": round_doc["id"]})
    return RoundResponse(
        **round_doc,
        submissions_count=submissions_count,
        votes_count=0,
        total_members=len(league.get("members", [])),
        has_user_submitted=False,
        has_user_voted=False,
        user_vote_locked=False,
        user_submission_locked=False,
    )


@api_router.post("/rounds/{round_id}/advance")
async def advance_round(round_id: str, current_user: dict = Depends(get_current_user)):
    """Manually advance round status (for testing or when deadlines pass)"""
    round_doc = await db.rounds.find_one({"id": round_id})
    if not round_doc:
        raise HTTPException(status_code=404, detail="Round not found")
    
    league = await db.leagues.find_one({"id": round_doc["league_id"]})
    if league["creator_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Only league creator can advance rounds")
    
    if round_doc["status"] == "submission":
        # Reset voting deadline to start from NOW when advancing to voting
        # Use the round's voting_hours (set when round was created)
        now = datetime.now(timezone.utc)
        voting_hours = round_doc.get("voting_hours", 72)
        new_voting_deadline = now + timedelta(hours=voting_hours)
        await db.rounds.update_one(
            {"id": round_id},
            {"$set": {
                "status": "voting",
                "voting_deadline": new_voting_deadline,
                "forfeit_missing_voter_pools": True,
            }}
        )
        return {"message": "Round advanced to voting phase"}
    elif round_doc["status"] == "voting":
        # Same transition as the scheduler / lazy paths. The helper locks
        # remaining votes, finalizes stats, snapshots the past league if
        # this was the last round, and unlocks the next one.
        now = datetime.now(timezone.utc)
        await _complete_round_and_unlock_next(round_doc, now)
        return {"message": "Round completed"}
    else:
        return {"message": "Round is already completed"}

@api_router.post("/rounds/{round_id}/reopen-submission")
async def reopen_submission(round_id: str, request: ReopenSubmissionRequest, current_user: dict = Depends(get_current_user)):
    """Allow league creator to reopen submission for a specific user who missed the deadline.
    Grants a 2-hour window. When they submit, they go straight to voting but voting deadline stays the same."""
    round_doc = await db.rounds.find_one({"id": round_id})
    if not round_doc:
        raise HTTPException(status_code=404, detail="Round not found")
    
    league = await db.leagues.find_one({"id": round_doc["league_id"]})
    if league["creator_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Only league creator can reopen submissions")
    
    # Can only reopen during voting phase (when submission has closed)
    if round_doc["status"] != "voting":
        raise HTTPException(status_code=400, detail="Can only reopen submissions during voting phase")
    
    # Check if user is a member of the league
    user_is_member = any(m["id"] == request.user_id for m in league["members"])
    if not user_is_member:
        raise HTTPException(status_code=400, detail="User is not a member of this league")
    
    # Check if user has already submitted
    existing_submission = await db.submissions.find_one({"round_id": round_id, "user_id": request.user_id})
    if existing_submission:
        raise HTTPException(status_code=400, detail="User has already submitted")
    
    # Get user details for notification
    target_user = await db.users.find_one({"id": request.user_id}, {"_id": 0, "username": 1})
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Calculate 2-hour extension deadline from now
    extension_deadline = datetime.now(timezone.utc) + timedelta(hours=2)
    
    # Store the extension in the round's "extended_submissions" list
    extension_record = {
        "user_id": request.user_id,
        "username": target_user["username"],
        "deadline": extension_deadline,
        "granted_at": datetime.now(timezone.utc),
        "granted_by": current_user["id"]
    }
    
    # Add to extended_submissions array (create if doesn't exist)
    await db.rounds.update_one(
        {"id": round_id},
        {"$push": {"extended_submissions": extension_record}}
    )
    
    return {
        "message": f"Submission reopened for {target_user['username']}",
        "user_id": request.user_id,
        "deadline": extension_deadline.isoformat()
    }

@api_router.get("/rounds/{round_id}/missing-submissions")
async def get_missing_submissions(round_id: str, current_user: dict = Depends(get_current_user)):
    """Get list of users who haven't submitted a song for this round (only for league creator)"""
    round_doc = await db.rounds.find_one({"id": round_id})
    if not round_doc:
        raise HTTPException(status_code=404, detail="Round not found")
    
    league = await db.leagues.find_one({"id": round_doc["league_id"]})
    if league["creator_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Only league creator can view missing submissions")
    
    # Get all submissions for this round
    submissions = await db.submissions.find({"round_id": round_id}).to_list(100)
    submitted_user_ids = {sub["user_id"] for sub in submissions}
    
    # Get extended submissions
    extended_submissions = round_doc.get("extended_submissions", [])
    extended_user_ids = {ext["user_id"] for ext in extended_submissions}
    
    # Find members who haven't submitted
    missing_users = []
    for member in league["members"]:
        if member["id"] not in submitted_user_ids:
            # Check if they have an active extension
            has_extension = member["id"] in extended_user_ids
            extension_deadline = None
            if has_extension:
                ext = next((e for e in extended_submissions if e["user_id"] == member["id"]), None)
                if ext:
                    extension_deadline = ext["deadline"].isoformat() if isinstance(ext["deadline"], datetime) else ext["deadline"]
            
            missing_users.append({
                "user_id": member["id"],
                "username": member["username"],
                "has_extension": has_extension,
                "extension_deadline": extension_deadline
            })
    
    return {
        "round_id": round_id,
        "round_status": round_doc["status"],
        "missing_users": missing_users
    }

# ==================== SUBMISSION ENDPOINTS ====================

async def _ensure_caller_is_active_member(round_doc: dict, user_id: str) -> None:
    """Reject submission/vote attempts from users who left the league.

    A user in `league.left_members` is no longer eligible to participate —
    their existing submissions/votes from before they left stay intact,
    but they can't add new ones. Raises 403 if the caller has left."""
    league = await db.leagues.find_one(
        {"id": round_doc["league_id"]},
        {"_id": 0, "left_members": 1},
    )
    if not league:
        return
    left_members = league.get("left_members") or []
    if any(lm.get("user_id") == user_id for lm in left_members):
        raise HTTPException(
            status_code=403,
            detail="You left this league and can no longer participate.",
        )


@api_router.post("/rounds/{round_id}/submit", response_model=SubmissionResponse)
async def submit_song(round_id: str, request: SubmitSongRequest, current_user: dict = Depends(get_current_user)):
    round_doc = await db.rounds.find_one({"id": round_id})
    if not round_doc:
        raise HTTPException(status_code=404, detail="Round not found")

    await _ensure_caller_is_active_member(round_doc, current_user["id"])

    # Check if user has an extended submission window (during voting phase)
    has_extension = False
    if round_doc["status"] == "voting":
        extended_submissions = round_doc.get("extended_submissions", [])
        user_extension = next((ext for ext in extended_submissions if ext["user_id"] == current_user["id"]), None)
        if user_extension:
            # Check if extension is still valid
            if datetime.now(timezone.utc) < user_extension["deadline"]:
                has_extension = True
            else:
                raise HTTPException(status_code=400, detail="Your extended submission window has expired")
    
    if round_doc["status"] != "submission" and not has_extension:
        raise HTTPException(status_code=400, detail="Submissions are closed for this round")
    
    # Check if user already submitted
    existing = await db.submissions.find_one({
        "round_id": round_id,
        "user_id": current_user["id"]
    })
    
    if existing:
        # If existing submission is locked, cannot change
        if existing.get("locked", False):
            raise HTTPException(status_code=400, detail="Your submission is locked and cannot be changed")

        # Update existing submission
        await db.submissions.update_one(
            {"id": existing["id"]},
            {"$set": {
                "song": request.song.dict(),
                "locked": request.locked,
                "submitted_at": datetime.now(timezone.utc)
            }}
        )
        updated = await db.submissions.find_one({"id": existing["id"]})
        # Mirror into the permanent per-user submissions history (idempotent).
        try:
            await _record_user_submission(current_user, round_doc, updated)
        except Exception as e:
            logger.warning(f"user_submissions sync failed: {e}")
        return SubmissionResponse(**updated)

    # Create new submission
    submission_id = str(uuid.uuid4())
    submission = {
        "id": submission_id,
        "round_id": round_id,
        "user_id": current_user["id"],
        "username": current_user["username"],
        "song": request.song.dict(),
        "locked": request.locked,
        "submitted_at": datetime.now(timezone.utc)
    }
    await db.submissions.insert_one(submission)

    # Permanent lifetime record + bump submission counter on the user doc.
    try:
        await _record_user_submission(current_user, round_doc, submission)
        await db.users.update_one(
            {"id": current_user["id"]},
            {"$inc": {"total_submissions": 1}},
        )
    except Exception as e:
        logger.warning(f"user_submissions insert failed: {e}")

    # If this was an extended submission, remove the extension record
    if has_extension:
        await db.rounds.update_one(
            {"id": round_id},
            {"$pull": {"extended_submissions": {"user_id": current_user["id"]}}}
        )

    return SubmissionResponse(**submission)

@api_router.get("/rounds/{round_id}/submissions", response_model=List[SubmissionResponse])
async def get_submissions(round_id: str, current_user: dict = Depends(get_current_user)):
    round_doc = await db.rounds.find_one({"id": round_id})
    if not round_doc:
        raise HTTPException(status_code=404, detail="Round not found")
    
    # During submission phase, only show own submission
    # During voting/completed, show all (but hide usernames during voting)
    submissions = await db.submissions.find({"round_id": round_id}).to_list(100)
    
    result = []
    for sub in submissions:
        # During voting phase, hide who submitted (except own submission)
        if round_doc["status"] == "voting" and sub["user_id"] != current_user["id"]:
            sub["username"] = "???"
            sub["user_id"] = "hidden"
        result.append(SubmissionResponse(**sub))
    
    return result

# ==================== VOTING ENDPOINTS ====================

@api_router.post("/rounds/{round_id}/vote", response_model=VoteResponse)
async def submit_vote(round_id: str, request: VoteRequest, current_user: dict = Depends(get_current_user)):
    round_doc = await db.rounds.find_one({"id": round_id})
    if not round_doc:
        raise HTTPException(status_code=404, detail="Round not found")

    await _ensure_caller_is_active_member(round_doc, current_user["id"])

    if round_doc["status"] != "voting":
        raise HTTPException(status_code=400, detail="Voting is not open for this round")
    
    # Only users who submitted in this round may vote — missing submitters
    # forfeit their vote (and their point pool is forfeit at finalize time).
    user_submission = await db.submissions.find_one({
        "round_id": round_id,
        "user_id": current_user["id"]
    })
    if not user_submission:
        raise HTTPException(
            status_code=403,
            detail="You didn't submit this round, so you can't vote on it.",
        )
    
    # Check if user already voted
    existing = await db.votes.find_one({
        "round_id": round_id,
        "voter_id": current_user["id"]
    })
    
    # Validate all submission IDs exist and user isn't voting for themselves
    for sub_id in request.rankings:
        sub = await db.submissions.find_one({"id": sub_id, "round_id": round_id})
        if not sub:
            raise HTTPException(status_code=400, detail=f"Invalid submission ID: {sub_id}")
        if sub["user_id"] == current_user["id"]:
            raise HTTPException(status_code=400, detail="You cannot vote for your own submission")
    
    if existing:
        # Check if vote is already locked
        if existing.get("locked", False):
            raise HTTPException(status_code=400, detail="Your vote is locked and cannot be changed")
        
        # Update existing vote
        await db.votes.update_one(
            {"id": existing["id"]},
            {"$set": {"rankings": request.rankings, "locked": request.locked, "updated_at": datetime.now(timezone.utc)}}
        )
        existing["rankings"] = request.rankings
        existing["locked"] = request.locked
        return VoteResponse(
            id=existing["id"],
            round_id=round_id,
            user_id=current_user["id"],
            rankings=request.rankings,
            locked=request.locked,
            created_at=existing.get("created_at", existing.get("voted_at", datetime.now(timezone.utc)))
        )
    
    # Create new vote
    vote_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    vote = {
        "id": vote_id,
        "round_id": round_id,
        "voter_id": current_user["id"],
        "rankings": request.rankings,
        "locked": request.locked,
        "created_at": now,
        "voted_at": now
    }
    await db.votes.insert_one(vote)
    
    return VoteResponse(
        id=vote_id,
        round_id=round_id,
        user_id=current_user["id"],
        rankings=request.rankings,
        locked=request.locked,
        created_at=now
    )

@api_router.get("/rounds/{round_id}/my-vote", response_model=VoteResponse)
async def get_my_vote(round_id: str, current_user: dict = Depends(get_current_user)):
    """Get current user's vote for a round"""
    vote = await db.votes.find_one({
        "round_id": round_id,
        "voter_id": current_user["id"]
    })
    if not vote:
        raise HTTPException(status_code=404, detail="No vote found")
    
    return VoteResponse(
        id=vote["id"],
        round_id=round_id,
        user_id=current_user["id"],
        rankings=vote["rankings"],
        locked=vote.get("locked", False),
        created_at=vote.get("created_at", vote.get("voted_at", datetime.now(timezone.utc)))
    )

@api_router.get("/leagues/{league_id}/standings", response_model=LeagueStandingsResponse)
async def get_league_standings(league_id: str, current_user: dict = Depends(get_current_user)):
    """Get accumulated standings for all members in a league.

    Active members are ranked normally by points (descending). Users in
    `left_members` always render below all active members, regardless of
    their points_at_leave totals — they're frozen at the moment they
    left and shouldn't compete with people who are still playing."""
    league = await db.leagues.find_one({"id": league_id})
    if not league:
        raise HTTPException(status_code=404, detail="League not found")

    # Get all completed rounds
    completed_rounds = await db.rounds.find({
        "league_id": league_id,
        "status": "completed"
    }).to_list(100)

    # Calculate accumulated points and wins for each user
    user_stats = {}
    for member in league["members"]:
        user_stats[member["id"]] = {
            "user_id": member["id"],
            "username": member["username"],
            "total_points": 0,
            "wins": 0,
            "rounds_played": 0,
            "left": False,
        }

    left_members = league.get("left_members") or []

    def _build_response(active_stats: dict) -> LeagueStandingsResponse:
        active_sorted = sorted(
            active_stats.values(),
            key=lambda x: (-x["total_points"], -x["wins"]),
        )
        # Left members always render below active members. Sort among
        # themselves by points_at_leave descending so the listing has
        # some predictable order.
        left_rows = sorted(
            (
                {
                    "user_id": lm.get("user_id"),
                    "username": lm.get("username", ""),
                    "total_points": int(lm.get("points_at_leave") or 0),
                    "wins": 0,
                    "rounds_played": 0,
                    "left": True,
                }
                for lm in left_members
                if lm.get("user_id")
            ),
            key=lambda x: -x["total_points"],
        )
        return LeagueStandingsResponse(
            league_id=league_id,
            standings=active_sorted + left_rows,
            rounds_completed=len(completed_rounds),
            total_rounds=league.get("total_rounds", 0),
        )

    if not completed_rounds:
        return _build_response(user_stats)
    
    # Batch fetch all submissions and votes for completed rounds
    round_ids = [r["id"] for r in completed_rounds]
    all_submissions = await db.submissions.find({
        "round_id": {"$in": round_ids}
    }, {"_id": 0, "id": 1, "round_id": 1, "user_id": 1}).to_list(1000)
    all_votes = await db.votes.find({
        "round_id": {"$in": round_ids}
    }, {"_id": 0, "round_id": 1, "voter_id": 1, "rankings": 1}).to_list(1000)
    
    # Group by round_id
    submissions_by_round = {}
    votes_by_round = {}
    for sub in all_submissions:
        submissions_by_round.setdefault(sub["round_id"], []).append(sub)
    for vote in all_votes:
        votes_by_round.setdefault(vote["round_id"], []).append(vote)
    
    for round_doc in completed_rounds:
        submissions = submissions_by_round.get(round_doc["id"], [])
        votes = votes_by_round.get(round_doc["id"], [])
        
        if not submissions:
            continue
        
        num_submissions = len(submissions)
        num_songs_to_rank = num_submissions - 1  # Can't vote for yourself
        
        # Calculate points for this round using N-1 system
        points = {}
        submitter_ids = {}
        for sub in submissions:
            points[sub["id"]] = 0
            submitter_ids[sub["id"]] = sub["user_id"]
        
        # Points from actual votes
        voters_who_voted = set()
        for vote in votes:
            voter_id = vote.get("voter_id")
            voters_who_voted.add(voter_id)
            for rank_index, sub_id in enumerate(vote["rankings"]):
                pts = num_songs_to_rank - rank_index
                points[sub_id] = points.get(sub_id, 0) + pts
        
        # Legacy rule: auto-distribute non-voter pools. New rounds
        # (forfeit_missing_voter_pools) drop the missing voter's pool.
        if not round_doc.get("forfeit_missing_voter_pools"):
            submitter_user_ids = set(submitter_ids.values())
            non_voters = submitter_user_ids - voters_who_voted

            if non_voters and num_submissions > 1:
                total_points_per_voter = sum(range(1, num_songs_to_rank + 1))
                for non_voter_id in non_voters:
                    non_voter_sub_id = None
                    for sub in submissions:
                        if sub["user_id"] == non_voter_id:
                            non_voter_sub_id = sub["id"]
                            break
                    other_subs = [sub["id"] for sub in submissions if sub["id"] != non_voter_sub_id]
                    num_other = len(other_subs)
                    if num_other > 0:
                        pts_per_song = total_points_per_voter // num_other
                        remainder = total_points_per_voter % num_other
                        for sub_id in other_subs:
                            points[sub_id] += pts_per_song
                        for i in range(remainder):
                            points[other_subs[i]] += 1
        
        # Find winner(s) and update stats
        max_points = max(points.values()) if points else 0
        for sub in submissions:
            uid = sub["user_id"]
            if uid in user_stats:
                sub_points = points.get(sub["id"], 0)
                user_stats[uid]["total_points"] += sub_points
                user_stats[uid]["rounds_played"] += 1
                if sub_points == max_points and max_points > 0:
                    user_stats[uid]["wins"] += 1
    
    return _build_response(user_stats)

@api_router.get("/rounds/{round_id}/results", response_model=RoundResultResponse)
async def get_results(round_id: str, current_user: dict = Depends(get_current_user)):
    round_doc = await db.rounds.find_one({"id": round_id})
    if not round_doc:
        raise HTTPException(status_code=404, detail="Round not found")
    
    if round_doc["status"] != "completed":
        raise HTTPException(status_code=400, detail="Results are not available until voting is complete")
    
    # Get league for member count
    league = await db.leagues.find_one({"id": round_doc["league_id"]})
    league_size = len(league["members"]) if league else 0
    
    # Get all submissions and votes
    submissions = await db.submissions.find({"round_id": round_id}).to_list(100)
    votes = await db.votes.find({"round_id": round_id}).to_list(100)
    
    if not submissions:
        return RoundResultResponse(
            id=str(uuid.uuid4()),
            round_id=round_id,
            rankings=[],
            winners=[],
            is_tie=False,
            total_voters=0,
            votes=[]
        )
    
    # NEW POINT SYSTEM: N points for 1st, N-1 for 2nd, etc. where N = number of songs being ranked
    # For a 4-person league (3 songs to rank): 1st=3, 2nd=2, 3rd=1
    num_submissions = len(submissions)
    num_songs_to_rank = num_submissions - 1  # Each voter doesn't vote for their own
    
    submission_scores = {sub["id"]: 0 for sub in submissions}
    submitter_ids = {sub["id"]: sub["user_id"] for sub in submissions}
    
    # Calculate points from actual votes
    voters_who_voted = set()
    for vote in votes:
        voter_id = vote.get("voter_id")
        voters_who_voted.add(voter_id)
        rankings = vote["rankings"]
        
        for rank_index, sub_id in enumerate(rankings):
            # Points = N - rank_index where N = number of songs being ranked
            points = num_songs_to_rank - rank_index
            submission_scores[sub_id] += points
    
    # Legacy rule: non-voters' point pools get redistributed evenly
    # across the other songs. Rounds that entered voting after the
    # forfeit-pools change skip this — missing voters' pools are simply
    # forfeit.
    if not round_doc.get("forfeit_missing_voter_pools"):
        submitter_user_ids = set(submitter_ids.values())
        non_voters = submitter_user_ids - voters_who_voted

        if non_voters and len(submissions) > 1:
            total_points_per_voter = sum(range(1, num_songs_to_rank + 1))

            for non_voter_id in non_voters:
                non_voter_sub_id = None
                for sub in submissions:
                    if sub["user_id"] == non_voter_id:
                        non_voter_sub_id = sub["id"]
                        break

                other_subs = [sub["id"] for sub in submissions if sub["id"] != non_voter_sub_id]
                num_other = len(other_subs)

                if num_other > 0:
                    points_per_song = total_points_per_voter // num_other
                    remainder = total_points_per_voter % num_other

                    for sub_id in other_subs:
                        submission_scores[sub_id] += points_per_song

                    for i in range(remainder):
                        submission_scores[other_subs[i]] += 1
    
    # Sort by total points (descending)
    sorted_subs = sorted(submissions, key=lambda s: -submission_scores[s["id"]])
    
    # Assign ranks with tie handling
    rankings = []
    current_rank = 1
    prev_score = None
    
    for i, sub in enumerate(sorted_subs):
        sub_score = submission_scores[sub["id"]]
        
        # Check if this is a tie (same score)
        if prev_score is not None and sub_score == prev_score:
            # Same rank as previous
            pass
        else:
            current_rank = i + 1
        
        rankings.append({
            "submission_id": sub["id"],
            "song": sub["song"],
            "user_id": sub["user_id"],
            "username": sub["username"],
            "points": sub_score,
            "rank": current_rank
        })
        
        prev_score = sub_score
    
    # Determine winners (rank 1)
    winners = [r for r in rankings if r["rank"] == 1]
    is_tie = len(winners) > 1

    # Attach voter info (username + profile photo) for each vote
    voter_ids = [v.get("voter_id") for v in votes if v.get("voter_id")]
    voter_docs = await db.users.find(
        {"id": {"$in": voter_ids}},
        {"_id": 0, "id": 1, "username": 1, "profile_photo": 1}
    ).to_list(100) if voter_ids else []
    voter_map = {u["id"]: u for u in voter_docs}
    votes_payload = []
    for v in votes:
        vid = v.get("voter_id")
        user_info = voter_map.get(vid, {})
        votes_payload.append({
            "voter_id": vid,
            "voter_username": user_info.get("username", ""),
            "voter_profile_photo": user_info.get("profile_photo"),
            "rankings": v.get("rankings", []),
        })

    # League members who didn't submit this round. Only populated for
    # rounds that follow the forfeit-pools rule so the UI doesn't surface
    # "(no submission)" rows for legacy rounds where those members'
    # points were still auto-distributed.
    non_submitters: list[dict] = []
    if round_doc.get("forfeit_missing_voter_pools") and league:
        submitter_user_ids = {s["user_id"] for s in submissions}
        member_ids_missing = [
            m["id"] for m in league.get("members", [])
            if m["id"] not in submitter_user_ids
        ]
        if member_ids_missing:
            user_docs = await db.users.find(
                {"id": {"$in": member_ids_missing}},
                {"_id": 0, "id": 1, "username": 1, "profile_photo": 1},
            ).to_list(500)
            doc_by_id = {u["id"]: u for u in user_docs}
            for m in league.get("members", []):
                if m["id"] in submitter_user_ids:
                    continue
                u = doc_by_id.get(m["id"], {})
                non_submitters.append({
                    "user_id": m["id"],
                    "username": u.get("username") or m.get("username", ""),
                    "profile_photo": u.get("profile_photo"),
                })

    return RoundResultResponse(
        id=str(uuid.uuid4()),
        round_id=round_id,
        rankings=rankings,
        winners=winners,
        is_tie=is_tie,
        total_voters=len(votes),
        votes=votes_payload,
        non_submitters=non_submitters,
    )

# ==================== SONG SEARCH (DEEZER, TWO-PASS) ====================
#
# Deezer's plain-text search has catalog gaps: some tracks live in the catalog
# but the bag-of-words search ranks them so low (or omits them entirely) that
# they never surface. Example: "Verisimilitude" by Teenage Fanclub — neither
# the title alone nor "Verisimilitude Teenage Fanclub" returns it from plain
# search, but the field-operator query  artist:"Teenage Fanclub" track:"Verisimilitude"
# does. Strategy:
#   - Pass 1: plain-text /search?q=<query>.
#   - Multi-word query (≥2 tokens): if pass-1 has no title-overlap match, try
#     each (artist,title)/(title,artist) split with field operators and stop
#     at the first non-empty split.
#   - Single-word unquoted query: also run track:"<word>" AND artist:"<word>"
#     in parallel — the word might be the title (catalog gap) or an artist
#     name with songs Deezer's plain ranking buries.
# Results are merged and deduped by deezer_id, capped at 40 items overall.

_QUERY_TOKEN_RE = re.compile(r'"([^"]+)"|(\S+)')


def _tokenize_query(q: str) -> list[str]:
    """Split a query into tokens, treating double-quoted spans as one token."""
    return [m.group(1) or m.group(2) for m in _QUERY_TOKEN_RE.finditer(q)]


def _deezer_search_has_title_overlap(tracks: list[dict], query: str) -> bool:
    """Did pass-1 return any track whose title overlaps the user's query?"""
    if not tracks:
        return False
    q_lower = query.lower()
    for t in tracks:
        title = (t.get("title") or "").lower().strip()
        if title and (title in q_lower or q_lower in title):
            return True
    return False


def _map_deezer_search_track(track: dict) -> dict:
    return {
        "deezer_id":   track["id"],
        "title":       track["title"],
        "artist":      track["artist"]["name"],
        "album":       track["album"]["title"],
        "preview_url": track["preview"],
        "cover_url":   track["album"]["cover_medium"],
        "duration":    track["duration"],
    }


async def _deezer_plain_search(
    client: httpx.AsyncClient, q: str, limit: int
) -> list[dict]:
    resp = await client.get(
        "https://api.deezer.com/search",
        params={"q": q, "limit": limit},
    )
    resp.raise_for_status()
    data = resp.json() or {}
    return [_map_deezer_search_track(t) for t in data.get("data", [])]


async def _deezer_field_search(
    client: httpx.AsyncClient, tokens: list[str], limit: int
) -> list[dict]:
    """
    Re-interpret `tokens` as (artist, title) and (title, artist) at every
    split position. Issue an artist:"X" track:"Y" Deezer query for each;
    return on the first split that yields any results.
    """
    if len(tokens) < 2:
        return []
    for i in range(1, len(tokens)):
        left = " ".join(tokens[:i])
        right = " ".join(tokens[i:])
        for artist, title in ((left, right), (right, left)):
            # Strip stray double quotes — they'd break field-operator syntax.
            a = artist.replace('"', "").strip()
            t = title.replace('"', "").strip()
            if not a or not t:
                continue
            q_op = f'artist:"{a}" track:"{t}"'
            try:
                results = await _deezer_plain_search(client, q_op, limit)
            except Exception:
                continue
            if results:
                return results
    return []


async def _deezer_single_word_field_searches(
    client: httpx.AsyncClient, word: str, limit: int
) -> tuple[list[dict], list[dict]]:
    """
    Run track:"<word>" and artist:"<word>" Deezer searches in parallel.
    Returns (track_results, artist_results); each is [] on individual failure
    so a single bad pass doesn't take down the other.
    """
    w = word.replace('"', "").strip()
    if not w:
        return [], []
    track_res, artist_res = await asyncio.gather(
        _deezer_plain_search(client, f'track:"{w}"', limit),
        _deezer_plain_search(client, f'artist:"{w}"', limit),
        return_exceptions=True,
    )
    if isinstance(track_res, Exception):
        logger.warning(
            f"Deezer track:\"{w}\" search failed: "
            f"{type(track_res).__name__}: {track_res}"
        )
        track_res = []
    if isinstance(artist_res, Exception):
        logger.warning(
            f"Deezer artist:\"{w}\" search failed: "
            f"{type(artist_res).__name__}: {artist_res}"
        )
        artist_res = []
    return track_res, artist_res


def _merge_dedupe_songs(sources, cap: int) -> list[dict]:
    """Concat song lists in order, dedupe by deezer_id, cap at `cap` items."""
    seen: set = set()
    merged: list[dict] = []
    for src in sources:
        for song in src:
            tid = song.get("deezer_id")
            if tid in seen:
                continue
            seen.add(tid)
            merged.append(song)
            if len(merged) >= cap:
                return merged
    return merged


# Final response cap. Per-pass Deezer queries stay at 20 each; the cap of 40
# gives single-word queries (up to 3 passes = 60 candidate rows) enough room
# to surface both plain-text hits and field-operator hits.
_SEARCH_RESPONSE_CAP = 40
_DEEZER_PER_PASS_LIMIT = 20


@api_router.get("/songs/search")
async def search_songs(q: str, limit: int = 40):
    """Search songs using Deezer API with field-operator fallback passes."""
    if not q or not q.strip() or len(q) < 2:
        return {"data": []}

    response_cap = max(1, min(limit, _SEARCH_RESPONSE_CAP))

    try:
        async with httpx.AsyncClient(verify=False, timeout=30.0) as client:
            pass1 = await _deezer_plain_search(client, q, _DEEZER_PER_PASS_LIMIT)
            tokens = _tokenize_query(q)

            if len(tokens) == 1 and '"' not in q:
                # Single-word, unquoted: parallel track-op + artist-op searches.
                word = tokens[0]
                track_results, artist_results = await _deezer_single_word_field_searches(
                    client, word, _DEEZER_PER_PASS_LIMIT
                )
                # pass-1 first (plain-text relevance), then track-op,
                # then artist-op — matches the spec for single-word queries.
                merged = _merge_dedupe_songs(
                    (pass1, track_results, artist_results), response_cap
                )
            elif len(tokens) >= 2:
                need_pass2 = (
                    not pass1 or not _deezer_search_has_title_overlap(pass1, q)
                )
                pass2: list[dict] = []
                if need_pass2:
                    try:
                        pass2 = await _deezer_field_search(
                            client, tokens, _DEEZER_PER_PASS_LIMIT
                        )
                    except Exception as e:
                        logger.warning(
                            f"Deezer pass-2 field search failed for q={q!r}: "
                            f"{type(e).__name__}: {e}"
                        )
                # pass-2 first when it ran (it targets the catalog gap),
                # then pass-1.
                merged = _merge_dedupe_songs((pass2, pass1), response_cap)
            else:
                # Quoted single-word ("verisimilitude") — user was explicit,
                # don't second-guess with field operators.
                merged = _merge_dedupe_songs((pass1,), response_cap)

            return {"data": merged}
    except httpx.TimeoutException:
        logger.error("Deezer API timeout")
        raise HTTPException(status_code=504, detail="Song search timed out. Please try again.")
    except httpx.HTTPError as e:
        logger.error(f"Deezer HTTP error: {e}")
        raise HTTPException(status_code=502, detail="Could not connect to song service")
    except Exception as e:
        logger.error(f"Deezer API error: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to search songs: {type(e).__name__}")

# ==================== SONG CHART / GENRE (DEEZER PROXY) ====================

def _map_deezer_track(track: dict) -> dict:
    """Shared transformer: Deezer track object → our SongData shape."""
    album = track.get("album", {})
    # Prefer cover_big (500×500) when present, fall back to cover_medium
    cover = (
        album.get("cover_big")
        or album.get("cover_medium")
        or album.get("cover")
        or ""
    )
    return {
        "deezer_id":   track["id"],
        "title":       track["title"],
        "artist":      track.get("artist", {}).get("name", ""),
        "album":       album.get("title", ""),
        "preview_url": track.get("preview", ""),
        "cover_url":   cover,
        "duration":    track.get("duration", 30),
    }


@api_router.get("/songs/chart")
async def get_chart_songs(limit: int = 50, index: int = 0):
    """
    Return Deezer's global chart — real current popular songs.
    GET https://api.deezer.com/chart/0/tracks?limit=50&index=0
    """
    try:
        async with httpx.AsyncClient(verify=False, timeout=30.0) as client:
            response = await client.get(
                "https://api.deezer.com/chart/0/tracks",
                params={"limit": limit, "index": index},
            )
            response.raise_for_status()
            data = response.json()

            songs = [
                _map_deezer_track(t)
                for t in data.get("data", [])
                if t.get("preview")          # only tracks with a 30-sec preview
            ]
            return {"data": songs}

    except httpx.TimeoutException:
        logger.error("Deezer chart API timeout")
        raise HTTPException(status_code=504, detail="Chart request timed out. Please try again.")
    except httpx.HTTPError as e:
        logger.error(f"Deezer chart HTTP error: {e}")
        raise HTTPException(status_code=502, detail="Could not connect to song service")
    except Exception as e:
        logger.error(f"Deezer chart error: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch chart: {type(e).__name__}")


@api_router.get("/songs/genre/{genre_id}")
async def get_genre_songs(genre_id: int, artists: int = 5, tracks_per_artist: int = 10):
    """
    Return top tracks for a Deezer genre.

    Steps:
      1. GET /genre/{genre_id}/artists  — fetch artists for the genre
      2. For the top `artists` artists, concurrently GET /artist/{id}/top
      3. Flatten, de-duplicate, filter to preview-only tracks, return up to
         artists × tracks_per_artist results.

    Common genre IDs:
      132 Pop | 116 Rap/Hip-Hop | 165 R&B | 6 Country | 152 Rock
      113 Dance | 85 Alternative | 106 Electro | 197 Latino
    """
    try:
        async with httpx.AsyncClient(verify=False, timeout=30.0) as client:

            # ── Step 1: genre → artist list ─────────────────────────────────
            genre_resp = await client.get(
                f"https://api.deezer.com/genre/{genre_id}/artists"
            )
            genre_resp.raise_for_status()
            genre_data = genre_resp.json()

            artist_ids = [
                a["id"]
                for a in genre_data.get("data", [])[:artists]
                if a.get("id")
            ]

            if not artist_ids:
                return {"data": []}

            # ── Step 2: fetch top tracks for each artist concurrently ───────
            async def fetch_artist_top(artist_id: int) -> list[dict]:
                try:
                    r = await client.get(
                        f"https://api.deezer.com/artist/{artist_id}/top",
                        params={"limit": tracks_per_artist},
                    )
                    r.raise_for_status()
                    return r.json().get("data", [])
                except Exception:
                    return []

            results = await asyncio.gather(*[fetch_artist_top(aid) for aid in artist_ids])

            # ── Step 3: flatten, de-duplicate, filter ───────────────────────
            seen: set[int] = set()
            songs: list[dict] = []
            for track_list in results:
                for track in track_list:
                    tid = track.get("id")
                    if tid and tid not in seen and track.get("preview"):
                        seen.add(tid)
                        songs.append(_map_deezer_track(track))

            return {"data": songs}

    except httpx.TimeoutException:
        logger.error(f"Deezer genre API timeout (genre_id={genre_id})")
        raise HTTPException(status_code=504, detail="Genre request timed out. Please try again.")
    except httpx.HTTPError as e:
        logger.error(f"Deezer genre HTTP error: {e}")
        raise HTTPException(status_code=502, detail="Could not connect to song service")
    except Exception as e:
        logger.error(f"Deezer genre error: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch genre songs: {type(e).__name__}")


# ── Billboard chart cache (1-hour TTL) ───────────────────────────────────────

_CHART_CACHE: dict = {}          # chart_name → {"ts": float, "data": list}
_CHART_CACHE_TTL = 60 * 60       # seconds


def _fetch_billboard_chart_sync(chart_name: str, limit: int = 30) -> list:
    """
    Synchronous: scrape Billboard then enrich each entry with a Deezer search
    to obtain a preview URL and cover art.  Runs inside asyncio.to_thread so
    it never blocks the async event loop.  Results are cached for 1 hour.

    If Billboard scraping fails OR the scrape produces an empty song list,
    this function raises — callers should keep the previously-cached data
    rather than overwrite it with nothing.
    """
    now = time.time()
    cached = _CHART_CACHE.get(chart_name)
    if cached and (now - cached["ts"]) < _CHART_CACHE_TTL:
        return cached["data"]

    chart = billboard.ChartData(chart_name)
    songs: list = []
    for entry in chart[:limit]:
        try:
            result = _requests.get(
                "https://api.deezer.com/search",
                params={"q": f"{entry.artist} {entry.title}", "limit": 1},
                timeout=10,
            ).json()
            tracks = result.get("data", [])
            if not tracks or not tracks[0].get("preview"):
                continue
            track = tracks[0]
            songs.append({
                "title":          entry.title,
                "artist":         entry.artist,
                "cover_url":      track["album"]["cover_xl"],
                "preview_url":    track["preview"],
                "deezer_id":      track["id"],
                "duration":       track["duration"],
                "chart_position": entry.rank,
            })
        except Exception:
            continue

    if not songs:
        # Do NOT overwrite the in-memory cache with empty data.
        raise RuntimeError(f"Billboard chart '{chart_name}' returned no usable songs")

    _CHART_CACHE[chart_name] = {"ts": now, "data": songs}
    return songs


@api_router.get("/songs/chart/top")
async def get_chart_top():
    """Hot 100 — billboard chart: hot-100"""
    try:
        songs = await get_chart_from_db("hot-100")
        return {"data": songs}
    except Exception as e:
        logger.error(f"Billboard hot-100 error: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch chart: {type(e).__name__}")


@api_router.get("/songs/chart/pop")
async def get_chart_pop():
    """Pop songs — billboard chart: pop-songs"""
    try:
        songs = await get_chart_from_db("pop-songs")
        return {"data": songs}
    except Exception as e:
        logger.error(f"Billboard pop-songs error: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch chart: {type(e).__name__}")


@api_router.get("/songs/chart/hiphop")
async def get_chart_hiphop():
    """Rap songs — billboard chart: rap-song"""
    try:
        songs = await get_chart_from_db("rap-song")
        return {"data": songs}
    except Exception as e:
        logger.error(f"Billboard rap-song error: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch chart: {type(e).__name__}")


@api_router.get("/songs/chart/rnb")
async def get_chart_rnb():
    """R&B/Hip-Hop songs — billboard chart: r-b-hip-hop-songs"""
    try:
        songs = await get_chart_from_db("r-b-hip-hop-songs")
        return {"data": songs}
    except Exception as e:
        logger.error(f"Billboard r-b-hip-hop-songs error: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch chart: {type(e).__name__}")


@api_router.get("/songs/chart/country")
async def get_chart_country():
    """Country songs — billboard chart: country-songs"""
    try:
        songs = await get_chart_from_db("country-songs")
        return {"data": songs}
    except Exception as e:
        logger.error(f"Billboard country-songs error: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch chart: {type(e).__name__}")


@api_router.get("/songs/chart/rock")
async def get_chart_rock():
    """Rock songs — billboard chart: rock-songs"""
    try:
        songs = await get_chart_from_db("rock-songs")
        return {"data": songs}
    except Exception as e:
        logger.error(f"Billboard rock-songs error: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch chart: {type(e).__name__}")


@api_router.get("/songs/chart/electronic")
async def get_chart_electronic():
    """Dance/Electronic songs — billboard chart: dance-electronic-songs"""
    try:
        songs = await get_chart_from_db("dance-electronic-songs")
        return {"data": songs}
    except Exception as e:
        logger.error(f"Billboard dance-electronic-songs error: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch chart: {type(e).__name__}")


@api_router.get("/songs/chart/indie")
async def get_chart_indie():
    """Alternative songs — billboard chart: alternative-songs"""
    try:
        songs = await get_chart_from_db("alternative-songs")
        return {"data": songs}
    except Exception as e:
        logger.error(f"Billboard alternative-songs error: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch chart: {type(e).__name__}")


# ==================== CHAT ENDPOINTS ====================

@api_router.get("/leagues/{league_id}/messages", response_model=List[MessageResponse])
async def get_league_messages(league_id: str, current_user: dict = Depends(get_current_user)):
    """Get all messages for a league"""
    league = await db.leagues.find_one({"id": league_id})
    if not league:
        raise HTTPException(status_code=404, detail="League not found")
    
    # Check if user is a member (handle both 'id' and 'user_id' formats)
    member_ids = [m.get("user_id") or m.get("id") for m in league.get("members", [])]
    if current_user["id"] not in member_ids:
        raise HTTPException(status_code=403, detail="Not a member of this league")
    
    messages = await db.messages.find({"league_id": league_id}).sort("created_at", 1).to_list(1000)
    
    # Update user's last read timestamp for this league
    await db.chat_reads.update_one(
        {"user_id": current_user["id"], "league_id": league_id},
        {"$set": {"last_read_at": datetime.now(timezone.utc)}},
        upsert=True
    )
    
    return [MessageResponse(**msg) for msg in messages]

@api_router.post("/leagues/{league_id}/messages", response_model=MessageResponse)
async def send_message(league_id: str, message: MessageCreate, current_user: dict = Depends(get_current_user)):
    """Send a message to a league chat"""
    league = await db.leagues.find_one({"id": league_id})
    if not league:
        raise HTTPException(status_code=404, detail="League not found")
    
    # Check if user is a member (handle both 'id' and 'user_id' formats)
    member_ids = [m.get("user_id") or m.get("id") for m in league.get("members", [])]
    if current_user["id"] not in member_ids:
        raise HTTPException(status_code=403, detail="Not a member of this league")
    
    if not message.content.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    
    message_doc = {
        "id": str(uuid.uuid4()),
        "league_id": league_id,
        "user_id": current_user["id"],
        "username": current_user["username"],
        "content": message.content.strip(),
        "created_at": datetime.now(timezone.utc)
    }
    
    await db.messages.insert_one(message_doc)
    
    # Update sender's last read timestamp
    await db.chat_reads.update_one(
        {"user_id": current_user["id"], "league_id": league_id},
        {"$set": {"last_read_at": datetime.now(timezone.utc)}},
        upsert=True
    )
    
    return MessageResponse(**message_doc)

@api_router.get("/leagues/{league_id}/chat-status", response_model=ChatStatusResponse)
async def get_chat_status(league_id: str, current_user: dict = Depends(get_current_user)):
    """Check if there are unread messages in the league chat"""
    league = await db.leagues.find_one({"id": league_id})
    if not league:
        raise HTTPException(status_code=404, detail="League not found")
    
    # Get the latest message
    latest_message = await db.messages.find_one(
        {"league_id": league_id},
        sort=[("created_at", -1)]
    )
    
    if not latest_message:
        return ChatStatusResponse(has_unread=False, last_message_at=None)
    
    # Get user's last read timestamp
    chat_read = await db.chat_reads.find_one({
        "user_id": current_user["id"],
        "league_id": league_id
    })
    
    last_read_at = chat_read.get("last_read_at") if chat_read else None
    last_message_at = latest_message.get("created_at")
    
    # Check if there are unread messages (message after last read, or never read)
    has_unread = False
    if last_message_at:
        if not last_read_at:
            has_unread = True
        elif last_message_at > last_read_at:
            # Don't count as unread if the latest message is from the current user
            if latest_message.get("user_id") != current_user["id"]:
                has_unread = True
    
    return ChatStatusResponse(has_unread=has_unread, last_message_at=last_message_at)

# ==================== ROOT ENDPOINT ====================

@api_router.get("/")
async def root():
    return {"message": "Music League API", "version": "2.1.0"}

@api_router.get("/admin/reset-database")
async def reset_database():
    """Temporary endpoint to clear all data. Remove after use."""
    collections = await db.list_collection_names()
    for col in collections:
        await db[col].delete_many({})
    return {"message": "All data cleared", "collections_cleared": collections}

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()


@app.on_event("startup")
async def warm_chart_cache():
    """Pre-warm all Billboard chart caches on server startup so users never hit a cold cache."""
    charts = ["hot-100", "pop-songs", "rap-song", "r-b-hip-hop-songs", "country-songs", "rock-songs", "dance-electronic-songs", "adult-alternative-songs"]
    async def warm():
        for chart in charts:
            try:
                await asyncio.to_thread(_fetch_billboard_chart_sync, chart)
                logger.info(f"Chart cache warmed: {chart}")
            except Exception as e:
                logger.warning(f"Chart cache warm failed for {chart}: {e}")
    asyncio.create_task(warm())


# ── Chart database cache (MongoDB-backed, background refresh) ─────────────────

CHART_NAMES = [
    "hot-100",
    "pop-songs", 
    "rap-song",
    "r-b-hip-hop-songs",
    "country-songs",
    "rock-songs",
    "dance-electronic-songs",
    "adult-alternative-songs",
]

CHART_REFRESH_INTERVAL_SECONDS = 60 * 60  # 1 hour

async def refresh_charts_to_db() -> dict:
    """Fetch all Billboard charts and store in MongoDB.

    If a particular chart fetch fails or returns empty, the existing cached
    document is left untouched so users keep seeing the last-known-good data.
    Returns a per-chart status map useful for the manual refresh endpoint.
    """
    results: dict = {}
    for chart_name in CHART_NAMES:
        try:
            songs = await asyncio.to_thread(_fetch_billboard_chart_sync, chart_name)
            if not songs:
                logger.warning(
                    f"Chart DB refresh skipped for {chart_name}: fetch returned no songs, keeping last good data"
                )
                results[chart_name] = {"status": "skipped_empty"}
                continue
            await db.chart_cache.update_one(
                {"chart_name": chart_name},
                {"$set": {"chart_name": chart_name, "songs": songs, "updated_at": time.time()}},
                upsert=True,
            )
            logger.info(f"Chart saved to DB: {chart_name} ({len(songs)} songs)")
            results[chart_name] = {"status": "refreshed", "count": len(songs)}
        except Exception as e:
            logger.exception(f"Chart DB refresh failed for {chart_name}: {type(e).__name__}: {e}")
            results[chart_name] = {"status": "error", "error": f"{type(e).__name__}: {e}"}
    return results

async def chart_refresh_loop():
    """Background loop: refresh charts every hour. Never dies silently."""
    logger.info("chart_refresh_loop: started")
    while True:
        try:
            await refresh_charts_to_db()
        except Exception as e:
            # Safety net — refresh_charts_to_db already catches per-chart
            # errors, but if it itself blows up we log and continue rather
            # than let the background task die.
            logger.exception(f"chart_refresh_loop iteration failed: {type(e).__name__}: {e}")
        await asyncio.sleep(CHART_REFRESH_INTERVAL_SECONDS)

@app.on_event("startup")
async def start_chart_refresh_loop():
    logger.info("chart_refresh_loop: scheduling background task")
    asyncio.create_task(chart_refresh_loop())


async def _reclassify_unknown_genres(max_rows: int = 500):
    """Walk user_submissions where genre is None or 'Other' and re-resolve
    them using the hardcoded artist map first, then Deezer. Rate-limited so
    the background task doesn't hammer Deezer.
    """
    try:
        rows = await db.user_submissions.find(
            {"$or": [{"genre": None}, {"genre": {"$exists": False}}, {"genre": "Other"}]},
            {"_id": 0, "submission_id": 1, "genre": 1, "song": 1},
        ).to_list(max_rows)

        updated = 0
        for r in rows:
            song = r.get("song") or {}
            # Try the hardcoded artist map first (no network).
            new_cat = _category_from_artist(song.get("artist", ""))
            if new_cat == "Other":
                deezer_id = song.get("deezer_id")
                if deezer_id:
                    try:
                        new_cat = await asyncio.to_thread(
                            _fetch_song_category,
                            deezer_id,
                            song.get("artist", ""),
                            song.get("title", ""),
                        )
                    except Exception as e:
                        logger.debug(f"reclassify: Deezer lookup failed for {deezer_id}: {e}")
                        continue
                    # Be nice to Deezer.
                    await asyncio.sleep(0.1)
                else:
                    new_cat = _category_from_genre_name(
                        f"{song.get('artist', '')} {song.get('title', '')}"
                    )

            if new_cat and new_cat != (r.get("genre") or "Other"):
                await db.user_submissions.update_one(
                    {"submission_id": r["submission_id"]},
                    {"$set": {"genre": new_cat, "updated_at": datetime.now(timezone.utc)}},
                )
                updated += 1
        if updated:
            logger.info(f"reclassify_unknown_genres: updated {updated}/{len(rows)} rows")
    except Exception as e:
        logger.exception(f"reclassify_unknown_genres failed: {e}")


@app.on_event("startup")
async def start_genre_reclassifier():
    """Fire-and-forget background task that gradually repairs any
    user_submissions rows whose genre couldn't be resolved at submit time.
    Runs once on startup and then every 30 minutes.
    """
    async def loop():
        logger.info("reclassify_unknown_genres: scheduled on startup")
        # Wait briefly so startup logs aren't mixed with first batch output.
        await asyncio.sleep(10)
        while True:
            await _reclassify_unknown_genres()
            await asyncio.sleep(30 * 60)
    asyncio.create_task(loop())


# ==================== ROUND AUTO-ADVANCE (SERVER-SIDE) ====================
#
# Scheduled background task that walks every league's active round once a
# minute and transitions it based on deadlines. Mirrors the lazy
# auto-advance already embedded in the read-path endpoints, but runs even
# when no user has opened the app — required so "round ends at midnight"
# actually happens at midnight rather than whenever the next client shows
# up. Safe to run alongside the lazy logic: MongoDB updates are idempotent
# and the status guards ensure we only advance a round once.

async def _run_round_auto_advance_tick() -> None:
    """Run four independent passes:
      1. Submission deadlines that have passed → move to voting (or skip
         if no submissions).
      2. Voting deadlines that have passed → complete + unlock next.
      3. Self-healing sweep: any round stuck at "completed" whose
         successor is still locked — heal it by calling the unlock
         helper. This cleans up leagues that went stale before this patch
         shipped, and backstops any future code path that forgets to
         call the helper.
      4. Scheduled public R1 rounds whose `starts_at` has passed → flip
         to "submission" with real deadlines. Only Round 1 of public
         leagues auto-starts on a timer; subsequent rounds still require
         the creator to tap Start (same as private leagues).

    Each pass is wrapped in its own try/except so a failure in one
    doesn't block the others.
    """
    now = datetime.now(timezone.utc)

    # --- Pass 1: expired submission phases ----------------------------
    try:
        subs_expired = await db.rounds.find(
            {
                "status": "submission",
                "submission_deadline": {"$lte": now, "$lt": _LOCKED_PLACEHOLDER_DT},
            },
            {"_id": 0},
        ).to_list(500)
        for r in subs_expired:
            try:
                await _advance_submission_expired(r, now)
            except Exception as e:
                logger.exception(
                    f"auto-advance: submission-expired handler failed for round {r.get('id')}: {e}"
                )
    except Exception as e:
        logger.exception(f"auto-advance: submission-expired query failed: {e}")

    # --- Pass 2: expired voting phases --------------------------------
    try:
        votes_expired = await db.rounds.find(
            {
                "status": "voting",
                "voting_deadline": {"$lte": now, "$lt": _LOCKED_PLACEHOLDER_DT},
            },
            {"_id": 0},
        ).to_list(500)
        for r in votes_expired:
            try:
                await _advance_voting_expired(r, now)
            except Exception as e:
                logger.exception(
                    f"auto-advance: voting-expired handler failed for round {r.get('id')}: {e}"
                )
    except Exception as e:
        logger.exception(f"auto-advance: voting-expired query failed: {e}")

    # --- Pass 3: self-healing sweep -----------------------------------
    # Find rounds where status="completed" but the next round (by
    # round_number + 1) in the same league is still locked. If a league
    # is in this state, something in the transition chain dropped the
    # unlock step — heal it here.
    try:
        completed_rounds = await db.rounds.find(
            {"status": "completed"},
            {"_id": 0, "id": 1, "league_id": 1, "round_number": 1},
        ).to_list(500)
        for r in completed_rounds:
            try:
                next_round = await db.rounds.find_one(
                    {
                        "league_id": r["league_id"],
                        "round_number": r.get("round_number", 0) + 1,
                        "status": "locked",
                    },
                    {"_id": 0, "id": 1},
                )
                if not next_round:
                    continue
                healed = await _unlock_next_round_or_complete_league(
                    r["league_id"], r.get("round_number", 0), now,
                )
                if healed:
                    logger.info(
                        f"self_heal_sweep: healed stuck league={r['league_id']} "
                        f"after_round={r.get('round_number')}"
                    )
            except Exception as e:
                logger.exception(
                    f"auto-advance: self-heal handler failed for round {r.get('id')}: {e}"
                )
    except Exception as e:
        logger.exception(f"auto-advance: self-heal query failed: {e}")

    # --- Pass 4: scheduled public R1 rounds whose timer has fired ----
    try:
        await _start_scheduled_public_rounds(now)
    except Exception as e:
        logger.exception(f"auto-advance: scheduled-round pass failed: {e}")


async def _start_scheduled_public_rounds(now: datetime) -> None:
    """Public-league Round 1 auto-start. Finds every round in "scheduled"
    state whose `starts_at` has passed and flips it to "submission" using
    the league's configured submission/voting hours. Idempotent — the
    status guard in the query ensures each round transitions once."""
    due = await db.rounds.find(
        {"status": "scheduled", "starts_at": {"$lte": now}},
        {"_id": 0},
    ).to_list(500)
    for r in due:
        try:
            league = await db.leagues.find_one({"id": r["league_id"]})
            if not league:
                continue
            sub_hours = (
                r.get("submission_hours")
                or league.get("submission_hours")
                or 48
            )
            vote_hours = (
                r.get("voting_hours") or league.get("voting_hours") or 72
            )
            new_sub_deadline = now + timedelta(hours=sub_hours)
            new_vote_deadline = new_sub_deadline + timedelta(hours=vote_hours)
            # Guarded update — if another worker already started the round,
            # the status filter fails and we skip the rest of the block.
            res = await db.rounds.update_one(
                {"id": r["id"], "status": "scheduled"},
                {"$set": {
                    "status": "submission",
                    "submission_deadline": new_sub_deadline,
                    "voting_deadline": new_vote_deadline,
                }},
            )
            if res.modified_count == 0:
                continue
            round_number = r.get("round_number", 1)
            if (league.get("current_round") or 0) < round_number:
                await db.leagues.update_one(
                    {"id": r["league_id"]},
                    {"$set": {"current_round": round_number}},
                )
            logger.info(
                f"scheduled_round_started: league={r['league_id']} "
                f"round={round_number}"
            )
        except Exception as e:
            logger.exception(
                f"auto-advance: scheduled-start handler failed for round {r.get('id')}: {e}"
            )


async def _advance_submission_expired(round_doc: dict, now: datetime) -> None:
    """Submission deadline hit: either move to voting, or if there were no
    submissions, skip the round and unlock the next one."""
    round_id = round_doc["id"]
    league_id = round_doc["league_id"]
    sub_count = await db.submissions.count_documents({"round_id": round_id})

    if sub_count == 0:
        # Nothing to vote on — mark the round skipped and move on.
        await db.rounds.update_one(
            {"id": round_id},
            {"$set": {"status": "skipped"}},
        )
        await _unlock_next_round_or_complete_league(league_id, round_doc["round_number"], now)
        return

    # Lock in any remaining drafts and open the voting window.
    await db.submissions.update_many(
        {"round_id": round_id, "locked": {"$ne": True}},
        {"$set": {"locked": True}},
    )
    voting_hours = round_doc.get("voting_hours", 72)
    new_voting_deadline = now + timedelta(hours=voting_hours)
    await db.rounds.update_one(
        {"id": round_id},
        {"$set": {
            "status": "voting",
            "voting_deadline": new_voting_deadline,
            "forfeit_missing_voter_pools": True,
        }},
    )


async def _advance_voting_expired(round_doc: dict, now: datetime) -> None:
    """Voting deadline hit: delegate to the shared helper so the scheduler
    path is identical to the read-path lazy-advance path."""
    await _complete_round_and_unlock_next(round_doc, now)


async def _unlock_next_round_or_complete_league(
    league_id: str, just_finished_number: int, now: datetime,
) -> bool:
    """Find the next locked round for this league and activate it. If there
    isn't one, the league is done. Returns True iff a next round was
    actually unlocked (so the caller can log whether a transition
    happened)."""
    league = await db.leagues.find_one({"id": league_id})
    if not league:
        return False
    total_rounds = league.get("total_rounds", 0) or 0
    next_number = just_finished_number + 1

    if total_rounds > 0 and next_number > total_rounds:
        # League fully complete — mark it and snapshot.
        await db.leagues.update_one(
            {"id": league_id},
            {"$set": {"current_round": total_rounds, "status": "completed"}},
        )
        logger.info(
            f"league_status_completed: league={league_id} "
            f"after_round={just_finished_number} total_rounds={total_rounds}"
        )
        try:
            await _maybe_snapshot_completed_league(league_id)
        except Exception as e:
            logger.warning(f"auto-advance: final snapshot failed for {league_id}: {e}")
        return False

    next_round = await db.rounds.find_one({"league_id": league_id, "round_number": next_number})
    if not next_round:
        return False
    # Unlock the next round into "ready" — no timer yet, creator will
    # press Start. Deadlines get filled in by the /start endpoint.
    await db.rounds.update_one(
        {"id": next_round["id"]},
        {"$set": {
            "status": "ready",
            "submission_deadline": None,
            "voting_deadline": None,
        }},
    )
    await db.leagues.update_one(
        {"id": league_id},
        {"$set": {"current_round": next_number}},
    )
    return True


async def _complete_round_and_unlock_next(round_doc: dict, now: datetime) -> None:
    """Idempotent voting → completed transition that ALSO unlocks the next
    round. This is the single source of truth for "the round just ended";
    every code path that observes an expired voting deadline must route
    through this function so the unlock step can't be skipped.

    Idempotency: if the round is already marked "completed" we skip the
    lock/status-set, but still run finalize, snapshot, and — critically —
    the unlock helper. That way a retry after a partial failure always
    finishes the job it started.
    """
    round_id = round_doc["id"]
    league_id = round_doc["league_id"]
    round_number = round_doc.get("round_number", 0)
    already_completed = round_doc.get("status") == "completed"

    logger.info(
        f"round_complete_begin: league={league_id} round={round_number} "
        f"already_completed={already_completed}"
    )

    if not already_completed:
        # 1. Lock any stragglers.
        await db.votes.update_many(
            {"round_id": round_id, "locked": {"$ne": True}},
            {"$set": {"locked": True}},
        )
        # 2. Flip status.
        await db.rounds.update_one(
            {"id": round_id},
            {"$set": {"status": "completed"}},
        )
        # Reflect the new status on the in-memory doc so callers rendering
        # a RoundResponse from this dict don't ship stale "voting".
        round_doc["status"] = "completed"

    # 3. Lifetime stats — best-effort.
    try:
        await _finalize_round_lifetime(round_id)
    except Exception as e:
        logger.warning(
            f"_complete_round_and_unlock_next: finalize failed for round {round_id}: {e}"
        )

    # 4. Past-league snapshot if this was the last round — best-effort.
    try:
        await _maybe_snapshot_completed_league(league_id)
    except Exception as e:
        logger.warning(
            f"_complete_round_and_unlock_next: snapshot failed for league {league_id}: {e}"
        )

    # 5. Unlock the next round (or mark the league complete).
    next_unlocked = await _unlock_next_round_or_complete_league(
        league_id, round_number, now,
    )
    logger.info(
        f"round_complete_and_unlock: league={league_id} "
        f"round={round_number} next_unlocked={next_unlocked}"
    )


# Module-level reference to the background task so the event loop doesn't
# garbage-collect it mid-run. asyncio's docs warn that `create_task` returns
# a Task the loop only weakly references, which can cause the task to
# vanish if nothing else holds it. Keeping it here guarantees the
# scheduler keeps running for the life of the process.
_auto_advance_task: Optional[asyncio.Task] = None


@app.on_event("startup")
async def start_round_auto_advance():
    """Run the round auto-advance job every minute. Started once per
    process. Idempotent — safe to run alongside the lazy advance logic
    embedded in the read-path endpoints."""
    async def loop():
        logger.info("round_auto_advance: scheduled on startup")
        # Let the web workers finish booting before we start touching rounds.
        await asyncio.sleep(5)
        while True:
            try:
                await _run_round_auto_advance_tick()
            except Exception as e:
                logger.exception(f"round_auto_advance tick failed: {e}")
            await asyncio.sleep(60)

    global _auto_advance_task
    _auto_advance_task = asyncio.create_task(loop())


# ==================== PAST_LEAGUES MAINTENANCE (ON STARTUP) =============


async def _backfill_past_league_finished_dates() -> int:
    """Recompute `past_leagues.finished_at` using the current derivation
    rules on every document already in the collection. One-time
    repair for snapshots written before the finished_at fix landed.
    Idempotent — a second run is a no-op.

    Rules (mirror `_build_past_league_snapshot`):
      - Source league soft-deleted (or snapshot flagged is_deleted) →
        use the league's `deleted_at`.
      - Otherwise (league completed cleanly) → use the snapshot's
        `snapshot_at`, which was recorded at the moment the final round
        tipped completed.
      - Fall back to the source league's `created_at` if neither
        reference is available.

    Skip any snapshot whose source league no longer exists — nothing to
    re-derive from.
    """
    docs = await db.past_leagues.find(
        {},
        {"_id": 0, "id": 1, "is_deleted": 1, "finished_at": 1,
         "snapshot_at": 1, "deleted_at": 1, "completed_at": 1},
    ).to_list(5000)

    updated = 0
    skipped_missing = 0
    for d in docs:
        lid = d.get("id")
        if not lid:
            continue
        league = await db.leagues.find_one(
            {"id": lid},
            {"_id": 0, "deleted_at": 1, "created_at": 1},
        )
        if not league:
            logger.info(
                f"past_leagues backfill: source league {lid} missing — skipping"
            )
            skipped_missing += 1
            continue

        if d.get("is_deleted") or league.get("deleted_at"):
            raw = league.get("deleted_at") or d.get("deleted_at")
        else:
            raw = d.get("snapshot_at") or d.get("completed_at") or league.get("created_at")

        if not raw:
            continue

        try:
            if isinstance(raw, datetime):
                new_dt = ensure_utc(raw)
            else:
                new_dt = ensure_utc(
                    datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
                )
        except Exception:
            continue
        new_iso = new_dt.isoformat()

        if new_iso == d.get("finished_at"):
            continue  # already correct

        await db.past_leagues.update_one(
            {"id": lid},
            {"$set": {"finished_at": new_iso}},
        )
        updated += 1

    logger.info(
        f"past_leagues backfill: updated={updated} "
        f"skipped_missing_league={skipped_missing} scanned={len(docs)}"
    )
    return updated


async def _backfill_public_league_genres() -> int:
    """One-time backfill: every public league missing a genre (missing
    field, null, or empty string after strip) gets genre="General".
    Private leagues are left untouched — only public leagues surface on
    the public directory and need the field for filtering/display.

    Idempotent: subsequent runs are no-ops because qualifying docs no
    longer match the filter.
    """
    result = await db.leagues.update_many(
        {
            "is_public": True,
            "$or": [
                {"genre": {"$exists": False}},
                {"genre": None},
                {"genre": ""},
            ],
        },
        {"$set": {"genre": "General"}},
    )
    count = result.modified_count or 0
    logger.info(f"leagues genre backfill: updated={count}")
    return count


async def _self_heal_orphan_completed_snapshots() -> int:
    """Find leagues whose every round is in a terminal state (completed
    or skipped) but which don't have a corresponding past_leagues entry,
    and create one. Also catches the inverse symptom: league.status is
    already "completed" but the snapshot was never written. Both paths
    end with the same _save_past_league_snapshot call, so a second run is
    a no-op. Returns the number of orphans repaired."""
    healed = 0

    # Pass 1: leagues marked completed in the docs but missing a snapshot.
    completed_leagues = await db.leagues.find(
        {
            "status": "completed",
            "$or": [{"deleted_at": {"$exists": False}}, {"deleted_at": None}],
        },
        {"_id": 0, "id": 1},
    ).to_list(2000)
    for l in completed_leagues:
        lid = l.get("id")
        if not lid:
            continue
        existing = await db.past_leagues.find_one({"id": lid}, {"_id": 0, "id": 1})
        if existing:
            continue
        try:
            logger.info(f"self_heal_snapshot: league={lid} reason=status_completed_no_snapshot")
            await _save_past_league_snapshot(lid, is_deleted=False, ended_status="completed")
            healed += 1
        except Exception as e:
            logger.warning(f"self_heal_snapshot_failed: league={lid} error={e}")

    # Pass 2: leagues whose rounds are all terminal but league.status
    # was never flipped to "completed" (transition dropped halfway).
    candidates = await db.leagues.find(
        {
            "status": {"$ne": "completed"},
            "total_rounds": {"$gt": 0},
            "$or": [{"deleted_at": {"$exists": False}}, {"deleted_at": None}],
        },
        {"_id": 0, "id": 1, "total_rounds": 1},
    ).to_list(2000)
    for l in candidates:
        lid = l.get("id")
        total = l.get("total_rounds", 0) or 0
        if not lid or total <= 0:
            continue
        rounds = await db.rounds.find(
            {"league_id": lid},
            {"_id": 0, "status": 1},
        ).to_list(500)
        if len(rounds) < total:
            continue
        if not all(r.get("status") in _TERMINAL_ROUND_STATUSES for r in rounds):
            continue
        existing = await db.past_leagues.find_one({"id": lid}, {"_id": 0, "id": 1})
        if existing:
            # Snapshot already exists; just sync the league.status flag.
            await db.leagues.update_one(
                {"id": lid},
                {"$set": {"status": "completed", "current_round": total}},
            )
            continue
        try:
            logger.info(f"self_heal_snapshot: league={lid} reason=all_rounds_terminal_status_stale")
            await db.leagues.update_one(
                {"id": lid},
                {"$set": {"status": "completed", "current_round": total}},
            )
            await _save_past_league_snapshot(lid, is_deleted=False, ended_status="completed")
            healed += 1
        except Exception as e:
            logger.warning(f"self_heal_snapshot_failed: league={lid} error={e}")

    return healed


@app.on_event("startup")
async def past_leagues_startup_maintenance():
    """Creates the indexes the read-paths rely on (member_ids for the
    user's archive query, finished_at for the descending sort) and runs
    the finished_at backfill once. All three operations are idempotent
    — safe to run on every process boot."""
    try:
        await db.past_leagues.create_index("member_ids")
    except Exception as e:
        logger.warning(f"past_leagues member_ids index creation failed: {e}")
    try:
        await db.past_leagues.create_index("finished_at")
    except Exception as e:
        logger.warning(f"past_leagues finished_at index creation failed: {e}")
    try:
        await _backfill_past_league_finished_dates()
    except Exception as e:
        logger.warning(f"past_leagues backfill failed: {e}")
    # Public-league listing queries filter on starts_at; index it so the
    # Public Leagues page stays fast as the leagues collection grows.
    try:
        await db.leagues.create_index("starts_at")
    except Exception as e:
        logger.warning(f"leagues starts_at index creation failed: {e}")
    # One-time genre backfill for public leagues created before the field
    # existed. Writes "General" for any public league missing or with a
    # blank genre; leaves private leagues alone.
    try:
        await _backfill_public_league_genres()
    except Exception as e:
        logger.warning(f"leagues genre backfill failed: {e}")
    # Self-heal pass: any league whose rounds all reached a terminal
    # state but which doesn't have a past_leagues entry yet — create
    # one. Catches partial-failure paths where _maybe_snapshot ran but
    # the upsert never landed.
    try:
        healed = await _self_heal_orphan_completed_snapshots()
        if healed:
            logger.info(f"self_heal_snapshot: healed_count={healed}")
    except Exception as e:
        logger.warning(f"self_heal_snapshot pass failed: {e}")


@api_router.post("/auth/reclassify-genres")
async def trigger_genre_reclassify(current_user: dict = Depends(get_current_user)):
    """Manually kick the background genre reclassifier, scoped to the current
    user's own submissions so testing a single account returns quickly.
    """
    rows = await db.user_submissions.find(
        {
            "user_id": current_user["id"],
            "$or": [{"genre": None}, {"genre": {"$exists": False}}, {"genre": "Other"}],
        },
        {"_id": 0, "submission_id": 1, "genre": 1, "song": 1},
    ).to_list(1000)

    updated = 0
    for r in rows:
        song = r.get("song") or {}
        new_cat = _category_from_artist(song.get("artist", ""))
        if new_cat == "Other":
            deezer_id = song.get("deezer_id")
            if deezer_id:
                try:
                    new_cat = await asyncio.to_thread(
                        _fetch_song_category,
                        deezer_id,
                        song.get("artist", ""),
                        song.get("title", ""),
                    )
                except Exception:
                    continue
            else:
                new_cat = _category_from_genre_name(
                    f"{song.get('artist', '')} {song.get('title', '')}"
                )
        if new_cat and new_cat != (r.get("genre") or "Other"):
            await db.user_submissions.update_one(
                {"submission_id": r["submission_id"]},
                {"$set": {"genre": new_cat, "updated_at": datetime.now(timezone.utc)}},
            )
            updated += 1
    return {"scanned": len(rows), "updated": updated}

async def get_chart_from_db(chart_name: str) -> list:
    """Read chart from MongoDB. Falls back to live fetch if not yet cached."""
    doc = await db.chart_cache.find_one({"chart_name": chart_name})
    if doc and doc.get("songs"):
        return doc["songs"]
    # Not in DB yet — fetch live and store. If the live fetch fails, let the
    # caller's handler decide (they return 500). Do NOT upsert an empty list.
    songs = await asyncio.to_thread(_fetch_billboard_chart_sync, chart_name)
    if not songs:
        return []
    await db.chart_cache.update_one(
        {"chart_name": chart_name},
        {"$set": {"chart_name": chart_name, "songs": songs, "updated_at": time.time()}},
        upsert=True,
    )
    return songs


@api_router.get("/songs/chart/refresh")
async def manual_refresh_charts():
    """Manually force an immediate refresh of all Billboard charts.

    Each chart is attempted; charts that fail or return empty keep their
    previously-cached data. Returns a per-chart status map.
    """
    logger.info("Manual chart refresh requested")
    # Invalidate the in-memory TTL cache so we actually re-scrape Billboard
    # instead of returning the last fetched copy.
    _CHART_CACHE.clear()
    results = await refresh_charts_to_db()
    refreshed = sum(1 for r in results.values() if r.get("status") == "refreshed")
    return {
        "refreshed": refreshed,
        "total": len(CHART_NAMES),
        "charts": results,
    }
