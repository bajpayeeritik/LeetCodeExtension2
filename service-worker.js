// service-worker.js - Optimized Chrome Extension for LeetCode Session Tracking

let isOnline = true;
self.addEventListener('online', () => { isOnline = true; processRetryQueue(); });
self.addEventListener('offline', () => { isOnline = false; });

// Settings with defaults
let settings = {
  userId: "user123",
  leetcodeUsername: "bajpayeeritik_",
  backendUrl: "http://localhost:8082/api/v1/problems",
  apiKey: "",
  idleThresholdMs: 30000,
  heartbeatIntervalMs: 30000,
  alfaApiBase: "http://localhost:3000"
};

// Core data structures
const sessions = new Map();
const eventQueue = [];
let isProcessingQueue = false;

// Timing controls - SEPARATED INTERVALS
let lastHeartbeat = 0;
let lastSubmissionCheck = 0;
const HEARTBEAT_INTERVAL = 30000; // 30 seconds
const SUBMISSION_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes

// Load settings on startup
chrome.storage.sync.get({
  userId: 'user123',
  leetcodeUsername: '',
  backendUrl: 'http://localhost:8082/api/v1/problems',
  apiKey: ''
}).then(result => {
  Object.assign(settings, result);
  console.log('[bg] Settings loaded:', settings);
});

// Extract problem ID from URL
function extractProblemId(url) {
  try {
    const parsed = new URL(url);
    const pathParts = parsed.pathname.split('/').filter(p => p);
    if (pathParts.length >= 2 && pathParts[0] === 'problems') {
      return pathParts[1];
    }
  } catch (e) {
    console.warn('[bg] Error parsing URL:', e);
  }
  return url?.slice(0, 20) || "unknown";
}

