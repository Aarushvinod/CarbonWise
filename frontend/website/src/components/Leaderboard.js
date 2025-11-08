import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { doc, getDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import './Leaderboard.css';

function Leaderboard() {
  const [friendsList, setFriendsList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddFriendModal, setShowAddFriendModal] = useState(false);
  const [friendEmail, setFriendEmail] = useState('');
  const [addFriendError, setAddFriendError] = useState(null);
  const [addingFriend, setAddingFriend] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Failed to logout:', error);
    }
  };

  // Fetch friends list with carbon scores
  useEffect(() => {
    const fetchFriendsList = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const userDocRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
          const userData = userDoc.data();
          const friends = userData.friends || []; // Array of friend user IDs

          // Calculate user's own carbon score
          const userActions = userData.actions || {};
          const userCarbonScore = Object.values(userActions).reduce((sum, score) => sum + (score || 0), 0);
          
          // Start with user's own data
          const leaderboardData = [{
            id: user.uid,
            email: userData.email || user.email || 'You',
            carbonScore: userCarbonScore,
            isCurrentUser: true,
          }];

          // Fetch all friend documents
          for (const friendId of friends) {
            try {
              const friendDocRef = doc(db, 'users', friendId);
              const friendDoc = await getDoc(friendDocRef);
              
              if (friendDoc.exists()) {
                const friendData = friendDoc.data();
                const actions = friendData.actions || {};
                const carbonScore = Object.values(actions).reduce((sum, score) => sum + (score || 0), 0);
                
                leaderboardData.push({
                  id: friendId,
                  email: friendData.email || 'Unknown',
                  carbonScore: carbonScore,
                  isCurrentUser: false,
                });
              }
            } catch (error) {
              console.error(`Error fetching friend ${friendId}:`, error);
            }
          }

          // Sort by carbon score in ascending order (lowest first - best score is #1)
          leaderboardData.sort((a, b) => a.carbonScore - b.carbonScore);

          setFriendsList(leaderboardData);
        } else {
          // User document doesn't exist - show empty list
          setFriendsList([]);
        }
      } catch (error) {
        console.error('Error fetching friends list:', error);
        setFriendsList([]);
      } finally {
        setLoading(false);
      }
    };

    fetchFriendsList();
  }, [user]);

  // Find user by email and add to friends list
  const handleAddFriend = async (e) => {
    e.preventDefault();
    
    if (!friendEmail.trim()) {
      setAddFriendError('Please enter an email address');
      return;
    }

    if (!user) {
      setAddFriendError('You must be logged in to add friends');
      return;
    }

    setAddingFriend(true);
    setAddFriendError(null);

    try {
      // Search for user by email in Firestore (case-insensitive search)
      const usersRef = collection(db, 'users');
      const searchEmail = friendEmail.trim().toLowerCase();
      const q = query(usersRef, where('email', '==', searchEmail));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        setAddFriendError('User with this email does not exist on the platform');
        setAddingFriend(false);
        return;
      }

      // Get the friend's user document
      const friendDoc = querySnapshot.docs[0];
      const friendId = friendDoc.id;

      // Don't allow adding yourself
      if (friendId === user.uid) {
        setAddFriendError('You cannot add yourself as a friend');
        setAddingFriend(false);
        return;
      }

      // Get current user's document
      const userDocRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userDocRef);

      if (userDoc.exists()) {
        const userData = userDoc.data();
        const currentFriends = userData.friends || [];

        // Check if friend is already in the list
        if (currentFriends.includes(friendId)) {
          setAddFriendError('This user is already in your friends list');
          setAddingFriend(false);
          return;
        }

        // Add friend to the list
        await updateDoc(userDocRef, {
          friends: [...currentFriends, friendId],
        });

        // Close modal and reset form
        setShowAddFriendModal(false);
        setFriendEmail('');
        setAddFriendError(null);

        // Refresh friends list
        const fetchFriendsList = async () => {
          const updatedUserDoc = await getDoc(userDocRef);
          if (updatedUserDoc.exists()) {
            const updatedUserData = updatedUserDoc.data();
            const friends = updatedUserData.friends || [];

            // Calculate user's own carbon score
            const userActions = updatedUserData.actions || {};
            const userCarbonScore = Object.values(userActions).reduce((sum, score) => sum + (score || 0), 0);
            
            // Start with user's own data
            const leaderboardData = [{
              id: user.uid,
              email: updatedUserData.email || user.email || 'You',
              carbonScore: userCarbonScore,
              isCurrentUser: true,
            }];

            // Fetch all friend documents
            for (const fid of friends) {
              try {
                const friendDocRef = doc(db, 'users', fid);
                const friendDoc = await getDoc(friendDocRef);
                
                if (friendDoc.exists()) {
                  const friendData = friendDoc.data();
                  const actions = friendData.actions || {};
                  const carbonScore = Object.values(actions).reduce((sum, score) => sum + (score || 0), 0);
                  
                  leaderboardData.push({
                    id: fid,
                    email: friendData.email || 'Unknown',
                    carbonScore: carbonScore,
                    isCurrentUser: false,
                  });
                }
              } catch (error) {
                console.error(`Error fetching friend ${fid}:`, error);
              }
            }

            leaderboardData.sort((a, b) => a.carbonScore - b.carbonScore);
            setFriendsList(leaderboardData);
          }
        };

        await fetchFriendsList();
      }
    } catch (error) {
      console.error('Error adding friend:', error);
      setAddFriendError('Failed to add friend. Please try again.');
    } finally {
      setAddingFriend(false);
    }
  };

  // Close modal and reset form
  const handleCloseModal = () => {
    setShowAddFriendModal(false);
    setFriendEmail('');
    setAddFriendError(null);
  };

  return (
    <div className="leaderboard">
      <header className="dashboard-header">
        <h1>Sustainability Carbon Footprint Tracker</h1>
        <div className="header-actions">
          <button 
            onClick={() => setShowAddFriendModal(true)}
            className="find-friends-button"
          >
            Find Friends
          </button>
          {user && <span className="user-email">{user.email}</span>}
          <button onClick={handleLogout} className="logout-button">
            Logout
          </button>
        </div>
      </header>
      <div className="leaderboard-container">
        <h2>Friends Leaderboard</h2>
        
        {loading ? (
          <p className="loading">Loading leaderboard...</p>
        ) : (
          <div className="leaderboard-list">
            {friendsList.length === 0 ? (
              <p className="empty-state">Loading your carbon score...</p>
            ) : (
              friendsList.map((entry, index) => (
                <div key={entry.id} className={`leaderboard-item ${entry.isCurrentUser ? 'current-user' : ''}`}>
                  <span className="rank">{index + 1}</span>
                  <span className="name">
                    {entry.email}
                    {entry.isCurrentUser && <span className="you-badge"> (You)</span>}
                  </span>
                  <span className="score">{entry.carbonScore.toFixed(1)} kg CO₂</span>
                </div>
              ))
            )}
          </div>
        )}

        {showAddFriendModal && (
          <div className="modal-overlay" onClick={handleCloseModal}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <button 
                className="modal-close-button"
                onClick={handleCloseModal}
                aria-label="Close"
              >
                ×
              </button>
              <h2>Add Friend</h2>
              <form onSubmit={handleAddFriend} className="add-friend-form">
                <div className="form-group">
                  <label htmlFor="friend-email">Friend's Email *</label>
                  <input
                    type="email"
                    id="friend-email"
                    value={friendEmail}
                    onChange={(e) => setFriendEmail(e.target.value)}
                    placeholder="Enter friend's email address"
                    disabled={addingFriend}
                    required
                  />
                </div>
                {addFriendError && (
                  <div className="form-error">
                    {addFriendError}
                  </div>
                )}
                <div className="form-buttons">
                  <button 
                    type="button"
                    onClick={handleCloseModal}
                    className="cancel-button"
                    disabled={addingFriend}
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className="submit-action-button"
                    disabled={addingFriend || !friendEmail.trim()}
                  >
                    {addingFriend ? 'Adding...' : 'Add Friend'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        <div className="navigation-section">
          <Link to="/" className="nav-link">
            Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

export default Leaderboard;

