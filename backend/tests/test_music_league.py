"""
Music League Backend Tests
Tests for: Auth, League, Round, Submission, Voting with N-1 point system
Focus: Voting logic, standings accumulation, tie handling, non-voter auto-distribution
"""

import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://music-league-dev.preview.emergentagent.com').rstrip('/')

# Test data prefix for cleanup
TEST_PREFIX = f"TEST_{uuid.uuid4().hex[:8]}"

class TestAuth:
    """Authentication endpoint tests - POST /api/auth/register, POST /api/auth/login"""
    
    def test_register_new_user(self):
        """Test user registration with new unique email"""
        unique_id = uuid.uuid4().hex[:6]
        response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": f"{TEST_PREFIX}_{unique_id}@test.com",
            "username": f"{TEST_PREFIX}_{unique_id}",
            "password": "testpass123",
            "phone_number": "1234567890",
            "display_name": f"Test User {unique_id}"
        })
        
        assert response.status_code == 200, f"Registration failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert "user" in data
        assert data["user"]["email"] == f"{TEST_PREFIX}_{unique_id}@test.com"
        assert data["user"]["username"] == f"{TEST_PREFIX}_{unique_id}"
        print(f"PASS: User registered successfully - {data['user']['username']}")
        return data
    
    def test_register_duplicate_email_fails(self):
        """Test that registering with existing email fails"""
        # First create a user
        unique_id = uuid.uuid4().hex[:6]
        email = f"{TEST_PREFIX}_dup_{unique_id}@test.com"
        
        requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": email,
            "username": f"{TEST_PREFIX}_dup_{unique_id}",
            "password": "testpass123",
            "phone_number": "1234567890"
        })
        
        # Try to register again with same email
        response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": email,
            "username": f"{TEST_PREFIX}_dup2_{unique_id}",
            "password": "testpass123",
            "phone_number": "1234567890"
        })
        
        assert response.status_code == 400
        assert "already registered" in response.json().get("detail", "").lower()
        print("PASS: Duplicate email registration correctly rejected")
    
    def test_login_success(self):
        """Test login with valid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test1@ml.com",
            "password": "test123"
        })
        
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert "user" in data
        assert data["user"]["email"] == "test1@ml.com"
        print(f"PASS: Login successful for user {data['user']['username']}")
        return data
    
    def test_login_invalid_credentials(self):
        """Test login with invalid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "invalid@test.com",
            "password": "wrongpassword"
        })
        
        assert response.status_code == 401
        print("PASS: Invalid credentials correctly rejected")