// Enhanced backend integration with retry logic
async function postEvent(eventType, data) {
  const payload = {
    eventType,
    data: {
      ...data,
      timestamp: data.ts || Date.now()
    }
  };

  console.log(`[bg:event] ${eventType}`, payload.data);

  if (!settings.backendUrl || !isOnline) {
    eventQueue.push(payload);
    console.log(`[bg] Queued event ${eventType} (offline or no backend)`);
    return false;
  }

  try {
    const headers = {
      'Content-Type': 'application/json'
    };
    
    if (settings.apiKey) {
      headers['Authorization'] = `Bearer ${settings.apiKey}`;
    }

    const response = await fetch(`${settings.backendUrl}/events`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Backend error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    console.log(`[bg] ✅ ${eventType} sent successfully:`, result);
    return result;

  } catch (error) {
    console.warn(`[bg] ❌ Failed to post ${eventType}:`, error.message);
    
    // Queue for retry
    eventQueue.push(payload);
    
    // Delayed retry
    if (!isProcessingQueue) {
      setTimeout(processRetryQueue, 30000);
    }
    return false;
  }
}

// Process queued events when back online
async function processRetryQueue() {
  if (isProcessingQueue || eventQueue.length === 0 || !isOnline) return;
  
  isProcessingQueue = true;
  console.log(`[bg] Processing ${eventQueue.length} queued events`);

  while (eventQueue.length > 0 && isOnline) {
    const payload = eventQueue.shift();
    
    try {
      const response = await fetch(`${settings.backendUrl}/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(settings.apiKey && { 'Authorization': `Bearer ${settings.apiKey}` })
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        eventQueue.unshift(payload);
        break;
      }

      console.log(`[bg] ✅ Queued ${payload.eventType} sent successfully`);
      
    } catch (error) {
      eventQueue.unshift(payload);
      break;
    }

    await new Promise(resolve => setTimeout(resolve, 100));
  }

  isProcessingQueue = false;
}

// Enhanced session management
function ensureSession(tabId, url) {
  const problemId = extractProblemId(url);
  
  if (sessions.has(tabId)) {
    const existing = sessions.get(tabId);
    if (existing.problemId === problemId) {
      existing.url = url;
      return existing;
    } else {
      endSession(tabId, 'navigation');
    }
  }
  
  const now = Date.now();
  const session = {
    tabId,
    url,
    startTime: now,
    lastActivity: now,
    lastHeartbeat: now,
    lastSubmissionCheck: now,
    activeMs: 0,
    focused: true,
    isActive: true,
    problemId,
    problemTitle: null,
    platform: "leetcode",
    counters: { runs: 0, submissions: 0, keystrokes: 0 },
    currentCode: null,
    currentLanguage: null,
    codeHistory: [],
    processedSubmissions: [], // Track processed submissions to prevent duplicates
    lastCodeSnapshot: null
  };
  
  sessions.set(tabId, session);
  console.log(`[bg] New session created for ${problemId} on tab ${tabId}`);
  return session;
}

// Active time tracking
function updateActiveTime(tabId) {
  const session = sessions.get(tabId);
  if (!session || !session.isActive || !session.focused) return;
  
  const now = Date.now();
  const timeSinceLastActivity = now - session.lastActivity;
  if (timeSinceLastActivity <= settings.idleThresholdMs) {
    session.activeMs += timeSinceLastActivity;
  }
  session.lastActivity = now;
}

// Focus management
function setSessionFocus(tabId, focused) {
  const session = sessions.get(tabId);
  if (!session) return;
  
  updateActiveTime(tabId);
  session.focused = focused;
  
  console.log(`[bg] Session ${tabId} focus: ${focused}`);
}

// Fetch recent submissions from API
async function fetchRecentSubmissions(limit = 15) {
  if (!settings.leetcodeUsername) {
    console.log('[bg] No LeetCode username configured');
    return [];
  }
  
  try {
    const url = `${settings.alfaApiBase}/${settings.leetcodeUsername}/submission?limit=${limit}`;
    console.log(`[bg] Fetching submissions from: ${url}`);
    
    const response = await fetch(url);
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    
    const data = await response.json();
    console.log(`[bg] API Response:`, data);
    
    return data.submission || [];
  } catch (error) {
    console.warn("[bg] Failed to fetch submissions:", error.message);
    return [];
  }
}

// Simplified submission detection - just check recent submissions for matches
async function checkForNewSubmissions(session) {
  console.log(`[bg] 🔍 Checking recent submissions for problem: ${session.problemId}`);
  
  try {
    const submissions = await fetchRecentSubmissions(20);
    
    if (!submissions || submissions.length === 0) {
      console.log('[bg] No submissions returned from API');
      return;
    }

    console.log(`[bg] Found ${submissions.length} total recent submissions`);

    // Simple logic: Check if any recent submission matches current problem
    const matchingSubmissions = submissions.filter(sub => {
      const titleSlug = sub.title.toLowerCase().replace(/\s+/g, '-');
      const isMatch = titleSlug === session.problemId;
      
      console.log(`[bg] "${sub.title}" → "${titleSlug}" vs "${session.problemId}" | Match: ${isMatch}`);
      
      return isMatch;
    });

    console.log(`[bg] Found ${matchingSubmissions.length} matching submissions`);

    // Process each matching submission (avoid duplicates)
    for (const submission of matchingSubmissions) {
      const submissionKey = `${session.problemId}_${submission.id}`;
      
      // Skip if already processed
      if (session.processedSubmissions.includes(submissionKey)) {
        console.log(`[bg] ⚠️ Already processed: ${submissionKey}`);
        continue;
      }

      // Mark as processed
      session.processedSubmissions.push(submissionKey);
      
      // Keep list manageable (last 50)
      if (session.processedSubmissions.length > 50) {
        session.processedSubmissions = session.processedSubmissions.slice(-25);
      }

      console.log(`[bg] 🎯 NEW SUBMISSION FOUND: ${submission.statusDisplay} for ${submission.title}`);

      // Send submission event
      await postEvent("ProblemSubmitted", {
        userId: settings.userId,
        platform: session.platform,
        problemId: session.problemId,
        problemTitle: session.problemTitle || submission.title,
        verdict: submission.statusDisplay,
        runtime: submission.runtime || null,
        memory: submission.memory || null,
        language: submission.lang || null,
        submissionId: submission.id,
        timestamp: submission.timestamp, // Keep original timestamp
        code: session.currentCode,
        ts: Date.now()
      });
    }

  } catch (error) {
    console.error('[bg] Error checking submissions:', error);
  }
}

// OPTIMIZED HEARTBEAT SYSTEM - Separated intervals
// Enhanced heartbeat system with simplified submission detection
setInterval(async () => {
  const now = Date.now();
  
  for (const [tabId, session] of sessions) {
    if (!session.isActive) continue;
    
    updateActiveTime(tabId);
    
    // REGULAR HEARTBEAT - Every 30 seconds
    if (now - lastHeartbeat >= HEARTBEAT_INTERVAL) {
      await postEvent("ProblemProgress", {
        userId: settings.userId,
        platform: session.platform,
        problemId: session.problemId,
        activeMs: session.activeMs,
        wallClockMs: now - session.startTime,
        counters: session.counters,
        focused: session.focused,
        currentCode: session.currentCode,
        currentLanguage: session.currentLanguage,
        codeStats: session.currentCode ? {
          lines: session.currentCode.split('\n').length,
          chars: session.currentCode.length,
          words: session.currentCode.trim().split(/\s+/).length
        } : null,
        ts: now
      });
    }
    
    // SUBMISSION CHECK - Every 5 minutes (simplified!)
    if (settings.leetcodeUsername && now - lastSubmissionCheck >= SUBMISSION_CHECK_INTERVAL) {
      await checkForNewSubmissions(session); // No timestamp needed!
    }
  }
  
  // Update global timers
  if (now - lastHeartbeat >= HEARTBEAT_INTERVAL) {
    lastHeartbeat = now;
  }
  if (now - lastSubmissionCheck >= SUBMISSION_CHECK_INTERVAL) {
    lastSubmissionCheck = now;
  }
  
}, 5000);

// Enhanced problem detection
async function detectProblem({ problemTitle, problemUrl }) {
  const problemId = extractProblemId(problemUrl);
  return { problemId, expectedTime: 1800 };
}

// Session termination
async function endSession(tabId, reason = 'unknown') {
  const session = sessions.get(tabId);
  if (!session) return;
  
  updateActiveTime(tabId);
  const now = Date.now();
  
  await postEvent("ProblemSessionEnded", {
    userId: settings.userId,
    platform: session.platform,
    problemId: session.problemId,
    totalWallTime: now - session.startTime,
    activeMs: session.activeMs,
    counters: session.counters,
    finalCode: session.currentCode,
    finalLanguage: session.currentLanguage,
    codeEvolution: session.codeHistory.slice(-5),
    reason,
    ts: now
  });
  
  sessions.delete(tabId);
  console.log(`[bg] Session ended for tab ${tabId}, reason: ${reason}`);
}

// Enhanced message handlers
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = sender?.tab?.id ?? null;

  if (msg?.type === "SETTINGS_UPDATED") {
    Object.assign(settings, msg.data);
    console.log('[bg] Settings updated:', settings);
    return;
  }

  if (msg?.type === "SESSION_START") {
    (async () => {
      try {
        if (!tabId) return;
        
        const session = ensureSession(tabId, msg.data?.problemUrl || null);
        session.problemTitle = msg.data?.problemTitle || session.problemTitle || "(unknown)";

        if (session.problemTitle === "(unknown)" || !msg.data?.problemTitle || msg.data.problemTitle === "(loading...)") {
          return;
        }

        const det = await detectProblem({
          problemTitle: session.problemTitle,
          problemUrl: session.url
        });

        await postEvent("ProblemSessionStarted", {
          userId: settings.userId,
          platform: session.platform,
          problemId: session.problemId,
          problemTitle: session.problemTitle,
          problemUrl: session.url,
          expectedTime: det.expectedTime,
          ts: Date.now()
        });
      } catch (e) {
        console.warn("[bg] SESSION_START error:", e.message);
      }
    })();
    return;
  }

  if (msg?.type === "FOCUS_CHANGE") {
    setSessionFocus(tabId, msg.data?.focused);
    return;
  }

  if (msg?.type === "ACTIVITY_PING") {
    if (tabId && sessions.has(tabId)) {
      const session = sessions.get(tabId);
      session.counters.keystrokes++;
      updateActiveTime(tabId);
      
      if (msg.data?.code) {
        const codeChanged = session.currentCode !== msg.data.code;
        session.currentCode = msg.data.code;
        session.currentLanguage = msg.data.language || session.currentLanguage;
        
        if (codeChanged && msg.data.significantChange) {
          session.codeHistory.push({
            code: msg.data.code,
            language: msg.data.language,
            stats: msg.data.stats,
            timestamp: Date.now()
          });
          
          if (session.codeHistory.length > 20) {
            session.codeHistory = session.codeHistory.slice(-20);
          }
        }
      }
    }
    return;
  }

  if (msg?.type === "RUN_CLICKED") {
    (async () => {
      if (!tabId) return;
      const s = sessions.get(tabId);
      if (!s) return;
      
      s.counters.runs++;
      updateActiveTime(tabId);
      
      if (msg.data?.code) {
        s.currentCode = msg.data.code;
        s.currentLanguage = msg.data.language || s.currentLanguage;
      }
      
      await postEvent("ProblemProgress", {
        userId: settings.userId,
        platform: s.platform,
        problemId: s.problemId,
        event: "run_clicked",
        counters: s.counters,
        code: msg.data?.code || s.currentCode,
        language: msg.data?.language || s.currentLanguage,
        ts: Date.now()
      });
    })();
    return;
  }

  if (msg?.type === "SUBMIT_CLICKED") {
    (async () => {
      if (!tabId) return;
      const s = sessions.get(tabId);
      if (!s) return;
      
      s.counters.submissions++;
      updateActiveTime(tabId);
      
      if (msg.data?.code) {
        s.currentCode = msg.data.code;
        s.currentLanguage = msg.data.language || s.currentLanguage;
      }
      
      s.lastSubmissionTime = Date.now();
      
      await postEvent("ProblemProgress", {
        userId: settings.userId,
        platform: s.platform,
        problemId: s.problemId,
        event: "submit_clicked", 
        counters: s.counters,
        code: msg.data?.code || s.currentCode,
        language: msg.data?.language || s.currentLanguage,
        ts: Date.now()
      });

      // Immediate submission checks after submit button (independent of 5-min interval)
      console.log('[bg] 🚀 Submit button clicked - starting immediate submission checks');
      
      // First check after 10 seconds
      setTimeout(async () => {
        console.log('[bg] First immediate submission check');
        await checkForNewSubmissions(s, s.lastSubmissionTime - 5000);
      }, 10000);
      
      // Second check after 30 seconds
      setTimeout(async () => {
        console.log('[bg] Second immediate submission check');
        await checkForNewSubmissions(s, s.lastSubmissionTime - 5000);
      }, 30000);
      
      // Third check after 60 seconds
      setTimeout(async () => {
        console.log('[bg] Third immediate submission check');
        await checkForNewSubmissions(s, s.lastSubmissionTime - 5000);
      }, 60000);
      
    })();
    return;
  }
});

// Tab lifecycle management
chrome.tabs.onRemoved.addListener((tabId) => {
  if (sessions.has(tabId)) {
    endSession(tabId, 'tab_closed');
  }
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    for (const [tabId, session] of sessions) {
      if (session.focused) {
        setSessionFocus(tabId, false);
      }
    }
  }
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  for (const [id, session] of sessions) {
    setSessionFocus(id, id === tabId);
  }
});

console.log('[bg] 🚀 LeetCode Session Tracker service worker initialized');
console.log('[bg] ⏱️ Heartbeat interval: 30s | Submission check interval: 5min');
