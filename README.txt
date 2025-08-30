Install:
1) Visit chrome://extensions, enable Developer mode.
2) Click "Load unpacked" and select this folder.
3) Open a LeetCode or GeeksforGeeks problem page; open the extension's Service Worker console from the extension Details page to watch logs.

Notes:
- The content script sends SESSION_START immediately with a fallback title and upgrades later when the real title is available.
- The script reboots itself on SPA route changes (e.g., navigating between problems) so sessions restart automatically.
- The service worker currently logs events to the console; wire postEvent() to your backend.
