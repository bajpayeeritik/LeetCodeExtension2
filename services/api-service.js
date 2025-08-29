export class APIService {
  constructor() {
    this.baseUrl = 'https://your-backend-api.com/api'; // Replace with your actual API endpoint
    this.apiKey = 'your-api-key'; // Replace with your actual API key
  }

  async sendEvent(event) {
    try {
      const response = await fetch(`${this.baseUrl}/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'X-Extension-Version': chrome.runtime.getManifest().version
        },
        body: JSON.stringify(event)
      });

      if (!response.ok) {
        console.error('Failed to send event:', response.status, response.statusText);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error sending event to API:', error);
      return false;
    }
  }

  async sendBatchEvents(events) {
    try {
      const response = await fetch(`${this.baseUrl}/events/batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'X-Extension-Version': chrome.runtime.getManifest().version
        },
        body: JSON.stringify({ events })
      });

      if (!response.ok) {
        console.error('Failed to send batch events:', response.status, response.statusText);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error sending batch events to API:', error);
      return false;
    }
  }

  async testConnection() {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });

      return response.ok;
    } catch (error) {
      console.error('Error testing API connection:', error);
      return false;
    }
  }
}