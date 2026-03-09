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
import uuid
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from dateutil.relativedelta import relativedelta
from passlib.context import CryptContext
from jose import JWTError, jwt
import httpx
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
    email: EmailStr

class VerifyCodeRequest(BaseModel):
    email: EmailStr
    code: str

class ResetPasswordRequest(BaseModel):
    email: EmailStr
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

class LeagueCreate(BaseModel):
    name: str
    total_rounds: int = 1  # Number of rounds (1-10)
    league_image: Optional[str] = None  # Custom league image URL

class LeagueResponse(BaseModel):
    id: str
    name: str
    league_code: str
    creator_id: str
    creator_username: str
    total_rounds: int
    league_image: Optional[str] = None
    members: List[dict]
    current_round: int
    status: str
    created_at: datetime

class JoinLeagueRequest(BaseModel):
    league_code: str

class StartRoundRequest(BaseModel):
    theme: str = ""  # Theme/prompt for this round
    submission_hours: int = 24  # Hours for submission phase
    voting_hours: int = 24  # Hours for voting phase
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
    status: str  # "submission", "voting", "completed"
    submission_hours: int = 24
    voting_hours: int = 24
    submission_deadline: datetime
    voting_deadline: datetime
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

@api_router.post("/auth/forgot-password")
async def forgot_password(request: ForgotPasswordRequest):
    """Send a 6-digit reset code to user's phone"""
    user = await db.users.find_one({"email": request.email}, {"_id": 0, "id": 1, "phone_number": 1})
    if not user:
        # Don't reveal if email exists or not
        return {"message": "If an account exists with this email, a code has been sent"}
    
    if not user.get("phone_number"):
        raise HTTPException(status_code=400, detail="No phone number associated with this account")
    
    # Generate 6-digit code
    code = ''.join(random.choices(string.digits, k=6))
    
    # Store code with expiry (15 minutes)
    await db.reset_codes.delete_many({"email": request.email})  # Remove old codes
    await db.reset_codes.insert_one({
        "email": request.email,
        "code": code,
        "created_at": datetime.now(timezone.utc),
        "expires_at": datetime.now(timezone.utc) + timedelta(minutes=15)
    })
    
    # In production, send SMS here via Twilio or similar
    # For now, we'll just log it (the code will work for testing)
    print(f"Reset code for {request.email}: {code}")
    
    return {"message": "If an account exists with this email, a code has been sent"}

@api_router.post("/auth/verify-reset-code")
async def verify_reset_code(request: VerifyCodeRequest):
    """Verify the reset code"""
    reset_doc = await db.reset_codes.find_one({
        "email": request.email,
        "code": request.code
    })
    
    if not reset_doc:
        raise HTTPException(status_code=400, detail="Invalid code")
    
    if datetime.now(timezone.utc) > reset_doc["expires_at"].replace(tzinfo=timezone.utc):
        raise HTTPException(status_code=400, detail="Code has expired")
    
    return {"valid": True}

@api_router.post("/auth/reset-password")
async def reset_password(request: ResetPasswordRequest):
    """Reset password after verifying code"""
    reset_doc = await db.reset_codes.find_one({
        "email": request.email,
        "code": request.code
    })
    
    if not reset_doc:
        raise HTTPException(status_code=400, detail="Invalid code")
    
    if datetime.now(timezone.utc) > reset_doc["expires_at"].replace(tzinfo=timezone.utc):
        raise HTTPException(status_code=400, detail="Code has expired")
    
    # Update password
    await db.users.update_one(
        {"email": request.email},
        {"$set": {"password_hash": hash_password(request.new_password)}}
    )
    
    # Delete used code
    await db.reset_codes.delete_many({"email": request.email})
    
    return {"message": "Password reset successfully"}

