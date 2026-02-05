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
SECRET_KEY = os.environ.get('JWT_SECRET', 'music-league-secret-key-2025')
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

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: str
    email: str
    username: str
    profile_photo: Optional[str] = None
    created_at: datetime

class UserUpdate(BaseModel):
    username: Optional[str] = None
    profile_photo: Optional[str] = None

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

class LeagueCreate(BaseModel):
    name: str
    theme: str = ""  # Default theme for all rounds (can be empty)
    theme_mode: str = "all_rounds"  # 'all_rounds', 'per_round', 'no_theme'
    submission_hours: int = 24
    voting_hours: int = 24
    total_rounds: int = 0  # 0 means unlimited rounds

class LeagueResponse(BaseModel):
    id: str
    name: str
    theme: str
    theme_mode: str
    league_code: str
    creator_id: str
    creator_username: str
    submission_hours: int
    voting_hours: int
    total_rounds: int
    members: List[dict]
    current_round: int
    status: str
    created_at: datetime

class JoinLeagueRequest(BaseModel):
    league_code: str

class StartRoundRequest(BaseModel):
    theme: str = ""  # Theme for this specific round (used when theme_mode is 'per_round')

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

class SubmissionResponse(BaseModel):
    id: str
    round_id: str
    user_id: str
    username: str
    song: SongData
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

class RoundResponse(BaseModel):
    id: str
    league_id: str
    round_number: int
    theme: str
    status: str  # "submission", "voting", "completed"
    submission_deadline: datetime
    voting_deadline: datetime
    submissions_count: int
    has_user_submitted: bool
    has_user_voted: bool
    user_vote_locked: bool  # Whether user's vote is locked
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

# ==================== HELPER FUNCTIONS ====================

def generate_league_code() -> str:
    """Generate a unique 6-character league code"""
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))

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
    
    user = await db.users.find_one({"id": user_id})
    if user is None:
        raise credentials_exception
    return user

# ==================== AUTH ENDPOINTS ====================

@api_router.post("/auth/register", response_model=TokenResponse)
async def register(user_data: UserCreate):
    # Check if email exists
    existing_user = await db.users.find_one({"email": user_data.email})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Check if username exists
    existing_username = await db.users.find_one({"username": user_data.username})
    if existing_username:
        raise HTTPException(status_code=400, detail="Username already taken")
    
    # Create user
    user_id = str(uuid.uuid4())
    user = {
        "id": user_id,
        "email": user_data.email,
        "username": user_data.username,
        "password_hash": hash_password(user_data.password),
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
            created_at=user["created_at"]
        )
    )

@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    return UserResponse(
        id=current_user["id"],
        email=current_user["email"],
        username=current_user["username"],
        profile_photo=current_user.get("profile_photo"),
        created_at=current_user["created_at"]
    )

@api_router.get("/auth/stats")
async def get_user_stats(current_user: dict = Depends(get_current_user)):
    """Get user statistics: total wins, rounds played, win rate, leagues count"""
    user_id = current_user["id"]
    
    # Get leagues count
    leagues_count = await db.leagues.count_documents({"members.id": user_id})
    
    # Get all submissions by user
    submissions = await db.submissions.find({"user_id": user_id}).to_list(1000)
    rounds_played = len(submissions)
    
    # Calculate wins by checking completed rounds
    total_wins = 0
    for submission in submissions:
        round_doc = await db.rounds.find_one({"id": submission["round_id"], "status": "completed"})
        if round_doc:
            # Get all submissions for this round and calculate winner
            round_submissions = await db.submissions.find({"round_id": submission["round_id"]}).to_list(100)
            votes = await db.votes.find({"round_id": submission["round_id"]}).to_list(100)
            
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
        "theme": league_data.theme,
        "theme_mode": league_data.theme_mode,
        "league_code": league_code,
        "creator_id": current_user["id"],
        "creator_username": current_user["username"],
        "submission_hours": league_data.submission_hours,
        "voting_hours": league_data.voting_hours,
        "total_rounds": league_data.total_rounds,
        "members": [{"id": current_user["id"], "username": current_user["username"]}],
        "current_round": 0,
        "status": "active",
        "created_at": datetime.now(timezone.utc)
    }
    await db.leagues.insert_one(league)
    
    return LeagueResponse(**league)

