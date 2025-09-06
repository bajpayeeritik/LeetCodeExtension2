// content-script.js - Captures code on Run button click

console.log('[content] LeetCode Session Tracker content script loaded');

// Wait for DOM to be ready
let isInitialized = false;

function initializeRunButtonListener() {
  if (isInitialized) return;
  
  // LeetCode Run button selectors (multiple possible selectors)
  const runButtonSelectors = [
    'button[data-e2e-locator="console-run-button"]',
    'button[data-cy="run-code-btn"]', 
    'button[aria-label="Run Code"]',
    'button:contains("Run")',
    '.runcode-wrapper__8rXm button',
    '.btn__2dkX.btn-info__3aXg',
    'button[class*="run"]'
  ];

  let runButton = null;
  
  // Try to find the Run button
  for (const selector of runButtonSelectors) {
    runButton = document.querySelector(selector);
    if (runButton) {
      console.log(`[content] Found Run button with selector: ${selector}`);
      break;
    }
  }

  if (!runButton) {
    // If specific selectors don't work, find by text content
    const buttons = Array.from(document.querySelectorAll('button'));
    runButton = buttons.find(btn => 
      btn.textContent.trim().toLowerCase().includes('run') &&
      !btn.textContent.trim().toLowerCase().includes('runtime')
    );
  }

  if (runButton) {
    runButton.addEventListener('click', handleRunButtonClick);
    console.log('[content] ✅ Run button listener attached');
    isInitialized = true;
  } else {
    console.warn('[content] ⚠️ Run button not found, will retry...');
    // Retry after DOM changes
    setTimeout(initializeRunButtonListener, 2000);
  }
}

// Extract code from CodeMirror editor
function extractCodeFromEditor() {
  let code = '';
  
  try {
    // Method 1: Try to get CodeMirror instance directly
    const codeMirrorElement = document.querySelector('.CodeMirror');
    if (codeMirrorElement && codeMirrorElement.CodeMirror) {
      code = codeMirrorElement.CodeMirror.getValue();
      console.log('[content] ✅ Code extracted via CodeMirror instance');
      return code;
    }

    // Method 2: Try to find Monaco Editor (newer LeetCode interface)
    const monacoEditor = document.querySelector('.monaco-editor .view-lines');
    if (monacoEditor) {
      const lines = monacoEditor.querySelectorAll('.view-line');
      code = Array.from(lines).map(line => {
        // Get text content, handling spans and nested elements
        return line.innerText || line.textContent || '';
      }).join('\n');
      
      if (code.trim()) {
        console.log('[content] ✅ Code extracted via Monaco Editor');
        return code;
      }
    }

    // Method 3: Try textarea fallback
    const textarea = document.querySelector('textarea[data-mode], textarea.inputarea');
    if (textarea) {
      code = textarea.value;
      console.log('[content] ✅ Code extracted via textarea');
      return code;
    }

    // Method 4: Try to find any contenteditable div
    const editableDiv = document.querySelector('[contenteditable="true"]');
    if (editableDiv) {
      code = editableDiv.innerText || editableDiv.textContent || '';
      console.log('[content] ✅ Code extracted via contenteditable');
      return code;
    }

    // Method 5: Look for specific LeetCode editor classes
    const editorContent = document.querySelector('.monaco-editor-background, .editor-scrollable');
    if (editorContent) {
      const codeLines = editorContent.querySelectorAll('.view-line span');
      code = Array.from(codeLines).map(span => span.textContent || '').join('');
      if (code.trim()) {
        console.log('[content] ✅ Code extracted via editor spans');
        return code;
      }
    }

  } catch (error) {
    console.error('[content] Error extracting code:', error);
  }

  return code;
}

// Get current language from the language selector
function getCurrentLanguage() {
  try {
    // Try language dropdown
    const langDropdown = document.querySelector('[data-cy="lang-select"] button span, .ant-select-selection-item');
    if (langDropdown) {
      return langDropdown.textContent.trim();
    }

    // Try alternative selectors
    const langSelectors = [
      '.language-select span',
      '[aria-label*="language"] span', 
      '.selected-language'
    ];

    for (const selector of langSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        return element.textContent.trim();
      }
    }
  } catch (error) {
    console.warn('[content] Could not detect language:', error);
  }

  return 'Unknown';
}

// Get problem information
function getProblemInfo() {
  try {
    // Get problem title
    const titleElement = document.querySelector('[data-cy="question-title"], .css-v3d350, h4');
    const problemTitle = titleElement ? titleElement.textContent.trim() : 'Unknown Problem';

    // Get problem ID from URL
    const urlParts = window.location.pathname.split('/');
    const problemId = urlParts.includes('problems') ? 
      urlParts[urlParts.indexOf('problems') + 1] : 
      'unknown-problem';

    return { problemTitle, problemId };
  } catch (error) {
    console.warn('[content] Could not extract problem info:', error);
    return { problemTitle: 'Unknown Problem', problemId: 'unknown-problem' };
  }
}

// Handle Run button click
function handleRunButtonClick() {
  console.log('[content] 🚀 Run button clicked!');
  
  const code = extractCodeFromEditor();
  const language = getCurrentLanguage();
  const { problemTitle, problemId } = getProblemInfo();
  
  console.log('[content] Code length:', code.length);
  console.log('[content] Language:', language);
  console.log('[content] Problem:', problemTitle);
  
  if (code.trim().length === 0) {
    console.warn('[content] ⚠️ No code found to capture');
    return;
  }

  // Send to service worker
  chrome.runtime.sendMessage({
    type: 'RUN_CLICKED',
    data: {
      code: code,
      language: language,
      problemId: problemId,
      problemTitle: problemTitle,
      codeStats: {
        lines: code.split('\n').length,
        chars: code.length,
        words: code.trim().split(/\s+/).length
      },
      timestamp: Date.now()
    }
  });

  console.log('[content] ✅ Code sent to service worker');
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeRunButtonListener);
} else {
  initializeRunButtonListener();
}

// Also retry when URL changes (SPA navigation)
let currentUrl = location.href;
new MutationObserver(() => {
  if (location.href !== currentUrl) {
    currentUrl = location.href;
    isInitialized = false;
    console.log('[content] URL changed, reinitializing...');
    setTimeout(initializeRunButtonListener, 1000);
  }
}).observe(document, { subtree: true, childList: true });