@api_router.delete("/auth/account")
async def delete_account(current_user: dict = Depends(get_current_user)):
    """Delete user account and all associated data"""
    user_id = current_user["id"]
    
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
    """Get user statistics: total wins, rounds played, win rate, leagues count"""
    user_id = current_user["id"]
    
    # Get leagues count
    leagues_count = await db.leagues.count_documents({"members.id": user_id})
    
    # Get all submissions by user
    submissions = await db.submissions.find({"user_id": user_id}).to_list(1000)
    rounds_played = len(submissions)
    
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
    
    # Calculate wins
    total_wins = 0
    for submission in submissions:
        if submission["round_id"] not in completed_round_ids:
            continue
            
        round_submissions = submissions_by_round.get(submission["round_id"], [])
        votes = votes_by_round.get(submission["round_id"], [])
        
        if votes and round_submissions:
            # Calculate points
            points = {}
            for sub in round_submissions:
                points[sub["id"]] = 0
            
            num_submissions = len(round_submissions)
            for vote in votes:
                for rank, sub_id in enumerate(vote["rankings"]):
                    points[sub_id] = points.get(sub_id, 0) + (num_submissions - rank)
            
            # Find winner
            max_points = max(points.values()) if points else 0
            winner_id = None
            for sub_id, pts in points.items():
                if pts == max_points:
                    winner_id = sub_id
                    break
            
            if winner_id == submission["id"]:
                total_wins += 1
    
    win_rate = round((total_wins / rounds_played * 100)) if rounds_played > 0 else 0
    
    return {
        "total_wins": total_wins,
        "rounds_played": rounds_played,
        "win_rate": win_rate,
        "leagues_count": leagues_count
    }

@api_router.put("/auth/me", response_model=UserResponse)
async def update_profile(update_data: UserUpdate, current_user: dict = Depends(get_current_user)):
    update_fields = {}
    
    if update_data.username is not None:
        # Check if username is taken by another user
        existing = await db.users.find_one({"username": update_data.username, "id": {"$ne": current_user["id"]}})
        if existing:
            raise HTTPException(status_code=400, detail="Username already taken")
        update_fields["username"] = update_data.username
    
    if update_data.profile_photo is not None:
        update_fields["profile_photo"] = update_data.profile_photo
    
    if update_fields:
        await db.users.update_one({"id": current_user["id"]}, {"$set": update_fields})
    
    # Fetch updated user
    user = await db.users.find_one({"id": current_user["id"]})
    return UserResponse(
        id=user["id"],
        email=user["email"],
        username=user["username"],
        profile_photo=user.get("profile_photo"),
        created_at=user["created_at"]
    )

# ==================== LEAGUE ENDPOINTS ====================

@api_router.post("/leagues", response_model=LeagueResponse)
async def create_league(league_data: LeagueCreate, current_user: dict = Depends(get_current_user)):
    league_id = str(uuid.uuid4())
    league_code = generate_league_code()
    
    # Ensure unique league code
    while await db.leagues.find_one({"league_code": league_code}):
        league_code = generate_league_code()
    
    league = {
        "id": league_id,
        "name": league_data.name,
        "league_code": league_code,
        "creator_id": current_user["id"],
        "creator_username": current_user["username"],
        "total_rounds": league_data.total_rounds,
        "league_image": league_data.league_image,
        "members": [{"id": current_user["id"], "username": current_user["username"]}],
        "current_round": 0,
        "status": "active",
        "created_at": datetime.now(timezone.utc)
    }
    await db.leagues.insert_one(league)
    
    return LeagueResponse(**league)

def add_league_defaults(league: dict) -> dict:
    """Add default values for new fields to support existing leagues"""
    league.setdefault("total_rounds", 0)
    league.setdefault("league_image", None)
    # Remove old fields if they exist (migration)
    league.pop("theme", None)
    league.pop("theme_mode", None)
    league.pop("submission_hours", None)
    league.pop("voting_hours", None)
    return league

@api_router.get("/leagues", response_model=List[LeagueResponse])
async def get_user_leagues(current_user: dict = Depends(get_current_user)):
    leagues = await db.leagues.find({"members.id": current_user["id"]}).to_list(100)
    
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

@api_router.get("/leagues/{league_id}", response_model=LeagueResponse)
async def get_league(league_id: str, current_user: dict = Depends(get_current_user)):
    league = await db.leagues.find_one({"id": league_id})
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

