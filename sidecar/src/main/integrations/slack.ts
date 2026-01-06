// Slack Integration for Sidecar
// Handles OAuth flow and message fetching

import { invoke } from '@tauri-apps/api/core';
import type {
  SlackCredentials,
  SlackMessage,
  SlackChannel,
  SlackUser,
  Communication,
  CommunicationSource,
} from '../../shared/types';

// ============================================================================
// Configuration
// ============================================================================

const SLACK_CLIENT_ID = import.meta.env.VITE_SLACK_CLIENT_ID || '';
const SLACK_REDIRECT_URI = 'http://localhost:8420/oauth/slack/callback';

// Required OAuth scopes for reading messages
const SLACK_SCOPES = [
  'channels:history',
  'channels:read',
  'groups:history',
  'groups:read',
  'im:history',
  'im:read',
  'mpim:history',
  'mpim:read',
  'users:read',
  'users:read.email',
].join(',');

// ============================================================================
// OAuth Flow
// ============================================================================

/**
 * Initiate Slack OAuth flow
 * Opens system browser to Slack authorization page
 */
export async function initiateOAuth(): Promise<void> {
  const state = await generateState();

  // Store state for validation
  await invoke('store_oauth_state', { provider: 'slack', state });

  const authUrl = new URL('https://slack.com/oauth/v2/authorize');
  authUrl.searchParams.set('client_id', SLACK_CLIENT_ID);
  authUrl.searchParams.set('scope', SLACK_SCOPES);
  authUrl.searchParams.set('redirect_uri', SLACK_REDIRECT_URI);
  authUrl.searchParams.set('state', state);

  // Open in system browser via Tauri
  await invoke('open_browser', { url: authUrl.toString() });

  // Start local callback server to receive the OAuth code
  await invoke('start_oauth_server', { provider: 'slack', port: 8420 });
}

/**
 * Handle OAuth callback - exchange code for tokens
 */
export async function handleOAuthCallback(code: string, state: string): Promise<SlackCredentials> {
  // Validate state
  const isValid = await invoke<boolean>('validate_oauth_state', { provider: 'slack', state });
  if (!isValid) {
    throw new Error('Invalid OAuth state - possible CSRF attack');
  }

  // Exchange code for token via Tauri backend (to protect client secret)
  const response = await invoke<{
    access_token: string;
    team: { id: string; name: string };
    authed_user: { id: string };
    scope: string;
  }>('slack_exchange_code', { code, redirectUri: SLACK_REDIRECT_URI });

  const credentials: SlackCredentials = {
    id: `slack_${response.team.id}`,
    type: 'slack',
    accessToken: response.access_token,
    scope: response.scope,
    teamId: response.team.id,
    teamName: response.team.name,
    userId: response.authed_user.id,
  };

  // Store credentials in system keychain
  await invoke('store_credentials', {
    provider: 'slack',
    credentials: JSON.stringify(credentials),
  });

  // Update integrations table
  await invoke('db_execute', {
    sql: `INSERT INTO integrations (type, connected_at, metadata)
          VALUES ('slack', datetime('now'), ?)
          ON CONFLICT(type) DO UPDATE SET connected_at = datetime('now'), metadata = ?`,
    params: [
      JSON.stringify({ teamId: response.team.id, teamName: response.team.name }),
      JSON.stringify({ teamId: response.team.id, teamName: response.team.name }),
    ],
  });

  return credentials;
}

/**
 * Get stored Slack credentials
 */
export async function getCredentials(): Promise<SlackCredentials | null> {
  try {
    const credentials = await invoke<string>('get_credentials', { provider: 'slack' });
    return credentials ? JSON.parse(credentials) : null;
  } catch {
    return null;
  }
}

/**
 * Check if Slack is connected
 */
export async function isConnected(): Promise<boolean> {
  const credentials = await getCredentials();
  return credentials !== null;
}

/**
 * Disconnect Slack integration
 */
export async function disconnect(): Promise<void> {
  await invoke('delete_credentials', { provider: 'slack' });
  await invoke('db_execute', {
    sql: "DELETE FROM integrations WHERE type = 'slack'",
    params: [],
  });
}

// ============================================================================
// API Operations
// ============================================================================

/**
 * Make an authenticated request to Slack API
 */
async function slackApiRequest<T>(
  endpoint: string,
  method: 'GET' | 'POST' = 'GET',
  body?: Record<string, unknown>
): Promise<T> {
  const credentials = await getCredentials();
  if (!credentials) {
    throw new Error('Slack not connected');
  }

  return invoke<T>('slack_api_request', {
    endpoint,
    method,
    body: body ? JSON.stringify(body) : null,
    token: credentials.accessToken,
  });
}

