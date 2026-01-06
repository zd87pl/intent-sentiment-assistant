// Sidecar - AI Management Communication Assistant
// Core Data Models

// ============================================================================
// Situation Types
// ============================================================================

export type SituationStatus = 'active' | 'monitoring' | 'resolved';

export interface Situation {
  id: string;
  title: string;
  description: string;
  status: SituationStatus;
  createdAt: Date;
  updatedAt: Date;
  participants: Participant[];
  communications: Communication[];
  analysis?: SituationAnalysis;
}

// For database storage (dates as ISO strings)
export interface SituationDTO {
  id: string;
  title: string;
  description: string;
  status: SituationStatus;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Participant Types
// ============================================================================

export interface Participant {
  id: string;
  name: string;
  email?: string;
  slackId?: string;
  role?: string; // Their role in this situation
  statedPosition?: string;
  inferredIntent?: string;
}

export interface ParticipantDTO {
  id: string;
  situation_id: string;
  name: string;
  email?: string;
  slack_id?: string;
  role?: string;
  stated_position?: string;
  inferred_intent?: string;
}

// ============================================================================
// Communication Types
// ============================================================================

export type CommunicationSource = 'slack' | 'gmail' | 'zoom';

export interface CommunicationMetadata {
  channel?: string;
  subject?: string;
  threadId?: string;
  duration?: number; // For calls (in seconds)
}

export interface Communication {
  id: string;
  situationId: string;
  source: CommunicationSource;
  sourceId: string; // Original ID in source system
  timestamp: Date;
  participants: string[]; // Participant IDs
  contentEncrypted: string; // Encrypted raw content
  metadata: CommunicationMetadata;
}

export interface CommunicationDTO {
  id: string;
  situation_id: string;
  source: CommunicationSource;
  source_id: string;
  timestamp: string;
  participants: string; // JSON array of participant IDs
  content_encrypted: string;
  metadata: string; // JSON object
}

// ============================================================================
// Analysis Types
// ============================================================================

export interface SituationAnalysis {
  generatedAt: Date;
  summary: string;
  stakeholderAnalysis: StakeholderAnalysis[];
  toneTrajectory: ToneDataPoint[];
  unresolvedThreads: UnresolvedThread[];
  riskSignals: RiskSignal[];
  suggestedActions: SuggestedAction[];
  relatedSituations: string[]; // Situation IDs
}

export interface StakeholderAnalysis {
  participantId: string;
  statedPosition: string;
  inferredIntent: string;
  communicationStyle: string;
  engagementLevel: 'high' | 'medium' | 'low';
}

export interface ToneDataPoint {
  timestamp: Date;
  participant: string;
  sentiment: number; // -1 to 1
  markers: string[]; // "shorter responses", "formal language shift", etc.
}

export interface UnresolvedThread {
  id: string;
  description: string;
  raisedBy: string; // Participant ID
  raisedAt: Date;
  type: 'question' | 'commitment' | 'decision' | 'action_item';
  context: string; // Reference to communication
}

export type RiskSignalType = 'disengagement' | 'escalation' | 'misalignment' | 'blocker';
export type RiskSeverity = 'low' | 'medium' | 'high';

export interface RiskSignal {
  type: RiskSignalType;
  severity: RiskSeverity;
  description: string;
  evidence: string[]; // References to communications
}

export interface SuggestedAction {
  priority: number;
  action: string;
  rationale: string;
  suggestedQuestions?: string[];
}

export interface AnalysisDTO {
  id: string;
  situation_id: string;
  generated_at: string;
  summary: string;
  stakeholder_analysis: string; // JSON
  tone_trajectory: string; // JSON
  unresolved_threads: string; // JSON
  risk_signals: string; // JSON
  suggested_actions: string; // JSON
  related_situations: string; // JSON array of IDs
}

// ============================================================================
// Integration Types
// ============================================================================

export interface IntegrationCredentials {
  id: string;
  type: 'slack' | 'gmail' | 'zoom';
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scope: string;
  metadata?: Record<string, unknown>;
}

export interface SlackCredentials extends IntegrationCredentials {
  type: 'slack';
  teamId: string;
  teamName: string;
  userId: string;
  botToken?: string;
}

export interface GmailCredentials extends IntegrationCredentials {
  type: 'gmail';
  email: string;
}

export interface ZoomCredentials extends IntegrationCredentials {
  type: 'zoom';
  userId: string;
}

// ============================================================================
// Slack Message Types
// ============================================================================

export interface SlackMessage {
  id: string;
  channelId: string;
  channelName?: string;
  userId: string;
  userName?: string;
  text: string;
  timestamp: string; // Slack's ts format
  threadTs?: string;
  reactions?: SlackReaction[];
  files?: SlackFile[];
}

export interface SlackReaction {
  name: string;
  count: number;
  users: string[];
}

export interface SlackFile {
  id: string;
  name: string;
  mimetype: string;
  url?: string;
}

export interface SlackChannel {
  id: string;
  name: string;
  isPrivate: boolean;
  isIm: boolean;
  isMpim: boolean;
}

export interface SlackUser {
  id: string;
  name: string;
  realName?: string;
  email?: string;
  isBot: boolean;
}

// ============================================================================
// Brief Types (Situation Summary)
// ============================================================================

export interface SituationBrief {
  situationId: string;
  generatedAt: Date;
  title: string;