@api_router.post("/leagues/join", response_model=LeagueResponse)
async def join_league(request: JoinLeagueRequest, current_user: dict = Depends(get_current_user)):
    league = await db.leagues.find_one({"league_code": request.league_code.upper()})
    if not league:
        raise HTTPException(status_code=404, detail="League not found with this code")
    
    # Check if already member
    is_member = any(m["id"] == current_user["id"] for m in league["members"])
    if is_member:
        raise HTTPException(status_code=400, detail="You are already a member of this league")
    
    # Check if league has started (has any rounds)
    has_rounds = await db.rounds.find_one({"league_id": league["id"]}, {"_id": 0, "id": 1})
    if has_rounds:
        raise HTTPException(status_code=400, detail="This league has already started. New members cannot join once rounds have begun.")
    
    # Add user to members
    await db.leagues.update_one(
        {"id": league["id"]},
        {"$push": {"members": {"id": current_user["id"], "username": current_user["username"]}}}
    )
    
    # Fetch updated league
    league = await db.leagues.find_one({"id": league["id"]})
    return LeagueResponse(**league)

@api_router.delete("/leagues/{league_id}")
async def delete_league(league_id: str, current_user: dict = Depends(get_current_user)):
    league = await db.leagues.find_one({"id": league_id})
    if not league:
        raise HTTPException(status_code=404, detail="League not found")
    
    # Only creator can delete
    if league["creator_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Only the league creator can delete the league")
    
    # Mark league as deleted but preserve submissions/rounds/votes for stats
    # We just delete the league document, keeping historical data
    await db.leagues.delete_one({"id": league_id})
    
    return {"message": "League deleted successfully"}

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
    return LeagueResponse(**add_league_defaults(league))

