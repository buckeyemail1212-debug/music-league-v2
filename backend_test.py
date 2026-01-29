#!/usr/bin/env python3
"""
Music League Backend API Test Suite
Tests all backend APIs including authentication, leagues, rounds, submissions, and voting
"""

import requests
import json
import time
import uuid
from datetime import datetime

# Backend URL from frontend/.env
BACKEND_URL = "https://tunewar.preview.emergentagent.com/api"

class MusicLeagueAPITester:
    def __init__(self):
        self.session = requests.Session()
        self.user1_token = None
        self.user2_token = None
        self.league_id = None
        self.league_code = None
        self.round_id = None
        self.submission_ids = []
        self.test_results = []
        
    def log_result(self, test_name, success, message="", response_data=None):
        """Log test result"""
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}: {message}")
        self.test_results.append({
            "test": test_name,
            "success": success,
            "message": message,
            "response_data": response_data
        })
        
    def make_request(self, method, endpoint, data=None, token=None, params=None):
        """Make HTTP request with optional authentication"""
        url = f"{BACKEND_URL}{endpoint}"
        headers = {"Content-Type": "application/json"}
        
        if token:
            headers["Authorization"] = f"Bearer {token}"
            
        try:
            if method == "GET":
                response = self.session.get(url, headers=headers, params=params, timeout=30)
            elif method == "POST":
                response = self.session.post(url, headers=headers, json=data, timeout=30)
            elif method == "PUT":
                response = self.session.put(url, headers=headers, json=data, timeout=30)
            elif method == "DELETE":
                response = self.session.delete(url, headers=headers, timeout=30)
            else:
                raise ValueError(f"Unsupported method: {method}")
                
            return response
        except requests.exceptions.RequestException as e:
            print(f"Request failed: {e}")
            return None

    def test_root_endpoint(self):
        """Test root API endpoint"""
        print("\n=== Testing Root Endpoint ===")
        response = self.make_request("GET", "/")
        
        if response and response.status_code == 200:
            data = response.json()
            if "message" in data and "Music League API" in data["message"]:
                self.log_result("Root Endpoint", True, "API is accessible")
                return True
            else:
                self.log_result("Root Endpoint", False, f"Unexpected response: {data}")
        else:
            status = response.status_code if response else "No response"
            self.log_result("Root Endpoint", False, f"Failed with status: {status}")
        return False

    def test_user_registration(self):
        """Test user registration"""
        print("\n=== Testing User Registration ===")
        
        # Generate unique test data
        timestamp = int(time.time())
        user1_data = {
            "email": f"alice.johnson{timestamp}@musicleague.com",
            "username": f"alice_j_{timestamp}",
            "password": "SecurePass123!"
        }
        
        user2_data = {
            "email": f"bob.smith{timestamp}@musicleague.com", 
            "username": f"bob_s_{timestamp}",
            "password": "MyPassword456!"
        }
        
        # Test user 1 registration
        response = self.make_request("POST", "/auth/register", user1_data)
        if response and response.status_code == 200:
            data = response.json()
            if "access_token" in data and "user" in data:
                self.user1_token = data["access_token"]
                self.user1_data = user1_data
                self.log_result("User 1 Registration", True, f"User {data['user']['username']} registered successfully")
            else:
                self.log_result("User 1 Registration", False, f"Missing token or user data: {data}")
                return False
        else:
            status = response.status_code if response else "No response"
            error = response.json() if response else {}
            self.log_result("User 1 Registration", False, f"Failed with status {status}: {error}")
            return False
            
        # Test user 2 registration
        response = self.make_request("POST", "/auth/register", user2_data)
        if response and response.status_code == 200:
            data = response.json()
            if "access_token" in data and "user" in data:
                self.user2_token = data["access_token"]
                self.user2_data = user2_data
                self.log_result("User 2 Registration", True, f"User {data['user']['username']} registered successfully")
                return True
            else:
                self.log_result("User 2 Registration", False, f"Missing token or user data: {data}")
        else:
            status = response.status_code if response else "No response"
            error = response.json() if response else {}
            self.log_result("User 2 Registration", False, f"Failed with status {status}: {error}")
        return False

    def test_user_login(self):
        """Test user login"""
        print("\n=== Testing User Login ===")
        
        if not hasattr(self, 'user1_data'):
            self.log_result("User Login", False, "No user data available for login test")
            return False
            
        login_data = {
            "email": self.user1_data["email"],
            "password": self.user1_data["password"]
        }
        
        response = self.make_request("POST", "/auth/login", login_data)
        if response and response.status_code == 200:
            data = response.json()
            if "access_token" in data and "user" in data:
                # Verify token is different (new login)
                new_token = data["access_token"]
                self.log_result("User Login", True, f"Login successful for {data['user']['username']}")
                return True
            else:
                self.log_result("User Login", False, f"Missing token or user data: {data}")
        else:
            status = response.status_code if response else "No response"
            error = response.json() if response else {}
            self.log_result("User Login", False, f"Failed with status {status}: {error}")
        return False

    def test_get_current_user(self):
        """Test get current user with token"""
        print("\n=== Testing Get Current User ===")
        
        if not self.user1_token:
            self.log_result("Get Current User", False, "No auth token available")
            return False
            
        response = self.make_request("GET", "/auth/me", token=self.user1_token)
        if response and response.status_code == 200:
            data = response.json()
            if "id" in data and "email" in data and "username" in data:
                self.log_result("Get Current User", True, f"Retrieved user data for {data['username']}")
                return True
            else:
                self.log_result("Get Current User", False, f"Missing user fields: {data}")
        else:
            status = response.status_code if response else "No response"
            error = response.json() if response else {}
            self.log_result("Get Current User", False, f"Failed with status {status}: {error}")
        return False

    def test_create_league(self):
        """Test league creation"""
        print("\n=== Testing League Creation ===")
        
        if not self.user1_token:
            self.log_result("Create League", False, "No auth token available")
            return False
            
        league_data = {
            "name": "Rock Legends Championship",
            "theme": "Best Rock Songs of All Time",
            "submission_hours": 48,
            "voting_hours": 24
        }
        
        response = self.make_request("POST", "/leagues", league_data, token=self.user1_token)
        if response and response.status_code == 200:
            data = response.json()
            if "id" in data and "league_code" in data and "name" in data:
                self.league_id = data["id"]
                self.league_code = data["league_code"]
                self.log_result("Create League", True, f"League '{data['name']}' created with code {data['league_code']}")
                return True
            else:
                self.log_result("Create League", False, f"Missing league fields: {data}")
        else:
            status = response.status_code if response else "No response"
            error = response.json() if response else {}
            self.log_result("Create League", False, f"Failed with status {status}: {error}")
        return False

    def test_get_user_leagues(self):
        """Test getting user's leagues"""
        print("\n=== Testing Get User Leagues ===")
        
        if not self.user1_token:
            self.log_result("Get User Leagues", False, "No auth token available")
            return False
            
        response = self.make_request("GET", "/leagues", token=self.user1_token)
        if response and response.status_code == 200:
            data = response.json()
            if isinstance(data, list) and len(data) > 0:
                league = data[0]
                if "id" in league and "name" in league:
                    self.log_result("Get User Leagues", True, f"Retrieved {len(data)} leagues")
                    return True
                else:
                    self.log_result("Get User Leagues", False, f"Invalid league data: {league}")
            else:
                self.log_result("Get User Leagues", False, f"No leagues found or invalid response: {data}")
        else:
            status = response.status_code if response else "No response"
            error = response.json() if response else {}
            self.log_result("Get User Leagues", False, f"Failed with status {status}: {error}")
        return False

    def test_join_league(self):
        """Test joining league by code"""
        print("\n=== Testing Join League ===")
        
        if not self.user2_token or not self.league_code:
            self.log_result("Join League", False, "Missing user2 token or league code")
            return False
            
        join_data = {"league_code": self.league_code}
        
        response = self.make_request("POST", "/leagues/join", join_data, token=self.user2_token)
        if response and response.status_code == 200:
            data = response.json()
            if "id" in data and "members" in data and len(data["members"]) >= 2:
                self.log_result("Join League", True, f"User 2 joined league, now has {len(data['members'])} members")
                return True
            else:
                self.log_result("Join League", False, f"Invalid join response: {data}")
        else:
            status = response.status_code if response else "No response"
            error = response.json() if response else {}
            self.log_result("Join League", False, f"Failed with status {status}: {error}")
        return False

    def test_create_round(self):
        """Test creating a round"""
        print("\n=== Testing Create Round ===")
        
        if not self.user1_token or not self.league_id:
            self.log_result("Create Round", False, "Missing user1 token or league ID")
            return False
            
        response = self.make_request("POST", f"/leagues/{self.league_id}/rounds", token=self.user1_token)
        if response and response.status_code == 200:
            data = response.json()
            if "id" in data and "status" in data and data["status"] == "submission":
                self.round_id = data["id"]
                self.log_result("Create Round", True, f"Round {data['round_number']} created in submission phase")
                return True
            else:
                self.log_result("Create Round", False, f"Invalid round data: {data}")
        else:
            status = response.status_code if response else "No response"
            error = response.json() if response else {}
            self.log_result("Create Round", False, f"Failed with status {status}: {error}")
        return False

    def test_get_rounds(self):
        """Test getting rounds for a league"""
        print("\n=== Testing Get Rounds ===")
        
        if not self.user1_token or not self.league_id:
            self.log_result("Get Rounds", False, "Missing user1 token or league ID")
            return False
            
        response = self.make_request("GET", f"/leagues/{self.league_id}/rounds", token=self.user1_token)
        if response and response.status_code == 200:
            data = response.json()
            if isinstance(data, list) and len(data) > 0:
                round_data = data[0]
                if "id" in round_data and "status" in round_data:
                    self.log_result("Get Rounds", True, f"Retrieved {len(data)} rounds")
                    return True
                else:
                    self.log_result("Get Rounds", False, f"Invalid round data: {round_data}")
            else:
                self.log_result("Get Rounds", False, f"No rounds found: {data}")
        else:
            status = response.status_code if response else "No response"
            error = response.json() if response else {}
            self.log_result("Get Rounds", False, f"Failed with status {status}: {error}")
        return False

    def test_song_search(self):
        """Test Deezer song search"""
        print("\n=== Testing Song Search ===")
        
        response = self.make_request("GET", "/songs/search", params={"q": "Queen Bohemian Rhapsody", "limit": 5})
        if response and response.status_code == 200:
            data = response.json()
            if "data" in data and isinstance(data["data"], list):
                if len(data["data"]) > 0:
                    song = data["data"][0]
                    if "deezer_id" in song and "title" in song and "artist" in song:
                        self.log_result("Song Search", True, f"Found {len(data['data'])} songs, first: '{song['title']}' by {song['artist']}")
                        return True
                    else:
                        self.log_result("Song Search", False, f"Invalid song data: {song}")
                else:
                    self.log_result("Song Search", True, "Search returned empty results (valid response)")
                    return True
            else:
                self.log_result("Song Search", False, f"Invalid search response: {data}")
        else:
            status = response.status_code if response else "No response"
            error = response.json() if response else {}
            self.log_result("Song Search", False, f"Failed with status {status}: {error}")
        return False

    def test_song_submission(self):
        """Test song submission"""
        print("\n=== Testing Song Submission ===")
        
        if not self.user1_token or not self.round_id:
            self.log_result("Song Submission", False, "Missing user1 token or round ID")
            return False
            
        # Submit song for user 1
        song_data1 = {
            "song": {
                "deezer_id": 9997018,
                "title": "Bohemian Rhapsody",
                "artist": "Queen",
                "album": "A Night At The Opera",
                "preview_url": "https://cdns-preview-d.dzcdn.net/stream/c-deda7fa9316d9e7fcbecc6e2556e3ede-8.mp3",
                "cover_url": "https://api.deezer.com/album/302127/image",
                "duration": 354
            }
        }
        
        response = self.make_request("POST", f"/rounds/{self.round_id}/submit", song_data1, token=self.user1_token)
        if response and response.status_code == 200:
            data = response.json()
            if "id" in data and "song" in data:
                self.submission_ids.append(data["id"])
                self.log_result("User 1 Song Submission", True, f"Submitted '{data['song']['title']}' by {data['song']['artist']}")
            else:
                self.log_result("User 1 Song Submission", False, f"Invalid submission response: {data}")
                return False
        else:
            status = response.status_code if response else "No response"
            error = response.json() if response else {}
            self.log_result("User 1 Song Submission", False, f"Failed with status {status}: {error}")
            return False
            
        # Submit song for user 2
        song_data2 = {
            "song": {
                "deezer_id": 1109731,
                "title": "Stairway to Heaven",
                "artist": "Led Zeppelin",
                "album": "Led Zeppelin IV",
                "preview_url": "https://cdns-preview-c.dzcdn.net/stream/c-cc1f3d5c8b47b5b8e6c4e5f6a7b8c9d0-8.mp3",
                "cover_url": "https://api.deezer.com/album/119606/image",
                "duration": 482
            }
        }
        
        response = self.make_request("POST", f"/rounds/{self.round_id}/submit", song_data2, token=self.user2_token)
        if response and response.status_code == 200:
            data = response.json()
            if "id" in data and "song" in data:
                self.submission_ids.append(data["id"])
                self.log_result("User 2 Song Submission", True, f"Submitted '{data['song']['title']}' by {data['song']['artist']}")
                return True
            else:
                self.log_result("User 2 Song Submission", False, f"Invalid submission response: {data}")
        else:
            status = response.status_code if response else "No response"
            error = response.json() if response else {}
            self.log_result("User 2 Song Submission", False, f"Failed with status {status}: {error}")
        return False

    def test_get_submissions(self):
        """Test getting submissions"""
        print("\n=== Testing Get Submissions ===")
        
        if not self.user1_token or not self.round_id:
            self.log_result("Get Submissions", False, "Missing user1 token or round ID")
            return False
            
        response = self.make_request("GET", f"/rounds/{self.round_id}/submissions", token=self.user1_token)
        if response and response.status_code == 200:
            data = response.json()
            if isinstance(data, list) and len(data) >= 1:
                submission = data[0]
                if "id" in submission and "song" in submission:
                    self.log_result("Get Submissions", True, f"Retrieved {len(data)} submissions")
                    return True
                else:
                    self.log_result("Get Submissions", False, f"Invalid submission data: {submission}")
            else:
                self.log_result("Get Submissions", False, f"No submissions found: {data}")
        else:
            status = response.status_code if response else "No response"
            error = response.json() if response else {}
            self.log_result("Get Submissions", False, f"Failed with status {status}: {error}")
        return False

    def test_advance_round_to_voting(self):
        """Test advancing round to voting phase"""
        print("\n=== Testing Advance Round to Voting ===")
        
        if not self.user1_token or not self.round_id:
            self.log_result("Advance to Voting", False, "Missing user1 token or round ID")
            return False
            
        response = self.make_request("POST", f"/rounds/{self.round_id}/advance", token=self.user1_token)
        if response and response.status_code == 200:
            data = response.json()
            if "message" in data and "voting" in data["message"]:
                self.log_result("Advance to Voting", True, "Round advanced to voting phase")
                return True
            else:
                self.log_result("Advance to Voting", False, f"Unexpected response: {data}")
        else:
            status = response.status_code if response else "No response"
            error = response.json() if response else {}
            self.log_result("Advance to Voting", False, f"Failed with status {status}: {error}")
        return False

    def test_voting(self):
        """Test voting system"""
        print("\n=== Testing Voting System ===")
        
        if not self.user1_token or not self.user2_token or not self.round_id or len(self.submission_ids) < 2:
            self.log_result("Voting", False, "Missing tokens, round ID, or insufficient submissions")
            return False
            
        # User 1 votes (ranks user 2's song first)
        vote_data1 = {"rankings": [self.submission_ids[1], self.submission_ids[0]]}
        
        response = self.make_request("POST", f"/rounds/{self.round_id}/vote", vote_data1, token=self.user1_token)
        if response and response.status_code == 200:
            data = response.json()
            if "message" in data and "successfully" in data["message"]:
                self.log_result("User 1 Vote", True, "Vote submitted successfully")
            else:
                self.log_result("User 1 Vote", False, f"Unexpected vote response: {data}")
                return False
        else:
            status = response.status_code if response else "No response"
            error = response.json() if response else {}
            self.log_result("User 1 Vote", False, f"Failed with status {status}: {error}")
            return False
            
        # User 2 votes (ranks user 1's song first)
        vote_data2 = {"rankings": [self.submission_ids[0], self.submission_ids[1]]}
        
        response = self.make_request("POST", f"/rounds/{self.round_id}/vote", vote_data2, token=self.user2_token)
        if response and response.status_code == 200:
            data = response.json()
            if "message" in data and "successfully" in data["message"]:
                self.log_result("User 2 Vote", True, "Vote submitted successfully")
                return True
            else:
                self.log_result("User 2 Vote", False, f"Unexpected vote response: {data}")
        else:
            status = response.status_code if response else "No response"
            error = response.json() if response else {}
            self.log_result("User 2 Vote", False, f"Failed with status {status}: {error}")
        return False

    def test_advance_round_to_completed(self):
        """Test advancing round to completed phase"""
        print("\n=== Testing Advance Round to Completed ===")
        
        if not self.user1_token or not self.round_id:
            self.log_result("Advance to Completed", False, "Missing user1 token or round ID")
            return False
            
        response = self.make_request("POST", f"/rounds/{self.round_id}/advance", token=self.user1_token)
        if response and response.status_code == 200:
            data = response.json()
            if "message" in data and "completed" in data["message"]:
                self.log_result("Advance to Completed", True, "Round completed successfully")
                return True
            else:
                self.log_result("Advance to Completed", False, f"Unexpected response: {data}")
        else:
            status = response.status_code if response else "No response"
            error = response.json() if response else {}
            self.log_result("Advance to Completed", False, f"Failed with status {status}: {error}")
        return False

    def test_get_results(self):
        """Test getting round results"""
        print("\n=== Testing Get Results ===")
        
        if not self.user1_token or not self.round_id:
            self.log_result("Get Results", False, "Missing user1 token or round ID")
            return False
            
        response = self.make_request("GET", f"/rounds/{self.round_id}/results", token=self.user1_token)
        if response and response.status_code == 200:
            data = response.json()
            if "rankings" in data and "winner" in data and "total_voters" in data:
                rankings = data["rankings"]
                if len(rankings) >= 2 and "points" in rankings[0] and "rank" in rankings[0]:
                    winner = data["winner"]
                    self.log_result("Get Results", True, f"Results retrieved: Winner is '{winner['song']['title']}' with {winner['points']} points, {data['total_voters']} voters")
                    return True
                else:
                    self.log_result("Get Results", False, f"Invalid rankings data: {rankings}")
            else:
                self.log_result("Get Results", False, f"Missing results fields: {data}")
        else:
            status = response.status_code if response else "No response"
            error = response.json() if response else {}
            self.log_result("Get Results", False, f"Failed with status {status}: {error}")
        return False

    def run_all_tests(self):
        """Run all backend API tests"""
        print("🎵 Starting Music League Backend API Tests 🎵")
        print(f"Testing against: {BACKEND_URL}")
        print("=" * 60)
        
        # Test sequence following the full user flow
        tests = [
            self.test_root_endpoint,
            self.test_user_registration,
            self.test_user_login,
            self.test_get_current_user,
            self.test_create_league,
            self.test_get_user_leagues,
            self.test_join_league,
            self.test_create_round,
            self.test_get_rounds,
            self.test_song_search,
            self.test_song_submission,
            self.test_get_submissions,
            self.test_advance_round_to_voting,
            self.test_voting,
            self.test_advance_round_to_completed,
            self.test_get_results
        ]
        
        passed = 0
        failed = 0
        
        for test in tests:
            try:
                if test():
                    passed += 1
                else:
                    failed += 1
            except Exception as e:
                print(f"❌ FAIL {test.__name__}: Exception occurred - {e}")
                failed += 1
                
        # Print summary
        print("\n" + "=" * 60)
        print("🎵 MUSIC LEAGUE BACKEND TEST SUMMARY 🎵")
        print(f"✅ Passed: {passed}")
        print(f"❌ Failed: {failed}")
        print(f"📊 Total: {passed + failed}")
        
        if failed == 0:
            print("🎉 ALL TESTS PASSED! Backend APIs are working correctly.")
        else:
            print("⚠️  Some tests failed. Check the details above.")
            
        return failed == 0

if __name__ == "__main__":
    tester = MusicLeagueAPITester()
    success = tester.run_all_tests()
    exit(0 if success else 1)