  // Current State
  summary: string;
  timeline: BriefTimelineEvent[];

  // Stakeholder View
  stakeholders: BriefStakeholder[];

  // Action Items
  unresolvedItems: UnresolvedThread[];
  suggestedNextSteps: SuggestedAction[];

  // Risk Assessment
  riskLevel: RiskSeverity;
  topRisks: RiskSignal[];

  // Connections
  relatedSituations: RelatedSituationSummary[];
}

export interface BriefTimelineEvent {
  timestamp: Date;
  type: 'message' | 'meeting' | 'email' | 'status_change' | 'analysis';
  summary: string;
  source?: CommunicationSource;
  participants: string[];
}

export interface BriefStakeholder {
  participantId: string;
  name: string;
  role: string;
  currentStance: string;
  recentTone: 'positive' | 'neutral' | 'negative' | 'mixed';
  keyPoints: string[];
  suggestedApproach: string;
}

export interface RelatedSituationSummary {
  id: string;
  title: string;
  status: SituationStatus;
  connectionReason: string;
  sharedParticipants: string[];
}

// ============================================================================
// App State Types
// ============================================================================

export interface AppSettings {
  localLlmEndpoint: string; // Default: http://localhost:11434
  localLlmModel: string; // Default: llama3:8b
  cloudLlmEnabled: boolean;
  cloudLlmApiKey?: string;
  encryptionKeyId: string;
  theme: 'light' | 'dark' | 'system';
  autoRefreshInterval: number; // In minutes, 0 = disabled
}

export interface AppState {
  isInitialized: boolean;
  currentSituationId?: string;
  integrations: {
    slack: boolean;
    gmail: boolean;
    zoom: boolean;
  };
  lastSyncTime?: Date;
  settings: AppSettings;
}

// ============================================================================
// IPC Message Types (for Tauri)
// ============================================================================

export interface IpcResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export type IpcCommand =
  | { type: 'situation:create'; payload: Omit<Situation, 'id' | 'createdAt' | 'updatedAt' | 'participants' | 'communications'> }
  | { type: 'situation:update'; payload: Partial<Situation> & { id: string } }
  | { type: 'situation:delete'; payload: { id: string } }
  | { type: 'situation:get'; payload: { id: string } }
  | { type: 'situation:list'; payload?: { status?: SituationStatus } }
  | { type: 'situation:analyze'; payload: { id: string } }
  | { type: 'situation:generateBrief'; payload: { id: string } }
  | { type: 'integration:connect'; payload: { type: 'slack' | 'gmail' | 'zoom' } }
  | { type: 'integration:disconnect'; payload: { type: 'slack' | 'gmail' | 'zoom' } }
  | { type: 'integration:sync'; payload: { type: 'slack' | 'gmail' | 'zoom'; situationId: string } }
  | { type: 'settings:get' }
  | { type: 'settings:update'; payload: Partial<AppSettings> };
