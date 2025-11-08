import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { doc, getDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import './Dashboard.css';
import AdviceButton from './AdviceButton';

function Dashboard() {
  const [userActions, setUserActions] = useState([]);
  const [carbonScore, setCarbonScore] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionName, setActionName] = useState('');
  const [actionDescription, setActionDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [showAddActionModal, setShowAddActionModal] = useState(false);
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

  // Fetch user actions from Firestore
  useEffect(() => {
    const fetchUserData = async () => {
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
          // Dynamically load actions from Firebase
          const actions = userData.actions || {};
          const actionTimestamps = userData.actionTimestamps || {};

          // Convert dictionary format to array format for display
          const actionsArray = Object.keys(actions).map(actionName => ({
            action: actionName,
            sustainabilityScore: actions[actionName],
            carbonImpact: actions[actionName],
            timestamp: actionTimestamps[actionName] || new Date().toISOString(),
            date: actionTimestamps[actionName] || new Date().toISOString(),
            // Try to infer category from action name (optional)
            category: inferCategory(actionName),
          }));

          // Sort by timestamp (most recent first)
          actionsArray.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

          setUserActions(actionsArray);

          // Calculate total carbon score from Firebase data
          const totalScore = Object.values(actions).reduce((sum, score) => sum + (score || 0), 0);
          setCarbonScore(totalScore);
        } else {
          // User document doesn't exist yet - start with empty actions
          setUserActions([]);
          setCarbonScore(0);
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
        setUserActions([]);
        setCarbonScore(0);
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, [user]);

  // Helper function to infer category from action name (optional)
  const inferCategory = (actionName) => {
    const name = actionName.toLowerCase();
    if (name.includes('car') || name.includes('drive') || name.includes('transport') || name.includes('flight') || name.includes('bike') || name.includes('cycle')) {
      return 'Transportation';
    }
    if (name.includes('light') || name.includes('energy') || name.includes('electric') || name.includes('ac') || name.includes('heating')) {
      return 'Energy';
    }
    if (name.includes('food') || name.includes('meal') || name.includes('eat') || name.includes('produce')) {
      return 'Food';
    }
    if (name.includes('waste') || name.includes('compost') || name.includes('recycle') || name.includes('reusable')) {
      return 'Waste';
    }
    if (name.includes('tree') || name.includes('plant') || name.includes('environment')) {
      return 'Environment';
    }
    return 'General';
  };

  // Calculate carbon footprint using Gemini API
  const calculateCarbonFootprint = async (name, description) => {
    const apiKey = process.env.REACT_APP_GEMINI_API_KEY;
    
    if (!apiKey) {
      throw new Error('Gemini API key is not configured. Please set REACT_APP_GEMINI_API_KEY in your .env file.');
    }

    const prompt = `Calculate the carbon footprint in kg CO₂ for the following action:

Action Name: ${name}
Description: ${description}

Please provide ONLY a numeric value representing the carbon footprint in kg CO₂. The value should be:
- A positive number for actions that increase carbon footprint (e.g., driving, flying, using energy)
- A negative number for actions that reduce carbon footprint (e.g., using public transport, planting trees, using renewable energy)

Respond with ONLY the number, no additional text or explanation. For example, if the carbon footprint is 25 kg CO₂, respond with just: 25`;

    try {
      const geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: prompt
              }]
            }]
          }),
        }
      );

      if (!geminiResponse.ok) {
        const errorData = await geminiResponse.text();
        console.error('Gemini API error:', errorData);
        throw new Error(`Gemini API error: ${geminiResponse.statusText}`);
      }

      const geminiData = await geminiResponse.json();
      const responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
      
      // Extract numeric value from response
      const numericMatch = responseText.match(/-?\d+\.?\d*/);
      if (numericMatch) {
        const carbonFootprint = parseFloat(numericMatch[0]);
        return carbonFootprint;
      } else {
        throw new Error('Could not extract carbon footprint value from Gemini response');
      }
    } catch (error) {
      console.error('Error calculating carbon footprint:', error);
      throw error;
    }
  };

  // Add a new action to Firestore
  const addAction = async (actionName, score) => {
    if (!user) return;

    try {
      const userDocRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userDocRef);

      if (userDoc.exists()) {
        const userData = userDoc.data();
        const currentActions = userData.actions || {};
        const currentActionTimestamps = userData.actionTimestamps || {};
        const timestamp = new Date().toISOString();

        await updateDoc(userDocRef, {
          actions: {
            ...currentActions,
            [actionName]: score,
          },
          actionTimestamps: {
            ...currentActionTimestamps,
            [actionName]: timestamp,
          },
        });

        // Refresh the data
        const updatedDoc = await getDoc(userDocRef);
        if (updatedDoc.exists()) {
          const updatedData = updatedDoc.data();
          const actions = updatedData.actions || {};
          const actionTimestamps = updatedData.actionTimestamps || {};

          const actionsArray = Object.keys(actions).map(name => ({
            action: name,
            sustainabilityScore: actions[name],
            carbonImpact: actions[name],
            timestamp: actionTimestamps[name] || new Date().toISOString(),
            date: actionTimestamps[name] || new Date().toISOString(),
            category: inferCategory(name),
          }));

          actionsArray.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
          setUserActions(actionsArray);

          const totalScore = Object.values(actions).reduce((sum, s) => sum + (s || 0), 0);
          setCarbonScore(totalScore);
        }
      }
    } catch (error) {
      console.error('Error adding action:', error);
      throw error;
    }
  };

  // Handle form submission
  const handleSubmitAction = async (e) => {
    e.preventDefault();
    
    if (!actionName.trim()) {
      setSubmitError('Please enter an action name');
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const carbonFootprint = await calculateCarbonFootprint(actionName.trim(), actionDescription.trim());
      await addAction(actionName.trim(), carbonFootprint);
      setActionName('');
      setActionDescription('');
      setSubmitError(null);
      setShowAddActionModal(false);
    } catch (error) {
      console.error('Error submitting action:', error);
      setSubmitError(error.message || 'Failed to add action. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Close modal and reset form
  const handleCloseModal = () => {
    setShowAddActionModal(false);
    setActionName('');
    setActionDescription('');
    setSubmitError(null);
  };

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
      }
    } catch (error) {
      console.error('Error adding friend:', error);
      setAddFriendError('Failed to add friend. Please try again.');
    } finally {
      setAddingFriend(false);
    }
  };

  // Close friend modal and reset form
  const handleCloseFriendModal = () => {
    setShowAddFriendModal(false);
    setFriendEmail('');
    setAddFriendError(null);
  };

  return (
    <div className="dashboard">
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
      <div className="dashboard-container">
        <div className="carbon-score-section">
          <h2>Your Carbon Score</h2>
          <div className="score-display">
            <span className="score-value">{loading ? '...' : carbonScore.toFixed(1)}</span>
            <span className="score-unit">kg CO₂</span>
          </div>
        </div>

        <div className="add-action-button-section" style={{ display: 'flex', visibility: 'visible', padding: '20px', margin: '20px 0', backgroundColor: '#ffffff', borderRadius: '8px' }}>
          <button 
            onClick={() => setShowAddActionModal(true)}
            className="open-add-action-button"
            style={{ 
              display: 'block', 
              visibility: 'visible', 
              padding: '15px 30px',
              backgroundColor: '#27ae60',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '18px',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            + Add New Action
          </button>
        </div>

        <div className="user-actions-section">
          <h2>Your Recent Actions</h2>
          <div className="actions-list">
            {loading ? (
              <p className="empty-state">Loading actions...</p>
            ) : userActions.length === 0 ? (
              <p className="empty-state">No actions recorded yet.</p>
            ) : (
              userActions.map((action, index) => (
                <div key={index} className="action-item">
                  <div className="action-header">
                    <span className="action-name">{action.action || action.description || action.name}</span>
                    <span className={`carbon-score ${(action.sustainabilityScore || action.carbonImpact || action.score) > 50 ? 'high-impact' : (action.sustainabilityScore || action.carbonImpact || action.score) > 25 ? 'medium-impact' : 'low-impact'}`}>
                      {(action.sustainabilityScore || action.carbonImpact || action.score || 0).toFixed(1)} kg CO₂
                    </span>
                  </div>
                  {action.category && (
                    <div className="action-category">
                      Category: {action.category}
                    </div>
                  )}
                  {action.timestamp && (
                    <div className="action-date">
                      {new Date(action.timestamp).toLocaleDateString()}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {showAddActionModal && (
          <div className="modal-overlay" onClick={handleCloseModal}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <button 
                className="modal-close-button"
                onClick={handleCloseModal}
                aria-label="Close"
              >
                ×
              </button>
              <h2>Add New Action</h2>
              <form onSubmit={handleSubmitAction} className="add-action-form">
                <div className="form-group">
                  <label htmlFor="action-name">Action Name *</label>
                  <input
                    type="text"
                    id="action-name"
                    value={actionName}
                    onChange={(e) => setActionName(e.target.value)}
                    placeholder="e.g., Drove to work, Planted a tree"
                    disabled={submitting}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="action-description">Description (optional)</label>
                  <textarea
                    id="action-description"
                    value={actionDescription}
                    onChange={(e) => setActionDescription(e.target.value)}
                    placeholder="Provide more details about the action"
                    disabled={submitting}
                    rows="3"
                  />
                </div>
                {submitError && (
                  <div className="form-error">
                    {submitError}
                  </div>
                )}
                <div className="form-buttons">
                  <button 
                    type="button"
                    onClick={handleCloseModal}
                    className="cancel-button"
                    disabled={submitting}
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className="submit-action-button"
                    disabled={submitting || !actionName.trim()}
                  >
                    {submitting ? 'Calculating...' : 'Add Action'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        <div className="advice-section">
          <AdviceButton userActions={userActions} />
        </div>

        {showAddFriendModal && (
          <div className="modal-overlay" onClick={handleCloseFriendModal}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <button 
                className="modal-close-button"
                onClick={handleCloseFriendModal}
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
                    onClick={handleCloseFriendModal}
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
          <Link to="/leaderboard" className="nav-link">
            View Leaderboard
          </Link>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;