@api_router.post("/leagues/{league_id}/leave")
async def leave_league(league_id: str, current_user: dict = Depends(get_current_user)):
    league = await db.leagues.find_one({"id": league_id})
    if not league:
        raise HTTPException(status_code=404, detail="League not found")
    
    # Check if user is member
    is_member = any(m["id"] == current_user["id"] for m in league["members"])
    if not is_member:
        raise HTTPException(status_code=400, detail="You are not a member of this league")
    
    # Creator cannot leave - they must delete the league
    if league["creator_id"] == current_user["id"]:
        raise HTTPException(status_code=400, detail="As the creator, you cannot leave. Delete the league instead.")
    
    # Remove user from members
    await db.leagues.update_one(
        {"id": league_id},
        {"$pull": {"members": {"id": current_user["id"]}}}
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
    league = await db.leagues.find_one({"id": league_id}, {"_id": 0, "members": 1})
    if not league:
        raise HTTPException(status_code=404, detail="League not found")
    
    total_members = len(league.get("members", []))
    rounds = await db.rounds.find({"league_id": league_id}, {"_id": 0}).sort("round_number", -1).to_list(100)
    
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
            voting_hours = round_doc.get("voting_hours", 24)
            new_voting_deadline = now + timedelta(hours=voting_hours)
            await db.rounds.update_one(
                {"id": round_id},
                {"$set": {"status": "voting", "voting_deadline": new_voting_deadline}}
            )
            status = "voting"
            round_doc["status"] = status
            round_doc["voting_deadline"] = new_voting_deadline
            
        elif status == "voting" and voting_deadline_dt < now:
            # Auto-lock all unlocked votes and complete round
            await db.votes.update_many(
                {"round_id": round_id, "locked": {"$ne": True}},
                {"$set": {"locked": True}}
            )
            await db.rounds.update_one(
                {"id": round_id},
                {"$set": {"status": "completed"}}
            )
            status = "completed"
            round_doc["status"] = status
        
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
        voting_hours = round_doc.get("voting_hours", 24)
        new_voting_deadline = now + timedelta(hours=voting_hours)
        await db.rounds.update_one(
            {"id": round_id},
            {"$set": {"status": "voting", "voting_deadline": new_voting_deadline}}
        )
        status = "voting"
        round_doc["status"] = status
        round_doc["voting_deadline"] = new_voting_deadline
        
    elif status == "voting" and voting_deadline < now:
        # Auto-lock all unlocked votes and complete round
        await db.votes.update_many(
            {"round_id": round_id, "locked": {"$ne": True}},
            {"$set": {"locked": True}}
        )
        await db.rounds.update_one(
            {"id": round_id},
            {"$set": {"status": "completed"}}
        )
        status = "completed"
        round_doc["status"] = status
    
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
        voting_hours = round_doc.get("voting_hours", 24)
        new_voting_deadline = now + timedelta(hours=voting_hours)
        await db.rounds.update_one(
            {"id": round_id}, 
            {"$set": {"status": "voting", "voting_deadline": new_voting_deadline}}
        )
        return {"message": "Round advanced to voting phase"}
    elif round_doc["status"] == "voting":
        # Auto-lock all unlocked votes when completing the round
        await db.votes.update_many(
            {"round_id": round_id, "locked": False},
            {"$set": {"locked": True}}
        )
        await db.rounds.update_one({"id": round_id}, {"$set": {"status": "completed"}})
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

# ==================== SUBMISSION ENDPOINTS ====================

@api_router.post("/rounds/{round_id}/submit", response_model=SubmissionResponse)
async def submit_song(round_id: str, request: SubmitSongRequest, current_user: dict = Depends(get_current_user)):
    round_doc = await db.rounds.find_one({"id": round_id})
    if not round_doc:
        raise HTTPException(status_code=404, detail="Round not found")
    
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
    
    if round_doc["status"] != "voting":
        raise HTTPException(status_code=400, detail="Voting is not open for this round")
    
    # Check if user already voted
    existing = await db.votes.find_one({
        "round_id": round_id,
        "voter_id": current_user["id"]
    })
    
    # Validate all submission IDs exist
    for sub_id in request.rankings:
        sub = await db.submissions.find_one({"id": sub_id, "round_id": round_id})
        if not sub:
            raise HTTPException(status_code=400, detail=f"Invalid submission ID: {sub_id}")
    
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
    """Get accumulated standings for all members in a league"""
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
            "rounds_played": 0
        }
    
    if not completed_rounds:
        # No completed rounds, return empty standings
        standings = sorted(user_stats.values(), key=lambda x: (-x["total_points"], -x["wins"]))
        return LeagueStandingsResponse(
            league_id=league_id,
            standings=standings,
            rounds_completed=0,
            total_rounds=league.get("total_rounds", 0)
        )
    
    # Batch fetch all submissions and votes for completed rounds
    round_ids = [r["id"] for r in completed_rounds]
    all_submissions = await db.submissions.find({
        "round_id": {"$in": round_ids}
    }, {"_id": 0, "id": 1, "round_id": 1, "user_id": 1}).to_list(1000)
    all_votes = await db.votes.find({
        "round_id": {"$in": round_ids}
    }, {"_id": 0, "round_id": 1, "rankings": 1}).to_list(1000)
    
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
        
        # Calculate points for this round
        points = {}
        for sub in submissions:
            points[sub["id"]] = 0
        
        num_submissions = len(submissions)
        for vote in votes:
            for rank, sub_id in enumerate(vote["rankings"]):
                points[sub_id] = points.get(sub_id, 0) + (num_submissions - rank)
        
        # Find winner(s) and update stats
        max_points = max(points.values()) if points else 0
        for sub in submissions:
            user_id = sub["user_id"]
            if user_id in user_stats:
                sub_points = points.get(sub["id"], 0)
                user_stats[user_id]["total_points"] += sub_points
                user_stats[user_id]["rounds_played"] += 1
                if sub_points == max_points and max_points > 0:
                    user_stats[user_id]["wins"] += 1
    
    # Sort by total points descending
    standings = sorted(user_stats.values(), key=lambda x: (-x["total_points"], -x["wins"]))
    
    return LeagueStandingsResponse(
        league_id=league_id,
        standings=standings,
        rounds_completed=len(completed_rounds),
        total_rounds=league.get("total_rounds", 0)
    )

