// Database Service for Sidecar
// Provides high-level API for database operations

import { invoke } from '@tauri-apps/api/core';
import { QUERIES, CREATE_TABLES_SQL, INSERT_DEFAULT_SETTINGS_SQL, SCHEMA_VERSION, MIGRATIONS } from './schema';
import { encryptForStorage, decryptFromStorage, generateSecureId, initializeEncryptedDatabase } from './encryption';
import type {
  Situation,
  SituationDTO,
  SituationStatus,
  Participant,
  ParticipantDTO,
  Communication,
  CommunicationDTO,
  SituationAnalysis,
  AnalysisDTO,
  AppSettings,
} from '../../shared/types';

// ============================================================================
// Database Initialization
// ============================================================================

let isInitialized = false;

/**
 * Initialize the database with encryption and schema
 */
export async function initializeDatabase(): Promise<void> {
  if (isInitialized) return;

  try {
    // Initialize encrypted database via Tauri
    await initializeEncryptedDatabase();

    // Create tables
    await invoke('db_execute', { sql: CREATE_TABLES_SQL });

    // Run migrations
    await runMigrations();

    // Insert default settings
    await invoke('db_execute', { sql: INSERT_DEFAULT_SETTINGS_SQL });

    isInitialized = true;
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Failed to initialize database:', error);
    throw error;
  }
}

/**
 * Run any pending database migrations
 */
async function runMigrations(): Promise<void> {
  try {
    // Get current schema version
    const result = await invoke<Array<{ version: number }>>('db_query', {
      sql: 'SELECT MAX(version) as version FROM schema_version',
      params: [],
    });

    const currentVersion = result[0]?.version || 0;

    // Run any pending migrations
    for (let version = currentVersion + 1; version <= SCHEMA_VERSION; version++) {
      if (MIGRATIONS[version]) {
        await invoke('db_execute', { sql: MIGRATIONS[version] });
        console.log(`Applied migration version ${version}`);
      }
    }
  } catch {
    // Table might not exist yet, run initial migration
    if (MIGRATIONS[1]) {
      await invoke('db_execute', { sql: MIGRATIONS[1] });
    }
  }
}

// ============================================================================
// Situation Operations
// ============================================================================

/**
 * Create a new situation
 */
export async function createSituation(
  title: string,
  description: string,
  status: SituationStatus = 'active'
): Promise<Situation> {
  const id = await generateSecureId();

  await invoke('db_execute', {
    sql: QUERIES.createSituation,
    params: [id, title, description, status],
  });

  await logAudit('create', 'situation', id, { title });

  return {
    id,
    title,
    description,
    status,
    createdAt: new Date(),
    updatedAt: new Date(),
    participants: [],
    communications: [],
  };
}

/**
 * Get a situation by ID with all related data
 */
export async function getSituation(id: string): Promise<Situation | null> {
  const results = await invoke<SituationDTO[]>('db_query', {
    sql: QUERIES.getSituation,
    params: [id],
  });

  if (!results.length) return null;

  const dto = results[0];
  const participants = await getParticipantsBySituation(id);
  const communications = await getCommunicationsBySituation(id);
  const analysis = await getLatestAnalysis(id);

  return dtoToSituation(dto, participants, communications, analysis);
}

/**
 * List all situations, optionally filtered by status
 */
export async function listSituations(status?: SituationStatus): Promise<Situation[]> {
  const sql = status ? QUERIES.listSituationsByStatus : QUERIES.listSituations;
  const params = status ? [status] : [];

  const results = await invoke<SituationDTO[]>('db_query', { sql, params });

  // For list view, we don't load all related data
  return results.map((dto) => dtoToSituation(dto, [], [], undefined));
}

/**
 * Update a situation
 */
export async function updateSituation(
  id: string,
  updates: Partial<Pick<Situation, 'title' | 'description' | 'status'>>
): Promise<void> {
  const existing = await getSituation(id);
  if (!existing) throw new Error('Situation not found');

  await invoke('db_execute', {
    sql: QUERIES.updateSituation,
    params: [
      updates.title ?? existing.title,
      updates.description ?? existing.description,
      updates.status ?? existing.status,
      id,
    ],
  });

  await logAudit('update', 'situation', id, updates);
}

/**
 * Delete a situation and all related data
 */
export async function deleteSituation(id: string): Promise<void> {
  await invoke('db_execute', {
    sql: QUERIES.deleteSituation,
    params: [id],
  });

  await logAudit('delete', 'situation', id, {});
}

// ============================================================================
// Participant Operations
// ============================================================================

/**
 * Add a participant to a situation
 */
