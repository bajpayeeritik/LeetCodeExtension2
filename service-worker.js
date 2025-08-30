// service-worker.js - Integrated with Spring Boot backend

let isOnline = true;
self.addEventListener('online', () => { isOnline = true; processRetryQueue(); });
self.addEventListener('offline', () => { isOnline = false; });

let settings = {
  userId: "user123",
  leetcodeUsername: "",
  backendUrl: "http://localhost:8082/api", // Your Spring Boot backend
  apiKey: "", // Optional API key
  idleThresholdMs: 30000,
  heartbeatIntervalMs: 30000,
  alfaApiBase: "https://alfa-leetcode-api.onrender.com"
};

const sessions = new Map();
const eventQueue = []; // Queue for offline events
let isProcessingQueue = false;

// Load settings on startup
chrome.storage.sync.get({
  userId: 'user123',
  leetcodeUsername: '',
  backendUrl: 'http://localhost:8080/api',
  apiKey: ''
}).then(result => {
  Object.assign(settings, result);
  console.log('[bg] Settings loaded:', settings);
});

function extractProblemId(url) {
  try {
    const parsed = new URL(url);
    const pathParts = parsed.pathname.split('/').filter(p => p);
    if (pathParts.length >= 2 && pathParts[0] === 'problems') {
      return pathParts[1];
    }
  } catch {}
  return url?.slice(0, 20) || "unknown";
}

// Enhanced backend integration
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
    // Queue event for later
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
    
    // Try to process queue later
    setTimeout(processRetryQueue, 30000);
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
        // Put it back in queue for later
        eventQueue.unshift(payload);
        break;
      }

      console.log(`[bg] ✅ Queued ${payload.eventType} sent successfully`);
      
    } catch (error) {
      // Put it back in queue
      eventQueue.unshift(payload);
      break;
    }

    // Small delay between retries
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  isProcessingQueue = false;
}

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
    lastCodeSnapshot: null
  };
  
  sessions.set(tabId, session);
  console.log(`[bg] New session created for ${problemId} on tab ${tabId}`);
  return session;
}

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

function setSessionFocus(tabId, focused) {
  const session = sessions.get(tabId);
  if (!session) return;
  
  updateActiveTime(tabId);
  session.focused = focused;
  
  console.log(`[bg] Session ${tabId} focus: ${focused}`);
}

async function fetchRecentSubmissions(limit = 10) {
  if (!settings.leetcodeUsername) {
    return [];
  }
  
  try {
    const response = await fetch(`${settings.alfaApiBase}/${settings.leetcodeUsername}/submission?limit=${limit}`);
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    const data = await response.json();
    return data.submission || [];
  } catch (error) {
    console.warn("[bg] Failed to fetch submissions:", error.message);
    return [];
  }
}

async function checkForNewSubmission(session, sinceTime) {
  const submissions = await fetchRecentSubmissions(15);
  
  const recentForProblem = submissions.filter(sub => {
    const subTime = new Date(sub.timestamp).getTime();
    const titleSlug = sub.title.toLowerCase().replace(/\s+/g, '-');
    
    return titleSlug === session.problemId &&
           subTime >= sinceTime &&
           subTime <= Date.now() + 60000;
  });

  return recentForProblem.length > 0 ? recentForProblem[0] : null;
}

async function detectProblem({ problemTitle, problemUrl }) {
  const problemId = extractProblemId(problemUrl);
  return { problemId, expectedTime: 1800 };
}

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

// Enhanced heartbeat system
setInterval(async () => {
  const now = Date.now();
  for (const [tabId, session] of sessions) {
    if (!session.isActive) continue;
    
    updateActiveTime(tabId);
    
    // Check for submissions
    if (settings.leetcodeUsername && now - session.lastSubmissionCheck > 30000) {
      session.lastSubmissionCheck = now;
      const checkSince = now - (2 * 60 * 1000);
      
      const newSubmission = await checkForNewSubmission(session, checkSince);
      if (newSubmission) {
        console.log(`[bg] Found new submission via API:`, newSubmission.statusDisplay);
        
        await postEvent("ProblemSubmitted", {
          userId: settings.userId,
          platform: session.platform,
          problemId: session.problemId,
          problemTitle: session.problemTitle,
          verdict: newSubmission.statusDisplay,
          runtime: newSubmission.runtime || null,
          memory: newSubmission.memory || null,
          language: newSubmission.lang || null,
          submissionId: newSubmission.id,
          timestamp: newSubmission.timestamp,
          code: session.currentCode,
          ts: now
        });
      }
    }
    
    // Regular heartbeat
    if (now - session.lastHeartbeat >= settings.heartbeatIntervalMs) {
      session.lastHeartbeat = now;
      
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
  }
}, 5000);

// Message handlers (same as before but using postEvent function)
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

      setTimeout(async () => {
        const newSubmission = await checkForNewSubmission(s, s.lastSubmissionTime - 5000);
        if (newSubmission) {
          await postEvent("ProblemSubmitted", {
            userId: settings.userId,
            platform: s.platform,
            problemId: s.problemId,
            problemTitle: s.problemTitle,
            verdict: newSubmission.statusDisplay,
            runtime: newSubmission.runtime || null,
            memory: newSubmission.memory || null,
            language: newSubmission.lang || null,
            submissionId: newSubmission.id,
            timestamp: newSubmission.timestamp,
            code: s.currentCode,
            ts: Date.now()
          });
        }
      }, 15000);
    })();
    return;
  }
});

// Tab lifecycle handlers remain the same...
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
