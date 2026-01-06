// Anonymizer for Sidecar
// Removes PII before sending to cloud LLM

import type { Participant, Communication } from '../../shared/types';
import { decryptFromStorage } from '../database/encryption';

// ============================================================================
// Types
// ============================================================================

interface AnonymizedData {
  originalHash: string;
  anonymizedText: string;
  entityMap: Map<string, string>; // original -> anonymized
  reverseMap: Map<string, string>; // anonymized -> original
}

interface AnonymizationResult {
  text: string;
  entities: AnonymizedEntity[];
}

interface AnonymizedEntity {
  type: 'person' | 'email' | 'phone' | 'company' | 'project' | 'custom';
  original: string;
  replacement: string;
}

// ============================================================================
// Entity Detection Patterns
// ============================================================================

const PATTERNS = {
  // Email addresses
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,

  // Phone numbers (various formats)
  phone: /(\+?1?[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/g,

  // Slack user mentions
  slackMention: /<@[A-Z0-9]+>/g,

  // Slack channel mentions
  slackChannel: /<#[A-Z0-9]+\|[^>]+>/g,

  // URLs (to anonymize domains)
  url: /https?:\/\/[^\s<>"\]]+/g,

  // IP addresses
  ipAddress: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
};

// ============================================================================
// Anonymization Class
// ============================================================================

export class Anonymizer {
  private entityMap: Map<string, string> = new Map();
  private reverseMap: Map<string, string> = new Map();
  private counters: Record<string, number> = {
    person: 0,
    email: 0,
    phone: 0,
    company: 0,
    project: 0,
    custom: 0,
  };

  private knownNames: Set<string> = new Set();
  private knownEmails: Set<string> = new Set();

  /**
   * Register known participants for name detection
   */
  registerParticipants(participants: Participant[]): void {
    for (const p of participants) {
      if (p.name) {
        this.knownNames.add(p.name.toLowerCase());
        // Also add first name and last name separately
        const parts = p.name.split(/\s+/);
        for (const part of parts) {
          if (part.length > 2) {
            this.knownNames.add(part.toLowerCase());
          }
        }
      }
      if (p.email) {
        this.knownEmails.add(p.email.toLowerCase());
      }
    }
  }

  /**
   * Anonymize text content
   */
  anonymize(text: string): AnonymizationResult {
    let result = text;
    const entities: AnonymizedEntity[] = [];

    // Replace emails
    result = result.replace(PATTERNS.email, (match) => {
      const replacement = this.getOrCreateReplacement(match.toLowerCase(), 'email');
      entities.push({ type: 'email', original: match, replacement });
      return replacement;
    });

    // Replace phone numbers
    result = result.replace(PATTERNS.phone, (match) => {
      const normalized = match.replace(/\D/g, '');
      const replacement = this.getOrCreateReplacement(normalized, 'phone');
      entities.push({ type: 'phone', original: match, replacement });
      return replacement;
    });

    // Replace Slack mentions
    result = result.replace(PATTERNS.slackMention, (match) => {
      const replacement = this.getOrCreateReplacement(match, 'person');
      entities.push({ type: 'person', original: match, replacement });
      return replacement;
    });

    // Replace known names (case-insensitive)
    for (const name of this.knownNames) {
      const regex = new RegExp(`\\b${escapeRegex(name)}\\b`, 'gi');
      result = result.replace(regex, (match) => {
        const replacement = this.getOrCreateReplacement(match.toLowerCase(), 'person');
        entities.push({ type: 'person', original: match, replacement });
        return replacement;
      });
    }

    // Replace URLs (keep structure but anonymize domain)
    result = result.replace(PATTERNS.url, (match) => {
      try {
        const url = new URL(match);
        const anonDomain = this.getOrCreateReplacement(url.hostname, 'company');
        return `https://${anonDomain}${url.pathname}`;
      } catch {
        return match;
      }
    });

    // Replace IP addresses
    result = result.replace(PATTERNS.ipAddress, (match) => {
      const replacement = this.getOrCreateReplacement(match, 'custom');
      entities.push({ type: 'custom', original: match, replacement });
      return replacement;
    });

    return { text: result, entities };
  }

  /**
   * Anonymize multiple communications
   */
  async anonymizeCommunications(
    communications: Communication[]
  ): Promise<Array<{ id: string; anonymizedContent: string }>> {
    const results: Array<{ id: string; anonymizedContent: string }> = [];

    for (const comm of communications) {
      try {
        const content = await decryptFromStorage(comm.contentEncrypted);
        const { text } = this.anonymize(content);
        results.push({ id: comm.id, anonymizedContent: text });
      } catch {
        // Skip communications we can't decrypt
        continue;
      }
    }

    return results;
  }

  /**
   * De-anonymize text (reverse the process)
   */
  deanonymize(text: string): string {
    let result = text;

    for (const [anonymized, original] of this.reverseMap) {
      result = result.replace(new RegExp(escapeRegex(anonymized), 'g'), original);
    }

    return result;
  }

  /**
   * Get or create a replacement for an entity
   */
  private getOrCreateReplacement(original: string, type: AnonymizedEntity['type']): string {
    const key = `${type}:${original}`;

    if (this.entityMap.has(key)) {
      return this.entityMap.get(key)!;
    }

    this.counters[type]++;
    let replacement: string;

    switch (type) {
      case 'person':
        replacement = `[PERSON_${this.counters[type]}]`;
        break;
      case 'email':
        replacement = `person${this.counters[type]}@example.com`;
        break;
      case 'phone':
        replacement = `[PHONE_${this.counters[type]}]`;
        break;
      case 'company':
        replacement = `company${this.counters[type]}.example.com`;
        break;
      case 'project':
        replacement = `[PROJECT_${this.counters[type]}]`;
        break;
      default:
        replacement = `[ENTITY_${this.counters[type]}]`;
    }

    this.entityMap.set(key, replacement);
    this.reverseMap.set(replacement, original);

    return replacement;
  }

  /**
   * Get the entity mapping for audit purposes
   */
  getEntityMap(): Record<string, string> {
    const map: Record<string, string> = {};
    for (const [key, value] of this.entityMap) {
      map[key] = value;
    }
    return map;
  }

  /**
   * Reset the anonymizer state
   */
  reset(): void {
    this.entityMap.clear();
    this.reverseMap.clear();
    this.counters = {
      person: 0,
      email: 0,
      phone: 0,
      company: 0,
      project: 0,
      custom: 0,
    };
    this.knownNames.clear();
    this.knownEmails.clear();
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Escape special regex characters
 */
function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Create a hash of content for deduplication
 */
export async function hashContent(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Create a new anonymizer instance
 */
export function createAnonymizer(): Anonymizer {
  return new Anonymizer();
}

/**
 * Quick anonymize a single text (stateless)
 */
export function quickAnonymize(text: string, participants: Participant[] = []): AnonymizationResult {
  const anonymizer = new Anonymizer();
  anonymizer.registerParticipants(participants);
  return anonymizer.anonymize(text);
}

export default {
  Anonymizer,
  createAnonymizer,
  quickAnonymize,
  hashContent,
};
