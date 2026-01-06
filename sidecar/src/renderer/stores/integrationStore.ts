// Integration Store - State management for OAuth integrations
import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { SlackChannel } from '../../shared/types';

// ============================================================================
// Types
// ============================================================================

interface IntegrationStatus {
  connected: boolean;
  lastSync: Date | null;
  metadata?: Record<string, unknown>;
}

interface IntegrationState {
  // Connection status
  slack: IntegrationStatus;
  gmail: IntegrationStatus;
  zoom: IntegrationStatus;

  // Slack-specific data
  slackChannels: SlackChannel[];

  // UI State
  isConnecting: string | null; // Which integration is currently connecting
  error: string | null;

  // Actions
  checkIntegrations: () => Promise<void>;
  connectSlack: () => Promise<void>;
  disconnectSlack: () => Promise<void>;
  connectGmail: () => Promise<void>;
  disconnectGmail: () => Promise<void>;
  connectZoom: () => Promise<void>;
  disconnectZoom: () => Promise<void>;
  loadSlackChannels: () => Promise<void>;
  clearError: () => void;
}

// ============================================================================
// Store Implementation
// ============================================================================

export const useIntegrationStore = create<IntegrationState>((set) => ({
  // Initial state
  slack: { connected: false, lastSync: null },
  gmail: { connected: false, lastSync: null },
  zoom: { connected: false, lastSync: null },
  slackChannels: [],
  isConnecting: null,
  error: null,

  // Check all integration statuses
  checkIntegrations: async () => {
    try {
      const [slackStatus, gmailStatus, zoomStatus] = await Promise.all([
        invoke<{ connected: boolean; lastSync: string | null; metadata?: Record<string, unknown> }>(
          'check_integration',
          { provider: 'slack' }
        ).catch(() => ({ connected: false, lastSync: null })),
        invoke<{ connected: boolean; lastSync: string | null; metadata?: Record<string, unknown> }>(
          'check_integration',
          { provider: 'gmail' }
        ).catch(() => ({ connected: false, lastSync: null })),
        invoke<{ connected: boolean; lastSync: string | null; metadata?: Record<string, unknown> }>(
          'check_integration',
          { provider: 'zoom' }
        ).catch(() => ({ connected: false, lastSync: null })),
      ]);

      set({
        slack: {
          connected: slackStatus.connected,
          lastSync: slackStatus.lastSync ? new Date(slackStatus.lastSync) : null,
          metadata: slackStatus.metadata,
        },
        gmail: {
          connected: gmailStatus.connected,
          lastSync: gmailStatus.lastSync ? new Date(gmailStatus.lastSync) : null,
          metadata: gmailStatus.metadata,
        },
        zoom: {
          connected: zoomStatus.connected,
          lastSync: zoomStatus.lastSync ? new Date(zoomStatus.lastSync) : null,
          metadata: zoomStatus.metadata,
        },
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to check integrations',
      });
    }
  },

  // Connect Slack
  connectSlack: async () => {
    set({ isConnecting: 'slack', error: null });
    try {
      await invoke('connect_slack');
      // The actual connection happens via OAuth callback
      // We'll update the state when we receive the callback
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to connect Slack',
        isConnecting: null,
      });
    }
  },

  // Disconnect Slack
  disconnectSlack: async () => {
    try {
      await invoke('disconnect_slack');
      set({
        slack: { connected: false, lastSync: null },
        slackChannels: [],
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to disconnect Slack',
      });
    }
  },

  // Connect Gmail
  connectGmail: async () => {
    set({ isConnecting: 'gmail', error: null });
    try {
      await invoke('connect_gmail');
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to connect Gmail',
        isConnecting: null,
      });
    }
  },

  // Disconnect Gmail
  disconnectGmail: async () => {
    try {
      await invoke('disconnect_gmail');
      set({
        gmail: { connected: false, lastSync: null },
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to disconnect Gmail',
      });
    }
  },

  // Connect Zoom
  connectZoom: async () => {
    set({ isConnecting: 'zoom', error: null });
    try {
      await invoke('connect_zoom');
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to connect Zoom',
        isConnecting: null,
      });
    }
  },

  // Disconnect Zoom
  disconnectZoom: async () => {
    try {
      await invoke('disconnect_zoom');
      set({
        zoom: { connected: false, lastSync: null },
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to disconnect Zoom',
      });
    }
  },

  // Load Slack channels
  loadSlackChannels: async () => {
    try {
      const channels = await invoke<SlackChannel[]>('list_slack_channels');
      set({ slackChannels: channels });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to load Slack channels',
      });
    }
  },

  // Clear error
  clearError: () => set({ error: null }),
}));

export default useIntegrationStore;
