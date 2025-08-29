// Import modules using chrome.runtime.getURL for proper loading
const { SessionManager } = await import(chrome.runtime.getURL('utils/session-manager.js'));
const { PlatformDetector } = await import(chrome.runtime.getURL('utils/platform-detector.js'));

class LeetCodeTracker {
  constructor() {
    this.sessionManager = new SessionManager();
    this.setupObservers();
    this.checkForProblemPage();
  }

  checkForProblemPage() {
    if (PlatformDetector.isProblemPage()) {
      const problemInfo = PlatformDetector.extractProblemInfo();
      if (problemInfo) {
        // Send problem detected event
        chrome.runtime.sendMessage({
          action: 'recordEvent',
          event: {
            type: 'ProblemDetected',
            timestamp: Date.now(),
            sessionId: 'detection',
            problemInfo,
            metadata: {
              referrer: document.referrer,
              loadTime: performance.now()
            }
          }
        });

        // Start session after a brief delay to allow page to fully load
        setTimeout(() => {
          this.sessionManager.startSession(problemInfo);
          this.setupLeetCodeSpecificTracking();
        }, 1000);
      }
    }
  }

  setupLeetCodeSpecificTracking() {
    // Track code editor changes
    this.observeCodeEditor();
    
    // Track run code button clicks
    this.observeRunCodeButton();
    
    // Track submit button clicks
    this.observeSubmitButton();
    
    // Track submission results
    this.observeSubmissionResults();
  }

  observeCodeEditor() {
    // LeetCode uses Monaco Editor
    const codeEditor = document.querySelector('.monaco-editor') || 
                      document.querySelector('[data-testid="code-editor"]') ||
                      document.querySelector('.view-lines');

    if (codeEditor) {
      let lastContent = '';
      let debounceTimer;

      const observer = new MutationObserver(() => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          const currentContent = codeEditor.textContent || '';
          if (currentContent !== lastContent && currentContent.trim()) {
            this.sessionManager.recordActivity({
              type: 'codeEdit',
              timestamp: Date.now(),
              metadata: {
                contentLength: currentContent.length,
                linesChanged: currentContent.split('\n').length
              }
            });
            lastContent = currentContent;
          }
        }, 500);
      });

      observer.observe(codeEditor, {
        childList: true,
        subtree: true,
        characterData: true
      });
    }

    // Also listen for keyboard events as backup
    document.addEventListener('keydown', (event) => {
      const target = event.target;
      if (target && (target.closest('.monaco-editor') || target.closest('[data-testid="code-editor"]'))) {
        this.sessionManager.recordActivity({
          type: 'codeEdit',
          timestamp: Date.now(),
          metadata: {
            keyCode: event.keyCode,
            key: event.key
          }
        });
      }
    });
  }

  observeRunCodeButton() {
    const runButton = document.querySelector('[data-e2e-locator="console-run-button"]') ||
                     document.querySelector('button[data-cy="run-code-btn"]') ||
                     document.querySelector('button:contains("Run Code")');

    if (runButton) {
      runButton.addEventListener('click', () => {
        this.sessionManager.recordActivity({
          type: 'runCode',
          timestamp: Date.now(),
          metadata: {
            buttonType: 'run'
          }
        });
      });
    }

    // Fallback: observe for run buttons that might be dynamically created
    const observer = new MutationObserver(() => {
      const newRunButton = document.querySelector('[data-e2e-locator="console-run-button"]');
      if (newRunButton && !newRunButton.hasAttribute('data-tracked')) {
        newRunButton.setAttribute('data-tracked', 'true');
        newRunButton.addEventListener('click', () => {
          this.sessionManager.recordActivity({
            type: 'runCode',
            timestamp: Date.now()
          });
        });
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  observeSubmitButton() {
    const submitButton = document.querySelector('[data-e2e-locator="console-submit-button"]') ||
                        document.querySelector('button[data-cy="submit-btn"]') ||
                        document.querySelector('button:contains("Submit")');

    if (submitButton) {
      submitButton.addEventListener('click', () => {
        this.sessionManager.recordActivity({
          type: 'submit',
          timestamp: Date.now(),
          metadata: {
            buttonType: 'submit'
          }
        });
      });
    }

    // Fallback: observe for submit buttons that might be dynamically created
    const observer = new MutationObserver(() => {
      const newSubmitButton = document.querySelector('[data-e2e-locator="console-submit-button"]');
      if (newSubmitButton && !newSubmitButton.hasAttribute('data-tracked')) {
        newSubmitButton.setAttribute('data-tracked', 'true');
        newSubmitButton.addEventListener('click', () => {
          this.sessionManager.recordActivity({
            type: 'submit',
            timestamp: Date.now()
          });
        });
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  observeSubmissionResults() {
    // Watch for submission result messages
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node;
            
            // Look for success messages
            if (element.textContent?.includes('Accepted') || 
                element.classList?.contains('success') ||
                element.querySelector?.('.text-green')) {
              
              this.sessionManager.recordActivity({
                type: 'submit',
                timestamp: Date.now(),
                metadata: {
                  result: 'accepted',
                  message: element.textContent?.trim()
                }
              });
            }
            
            // Look for error messages
            else if (element.textContent?.includes('Wrong Answer') ||
                    element.textContent?.includes('Runtime Error') ||
                    element.textContent?.includes('Time Limit Exceeded') ||
                    element.classList?.contains('error') ||
                    element.querySelector?.('.text-red')) {
              
              let result = 'wrong_answer';
              const text = element.textContent?.toLowerCase();
              if (text?.includes('runtime error')) result = 'runtime_error';
              else if (text?.includes('time limit')) result = 'time_limit_exceeded';
              else if (text?.includes('memory limit')) result = 'memory_limit_exceeded';
              
              this.sessionManager.recordActivity({
                type: 'submit',
                timestamp: Date.now(),
                metadata: {
                  result,
                  message: element.textContent?.trim()
                }
              });
            }
          }
        });
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  setupObservers() {
    // Watch for navigation changes (LeetCode is a SPA)
    let currentUrl = window.location.href;
    
    const urlObserver = new MutationObserver(() => {
      if (window.location.href !== currentUrl) {
        currentUrl = window.location.href;
        
        // End current session
        this.sessionManager.endSession();
        
        // Check if new page is a problem page
        setTimeout(() => this.checkForProblemPage(), 500);
      }
    });

    urlObserver.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Also listen for popstate events
    window.addEventListener('popstate', () => {
      setTimeout(() => this.checkForProblemPage(), 500);
    });
  }
}

// Initialize tracker when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new LeetCodeTracker();
  });
} else {
  new LeetCodeTracker();
}