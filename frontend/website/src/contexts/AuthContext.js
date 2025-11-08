import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

export const AuthContextProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUser(user);
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signup = async (email, password) => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Create a new document in Firestore for the user
      // Check if document already exists (shouldn't for new users, but safety check)
      const userDocRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userDocRef);

      if (!userDoc.exists()) {
        // Create empty document indexed by user ID with new structure
        await setDoc(userDocRef, {
          email: user.email.toLowerCase(),
          createdAt: new Date().toISOString(),
          // Dictionary mapping action name (String) to score (integer)
          actions: {},
          // Dictionary mapping action name (String) to timestamp
          actionTimestamps: {},
          // Dictionary mapping timestamp to advice
          previousAdvice: {},
          // Timestamp of most recent AI-generated insights
          mostRecentInsightsTimestamp: null,
          // Array of friend user IDs
          friends: [],
        });
      }

      return { user, error: null };
    } catch (error) {
      // Provide more helpful error messages
      let errorMessage = error.message;
      
      if (error.code === 'auth/api-key-not-valid') {
        errorMessage = 'Invalid Firebase API key. Please check your .env file and restart the dev server. See ERROR_EXPLANATION.md for help.';
        console.error('Firebase API Key Error:', error.code);
        console.error('Check:');
        console.error('   1. .env file exists in project root');
        console.error('   2. REACT_APP_FIREBASE_API_KEY is set correctly');
        console.error('   3. Dev server was restarted after creating/updating .env');
      }
      
      return { user: null, error: errorMessage };
    }
  };

  const login = async (email, password) => {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      return { user: userCredential.user, error: null };
    } catch (error) {
      return { user: null, error: error.message };
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      return { error: null };
    } catch (error) {
      return { error: error.message };
    }
  };

  const value = {
    user,
    signup,
    login,
    logout,
    loading,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

