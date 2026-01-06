// StakeholderMap Component - Visualizes participants and their analysis
import type { Participant, StakeholderAnalysis } from '../../shared/types';
import './StakeholderMap.css';

interface StakeholderMapProps {
  participants: Participant[];
  analysis?: StakeholderAnalysis[];
}

export function StakeholderMap({ participants, analysis }: StakeholderMapProps) {
  // Create a map for quick lookup of analysis by participant ID
  const analysisMap = new Map(analysis?.map((a) => [a.participantId, a]) || []);

  if (participants.length === 0) {
    return (
      <div className="stakeholder-map empty">
        <p>No stakeholders added yet.</p>
        <p className="hint">
          Add participants to this situation to see their analysis and relationships.
        </p>
      </div>
    );
  }

  const getEngagementColor = (level: string) => {
    switch (level) {
      case 'high':
        return 'engagement-high';
      case 'medium':
        return 'engagement-medium';
      case 'low':
        return 'engagement-low';
      default:
        return '';
    }
  };

  return (
    <div className="stakeholder-map">
      <div className="stakeholder-grid">
        {participants.map((participant) => {
          const stakeholderAnalysis = analysisMap.get(participant.id);

          return (
            <div key={participant.id} className="stakeholder-card">
              <div className="stakeholder-header">
                <div className="avatar">
                  {participant.name
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase()}
                </div>
                <div className="stakeholder-info">
                  <h3>{participant.name}</h3>
                  {participant.role && <span className="role">{participant.role}</span>}
                </div>
              </div>

              {participant.email && <div className="email">{participant.email}</div>}

              {stakeholderAnalysis ? (
                <div className="analysis-section">
                  <div className="analysis-item">
                    <label>Stated Position</label>
                    <p>{stakeholderAnalysis.statedPosition || 'Not analyzed'}</p>
                  </div>

                  <div className="analysis-item">
                    <label>Inferred Intent</label>
                    <p className="intent">{stakeholderAnalysis.inferredIntent || 'Not analyzed'}</p>
                  </div>

                  <div className="analysis-item">
                    <label>Communication Style</label>
                    <p>{stakeholderAnalysis.communicationStyle || 'Not analyzed'}</p>
                  </div>

                  <div className="engagement-badge">
                    <span
                      className={`badge ${getEngagementColor(stakeholderAnalysis.engagementLevel)}`}
                    >
                      {stakeholderAnalysis.engagementLevel} engagement
                    </span>
                  </div>
                </div>
              ) : (
                <div className="no-analysis">
                  <p>Analysis not yet available</p>
                  <p className="hint">Generate a brief to analyze this stakeholder.</p>
                </div>
              )}

              {/* Manual notes */}
              {(participant.statedPosition || participant.inferredIntent) && !stakeholderAnalysis && (
                <div className="manual-notes">
                  {participant.statedPosition && (
                    <div className="analysis-item">
                      <label>Notes: Stated Position</label>
                      <p>{participant.statedPosition}</p>
                    </div>
                  )}
                  {participant.inferredIntent && (
                    <div className="analysis-item">
                      <label>Notes: Inferred Intent</label>
                      <p>{participant.inferredIntent}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="legend">
        <h4>Engagement Levels</h4>
        <div className="legend-items">
          <span className="legend-item">
            <span className="dot engagement-high"></span>
            High - Frequent, detailed responses
          </span>
          <span className="legend-item">
            <span className="dot engagement-medium"></span>
            Medium - Regular participation
          </span>
          <span className="legend-item">
            <span className="dot engagement-low"></span>
            Low - Minimal or delayed responses
          </span>
        </div>
      </div>
    </div>
  );
}

export default StakeholderMap;
