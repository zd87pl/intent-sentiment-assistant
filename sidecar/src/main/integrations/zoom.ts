// Zoom Integration for Sidecar
// Handles OAuth flow and recording/transcript fetching
// Phase 2 implementation - skeleton only

import { invoke } from '@tauri-apps/api/core';
import type { ZoomCredentials } from '../../shared/types';

// ============================================================================
// Configuration
// ============================================================================

const ZOOM_CLIENT_ID = import.meta.env.VITE_ZOOM_CLIENT_ID || '';
const ZOOM_REDIRECT_URI = 'http://localhost:8422/oauth/zoom/callback';

// Required OAuth scopes for accessing recordings
const ZOOM_SCOPES = [
  'cloud_recording:read:list_user_recordings',
  'cloud_recording:read:recording',
  'user:read:user',
].join(' ');

// ============================================================================
// OAuth Flow
// ============================================================================

/**
 * Initiate Zoom OAuth flow
 */
export async function initiateOAuth(): Promise<void> {
  const state = await generateState();
  await invoke('store_oauth_state', { provider: 'zoom', state });

  const authUrl = new URL('https://zoom.us/oauth/authorize');
  authUrl.searchParams.set('client_id', ZOOM_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', ZOOM_REDIRECT_URI);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('state', state);

  await invoke('open_browser', { url: authUrl.toString() });
  await invoke('start_oauth_server', { provider: 'zoom', port: 8422 });
}

/**
 * Handle OAuth callback
 */
export async function handleOAuthCallback(code: string, state: string): Promise<ZoomCredentials> {
  const isValid = await invoke<boolean>('validate_oauth_state', { provider: 'zoom', state });
  if (!isValid) {
    throw new Error('Invalid OAuth state');
  }

  const response = await invoke<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
    scope: string;
  }>('zoom_exchange_code', { code, redirectUri: ZOOM_REDIRECT_URI });

  // Get user info
  const userInfo = await invoke<{ id: string }>('zoom_get_user_info', {
    token: response.access_token,
  });

  const credentials: ZoomCredentials = {
    id: `zoom_${userInfo.id}`,
    type: 'zoom',
    accessToken: response.access_token,
    refreshToken: response.refresh_token,
    expiresAt: new Date(Date.now() + response.expires_in * 1000),
    scope: response.scope,
    userId: userInfo.id,
  };

  await invoke('store_credentials', {
    provider: 'zoom',
    credentials: JSON.stringify(credentials),
  });

  return credentials;
}

/**
 * Get stored Zoom credentials
 */
export async function getCredentials(): Promise<ZoomCredentials | null> {
  try {
    const credentials = await invoke<string>('get_credentials', { provider: 'zoom' });
    return credentials ? JSON.parse(credentials) : null;
  } catch {
    return null;
  }
}

/**
 * Check if Zoom is connected
 */
export async function isConnected(): Promise<boolean> {
  const credentials = await getCredentials();
  return credentials !== null;
}

/**
 * Disconnect Zoom integration
 */
export async function disconnect(): Promise<void> {
  await invoke('delete_credentials', { provider: 'zoom' });
  await invoke('db_execute', {
    sql: "DELETE FROM integrations WHERE type = 'zoom'",
    params: [],
  });
}

// ============================================================================
// API Operations (Phase 2)
// ============================================================================

// TODO: Implement in Phase 2
// - listRecordings(): List cloud recordings
// - getRecording(): Get recording details
// - getTranscript(): Get meeting transcript
// - syncRecordingToSituation(): Import recording to situation

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
