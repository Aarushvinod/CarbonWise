# Sustainability Carbon Footprint Tracker

A React.js frontend for a sustainability website that measures user carbon footprint based on web activity.

## Features

1. **Dashboard** - Displays user actions and correlated carbon scores
2. **Advice Button** - Provides personalized advice to improve carbon score based on user actions
3. **Leaderboard** - Shows carbon scores based on a friends list

## Installation

```bash
npm install
```

## Running the Application

```bash
npm start
```

The application will open at `http://localhost:3000`

## Project Structure

```
src/
  ├── components/
  │   ├── Dashboard.js          # Main dashboard with user actions and carbon score
  │   ├── Dashboard.css
  │   ├── AdviceButton.js       # Component for getting advice to improve carbon score
  │   ├── AdviceButton.css
  │   ├── Leaderboard.js        # Friends leaderboard component
  │   ├── Leaderboard.css
  │   ├── Login.js              # Login/Signup component
  │   ├── Login.css
  │   └── ProtectedRoute.js     # Route guard component
  ├── contexts/
  │   └── AuthContext.js        # Authentication context and provider
  ├── firebase.js               # Firebase configuration
  ├── App.js                    # Main app component with routing
  ├── App.css
  ├── index.js                  # Entry point
  └── index.css
```

## Firebase Setup

This application uses:
- **Firebase Auth** - For user authentication (login/signup)
- **Firestore** - For storing user data (both use the same Firebase config)
- **Gemini API** - For AI-powered advice (separate API key)

**Important:** Firebase Auth and Firestore use the **same Firebase configuration** - you don't need separate API keys for each.

### Quick Setup Guide

#### 1. Get Firebase Configuration (for Auth & Firestore)

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Click the **gear icon (⚙️)** > **"Project settings"**
4. Scroll to **"Your apps"** section
5. If no web app exists, click **"</> Add app"** (Web icon) and register it
6. Copy the `firebaseConfig` object values
7. Enable services:
   - **Authentication**: Go to Authentication > Sign-in method > Enable "Email/Password"
   - **Firestore**: Go to Firestore Database > Create database > Start in test mode

#### 2. Get Gemini API Key (for AI Advice)

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Sign in with your Google account
3. Click **"Create API Key"** or **"Get API Key"**
4. Select your Firebase project (or create a new Google Cloud project)
5. Copy the API key

#### 3. Create `.env` File

Create a `.env` file in the project root with:

```env
# Firebase Configuration (for Auth & Firestore)
REACT_APP_FIREBASE_API_KEY=your_api_key_from_firebase_config
REACT_APP_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
REACT_APP_FIREBASE_PROJECT_ID=your-project-id
REACT_APP_FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
REACT_APP_FIREBASE_APP_ID=your_app_id

# Gemini API Key (optional - for AI-powered advice)
REACT_APP_GEMINI_API_KEY=your_gemini_api_key_here
```

**Where to find these values:**
- **Firebase values**: Firebase Console > Project Settings > Your apps > Web app config
- **Gemini API key**: [Google AI Studio](https://aistudio.google.com/app/apikey)

See [FIREBASE_SETUP.md](./FIREBASE_SETUP.md) for detailed step-by-step instructions.

### 3. Firestore Security Rules

Update your Firestore security rules to allow users to read/write their own data:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

## Features

### Authentication
- User registration with email/password
- User login
- Protected routes (requires authentication)
- Automatic user document creation in Firestore on signup

### User Data
- Each user gets a document in Firestore collection `users` indexed by their user ID
- User document contains: email, createdAt, actions, carbonScore

## Backend Integration

Some backend API calls are marked with `TODO` comments in the code. The following endpoints may need to be implemented for full functionality:

- `GET /api/user/actions` - Fetch user actions (currently using Firestore)
- `GET /api/user/carbon-score` - Fetch user's carbon score (currently using Firestore)
- `POST /api/user/advice` - Get personalized advice (currently uses Gemini API or local fallback)
- `GET /api/leaderboard/friends` - Fetch friends list with carbon scores

