/**
 * OpenRouter API Client
 * Fetches live usage data from OpenRouter to compare with analyzed session data
 */

import https from 'https';

const OPENROUTER_API_BASE = 'https://openrouter.ai/api/v1';

/**
 * Fetch account credits and usage from OpenRouter
 * @param {string} apiKey - OpenRouter API key
 * @returns {Promise<Object>} Usage data including credits, generations, and costs
 */
export async function fetchOpenRouterUsage(apiKey) {
  if (!apiKey || !apiKey.startsWith('sk-or-')) {
    throw new Error('Invalid OpenRouter API key format (should start with "sk-or-")');
  }

  try {
    // Fetch credits/balance
    const creditsData = await makeRequest('/auth/key', apiKey);
    
    // Calculate usage based on available data
    const usage = {
      success: true,
      timestamp: new Date().toISOString(),
      account: {
        label: creditsData.data?.label || 'Unknown',
        limit: creditsData.data?.limit || null,
        usageBalance: creditsData.data?.usage || null,
        limitRemaining: creditsData.data?.limit_remaining || null,
        isFreeTier: creditsData.data?.is_free_tier || false,
      },
      // OpenRouter returns usage in USD cents typically
      totalSpent: creditsData.data?.usage ? (creditsData.data.usage / 100) : null,
      note: 'OpenRouter API integration active'
    };

    return usage;
  } catch (error) {
    if (error.statusCode === 401) {
      throw new Error('Invalid OpenRouter API key - authentication failed');
    }
    throw new Error(`OpenRouter API error: ${error.message}`);
  }
}

/**
 * Make HTTPS request to OpenRouter API
 * @param {string} endpoint - API endpoint path
 * @param {string} apiKey - OpenRouter API key
 * @returns {Promise<Object>} Response data
 */
function makeRequest(endpoint, apiKey) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'openrouter.ai',
      path: `/api/v1${endpoint}`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          
          if (res.statusCode === 200) {
            resolve(parsed);
          } else {
            const error = new Error(parsed.error?.message || 'OpenRouter API error');
            error.statusCode = res.statusCode;
            error.response = parsed;
            reject(error);
          }
        } catch (e) {
          reject(new Error(`Failed to parse OpenRouter response: ${e.message}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Network error: ${error.message}`));
    });

    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

/**
 * Validate OpenRouter API key format
 * @param {string} apiKey - API key to validate
 * @returns {boolean} True if format is valid
 */
export function isValidApiKeyFormat(apiKey) {
  return typeof apiKey === 'string' && apiKey.startsWith('sk-or-') && apiKey.length > 20;
}
