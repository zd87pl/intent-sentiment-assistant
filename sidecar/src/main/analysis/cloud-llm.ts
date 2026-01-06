// Cloud LLM Integration for Sidecar
// Uses Claude API for complex reasoning on anonymized data

import { getSettings } from '../database';
import { createAnonymizer, type Anonymizer } from './anonymizer';
import type { Participant, SuggestedAction } from '../../shared/types';

// ============================================================================
// Types
// ============================================================================

interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ClaudeRequest {
  model: string;
  max_tokens: number;
  messages: ClaudeMessage[];
  system?: string;
}

interface ClaudeResponse {
  id: string;
  type: string;
  role: string;
  content: Array<{
    type: string;
    text: string;
  }>;
  model: string;
  stop_reason: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

interface ConnectionAnalysis {
  situationId: string;
  connectionStrength: 'strong' | 'moderate' | 'weak';
  reason: string;
  sharedThemes: string[];
}

// ============================================================================
// Configuration
// ============================================================================

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = 'claude-3-5-sonnet-20241022';

// ============================================================================
// API Functions
// ============================================================================

/**
 * Check if cloud LLM is available and configured
 */
export async function isCloudLlmAvailable(): Promise<boolean> {
  const settings = await getSettings();
  return settings.cloudLlmEnabled && !!settings.cloudLlmApiKey;
}

/**
 * Make a request to Claude API
 */
async function callClaude(
  systemPrompt: string,
  userMessage: string,
  maxTokens: number = 1024
): Promise<string> {
  const settings = await getSettings();

  if (!settings.cloudLlmEnabled || !settings.cloudLlmApiKey) {
    throw new Error('Cloud LLM not enabled or API key not configured');
  }

  const request: ClaudeRequest = {
    model: CLAUDE_MODEL,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  };

  const response = await fetch(CLAUDE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': settings.cloudLlmApiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Claude API error: ${response.status} - ${error}`);
  }

  const data: ClaudeResponse = await response.json();
  return data.content[0]?.text || '';
}

// ============================================================================
// Analysis Functions
// ============================================================================

/**
 * Generate suggested actions for a situation
 * Uses anonymized summary and analysis to suggest next steps
 */
export async function generateSuggestedActions(
  anonymizedSummary: string,
  anonymizedAnalysis: {
    stakeholders: Array<{ role: string; position: string; intent: string }>;
    unresolvedItems: string[];
    risks: string[];
  }
): Promise<SuggestedAction[]> {
  const systemPrompt = `You are an expert executive coach helping engineering leaders resolve workplace situations.
Your role is to suggest concrete, actionable next steps based on the situation analysis.
Focus on practical communication strategies that move situations toward resolution.
Be direct and specific - avoid generic advice.`;

  const userMessage = `Based on this situation analysis, suggest the top 3-5 actions the manager should take.

Situation Summary:
${anonymizedSummary}

Stakeholder Analysis:
${anonymizedAnalysis.stakeholders
    .map((s) => `- ${s.role}: Position: "${s.position}" | Likely intent: "${s.intent}"`)
    .join('\n')}

Unresolved Items:
${anonymizedAnalysis.unresolvedItems.map((item) => `- ${item}`).join('\n')}

Risk Signals:
${anonymizedAnalysis.risks.map((risk) => `- ${risk}`).join('\n')}

Provide your response as a JSON array with each action having:
- priority (1 being highest)
- action (the specific action to take)
- rationale (why this action)
- suggestedQuestions (optional array of questions to ask)

JSON Response:`;

  const response = await callClaude(systemPrompt, userMessage, 1500);

  try {
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return getDefaultActions();
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return parsed.map((item: {
      priority?: number;
      action?: string;
      rationale?: string;
      suggestedQuestions?: string[];
    }, index: number) => ({
      priority: item.priority || index + 1,
      action: item.action || '',
      rationale: item.rationale || '',
      suggestedQuestions: item.suggestedQuestions,
    }));
  } catch {
    return getDefaultActions();
  }
}

/**
 * Detect connections between situations
 */
export async function detectSituationConnections(
  currentSituation: {
    id: string;
    title: string;
    anonymizedSummary: string;
    themes: string[];
    participantRoles: string[];
  },
  otherSituations: Array<{
    id: string;
    title: string;
    anonymizedSummary: string;
    themes: string[];
    participantRoles: string[];
  }>
): Promise<ConnectionAnalysis[]> {
  if (otherSituations.length === 0) {
    return [];
  }

  const systemPrompt = `You are analyzing workplace situations to find potential connections.
Look for shared themes, patterns, or relationships that might indicate situations are related.
A connection could be: shared topics, similar dynamics, cause-and-effect relationships, or common patterns.`;

  const userMessage = `Analyze if the current situation is connected to any of the other situations.

Current Situation:
Title: ${currentSituation.title}
Summary: ${currentSituation.anonymizedSummary}
Themes: ${currentSituation.themes.join(', ')}
Roles involved: ${currentSituation.participantRoles.join(', ')}

Other Situations:
${otherSituations
    .map(
      (s, i) => `
${i + 1}. ${s.title} (ID: ${s.id})
   Summary: ${s.anonymizedSummary}
   Themes: ${s.themes.join(', ')}
   Roles: ${s.participantRoles.join(', ')}`
    )
    .join('\n')}

Identify any connections. Respond with a JSON array of connections (can be empty if no connections):
- situationId
- connectionStrength: "strong" | "moderate" | "weak"
- reason: Why they might be connected
- sharedThemes: Array of shared themes

JSON Response:`;

  const response = await callClaude(systemPrompt, userMessage, 1500);

  try {
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return parsed.filter((item: ConnectionAnalysis) =>
      otherSituations.some((s) => s.id === item.situationId)
    );
  } catch {
    return [];
  }
}

/**
 * Generate a comprehensive situation brief
 */
export async function generateBrief(
  situation: {
    title: string;
    description: string;
    anonymizedSummary: string;
  },
  analysis: {
    stakeholders: Array<{ name: string; role: string; position: string; intent: string; tone: string }>;
    unresolvedItems: Array<{ description: string; type: string }>;
    risks: Array<{ type: string; severity: string; description: string }>;
    toneHistory: string;
  }
): Promise<{
  executiveSummary: string;
  keyInsights: string[];
  immediateActions: string[];
  questionsToAsk: string[];
  watchPoints: string[];
}> {
  const systemPrompt = `You are an expert executive coach creating a situation brief for an engineering leader.
The brief should be concise, actionable, and focus on what's not being said directly.
Your goal is to help the manager see through the surface communication to understand true dynamics.`;

  const userMessage = `Create a situation brief for: "${situation.title}"

Description: ${situation.description}

Summary: ${situation.anonymizedSummary}

Stakeholder Analysis:
${analysis.stakeholders
    .map(
      (s) =>
        `- ${s.name} (${s.role}): States "${s.position}" but likely wants "${s.intent}". Recent tone: ${s.tone}`
    )
    .join('\n')}

Unresolved Items:
${analysis.unresolvedItems.map((item) => `- [${item.type}] ${item.description}`).join('\n')}

Risk Signals:
${analysis.risks.map((r) => `- [${r.severity}] ${r.type}: ${r.description}`).join('\n')}

Tone Trajectory: ${analysis.toneHistory}

Create a brief with:
1. executiveSummary (2-3 sentences capturing the core dynamic)
2. keyInsights (3-5 things the manager might not have noticed)
3. immediateActions (2-3 specific next steps)
4. questionsToAsk (3-5 questions to ask in the next conversation)
5. watchPoints (what to monitor going forward)

JSON Response:`;

  const response = await callClaude(systemPrompt, userMessage, 2000);

  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return getDefaultBrief();
    }

