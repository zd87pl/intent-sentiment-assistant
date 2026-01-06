// SQLite Schema for Sidecar
// Compatible with SQLCipher encryption

export const SCHEMA_VERSION = 1;

// ============================================================================
// Table Creation SQL
// ============================================================================

export const CREATE_TABLES_SQL = `
-- Schema version tracking
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Situations (case files)
CREATE TABLE IF NOT EXISTS situations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL CHECK (status IN ('active', 'monitoring', 'resolved')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_situations_status ON situations(status);
CREATE INDEX IF NOT EXISTS idx_situations_updated ON situations(updated_at DESC);

-- Participants (people involved in situations)
CREATE TABLE IF NOT EXISTS participants (
  id TEXT PRIMARY KEY,
  situation_id TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  slack_id TEXT,
  role TEXT,
  stated_position TEXT,
  inferred_intent TEXT,
  FOREIGN KEY (situation_id) REFERENCES situations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_participants_situation ON participants(situation_id);
CREATE INDEX IF NOT EXISTS idx_participants_slack ON participants(slack_id);
CREATE INDEX IF NOT EXISTS idx_participants_email ON participants(email);

-- Communications (messages, emails, meeting transcripts)
CREATE TABLE IF NOT EXISTS communications (
  id TEXT PRIMARY KEY,
  situation_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('slack', 'gmail', 'zoom')),
  source_id TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  participants TEXT NOT NULL, -- JSON array of participant IDs
  content_encrypted TEXT NOT NULL, -- Encrypted content
  metadata TEXT, -- JSON object with channel, subject, threadId, duration, etc.
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (situation_id) REFERENCES situations(id) ON DELETE CASCADE,
  UNIQUE(source, source_id)
);

CREATE INDEX IF NOT EXISTS idx_communications_situation ON communications(situation_id);
CREATE INDEX IF NOT EXISTS idx_communications_source ON communications(source);
CREATE INDEX IF NOT EXISTS idx_communications_timestamp ON communications(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_communications_source_id ON communications(source, source_id);

-- Analysis results
CREATE TABLE IF NOT EXISTS analyses (
  id TEXT PRIMARY KEY,
  situation_id TEXT NOT NULL,
  generated_at TEXT NOT NULL DEFAULT (datetime('now')),
  summary TEXT,
  stakeholder_analysis TEXT, -- JSON
  tone_trajectory TEXT, -- JSON
  unresolved_threads TEXT, -- JSON
  risk_signals TEXT, -- JSON
  suggested_actions TEXT, -- JSON
  related_situations TEXT, -- JSON array of situation IDs
  FOREIGN KEY (situation_id) REFERENCES situations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_analyses_situation ON analyses(situation_id);
CREATE INDEX IF NOT EXISTS idx_analyses_generated ON analyses(generated_at DESC);

-- Integration credentials (stored in keychain, this is just metadata)
CREATE TABLE IF NOT EXISTS integrations (
  type TEXT PRIMARY KEY CHECK (type IN ('slack', 'gmail', 'zoom')),
  connected_at TEXT,
  last_sync TEXT,
  metadata TEXT -- JSON with non-sensitive metadata
);

-- Settings
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Audit log for debugging and privacy compliance
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  details TEXT -- JSON
);

CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);
`;

// ============================================================================
// Default Settings
// ============================================================================

export const DEFAULT_SETTINGS = {
  local_llm_endpoint: 'http://localhost:11434',
  local_llm_model: 'llama3:8b',
  cloud_llm_enabled: 'false',
  theme: 'system',
  auto_refresh_interval: '0',
};

export const INSERT_DEFAULT_SETTINGS_SQL = `
INSERT OR IGNORE INTO settings (key, value) VALUES
  ('local_llm_endpoint', '${DEFAULT_SETTINGS.local_llm_endpoint}'),
  ('local_llm_model', '${DEFAULT_SETTINGS.local_llm_model}'),
  ('cloud_llm_enabled', '${DEFAULT_SETTINGS.cloud_llm_enabled}'),
  ('theme', '${DEFAULT_SETTINGS.theme}'),
  ('auto_refresh_interval', '${DEFAULT_SETTINGS.auto_refresh_interval}');
`;

