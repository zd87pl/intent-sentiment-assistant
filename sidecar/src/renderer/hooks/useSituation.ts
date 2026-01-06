// Custom hooks for situation management
import { useCallback, useEffect } from 'react';
import { useSituationStore } from '../stores/situationStore';
import type { SituationStatus } from '../../shared/types';

/**
 * Hook to load and manage a single situation
 */
export function useSituation(situationId: string | undefined) {
  const {
    currentSituation,
    isLoading,
    error,
    loadSituation,
    updateSituation,
    deleteSituation,
    generateBrief,
    currentBrief,
  } = useSituationStore();

  useEffect(() => {
    if (situationId) {
      loadSituation(situationId);
    }
  }, [situationId, loadSituation]);

  const update = useCallback(
    async (updates: { title?: string; description?: string; status?: SituationStatus }) => {
      if (!situationId) return;
      await updateSituation(situationId, updates);
    },
    [situationId, updateSituation]
  );

  const remove = useCallback(async () => {
    if (!situationId) return;
    await deleteSituation(situationId);
  }, [situationId, deleteSituation]);

  const brief = useCallback(async () => {
    if (!situationId) return;
    await generateBrief(situationId);
  }, [situationId, generateBrief]);

  return {
    situation: currentSituation,
    brief: currentBrief,
    isLoading,
    error,
    update,
    remove,
    generateBrief: brief,
  };
}

/**
 * Hook to manage the situations list
 */
export function useSituationList() {
  const { situations, isLoading, error, filter, loadSituations, setFilter, createSituation } =
    useSituationStore();

  useEffect(() => {
    loadSituations();
  }, [loadSituations]);

  return {
    situations,
    isLoading,
    error,
    filter,
    setFilter,
    createSituation,
    refresh: loadSituations,
  };
}

export default { useSituation, useSituationList };
