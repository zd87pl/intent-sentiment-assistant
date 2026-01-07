// Tests for shared types
import { describe, it, expect } from 'vitest';
import type {
  Situation,
  SituationStatus,
  Participant,
  Communication,
  CommunicationSource,
} from './types';

describe('Types', () => {
  describe('Situation', () => {
    it('should have required properties', () => {
      const situation: Situation = {
        id: 'test-123',
        title: 'Test Situation',
        description: 'A test description',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
        participants: [],
        communications: [],
      };

      expect(situation.id).toBe('test-123');
      expect(situation.title).toBe('Test Situation');
      expect(situation.status).toBe('active');
      expect(situation.participants).toHaveLength(0);
    });

    it('should accept all valid statuses', () => {
      const statuses: SituationStatus[] = ['active', 'monitoring', 'resolved'];

      statuses.forEach((status) => {
        const situation: Situation = {
          id: 'test',
          title: 'Test',
          description: '',
          status,
          createdAt: new Date(),
          updatedAt: new Date(),
          participants: [],
          communications: [],
        };
        expect(situation.status).toBe(status);
      });
    });
  });

  describe('Participant', () => {
    it('should have required properties', () => {
      const participant: Participant = {
        id: 'p-123',
        name: 'John Doe',
      };

      expect(participant.id).toBe('p-123');
      expect(participant.name).toBe('John Doe');
    });

    it('should accept optional properties', () => {
      const participant: Participant = {
        id: 'p-123',
        name: 'John Doe',
        email: 'john@example.com',
        slackId: 'U12345',
        role: 'Tech Lead',
        statedPosition: 'We need more resources',
        inferredIntent: 'Concerned about deadlines',
      };

      expect(participant.email).toBe('john@example.com');
      expect(participant.role).toBe('Tech Lead');
    });
  });

  describe('Communication', () => {
    it('should have required properties', () => {
      const comm: Communication = {
        id: 'c-123',
        situationId: 's-456',
        source: 'slack',
        sourceId: 'msg-789',
        timestamp: new Date(),
        participants: ['p-1', 'p-2'],
        contentEncrypted: 'encrypted-content',
        metadata: {},
      };

      expect(comm.source).toBe('slack');
      expect(comm.participants).toHaveLength(2);
    });

    it('should accept all valid sources', () => {
      const sources: CommunicationSource[] = ['slack', 'gmail', 'zoom', 'manual'];

      sources.forEach((source) => {
        const comm: Communication = {
          id: 'test',
          situationId: 'test',
          source,
          sourceId: 'test',
          timestamp: new Date(),
          participants: [],
          contentEncrypted: '',
          metadata: {},
        };
        expect(comm.source).toBe(source);
      });
    });
  });
});
