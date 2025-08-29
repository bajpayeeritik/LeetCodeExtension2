class PopupController {
  constructor() {
    this.updateInterval = null;
    this.init();
  }

  async init() {
    this.setupEventListeners();
    this.checkConnectionStatus();
    this.updateSessionStatus();
    this.loadStats();
    
    // Update every second when popup is open
    this.updateInterval = setInterval(() => {
      this.updateSessionStatus();
    }, 1000);
  }

  setupEventListeners() {
    document.getElementById('refreshBtn').addEventListener('click', () => {
      this.updateSessionStatus();
      this.checkConnectionStatus();
    });

    document.getElementById('endSessionBtn').addEventListener('click', () => {
      this.endCurrentSession();
    });

    // Cleanup when popup closes
    window.addEventListener('beforeunload', () => {
      if (this.updateInterval) {
        clearInterval(this.updateInterval);
      }
    });
  }

  async updateSessionStatus() {
    try {
      // Get current tab
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const currentTab = tabs[0];

      if (!this.isProblemPage(currentTab.url)) {
        this.showNoSession();
        return;
      }

      // Request session data from content script
      try {
        const response = await chrome.tabs.sendMessage(currentTab.id, { 
          action: 'getSessionStatus' 
        });

        if (response && response.session) {
          this.updateSessionDisplay(response.session);
        } else {
          this.showNoSession();
        }
      } catch (error) {
        // Content script not loaded or no response
        this.showNoSession();
      }
    } catch (error) {
      console.error('Error updating session status:', error);
      this.showNoSession();
    }
  }

  updateSessionDisplay(session) {
    const statusElement = document.getElementById('sessionStatus');
    const detailsElement = document.getElementById('sessionDetails');
    const endBtn = document.getElementById('endSessionBtn');
    
    // Update status indicator
    const indicator = document.getElementById('statusIndicator');
    const statusText = document.getElementById('statusText');
    
    if (session.isActive) {
      indicator.className = 'status-indicator active';
      statusText.textContent = 'Active session';
      statusElement.style.borderLeftColor = '#10b981';
    } else {
      indicator.className = 'status-indicator idle';
      statusText.textContent = 'Session paused';
      statusElement.style.borderLeftColor = '#f59e0b';
    }

    // Update session details
    document.getElementById('problemTitle').textContent = session.problemInfo.problemTitle;
    document.getElementById('platform').textContent = session.problemInfo.platform.toUpperCase();
    document.getElementById('difficulty').textContent = session.problemInfo.difficulty;
    document.getElementById('activeTime').textContent = this.formatDuration(session.activeDuration);
    document.getElementById('totalTime').textContent = this.formatDuration(session.totalDuration);
    document.getElementById('codeChanges').textContent = session.codeChanges.toString();
    document.getElementById('runAttempts').textContent = session.runAttempts.toString();
    document.getElementById('submitAttempts').textContent = session.submitAttempts.toString();

    // Show details and end button
    detailsElement.style.display = 'block';
    endBtn.style.display = 'block';
  }

  showNoSession() {
    const statusElement = document.getElementById('sessionStatus');
    const detailsElement = document.getElementById('sessionDetails');
    const endBtn = document.getElementById('endSessionBtn');
    
    // Update status
    const indicator = document.getElementById('statusIndicator');
    const statusText = document.getElementById('statusText');
    
    indicator.className = 'status-indicator';
    statusText.textContent = 'No active session';
    statusElement.style.borderLeftColor = '#e2e8f0';

    // Hide details and end button
    detailsElement.style.display = 'none';
    endBtn.style.display = 'none';
  }

  async endCurrentSession() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const currentTab = tabs[0];

      await chrome.tabs.sendMessage(currentTab.id, { 
        action: 'endSession' 
      });

      this.showNoSession();
    } catch (error) {
      console.error('Error ending session:', error);
    }
  }

  async checkConnectionStatus() {
    const connectionDot = document.getElementById('connectionDot');
    const connectionText = document.getElementById('connectionText');

    try {
      // Test connection via background script
      const response = await chrome.runtime.sendMessage({ 
        action: 'testConnection' 
      });

      if (response && response.connected) {
        connectionDot.className = 'status-dot connected';
        connectionText.textContent = 'Connected to backend';
      } else {
        connectionDot.className = 'status-dot disconnected';
        connectionText.textContent = 'Backend disconnected';
      }
    } catch (error) {
      connectionDot.className = 'status-dot disconnected';
      connectionText.textContent = 'Connection error';
    }
  }

  async loadStats() {
    try {
      const stored = await chrome.storage.local.get(['sessionStats']);
      const stats = stored.sessionStats || { today: 0, week: 0, total: 0 };

      document.getElementById('todayCount').textContent = stats.today.toString();
      document.getElementById('weekCount').textContent = stats.week.toString();
      document.getElementById('totalCount').textContent = stats.total.toString();
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  }

  formatDuration(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  isProblemPage(url) {
    if (!url) return false;
    
    return /leetcode\.com\/problems\//.test(url) || 
           /geeksforgeeks\.org\/problems\//.test(url);
  }
}

// Initialize popup when DOM loads
document.addEventListener('DOMContentLoaded', () => {
  new PopupController();
});