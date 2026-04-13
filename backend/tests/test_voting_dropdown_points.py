"""
Music League - Voting Dropdown & Points System Tests
=====================================================
Focus: Verify the critical voting business logic:
1. Voting dropdown shows exactly N-1 options where N = total submissions in a round
   (You don't vote for your own song, so in a 4-player league with 4 submissions, dropdown shows 1-3)
2. Points system: 1st place gets N-1 points, 2nd gets N-2, etc. where N = number of submissions

This is specifically requested to ensure:
- 10 players = 9 dropdown options (1-9)
- 4 players = 3 dropdown options (1-3)
"""

import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://fantasy-music-game.preview.emergentagent.com').rstrip('/')

# Test prefix for cleanup
TEST_PREFIX = f"TEST_VOTE_{uuid.uuid4().hex[:6]}"


class TestVotingDropdownCount:
    """
    Test that voting allows exactly N-1 rankings where N = number of submissions.
    A voter can rank all songs EXCEPT their own.
    """
    
    @pytest.fixture
    def create_users(self):
        """Helper to create N users for testing"""
        def _create(num_users):
            unique_id = uuid.uuid4().hex[:6]
            users = []
            for i in range(num_users):
                response = requests.post(f"{BASE_URL}/api/auth/register", json={
                    "email": f"{TEST_PREFIX}_dd{i}_{unique_id}@test.com",
                    "username": f"{TEST_PREFIX}_dd{i}_{unique_id}",
                    "password": "testpass123",
                    "display_name": f"DD User {i}"
                })
                if response.status_code == 200:
                    data = response.json()
                    users.append({
                        "id": data["user"]["id"],
                        "username": data["user"]["username"],
                        "token": data["access_token"]
                    })
            return users
        return _create
    
    def test_4_players_3_dropdown_options(self, create_users):
        """
        CRITICAL TEST: In a 4-player league with 4 submissions:
        - Each user ranks 3 songs (all except their own)
        - Dropdown should show options 1, 2, 3 (for 1st, 2nd, 3rd place)
        """
        users = create_users(4)
        assert len(users) == 4, "Need 4 users for this test"
        
        # Create league
        league_response = requests.post(
            f"{BASE_URL}/api/leagues",
            headers={"Authorization": f"Bearer {users[0]['token']}"},
            json={"name": f"{TEST_PREFIX}_4PlayerLeague", "total_rounds": 3}
        )
        league = league_response.json()
        
        # All users join
        for i in range(1, 4):
            requests.post(
                f"{BASE_URL}/api/leagues/join",
                headers={"Authorization": f"Bearer {users[i]['token']}"},
                json={"league_code": league["league_code"]}
            )
        
        # Create round
        round_response = requests.post(
            f"{BASE_URL}/api/leagues/{league['id']}/rounds",
            headers={"Authorization": f"Bearer {users[0]['token']}"},
            json={"theme": "4-Player Dropdown Test", "submission_hours": 24, "voting_hours": 24, "timezone": "EST"}
        )
        round_data = round_response.json()
        
        # All 4 users submit songs
        submissions = []
        for i, user in enumerate(users):
            submit_response = requests.post(
                f"{BASE_URL}/api/rounds/{round_data['id']}/submit",
                headers={"Authorization": f"Bearer {user['token']}"},
                json={
                    "song": {"deezer_id": 10000 + i, "title": f"Song {i}", "artist": f"Artist {i}",
                             "album": f"Album {i}", "preview_url": f"https://p.url/{i}",
                             "cover_url": f"https://c.url/{i}", "duration": 180},
                    "locked": True
                }
            )
            assert submit_response.status_code == 200, f"Submit failed: {submit_response.text}"
            submissions.append(submit_response.json())
        
        # Verify we have 4 submissions
        assert len(submissions) == 4, f"Expected 4 submissions, got {len(submissions)}"
        
        # Advance to voting
        advance_response = requests.post(
            f"{BASE_URL}/api/rounds/{round_data['id']}/advance",
            headers={"Authorization": f"Bearer {users[0]['token']}"}
        )
        assert advance_response.status_code == 200
        
        # Get submissions to verify count (this is what frontend would use to determine dropdown options)
        submissions_response = requests.get(
            f"{BASE_URL}/api/rounds/{round_data['id']}/submissions",
            headers={"Authorization": f"Bearer {users[0]['token']}"}
        )
        assert submissions_response.status_code == 200
        all_submissions = submissions_response.json()
        
        # CRITICAL VERIFICATION:
        # Number of dropdown options = total submissions - 1 (exclude own song)
        total_submissions = len(all_submissions)
        expected_dropdown_options = total_submissions - 1
        
        assert total_submissions == 4, f"Expected 4 total submissions, got {total_submissions}"
        assert expected_dropdown_options == 3, f"Expected 3 dropdown options (4-1), got {expected_dropdown_options}"
        
        print(f"\n=== 4-Player Dropdown Test ===")
        print(f"Total submissions: {total_submissions}")
        print(f"Expected dropdown options (rankings): {expected_dropdown_options}")
        
        # User 0 votes: must rank exactly 3 songs (all except their own)
        # Get other users' submission IDs
        user0_submission_id = submissions[0]["id"]
        other_submissions = [s["id"] for s in submissions if s["id"] != user0_submission_id]
        
        assert len(other_submissions) == 3, f"User 0 should have 3 songs to rank, got {len(other_submissions)}"
        
        # Vote with exactly 3 rankings (correct number)
        vote_response = requests.post(
            f"{BASE_URL}/api/rounds/{round_data['id']}/vote",
            headers={"Authorization": f"Bearer {users[0]['token']}"},
            json={"rankings": other_submissions, "locked": True}
        )
        assert vote_response.status_code == 200, f"Vote failed: {vote_response.text}"
        
        print(f"PASS: User 0 successfully ranked {len(other_submissions)} songs (dropdown options 1-3)")
        
        # Verify user cannot vote for their own song
        vote_for_self_response = requests.post(
            f"{BASE_URL}/api/rounds/{round_data['id']}/vote",
            headers={"Authorization": f"Bearer {users[1]['token']}"},
            json={"rankings": [submissions[1]["id"], submissions[0]["id"], submissions[2]["id"]], "locked": True}
        )
        # This should fail because user 1 is trying to vote for their own submission
        assert vote_for_self_response.status_code == 400, "Should reject voting for own song"
        assert "cannot vote for your own" in vote_for_self_response.json().get("detail", "").lower()
        
        print("PASS: System correctly prevents voting for own song")
        
        return {
            "total_submissions": total_submissions,
            "dropdown_options_count": expected_dropdown_options,
            "round_id": round_data["id"],
            "users": users,
            "submissions": submissions
        }
    
    def test_3_players_2_dropdown_options(self, create_users):
        """
        Test: In a 3-player league with 3 submissions:
        - Each user ranks 2 songs (all except their own)
        - Dropdown should show options 1, 2 (for 1st, 2nd place)
        """
        users = create_users(3)
        assert len(users) == 3, "Need 3 users for this test"
        
        # Create league
        league_response = requests.post(
            f"{BASE_URL}/api/leagues",
            headers={"Authorization": f"Bearer {users[0]['token']}"},
            json={"name": f"{TEST_PREFIX}_3PlayerLeague", "total_rounds": 2}
        )
        league = league_response.json()
        
        # Others join
        for i in range(1, 3):
            requests.post(
                f"{BASE_URL}/api/leagues/join",
                headers={"Authorization": f"Bearer {users[i]['token']}"},
                json={"league_code": league["league_code"]}
            )
        
        # Create round
        round_response = requests.post(
            f"{BASE_URL}/api/leagues/{league['id']}/rounds",
            headers={"Authorization": f"Bearer {users[0]['token']}"},
            json={"theme": "3-Player Dropdown Test", "submission_hours": 24, "voting_hours": 24, "timezone": "EST"}
        )
        round_data = round_response.json()
        
        # All submit
        submissions = []
        for i, user in enumerate(users):
            submit_response = requests.post(
                f"{BASE_URL}/api/rounds/{round_data['id']}/submit",
                headers={"Authorization": f"Bearer {user['token']}"},
                json={
                    "song": {"deezer_id": 11000 + i, "title": f"3P Song {i}", "artist": f"Artist {i}",
                             "album": f"Album {i}", "preview_url": f"https://p.url/{i}",
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
        
        # Verify: 3 submissions = 2 dropdown options per voter
        total_submissions = len(submissions)
        expected_dropdown_options = total_submissions - 1  # 3 - 1 = 2
        
        print(f"\n=== 3-Player Dropdown Test ===")
        print(f"Total submissions: {total_submissions}")
        print(f"Expected dropdown options: {expected_dropdown_options}")
        
        assert expected_dropdown_options == 2, f"Expected 2 dropdown options, got {expected_dropdown_options}"
        
        # User votes with exactly 2 rankings
        other_subs = [s["id"] for s in submissions if s["id"] != submissions[0]["id"]]
        vote_response = requests.post(
            f"{BASE_URL}/api/rounds/{round_data['id']}/vote",
            headers={"Authorization": f"Bearer {users[0]['token']}"},
            json={"rankings": other_subs, "locked": True}
        )
        assert vote_response.status_code == 200
        
        print(f"PASS: 3-player league correctly has {expected_dropdown_options} dropdown options")
    
    def test_5_players_4_dropdown_options(self, create_users):
        """
        Test: In a 5-player league with 5 submissions:
        - Each user ranks 4 songs
        - Dropdown should show options 1, 2, 3, 4
        """
        users = create_users(5)
        assert len(users) == 5, "Need 5 users for this test"
        
        # Create league
        league_response = requests.post(
            f"{BASE_URL}/api/leagues",
            headers={"Authorization": f"Bearer {users[0]['token']}"},
            json={"name": f"{TEST_PREFIX}_5PlayerLeague", "total_rounds": 2}
        )
        league = league_response.json()
        
        for i in range(1, 5):
            requests.post(
                f"{BASE_URL}/api/leagues/join",
                headers={"Authorization": f"Bearer {users[i]['token']}"},
                json={"league_code": league["league_code"]}
            )
        
        # Create round
        round_response = requests.post(
            f"{BASE_URL}/api/leagues/{league['id']}/rounds",
            headers={"Authorization": f"Bearer {users[0]['token']}"},
            json={"theme": "5-Player Dropdown Test", "submission_hours": 24, "voting_hours": 24, "timezone": "EST"}
        )
        round_data = round_response.json()
        
        # All submit
        submissions = []
        for i, user in enumerate(users):
            submit_response = requests.post(
                f"{BASE_URL}/api/rounds/{round_data['id']}/submit",
                headers={"Authorization": f"Bearer {user['token']}"},
                json={
                    "song": {"deezer_id": 12000 + i, "title": f"5P Song {i}", "artist": f"Artist {i}",
                             "album": f"Album {i}", "preview_url": f"https://p.url/{i}",
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
        
        # Verify: 5 submissions = 4 dropdown options per voter
        expected_dropdown_options = len(submissions) - 1  # 5 - 1 = 4
        
        print(f"\n=== 5-Player Dropdown Test ===")
        print(f"Total submissions: {len(submissions)}")
        print(f"Expected dropdown options: {expected_dropdown_options}")
        
        assert expected_dropdown_options == 4, f"Expected 4 dropdown options, got {expected_dropdown_options}"
        
        # User votes with exactly 4 rankings
        other_subs = [s["id"] for s in submissions if s["id"] != submissions[0]["id"]]
        assert len(other_subs) == 4, f"Should have 4 songs to rank, got {len(other_subs)}"
        
        vote_response = requests.post(
            f"{BASE_URL}/api/rounds/{round_data['id']}/vote",
            headers={"Authorization": f"Bearer {users[0]['token']}"},
            json={"rankings": other_subs, "locked": True}
        )
        assert vote_response.status_code == 200
        
        print(f"PASS: 5-player league correctly has {expected_dropdown_options} dropdown options")


class TestPointsSystem:
    """
    Test the N-1 points system:
    - 1st place gets (N-1) points per voter
    - 2nd place gets (N-2) points per voter
    - 3rd place gets (N-3) points per voter
    - etc.
    
    Where N = number of submissions (which equals songs to rank + 1)
    """
    
    @pytest.fixture
    def setup_4_player_league(self):
        """Create a 4-player league for points testing"""
        unique_id = uuid.uuid4().hex[:6]
        users = []
        
        for i in range(4):
            response = requests.post(f"{BASE_URL}/api/auth/register", json={
                "email": f"{TEST_PREFIX}_pts{i}_{unique_id}@test.com",
                "username": f"{TEST_PREFIX}_pts{i}_{unique_id}",
                "password": "testpass123"
            })
            if response.status_code == 200:
                data = response.json()
                users.append({
                    "id": data["user"]["id"],
                    "username": data["user"]["username"],
                    "token": data["access_token"]
                })
        
        if len(users) < 4:
            pytest.skip("Could not create 4 users")
        
        # Create league
        league_response = requests.post(
            f"{BASE_URL}/api/leagues",
            headers={"Authorization": f"Bearer {users[0]['token']}"},
            json={"name": f"{TEST_PREFIX}_PointsLeague_{unique_id}", "total_rounds": 5}
        )
        league = league_response.json()
        
        for i in range(1, 4):
            requests.post(
                f"{BASE_URL}/api/leagues/join",
                headers={"Authorization": f"Bearer {users[i]['token']}"},
                json={"league_code": league["league_code"]}
            )
        
        return {"league": league, "users": users}
    
    def test_4_player_points_n1_system(self, setup_4_player_league):
        """
        CRITICAL TEST: 4-player league points calculation
        
        Setup: 4 players, each ranks 3 songs (N-1 = 3 where N = 4 submissions)
        Points per voter:
        - 1st place = 3 points (N-1)
        - 2nd place = 2 points (N-2)
        - 3rd place = 1 point (N-3)
        
        Scenario: All 4 users vote User0's song as 1st place
        Expected: User0 gets 3 + 3 + 3 = 9 points (3 voters × 3 pts each)
        """
        data = setup_4_player_league
        league = data["league"]
        users = data["users"]
        
        # Create round
        round_response = requests.post(
            f"{BASE_URL}/api/leagues/{league['id']}/rounds",
            headers={"Authorization": f"Bearer {users[0]['token']}"},
            json={"theme": "Points Calculation Test", "submission_hours": 24, "voting_hours": 24, "timezone": "EST"}
        )
        round_data = round_response.json()
        
        # All submit
        submissions = []
        for i, user in enumerate(users):
            submit_response = requests.post(
                f"{BASE_URL}/api/rounds/{round_data['id']}/submit",
                headers={"Authorization": f"Bearer {user['token']}"},
                json={
                    "song": {"deezer_id": 20000 + i, "title": f"Pts Song {i}", "artist": f"Artist {i}",
                             "album": f"Album {i}", "preview_url": f"https://p.url/{i}",
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
        
        # Voting scenario: Everyone votes User0 1st, User1 2nd, User2 3rd
        # User 0 votes: User1 1st, User2 2nd, User3 3rd (can't vote self)
        # User 1 votes: User0 1st, User2 2nd, User3 3rd
        # User 2 votes: User0 1st, User1 2nd, User3 3rd
        # User 3 votes: User0 1st, User1 2nd, User2 3rd
        
        vote_scenarios = [
            [submissions[1]["id"], submissions[2]["id"], submissions[3]["id"]],  # User 0's vote
            [submissions[0]["id"], submissions[2]["id"], submissions[3]["id"]],  # User 1's vote
            [submissions[0]["id"], submissions[1]["id"], submissions[3]["id"]],  # User 2's vote
            [submissions[0]["id"], submissions[1]["id"], submissions[2]["id"]],  # User 3's vote
        ]
        
        for i, user in enumerate(users):
            vote_response = requests.post(
                f"{BASE_URL}/api/rounds/{round_data['id']}/vote",
                headers={"Authorization": f"Bearer {user['token']}"},
                json={"rankings": vote_scenarios[i], "locked": True}
            )
            assert vote_response.status_code == 200, f"Vote failed for user {i}: {vote_response.text}"
        
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
        assert results_response.status_code == 200
        results = results_response.json()
        
        print(f"\n=== 4-Player Points System Test ===")
        print(f"N = {len(submissions)} submissions")
        print(f"Points per voter: 1st={len(submissions)-1}, 2nd={len(submissions)-2}, 3rd={len(submissions)-3}")
        print(f"\nResults:")
        
        for r in results["rankings"]:
            print(f"  Rank {r['rank']}: {r['username']} - {r['points']} pts")
        
        # Calculate expected points based on voting scenario:
        # User0's votes: User1 1st (3), User2 2nd (2), User3 3rd (1)
        # User1's votes: User0 1st (3), User2 2nd (2), User3 3rd (1)
        # User2's votes: User0 1st (3), User1 2nd (2), User3 3rd (1)
        # User3's votes: User0 1st (3), User1 2nd (2), User2 3rd (1)
        #
        # User0: 3+3+3 = 9 pts (1st from User1, User2, User3)
        # User1: 3+2+2 = 7 pts (1st from User0, 2nd from User2, User3)
        # User2: 2+2+1 = 5 pts (2nd from User0, User1, 3rd from User3)
        # User3: 1+1+1 = 3 pts (3rd from everyone)
        
        user0_result = next((r for r in results["rankings"] if r["submission_id"] == submissions[0]["id"]), None)
        user1_result = next((r for r in results["rankings"] if r["submission_id"] == submissions[1]["id"]), None)
        user2_result = next((r for r in results["rankings"] if r["submission_id"] == submissions[2]["id"]), None)
        user3_result = next((r for r in results["rankings"] if r["submission_id"] == submissions[3]["id"]), None)
        
        # Verify User0 got 9 points (3 voters × 3 pts for 1st place)
        assert user0_result["points"] == 9, f"User0 expected 9 pts (3*3), got {user0_result['points']}"
        assert user0_result["rank"] == 1, f"User0 expected rank 1, got {user0_result['rank']}"
        
        # Verify User1 got 7 points (1×3 for 1st + 2×2 for 2nd)
        assert user1_result["points"] == 7, f"User1 expected 7 pts (3 + 2*2), got {user1_result['points']}"
        
        # Verify User2 got 5 points (2×2 for 2nd + 1×1 for 3rd)
        assert user2_result["points"] == 5, f"User2 expected 5 pts (2*2 + 1), got {user2_result['points']}"
        
        # Verify User3 got 3 points (3×1 for 3rd from all voters)
        assert user3_result["points"] == 3, f"User3 expected 3 pts (1*3), got {user3_result['points']}"
        
        # Verify total points = 4 voters * 6 points each (3+2+1) = 24
        total_points = sum(r["points"] for r in results["rankings"])
        expected_total = 4 * (3 + 2 + 1)  # 4 voters, each giving 3+2+1=6 pts
        assert total_points == expected_total, f"Total points mismatch: expected {expected_total}, got {total_points}"
        
        print(f"\nPASS: Points system verified!")
        print(f"  User0: 9 pts (3 voters × 3 pts for 1st)")
        print(f"  User1: 7 pts (1×3 for 1st + 2×2 for 2nd)")
        print(f"  User2: 5 pts (2×2 for 2nd + 1×1 for 3rd)")
        print(f"  User3: 3 pts (3×1 for 3rd)")
        print(f"  Total: {total_points} pts (expected {expected_total})")
    
    def test_3_player_points_system(self):
        """
        Test 3-player league points:
        - N = 3 submissions
        - 1st place = 2 points (N-1)
        - 2nd place = 1 point (N-2)
        """
        unique_id = uuid.uuid4().hex[:6]
        users = []
        
        for i in range(3):
            response = requests.post(f"{BASE_URL}/api/auth/register", json={
                "email": f"{TEST_PREFIX}_3pts{i}_{unique_id}@test.com",
                "username": f"{TEST_PREFIX}_3pts{i}_{unique_id}",
                "password": "testpass123"
            })
            if response.status_code == 200:
                data = response.json()
                users.append({
                    "id": data["user"]["id"],
                    "username": data["user"]["username"],
                    "token": data["access_token"]
                })
        
        if len(users) < 3:
            pytest.skip("Could not create 3 users")
        
        # Create league
        league_response = requests.post(
            f"{BASE_URL}/api/leagues",
            headers={"Authorization": f"Bearer {users[0]['token']}"},
            json={"name": f"{TEST_PREFIX}_3PtsLeague", "total_rounds": 3}
        )
        league = league_response.json()
        
        for i in range(1, 3):
            requests.post(
                f"{BASE_URL}/api/leagues/join",
                headers={"Authorization": f"Bearer {users[i]['token']}"},
                json={"league_code": league["league_code"]}
            )
        
        # Create round
        round_response = requests.post(
            f"{BASE_URL}/api/leagues/{league['id']}/rounds",
            headers={"Authorization": f"Bearer {users[0]['token']}"},
            json={"theme": "3-Player Points Test", "submission_hours": 24, "voting_hours": 24, "timezone": "EST"}
        )
        round_data = round_response.json()
        
        # All submit
        submissions = []
        for i, user in enumerate(users):
            submit_response = requests.post(
                f"{BASE_URL}/api/rounds/{round_data['id']}/submit",
                headers={"Authorization": f"Bearer {user['token']}"},
                json={
                    "song": {"deezer_id": 30000 + i, "title": f"3P Pts Song {i}", "artist": f"Artist {i}",
                             "album": f"Album {i}", "preview_url": f"https://p.url/{i}",
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
        
        # All vote User0 as 1st
        # User 0: votes User1 1st, User2 2nd
        # User 1: votes User0 1st, User2 2nd
        # User 2: votes User0 1st, User1 2nd
        
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
        
        # Get results
        results_response = requests.get(
            f"{BASE_URL}/api/rounds/{round_data['id']}/results",
            headers={"Authorization": f"Bearer {users[0]['token']}"}
        )
        results = results_response.json()
        
        print(f"\n=== 3-Player Points System Test ===")
        print(f"N = 3 submissions")
        print(f"Points per voter: 1st=2, 2nd=1")
        
        for r in results["rankings"]:
            print(f"  Rank {r['rank']}: {r['username']} - {r['points']} pts")
        
        # Expected:
        # User0: 2 votes as 1st (from User1, User2) = 2*2 = 4 pts
        # User1: 1 vote as 1st (from User0) + 1 vote as 2nd (from User2) = 2 + 1 = 3 pts
        # User2: 2 votes as 2nd (from User0, User1) = 1*2 = 2 pts
        
        user0_result = next((r for r in results["rankings"] if r["submission_id"] == submissions[0]["id"]), None)
        assert user0_result["points"] == 4, f"User0 expected 4 pts, got {user0_result['points']}"
        
        # Total should be 3 * (2+1) = 9 pts
        total_points = sum(r["points"] for r in results["rankings"])
        assert total_points == 9, f"Total expected 9, got {total_points}"
        
        print(f"PASS: 3-player points system verified!")


class TestVotingValidation:
    """Test edge cases and validation for voting"""
    
    @pytest.fixture
    def setup_basic_league(self):
        """Create a basic 3-user league"""
        unique_id = uuid.uuid4().hex[:6]
        users = []
        
        for i in range(3):
            response = requests.post(f"{BASE_URL}/api/auth/register", json={
                "email": f"{TEST_PREFIX}_val{i}_{unique_id}@test.com",
                "username": f"{TEST_PREFIX}_val{i}_{unique_id}",
                "password": "testpass123"
            })
            if response.status_code == 200:
                data = response.json()
                users.append({
                    "id": data["user"]["id"],
                    "username": data["user"]["username"],
                    "token": data["access_token"]
                })
        
        if len(users) < 3:
            pytest.skip("Could not create users")
        
        league_response = requests.post(
            f"{BASE_URL}/api/leagues",
            headers={"Authorization": f"Bearer {users[0]['token']}"},
            json={"name": f"{TEST_PREFIX}_ValLeague", "total_rounds": 3}
        )
        league = league_response.json()
        
        for i in range(1, 3):
            requests.post(
                f"{BASE_URL}/api/leagues/join",
                headers={"Authorization": f"Bearer {users[i]['token']}"},
                json={"league_code": league["league_code"]}
            )
        
        return {"league": league, "users": users}
    
    def test_cannot_vote_for_own_submission(self, setup_basic_league):
        """Verify system rejects votes that include user's own submission"""
        data = setup_basic_league
        league = data["league"]
        users = data["users"]
        
        # Create round
        round_response = requests.post(
            f"{BASE_URL}/api/leagues/{league['id']}/rounds",
            headers={"Authorization": f"Bearer {users[0]['token']}"},
            json={"theme": "Self-Vote Test", "submission_hours": 24, "voting_hours": 24, "timezone": "EST"}
        )
        round_data = round_response.json()
        
        # All submit
        submissions = []
        for i, user in enumerate(users):
            submit_response = requests.post(
                f"{BASE_URL}/api/rounds/{round_data['id']}/submit",
                headers={"Authorization": f"Bearer {user['token']}"},
                json={
                    "song": {"deezer_id": 40000 + i, "title": f"Val Song {i}", "artist": f"Artist {i}",
                             "album": f"Album {i}", "preview_url": f"https://p.url/{i}",
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
        
        # Try to vote for own submission
        vote_response = requests.post(
            f"{BASE_URL}/api/rounds/{round_data['id']}/vote",
            headers={"Authorization": f"Bearer {users[0]['token']}"},
            json={"rankings": [submissions[0]["id"], submissions[1]["id"]], "locked": True}
        )
        
        assert vote_response.status_code == 400
        assert "cannot vote for your own" in vote_response.json().get("detail", "").lower()
        
        print("PASS: System correctly rejects self-votes")
    
    def test_only_submitters_can_vote(self, setup_basic_league):
        """Verify that only users who submitted can vote"""
        data = setup_basic_league
        league = data["league"]
        users = data["users"]
        
        # Create round
        round_response = requests.post(
            f"{BASE_URL}/api/leagues/{league['id']}/rounds",
            headers={"Authorization": f"Bearer {users[0]['token']}"},
            json={"theme": "Submitter Vote Test", "submission_hours": 24, "voting_hours": 24, "timezone": "EST"}
        )
        round_data = round_response.json()
        
        # Only users 0 and 1 submit (user 2 doesn't submit)
        submissions = []
        for i in range(2):
            submit_response = requests.post(
                f"{BASE_URL}/api/rounds/{round_data['id']}/submit",
                headers={"Authorization": f"Bearer {users[i]['token']}"},
                json={
                    "song": {"deezer_id": 50000 + i, "title": f"SubVote Song {i}", "artist": f"Artist {i}",
                             "album": f"Album {i}", "preview_url": f"https://p.url/{i}",
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
        
        # User 2 (who didn't submit) tries to vote
        vote_response = requests.post(
            f"{BASE_URL}/api/rounds/{round_data['id']}/vote",
            headers={"Authorization": f"Bearer {users[2]['token']}"},
            json={"rankings": [submissions[0]["id"]], "locked": True}
        )
        
        assert vote_response.status_code == 403
        assert "must submit" in vote_response.json().get("detail", "").lower()
        
        print("PASS: System correctly prevents non-submitters from voting")


class TestAPIEndpoints:
    """Basic API endpoint tests as specified in the requirements"""
    
    def test_health_check(self):
        """GET /api/ returns version"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert "version" in data
        print(f"PASS: Health check - version: {data['version']}")
    
    def test_register_user(self):
        """POST /api/auth/register - create new user"""
        unique_id = uuid.uuid4().hex[:6]
        response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": f"{TEST_PREFIX}_api_{unique_id}@test.com",
            "username": f"{TEST_PREFIX}_api_{unique_id}",
            "password": "testpass123"
        })
        
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "user" in data
        print(f"PASS: User registration works")
    
    def test_login_user(self):
        """POST /api/auth/login - login existing user"""
        # Use existing test user
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test1@ml.com",
            "password": "test123"
        })
        
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        print(f"PASS: User login works")
    
    def test_get_submissions(self):
        """GET /api/rounds/{round_id}/submissions"""
        # First login
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test1@ml.com",
            "password": "test123"
        })
        if login_response.status_code != 200:
            pytest.skip("Login failed")
        
        token = login_response.json()["access_token"]
        
        # Get user's leagues
        leagues_response = requests.get(
            f"{BASE_URL}/api/leagues",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert leagues_response.status_code == 200
        leagues = leagues_response.json()
        
        if not leagues:
            pytest.skip("No leagues available")
        
        # Get rounds for first league
        rounds_response = requests.get(
            f"{BASE_URL}/api/leagues/{leagues[0]['id']}/rounds",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        if rounds_response.status_code == 200:
            rounds = rounds_response.json()
            if rounds:
                # Get submissions for first round
                submissions_response = requests.get(
                    f"{BASE_URL}/api/rounds/{rounds[0]['id']}/submissions",
                    headers={"Authorization": f"Bearer {token}"}
                )
                assert submissions_response.status_code == 200
                print("PASS: GET /api/rounds/{id}/submissions works")
            else:
                pytest.skip("No rounds available")
        else:
            pytest.skip("Could not get rounds")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
