// SituationList Component - Shows all situations with filtering
import { useEffect, useState } from 'react';
import { useSituationStore } from '../stores/situationStore';
import type { Situation, SituationStatus } from '../../shared/types';
import './SituationList.css';

interface SituationListProps {
  onSelect: (situation: Situation) => void;
  selectedId?: string;
}

export function SituationList({ onSelect, selectedId }: SituationListProps) {
  const { situations, isLoading, error, filter, loadSituations, setFilter, createSituation } =
    useSituationStore();
  const [showNewForm, setShowNewForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');

  useEffect(() => {
    loadSituations();
  }, [loadSituations]);

  const handleCreate = async () => {
    if (!newTitle.trim()) return;

    try {
      const situation = await createSituation(newTitle.trim(), newDescription.trim());
      setNewTitle('');
      setNewDescription('');
      setShowNewForm(false);
      onSelect(situation);
    } catch {
      // Error is handled by store
    }
  };

  const getStatusColor = (status: SituationStatus): string => {
    switch (status) {
      case 'active':
        return 'status-active';
      case 'monitoring':
        return 'status-monitoring';
      case 'resolved':
        return 'status-resolved';
      default:
        return 'status-active';
    }
  };

  const getStatusLabel = (status: SituationStatus): string => {
    switch (status) {
      case 'active':
        return 'Active';
      case 'monitoring':
        return 'Monitoring';
      case 'resolved':
        return 'Resolved';
      default:
        return status;
    }
  };

  const formatDate = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return 'Today';
    } else if (days === 1) {
      return 'Yesterday';
    } else if (days < 7) {
      return `${days} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  return (
    <div className="situation-list">
      <div className="situation-list-header">
        <h2>Situations</h2>
        <button className="btn-primary" onClick={() => setShowNewForm(true)}>
          + New
        </button>
      </div>

      {/* Filter tabs */}
      <div className="filter-tabs">
        <button
          className={`filter-tab ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
        >
          All
        </button>
        <button
          className={`filter-tab ${filter === 'active' ? 'active' : ''}`}
          onClick={() => setFilter('active')}
        >
          Active
        </button>
        <button
          className={`filter-tab ${filter === 'monitoring' ? 'active' : ''}`}
          onClick={() => setFilter('monitoring')}
        >
          Monitoring
        </button>
        <button
          className={`filter-tab ${filter === 'resolved' ? 'active' : ''}`}
          onClick={() => setFilter('resolved')}
        >
          Resolved
        </button>
      </div>

      {/* New situation form */}
      {showNewForm && (
        <div className="new-situation-form">
          <input
            type="text"
            placeholder="Situation title..."
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            autoFocus
          />
          <textarea
            placeholder="Brief description (optional)..."
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            rows={2}
          />
          <div className="form-actions">
            <button className="btn-secondary" onClick={() => setShowNewForm(false)}>
              Cancel
            </button>
            <button className="btn-primary" onClick={handleCreate} disabled={!newTitle.trim()}>
              Create
            </button>
          </div>
        </div>
      )}

      {/* Error message */}
      {error && <div className="error-message">{error}</div>}

      {/* Loading state */}
      {isLoading && situations.length === 0 && (
        <div className="loading-state">Loading situations...</div>
      )}

      {/* Empty state */}
      {!isLoading && situations.length === 0 && (
        <div className="empty-state">
          <p>No situations yet</p>
          <p className="hint">Create your first situation to start tracking a workplace issue.</p>
        </div>
      )}

      {/* Situation list */}
      <div className="situation-items">
        {situations.map((situation) => (
          <div
            key={situation.id}
            className={`situation-item ${selectedId === situation.id ? 'selected' : ''}`}
            onClick={() => onSelect(situation)}
          >
            <div className="situation-item-header">
              <span className={`status-badge ${getStatusColor(situation.status)}`}>
                {getStatusLabel(situation.status)}
              </span>
              <span className="situation-date">{formatDate(situation.updatedAt)}</span>
            </div>
            <h3 className="situation-title">{situation.title}</h3>
            {situation.description && (
              <p className="situation-description">{situation.description}</p>
            )}
            <div className="situation-meta">
              <span>{situation.participants?.length || 0} participants</span>
              <span>{situation.communications?.length || 0} messages</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default SituationList;
