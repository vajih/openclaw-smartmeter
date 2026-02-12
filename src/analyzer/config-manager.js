/**
 * Configuration Manager
 * Handles secure storage of OpenRouter API key and other config
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const CONFIG_DIR = join(homedir(), '.openclaw', 'smartmeter');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

/**
 * Get configuration including OpenRouter API key
 * @returns {Promise<Object>} Configuration object
 */
export async function getConfig() {
  try {
    if (!existsSync(CONFIG_FILE)) {
      return getDefaultConfig();
    }

    const content = await readFile(CONFIG_FILE, 'utf-8');
    const config = JSON.parse(content);
    
    return {
      ...getDefaultConfig(),
      ...config
    };
  } catch (error) {
    console.warn('Failed to read config, using defaults:', error.message);
    return getDefaultConfig();
  }
}

/**
 * Save configuration
 * @param {Object} config - Configuration object to save
 */
export async function saveConfig(config) {
  try {
    // Ensure directory exists
    if (!existsSync(CONFIG_DIR)) {
      await mkdir(CONFIG_DIR, { recursive: true });
    }

    await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
  } catch (error) {
    throw new Error(`Failed to save config: ${error.message}`);
  }
}

/**
 * Set OpenRouter API key
 * @param {string} apiKey - OpenRouter API key
 */
export async function setOpenRouterApiKey(apiKey) {
  const config = await getConfig();
  config.openRouterApiKey = apiKey;
  await saveConfig(config);
}

/**
 * Get OpenRouter API key
 * @returns {Promise<string|null>} API key or null if not set
 */
export async function getOpenRouterApiKey() {
  const config = await getConfig();
  return config.openRouterApiKey || null;
}

/**
 * Remove OpenRouter API key
 */
export async function removeOpenRouterApiKey() {
  const config = await getConfig();
  delete config.openRouterApiKey;
  await saveConfig(config);
}

/**
 * Get default configuration
 * @returns {Object} Default config
 */
function getDefaultConfig() {
  return {
    openRouterApiKey: null,
    enableOpenRouterIntegration: true,
    lastUpdated: null
  };
}
