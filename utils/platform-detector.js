export class PlatformDetector {
  static detectPlatform() {
    const hostname = window.location.hostname;
    
    if (hostname.includes('leetcode.com')) {
      return 'leetcode';
    } else if (hostname.includes('geeksforgeeks.org')) {
      return 'gfg';
    }
    
    return null;
  }

  static extractProblemInfo() {
    const platform = this.detectPlatform();
    if (!platform) return null;

    switch (platform) {
      case 'leetcode':
        return this.extractLeetCodeProblemInfo();
      case 'gfg':
        return this.extractGFGProblemInfo();
      default:
        return null;
    }
  }

  static extractLeetCodeProblemInfo() {
    const url = window.location.href;
    const pathMatch = url.match(/\/problems\/([^\/\?]+)/);
    
    if (!pathMatch) return null;

    const problemSlug = pathMatch[1];
    
    // Extract title from page
    const titleElement = document.querySelector('[data-cy="question-title"]') || 
                        document.querySelector('h1') ||
                        document.querySelector('.css-v3d350');
    
    const title = titleElement?.textContent?.trim() || problemSlug;
    
    // Extract difficulty
    const difficultyElement = document.querySelector('[diff]') ||
                             document.querySelector('.text-difficulty-easy') ||
                             document.querySelector('.text-difficulty-medium') ||
                             document.querySelector('.text-difficulty-hard') ||
                             document.querySelector('[data-degree]');
    
    let difficulty = 'Unknown';
    if (difficultyElement) {
      const diffText = difficultyElement.textContent?.trim().toLowerCase();
      if (diffText?.includes('easy')) difficulty = 'Easy';
      else if (diffText?.includes('medium')) difficulty = 'Medium';
      else if (diffText?.includes('hard')) difficulty = 'Hard';
    }

    return {
      platform: 'leetcode',
      problemId: problemSlug,
      problemTitle: title,
      difficulty,
      url: window.location.href
    };
  }

  static extractGFGProblemInfo() {
    const url = window.location.href;
    const pathMatch = url.match(/\/problems\/([^\/\?]+)/);
    
    if (!pathMatch) return null;

    const problemSlug = pathMatch[1];
    
    // Extract title from page
    const titleElement = document.querySelector('h1') ||
                        document.querySelector('.page-title') ||
                        document.querySelector('[data-testid="problem-title"]');
    
    const title = titleElement?.textContent?.trim() || problemSlug;
    
    // Extract difficulty
    const difficultyElement = document.querySelector('.difficulty') ||
                             document.querySelector('[data-difficulty]') ||
                             document.querySelector('.problem-difficulty');
    
    const difficulty = difficultyElement?.textContent?.trim() || 'Unknown';

    return {
      platform: 'gfg',
      problemId: problemSlug,
      problemTitle: title,
      difficulty,
      url: window.location.href
    };
  }

  static isProblemPage() {
    const platform = this.detectPlatform();
    if (!platform) return false;

    const url = window.location.href;
    
    switch (platform) {
      case 'leetcode':
        return /\/problems\/[^\/\?]+/.test(url);
      case 'gfg':
        return /\/problems\/[^\/\?]+/.test(url);
      default:
        return false;
    }
  }
}