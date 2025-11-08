/**
 * Prompt Optimizer Content Script
 * Detects prompts on LLM websites and offers optimization
 */

(function() {
  'use strict';

  // Check if we're on an LLM site
  const matchCurrentSite = globalThis.CPO?.matchCurrentSite;
  const siteProfile = matchCurrentSite ? matchCurrentSite(window.location.hostname) : null;

  // Only run on LLM sites
  if (!siteProfile) {
    return;
  }

  // Configuration
  const MIN_PROMPT_LENGTH = 100; // Minimum characters to trigger optimization offer
  const DEBOUNCE_MS = 800; // Wait for user to finish typing
  const BANNER_AUTO_HIDE_MS = 15000; // Auto-hide banner after 15 seconds

  // State
  const state = {
    currentPrompt: '',
    bannerShown: false,
    lastPromptHash: '',
    isProcessing: false
  };

  // DOM Elements
  let promptField = null;
  let banner = null;
  let debounceTimer = null;

  /**
   * Find the prompt input field on the page
   */
  function findPromptField() {
    const selectors = siteProfile.selectors || ['textarea', '[contenteditable="true"]'];
    
    // Try active element first
    if (document.activeElement && selectors.some(sel => document.activeElement.matches(sel))) {
      const activeEl = document.activeElement;
      if (isVisible(activeEl) && hasMinimumSize(activeEl)) {
        return activeEl;
      }
    }

    // Find all candidates
    const candidates = [];
    selectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(el => {
        if (isVisible(el) && hasMinimumSize(el)) {
          candidates.push(el);
        }
      });
    });

    // Return the largest visible field
    if (candidates.length > 0) {
      return candidates.sort((a, b) => {
        const aSize = a.offsetWidth * a.offsetHeight;
        const bSize = b.offsetWidth * b.offsetHeight;
        return bSize - aSize;
      })[0];
    }

    return null;
  }

  /**
   * Check if element is visible
   */
  function isVisible(element) {
    if (!element || !element.offsetParent) return false;
    const style = window.getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  }

  /**
   * Check if element has minimum size
   */
  function hasMinimumSize(element) {
    return element.offsetWidth > 200 && element.offsetHeight > 50;
  }

  /**
   * Get text from prompt field
   */
  function getPromptText(element) {
    if (!element) return '';
    
    if (element.contentEditable === 'true') {
      return (element.innerText || element.textContent || '').trim();
    }
    
    return (element.value || '').trim();
  }

  /**
   * Hash prompt for comparison (simple hash)
   */
  function hashPrompt(text) {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString();
  }

  /**
   * Show optimization notification banner
   */
  function showOptimizationBanner() {
    // Don't show if already shown or processing
    if (state.bannerShown || state.isProcessing) {
      return;
    }

    // Remove existing banner if any
    removeBanner();

    // Create banner element
    banner = document.createElement('div');
    banner.id = 'carbonwise-prompt-optimizer-banner';
    banner.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 2147483647;
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      color: white;
      padding: 16px 20px;
      border-radius: 12px;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      max-width: 380px;
      animation: slideUp 0.3s ease-out;
    `;

    // Add animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideUp {
        from {
          transform: translateY(100px);
          opacity: 0;
        }
        to {
          transform: translateY(0);
          opacity: 1;
        }
      }
    `;
    document.head.appendChild(style);

    banner.innerHTML = `
      <div style="display: flex; align-items: flex-start; gap: 12px;">
        <div style="font-size: 24px;">🌱</div>
        <div style="flex: 1;">
          <div style="font-weight: 600; margin-bottom: 6px; font-size: 15px;">
            Optimize your prompt?
          </div>
          <div style="opacity: 0.95; margin-bottom: 12px; line-height: 1.5;">
            We noticed you're using AI. Would you like to optimize your prompt to reduce tokens and save carbon emissions?
          </div>
          <div style="display: flex; gap: 8px;">
            <button id="carbonwise-optimize-btn" style="
              background: white;
              color: #059669;
              border: none;
              padding: 8px 16px;
              border-radius: 6px;
              font-weight: 600;
              cursor: pointer;
              font-size: 13px;
              transition: all 0.2s;
            ">Yes, Optimize</button>
            <button id="carbonwise-dismiss-btn" style="
              background: rgba(255, 255, 255, 0.2);
              color: white;
              border: 1px solid rgba(255, 255, 255, 0.3);
              padding: 8px 16px;
              border-radius: 6px;
              font-weight: 500;
              cursor: pointer;
              font-size: 13px;
              transition: all 0.2s;
            ">Not Now</button>
          </div>
        </div>
        <button id="carbonwise-close-btn" style="
          background: transparent;
          border: none;
          color: white;
          font-size: 20px;
          cursor: pointer;
          padding: 0;
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0.8;
        ">×</button>
      </div>
    `;

    document.body.appendChild(banner);
    state.bannerShown = true;

    // Add event listeners
    setupBannerListeners();

    // Auto-hide after timeout
    setTimeout(() => {
      if (state.bannerShown && !state.isProcessing) {
        removeBanner();
      }
    }, BANNER_AUTO_HIDE_MS);
  }

  /**
   * Setup banner event listeners
   */
  function setupBannerListeners() {
    if (!banner) return;

    // Optimize button
    const optimizeBtn = banner.querySelector('#carbonwise-optimize-btn');
    if (optimizeBtn) {
      optimizeBtn.addEventListener('click', handleOptimizeClick);
      optimizeBtn.addEventListener('mouseenter', function() {
        this.style.transform = 'scale(1.05)';
      });
      optimizeBtn.addEventListener('mouseleave', function() {
        this.style.transform = 'scale(1)';
      });
    }

    // Dismiss button
    const dismissBtn = banner.querySelector('#carbonwise-dismiss-btn');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', () => removeBanner());
    }

    // Close button
    const closeBtn = banner.querySelector('#carbonwise-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => removeBanner());
    }
  }

  /**
   * Handle optimize button click
   */
  async function handleOptimizeClick() {
    if (state.isProcessing) return;

    state.isProcessing = true;
    updateBannerToProcessing();

    try {
      const promptText = getPromptText(promptField);
      const pageUrl = window.location.href;
      const pageHTML = document.documentElement.outerHTML;

      // TODO: Send to backend API
      // const optimizedPrompt = await sendOptimizationRequest(promptText, pageUrl, pageHTML);
      
      // For now, just log the request
      console.log('[CarbonWise] Optimization requested:', {
        prompt: promptText.substring(0, 100) + '...',
        promptLength: promptText.length,
        url: pageUrl,
        timestamp: new Date().toISOString()
      });

      // Simulate processing delay
      await new Promise(resolve => setTimeout(resolve, 1500));

      // TODO: Replace with actual optimized prompt from backend
      const optimizedPrompt = promptText; // Placeholder

      // Show success and copy to clipboard
      await handleOptimizationSuccess(optimizedPrompt);

    } catch (error) {
      console.error('[CarbonWise] Optimization error:', error);
      showOptimizationError();
    } finally {
      state.isProcessing = false;
    }
  }

  /**
   * Update banner to show processing state
   */
  function updateBannerToProcessing() {
    if (!banner) return;

    const content = banner.querySelector('div > div:last-child');
    if (content) {
      content.innerHTML = `
        <div style="font-weight: 600; margin-bottom: 6px; font-size: 15px;">
          Optimizing your prompt...
        </div>
        <div style="opacity: 0.95; margin-bottom: 12px; line-height: 1.5;">
          Analyzing your prompt and generating an optimized version.
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <div style="
            width: 16px;
            height: 16px;
            border: 2px solid rgba(255, 255, 255, 0.3);
            border-top-color: white;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
          "></div>
          <span style="font-size: 13px;">Processing...</span>
        </div>
      `;

      // Add spin animation
      const style = document.createElement('style');
      style.textContent = `
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `;
      if (!document.head.querySelector('#carbonwise-spin-style')) {
        style.id = 'carbonwise-spin-style';
        document.head.appendChild(style);
      }
    }
  }

  /**
   * Handle successful optimization
   */
  async function handleOptimizationSuccess(optimizedPrompt) {
    // Copy to clipboard
    try {
      await navigator.clipboard.writeText(optimizedPrompt);
      showSuccessMessage('Optimized prompt copied to clipboard!');
    } catch (error) {
      console.error('[CarbonWise] Clipboard error:', error);
      // Fallback: show prompt in a modal
      showPromptModal(optimizedPrompt);
    }

    // Remove banner after a short delay
    setTimeout(() => {
      removeBanner();
    }, 2000);
  }

  /**
   * Show success message
   */
  function showSuccessMessage(message) {
    if (!banner) return;

    const content = banner.querySelector('div > div:last-child');
    if (content) {
      content.innerHTML = `
        <div style="font-weight: 600; margin-bottom: 6px; font-size: 15px;">
          ✅ Optimized!
        </div>
        <div style="opacity: 0.95; line-height: 1.5;">
          ${message}
        </div>
      `;

      banner.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
    }
  }

  /**
   * Show error message
   */
  function showOptimizationError() {
    if (!banner) return;

    const content = banner.querySelector('div > div:last-child');
    if (content) {
      content.innerHTML = `
        <div style="font-weight: 600; margin-bottom: 6px; font-size: 15px;">
          ⚠️ Error
        </div>
        <div style="opacity: 0.95; margin-bottom: 12px; line-height: 1.5;">
          Failed to optimize prompt. Please try again.
        </div>
        <button id="carbonwise-retry-btn" style="
          background: white;
          color: #dc2626;
          border: none;
          padding: 8px 16px;
          border-radius: 6px;
          font-weight: 600;
          cursor: pointer;
          font-size: 13px;
        ">Retry</button>
      `;

      banner.style.background = 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';

      const retryBtn = banner.querySelector('#carbonwise-retry-btn');
      if (retryBtn) {
        retryBtn.addEventListener('click', handleOptimizeClick);
      }
    }
  }

  /**
   * Show prompt in a modal (fallback if clipboard fails)
   */
  function showPromptModal(optimizedPrompt) {
    const modal = document.createElement('div');
    modal.id = 'carbonwise-prompt-modal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.7);
      z-index: 2147483648;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    `;

    modal.innerHTML = `
      <div style="
        background: white;
        border-radius: 12px;
        padding: 24px;
        max-width: 600px;
        width: 100%;
        max-height: 80vh;
        overflow-y: auto;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      ">
        <div style="
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        ">
          <h2 style="margin: 0; font-size: 20px; font-weight: 600;">
            Optimized Prompt
          </h2>
          <button id="carbonwise-modal-close" style="
            background: none;
            border: none;
            font-size: 24px;
            cursor: pointer;
            padding: 0;
            width: 32px;
            height: 32px;
          ">×</button>
        </div>
        <textarea id="carbonwise-optimized-prompt" readonly style="
          width: 100%;
          min-height: 200px;
          padding: 12px;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          font-family: monospace;
          font-size: 14px;
          resize: vertical;
        ">${optimizedPrompt}</textarea>
        <div style="margin-top: 16px; display: flex; gap: 8px;">
          <button id="carbonwise-copy-btn" style="
            background: #10b981;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 6px;
            font-weight: 600;
            cursor: pointer;
          ">Copy to Clipboard</button>
          <button id="carbonwise-close-modal-btn" style="
            background: #e5e7eb;
            color: #374151;
            border: none;
            padding: 10px 20px;
            border-radius: 6px;
            font-weight: 600;
            cursor: pointer;
          ">Close</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Event listeners
    const closeBtn = modal.querySelector('#carbonwise-modal-close');
    const closeModalBtn = modal.querySelector('#carbonwise-close-modal-btn');
    const copyBtn = modal.querySelector('#carbonwise-copy-btn');

    const closeModal = () => modal.remove();

    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(optimizedPrompt);
          copyBtn.textContent = '✓ Copied!';
          setTimeout(() => {
            copyBtn.textContent = 'Copy to Clipboard';
          }, 2000);
        } catch (error) {
          console.error('[CarbonWise] Clipboard error:', error);
          alert('Failed to copy to clipboard. Please copy manually.');
        }
      });
    }

    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
  }

  /**
   * Remove banner
   */
  function removeBanner() {
    if (banner && banner.parentNode) {
      banner.parentNode.removeChild(banner);
    }
    banner = null;
    state.bannerShown = false;
  }

  /**
   * Check if prompt should trigger optimization offer
   */
  function checkPrompt() {
    promptField = findPromptField();
    if (!promptField) {
      return;
    }

    const promptText = getPromptText(promptField);
    const promptHash = hashPrompt(promptText);

    // Skip if prompt is too short
    if (promptText.length < MIN_PROMPT_LENGTH) {
      if (state.bannerShown) {
        removeBanner();
      }
      return;
    }

    // Skip if same prompt (user hasn't changed it)
    if (promptHash === state.lastPromptHash) {
      return;
    }

    state.currentPrompt = promptText;
    state.lastPromptHash = promptHash;

    // Show banner if not already shown
    if (!state.bannerShown) {
      showOptimizationBanner();
    }
  }

  /**
   * Debounced prompt check
   */
  function debouncedCheckPrompt() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(checkPrompt, DEBOUNCE_MS);
  }

  /**
   * TODO: Send optimization request to backend
   * 
   * async function sendOptimizationRequest(promptText, pageUrl, pageHTML) {
   *   const response = await fetch('http://localhost:5000/api/optimize-prompt', {
   *     method: 'POST',
   *     headers: {
   *       'Content-Type': 'application/json',
   *     },
   *     body: JSON.stringify({
   *       prompt: promptText,
   *       url: pageUrl,
   *       html: pageHTML
   *     })
   *   });
   * 
   *   if (!response.ok) {
   *     throw new Error('Optimization request failed');
   *   }
   * 
   *   const data = await response.json();
   *   return data.optimized_prompt;
   * }
   */

  /**
   * Initialize prompt optimizer
   */
  function init() {
    // Listen for input events
    document.addEventListener('input', debouncedCheckPrompt, true);
    document.addEventListener('paste', debouncedCheckPrompt, true);
    document.addEventListener('keyup', debouncedCheckPrompt, true);

    // Handle SPA navigation
    let lastUrl = window.location.href;
    const urlCheckInterval = setInterval(() => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        removeBanner();
        state.lastPromptHash = '';
        debouncedCheckPrompt();
      }
    }, 1000);

    // Initial check after page load
    setTimeout(checkPrompt, 1000);
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

