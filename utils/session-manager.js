export class SessionManager {
  constructor() {
    this.currentSession = null;
    this.idleTracker = {
      lastActivity: Date.now(),
      idleThreshold: 30000, // 30 seconds
      isIdle: false
    };
    this.heartbeatInterval = null;
    this.focusStartTime = Date.now();
    
    this.setupActivityListeners();
    this.setupIdleDetection();
  }

  startSession(problemInfo) {
    const sessionId = this.generateSessionId();
    const timestamp = Date.now();
    
    // End previous session if exists
    if (this.currentSession) {
      this.endSession();
    }

    this.currentSession = {
      sessionId,
      problemInfo,
      startTime: timestamp,
      activeDuration: 0,
      totalDuration: 0,
      lastActivity: timestamp,
      isActive: true,
      isFocused: document.hasFocus(),
      events: [],
      codeChanges: 0,
      runAttempts: 0,
      submitAttempts: 0
    };

    this.focusStartTime = timestamp;
    this.idleTracker.lastActivity = timestamp;
    this.idleTracker.isIdle = false;

    // Send session started event
    this.recordEvent({
      type: 'ProblemSessionStarted',
      timestamp,
      sessionId,
      problemInfo,
      metadata: {
        userAgent: navigator.userAgent,
        screenResolution: `${screen.width}x${screen.height}`,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      }
    });

    // Start heartbeat
    this.startHeartbeat();

    return sessionId;
  }

  recordActivity(activity) {
    if (!this.currentSession || !this.currentSession.isActive) return;

    const now = Date.now();
    this.currentSession.lastActivity = now;
    this.idleTracker.lastActivity = now;
    
    if (this.idleTracker.isIdle) {
      this.idleTracker.isIdle = false;
      this.resumeActiveTracking();
    }

    switch (activity.type) {
      case 'codeEdit':
        this.currentSession.codeChanges++;
        break;
      case 'runCode':
        this.currentSession.runAttempts++;
        break;
      case 'submit':
        this.currentSession.submitAttempts++;
        this.handleSubmission(activity);
        break;
      case 'focus':
        this.handleFocus();
        break;
      case 'blur':
        this.handleBlur();
        break;
    }

    this.updateDurations();
  }

  endSession() {
    if (!this.currentSession) return;

    this.currentSession.isActive = false;
    this.currentSession.endTime = Date.now();
    this.updateDurations();

    // Clear intervals
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.idleTracker.idleCheckInterval) {
      clearInterval(this.idleTracker.idleCheckInterval);
      this.idleTracker.idleCheckInterval = null;
    }

    // Send session ended event
    this.recordEvent({
      type: 'ProblemSessionEnded',
      timestamp: this.currentSession.endTime,
      sessionId: this.currentSession.sessionId,
      problemInfo: this.currentSession.problemInfo,
      metadata: {
        totalDuration: this.currentSession.totalDuration,
        activeDuration: this.currentSession.activeDuration,
        codeChanges: this.currentSession.codeChanges,
        runAttempts: this.currentSession.runAttempts,
        submitAttempts: this.currentSession.submitAttempts,
        lastSubmissionResult: this.currentSession.lastSubmissionResult,
        endReason: 'navigation'
      }
    });

    this.currentSession = null;
  }

  getCurrentSession() {
    return this.currentSession;
  }

  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  setupActivityListeners() {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.recordActivity({ type: 'blur', timestamp: Date.now() });
      } else {
        this.recordActivity({ type: 'focus', timestamp: Date.now() });
      }
    });

    window.addEventListener('focus', () => {
      this.recordActivity({ type: 'focus', timestamp: Date.now() });
    });

    window.addEventListener('blur', () => {
      this.recordActivity({ type: 'blur', timestamp: Date.now() });
    });

    window.addEventListener('beforeunload', () => {
      this.endSession();
    });
  }

  setupIdleDetection() {
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    
    events.forEach(event => {
      document.addEventListener(event, () => {
        this.idleTracker.lastActivity = Date.now();
        if (this.idleTracker.isIdle) {
          this.idleTracker.isIdle = false;
          this.resumeActiveTracking();
        }
      }, true);
    });

    // Check for idle state every 5 seconds
    this.idleTracker.idleCheckInterval = setInterval(() => {
      const now = Date.now();
      const timeSinceLastActivity = now - this.idleTracker.lastActivity;
      
      if (!this.idleTracker.isIdle && timeSinceLastActivity > this.idleTracker.idleThreshold) {
        this.idleTracker.isIdle = true;
        this.recordActivity({ type: 'idle', timestamp: now });
      }
    }, 5000);
  }

  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      if (this.currentSession && this.currentSession.isActive) {
        this.updateDurations();
        this.sendHeartbeat();
      }
    }, 30000); // Send heartbeat every 30 seconds
  }

  sendHeartbeat() {
    if (!this.currentSession) return;

    this.recordEvent({
      type: 'ProblemProgress',
      timestamp: Date.now(),
      sessionId: this.currentSession.sessionId,
      problemInfo: this.currentSession.problemInfo,
      metadata: {
        activeDuration: this.currentSession.activeDuration,
        totalDuration: this.currentSession.totalDuration,
        codeChanges: this.currentSession.codeChanges,
        runAttempts: this.currentSession.runAttempts,
        submitAttempts: this.currentSession.submitAttempts,
        isFocused: this.currentSession.isFocused,
        isIdle: this.idleTracker.isIdle
      }
    });
  }

  handleFocus() {
    if (!this.currentSession) return;
    
    this.currentSession.isFocused = true;
    this.focusStartTime = Date.now();
  }

  handleBlur() {
    if (!this.currentSession) return;
    
    if (this.currentSession.isFocused) {
      const focusDuration = Date.now() - this.focusStartTime;
      this.currentSession.activeDuration += focusDuration;
    }
    
    this.currentSession.isFocused = false;
  }

  resumeActiveTracking() {
    if (this.currentSession && this.currentSession.isFocused) {
      this.focusStartTime = Date.now();
    }
  }

  handleSubmission(activity) {
    if (!this.currentSession) return;

    this.recordEvent({
      type: 'ProblemSubmitted',
      timestamp: activity.timestamp,
      sessionId: this.currentSession.sessionId,
      problemInfo: this.currentSession.problemInfo,
      metadata: {
        submitAttempt: this.currentSession.submitAttempts,
        result: activity.metadata?.result || 'unknown',
        activeDuration: this.currentSession.activeDuration,
        totalDuration: this.currentSession.totalDuration
      }
    });

    // Store the result for session end metadata
    this.currentSession.lastSubmissionResult = activity.metadata?.result;
  }

  updateDurations() {
    if (!this.currentSession) return;

    const now = Date.now();
    this.currentSession.totalDuration = now - this.currentSession.startTime;
    
    // Add current focus time if focused and not idle
    if (this.currentSession.isFocused && !this.idleTracker.isIdle) {
      const currentFocusTime = now - this.focusStartTime;
      // Only add time since last duration update
      const lastUpdate = this.currentSession.activeDuration;
      this.currentSession.activeDuration = lastUpdate + Math.min(currentFocusTime, 1000);
      this.focusStartTime = now;
    }
  }

  recordEvent(event) {
    if (this.currentSession) {
      this.currentSession.events.push(event);
    }
    
    // Send to background script for API communication
    chrome.runtime.sendMessage({
      action: 'recordEvent',
      event
    });
  }
}