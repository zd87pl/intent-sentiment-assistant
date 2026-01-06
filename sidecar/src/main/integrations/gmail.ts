// Gmail Integration for Sidecar
// Handles OAuth flow and email fetching
// Phase 2 implementation - skeleton only

import { invoke } from '@tauri-apps/api/core';
import type { GmailCredentials } from '../../shared/types';

// ============================================================================
// Configuration
// ============================================================================

const GMAIL_CLIENT_ID = import.meta.env.VITE_GMAIL_CLIENT_ID || '';
const GMAIL_REDIRECT_URI = 'http://localhost:8421/oauth/gmail/callback';

// Required OAuth scopes for reading emails
const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

// ============================================================================
// OAuth Flow
// ============================================================================

/**
 * Initiate Gmail OAuth flow
 */
export async function initiateOAuth(): Promise<void> {
  const state = await generateState();
  await invoke('store_oauth_state', { provider: 'gmail', state });

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', GMAIL_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', GMAIL_REDIRECT_URI);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', GMAIL_SCOPES);
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('prompt', 'consent');

  await invoke('open_browser', { url: authUrl.toString() });
  await invoke('start_oauth_server', { provider: 'gmail', port: 8421 });
}

/**
 * Handle OAuth callback
 */
export async function handleOAuthCallback(code: string, state: string): Promise<GmailCredentials> {
  const isValid = await invoke<boolean>('validate_oauth_state', { provider: 'gmail', state });
  if (!isValid) {
    throw new Error('Invalid OAuth state');
  }

  const response = await invoke<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
    scope: string;
  }>('gmail_exchange_code', { code, redirectUri: GMAIL_REDIRECT_URI });

  // Get user email
  const userInfo = await invoke<{ email: string }>('gmail_get_user_info', {
    token: response.access_token,
  });

  const credentials: GmailCredentials = {
    id: `gmail_${userInfo.email}`,
    type: 'gmail',
    accessToken: response.access_token,
    refreshToken: response.refresh_token,
    expiresAt: new Date(Date.now() + response.expires_in * 1000),
    scope: response.scope,
    email: userInfo.email,
  };

  await invoke('store_credentials', {
    provider: 'gmail',
    credentials: JSON.stringify(credentials),
  });

  return credentials;
}

/**
 * Get stored Gmail credentials
 */
export async function getCredentials(): Promise<GmailCredentials | null> {
  try {
    const credentials = await invoke<string>('get_credentials', { provider: 'gmail' });
    return credentials ? JSON.parse(credentials) : null;
  } catch {
    return null;
  }
}

/**
 * Check if Gmail is connected
 */
export async function isConnected(): Promise<boolean> {
  const credentials = await getCredentials();
  return credentials !== null;
}

/**
 * Disconnect Gmail integration
 */
export async function disconnect(): Promise<void> {
  await invoke('delete_credentials', { provider: 'gmail' });
  await invoke('db_execute', {
    sql: "DELETE FROM integrations WHERE type = 'gmail'",
    params: [],
  });
}

// ============================================================================
// API Operations (Phase 2)
// ============================================================================

// TODO: Implement in Phase 2
// - listThreads(): List email threads
// - getThread(): Get full thread with messages
// - searchEmails(): Search emails with query
// - syncThreadToSituation(): Import thread to situation

// ============================================================================
// Utility Functions
// ============================================================================

async function generateState(): Promise<string> {
  try {
    return await invoke<string>('generate_random_string', { length: 32 });
  } catch {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
  }
}

export default {
  initiateOAuth,
  handleOAuthCallback,
  getCredentials,
  isConnected,
  disconnect,
};
