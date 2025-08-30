// content.js - API-only submission tracking with continuous code monitoring

(() => {
  let alive = true;
  function die() { alive = false; }
  function send(type, data) {
    if (!alive) return;
    try { chrome.runtime.sendMessage({ type, data }); } catch (_) {}
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function isProblemLike(loc = location) {
    return loc.hostname.includes("leetcode.com") && loc.pathname.includes("/problems/");
  }

  function extractProblemId(url) {
    try {
      const parsed = new URL(url);
      const pathParts = parsed.pathname.split('/').filter(p => p);
      if (pathParts.length >= 2 && pathParts[0] === 'problems') {
        return pathParts[1];
      }
    } catch {}
    return null;
  }

  // Enhanced code extraction with multiple fallbacks
  function getCurrentCode() {
    try {
      // Method 1: Monaco Editor (most common)
      if (window.monaco && window.monaco.editor) {
        const models = window.monaco.editor.getModels();
        if (models && models.length > 0) {
          const code = models[0].getValue();
          if (code && code.trim().length > 0) {
            return code;
          }
        }
      }

      // Method 2: Direct textarea selectors
      const textareaSelectors = [
        'textarea[data-keybinding-context]',
        '.monaco-editor textarea',
        '.CodeMirror textarea',
        'textarea[class*="editor"]',
        'textarea[class*="monaco"]'
      ];

      for (const selector of textareaSelectors) {
        const textarea = document.querySelector(selector);
        if (textarea && textarea.value && textarea.value.trim().length > 0) {
          return textarea.value;
        }
      }

      // Method 3: CodeMirror instances
      if (window.CodeMirror && window.CodeMirror.instances) {
        for (const instance of window.CodeMirror.instances) {
          if (instance && instance.getValue) {
            const code = instance.getValue();
            if (code && code.trim().length > 0) {
              return code;
            }
          }
        }
      }

      // Method 4: Find editable divs with code content
      const editableSelectors = [
        '.view-lines',
        '.monaco-editor .view-line',
        '[contenteditable="true"]'
      ];

      for (const selector of editableSelectors) {
        const element = document.querySelector(selector);
        if (element && element.textContent) {
          const text = element.textContent.trim();
          // Basic heuristic: if it contains programming keywords, it's likely code
          if (text.length > 20 && (
            text.includes('class ') || 
            text.includes('def ') || 
            text.includes('function') || 
            text.includes('public') || 
            text.includes('private') ||
            text.includes('{') ||
            text.includes('return')
          )) {
            return text;
          }
        }
      }

      return null;
    } catch (error) {
      console.warn('[content] Error getting code:', error);
      return null;
    }
  }

  // Enhanced language detection
  function getCurrentLanguage() {
    try {
      const langSelectors = [
        'button[data-e2e-locator="console-lang-button"]',
        '.ant-select-selection-item',
        '[data-cy="lang-select"] .ant-select-selection-item',
        '.lang-select .ant-select-selection-item',
        'button[class*="lang"] span'
      ];

      for (const selector of langSelectors) {
        const elem = document.querySelector(selector);
        if (elem && elem.textContent && elem.textContent.trim()) {
          return elem.textContent.trim();
        }
      }

      // Fallback: detect from code content
      const code = getCurrentCode();
      if (code) {
        if (code.includes('class Solution:') || code.includes('def ')) return 'Python3';
        if (code.includes('class Solution {') || code.includes('public ')) return 'Java';
        if (code.includes('var ') || code.includes('function') || code.includes('=>')) return 'JavaScript';
        if (code.includes('#include') || code.includes('int main')) return 'C++';
        if (code.includes('func ') && code.includes('return')) return 'Go';
      }

      return 'Unknown';
    } catch (error) {
      return 'Unknown';
    }
  }

  // Get code statistics for progress tracking
  function getCodeStats(code) {
    if (!code) return { lines: 0, chars: 0, words: 0 };
    
    const lines = code.split('\n').length;
    const chars = code.length;
    const words = code.trim().split(/\s+/).length;
    
    return { lines, chars, words };
  }

  async function retryTitle(max = 25, delay = 200) {
    for (let i = 0; i < max; i++) {
      if (!alive) return null;
      
      const sels = [
        'div[data-cy="question-title"] h1',
        'h1[data-cy="question-title"]',
        "h1",
        ".mr-2.text-label-1"
      ];
      
      for (const sel of sels) {
        const el = document.querySelector(sel);
        const t = el?.textContent?.trim();
        if (t) return t;
      }
      
      const dt = (document.title || "").replace(/ - LeetCode.*$/, "").trim();
      if (dt) return dt;
      
      await sleep(delay);
    }
    return null;
  }

  function findButtonByText(texts) {
    const btns = Array.from(document.querySelectorAll("button, a"));
    return btns.find((b) => {
      const t = (b.textContent || "").trim().toLowerCase();
      return texts.some((x) => t === x.toLowerCase());
    });
  }

  function attachOnce(el, event, handler) {
    if (!el) return;
    const key = `__tr_${event}_attached`;
    if (el[key]) return;
    el[key] = true;
    el.addEventListener(event, handler, true);
  }

  // Simplified button tracking - only track clicks, not results
  function hooks() {
    const leetRun = document.querySelector('button[data-e2e-locator="console-run-button"]');
    const leetSubmit = document.querySelector('button[data-e2e-locator="console-submit-button"]');
    const genericRun = findButtonByText(["Run", "Run Code"]);
    const genericSubmit = findButtonByText(["Submit", "Submit Code", "Run & Submit", "Judge"]);
    
    attachOnce(leetRun || genericRun, "click", () => {
      console.log("[content] Run button clicked");
      send("RUN_CLICKED", { 
        code: getCurrentCode(),
        language: getCurrentLanguage(),
        ts: Date.now() 
      });
    });
    
    attachOnce(leetSubmit || genericSubmit, "click", () => {
      console.log("[content] Submit button clicked - will track via API");
      send("SUBMIT_CLICKED", { 
        code: getCurrentCode(),
        language: getCurrentLanguage(),
        ts: Date.now() 
      });
    });
  }

  function setupObserver() {
    const obs = new MutationObserver((list) => {
      if (!alive) return;
      hooks(); // Re-attach button listeners for dynamic content
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    return () => { try { obs.disconnect(); } catch(_){} };
  }

  function setupFocusVisibility() {
    const notify = (focused) => {
      send("FOCUS_CHANGE", { focused: !!focused, ts: Date.now() });
    };
    
    const onFocus = () => notify(true);
    const onBlur = () => notify(false);
    const onVis = () => notify(!document.hidden);
    
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVis);
    
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVis);
    };
  }

  // Enhanced activity tracking with code change detection
  function setupActivity() {
    let lastCode = '';
    let lastCodeStats = { lines: 0, chars: 0, words: 0 };
    
    const ping = () => {
      const currentCode = getCurrentCode();
      const currentStats = getCodeStats(currentCode);
      const language = getCurrentLanguage();
      
      // Detect significant code changes
      const codeChanged = currentCode !== lastCode;
      const significantChange = Math.abs(currentStats.chars - lastCodeStats.chars) > 10;
      
      send("ACTIVITY_PING", { 
        code: currentCode,
        language: language,
        stats: currentStats,
        codeChanged: codeChanged,
        significantChange: significantChange,
        ts: Date.now() 
      });
      
      if (codeChanged) {
        lastCode = currentCode;
        lastCodeStats = currentStats;
      }
    };
    
    const onKey = () => {
      // Debounce keystrokes to avoid too many events
      setTimeout(ping, 100);
    };
    const onMouse = () => ping();
    
    let lastMove = 0;
    const onMove = () => { 
      const now = Date.now(); 
      if (now - lastMove > 5000) { // Reduce frequency for mouse moves
        lastMove = now; 
        ping(); 
      } 
    };
    
    document.addEventListener("keydown", onKey, { capture: true });
    document.addEventListener("mousedown", onMouse, { capture: true });
    document.addEventListener("mousemove", onMove, { capture: true });
    document.addEventListener("scroll", onMove, { capture: true });
    
    return () => {
      document.removeEventListener("keydown", onKey, { capture: true });
      document.removeEventListener("mousedown", onMouse, { capture: true });
      document.removeEventListener("mousemove", onMove, { capture: true });
      document.removeEventListener("scroll", onMove, { capture: true });
    };
  }

  let cleaners = [];
  let urlPoll = null;
  let currentProblemId = null;

  function cleanup() {
    die();
    for (const fn of cleaners) { 
      try { fn && fn(); } catch(_){} 
    }
    cleaners = [];
    if (urlPoll) { 
      clearInterval(urlPoll); 
      urlPoll = null; 
    }
    window.removeEventListener("beforeunload", onUnload);
  }

  function onUnload() { 
    cleanup(); 
  }

  function setupSpaWatcher() {
    let last = location.href;
    let lastProblemId = extractProblemId(last);
    
    urlPoll = setInterval(() => {
      if (location.href !== last) {
        const newProblemId = extractProblemId(location.href);
        
        if (newProblemId && newProblemId !== lastProblemId) {
          console.log(`[content] Problem changed from ${lastProblemId} to ${newProblemId} - restarting`);
          last = location.href;
          lastProblemId = newProblemId;
          cleanup();
          setTimeout(() => { 
            try { bootstrap(); } catch(_){} 
          }, 200);
        } else {
          console.log(`[content] Same problem ${newProblemId}, different route - no restart`);
          last = location.href;
        }
      }
    }, 500);
    
    return () => { 
      if (urlPoll) { 
        clearInterval(urlPoll); 
        urlPoll = null; 
      } 
    };
  }

  async function bootstrap() {
    alive = true;

    if (!isProblemLike(location)) {
      const stopSpa = setupSpaWatcher();
      cleaners.push(stopSpa);
      window.addEventListener("beforeunload", onUnload);
      return;
    }

    currentProblemId = extractProblemId(location.href);
    console.log(`[content] Starting code-tracking session on LeetCode problem: ${currentProblemId}`);

    send("SESSION_START", {
      platform: "leetcode",
      problemTitle: "(loading...)",
      problemUrl: location.href,
      ts: Date.now()
    });

    const title = await retryTitle();
    if (title && alive) {
      send("SESSION_START", {
        platform: "leetcode",
        problemTitle: title,
        problemUrl: location.href,
        ts: Date.now()
      });
    }

    const stopFocus = setupFocusVisibility();
    const stopAct = setupActivity();
    const stopObs = setupObserver();
    const stopSpa = setupSpaWatcher();
    cleaners.push(stopFocus, stopAct, stopObs, stopSpa);

    hooks();
    window.addEventListener("beforeunload", onUnload);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
  } else {
    bootstrap();
  }
})();