// ============================================================================
// Migration SQL (for future schema updates)
// ============================================================================

export const MIGRATIONS: Record<number, string> = {
  // Version 1 is the initial schema
  1: `
    INSERT OR REPLACE INTO schema_version (version) VALUES (1);
  `,
  // Future migrations go here
  // 2: `ALTER TABLE situations ADD COLUMN priority TEXT;`,
};

// ============================================================================
// Helper Queries
// ============================================================================

export const QUERIES = {
  // Situations
  getSituation: `
    SELECT * FROM situations WHERE id = ?
  `,
  listSituations: `
    SELECT * FROM situations ORDER BY updated_at DESC
  `,
  listSituationsByStatus: `
    SELECT * FROM situations WHERE status = ? ORDER BY updated_at DESC
  `,
  createSituation: `
    INSERT INTO situations (id, title, description, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
  `,
  updateSituation: `
    UPDATE situations SET title = ?, description = ?, status = ?, updated_at = datetime('now')
    WHERE id = ?
  `,
  deleteSituation: `
    DELETE FROM situations WHERE id = ?
  `,

  // Participants
  getParticipantsBySituation: `
    SELECT * FROM participants WHERE situation_id = ?
  `,
  createParticipant: `
    INSERT INTO participants (id, situation_id, name, email, slack_id, role, stated_position, inferred_intent)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `,
  updateParticipant: `
    UPDATE participants
    SET name = ?, email = ?, slack_id = ?, role = ?, stated_position = ?, inferred_intent = ?
    WHERE id = ?
  `,
  deleteParticipant: `
    DELETE FROM participants WHERE id = ?
  `,

  // Communications
  getCommunicationsBySituation: `
    SELECT * FROM communications WHERE situation_id = ? ORDER BY timestamp DESC
  `,
  getCommunicationBySourceId: `
    SELECT * FROM communications WHERE source = ? AND source_id = ?
  `,
  createCommunication: `
    INSERT INTO communications (id, situation_id, source, source_id, timestamp, participants, content_encrypted, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `,
  deleteCommunication: `
    DELETE FROM communications WHERE id = ?
  `,

  // Analysis
  getLatestAnalysis: `
    SELECT * FROM analyses WHERE situation_id = ? ORDER BY generated_at DESC LIMIT 1
  `,
  createAnalysis: `
    INSERT INTO analyses (id, situation_id, summary, stakeholder_analysis, tone_trajectory, unresolved_threads, risk_signals, suggested_actions, related_situations)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,

  // Integrations
  getIntegration: `
    SELECT * FROM integrations WHERE type = ?
  `,
  listIntegrations: `
    SELECT * FROM integrations
  `,
  upsertIntegration: `
    INSERT INTO integrations (type, connected_at, last_sync, metadata)
    VALUES (?, datetime('now'), NULL, ?)
    ON CONFLICT(type) DO UPDATE SET
      connected_at = datetime('now'),
      metadata = excluded.metadata
  `,
  updateIntegrationSync: `
    UPDATE integrations SET last_sync = datetime('now') WHERE type = ?
  `,
  deleteIntegration: `
    DELETE FROM integrations WHERE type = ?
  `,

  // Settings
  getSetting: `
    SELECT value FROM settings WHERE key = ?
  `,
  getAllSettings: `
    SELECT key, value FROM settings
  `,
  setSetting: `
    INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `,

  // Audit
  logAudit: `
    INSERT INTO audit_log (action, entity_type, entity_id, details)
    VALUES (?, ?, ?, ?)
  `,
  getRecentAuditLogs: `
    SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT ?
  `,
};

export default {
  SCHEMA_VERSION,
  CREATE_TABLES_SQL,
  INSERT_DEFAULT_SETTINGS_SQL,
  MIGRATIONS,
  QUERIES,
  DEFAULT_SETTINGS,
};