@api_router.get("/rounds/{round_id}/results", response_model=RoundResultResponse)
async def get_results(round_id: str, current_user: dict = Depends(get_current_user)):
    round_doc = await db.rounds.find_one({"id": round_id})
    if not round_doc:
        raise HTTPException(status_code=404, detail="Round not found")
    
    if round_doc["status"] != "completed":
        raise HTTPException(status_code=400, detail="Results are not available until voting is complete")
    
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
            total_voters=0
        )
    
    # Calculate points using Dynamic Point Pool with Linear Decay
    # Each voter has 100 points to distribute
    # Points = (N - r + 1) / sum(1 to N) * 100 where N = songs being voted on, r = rank
    
    submission_scores = {sub["id"]: [] for sub in submissions}  # Store all scores for each submission
    
    for vote in votes:
        voter_id = vote.get("voter_id")
        rankings = vote["rankings"]
        N = len(rankings)  # Number of songs this voter is ranking (excludes their own)
        
        if N == 0:
            continue
            
        # Calculate sum of 1 to N for normalization
        sum_n = sum(range(1, N + 1))
        
        for rank_index, sub_id in enumerate(rankings):
            r = rank_index + 1  # Rank (1-indexed)
            # Points = (N - r + 1) / sum(1 to N) * 100
            points = ((N - r + 1) / sum_n) * 100
            submission_scores[sub_id].append(points)
    
    # Calculate Mean (Average) Score for each submission
    final_scores = {}
    std_devs = {}
    for sub_id, scores in submission_scores.items():
        if scores:
            mean_score = sum(scores) / len(scores)
            final_scores[sub_id] = mean_score
            # Calculate standard deviation for tie-breaker
            if len(scores) > 1:
                variance = sum((s - mean_score) ** 2 for s in scores) / len(scores)
                std_devs[sub_id] = variance ** 0.5
            else:
                std_devs[sub_id] = 0
        else:
            final_scores[sub_id] = 0
            std_devs[sub_id] = 0
    
    # Sort by mean score (descending), then by standard deviation (ascending) for tie-breaker
    sorted_subs = sorted(submissions, key=lambda s: (-final_scores[s["id"]], std_devs[s["id"]]))
    
    # Assign ranks with tie handling
    rankings = []
    current_rank = 1
    prev_score = None
    prev_std = None
    
    for i, sub in enumerate(sorted_subs):
        sub_score = final_scores[sub["id"]]
        sub_std = std_devs[sub["id"]]
        
        # Check if this is a tie (same score AND same std dev)
        if prev_score is not None and abs(sub_score - prev_score) < 0.001 and abs(sub_std - prev_std) < 0.001:
            # Same rank as previous
            pass
        else:
            current_rank = i + 1
        
        rankings.append({
            "submission_id": sub["id"],
            "song": sub["song"],
            "user_id": sub["user_id"],
            "username": sub["username"],
            "points": round(sub_score, 2),
            "rank": current_rank
        })
        
        prev_score = sub_score
        prev_std = sub_std
    
    # Determine winners (rank 1)
    winners = [r for r in rankings if r["rank"] == 1]
    is_tie = len(winners) > 1
    
    return RoundResultResponse(
        id=str(uuid.uuid4()),
        round_id=round_id,
        rankings=rankings,
        winners=winners,
        is_tie=is_tie,
        total_voters=len(votes)
    )

# ==================== SONG SEARCH (DEEZER PROXY) ====================

@api_router.get("/songs/search")
async def search_songs(q: str, limit: int = 20):
    """Search songs using Deezer API"""
    if not q or len(q) < 2:
        return {"data": []}
    
    try:
        async with httpx.AsyncClient(verify=False, timeout=30.0) as client:
            response = await client.get(
                "https://api.deezer.com/search",
                params={"q": q, "limit": limit}
            )
            response.raise_for_status()
            data = response.json()
            
            # Transform Deezer response to our format
            songs = []
            for track in data.get("data", []):
                songs.append({
                    "deezer_id": track["id"],
                    "title": track["title"],
                    "artist": track["artist"]["name"],
                    "album": track["album"]["title"],
                    "preview_url": track["preview"],
                    "cover_url": track["album"]["cover_medium"],
                    "duration": track["duration"]
                })
            
            return {"data": songs}
    except httpx.TimeoutException:
        logger.error("Deezer API timeout")
        raise HTTPException(status_code=504, detail="Song search timed out. Please try again.")
    except httpx.HTTPError as e:
        logger.error(f"Deezer HTTP error: {e}")
        raise HTTPException(status_code=502, detail="Could not connect to song service")
    except Exception as e:
        logger.error(f"Deezer API error: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to search songs: {type(e).__name__}")

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
    return {"message": "Music League API", "version": "1.0.0"}

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
