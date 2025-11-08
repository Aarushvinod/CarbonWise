/**
 * Popup script for Chrome extension
 * Uses Firebase auth via offscreen document (document context)
 */

let currentUser = null;
let currentIdToken = null;

document.addEventListener('DOMContentLoaded', () => {
  const estimateBtn = document.getElementById('estimateBtn');
  const resultDiv = document.getElementById('result');
  const locationSelect = document.getElementById('location');
  const signInBtn = document.getElementById('signInBtn');
  const signUpBtn = document.getElementById('signUpBtn');
  const signOutBtn = document.getElementById('signOutBtn');
  const authSection = document.getElementById('authSection');
  const authForm = document.getElementById('authForm');
  const userInfo = document.getElementById('userInfo');
  const userEmail = document.getElementById('userEmail');
  const emailInput = document.getElementById('emailInput');
  const passwordInput = document.getElementById('passwordInput');

  // Ensure offscreen document is created (background script handles this)
  // Check current auth state from offscreen document
  checkAuthState();

  // Load saved auth state
  chrome.storage.local.get(['userEmail', 'userUid', 'idToken'], (result) => {
    if (result.userEmail && result.userUid) {
      currentUser = {
        email: result.userEmail,
        uid: result.userUid
      };
      currentIdToken = result.idToken || null;
      // Get fresh token
      getAuthToken();
      updateAuthUI();
    }
  });

  // Listen for auth state changes from offscreen document
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'authStateChanged') {
      if (message.signedIn && message.user) {
        currentUser = message.user;
        getAuthToken();
        updateAuthUI();
      } else {
        currentUser = null;
        currentIdToken = null;
        chrome.storage.local.remove(['userEmail', 'userUid', 'idToken']);
        updateAuthUI();
      }
    }
  });

  async function checkAuthState() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getCurrentUser' });
      if (response.success && response.user) {
        currentUser = response.user;
        currentIdToken = response.idToken;
        chrome.storage.local.set({
          userEmail: currentUser.email,
          userUid: currentUser.uid,
          idToken: currentIdToken
        });
        updateAuthUI();
      }
    } catch (error) {
      // Offscreen document might not be ready yet, ignore
      console.log('Auth state check:', error);
    }
  }

  // Sign in button
  if (signInBtn) {
    signInBtn.addEventListener('click', async () => {
      const email = emailInput?.value?.trim();
      const password = passwordInput?.value;

      if (!email || !password) {
        alert('Please enter email and password');
        return;
      }

      signInBtn.disabled = true;
      signInBtn.textContent = 'Signing in...';

      try {
        const response = await chrome.runtime.sendMessage({
          action: 'signInWithEmailPassword',
          email: email,
          password: password
        });

        if (response.error) {
          throw new Error(response.error);
        }

        currentUser = response.user;
        currentIdToken = response.idToken;

        chrome.storage.local.set({
          userEmail: currentUser.email,
          userUid: currentUser.uid,
          idToken: currentIdToken
        });

        updateAuthUI();
      } catch (error) {
        console.error('Sign in error:', error);
        alert('Sign in failed: ' + error.message);
      } finally {
        signInBtn.disabled = false;
        signInBtn.textContent = 'Sign In';
      }
    });
  }

  // Sign up button
  if (signUpBtn) {
    signUpBtn.addEventListener('click', async () => {
      const email = emailInput?.value?.trim();
      const password = passwordInput?.value;

      if (!email || !password) {
        alert('Please enter email and password');
        return;
      }

      if (password.length < 6) {
        alert('Password must be at least 6 characters');
        return;
      }

      signUpBtn.disabled = true;
      signUpBtn.textContent = 'Creating account...';

      try {
        const response = await chrome.runtime.sendMessage({
          action: 'createUserWithEmailPassword',
          email: email,
          password: password
        });

        if (response.error) {
          throw new Error(response.error);
        }

        currentUser = response.user;
        currentIdToken = response.idToken;

        chrome.storage.local.set({
          userEmail: currentUser.email,
          userUid: currentUser.uid,
          idToken: currentIdToken
        });

        updateAuthUI();
        alert('Account created successfully!');
      } catch (error) {
        console.error('Sign up error:', error);
        alert('Account creation failed: ' + error.message);
      } finally {
        signUpBtn.disabled = false;
        signUpBtn.textContent = 'Create Account';
      }
    });
  }

  // Sign out button
  if (signOutBtn) {
    signOutBtn.addEventListener('click', async () => {
      try {
        const response = await chrome.runtime.sendMessage({ action: 'signOut' });
        if (response.success) {
          currentUser = null;
          currentIdToken = null;
          chrome.storage.local.remove(['userEmail', 'userUid', 'idToken']);
          updateAuthUI();
        }
      } catch (error) {
        console.error('Sign out error:', error);
      }
    });
  }

  function updateAuthUI() {
    if (!authSection || !authForm || !userInfo) return;

    if (currentUser) {
      authForm.style.display = 'none';
      userInfo.style.display = 'block';
      if (userEmail) userEmail.textContent = currentUser.email || 'User';
    } else {
      authForm.style.display = 'block';
      userInfo.style.display = 'none';
    }
  }

  async function getAuthToken() {
    if (!currentUser) return null;

    try {
      const response = await chrome.runtime.sendMessage({ action: 'getIdToken' });
      if (response.success) {
        currentIdToken = response.idToken;
        chrome.storage.local.set({ idToken: currentIdToken });
        return response.idToken;
      }
    } catch (error) {
      console.error('Get token error:', error);
    }
    return null;
  }

  // Load saved location
  chrome.storage.sync.get(['userLocation'], (result) => {
    if (result.userLocation) {
      locationSelect.value = result.userLocation;
    }
  });

  estimateBtn.addEventListener('click', async () => {
    estimateBtn.disabled = true;
    resultDiv.innerHTML = '<div class="loading"><div class="spinner"></div><p>Analyzing product page...</p></div>';

    try {
      // Get fresh token
      const idToken = await getAuthToken();

      // Get active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      // Extract product data from content script
      let response;
      try {
        response = await chrome.tabs.sendMessage(tab.id, { action: 'extractProductData' });
      } catch (error) {
        if (error.message.includes('Could not establish connection')) {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js']
          });
          await new Promise(resolve => setTimeout(resolve, 100));
          response = await chrome.tabs.sendMessage(tab.id, { action: 'extractProductData' });
        } else {
          throw error;
        }
      }

      if (!response || !response.success) {
        throw new Error('Failed to extract product data. Make sure you\'re on a product page with product information.');
      }

      if (!response.data || Object.keys(response.data).length === 0) {
        throw new Error('No product data found on this page. Try a different product page with structured data (Schema.org).');
      }

      const productData = response.data;
      const userLocation = { country: locationSelect.value };

      chrome.storage.sync.set({ userLocation: locationSelect.value });

      // Call backend API
      const apiUrl = window.CONFIG?.API_URL || 'http://localhost:5000';
      let estimateResponse;
      try {
        estimateResponse = await fetch(`${apiUrl}/api/estimate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            product_data: productData,
            user_location: userLocation,
            id_token: idToken,
            url: tab.url
          })
        });
      } catch (fetchError) {
        throw new Error(`Failed to connect to backend server at ${apiUrl}. Make sure the server is running.`);
      }

      const responseText = await estimateResponse.text();
      
      if (!estimateResponse.ok) {
        let errorMessage = `Server error: ${estimateResponse.status}`;
        try {
          const errorData = JSON.parse(responseText);
          errorMessage = errorData.error || errorMessage;
        } catch (e) {
          errorMessage = responseText || errorMessage;
        }
        throw new Error(errorMessage);
      }

      let result;
      try {
        result = JSON.parse(responseText);
      } catch (e) {
        throw new Error('Invalid response from server. Expected JSON but got: ' + responseText.substring(0, 100));
      }

      if (!result.success) {
        throw new Error(result.error || 'Estimation failed');
      }

      displayResults(result.result, productData);

    } catch (error) {
      console.error('Error:', error);
      resultDiv.innerHTML = `
        <div class="error">
          <strong>Error:</strong> ${error.message}<br><br>
          ${error.message.includes('fetch') ? 'Make sure the backend server is running at ' + (window.CONFIG?.API_URL || 'http://localhost:5000') : 'Make sure you\'re on a product page with product information.'}
        </div>
      `;
    } finally {
      estimateBtn.disabled = false;
    }
  });

  function displayResults(result, productData) {
    const total = result.total_kg_co2e;
    const [low, central, high] = result.range_kg_co2e ? 
      [result.range_kg_co2e.low, result.range_kg_co2e.central, result.range_kg_co2e.high] :
      [total * 0.7, total, total * 1.3];
    const confidence = result.confidence || 'medium';
    const confidenceClass = `confidence-${confidence}`;
    const components = result.components || {};
    const transport = components.transport_kg_co2e || {};

    let html = `
      <div class="result">
        <div class="total">
          <div class="total-value">${total.toFixed(1)} kgCO₂e</div>
          <div class="total-range">Range: ${low.toFixed(1)} - ${high.toFixed(1)} kgCO₂e</div>
          <span class="confidence-badge ${confidenceClass}">${confidence} Confidence</span>
        </div>

        <div class="breakdown">
          <h3>Breakdown</h3>
    `;

    if (components.production_embodied_kg_co2e > 0) {
      html += `
        <div class="breakdown-item">
          <span class="breakdown-label">Production (A1-A3)</span>
          <span class="breakdown-value">${components.production_embodied_kg_co2e.toFixed(1)} kgCO₂e</span>
        </div>
      `;
    }

    if (components.packaging_kg_co2e > 0) {
      html += `
        <div class="breakdown-item">
          <span class="breakdown-label">Packaging</span>
          <span class="breakdown-value">${components.packaging_kg_co2e.toFixed(2)} kgCO₂e</span>
        </div>
      `;
    }

    if (typeof transport === 'object' && transport.long_haul > 0) {
      html += `
        <div class="breakdown-item">
          <span class="breakdown-label">Transport (${transport.mode || 'shipping'})</span>
          <span class="breakdown-value">${transport.long_haul.toFixed(1)} kgCO₂e</span>
        </div>
      `;
    } else if (typeof transport === 'number' && transport > 0) {
      html += `
        <div class="breakdown-item">
          <span class="breakdown-label">Transport</span>
          <span class="breakdown-value">${transport.toFixed(1)} kgCO₂e</span>
        </div>
      `;
    }

    if (typeof transport === 'object' && transport.last_mile > 0) {
      html += `
        <div class="breakdown-item">
          <span class="breakdown-label">Last-mile delivery</span>
          <span class="breakdown-value">${transport.last_mile.toFixed(2)} kgCO₂e</span>
        </div>
      `;
    }

    if (components.use_phase_kg_co2e > 0) {
      html += `
        <div class="breakdown-item">
          <span class="breakdown-label">Use phase</span>
          <span class="breakdown-value">${components.use_phase_kg_co2e.toFixed(1)} kgCO₂e</span>
        </div>
      `;
    }

    if (components.end_of_life_credit_kg_co2e > 0) {
      html += `
        <div class="breakdown-item">
          <span class="breakdown-label">End-of-life credit</span>
          <span class="breakdown-value credit">${components.end_of_life_credit_kg_co2e.toFixed(2)} kgCO₂e</span>
        </div>
      `;
    }

    html += `
        </div>

        <div class="method">
          Method: ${result.estimation_path ? result.estimation_path.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'Unknown'}
        </div>
    `;

    if (productData.name) {
      html += `
        <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #eee; font-size: 11px; color: #999;">
          <strong>Product:</strong> ${productData.name}
        </div>
      `;
    }

    html += `</div>`;

    resultDiv.innerHTML = html;
  }
});
