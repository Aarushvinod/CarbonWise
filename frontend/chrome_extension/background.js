/**
 * Background service worker
 * Manages offscreen document for Firebase authentication
 */

const OFFSCREEN_DOCUMENT_PATH = '/offscreen.html';

// Create offscreen document if it doesn't exist
async function createOffscreenDocument() {
  // Check if offscreen document already exists
  const hasDocument = await chrome.offscreen.hasDocument();
  if (hasDocument) {
    return;
  }

  // Create offscreen document
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_DOCUMENT_PATH,
    reasons: ['DOM_SCRAPING'],
    justification: 'Firebase Auth requires a document context'
  });
}

// Initialize offscreen document on startup
createOffscreenDocument().catch(console.error);

// Listen for messages to ensure offscreen document exists
// Don't handle auth messages - let the offscreen document handle them
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // If this is an auth message, ensure offscreen document exists
  // but don't handle it - the offscreen document will handle it
  if (request.action === 'signInWithEmailPassword' ||
      request.action === 'createUserWithEmailPassword' ||
      request.action === 'signOut' ||
      request.action === 'getIdToken' ||
      request.action === 'getCurrentUser') {
    // Ensure offscreen document exists (async, don't wait)
    createOffscreenDocument().catch(console.error);
    // Return false so we don't handle it - offscreen document will
    return false;
  }
  
  // Don't handle other messages
  return false;
});

