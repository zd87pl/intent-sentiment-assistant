// Situation Store - State management for situations
import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { Situation, SituationStatus, Participant, Communication, SituationBrief } from '../../shared/types';

// ============================================================================
// Types
// ============================================================================

interface SituationState {
  // Data
  situations: Situation[];
  currentSituation: Situation | null;
  currentBrief: SituationBrief | null;

  // UI State
  isLoading: boolean;
  error: string | null;
  filter: SituationStatus | 'all';

  // Actions
  loadSituations: () => Promise<void>;
  loadSituation: (id: string) => Promise<void>;
  createSituation: (title: string, description: string) => Promise<Situation>;
  updateSituation: (id: string, updates: Partial<Situation>) => Promise<void>;
  deleteSituation: (id: string) => Promise<void>;
  setFilter: (filter: SituationStatus | 'all') => void;
  generateBrief: (id: string) => Promise<void>;
  clearError: () => void;

  // Participant actions
  addParticipant: (situationId: string, participant: Omit<Participant, 'id'>) => Promise<void>;
  removeParticipant: (participantId: string) => Promise<void>;
}

// ============================================================================
// Store Implementation
// ============================================================================

export const useSituationStore = create<SituationState>((set, get) => ({
  // Initial state
  situations: [],
  currentSituation: null,
  currentBrief: null,
  isLoading: false,
  error: null,
  filter: 'all',

  // Load all situations
  loadSituations: async () => {
    set({ isLoading: true, error: null });
    try {
      const filter = get().filter;
      const params = filter === 'all' ? {} : { status: filter };

      const situations = await invoke<Situation[]>('list_situations', params);

      // Convert date strings to Date objects
      const parsed = situations.map(parseSituation);
      set({ situations: parsed, isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to load situations',
        isLoading: false,
      });
    }
  },

  // Load a single situation with all details
  loadSituation: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      const situation = await invoke<Situation>('get_situation', { id });

      if (situation) {
        const parsed = parseSituation(situation);
        set({ currentSituation: parsed, isLoading: false });
      } else {
        set({ currentSituation: null, isLoading: false, error: 'Situation not found' });
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to load situation',
        isLoading: false,
      });
    }
  },

  // Create a new situation
  createSituation: async (title: string, description: string) => {
    set({ isLoading: true, error: null });
    try {
      const situation = await invoke<Situation>('create_situation', {
        title,
        description,
        status: 'active',
      });

      const parsed = parseSituation(situation);
      set((state) => ({
        situations: [parsed, ...state.situations],
        currentSituation: parsed,
        isLoading: false,
      }));

      return parsed;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to create situation',
        isLoading: false,
      });
      throw error;
    }
  },

  // Update a situation
  updateSituation: async (id: string, updates: Partial<Situation>) => {
    set({ isLoading: true, error: null });
    try {
      await invoke('update_situation', { id, ...updates });

      set((state) => ({
        situations: state.situations.map((s) =>
          s.id === id ? { ...s, ...updates, updatedAt: new Date() } : s
        ),
        currentSituation:
          state.currentSituation?.id === id
            ? { ...state.currentSituation, ...updates, updatedAt: new Date() }
            : state.currentSituation,
        isLoading: false,
      }));
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to update situation',
        isLoading: false,
      });
      throw error;
    }
  },

  // Delete a situation
  deleteSituation: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      await invoke('delete_situation', { id });

      set((state) => ({
        situations: state.situations.filter((s) => s.id !== id),
        currentSituation: state.currentSituation?.id === id ? null : state.currentSituation,
        isLoading: false,
      }));
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to delete situation',
        isLoading: false,
      });
      throw error;
    }
  },

  // Set filter
  setFilter: (filter: SituationStatus | 'all') => {
    set({ filter });
    get().loadSituations();
  },

  // Generate brief for a situation
  generateBrief: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      const brief = await invoke<SituationBrief>('generate_brief', { id });

      // Parse dates
      const parsed: SituationBrief = {
        ...brief,
        generatedAt: new Date(brief.generatedAt),
        timeline: brief.timeline.map((e) => ({ ...e, timestamp: new Date(e.timestamp) })),
        unresolvedItems: brief.unresolvedItems.map((item) => ({
          ...item,
          raisedAt: new Date(item.raisedAt),
        })),
      };

      set({ currentBrief: parsed, isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to generate brief',
        isLoading: false,
      });
    }
  },

  // Clear error
  clearError: () => set({ error: null }),

  // Add participant
  addParticipant: async (situationId: string, participant: Omit<Participant, 'id'>) => {
    set({ isLoading: true, error: null });
    try {
      const newParticipant = await invoke<Participant>('add_participant', {
        situationId,
        ...participant,
      });

      set((state) => {
        if (state.currentSituation?.id === situationId) {
          return {
            currentSituation: {
              ...state.currentSituation,
              participants: [...state.currentSituation.participants, newParticipant],
            },
            isLoading: false,
          };
        }
        return { isLoading: false };
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to add participant',
        isLoading: false,
      });
      throw error;
    }
  },

  // Remove participant
  removeParticipant: async (participantId: string) => {
    set({ isLoading: true, error: null });
    try {
      await invoke('remove_participant', { id: participantId });

      set((state) => {
        if (state.currentSituation) {
          return {
            currentSituation: {
              ...state.currentSituation,
              participants: state.currentSituation.participants.filter(
                (p) => p.id !== participantId
              ),
            },
            isLoading: false,
          };
        }
        return { isLoading: false };
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to remove participant',
        isLoading: false,
      });
      throw error;
    }
  },
}));

// ============================================================================
// Helper Functions
// ============================================================================

function parseSituation(situation: Situation): Situation {
  return {
    ...situation,
    createdAt: new Date(situation.createdAt),
    updatedAt: new Date(situation.updatedAt),
    communications: situation.communications?.map(parseComm) || [],
    analysis: situation.analysis
      ? {
          ...situation.analysis,
          generatedAt: new Date(situation.analysis.generatedAt),
          toneTrajectory: situation.analysis.toneTrajectory?.map((t) => ({
            ...t,
            timestamp: new Date(t.timestamp),
          })) || [],
          unresolvedThreads: situation.analysis.unresolvedThreads?.map((u) => ({
            ...u,
            raisedAt: new Date(u.raisedAt),
          })) || [],
        }
      : undefined,
  };
}

function parseComm(comm: Communication): Communication {
  return {
    ...comm,
    timestamp: new Date(comm.timestamp),
  };
}

export default useSituationStore;
