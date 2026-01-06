// Local LLM Integration for Sidecar
// Uses Ollama for sensitive analysis that stays on-device

import type {
  Communication,
  Participant,
  ToneDataPoint,
  StakeholderAnalysis,
  UnresolvedThread,
  RiskSignal,
} from '../../shared/types';
import { getSettings } from '../database';
import { decryptFromStorage } from '../database/encryption';

// ============================================================================
// Types
// ============================================================================

interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  stream?: boolean;
  options?: {
    temperature?: number;
    top_p?: number;
    num_predict?: number;
  };
}

interface OllamaGenerateResponse {
  model: string;
  response: string;
  done: boolean;
}

// ============================================================================
// Ollama API
// ============================================================================

/**
 * Check if Ollama is running and the model is available
 */
export async function checkOllamaStatus(): Promise<{
  available: boolean;
  modelLoaded: boolean;
  error?: string;
}> {
  try {
    const settings = await getSettings();
    const response = await fetch(`${settings.localLlmEndpoint}/api/tags`);

    if (!response.ok) {
      return { available: false, modelLoaded: false, error: 'Ollama not responding' };
    }

    const data = await response.json();
    const models = data.models || [];
    const modelLoaded = models.some((m: { name: string }) =>
      m.name.includes(settings.localLlmModel)
    );

    return { available: true, modelLoaded };
  } catch (error) {
    return {
      available: false,
      modelLoaded: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Generate text using local LLM
 */
async function generate(prompt: string, options?: OllamaGenerateRequest['options']): Promise<string> {
  const settings = await getSettings();

  const request: OllamaGenerateRequest = {
    model: settings.localLlmModel,
    prompt,
    stream: false,
    options: {
      temperature: 0.3,
      top_p: 0.9,
      num_predict: 1024,
      ...options,
    },
  };

  const response = await fetch(`${settings.localLlmEndpoint}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(`Ollama API error: ${response.statusText}`);
  }

  const data: OllamaGenerateResponse = await response.json();
  return data.response;
}

// ============================================================================
// Analysis Functions
// ============================================================================

/**
 * Analyze sentiment/tone of a message
 */
export async function analyzeTone(
  content: string,
  participantName: string
): Promise<ToneDataPoint> {
  const prompt = `Analyze the tone and sentiment of the following message from ${participantName}.

Message:
"""
${content}
"""

Respond with a JSON object containing:
- sentiment: a number from -1 (very negative) to 1 (very positive)
- markers: an array of tone markers like "formal", "casual", "frustrated", "enthusiastic", "defensive", "collaborative", etc.

JSON Response:`;

  const response = await generate(prompt);

  try {
    // Extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      timestamp: new Date(),
      participant: participantName,
      sentiment: Math.max(-1, Math.min(1, parsed.sentiment || 0)),
      markers: Array.isArray(parsed.markers) ? parsed.markers : [],
    };
  } catch {
    // Default neutral response if parsing fails
    return {
      timestamp: new Date(),
      participant: participantName,
      sentiment: 0,
      markers: [],
    };
  }
}

/**
 * Analyze a participant's position and intent
 */
export async function analyzeStakeholder(
  participant: Participant,
  communications: Communication[]
): Promise<StakeholderAnalysis> {
  // Decrypt and prepare messages from this participant
  const messages: string[] = [];
  for (const comm of communications) {
    if (comm.participants.includes(participant.id)) {
      try {
        const content = await decryptFromStorage(comm.contentEncrypted);
        messages.push(content);
      } catch {
        // Skip messages we can't decrypt
      }
    }
  }

  const prompt = `Analyze the following messages from ${participant.name} (${participant.role || 'participant'}) in a workplace situation.

Messages:
"""
${messages.slice(0, 10).join('\n---\n')}
"""

Based on these messages, provide analysis in JSON format:
- statedPosition: What they explicitly say they want or believe
- inferredIntent: What they likely actually want (reading between the lines)
- communicationStyle: Brief description of how they communicate
- engagementLevel: "high", "medium", or "low"

JSON Response:`;

  const response = await generate(prompt, { num_predict: 512 });

  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found');
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      participantId: participant.id,
      statedPosition: parsed.statedPosition || '',
      inferredIntent: parsed.inferredIntent || '',
      communicationStyle: parsed.communicationStyle || '',
      engagementLevel: ['high', 'medium', 'low'].includes(parsed.engagementLevel)
        ? parsed.engagementLevel
        : 'medium',
    };
  } catch {
    return {
      participantId: participant.id,
      statedPosition: participant.statedPosition || 'Unknown',
      inferredIntent: participant.inferredIntent || 'Unknown',
      communicationStyle: 'Unknown',
      engagementLevel: 'medium',
    };
  }
}

/**
 * Extract unresolved threads from communications
 */
export async function extractUnresolvedThreads(
  communications: Communication[]
): Promise<UnresolvedThread[]> {
  // Prepare messages for analysis
  const messages: Array<{ id: string; content: string; timestamp: Date; from: string }> = [];

  for (const comm of communications.slice(-20)) {
    try {
      const content = await decryptFromStorage(comm.contentEncrypted);
      messages.push({
        id: comm.id,
        content,
        timestamp: comm.timestamp,
        from: comm.participants[0] || 'unknown',
      });
    } catch {
      // Skip
    }
  }

  const prompt = `Analyze this conversation and identify any unresolved threads - questions that weren't answered, commitments that weren't confirmed, decisions that weren't finalized, or action items that weren't completed.

Conversation:
"""
${messages.map((m) => `[${m.from}]: ${m.content}`).join('\n')}
"""

Respond with a JSON array of unresolved items, each with:
- description: What is unresolved
- type: "question" | "commitment" | "decision" | "action_item"
- raisedBy: Who raised it
- context: Brief context

JSON Response:`;

  const response = await generate(prompt, { num_predict: 1024 });

  try {
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return parsed.map((item: {
      description?: string;
      type?: string;
      raisedBy?: string;
      context?: string;
    }, index: number) => ({
      id: `thread_${Date.now()}_${index}`,
      description: item.description || '',
      type: ['question', 'commitment', 'decision', 'action_item'].includes(item.type || '')
        ? item.type
        : 'question',
      raisedBy: item.raisedBy || 'unknown',
      raisedAt: new Date(),
      context: item.context || '',
    }));
  } catch {
    return [];
  }
}

/**
 * Detect risk signals in communications
 */
export async function detectRiskSignals(
  communications: Communication[],
  toneHistory: ToneDataPoint[]
): Promise<RiskSignal[]> {
  // Prepare summary for analysis
  const recentMessages: string[] = [];
  for (const comm of communications.slice(-15)) {
    try {
      const content = await decryptFromStorage(comm.contentEncrypted);
      recentMessages.push(content);
    } catch {
      // Skip
    }
  }

  // Summarize tone trends
  const toneSummary = toneHistory
    .slice(-10)
    .map((t) => `${t.participant}: ${t.sentiment.toFixed(2)} (${t.markers.join(', ')})`)
    .join('\n');

  const prompt = `Analyze this workplace communication for risk signals.

Recent Messages:
"""
${recentMessages.join('\n---\n')}
"""

Tone History:
${toneSummary}

Identify any risk signals in JSON array format:
- type: "disengagement" | "escalation" | "misalignment" | "blocker"
- severity: "low" | "medium" | "high"
- description: What the risk is
- evidence: Array of brief evidence points

JSON Response:`;

  const response = await generate(prompt, { num_predict: 1024 });

  try {
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return parsed.map((item: {
      type?: string;
      severity?: string;
      description?: string;
      evidence?: string[];
    }) => ({
      type: ['disengagement', 'escalation', 'misalignment', 'blocker'].includes(item.type || '')
        ? item.type
        : 'misalignment',
      severity: ['low', 'medium', 'high'].includes(item.severity || '') ? item.severity : 'low',
      description: item.description || '',
      evidence: Array.isArray(item.evidence) ? item.evidence : [],
    }));
  } catch {
    return [];
  }
}

/**
 * Generate a situation summary
 */
export async function generateSummary(
  title: string,
  description: string,
  participants: Participant[],
  communications: Communication[]
): Promise<string> {
  // Prepare messages
  const messages: string[] = [];
  for (const comm of communications.slice(-20)) {
    try {
      const content = await decryptFromStorage(comm.contentEncrypted);
      messages.push(content);
    } catch {
      // Skip
    }
  }

  const participantList = participants.map((p) => `${p.name} (${p.role || 'participant'})`).join(', ');

  const prompt = `Summarize this workplace situation for a manager.

Situation: ${title}
${description ? `Description: ${description}` : ''}

Participants: ${participantList}

Recent Communications:
"""
${messages.join('\n---\n')}
"""

Provide a concise 2-3 paragraph summary that:
1. Explains the current state of the situation
2. Highlights key points of agreement or disagreement
3. Notes what remains unresolved

Summary:`;

  return generate(prompt, { num_predict: 512 });
}

export default {
  checkOllamaStatus,
  analyzeTone,
  analyzeStakeholder,
  extractUnresolvedThreads,
  detectRiskSignals,
  generateSummary,
};