@api_router.get("/leagues", response_model=List[LeagueResponse])
async def get_user_leagues(current_user: dict = Depends(get_current_user)):
    leagues = await db.leagues.find({"members.id": current_user["id"]}).to_list(100)
    return [LeagueResponse(**league) for league in leagues]

@api_router.get("/leagues/{league_id}", response_model=LeagueResponse)
async def get_league(league_id: str, current_user: dict = Depends(get_current_user)):
    league = await db.leagues.find_one({"id": league_id})
    if not league:
        raise HTTPException(status_code=404, detail="League not found")
    
    # Check if user is member
    is_member = any(m["id"] == current_user["id"] for m in league["members"])
    if not is_member:
        raise HTTPException(status_code=403, detail="You are not a member of this league")
    
    return LeagueResponse(**league)

@api_router.post("/leagues/join", response_model=LeagueResponse)
async def join_league(request: JoinLeagueRequest, current_user: dict = Depends(get_current_user)):
    league = await db.leagues.find_one({"league_code": request.league_code.upper()})
    if not league:
        raise HTTPException(status_code=404, detail="League not found with this code")
    
    # Check if already member
    is_member = any(m["id"] == current_user["id"] for m in league["members"])
    if is_member:
        raise HTTPException(status_code=400, detail="You are already a member of this league")
    
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
    
    round_number = league["current_round"] + 1
    round_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    
    # Determine theme based on theme_mode
    theme_mode = league.get("theme_mode", "all_rounds")
    if theme_mode == "no_theme":
        theme = ""
    elif theme_mode == "per_round":
        theme = round_data.theme if round_data and round_data.theme else ""
    else:  # all_rounds
        theme = league.get("theme", "")
    
    round_doc = {
        "id": round_id,
        "league_id": league_id,
        "round_number": round_number,
        "theme": theme,
        "status": "submission",
        "submission_deadline": now + timedelta(hours=league["submission_hours"]),
        "voting_deadline": now + timedelta(hours=league["submission_hours"] + league["voting_hours"]),
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
        has_user_submitted=False,
        has_user_voted=False,
        user_vote_locked=False
    )

@api_router.get("/leagues/{league_id}/rounds", response_model=List[RoundResponse])
async def get_rounds(league_id: str, current_user: dict = Depends(get_current_user)):
    league = await db.leagues.find_one({"id": league_id})
    if not league:
        raise HTTPException(status_code=404, detail="League not found")
    
    rounds = await db.rounds.find({"league_id": league_id}).sort("round_number", -1).to_list(100)
    
    result = []
    for round_doc in rounds:
        submissions_count = await db.submissions.count_documents({"round_id": round_doc["id"]})
        has_submitted = await db.submissions.find_one({
            "round_id": round_doc["id"],
            "user_id": current_user["id"]
        }) is not None
        user_vote = await db.votes.find_one({
            "round_id": round_doc["id"],
            "voter_id": current_user["id"]
        })
        has_voted = user_vote is not None
        user_vote_locked = user_vote.get("locked", False) if user_vote else False
        
        result.append(RoundResponse(
            **round_doc,
            submissions_count=submissions_count,
            has_user_submitted=has_submitted,
            has_user_voted=has_voted,
            user_vote_locked=user_vote_locked
        ))
    
    return result