/**
 * List channels the user is a member of
 */
export async function listChannels(): Promise<SlackChannel[]> {
  const response = await slackApiRequest<{
    ok: boolean;
    channels: Array<{
      id: string;
      name: string;
      is_private: boolean;
      is_im: boolean;
      is_mpim: boolean;
    }>;
  }>('conversations.list', 'GET');

  if (!response.ok) {
    throw new Error('Failed to list Slack channels');
  }

  return response.channels.map((ch) => ({
    id: ch.id,
    name: ch.name,
    isPrivate: ch.is_private,
    isIm: ch.is_im,
    isMpim: ch.is_mpim,
  }));
}

/**
 * List direct message channels
 */
export async function listDMs(): Promise<SlackChannel[]> {
  const response = await slackApiRequest<{
    ok: boolean;
    channels: Array<{
      id: string;
      user: string;
      is_im: boolean;
    }>;
  }>('conversations.list?types=im', 'GET');

  if (!response.ok) {
    throw new Error('Failed to list Slack DMs');
  }

  // Fetch user info to get names
  const userIds = response.channels.map((ch) => ch.user);
  const users = await getUsers(userIds);
  const userMap = new Map(users.map((u) => [u.id, u]));

  return response.channels.map((ch) => ({
    id: ch.id,
    name: userMap.get(ch.user)?.realName || userMap.get(ch.user)?.name || 'Unknown',
    isPrivate: true,
    isIm: true,
    isMpim: false,
  }));
}

/**
 * Get messages from a channel
 */
export async function getChannelHistory(
  channelId: string,
  options: {
    oldest?: string; // Timestamp
    latest?: string; // Timestamp
    limit?: number;
  } = {}
): Promise<SlackMessage[]> {
  const params = new URLSearchParams({
    channel: channelId,
    limit: String(options.limit || 100),
  });

  if (options.oldest) params.set('oldest', options.oldest);
  if (options.latest) params.set('latest', options.latest);

  const response = await slackApiRequest<{
    ok: boolean;
    messages: Array<{
      type: string;
      user: string;
      text: string;
      ts: string;
      thread_ts?: string;
      reactions?: Array<{ name: string; count: number; users: string[] }>;
      files?: Array<{ id: string; name: string; mimetype: string; url_private?: string }>;
    }>;
    has_more: boolean;
  }>(`conversations.history?${params.toString()}`, 'GET');

  if (!response.ok) {
    throw new Error('Failed to fetch channel history');
  }

  return response.messages
    .filter((msg) => msg.type === 'message')
    .map((msg) => ({
      id: msg.ts,
      channelId,
      userId: msg.user,
      text: msg.text,
      timestamp: msg.ts,
      threadTs: msg.thread_ts,
      reactions: msg.reactions?.map((r) => ({
        name: r.name,
        count: r.count,
        users: r.users,
      })),
      files: msg.files?.map((f) => ({
        id: f.id,
        name: f.name,
        mimetype: f.mimetype,
        url: f.url_private,
      })),
    }));
}

/**
 * Get thread replies
 */
export async function getThreadReplies(
  channelId: string,
  threadTs: string
): Promise<SlackMessage[]> {
  const params = new URLSearchParams({
    channel: channelId,
    ts: threadTs,
    limit: '100',
  });

  const response = await slackApiRequest<{
    ok: boolean;
    messages: Array<{
      type: string;
      user: string;
      text: string;
      ts: string;
      thread_ts?: string;
    }>;
  }>(`conversations.replies?${params.toString()}`, 'GET');

  if (!response.ok) {
    throw new Error('Failed to fetch thread replies');
  }

  return response.messages.map((msg) => ({
    id: msg.ts,
    channelId,
    userId: msg.user,
    text: msg.text,
    timestamp: msg.ts,
    threadTs: msg.thread_ts,
  }));
}

/**
 * Get user information
 */
export async function getUser(userId: string): Promise<SlackUser> {
  const response = await slackApiRequest<{
    ok: boolean;
    user: {
      id: string;
      name: string;
      real_name?: string;
      profile: { email?: string };
      is_bot: boolean;
    };
  }>(`users.info?user=${userId}`, 'GET');

  if (!response.ok) {
    throw new Error('Failed to fetch user info');
  }

  return {
    id: response.user.id,
    name: response.user.name,
    realName: response.user.real_name,
    email: response.user.profile.email,
    isBot: response.user.is_bot,
  };
}

