// Brief Component - Shows the situation brief summary
import type { SituationBrief } from '../../shared/types';
import './Brief.css';

interface BriefProps {
  brief: SituationBrief | null;
  onGenerate: () => void;
  isLoading: boolean;
}

export function Brief({ brief, onGenerate, isLoading }: BriefProps) {
  if (!brief) {
    return (
      <div className="brief empty">
        <div className="empty-state">
          <div className="empty-icon">📋</div>
          <h3>No Brief Generated</h3>
          <p>
            Generate a brief to get an AI-powered summary of this situation, including stakeholder
            analysis, suggested actions, and risk assessment.
          </p>
          <button className="btn-primary" onClick={onGenerate} disabled={isLoading}>
            {isLoading ? 'Generating...' : 'Generate Brief'}
          </button>
        </div>
      </div>
    );
  }

  const formatDate = (date: Date) => {
    return date.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="brief">
      <div className="brief-header">
        <h2>Situation Brief: {brief.title}</h2>
        <div className="brief-meta">
          <span className={`risk-badge risk-${brief.riskLevel}`}>
            {brief.riskLevel.toUpperCase()} RISK
          </span>
          <span className="generated-at">Generated: {formatDate(brief.generatedAt)}</span>
          <button className="btn-secondary btn-sm" onClick={onGenerate} disabled={isLoading}>
            {isLoading ? 'Regenerating...' : '🔄 Regenerate'}
          </button>
        </div>
      </div>

      {/* Executive Summary */}
      <section className="brief-section">
        <h3>Executive Summary</h3>
        <div className="summary-box">{brief.summary}</div>
      </section>

      {/* Stakeholder View */}
      <section className="brief-section">
        <h3>Stakeholder Analysis</h3>
        <div className="stakeholder-briefs">
          {brief.stakeholders.map((s, i) => (
            <div key={i} className="stakeholder-brief">
              <div className="stakeholder-header">
                <strong>{s.name}</strong>
                <span className="role">{s.role}</span>
                <span className={`tone-badge tone-${s.recentTone}`}>{s.recentTone}</span>
              </div>
              <div className="stakeholder-stance">
                <label>Current Stance:</label>
                <p>{s.currentStance}</p>
              </div>
              {s.keyPoints.length > 0 && (
                <div className="key-points">
                  <label>Key Points:</label>
                  <ul>
                    {s.keyPoints.map((point, j) => (
                      <li key={j}>{point}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="suggested-approach">
                <label>Suggested Approach:</label>
                <p className="approach">{s.suggestedApproach}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Unresolved Items */}
      {brief.unresolvedItems.length > 0 && (
        <section className="brief-section">
          <h3>Unresolved Items</h3>
          <div className="unresolved-list">
            {brief.unresolvedItems.map((item, i) => (
              <div key={i} className="unresolved-item">
                <span className={`type-badge type-${item.type}`}>{item.type}</span>
                <p>{item.description}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Suggested Next Steps */}
      <section className="brief-section">
        <h3>Suggested Next Steps</h3>
        <div className="actions-list">
          {brief.suggestedNextSteps.map((action, i) => (
            <div key={i} className="action-item">
              <div className="action-header">
                <span className="priority">#{action.priority}</span>
                <span className="action-text">{action.action}</span>
              </div>
              <p className="rationale">{action.rationale}</p>
              {action.suggestedQuestions && action.suggestedQuestions.length > 0 && (
                <div className="questions">
                  <label>Questions to ask:</label>
                  <ul>
                    {action.suggestedQuestions.map((q, j) => (
                      <li key={j}>"{q}"</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Top Risks */}
      {brief.topRisks.length > 0 && (
        <section className="brief-section">
          <h3>Risk Assessment</h3>
          <div className="risks-list">
            {brief.topRisks.map((risk, i) => (
              <div key={i} className={`risk-item risk-${risk.severity}`}>
                <div className="risk-header">
                  <span className="risk-type">{risk.type}</span>
                  <span className={`severity-badge severity-${risk.severity}`}>
                    {risk.severity}
                  </span>
                </div>
                <p>{risk.description}</p>
                {risk.evidence.length > 0 && (
                  <div className="evidence">
                    <label>Evidence:</label>
                    <ul>
                      {risk.evidence.map((e, j) => (
                        <li key={j}>{e}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Related Situations */}
      {brief.relatedSituations.length > 0 && (
        <section className="brief-section">
          <h3>Related Situations</h3>
          <div className="related-list">
            {brief.relatedSituations.map((related, i) => (
              <div key={i} className="related-item">
                <div className="related-header">
                  <strong>{related.title}</strong>
                  <span className={`status-badge status-${related.status}`}>{related.status}</span>
                </div>
                <p className="connection-reason">{related.connectionReason}</p>
                {related.sharedParticipants.length > 0 && (
                  <span className="shared-participants">
                    Shared: {related.sharedParticipants.join(', ')}
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Timeline Events */}
      {brief.timeline.length > 0 && (
        <section className="brief-section">
          <h3>Recent Activity</h3>
          <div className="timeline-brief">
            {brief.timeline.slice(0, 10).map((event, i) => (
              <div key={i} className="timeline-event">
                <span className="event-time">{formatDate(event.timestamp)}</span>
                <span className="event-type">{event.type}</span>
                <span className="event-summary">{event.summary}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export default Brief;
