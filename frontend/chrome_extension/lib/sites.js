// lib/sites.js
// Profiles: how to find the main prompt field on each site.
// No ES modules here; attach to a global namespace.

(function () {
  const LLM_SITE_PROFILES = [
    { hostRe: /(^|\.)openai\.com$/i,              selectors: ['textarea', '[contenteditable="true"]'] },
    { hostRe: /(^|\.)chatgpt\.com$/i,             selectors: ['textarea', '[contenteditable="true"]'] },
    { hostRe: /(^|\.)claude\.ai$/i,               selectors: ['textarea', '[contenteditable="true"]'] },
    { hostRe: /(^|\.)anthropic\.com$/i,           selectors: ['textarea', '[contenteditable="true"]'] },
    { hostRe: /(^|\.)perplexity\.ai$/i,           selectors: ['textarea', '[contenteditable="true"]'] },
    { hostRe: /(^|\.)labs\.perplexity\.ai$/i,     selectors: ['textarea', '[contenteditable="true"]'] },
    { hostRe: /(^|\.)gemini\.google\.com$/i,      selectors: ['textarea', '[contenteditable="true"]'] },
    { hostRe: /(^|\.)bard\.google\.com$/i,        selectors: ['textarea', '[contenteditable="true"]'] },
    { hostRe: /(^|\.)bing\.com$/i,                selectors: ['textarea', '[contenteditable="true"]'] }, // Copilot
    { hostRe: /(^|\.)copilot\.microsoft\.com$/i,  selectors: ['textarea', '[contenteditable="true"]'] },
    { hostRe: /(^|\.)poe\.com$/i,                 selectors: ['textarea', '[contenteditable="true"]'] },
    { hostRe: /(^|\.)phind\.com$/i,               selectors: ['textarea', '[contenteditable="true"]'] },
    { hostRe: /(^|\.)you\.com$/i,                 selectors: ['textarea', '[contenteditable="true"]'] },
    { hostRe: /(^|\.)huggingface\.co$/i,          selectors: ['textarea', '[contenteditable="true"]'] }, // Spaces
    { hostRe: /(^|\.)coze\.com$/i,                selectors: ['textarea', '[contenteditable="true"]'] },
    { hostRe: /(^|\.)pi\.ai$/i,                   selectors: ['textarea', '[contenteditable="true"]'] },
    { hostRe: /(^|\.)groq\.com$/i,                selectors: ['textarea', '[contenteditable="true"]'] },
    { hostRe: /(^|\.)writesonic\.com$/i,          selectors: ['textarea', '[contenteditable="true"]'] },
    { hostRe: /(^|\.)chatsonic\.com$/i,           selectors: ['textarea', '[contenteditable="true"]'] },
    { hostRe: /(^|\.)meta\.ai$/i,                 selectors: ['textarea', '[contenteditable="true"]'] }
  ];

  function matchCurrentSite(hostname) {
    return LLM_SITE_PROFILES.find(p => p.hostRe.test(hostname)) || null;
  }

  // Expose under a single namespace (in the isolated world)
  const ns = (globalThis.CPO = globalThis.CPO || {});
  ns.LLM_SITE_PROFILES = LLM_SITE_PROFILES;
  ns.matchCurrentSite = matchCurrentSite;
})();
