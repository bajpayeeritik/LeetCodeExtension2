// options.js - Settings management
const optionsForm = document.getElementById('optionsForm');
const usernameInput = document.getElementById('leetcodeUsername');
const userIdInput = document.getElementById('userId');
const testBtn = document.getElementById('testBtn');
const statusDiv = document.getElementById('status');

// Load saved settings
document.addEventListener('DOMContentLoaded', async () => {
    const result = await chrome.storage.sync.get({
        leetcodeUsername: '',
        userId: 'user123'
    });
    
    usernameInput.value = result.leetcodeUsername;
    userIdInput.value = result.userId;
});

// Save settings
optionsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const settings = {
        leetcodeUsername: usernameInput.value.trim(),
        userId: userIdInput.value.trim()
    };
    
    if (!settings.leetcodeUsername) {
        showStatus('Please enter your LeetCode username', 'error');
        return;
    }
    
    if (!settings.userId) {
        showStatus('Please enter a user ID', 'error');
        return;
    }
    
    try {
        await chrome.storage.sync.set(settings);
        showStatus('Settings saved successfully!', 'success');
        
        // Notify background script of settings change
        chrome.runtime.sendMessage({ type: 'SETTINGS_UPDATED', data: settings });
    } catch (error) {
        showStatus('Error saving settings: ' + error.message, 'error');
    }
});

// Test API connection
testBtn.addEventListener('click', async () => {
    const username = usernameInput.value.trim();
    
    if (!username) {
        showStatus('Please enter a username first', 'error');
        return;
    }
    
    showStatus('Testing API connection...', 'success');
    
    try {
        const response = await fetch(`https://alfa-leetcode-api.onrender.com/${username}/submission?limit=1`);
        
        if (!response.ok) {
            throw new Error(`API returned ${response.status}`);
        }
        
        const data = await response.json();
        showStatus(`✅ API connection successful! Found ${data.submission?.length || 0} recent submissions.`, 'success');
    } catch (error) {
        showStatus('❌ API connection failed: ' + error.message, 'error');
    }
});

function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
    
    if (type === 'success') {
        setTimeout(() => {
            statusDiv.textContent = '';
            statusDiv.className = '';
        }, 3000);
    }
}
