# Coding Session Tracker Chrome Extension

A comprehensive Chrome extension that tracks coding session activity across LeetCode and GeeksforGeeks platforms with detailed analytics and timing.

## Features

### Session Tracking
- **Automatic Detection**: Detects when you start working on a coding problem
- **Precise Timing**: Tracks active coding time, excluding idle periods and unfocused tabs
- **Activity Monitoring**: Records code edits, test runs, and submission attempts
- **Outcome Detection**: Automatically detects submission results (accepted, wrong answer, errors)

### Analytics & Reporting
- **Real-time Dashboard**: View current session status in the popup
- **Detailed Metrics**: Track active time, total time, attempts, and outcomes
- **Historical Data**: Daily, weekly, and total session statistics
- **Backend Integration**: Sends detailed events to your analytics backend

### Cross-Platform Support
- **LeetCode**: Full support for problem pages and editor interactions
- **GeeksforGeeks**: Complete tracking for GFG practice problems
- **Platform-Specific Optimizations**: Tailored tracking for each platform's unique UI

## Installation

1. Clone or download this extension
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension directory
5. Configure your backend API endpoint in `services/api-service.ts`

## Configuration

### Backend API Setup
Update the API configuration in `services/api-service.ts`:

```javascript
private readonly baseUrl = 'https://your-backend-api.com/api';
private readonly apiKey = 'your-api-key';
```

### Event Types
The extension sends these event types to your backend:

1. **ProblemDetected**: When a problem page is loaded
2. **ProblemSessionStarted**: When user becomes active on a problem
3. **ProblemProgress**: Periodic heartbeat with session metrics (every 30s)
4. **ProblemSubmitted**: When code is submitted with outcome
5. **ProblemSessionEnded**: When session ends (navigation, tab close, etc.)

### Settings
Customize behavior via Chrome storage:
- `idleThreshold`: Time before marking user as idle (default: 30 seconds)
- `heartbeatInterval`: Frequency of progress reports (default: 30 seconds)
- `enableNotifications`: Show browser notifications for events
- `enableDetailedLogging`: Enable debug logging in console

## Architecture

### File Structure
```
├── manifest.json              # Extension configuration
├── background/
│   └── service-worker.js     # Background script for API communication
├── content-scripts/
│   ├── base-tracker.ts       # Base tracking functionality
│   ├── leetcode.js          # LeetCode-specific tracking
│   └── gfg.js               # GeeksforGeeks-specific tracking
├── popup/
│   ├── popup.html           # Extension popup UI
│   ├── popup.css            # Popup styling
│   └── popup.js             # Popup functionality
├── services/
│   ├── api-service.ts       # Backend API communication
│   └── event-queue.ts       # Event queuing and retry logic
├── utils/
│   ├── session-manager.ts   # Core session tracking logic
│   ├── platform-detector.ts # Platform detection utilities
│   ├── storage-service.ts   # Chrome storage utilities
│   └── logger.ts            # Logging utilities
└── types/
    └── index.ts             # TypeScript type definitions
```

### Key Components

#### SessionManager
- Manages session lifecycle and timing
- Tracks user activity and focus states
- Handles idle detection and exclusion
- Calculates accurate active vs total time

#### Platform Detection
- Automatically identifies LeetCode vs GFG pages
- Extracts problem information (title, difficulty, ID)
- Handles platform-specific DOM structures

#### Event Queue
- Queues events for reliable delivery
- Implements retry logic with exponential backoff
- Handles offline scenarios gracefully
- Batches events for efficient API usage

## Privacy & Performance

### Data Collection
- Only tracks activity on supported coding platforms
- No personal code content is transmitted
- Minimal metadata collection focused on timing and interactions
- User consent and transparency built-in

### Performance
- Lightweight event listeners with debouncing
- Efficient DOM observation strategies
- Minimal impact on page performance
- Smart queue management to prevent memory leaks

## Browser Support

- Chrome 88+ (Manifest V3 required)
- Cross-platform compatibility (Windows, macOS, Linux)
- Responsive popup design for various screen sizes

## Development

### Building
The extension uses vanilla JavaScript with ES modules for maximum compatibility and minimal overhead.

### Testing
Test the extension by:
1. Loading it in Chrome developer mode
2. Navigating to LeetCode or GFG problem pages
3. Opening the popup to view session status
4. Checking console logs for detailed tracking information

### Debugging
Enable detailed logging in the extension settings for comprehensive debugging information.