// Sidecar - Main App Component
import { useState, useEffect } from 'react';
import { SituationList } from './components/SituationList';
import { SituationDetail } from './components/SituationDetail';
import { useIntegrationStore } from './stores/integrationStore';
import type { Situation } from '../shared/types';
import './App.css';

type View = 'situations' | 'settings';

function App() {
  const [view, setView] = useState<View>('situations');
  const [selectedSituation, setSelectedSituation] = useState<Situation | null>(null);
  const { slack, gmail, zoom, checkIntegrations, connectSlack, disconnectSlack } = useIntegrationStore();

  useEffect(() => {
    checkIntegrations();
  }, [checkIntegrations]);

  const handleSelectSituation = (situation: Situation) => {
    setSelectedSituation(situation);
  };

  return (
    <div className="app">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1 className="app-title">Sidecar</h1>
          <span className="app-subtitle">AI Communication Assistant</span>
        </div>

        <nav className="sidebar-nav">
          <button
            className={`nav-item ${view === 'situations' ? 'active' : ''}`}
            onClick={() => setView('situations')}
          >
            <span className="nav-icon">📋</span>
            <span>Situations</span>
          </button>
          <button
            className={`nav-item ${view === 'settings' ? 'active' : ''}`}
            onClick={() => setView('settings')}
          >
            <span className="nav-icon">⚙️</span>
            <span>Settings</span>
          </button>
        </nav>

        <div className="sidebar-integrations">
          <h3>Integrations</h3>
          <div className="integration-status">
            <div className="integration-item">
              <span className="integration-icon">💬</span>
              <span className="integration-name">Slack</span>
              {slack.connected ? (
                <button className="btn-disconnect" onClick={disconnectSlack}>
                  Disconnect
                </button>
              ) : (
                <button className="btn-connect" onClick={connectSlack}>
                  Connect
                </button>
              )}
              <span className={`status-dot ${slack.connected ? 'connected' : ''}`} />
            </div>
            <div className="integration-item">
              <span className="integration-icon">📧</span>
              <span className="integration-name">Gmail</span>
              <span className="coming-soon">Coming Soon</span>
              <span className={`status-dot ${gmail.connected ? 'connected' : ''}`} />
            </div>
            <div className="integration-item">
              <span className="integration-icon">📹</span>
              <span className="integration-name">Zoom</span>
              <span className="coming-soon">Coming Soon</span>
              <span className={`status-dot ${zoom.connected ? 'connected' : ''}`} />
            </div>
          </div>
        </div>

        <div className="sidebar-footer">
          <div className="llm-status">
            <span className="status-dot connected" />
            <span>Local LLM: Ready</span>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="main-content">
        {view === 'situations' && (
          <div className="situations-view">
            <div className="situations-list-panel">
              <SituationList
                onSelect={handleSelectSituation}
                selectedId={selectedSituation?.id}
              />
            </div>
            <div className="situation-detail-panel">
              {selectedSituation ? (
                <SituationDetail situationId={selectedSituation.id} />
              ) : (
                <div className="no-selection">
                  <div className="empty-icon">📋</div>
                  <h2>Select a Situation</h2>
                  <p>
                    Choose a situation from the list to view details, or create a new one to start
                    tracking.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {view === 'settings' && (
          <div className="settings-view">
            <div className="settings-content">
              <h2>Settings</h2>

              <section className="settings-section">
                <h3>Local LLM (Ollama)</h3>
                <div className="setting-item">
                  <label>Endpoint</label>
                  <input type="text" defaultValue="http://localhost:11434" />
                </div>
                <div className="setting-item">
                  <label>Model</label>
                  <select defaultValue="llama3:8b">
                    <option value="llama3:8b">Llama 3 8B</option>
                    <option value="llama3:70b">Llama 3 70B</option>
                    <option value="mistral">Mistral</option>
                    <option value="mixtral">Mixtral</option>
                  </select>
                </div>
                <p className="setting-hint">
                  Ollama is used for sensitive analysis that stays on your device.
                </p>
              </section>

              <section className="settings-section">
                <h3>Cloud LLM (Claude)</h3>
                <div className="setting-item">
                  <label>
                    <input type="checkbox" /> Enable Cloud Analysis
                  </label>
                </div>
                <div className="setting-item">
                  <label>API Key</label>
                  <input type="password" placeholder="sk-ant-..." />
                </div>
                <p className="setting-hint">
                  Claude is used for complex reasoning on anonymized data only. Your raw
                  communications never leave your device.
                </p>
              </section>

              <section className="settings-section">
                <h3>Appearance</h3>
                <div className="setting-item">
                  <label>Theme</label>
                  <select defaultValue="system">
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                    <option value="system">System</option>
                  </select>
                </div>
              </section>

              <section className="settings-section">
                <h3>Data & Privacy</h3>
                <div className="setting-item">
                  <button className="btn-secondary">Export All Data</button>
                </div>
                <div className="setting-item">
                  <button className="btn-danger">Delete All Data</button>
                </div>
                <p className="setting-hint">
                  All data is stored locally with AES-256 encryption. Nothing is sent to external
                  servers without explicit action and anonymization.
                </p>
              </section>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