    return JSON.parse(jsonMatch[0]);
  } catch {
    return getDefaultBrief();
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Default actions when cloud LLM fails
 */
function getDefaultActions(): SuggestedAction[] {
  return [
    {
      priority: 1,
      action: 'Schedule a 1:1 with the primary stakeholder',
      rationale: 'Direct communication often resolves unclear situations',
      suggestedQuestions: [
        "What's your ideal outcome here?",
        "What concerns you most about the current state?",
      ],
    },
    {
      priority: 2,
      action: 'Document the current state and share with all parties',
      rationale: 'Shared understanding prevents miscommunication',
    },
  ];
}

/**
 * Default brief when cloud LLM fails
 */
function getDefaultBrief() {
  return {
    executiveSummary: 'Analysis could not be completed. Review the raw data for insights.',
    keyInsights: ['Manual review recommended'],
    immediateActions: ['Review communications directly', 'Schedule sync with key stakeholders'],
    questionsToAsk: ['What is the current status?', 'What blockers exist?'],
    watchPoints: ['Communication frequency', 'Tone changes'],
  };
}

/**
 * Prepare anonymized data for cloud analysis
 */
export function prepareForCloudAnalysis(
  participants: Participant[],
  content: string
): { anonymizer: Anonymizer; anonymizedContent: string } {
  const anonymizer = createAnonymizer();
  anonymizer.registerParticipants(participants);
  const { text } = anonymizer.anonymize(content);
  return { anonymizer, anonymizedContent: text };
}

export default {
  isCloudLlmAvailable,
  generateSuggestedActions,
  detectSituationConnections,
  generateBrief,
  prepareForCloudAnalysis,
};
