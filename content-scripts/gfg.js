// Import modules using chrome.runtime.getURL for proper loading
const { SessionManager } = await import(chrome.runtime.getURL('utils/session-manager.js'));
const { PlatformDetector } = await import(chrome.runtime.getURL('utils/platform-detector.js'));

class GFGTracker {
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
          this.setupGFGSpecificTracking();
        }, 1000);
      }
    }
  }

  setupGFGSpecificTracking() {
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
    // GFG uses various editors (CodeMirror, Ace Editor, etc.)
    const codeEditor = document.querySelector('.CodeMirror') ||
                      document.querySelector('.ace_editor') ||
                      document.querySelector('[data-testid="code-editor"]') ||
                      document.querySelector('textarea[name="code"]');

    if (codeEditor) {
      let lastContent = '';
      let debounceTimer;

      const observer = new MutationObserver(() => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          const currentContent = this.getEditorContent(codeEditor);
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

    // Listen for keyboard events as backup
    document.addEventListener('keydown', (event) => {
      const target = event.target;
      if (target && (target.closest('.CodeMirror') || 
                    target.closest('.ace_editor') || 
                    target.closest('[data-testid="code-editor"]'))) {
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

  getEditorContent(editor) {
    // Handle different editor types
    if (editor.classList.contains('CodeMirror') && editor.CodeMirror) {
      return editor.CodeMirror.getValue();
    }
    
    if (editor.classList.contains('ace_editor')) {
      const aceEditor = window.ace?.edit(editor);
      return aceEditor ? aceEditor.getValue() : '';
    }
    
    // Fallback to text content
    return editor.textContent || editor.value || '';
  }

  observeRunCodeButton() {
    this.observeButtons(['Run', 'Test', 'Execute'], 'runCode');
  }

  observeSubmitButton() {
    this.observeButtons(['Submit', 'Submit Code', 'Submit Solution'], 'submit');
  }

  observeButtons(buttonTexts, activityType) {
    const buttons = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"]'));
    
    buttons.forEach(button => {
      const buttonText = button.textContent?.trim().toLowerCase() || button.value?.toLowerCase() || '';
      
      if (buttonTexts.some(text => buttonText.includes(text.toLowerCase()))) {
        if (!button.hasAttribute('data-tracked')) {
          button.setAttribute('data-tracked', 'true');
          button.addEventListener('click', () => {
            this.sessionManager.recordActivity({
              type: activityType,
              timestamp: Date.now(),
              metadata: {
                buttonText: buttonText,
                buttonType: activityType
              }
            });
          });
        }
      }
    });

    // Observer for dynamically added buttons
    const observer = new MutationObserver(() => {
      this.observeButtons(buttonTexts, activityType);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  observeSubmissionResults() {
    // Watch for result messages
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node;
            const text = element.textContent?.toLowerCase() || '';
            
            // Look for success indicators
            if (text.includes('correct') || 
                text.includes('accepted') || 
                text.includes('success') ||
                element.classList?.contains('success') ||
                element.querySelector?.('.success')) {
              
              this.sessionManager.recordActivity({
                type: 'submit',
                timestamp: Date.now(),
                metadata: {
                  result: 'accepted',
                  message: element.textContent?.trim()
                }
              });
            }
            
            // Look for error indicators
            else if (text.includes('wrong') ||
                    text.includes('incorrect') ||
                    text.includes('failed') ||
                    text.includes('error') ||
                    element.classList?.contains('error') ||
                    element.classList?.contains('wrong')) {
              
              let result = 'wrong_answer';
              if (text.includes('timeout') || text.includes('time limit')) {
                result = 'time_limit_exceeded';
              } else if (text.includes('memory')) {
                result = 'memory_limit_exceeded';
              } else if (text.includes('runtime') || text.includes('exception')) {
                result = 'runtime_error';
              }
              
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
    // Watch for navigation changes
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

    // Listen for popstate events
    window.addEventListener('popstate', () => {
      setTimeout(() => this.checkForProblemPage(), 500);
    });
  }
}

// Initialize tracker
new GFGTracker();