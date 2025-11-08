/**
 * Offscreen document script for Firebase authentication
 * Runs in a document context (required for Firebase Auth)
 */

import { initializeApp } from './lib/firebase-app.js';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from './lib/firebase-auth.js';

// Firebase state
let app = null;
let auth = null;

// Initialize Firebase
function initializeFirebase() {
  if (app) return; // Already initialized
  
  // Get config from window.CONFIG (loaded from config.js)
  const firebaseConfig = window.CONFIG?.firebase;
  
  if (!firebaseConfig) {
    console.error('Firebase config not found');
    return;
  }
  
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    
    // Listen for auth state changes
    onAuthStateChanged(auth, (user) => {
      if (user) {
        // User is signed in
        chrome.runtime.sendMessage({
          action: 'authStateChanged',
          user: {
            uid: user.uid,
            email: user.email
          },
          signedIn: true
        }).catch(() => {
          // Background script might not be ready, ignore
        });
      } else {
        // User is signed out
        chrome.runtime.sendMessage({
          action: 'authStateChanged',
          signedIn: false
        }).catch(() => {
          // Background script might not be ready, ignore
        });
      }
    });
    
    console.log('Firebase initialized in offscreen document');
  } catch (error) {
    console.error('Firebase initialization error:', error);
  }
}

// Initialize Firebase when script loads
if (window.CONFIG?.firebase) {
  initializeFirebase();
} else {
  // Wait for config to load
  window.addEventListener('load', () => {
    if (window.CONFIG?.firebase) {
      initializeFirebase();
    }
  });
}

// Handle messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'signInWithEmailPassword') {
    if (!auth) {
      sendResponse({ error: 'Firebase not initialized' });
      return true;
    }
    
    signInWithEmailAndPassword(auth, request.email, request.password)
      .then(async (userCredential) => {
        const idToken = await userCredential.user.getIdToken();
        sendResponse({
          success: true,
          user: {
            uid: userCredential.user.uid,
            email: userCredential.user.email
          },
          idToken: idToken
        });
      })
      .catch((error) => {
        sendResponse({ error: error.message });
      });
    
    return true; // Keep channel open
  }
  
  if (request.action === 'createUserWithEmailPassword') {
    if (!auth) {
      sendResponse({ error: 'Firebase not initialized' });
      return true;
    }
    
    createUserWithEmailAndPassword(auth, request.email, request.password)
      .then(async (userCredential) => {
        const idToken = await userCredential.user.getIdToken();
        sendResponse({
          success: true,
          user: {
            uid: userCredential.user.uid,
            email: userCredential.user.email
          },
          idToken: idToken
        });
      })
      .catch((error) => {
        sendResponse({ error: error.message });
      });
    
    return true;
  }
  
  if (request.action === 'signOut') {
    if (!auth) {
      sendResponse({ error: 'Firebase not initialized' });
      return true;
    }
    
    signOut(auth)
      .then(() => {
        sendResponse({ success: true });
      })
      .catch((error) => {
        sendResponse({ error: error.message });
      });
    
    return true;
  }
  
  if (request.action === 'getIdToken') {
    if (!auth || !auth.currentUser) {
      sendResponse({ error: 'Not signed in' });
      return true;
    }
    
    auth.currentUser.getIdToken()
      .then((idToken) => {
        sendResponse({ success: true, idToken: idToken });
      })
      .catch((error) => {
        sendResponse({ error: error.message });
      });
    
    return true;
  }
  
  if (request.action === 'getCurrentUser') {
    if (!auth || !auth.currentUser) {
      sendResponse({ success: false, user: null });
      return true;
    }
    
    auth.currentUser.getIdToken()
      .then(async (idToken) => {
        sendResponse({
          success: true,
          user: {
            uid: auth.currentUser.uid,
            email: auth.currentUser.email
          },
          idToken: idToken
        });
      })
      .catch((error) => {
        sendResponse({ error: error.message });
      });
    
    return true;
  }
});