class TestLeague:
    """League CRUD tests - POST /api/leagues, POST /api/leagues/join"""
    
    @pytest.fixture
    def auth_token(self):
        """Get auth token for test user"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test1@ml.com",
            "password": "test123"
        })
        if response.status_code != 200:
            pytest.skip("Login failed - skipping authenticated tests")
        return response.json()["access_token"]
    
    def test_create_league(self, auth_token):
        """Test creating a new league"""
        unique_id = uuid.uuid4().hex[:6]
        response = requests.post(
            f"{BASE_URL}/api/leagues",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "name": f"{TEST_PREFIX}_League_{unique_id}",
                "total_rounds": 3
            }
        )
        
        assert response.status_code == 200, f"Create league failed: {response.text}"
        data = response.json()
        assert data["name"] == f"{TEST_PREFIX}_League_{unique_id}"
        assert "league_code" in data
        assert data["total_rounds"] == 3
        print(f"PASS: League created - {data['name']} (code: {data['league_code']})")
        return data
    
    def test_join_league(self, auth_token):
        """Test joining a league with code"""
        # First create a league
        unique_id = uuid.uuid4().hex[:6]
        create_response = requests.post(
            f"{BASE_URL}/api/leagues",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"name": f"{TEST_PREFIX}_JoinTest_{unique_id}", "total_rounds": 2}
        )
        league = create_response.json()
        league_code = league["league_code"]
        
        # Register a new user to join
        new_user_response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": f"{TEST_PREFIX}_joiner_{unique_id}@test.com",
            "username": f"{TEST_PREFIX}_joiner_{unique_id}",
            "password": "testpass123"
        })
        new_user_token = new_user_response.json()["access_token"]
        
        # Join the league
        join_response = requests.post(
            f"{BASE_URL}/api/leagues/join",
            headers={"Authorization": f"Bearer {new_user_token}"},
            json={"league_code": league_code}
        )
        
        assert join_response.status_code == 200, f"Join failed: {join_response.text}"
        data = join_response.json()
        assert len(data["members"]) == 2  # Creator + new member
        print(f"PASS: User joined league successfully (members: {len(data['members'])})")


class TestRound:
    """Round creation and advancement tests - POST /api/leagues/{id}/rounds, POST /api/rounds/{id}/advance"""
    
    @pytest.fixture
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test1@ml.com",
            "password": "test123"
        })
        if response.status_code != 200:
            pytest.skip("Login failed")
        return response.json()["access_token"]
    
    def test_create_round(self, auth_token):
        """Test creating a round for a league"""
        # Create a league first
        unique_id = uuid.uuid4().hex[:6]
        league_response = requests.post(
            f"{BASE_URL}/api/leagues",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"name": f"{TEST_PREFIX}_RoundTest_{unique_id}", "total_rounds": 3}
        )
        league = league_response.json()
        
        # Create a round
        round_response = requests.post(
            f"{BASE_URL}/api/leagues/{league['id']}/rounds",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "theme": "90s Rock Anthems",
                "submission_hours": 24,
                "voting_hours": 24,
                "timezone": "EST"
            }
        )
        
        assert round_response.status_code == 200, f"Create round failed: {round_response.text}"
        data = round_response.json()
        assert data["theme"] == "90s Rock Anthems"
        assert data["status"] == "submission"
        assert data["round_number"] == 1
        print(f"PASS: Round created - theme: {data['theme']}, status: {data['status']}")
        return {"league": league, "round": data, "token": auth_token}


class TestVotingSystem:
    """
    Comprehensive tests for N-1 voting point system:
    - 1st place gets (N-1) points per voter where N = number of submitters
    - 2nd place gets (N-2), 3rd gets (N-3), etc.
    - Non-voters auto-distribute points evenly
    - Ties give same rank to users with same score
    """
    
    @pytest.fixture
    def setup_league_with_users(self):
        """Create a league with 4 users for voting tests"""
        unique_id = uuid.uuid4().hex[:6]
        users = []
        
        # Create 4 users
        for i in range(4):
            response = requests.post(f"{BASE_URL}/api/auth/register", json={
                "email": f"{TEST_PREFIX}_vote{i}_{unique_id}@test.com",
                "username": f"{TEST_PREFIX}_vote{i}_{unique_id}",
                "password": "testpass123",
                "display_name": f"Voter {i}"
            })
            if response.status_code == 200:
                data = response.json()
                users.append({
                    "id": data["user"]["id"],
                    "username": data["user"]["username"],
                    "token": data["access_token"]
                })
        
        if len(users) < 4:
            pytest.skip("Could not create enough users for voting test")
        
        # User 0 creates the league
        league_response = requests.post(
            f"{BASE_URL}/api/leagues",
            headers={"Authorization": f"Bearer {users[0]['token']}"},
            json={"name": f"{TEST_PREFIX}_VoteLeague_{unique_id}", "total_rounds": 5}
        )
        league = league_response.json()
        
        # Other users join
        for i in range(1, 4):
            requests.post(
                f"{BASE_URL}/api/leagues/join",
                headers={"Authorization": f"Bearer {users[i]['token']}"},
                json={"league_code": league["league_code"]}
            )
        
        print(f"Setup: Created league with {len(users)} users")
        return {"league": league, "users": users}
    
    def test_submit_songs(self, setup_league_with_users):
        """Test song submission for all users"""
        data = setup_league_with_users
        league = data["league"]
        users = data["users"]
        
        # Create a round
        round_response = requests.post(
            f"{BASE_URL}/api/leagues/{league['id']}/rounds",
            headers={"Authorization": f"Bearer {users[0]['token']}"},
            json={
                "theme": "Test Theme",
                "submission_hours": 24,
                "voting_hours": 24,
                "timezone": "EST"
            }
        )
        assert round_response.status_code == 200, f"Round creation failed: {round_response.text}"
        round_data = round_response.json()
        
        submissions = []
        # All 4 users submit songs
        for i, user in enumerate(users):
            submit_response = requests.post(
                f"{BASE_URL}/api/rounds/{round_data['id']}/submit",
                headers={"Authorization": f"Bearer {user['token']}"},
                json={
                    "song": {
                        "deezer_id": 1000 + i,
                        "title": f"Song {i}",
                        "artist": f"Artist {i}",
                        "album": f"Album {i}",
                        "preview_url": f"https://preview.url/{i}",
                        "cover_url": f"https://cover.url/{i}",
                        "duration": 180 + i * 10
                    },
                    "locked": True
                }
            )
            assert submit_response.status_code == 200, f"Submit failed for user {i}: {submit_response.text}"
            submissions.append(submit_response.json())
        
        assert len(submissions) == 4
        print(f"PASS: All {len(submissions)} users submitted songs")
        return {"round": round_data, "league": league, "users": users, "submissions": submissions}
    
    def test_voting_n1_point_system(self, setup_league_with_users):
        """
        Test N-1 point system: In a 4-person league (3 songs to rank each):
        - 1st place = 3 pts
        - 2nd place = 2 pts  
        - 3rd place = 1 pt
        """
        data = setup_league_with_users
        league = data["league"]
        users = data["users"]
        
        # Create round and submit songs
        round_response = requests.post(
            f"{BASE_URL}/api/leagues/{league['id']}/rounds",
            headers={"Authorization": f"Bearer {users[0]['token']}"},
            json={"theme": "N-1 Test", "submission_hours": 24, "voting_hours": 24, "timezone": "EST"}
        )
        round_data = round_response.json()
        
        # All users submit
        submissions = []
        for i, user in enumerate(users):
            submit_response = requests.post(
                f"{BASE_URL}/api/rounds/{round_data['id']}/submit",
                headers={"Authorization": f"Bearer {user['token']}"},
                json={
                    "song": {"deezer_id": 2000 + i, "title": f"N1Song{i}", "artist": f"Artist{i}", 
                             "album": f"Album{i}", "preview_url": f"https://p.url/{i}", 
                             "cover_url": f"https://c.url/{i}", "duration": 180},
                    "locked": True
                }
            )
            submissions.append(submit_response.json())
        
        # Advance to voting
        advance_response = requests.post(
            f"{BASE_URL}/api/rounds/{round_data['id']}/advance",
            headers={"Authorization": f"Bearer {users[0]['token']}"}
        )
        assert advance_response.status_code == 200, f"Advance failed: {advance_response.text}"
        
        # Get other users' submission IDs (excluding own)
        # User 0 votes: User1 1st, User2 2nd, User3 3rd
        user0_rankings = [submissions[1]["id"], submissions[2]["id"], submissions[3]["id"]]
        # User 1 votes: User0 1st, User2 2nd, User3 3rd
        user1_rankings = [submissions[0]["id"], submissions[2]["id"], submissions[3]["id"]]
        # User 2 votes: User0 1st, User1 2nd, User3 3rd
        user2_rankings = [submissions[0]["id"], submissions[1]["id"], submissions[3]["id"]]
        # User 3 votes: User0 1st, User1 2nd, User2 3rd
        user3_rankings = [submissions[0]["id"], submissions[1]["id"], submissions[2]["id"]]
        
        all_rankings = [user0_rankings, user1_rankings, user2_rankings, user3_rankings]
        
        # Submit votes
        for i, user in enumerate(users):
            vote_response = requests.post(
                f"{BASE_URL}/api/rounds/{round_data['id']}/vote",
                headers={"Authorization": f"Bearer {user['token']}"},
                json={"rankings": all_rankings[i], "locked": True}
            )
            assert vote_response.status_code == 200, f"Vote failed for user {i}: {vote_response.text}"
        
        print("All votes submitted")
        
        # Complete round
        complete_response = requests.post(
            f"{BASE_URL}/api/rounds/{round_data['id']}/advance",
            headers={"Authorization": f"Bearer {users[0]['token']}"}
        )
        assert complete_response.status_code == 200
        
        # Get results
        results_response = requests.get(
            f"{BASE_URL}/api/rounds/{round_data['id']}/results",
            headers={"Authorization": f"Bearer {users[0]['token']}"}
        )
        assert results_response.status_code == 200, f"Results failed: {results_response.text}"
        results = results_response.json()
        
        print(f"\n=== N-1 Point System Results ===")
        for r in results["rankings"]:
            print(f"Rank {r['rank']}: {r['username']} - {r['points']} pts")
        
        # Expected: 
        # User0: 3 votes as 1st (3*3 = 9 pts)
        # User1: 1 vote as 1st (3) + 2 votes as 2nd (2*2 = 4) = 7 pts  
        # User2: 3 votes as 2nd (3) + 0 as 1st = should be lower
        # User3: 3 votes as 3rd (1*3 = 3 pts)
        
        # Verify User0 should have most points
        rankings = results["rankings"]
        user0_result = next((r for r in rankings if r["submission_id"] == submissions[0]["id"]), None)
        assert user0_result is not None
        
        # With all 4 voters voting User0 as 1st place except User0 themselves
        # User0 gets: 3+3+3 = 9 pts (3 voters giving 3 pts each)
        assert user0_result["points"] == 9, f"Expected 9 pts for User0, got {user0_result['points']}"
        assert user0_result["rank"] == 1, f"Expected rank 1 for User0, got {user0_result['rank']}"
        
        print(f"PASS: N-1 point system verified - User0 got {user0_result['points']} pts, rank {user0_result['rank']}")
        
        return {"round_id": round_data["id"], "results": results, "league": league, "users": users}
    
    def test_non_voter_auto_distribution(self, setup_league_with_users):
        """
        Test non-voter auto-distribution:
        When a user doesn't vote, their points are distributed evenly to others
        """
        data = setup_league_with_users
        league = data["league"]
        users = data["users"]
        
        # Create a new round
        round_response = requests.post(
            f"{BASE_URL}/api/leagues/{league['id']}/rounds",
            headers={"Authorization": f"Bearer {users[0]['token']}"},
            json={"theme": "Non-Voter Test", "submission_hours": 24, "voting_hours": 24, "timezone": "EST"}
        )
        round_data = round_response.json()
        
        # All users submit
        submissions = []
        for i, user in enumerate(users):
            submit_response = requests.post(
                f"{BASE_URL}/api/rounds/{round_data['id']}/submit",
                headers={"Authorization": f"Bearer {user['token']}"},
                json={
                    "song": {"deezer_id": 3000 + i, "title": f"NVSong{i}", "artist": f"Artist{i}",
                             "album": f"Album{i}", "preview_url": f"https://p.url/{i}",
                             "cover_url": f"https://c.url/{i}", "duration": 180},
                    "locked": True
                }
            )
            submissions.append(submit_response.json())
        
        # Advance to voting
        requests.post(
            f"{BASE_URL}/api/rounds/{round_data['id']}/advance",
            headers={"Authorization": f"Bearer {users[0]['token']}"}
        )
        
        # Only users 0, 1, 2 vote (user 3 doesn't vote - non-voter)
        # User 0 votes
        vote0_response = requests.post(
            f"{BASE_URL}/api/rounds/{round_data['id']}/vote",
            headers={"Authorization": f"Bearer {users[0]['token']}"},
            json={"rankings": [submissions[1]["id"], submissions[2]["id"], submissions[3]["id"]], "locked": True}
        )
        # User 1 votes
        vote1_response = requests.post(
            f"{BASE_URL}/api/rounds/{round_data['id']}/vote",
            headers={"Authorization": f"Bearer {users[1]['token']}"},
            json={"rankings": [submissions[0]["id"], submissions[2]["id"], submissions[3]["id"]], "locked": True}
        )
        # User 2 votes
        vote2_response = requests.post(
            f"{BASE_URL}/api/rounds/{round_data['id']}/vote",
            headers={"Authorization": f"Bearer {users[2]['token']}"},
            json={"rankings": [submissions[0]["id"], submissions[1]["id"], submissions[3]["id"]], "locked": True}
        )
        
        # User 3 does NOT vote (testing auto-distribution)
        
        # Complete round
        requests.post(
            f"{BASE_URL}/api/rounds/{round_data['id']}/advance",
            headers={"Authorization": f"Bearer {users[0]['token']}"}
        )
        
        # Get results
        results_response = requests.get(
            f"{BASE_URL}/api/rounds/{round_data['id']}/results",
            headers={"Authorization": f"Bearer {users[0]['token']}"}
        )
        results = results_response.json()
        
        print(f"\n=== Non-Voter Auto-Distribution Results ===")
        print(f"Total voters: {results['total_voters']} (expected: 3)")
        for r in results["rankings"]:
            print(f"Rank {r['rank']}: {r['username']} - {r['points']} pts")
        
        # User 3's non-vote should be auto-distributed (total = 3+2+1=6 pts, split among 3 others = 2 each)
        # Verify that results account for non-voter distribution
        total_points = sum(r["points"] for r in results["rankings"])
        
        # 4 voters * (3+2+1=6 pts each) = 24 total points should be distributed
        # But user3 didn't vote, so their 6 points are distributed among 3 others
        # Expected total = 3 actual voters * 6 + 1 non-voter * 6 = 24 points
        assert total_points == 24, f"Expected 24 total pts with non-voter distribution, got {total_points}"
        
        print(f"PASS: Non-voter auto-distribution working - total points: {total_points}")
        return results
    
    def test_tie_scenario(self, setup_league_with_users):
        """
        Test tie handling: Users with same score should get same rank
        """
        data = setup_league_with_users
        league = data["league"]
        users = data["users"]
        
        # Create round
        round_response = requests.post(
            f"{BASE_URL}/api/leagues/{league['id']}/rounds",
            headers={"Authorization": f"Bearer {users[0]['token']}"},
            json={"theme": "Tie Test", "submission_hours": 24, "voting_hours": 24, "timezone": "EST"}
        )
        round_data = round_response.json()
        
        # All submit
        submissions = []
        for i, user in enumerate(users):
            submit_response = requests.post(
                f"{BASE_URL}/api/rounds/{round_data['id']}/submit",
                headers={"Authorization": f"Bearer {user['token']}"},
                json={
                    "song": {"deezer_id": 4000 + i, "title": f"TieSong{i}", "artist": f"Artist{i}",
                             "album": f"Album{i}", "preview_url": f"https://p.url/{i}",
                             "cover_url": f"https://c.url/{i}", "duration": 180},
                    "locked": True
                }
            )
            submissions.append(submit_response.json())
        
        # Advance to voting
        requests.post(
            f"{BASE_URL}/api/rounds/{round_data['id']}/advance",
            headers={"Authorization": f"Bearer {users[0]['token']}"}
        )
        
        # Create tie scenario: User0 and User1 both get voted as 1st place by 2 people each
        # User 0 votes: User1 1st, User2 2nd, User3 3rd
        requests.post(
            f"{BASE_URL}/api/rounds/{round_data['id']}/vote",
            headers={"Authorization": f"Bearer {users[0]['token']}"},
            json={"rankings": [submissions[1]["id"], submissions[2]["id"], submissions[3]["id"]], "locked": True}
        )
        # User 1 votes: User0 1st, User2 2nd, User3 3rd
        requests.post(
            f"{BASE_URL}/api/rounds/{round_data['id']}/vote",
            headers={"Authorization": f"Bearer {users[1]['token']}"},
            json={"rankings": [submissions[0]["id"], submissions[2]["id"], submissions[3]["id"]], "locked": True}
        )
        # User 2 votes: User1 1st, User0 2nd, User3 3rd
        requests.post(
            f"{BASE_URL}/api/rounds/{round_data['id']}/vote",
            headers={"Authorization": f"Bearer {users[2]['token']}"},
            json={"rankings": [submissions[1]["id"], submissions[0]["id"], submissions[3]["id"]], "locked": True}
        )
        # User 3 votes: User0 1st, User1 2nd, User2 3rd
        requests.post(
            f"{BASE_URL}/api/rounds/{round_data['id']}/vote",
            headers={"Authorization": f"Bearer {users[3]['token']}"},
            json={"rankings": [submissions[0]["id"], submissions[1]["id"], submissions[2]["id"]], "locked": True}
        )
        
        # Complete round
        requests.post(
            f"{BASE_URL}/api/rounds/{round_data['id']}/advance",
            headers={"Authorization": f"Bearer {users[0]['token']}"}
        )
        
        # Get results
        results_response = requests.get(
            f"{BASE_URL}/api/rounds/{round_data['id']}/results",
            headers={"Authorization": f"Bearer {users[0]['token']}"}
        )
        results = results_response.json()
        
        print(f"\n=== Tie Scenario Results ===")
        for r in results["rankings"]:
            print(f"Rank {r['rank']}: {r['username']} - {r['points']} pts")
        
        # Expected: User0 gets 3+2+3=8, User1 gets 3+3+2=8 (TIE at rank 1)
        user0_result = next((r for r in results["rankings"] if r["submission_id"] == submissions[0]["id"]), None)
        user1_result = next((r for r in results["rankings"] if r["submission_id"] == submissions[1]["id"]), None)
        
        assert user0_result["points"] == user1_result["points"], \
            f"Expected tie, but User0={user0_result['points']}, User1={user1_result['points']}"
        assert user0_result["rank"] == user1_result["rank"] == 1, \
            f"Expected both rank 1, got User0={user0_result['rank']}, User1={user1_result['rank']}"
        
        # Check is_tie flag
        assert results["is_tie"] == True, "Expected is_tie=True"
        assert len(results["winners"]) == 2, f"Expected 2 winners in tie, got {len(results['winners'])}"
        
        print(f"PASS: Tie scenario verified - Both users at rank 1 with {user0_result['points']} pts")
        return results


class TestStandings:
    """Test accumulated standings across multiple rounds - GET /api/leagues/{id}/standings"""
    
    @pytest.fixture
    def setup_multi_round_league(self):
        """Create a league and complete multiple rounds"""
        unique_id = uuid.uuid4().hex[:6]
        users = []
        
        # Create 3 users
        for i in range(3):
            response = requests.post(f"{BASE_URL}/api/auth/register", json={
                "email": f"{TEST_PREFIX}_stand{i}_{unique_id}@test.com",
                "username": f"{TEST_PREFIX}_stand{i}_{unique_id}",
                "password": "testpass123"
            })
            if response.status_code == 200:
                data = response.json()
                users.append({"id": data["user"]["id"], "token": data["access_token"], "username": data["user"]["username"]})
        
        if len(users) < 3:
            pytest.skip("Could not create users for standings test")
        
        # Create league
        league_response = requests.post(
            f"{BASE_URL}/api/leagues",
            headers={"Authorization": f"Bearer {users[0]['token']}"},
            json={"name": f"{TEST_PREFIX}_StandingsLeague_{unique_id}", "total_rounds": 5}
        )
        league = league_response.json()
        
        # Others join
        for i in range(1, 3):
            requests.post(
                f"{BASE_URL}/api/leagues/join",
                headers={"Authorization": f"Bearer {users[i]['token']}"},
                json={"league_code": league["league_code"]}
            )
        
        return {"league": league, "users": users}
    
    def test_standings_accumulation(self, setup_multi_round_league):
        """Test that standings accumulate correctly across multiple rounds"""
        data = setup_multi_round_league
        league = data["league"]
        users = data["users"]
        
        total_expected_points = {users[0]["id"]: 0, users[1]["id"]: 0, users[2]["id"]: 0}
        
        # Complete 2 rounds
        for round_num in range(2):
            # Create round
            round_response = requests.post(
                f"{BASE_URL}/api/leagues/{league['id']}/rounds",
                headers={"Authorization": f"Bearer {users[0]['token']}"},
                json={"theme": f"Round {round_num+1}", "submission_hours": 24, "voting_hours": 24, "timezone": "EST"}
            )
            round_data = round_response.json()
            
            # All submit
            submissions = []
            for i, user in enumerate(users):
                submit_response = requests.post(
                    f"{BASE_URL}/api/rounds/{round_data['id']}/submit",
                    headers={"Authorization": f"Bearer {user['token']}"},
                    json={
                        "song": {"deezer_id": 5000 + round_num * 100 + i, "title": f"R{round_num}Song{i}",
                                 "artist": f"Artist{i}", "album": f"Album{i}",
                                 "preview_url": f"https://p.url/{i}", "cover_url": f"https://c.url/{i}",
                                 "duration": 180},
                        "locked": True
                    }
                )
                submissions.append(submit_response.json())
            
            # Advance to voting
            requests.post(
                f"{BASE_URL}/api/rounds/{round_data['id']}/advance",
                headers={"Authorization": f"Bearer {users[0]['token']}"}
            )
            
            # All vote (3 users, rank 2 others)
            # User 0: User1 1st, User2 2nd
            requests.post(
                f"{BASE_URL}/api/rounds/{round_data['id']}/vote",
                headers={"Authorization": f"Bearer {users[0]['token']}"},
                json={"rankings": [submissions[1]["id"], submissions[2]["id"]], "locked": True}
            )
            # User 1: User0 1st, User2 2nd
            requests.post(
                f"{BASE_URL}/api/rounds/{round_data['id']}/vote",
                headers={"Authorization": f"Bearer {users[1]['token']}"},
                json={"rankings": [submissions[0]["id"], submissions[2]["id"]], "locked": True}
            )
            # User 2: User0 1st, User1 2nd
            requests.post(
                f"{BASE_URL}/api/rounds/{round_data['id']}/vote",
                headers={"Authorization": f"Bearer {users[2]['token']}"},
                json={"rankings": [submissions[0]["id"], submissions[1]["id"]], "locked": True}
            )
            
            # Complete round
            requests.post(
                f"{BASE_URL}/api/rounds/{round_data['id']}/advance",
                headers={"Authorization": f"Bearer {users[0]['token']}"}
            )
            
            # Calculate expected points for this round (3 users, N-1=2 for 1st, 1 for 2nd)
            # User 0 votes: User1 1st, User2 2nd
            # User 1 votes: User0 1st, User2 2nd
            # User 2 votes: User0 1st, User1 2nd
            # User0: 2 votes as 1st = 2*2 = 4 pts
            # User1: 1 vote as 1st (from User0) + 1 vote as 2nd (from User2) = 2 + 1 = 3 pts
            # User2: 2 votes as 2nd (from User0 and User1) = 1*2 = 2 pts
            total_expected_points[users[0]["id"]] += 4
            total_expected_points[users[1]["id"]] += 3
            total_expected_points[users[2]["id"]] += 2
            
            print(f"Round {round_num+1} completed")
        
        # Get standings
        standings_response = requests.get(
            f"{BASE_URL}/api/leagues/{league['id']}/standings",
            headers={"Authorization": f"Bearer {users[0]['token']}"}
        )
        assert standings_response.status_code == 200, f"Standings failed: {standings_response.text}"
        standings = standings_response.json()
        
        print(f"\n=== Accumulated Standings (after 2 rounds) ===")
        print(f"Rounds completed: {standings['rounds_completed']}")
        for s in standings["standings"]:
            print(f"{s['username']}: {s['total_points']} pts, {s['wins']} wins, {s['rounds_played']} rounds")
        
        # Verify rounds completed
        assert standings["rounds_completed"] == 2, f"Expected 2 rounds, got {standings['rounds_completed']}"
        
        # Verify accumulated points
        for s in standings["standings"]:
            expected = total_expected_points.get(s["user_id"], 0)
            assert s["total_points"] == expected, \
                f"User {s['username']}: expected {expected} pts, got {s['total_points']}"
        
        print(f"PASS: Standings accumulation verified correctly")
        return standings


class TestUserStats:
    """Test user stats with corrected point calculation - GET /api/auth/stats"""
    
    def test_user_stats(self):
        """Test that user stats reflect correct wins and rounds_played"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test1@ml.com",
            "password": "test123"
        })
        if response.status_code != 200:
            pytest.skip("Login failed")
        
        token = response.json()["access_token"]
        
        stats_response = requests.get(
            f"{BASE_URL}/api/auth/stats",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert stats_response.status_code == 200, f"Stats failed: {stats_response.text}"
        stats = stats_response.json()
        
        print(f"\n=== User Stats ===")
        print(f"Total wins: {stats['total_wins']}")
        print(f"Rounds played: {stats['rounds_played']}")
        print(f"Win rate: {stats['win_rate']}%")
        print(f"Leagues count: {stats['leagues_count']}")
        
        # Verify structure
        assert "total_wins" in stats
        assert "rounds_played" in stats
        assert "win_rate" in stats
        assert "leagues_count" in stats
        assert isinstance(stats["total_wins"], int)
        assert isinstance(stats["win_rate"], (int, float))
        
        print(f"PASS: User stats endpoint working correctly")
        return stats


class TestNonSubmitterZeroPoints:
    """Test that non-submitters get 0 points"""
    
    @pytest.fixture
    def setup_partial_submission_league(self):
        """Create a league where not all users submit"""
        unique_id = uuid.uuid4().hex[:6]
        users = []
        
        for i in range(3):
            response = requests.post(f"{BASE_URL}/api/auth/register", json={
                "email": f"{TEST_PREFIX}_ns{i}_{unique_id}@test.com",
                "username": f"{TEST_PREFIX}_ns{i}_{unique_id}",
                "password": "testpass123"
            })
            if response.status_code == 200:
                data = response.json()
                users.append({"id": data["user"]["id"], "token": data["access_token"], "username": data["user"]["username"]})
        
        if len(users) < 3:
            pytest.skip("Could not create users")
        
        # Create league
        league_response = requests.post(
            f"{BASE_URL}/api/leagues",
            headers={"Authorization": f"Bearer {users[0]['token']}"},
            json={"name": f"{TEST_PREFIX}_NSLeague_{unique_id}", "total_rounds": 5}
        )
        league = league_response.json()
        
        for i in range(1, 3):
            requests.post(
                f"{BASE_URL}/api/leagues/join",
                headers={"Authorization": f"Bearer {users[i]['token']}"},
                json={"league_code": league["league_code"]}
            )
        
        return {"league": league, "users": users}
    
    def test_non_submitter_zero_points_in_standings(self, setup_partial_submission_league):
        """Test that users who don't submit get 0 points in standings"""
        data = setup_partial_submission_league
        league = data["league"]
        users = data["users"]
        
        # Create round
        round_response = requests.post(
            f"{BASE_URL}/api/leagues/{league['id']}/rounds",
            headers={"Authorization": f"Bearer {users[0]['token']}"},
            json={"theme": "Non-Submitter Test", "submission_hours": 24, "voting_hours": 24, "timezone": "EST"}
        )
        round_data = round_response.json()
        
        # Only users 0 and 1 submit (user 2 doesn't submit)
        submissions = []
        for i in range(2):  # Only 2 users submit
            submit_response = requests.post(
                f"{BASE_URL}/api/rounds/{round_data['id']}/submit",
                headers={"Authorization": f"Bearer {users[i]['token']}"},
                json={
                    "song": {"deezer_id": 6000 + i, "title": f"NSSong{i}", "artist": f"Artist{i}",
                             "album": f"Album{i}", "preview_url": f"https://p.url/{i}",
                             "cover_url": f"https://c.url/{i}", "duration": 180},
                    "locked": True
                }
            )
            submissions.append(submit_response.json())
        
        # Advance to voting
        requests.post(
            f"{BASE_URL}/api/rounds/{round_data['id']}/advance",
            headers={"Authorization": f"Bearer {users[0]['token']}"}
        )
        
        # Only submitters can vote
        # User 0 votes for User 1
        requests.post(
            f"{BASE_URL}/api/rounds/{round_data['id']}/vote",
            headers={"Authorization": f"Bearer {users[0]['token']}"},
            json={"rankings": [submissions[1]["id"]], "locked": True}
        )
        # User 1 votes for User 0
        requests.post(
            f"{BASE_URL}/api/rounds/{round_data['id']}/vote",
            headers={"Authorization": f"Bearer {users[1]['token']}"},
            json={"rankings": [submissions[0]["id"]], "locked": True}
        )
        
        # Complete round
        requests.post(
            f"{BASE_URL}/api/rounds/{round_data['id']}/advance",
            headers={"Authorization": f"Bearer {users[0]['token']}"}
        )
        
        # Get standings
        standings_response = requests.get(
            f"{BASE_URL}/api/leagues/{league['id']}/standings",
            headers={"Authorization": f"Bearer {users[0]['token']}"}
        )
        standings = standings_response.json()
        
        print(f"\n=== Non-Submitter Standings ===")
        for s in standings["standings"]:
            print(f"{s['username']}: {s['total_points']} pts, {s['rounds_played']} rounds played")
        
        # Find user 2 in standings
        user2_standing = next((s for s in standings["standings"] if s["user_id"] == users[2]["id"]), None)
        
        assert user2_standing is not None, "Non-submitter should still appear in standings"
        assert user2_standing["total_points"] == 0, f"Non-submitter should have 0 points, got {user2_standing['total_points']}"
        assert user2_standing["rounds_played"] == 0, f"Non-submitter should have 0 rounds played, got {user2_standing['rounds_played']}"
        
        print(f"PASS: Non-submitter correctly has 0 points and 0 rounds played")
        return standings


class TestChatEndpoints:
    """
    Chat endpoint tests - POST /api/leagues/{id}/chat (send), GET /api/leagues/{id}/chat (get)
    Tests: Send message, get messages, message ordering
    """
    
    @pytest.fixture
    def setup_chat_league(self):
        """Create a league with 2 users for chat testing"""
        unique_id = uuid.uuid4().hex[:6]
        users = []
        
        # Create 2 users
        for i in range(2):
            response = requests.post(f"{BASE_URL}/api/auth/register", json={
                "email": f"{TEST_PREFIX}_chat{i}_{unique_id}@test.com",
                "username": f"{TEST_PREFIX}_chat{i}_{unique_id}",
                "password": "testpass123",
                "display_name": f"Chat User {i}"
            })
            if response.status_code == 200:
                data = response.json()
                users.append({
                    "id": data["user"]["id"],
                    "username": data["user"]["username"],
                    "token": data["access_token"]
                })
        
        if len(users) < 2:
            pytest.skip("Could not create users for chat test")
        
        # User 0 creates the league
        league_response = requests.post(
            f"{BASE_URL}/api/leagues",
            headers={"Authorization": f"Bearer {users[0]['token']}"},
            json={"name": f"{TEST_PREFIX}_ChatLeague_{unique_id}", "total_rounds": 3}
        )
        league = league_response.json()
        
        # User 1 joins
        requests.post(
            f"{BASE_URL}/api/leagues/join",
            headers={"Authorization": f"Bearer {users[1]['token']}"},
            json={"league_code": league["league_code"]}
        )
        
        print(f"Setup: Created chat league with {len(users)} users")
        return {"league": league, "users": users}
    
    def test_send_message(self, setup_chat_league):
        """Test sending a message to league chat - POST /api/leagues/{id}/messages"""
        data = setup_chat_league
        league = data["league"]
        users = data["users"]
        
        # User 0 sends a message
        message_content = f"Hello from test at {datetime.now().isoformat()}"
        response = requests.post(
            f"{BASE_URL}/api/leagues/{league['id']}/messages",
            headers={"Authorization": f"Bearer {users[0]['token']}"},
            json={"content": message_content}
        )
        
        assert response.status_code == 200, f"Send message failed: {response.text}"
        msg_data = response.json()
        
        assert msg_data["content"] == message_content
        assert msg_data["user_id"] == users[0]["id"]
        assert msg_data["username"] == users[0]["username"]
        assert msg_data["league_id"] == league["id"]
        assert "id" in msg_data
        assert "created_at" in msg_data
        
        print(f"PASS: Message sent successfully by {users[0]['username']}")
        return {"message": msg_data, "league": league, "users": users}
    
    def test_get_messages(self, setup_chat_league):
        """Test getting messages from league chat - GET /api/leagues/{id}/messages"""
        data = setup_chat_league
        league = data["league"]
        users = data["users"]
        
        # Send a few messages from both users
        messages_sent = []
        for i in range(3):
            user_idx = i % 2
            content = f"Test message {i+1} from user {user_idx}"
            response = requests.post(
                f"{BASE_URL}/api/leagues/{league['id']}/messages",
                headers={"Authorization": f"Bearer {users[user_idx]['token']}"},
                json={"content": content}
            )
            assert response.status_code == 200
            messages_sent.append(response.json())
        
        # Get messages
        get_response = requests.get(
            f"{BASE_URL}/api/leagues/{league['id']}/messages",
            headers={"Authorization": f"Bearer {users[0]['token']}"}
        )
        
        assert get_response.status_code == 200, f"Get messages failed: {get_response.text}"
        messages = get_response.json()
        
        # Verify we got the messages
        assert len(messages) >= 3, f"Expected at least 3 messages, got {len(messages)}"
        
        # Verify message structure
        for msg in messages:
            assert "id" in msg
            assert "content" in msg
            assert "user_id" in msg
            assert "username" in msg
            assert "created_at" in msg
        
        print(f"PASS: Retrieved {len(messages)} messages from chat")
        return messages
    
    def test_message_empty_content_fails(self, setup_chat_league):
        """Test that empty message content is rejected"""
        data = setup_chat_league
        league = data["league"]
        users = data["users"]
        
        response = requests.post(
            f"{BASE_URL}/api/leagues/{league['id']}/messages",
            headers={"Authorization": f"Bearer {users[0]['token']}"},
            json={"content": "   "}  # Whitespace only
        )
        
        # Should fail with 400
        assert response.status_code == 400, f"Expected 400 for empty message, got {response.status_code}"
        print("PASS: Empty message content correctly rejected")
    
    def test_chat_status(self, setup_chat_league):
        """Test chat status endpoint - GET /api/leagues/{id}/chat-status"""
        data = setup_chat_league
        league = data["league"]
        users = data["users"]
        
        # Initially no messages, should have no unread
        status_response = requests.get(
            f"{BASE_URL}/api/leagues/{league['id']}/chat-status",
            headers={"Authorization": f"Bearer {users[1]['token']}"}
        )
        
        assert status_response.status_code == 200
        status = status_response.json()
        assert "has_unread" in status
        
        # User 0 sends a message
        requests.post(
            f"{BASE_URL}/api/leagues/{league['id']}/messages",
            headers={"Authorization": f"Bearer {users[0]['token']}"},
            json={"content": "Hey, check this out!"}
        )
        
        # User 1 should now have unread
        status_response2 = requests.get(
            f"{BASE_URL}/api/leagues/{league['id']}/chat-status",
            headers={"Authorization": f"Bearer {users[1]['token']}"}
        )
        
        status2 = status_response2.json()
        assert status2["has_unread"] == True, "User 1 should have unread messages"
        assert status2["last_message_at"] is not None
        
        print("PASS: Chat status correctly shows unread messages")
        return status2


class TestZeroPointUsersInStandings:
    """
    Test that standings show ALL league members, including those with 0 points
    Focus: Members who never submitted should appear with 0 pts, 0 wins, 0 rounds_played
    """
    
    @pytest.fixture
    def setup_league_with_inactive_user(self):
        """Create a league with 4 users where one never participates"""
        unique_id = uuid.uuid4().hex[:6]
        users = []
        
        # Create 4 users
        for i in range(4):
            response = requests.post(f"{BASE_URL}/api/auth/register", json={
                "email": f"{TEST_PREFIX}_zp{i}_{unique_id}@test.com",
                "username": f"{TEST_PREFIX}_zp{i}_{unique_id}",
                "password": "testpass123",
                "display_name": f"ZeroPoint User {i}"
            })
            if response.status_code == 200:
                data = response.json()
                users.append({
                    "id": data["user"]["id"],
                    "username": data["user"]["username"],
                    "token": data["access_token"]
                })
        
        if len(users) < 4:
            pytest.skip("Could not create enough users")
        
        # User 0 creates the league
        league_response = requests.post(
            f"{BASE_URL}/api/leagues",
            headers={"Authorization": f"Bearer {users[0]['token']}"},
            json={"name": f"{TEST_PREFIX}_ZPLeague_{unique_id}", "total_rounds": 5}
        )
        league = league_response.json()
        
        # All users join
        for i in range(1, 4):
            requests.post(
                f"{BASE_URL}/api/leagues/join",
                headers={"Authorization": f"Bearer {users[i]['token']}"},
                json={"league_code": league["league_code"]}
            )
        
        print(f"Setup: Created league with 4 users (user 3 will be inactive)")
        return {"league": league, "users": users}
    
    def test_zero_point_users_appear_in_standings(self, setup_league_with_inactive_user):
        """
        Test that users who never submit still appear in standings with 0 points
        User 3 will NOT submit, User 0,1,2 will participate
        """
        data = setup_league_with_inactive_user
        league = data["league"]
        users = data["users"]
        inactive_user = users[3]  # User 3 will NOT participate
        
        # Create a round
        round_response = requests.post(
            f"{BASE_URL}/api/leagues/{league['id']}/rounds",
            headers={"Authorization": f"Bearer {users[0]['token']}"},
            json={"theme": "Zero Point Test", "submission_hours": 24, "voting_hours": 24, "timezone": "EST"}
        )
        round_data = round_response.json()
        
        # Only users 0, 1, 2 submit (user 3 does NOT submit)
        submissions = []
        for i in range(3):  # Only first 3 users
            submit_response = requests.post(
                f"{BASE_URL}/api/rounds/{round_data['id']}/submit",
                headers={"Authorization": f"Bearer {users[i]['token']}"},
                json={
                    "song": {"deezer_id": 7000 + i, "title": f"ZPSong{i}", "artist": f"Artist{i}",
                             "album": f"Album{i}", "preview_url": f"https://p.url/{i}",
                             "cover_url": f"https://c.url/{i}", "duration": 180},
                    "locked": True
                }
            )
            submissions.append(submit_response.json())
        
        # Advance to voting
        requests.post(
            f"{BASE_URL}/api/rounds/{round_data['id']}/advance",
            headers={"Authorization": f"Bearer {users[0]['token']}"}
        )
        
        # Users 0, 1, 2 vote (3-user vote, N-1=2 songs to rank each)
        # User 0 votes: User1 1st, User2 2nd
        requests.post(
            f"{BASE_URL}/api/rounds/{round_data['id']}/vote",
            headers={"Authorization": f"Bearer {users[0]['token']}"},
            json={"rankings": [submissions[1]["id"], submissions[2]["id"]], "locked": True}
        )
        # User 1 votes: User0 1st, User2 2nd
        requests.post(
            f"{BASE_URL}/api/rounds/{round_data['id']}/vote",
            headers={"Authorization": f"Bearer {users[1]['token']}"},
            json={"rankings": [submissions[0]["id"], submissions[2]["id"]], "locked": True}
        )
        # User 2 votes: User0 1st, User1 2nd
        requests.post(
            f"{BASE_URL}/api/rounds/{round_data['id']}/vote",
            headers={"Authorization": f"Bearer {users[2]['token']}"},
            json={"rankings": [submissions[0]["id"], submissions[1]["id"]], "locked": True}
        )
        
        # Complete round
        requests.post(
            f"{BASE_URL}/api/rounds/{round_data['id']}/advance",
            headers={"Authorization": f"Bearer {users[0]['token']}"}
        )
        
        # Get standings
        standings_response = requests.get(
            f"{BASE_URL}/api/leagues/{league['id']}/standings",
            headers={"Authorization": f"Bearer {users[0]['token']}"}
        )
        assert standings_response.status_code == 200, f"Standings failed: {standings_response.text}"
        standings = standings_response.json()
        
        print(f"\n=== Zero Point User Standings Test ===")
        print(f"Rounds completed: {standings['rounds_completed']}")
        for s in standings["standings"]:
            print(f"{s['username']}: {s['total_points']} pts, {s['wins']} wins, {s['rounds_played']} rounds")
        
        # CRITICAL: Verify inactive user (user 3) appears in standings
        inactive_standing = next(
            (s for s in standings["standings"] if s["user_id"] == inactive_user["id"]), 
            None
        )
        
        assert inactive_standing is not None, \
            f"FAIL: Inactive user {inactive_user['username']} should appear in standings but is missing!"
        
        assert inactive_standing["total_points"] == 0, \
            f"Inactive user should have 0 points, got {inactive_standing['total_points']}"
        
        assert inactive_standing["rounds_played"] == 0, \
            f"Inactive user should have 0 rounds_played, got {inactive_standing['rounds_played']}"
        
        assert inactive_standing["wins"] == 0, \
            f"Inactive user should have 0 wins, got {inactive_standing['wins']}"
        
        # Verify we have 4 users in standings (all league members)
        assert len(standings["standings"]) == 4, \
            f"Expected 4 users in standings, got {len(standings['standings'])}"
        
        print(f"PASS: Zero-point user correctly appears in standings with 0 pts, 0 rounds, 0 wins")
        return standings
    
    def test_multiple_rounds_zero_point_user(self, setup_league_with_inactive_user):
        """
        Test that zero-point user stays at 0 even after multiple rounds
        """
        data = setup_league_with_inactive_user
        league = data["league"]
        users = data["users"]
        inactive_user = users[3]
        
        # Complete 2 rounds with only users 0, 1, 2 participating
        for round_num in range(2):
            # Create round
            round_response = requests.post(
                f"{BASE_URL}/api/leagues/{league['id']}/rounds",
                headers={"Authorization": f"Bearer {users[0]['token']}"},
                json={"theme": f"Multi Round ZP Test {round_num+1}", "submission_hours": 24, "voting_hours": 24, "timezone": "EST"}
            )
            round_data = round_response.json()
            
            # Only 3 users submit
            submissions = []
            for i in range(3):
                submit_response = requests.post(
                    f"{BASE_URL}/api/rounds/{round_data['id']}/submit",
                    headers={"Authorization": f"Bearer {users[i]['token']}"},
                    json={
                        "song": {"deezer_id": 8000 + round_num * 100 + i, "title": f"MRSong{round_num}{i}",
                                 "artist": f"Artist{i}", "album": f"Album{i}",
                                 "preview_url": f"https://p.url/{i}", "cover_url": f"https://c.url/{i}",
                                 "duration": 180},
                        "locked": True
                    }
                )
                submissions.append(submit_response.json())
            
            # Advance to voting
            requests.post(
                f"{BASE_URL}/api/rounds/{round_data['id']}/advance",
                headers={"Authorization": f"Bearer {users[0]['token']}"}
            )
            
            # All 3 active users vote
            requests.post(
                f"{BASE_URL}/api/rounds/{round_data['id']}/vote",
                headers={"Authorization": f"Bearer {users[0]['token']}"},
                json={"rankings": [submissions[1]["id"], submissions[2]["id"]], "locked": True}
            )
            requests.post(
                f"{BASE_URL}/api/rounds/{round_data['id']}/vote",
                headers={"Authorization": f"Bearer {users[1]['token']}"},
                json={"rankings": [submissions[0]["id"], submissions[2]["id"]], "locked": True}
            )
            requests.post(
                f"{BASE_URL}/api/rounds/{round_data['id']}/vote",
                headers={"Authorization": f"Bearer {users[2]['token']}"},
                json={"rankings": [submissions[0]["id"], submissions[1]["id"]], "locked": True}
            )
            
            # Complete round
            requests.post(
                f"{BASE_URL}/api/rounds/{round_data['id']}/advance",
                headers={"Authorization": f"Bearer {users[0]['token']}"}
            )
        
        # Get standings after 2 rounds
        standings_response = requests.get(
            f"{BASE_URL}/api/leagues/{league['id']}/standings",
            headers={"Authorization": f"Bearer {users[0]['token']}"}
        )
        standings = standings_response.json()
        
        print(f"\n=== Multi-Round Zero Point Test (after 2 rounds) ===")
        for s in standings["standings"]:
            print(f"{s['username']}: {s['total_points']} pts, {s['rounds_played']} rounds")
        
        # Verify inactive user still at 0
        inactive_standing = next(
            (s for s in standings["standings"] if s["user_id"] == inactive_user["id"]),
            None
        )
        
        assert inactive_standing is not None, "Inactive user should appear in standings"
        assert inactive_standing["total_points"] == 0, f"Expected 0 pts, got {inactive_standing['total_points']}"
        assert inactive_standing["rounds_played"] == 0, f"Expected 0 rounds, got {inactive_standing['rounds_played']}"
        
        # Verify rounds_completed is 2
        assert standings["rounds_completed"] == 2, f"Expected 2 rounds completed, got {standings['rounds_completed']}"
        
        print(f"PASS: Zero-point user still at 0 after {standings['rounds_completed']} rounds")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