/**
 * Get multiple users
 */
export async function getUsers(userIds: string[]): Promise<SlackUser[]> {
  // Slack doesn't have a batch user info endpoint, so we need to fetch individually
  // TODO: Cache user info
  const users = await Promise.all(
    userIds.map(async (id) => {
      try {
        return await getUser(id);
      } catch {
        return { id, name: 'Unknown', isBot: false };
      }
    })
  );
  return users;
}

/**
 * Search messages
 */
export async function searchMessages(
  query: string,
  options: { count?: number; page?: number } = {}
): Promise<SlackMessage[]> {
  const params = new URLSearchParams({
    query,
    count: String(options.count || 20),
    page: String(options.page || 1),
  });

  const response = await slackApiRequest<{
    ok: boolean;
    messages: {
      matches: Array<{
        iid: string;
        channel: { id: string; name: string };
        user: string;
        username: string;
        text: string;
        ts: string;
      }>;
    };
  }>(`search.messages?${params.toString()}`, 'GET');

  if (!response.ok) {
    throw new Error('Failed to search messages');
  }

  return response.messages.matches.map((msg) => ({
    id: msg.ts,
    channelId: msg.channel.id,
    channelName: msg.channel.name,
    userId: msg.user,
    userName: msg.username,
    text: msg.text,
    timestamp: msg.ts,
  }));
}

// ============================================================================
// Sync Operations
// ============================================================================

/**
 * Sync messages from a channel to a situation
 */
export async function syncChannelToSituation(
  channelId: string,
  situationId: string,
  options: {
    oldest?: Date;
    latest?: Date;
    includeThreads?: boolean;
  } = {}
): Promise<Communication[]> {
  const messages = await getChannelHistory(channelId, {
    oldest: options.oldest ? String(options.oldest.getTime() / 1000) : undefined,
    latest: options.latest ? String(options.latest.getTime() / 1000) : undefined,
    limit: 200,
  });

  const communications: Communication[] = [];

  for (const msg of messages) {
    // Check if already imported
    const exists = await invoke<boolean>('db_query', {
      sql: "SELECT 1 FROM communications WHERE source = 'slack' AND source_id = ?",
      params: [msg.id],
    });

    if (exists) continue;

    // Get user info
    const user = await getUser(msg.userId);

    // Create communication record
    const communication: Communication = {
      id: '', // Will be assigned by database
      situationId,
      source: 'slack' as CommunicationSource,
      sourceId: msg.id,
      timestamp: new Date(parseFloat(msg.timestamp) * 1000),
      participants: [msg.userId],
      contentEncrypted: '', // Will be encrypted by database layer
      metadata: {
        channel: channelId,
        threadId: msg.threadTs,
      },
    };

    communications.push(communication);

    // If this is a thread parent and we want threads, get replies
    if (options.includeThreads && msg.threadTs === msg.timestamp) {
      const replies = await getThreadReplies(channelId, msg.timestamp);
      for (const reply of replies) {
        if (reply.id === msg.id) continue; // Skip parent message

        communications.push({
          id: '',
          situationId,
          source: 'slack',
          sourceId: reply.id,
          timestamp: new Date(parseFloat(reply.timestamp) * 1000),
          participants: [reply.userId],
          contentEncrypted: '',
          metadata: {
            channel: channelId,
            threadId: msg.timestamp,
          },
        });
      }
    }
  }

  // Update last sync time
  await invoke('db_execute', {
    sql: "UPDATE integrations SET last_sync = datetime('now') WHERE type = 'slack'",
    params: [],
  });

  return communications;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate a random state for OAuth CSRF protection
 */
async function generateState(): Promise<string> {
  try {
    return await invoke<string>('generate_random_string', { length: 32 });
  } catch {
    // Fallback
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
  }
}

/**
 * Parse Slack timestamp to Date
 */
export function parseSlackTimestamp(ts: string): Date {
  return new Date(parseFloat(ts) * 1000);
}

/**
 * Format Date to Slack timestamp
 */
export function toSlackTimestamp(date: Date): string {
  return String(date.getTime() / 1000);
}

export default {
  initiateOAuth,
  handleOAuthCallback,
  getCredentials,
  isConnected,
  disconnect,
  listChannels,
  listDMs,
  getChannelHistory,
  getThreadReplies,
  getUser,
  getUsers,
  searchMessages,
  syncChannelToSituation,
  parseSlackTimestamp,
  toSlackTimestamp,
};