@api_router.get("/rounds/{round_id}", response_model=RoundResponse)
async def get_round(round_id: str, current_user: dict = Depends(get_current_user)):
    round_doc = await db.rounds.find_one({"id": round_id})
    if not round_doc:
        raise HTTPException(status_code=404, detail="Round not found")
    
    submissions_count = await db.submissions.count_documents({"round_id": round_id})
    has_submitted = await db.submissions.find_one({
        "round_id": round_id,
        "user_id": current_user["id"]
    }) is not None
    user_vote = await db.votes.find_one({
        "round_id": round_id,
        "voter_id": current_user["id"]
    })
    has_voted = user_vote is not None
    user_vote_locked = user_vote.get("locked", False) if user_vote else False
    
    return RoundResponse(
        **round_doc,
        submissions_count=submissions_count,
        has_user_submitted=has_submitted,
        has_user_voted=has_voted,
        user_vote_locked=user_vote_locked
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
        now = datetime.now(timezone.utc)
        new_voting_deadline = now + timedelta(hours=league["voting_hours"])
        await db.rounds.update_one(
            {"id": round_id}, 
            {"$set": {"status": "voting", "voting_deadline": new_voting_deadline}}
        )
        return {"message": "Round advanced to voting phase"}
    elif round_doc["status"] == "voting":
        await db.rounds.update_one({"id": round_id}, {"$set": {"status": "completed"}})
        return {"message": "Round completed"}
    else:
        return {"message": "Round is already completed"}

# ==================== SUBMISSION ENDPOINTS ====================

@api_router.post("/rounds/{round_id}/submit", response_model=SubmissionResponse)
async def submit_song(round_id: str, request: SubmitSongRequest, current_user: dict = Depends(get_current_user)):
    round_doc = await db.rounds.find_one({"id": round_id})
    if not round_doc:
        raise HTTPException(status_code=404, detail="Round not found")
    
    if round_doc["status"] != "submission":
        raise HTTPException(status_code=400, detail="Submissions are closed for this round")
    
    # Check if user already submitted
    existing = await db.submissions.find_one({
        "round_id": round_id,
        "user_id": current_user["id"]
    })
    if existing:
        raise HTTPException(status_code=400, detail="You have already submitted a song for this round")
    
    submission_id = str(uuid.uuid4())
    submission = {
        "id": submission_id,
        "round_id": round_id,
        "user_id": current_user["id"],
        "username": current_user["username"],
        "song": request.song.dict(),
        "submitted_at": datetime.now(timezone.utc)
    }
    await db.submissions.insert_one(submission)
    
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
    
    for round_doc in completed_rounds:
        submissions = await db.submissions.find({"round_id": round_doc["id"]}).to_list(100)
        votes = await db.votes.find({"round_id": round_doc["id"]}).to_list(100)
        
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
    
    # Calculate points (inverse ranking - higher rank = more points)
    points = {}
    for sub in submissions:
        points[sub["id"]] = 0
    
    num_submissions = len(submissions)
    for vote in votes:
        for rank, sub_id in enumerate(vote["rankings"]):
            # First place gets most points, last gets least
            points[sub_id] = points.get(sub_id, 0) + (num_submissions - rank)
    
    # Sort by points
    sorted_subs = sorted(submissions, key=lambda s: points[s["id"]], reverse=True)
    
    # Assign ranks with tie handling
    rankings = []
    current_rank = 1
    prev_points = None
    
    for i, sub in enumerate(sorted_subs):
        sub_points = points[sub["id"]]
        
        # If points are different from previous, update the rank
        if prev_points is not None and sub_points < prev_points:
            current_rank = i + 1
        
        rankings.append({
            "submission_id": sub["id"],
            "song": sub["song"],
            "user_id": sub["user_id"],
            "username": sub["username"],
            "points": sub_points,
            "rank": current_rank
        })
        prev_points = sub_points
    
    # Find all winners (those with rank 1)
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
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(
                f"https://api.deezer.com/search",
                params={"q": q, "limit": limit},
                timeout=10.0
            )
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
        except Exception as e:
            logger.error(f"Deezer API error: {e}")
            raise HTTPException(status_code=500, detail="Failed to search songs")

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