export async function addParticipant(
  situationId: string,
  participant: Omit<Participant, 'id'>
): Promise<Participant> {
  const id = await generateSecureId();

  await invoke('db_execute', {
    sql: QUERIES.createParticipant,
    params: [
      id,
      situationId,
      participant.name,
      participant.email || null,
      participant.slackId || null,
      participant.role || null,
      participant.statedPosition || null,
      participant.inferredIntent || null,
    ],
  });

  await logAudit('create', 'participant', id, { situationId, name: participant.name });

  return { id, ...participant };
}

/**
 * Get participants for a situation
 */
export async function getParticipantsBySituation(situationId: string): Promise<Participant[]> {
  const results = await invoke<ParticipantDTO[]>('db_query', {
    sql: QUERIES.getParticipantsBySituation,
    params: [situationId],
  });

  return results.map(dtoToParticipant);
}

/**
 * Update a participant
 */
export async function updateParticipant(id: string, updates: Partial<Participant>): Promise<void> {
  const results = await invoke<ParticipantDTO[]>('db_query', {
    sql: 'SELECT * FROM participants WHERE id = ?',
    params: [id],
  });

  if (!results.length) throw new Error('Participant not found');

  const existing = dtoToParticipant(results[0]);

  await invoke('db_execute', {
    sql: QUERIES.updateParticipant,
    params: [
      updates.name ?? existing.name,
      updates.email ?? existing.email ?? null,
      updates.slackId ?? existing.slackId ?? null,
      updates.role ?? existing.role ?? null,
      updates.statedPosition ?? existing.statedPosition ?? null,
      updates.inferredIntent ?? existing.inferredIntent ?? null,
      id,
    ],
  });

  await logAudit('update', 'participant', id, updates);
}

/**
 * Remove a participant from a situation
 */
export async function removeParticipant(id: string): Promise<void> {
  await invoke('db_execute', {
    sql: QUERIES.deleteParticipant,
    params: [id],
  });

  await logAudit('delete', 'participant', id, {});
}

// ============================================================================
// Communication Operations
// ============================================================================

/**
 * Add a communication to a situation
 */
export async function addCommunication(
  situationId: string,
  communication: Omit<Communication, 'id' | 'situationId' | 'contentEncrypted'> & { content: string }
): Promise<Communication> {
  const id = await generateSecureId();
  const contentEncrypted = await encryptForStorage(communication.content);

  await invoke('db_execute', {
    sql: QUERIES.createCommunication,
    params: [
      id,
      situationId,
      communication.source,
      communication.sourceId,
      communication.timestamp.toISOString(),
      JSON.stringify(communication.participants),
      contentEncrypted,
      JSON.stringify(communication.metadata),
    ],
  });

  await logAudit('create', 'communication', id, {
    situationId,
    source: communication.source,
    sourceId: communication.sourceId,
  });

  return {
    id,
    situationId,
    source: communication.source,
    sourceId: communication.sourceId,
    timestamp: communication.timestamp,
    participants: communication.participants,
    contentEncrypted,
    metadata: communication.metadata,
  };
}

/**
 * Get communications for a situation
 */
export async function getCommunicationsBySituation(situationId: string): Promise<Communication[]> {
  const results = await invoke<CommunicationDTO[]>('db_query', {
    sql: QUERIES.getCommunicationsBySituation,
    params: [situationId],
  });

  return results.map(dtoToCommunication);
}

/**
 * Get decrypted content for a communication
 */
export async function getCommunicationContent(communicationId: string): Promise<string> {
  const results = await invoke<CommunicationDTO[]>('db_query', {
    sql: 'SELECT content_encrypted FROM communications WHERE id = ?',
    params: [communicationId],
  });

  if (!results.length) throw new Error('Communication not found');

  return decryptFromStorage(results[0].content_encrypted);
}

/**
 * Check if a communication already exists by source ID
 */
export async function communicationExists(source: string, sourceId: string): Promise<boolean> {
  const results = await invoke<CommunicationDTO[]>('db_query', {
    sql: QUERIES.getCommunicationBySourceId,
    params: [source, sourceId],
  });

  return results.length > 0;
}

// ============================================================================
// Analysis Operations
// ============================================================================

/**
 * Save analysis results for a situation
 */
export async function saveAnalysis(
  situationId: string,
  analysis: Omit<SituationAnalysis, 'generatedAt'>
): Promise<void> {
  const id = await generateSecureId();

  await invoke('db_execute', {
    sql: QUERIES.createAnalysis,
    params: [
      id,
      situationId,
      analysis.summary,
      JSON.stringify(analysis.stakeholderAnalysis),
      JSON.stringify(analysis.toneTrajectory),
      JSON.stringify(analysis.unresolvedThreads),
      JSON.stringify(analysis.riskSignals),
      JSON.stringify(analysis.suggestedActions),
      JSON.stringify(analysis.relatedSituations),
    ],
  });

  await logAudit('create', 'analysis', id, { situationId });
}

