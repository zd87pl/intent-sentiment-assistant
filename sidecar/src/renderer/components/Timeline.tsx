// Timeline Component - Shows communication history with tone indicators
import { useState, useMemo } from 'react';
import type { Communication, Participant, ToneDataPoint } from '../../shared/types';
import './Timeline.css';

interface TimelineProps {
  communications: Communication[];
  participants: Participant[];
  toneData?: ToneDataPoint[];
}

export function Timeline({ communications, participants, toneData }: TimelineProps) {
  const [filter, setFilter] = useState<'all' | 'slack' | 'gmail' | 'zoom'>('all');
  const [showTone, setShowTone] = useState(true);

  // Create participant lookup map
  const participantMap = useMemo(
    () => new Map(participants.map((p) => [p.id, p])),
    [participants]
  );

  // Create tone data lookup map by timestamp
  const toneMap = useMemo(() => {
    const map = new Map<string, ToneDataPoint>();
    toneData?.forEach((t) => {
      // Use timestamp + participant as key for lookup
      const key = `${t.timestamp.toISOString()}_${t.participant}`;
      map.set(key, t);
    });
    return map;
  }, [toneData]);

  // Filter and sort communications
  const filteredComms = useMemo(() => {
    let comms = [...communications];
    if (filter !== 'all') {
      comms = comms.filter((c) => c.source === filter);
    }
    return comms.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }, [communications, filter]);

  // Group communications by date
  const groupedByDate = useMemo(() => {
    const groups = new Map<string, Communication[]>();
    filteredComms.forEach((comm) => {
      const dateKey = comm.timestamp.toLocaleDateString();
      const existing = groups.get(dateKey) || [];
      groups.set(dateKey, [...existing, comm]);
    });
    return groups;
  }, [filteredComms]);

  const getSourceIcon = (source: string) => {
    switch (source) {
      case 'slack':
        return '💬';
      case 'gmail':
        return '📧';
      case 'zoom':
        return '📹';
      default:
        return '📝';
    }
  };

  const getParticipantName = (id: string) => {
    return participantMap.get(id)?.name || 'Unknown';
  };

  const getSentimentColor = (sentiment: number) => {
    if (sentiment > 0.3) return 'tone-positive';
    if (sentiment < -0.3) return 'tone-negative';
    return 'tone-neutral';
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (communications.length === 0) {
    return (
      <div className="timeline empty">
        <p>No communications yet.</p>
        <p className="hint">
          Link Slack conversations, emails, or meeting recordings to see them here.
        </p>
      </div>
    );
  }

  return (
    <div className="timeline">
      {/* Filters */}
      <div className="timeline-controls">
        <div className="filter-group">
          <button
            className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All ({communications.length})
          </button>
          <button
            className={`filter-btn ${filter === 'slack' ? 'active' : ''}`}
            onClick={() => setFilter('slack')}
          >
            💬 Slack ({communications.filter((c) => c.source === 'slack').length})
          </button>
          <button
            className={`filter-btn ${filter === 'gmail' ? 'active' : ''}`}
            onClick={() => setFilter('gmail')}
          >
            📧 Gmail ({communications.filter((c) => c.source === 'gmail').length})
          </button>
          <button
            className={`filter-btn ${filter === 'zoom' ? 'active' : ''}`}
            onClick={() => setFilter('zoom')}
          >
            📹 Zoom ({communications.filter((c) => c.source === 'zoom').length})
          </button>
        </div>

        <label className="toggle">
          <input
            type="checkbox"
            checked={showTone}
            onChange={(e) => setShowTone(e.target.checked)}
          />
          <span>Show tone indicators</span>
        </label>
      </div>

      {/* Tone trajectory summary */}
      {showTone && toneData && toneData.length > 0 && (
        <div className="tone-summary">
          <h4>Tone Trajectory</h4>
          <div className="tone-chart">
            {toneData.slice(-20).map((point, i) => (
              <div
                key={i}
                className={`tone-bar ${getSentimentColor(point.sentiment)}`}
                style={{ height: `${Math.abs(point.sentiment) * 100}%` }}
                title={`${getParticipantName(point.participant)}: ${point.sentiment.toFixed(2)} (${point.markers.join(', ')})`}
              />
            ))}
          </div>
          <div className="tone-legend">
            <span className="tone-positive">Positive</span>
            <span className="tone-neutral">Neutral</span>
            <span className="tone-negative">Negative</span>
          </div>
        </div>
      )}

      {/* Communications list */}
      <div className="timeline-content">
        {Array.from(groupedByDate.entries()).map(([date, comms]) => (
          <div key={date} className="date-group">
            <div className="date-header">{date}</div>
            <div className="communications">
              {comms.map((comm) => (
                <div key={comm.id} className="communication-item">
                  <div className="comm-icon">{getSourceIcon(comm.source)}</div>
                  <div className="comm-content">
                    <div className="comm-header">
                      <span className="comm-participants">
                        {comm.participants.map(getParticipantName).join(', ')}
                      </span>
                      <span className="comm-time">{formatTime(comm.timestamp)}</span>
                    </div>

                    <div className="comm-meta">
                      {comm.metadata.channel && (
                        <span className="meta-tag">#{comm.metadata.channel}</span>
                      )}
                      {comm.metadata.subject && (
                        <span className="meta-tag">{comm.metadata.subject}</span>
                      )}
                      {comm.metadata.threadId && <span className="meta-tag">Thread</span>}
                      {comm.metadata.duration && (
                        <span className="meta-tag">
                          {Math.round(comm.metadata.duration / 60)} min
                        </span>
                      )}
                    </div>

                    {/* Tone indicator for this communication */}
                    {showTone && toneData && (
                      <div className="comm-tone">
                        {comm.participants.map((pId) => {
                          const tone = toneData.find(
                            (t) =>
                              t.participant === pId &&
                              Math.abs(t.timestamp.getTime() - comm.timestamp.getTime()) < 60000
                          );
                          if (!tone) return null;
                          return (
                            <span
                              key={pId}
                              className={`tone-indicator ${getSentimentColor(tone.sentiment)}`}
                              title={tone.markers.join(', ')}
                            >
                              {tone.sentiment > 0 ? '↑' : tone.sentiment < 0 ? '↓' : '→'}
                              {tone.markers[0] || ''}
                            </span>
                          );
                        })}
                      </div>
                    )}

                    {/* Content preview - would show decrypted content */}
                    <div className="comm-preview">
                      <em>Content encrypted - click to view</em>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default Timeline;
