// Import modules using chrome.runtime.getURL for proper loading
const { APIService } = await import(chrome.runtime.getURL('services/api-service.js'));

class BackgroundService {
  constructor() {
    this.apiService = new APIService();
    this.eventQueue = [];
    this.isOnline = navigator.onLine;
    this.setupListeners();
    this.processQueuePeriodically();
  }

  setupListeners() {
    // Listen for messages from content scripts
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'recordEvent') {
        this.handleEvent(message.event);
        sendResponse({ success: true });
      }
      return true;
    });

    // Monitor online/offline status
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.processEventQueue();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
    });

    // Handle tab updates and removals
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && this.isProblemPage(tab.url)) {
        // Inject content script if needed
        this.ensureContentScriptInjected(tabId, tab.url);
      }
    });

    chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
      // Send session end event for closed tabs
      chrome.tabs.sendMessage(tabId, { action: 'endSession' }).catch(() => {
        // Tab already closed, ignore error
      });
    });
  }

  handleEvent(event) {
    console.log('Received event:', event);
    
    // Add to queue
    this.eventQueue.push({
      ...event,
      queuedAt: Date.now()
    });

    // Try to send immediately if online
    if (this.isOnline) {
      this.processEventQueue();
    }

    // Store in chrome storage as backup
    this.storeEventInStorage(event);
  }

  async processEventQueue() {
    if (!this.isOnline || this.eventQueue.length === 0) return;

    const eventsToSend = [...this.eventQueue];
    this.eventQueue = [];

    try {
      if (eventsToSend.length === 1) {
        const success = await this.apiService.sendEvent(eventsToSend[0]);
        if (!success) {
          // Re-queue the event
          this.eventQueue.unshift(eventsToSend[0]);
        }
      } else if (eventsToSend.length > 1) {
        const success = await this.apiService.sendBatchEvents(eventsToSend);
        if (!success) {
          // Re-queue all events
          this.eventQueue.unshift(...eventsToSend);
        }
      }
    } catch (error) {
      console.error('Error processing event queue:', error);
      // Re-queue events on error
      this.eventQueue.unshift(...eventsToSend);
    }
  }

  processQueuePeriodically() {
    setInterval(() => {
      this.processEventQueue();
    }, 5000); // Process queue every 5 seconds
  }

  async storeEventInStorage(event) {
    try {
      const stored = await chrome.storage.local.get('pendingEvents');
      const pendingEvents = stored.pendingEvents || [];
      pendingEvents.push(event);
      
      // Keep only last 100 events to prevent storage bloat
      if (pendingEvents.length > 100) {
        pendingEvents.splice(0, pendingEvents.length - 100);
      }
      
      await chrome.storage.local.set({ pendingEvents });
    } catch (error) {
      console.error('Error storing event:', error);
    }
  }

  isProblemPage(url) {
    if (!url) return false;
    
    return /leetcode\.com\/problems\//.test(url) || 
           /geeksforgeeks\.org\/problems\//.test(url);
  }

  ensureContentScriptInjected(tabId, url) {
    if (!url) return;

    try {
      if (url.includes('leetcode.com')) {
        chrome.scripting.executeScript({
          target: { tabId },
          files: ['content-scripts/leetcode.js']
        }).catch(() => {
          // Script might already be injected
        });
      } else if (url.includes('geeksforgeeks.org')) {
        chrome.scripting.executeScript({
          target: { tabId },
          files: ['content-scripts/gfg.js']
        }).catch(() => {
          // Script might already be injected
        });
      }
    } catch (error) {
      console.error('Error injecting content script:', error);
    }
  }
}

// Initialize background service
new BackgroundService();