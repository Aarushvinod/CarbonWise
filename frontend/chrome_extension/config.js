/**
 * Configuration for the extension
 * Update these values with your Firebase and backend configuration
 */

const CONFIG = {
  // Backend API URL
  API_URL: 'http://localhost:5000',
  
  // Firebase Web App Configuration
  // Get these from Firebase Console > Project Settings > Your apps > Web app
  firebase: {
    apiKey: "AIzaSyCmDNqsZjvfECptcJkmEN1dYUbaewq3zy4",
    authDomain: "carbonwise-8c7dc.firebaseapp.com",
    projectId: "carbonwise-8c7dc",
    storageBucket: "carbonwise-8c7dc.firebasestorage.app",
    messagingSenderId: "24879368766",
    appId: "1:24879368766:web:01f481db12efffc719df6f"
  }
};

// Make config available globally
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONFIG;
} else if (typeof window !== 'undefined') {
  window.CONFIG = CONFIG;
}