/**
 * Get the latest analysis for a situation
 */
export async function getLatestAnalysis(situationId: string): Promise<SituationAnalysis | undefined> {
  const results = await invoke<AnalysisDTO[]>('db_query', {
    sql: QUERIES.getLatestAnalysis,
    params: [situationId],
  });

  if (!results.length) return undefined;

  return dtoToAnalysis(results[0]);
}

// ============================================================================
// Settings Operations
// ============================================================================

/**
 * Get all settings
 */
export async function getSettings(): Promise<AppSettings> {
  const results = await invoke<Array<{ key: string; value: string }>>('db_query', {
    sql: QUERIES.getAllSettings,
    params: [],
  });

  const settings: Record<string, string> = {};
  for (const row of results) {
    settings[row.key] = row.value;
  }

  return {
    localLlmEndpoint: settings['local_llm_endpoint'] || 'http://localhost:11434',
    localLlmModel: settings['local_llm_model'] || 'llama3:8b',
    cloudLlmEnabled: settings['cloud_llm_enabled'] === 'true',
    cloudLlmApiKey: settings['cloud_llm_api_key'],
    encryptionKeyId: settings['encryption_key_id'] || '',
    theme: (settings['theme'] as 'light' | 'dark' | 'system') || 'system',
    autoRefreshInterval: parseInt(settings['auto_refresh_interval'] || '0', 10),
  };
}

/**
 * Update a setting
 */
export async function updateSetting(key: string, value: string): Promise<void> {
  await invoke('db_execute', {
    sql: QUERIES.setSetting,
    params: [key, value],
  });

  await logAudit('update', 'setting', key, { value: key.includes('key') ? '[REDACTED]' : value });
}

// ============================================================================
// Audit Logging
// ============================================================================

/**
 * Log an audit event
 */
async function logAudit(
  action: string,
  entityType: string,
  entityId: string,
  details: Record<string, unknown>
): Promise<void> {
  try {
    await invoke('db_execute', {
      sql: QUERIES.logAudit,
      params: [action, entityType, entityId, JSON.stringify(details)],
    });
  } catch (error) {
    // Don't fail on audit log errors
    console.error('Failed to log audit:', error);
  }
}

// ============================================================================
// DTO Converters
// ============================================================================

function dtoToSituation(
  dto: SituationDTO,
  participants: Participant[],
  communications: Communication[],
  analysis?: SituationAnalysis
): Situation {
  return {
    id: dto.id,
    title: dto.title,
    description: dto.description,
    status: dto.status,
    createdAt: new Date(dto.created_at),
    updatedAt: new Date(dto.updated_at),
    participants,
    communications,
    analysis,
  };
}

function dtoToParticipant(dto: ParticipantDTO): Participant {
  return {
    id: dto.id,
    name: dto.name,
    email: dto.email || undefined,
    slackId: dto.slack_id || undefined,
    role: dto.role || undefined,
    statedPosition: dto.stated_position || undefined,
    inferredIntent: dto.inferred_intent || undefined,
  };
}

function dtoToCommunication(dto: CommunicationDTO): Communication {
  return {
    id: dto.id,
    situationId: dto.situation_id,
    source: dto.source,
    sourceId: dto.source_id,
    timestamp: new Date(dto.timestamp),
    participants: JSON.parse(dto.participants),
    contentEncrypted: dto.content_encrypted,
    metadata: JSON.parse(dto.metadata || '{}'),
  };
}

function dtoToAnalysis(dto: AnalysisDTO): SituationAnalysis {
  return {
    generatedAt: new Date(dto.generated_at),
    summary: dto.summary,
    stakeholderAnalysis: JSON.parse(dto.stakeholder_analysis || '[]'),
    toneTrajectory: JSON.parse(dto.tone_trajectory || '[]'),
    unresolvedThreads: JSON.parse(dto.unresolved_threads || '[]'),
    riskSignals: JSON.parse(dto.risk_signals || '[]'),
    suggestedActions: JSON.parse(dto.suggested_actions || '[]'),
    relatedSituations: JSON.parse(dto.related_situations || '[]'),
  };
}

export default {
  initializeDatabase,
  createSituation,
  getSituation,
  listSituations,
  updateSituation,
  deleteSituation,
  addParticipant,
  getParticipantsBySituation,
  updateParticipant,
  removeParticipant,
  addCommunication,
  getCommunicationsBySituation,
  getCommunicationContent,
  communicationExists,
  saveAnalysis,
  getLatestAnalysis,
  getSettings,
  updateSetting,
};
