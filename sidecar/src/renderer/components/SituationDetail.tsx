// SituationDetail Component - Shows full situation details with tabs
import { useState, useEffect } from 'react';
import { useSituationStore } from '../stores/situationStore';
import { StakeholderMap } from './StakeholderMap';
import { Timeline } from './Timeline';
import { Brief } from './Brief';
import type { Situation, SituationStatus, Participant } from '../../shared/types';
import './SituationDetail.css';

interface SituationDetailProps {
  situationId: string;
}

type Tab = 'overview' | 'stakeholders' | 'timeline' | 'brief';

export function SituationDetail({ situationId }: SituationDetailProps) {
  const {
    currentSituation,
    currentBrief,
    isLoading,
    error,
    loadSituation,
    updateSituation,
    generateBrief,
    addParticipant,
    removeParticipant,
  } = useSituationStore();

  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [showAddParticipant, setShowAddParticipant] = useState(false);
  const [newParticipant, setNewParticipant] = useState({ name: '', email: '', role: '' });

  useEffect(() => {
    loadSituation(situationId);
  }, [situationId, loadSituation]);

  useEffect(() => {
    if (currentSituation) {
      setEditTitle(currentSituation.title);
      setEditDescription(currentSituation.description);
    }
  }, [currentSituation]);

  if (!currentSituation) {
    return (
      <div className="situation-detail empty">
        {isLoading ? (
          <p>Loading...</p>
        ) : error ? (
          <p className="error">{error}</p>
        ) : (
          <p>Situation not found</p>
        )}
      </div>
    );
  }

  const handleSaveEdit = async () => {
    await updateSituation(situationId, {
      title: editTitle,
      description: editDescription,
    });
    setIsEditing(false);
  };

  const handleStatusChange = async (status: SituationStatus) => {
    await updateSituation(situationId, { status });
  };

  const handleAddParticipant = async () => {
    if (!newParticipant.name.trim()) return;

    await addParticipant(situationId, {
      name: newParticipant.name.trim(),
      email: newParticipant.email.trim() || undefined,
      role: newParticipant.role.trim() || undefined,
    });

    setNewParticipant({ name: '', email: '', role: '' });
    setShowAddParticipant(false);
  };

  const handleRemoveParticipant = async (participantId: string) => {
    if (confirm('Remove this participant from the situation?')) {
      await removeParticipant(participantId);
    }
  };

  const handleGenerateBrief = async () => {
    await generateBrief(situationId);
    setActiveTab('brief');
  };

  return (
    <div className="situation-detail">
      {/* Header */}
      <div className="detail-header">
        {isEditing ? (
          <div className="edit-form">
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="edit-title"
              autoFocus
            />
            <textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              className="edit-description"
              placeholder="Description..."
              rows={2}
            />
            <div className="edit-actions">
              <button className="btn-secondary" onClick={() => setIsEditing(false)}>
                Cancel
              </button>
              <button className="btn-primary" onClick={handleSaveEdit}>
                Save
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="header-top">
              <h1>{currentSituation.title}</h1>
              <button className="btn-icon" onClick={() => setIsEditing(true)} title="Edit">
                ✏️
              </button>
            </div>
            {currentSituation.description && (
              <p className="description">{currentSituation.description}</p>
            )}
            <div className="header-meta">
              <div className="status-selector">
                <label>Status:</label>
                <select
                  value={currentSituation.status}
                  onChange={(e) => handleStatusChange(e.target.value as SituationStatus)}
                >
                  <option value="active">Active</option>
                  <option value="monitoring">Monitoring</option>
                  <option value="resolved">Resolved</option>
                </select>
              </div>
              <span className="meta-item">
                Created: {currentSituation.createdAt.toLocaleDateString()}
              </span>
              <span className="meta-item">
                Updated: {currentSituation.updatedAt.toLocaleDateString()}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Action buttons */}
      <div className="action-bar">
        <button className="btn-primary" onClick={handleGenerateBrief} disabled={isLoading}>
          {isLoading ? 'Generating...' : '📋 Generate Brief'}
        </button>
        <button className="btn-secondary" onClick={() => setShowAddParticipant(true)}>
          + Add Participant
        </button>
      </div>

      {/* Tabs */}
      <div className="detail-tabs">
        <button
          className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          className={`tab ${activeTab === 'stakeholders' ? 'active' : ''}`}
          onClick={() => setActiveTab('stakeholders')}
        >
          Stakeholders ({currentSituation.participants.length})
        </button>
        <button
          className={`tab ${activeTab === 'timeline' ? 'active' : ''}`}
          onClick={() => setActiveTab('timeline')}
        >
          Timeline ({currentSituation.communications.length})
        </button>
        <button
          className={`tab ${activeTab === 'brief' ? 'active' : ''}`}
          onClick={() => setActiveTab('brief')}
        >
          Brief {currentBrief ? '✓' : ''}
        </button>
      </div>

      {/* Tab content */}
      <div className="tab-content">
        {activeTab === 'overview' && (
          <div className="overview-content">
            {/* Participants summary */}
            <section className="section">
              <h3>Participants</h3>
              {currentSituation.participants.length === 0 ? (
                <p className="empty-hint">No participants added yet.</p>
              ) : (
                <div className="participants-grid">
                  {currentSituation.participants.map((p) => (
                    <div key={p.id} className="participant-card">
                      <div className="participant-name">{p.name}</div>
                      {p.role && <div className="participant-role">{p.role}</div>}
                      <button
                        className="btn-remove"
                        onClick={() => handleRemoveParticipant(p.id)}
                        title="Remove"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Analysis summary */}
            {currentSituation.analysis && (
              <section className="section">
                <h3>Latest Analysis</h3>
                <p className="analysis-date">
                  Generated: {currentSituation.analysis.generatedAt.toLocaleString()}
                </p>
                <div className="analysis-summary">{currentSituation.analysis.summary}</div>

                {currentSituation.analysis.riskSignals.length > 0 && (
                  <div className="risk-signals">
                    <h4>Risk Signals</h4>
                    {currentSituation.analysis.riskSignals.map((risk, i) => (
                      <div key={i} className={`risk-item risk-${risk.severity}`}>
                        <span className="risk-type">{risk.type}</span>
                        <span className="risk-description">{risk.description}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>
        )}

        {activeTab === 'stakeholders' && (
          <StakeholderMap
            participants={currentSituation.participants}
            analysis={currentSituation.analysis?.stakeholderAnalysis}
          />
        )}

        {activeTab === 'timeline' && (
          <Timeline
            communications={currentSituation.communications}
            participants={currentSituation.participants}
            toneData={currentSituation.analysis?.toneTrajectory}
          />
        )}

        {activeTab === 'brief' && (
          <Brief brief={currentBrief} onGenerate={handleGenerateBrief} isLoading={isLoading} />
        )}
      </div>

      {/* Add participant modal */}
      {showAddParticipant && (
        <div className="modal-overlay" onClick={() => setShowAddParticipant(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Add Participant</h3>
            <div className="form-group">
              <label>Name *</label>
              <input
                type="text"
                value={newParticipant.name}
                onChange={(e) => setNewParticipant({ ...newParticipant, name: e.target.value })}
                placeholder="John Smith"
                autoFocus
              />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                value={newParticipant.email}
                onChange={(e) => setNewParticipant({ ...newParticipant, email: e.target.value })}
                placeholder="john@company.com"
              />
            </div>
            <div className="form-group">
              <label>Role in Situation</label>
              <input
                type="text"
                value={newParticipant.role}
                onChange={(e) => setNewParticipant({ ...newParticipant, role: e.target.value })}
                placeholder="e.g., Tech Lead, Stakeholder, PM"
              />
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowAddParticipant(false)}>
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={handleAddParticipant}
                disabled={!newParticipant.name.trim()}
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SituationDetail;
