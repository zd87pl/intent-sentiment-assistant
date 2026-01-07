// Tests for situation store
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { useSituationStore } from './situationStore';

// Mock invoke
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

const mockInvoke = invoke as ReturnType<typeof vi.fn>;

describe('situationStore', () => {
  beforeEach(() => {
    // Reset store state
    useSituationStore.setState({
      situations: [],
      currentSituation: null,
      currentBrief: null,
      isLoading: false,
      error: null,
      filter: 'all',
    });

    // Reset mocks
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('should have empty initial state', () => {
      const state = useSituationStore.getState();

      expect(state.situations).toEqual([]);
      expect(state.currentSituation).toBeNull();
      expect(state.currentBrief).toBeNull();
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
      expect(state.filter).toBe('all');
    });
  });

  describe('setFilter', () => {
    it('should update filter state', () => {
      const { setFilter } = useSituationStore.getState();

      setFilter('active');
      expect(useSituationStore.getState().filter).toBe('active');

      setFilter('resolved');
      expect(useSituationStore.getState().filter).toBe('resolved');
    });
  });

  describe('loadSituations', () => {
    it('should set loading state while fetching', async () => {
      mockInvoke.mockImplementation(() => new Promise(() => {})); // Never resolves

      const { loadSituations } = useSituationStore.getState();
      loadSituations();

      expect(useSituationStore.getState().isLoading).toBe(true);
    });

    it('should populate situations on success', async () => {
      const mockSituations = [
        {
          id: 's-1',
          title: 'Test Situation',
          description: 'Test',
          status: 'active',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      ];

      mockInvoke.mockResolvedValueOnce(mockSituations);

      const { loadSituations } = useSituationStore.getState();
      await loadSituations();

      const state = useSituationStore.getState();
      expect(state.situations).toHaveLength(1);
      expect(state.situations[0].id).toBe('s-1');
      expect(state.isLoading).toBe(false);
    });

    it('should set error on failure', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('Database error'));

      const { loadSituations } = useSituationStore.getState();
      await loadSituations();

      const state = useSituationStore.getState();
      expect(state.error).toBe('Failed to load situations');
      expect(state.isLoading).toBe(false);
    });
  });

  describe('createSituation', () => {
    it('should create and return new situation', async () => {
      mockInvoke
        .mockResolvedValueOnce(undefined) // db_execute
        .mockResolvedValueOnce('new-id'); // generate_secure_id

      const { createSituation } = useSituationStore.getState();
      const situation = await createSituation('New Situation', 'Description');

      expect(situation.title).toBe('New Situation');
      expect(situation.description).toBe('Description');
      expect(situation.status).toBe('active');
    });
  });

  describe('filtered situations', () => {
    it('should filter situations by status', () => {
      // Populate situations
      useSituationStore.setState({
        situations: [
          {
            id: '1',
            title: 'Active',
            description: '',
            status: 'active',
            createdAt: new Date(),
            updatedAt: new Date(),
            participants: [],
            communications: [],
          },
          {
            id: '2',
            title: 'Resolved',
            description: '',
            status: 'resolved',
            createdAt: new Date(),
            updatedAt: new Date(),
            participants: [],
            communications: [],
          },
        ],
        filter: 'active',
      });

      const state = useSituationStore.getState();
      const filtered = state.situations.filter(
        (s) => state.filter === 'all' || s.status === state.filter
      );

      expect(filtered).toHaveLength(1);
      expect(filtered[0].status).toBe('active');
    });
  });
});
