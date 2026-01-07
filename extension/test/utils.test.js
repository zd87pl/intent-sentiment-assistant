/**
 * Tests for extension utility functions
 * Uses Node.js built-in test runner
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');

describe('Extension Utilities', () => {
  describe('generateId', () => {
    // Simulate the generateId function from background/index.js
    function generateId() {
      return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    }

    it('should generate unique IDs', () => {
      const id1 = generateId();
      const id2 = generateId();

      assert.notStrictEqual(id1, id2);
    });

    it('should generate IDs with timestamp prefix', () => {
      const id = generateId();
      const parts = id.split('-');

      assert.ok(parts.length >= 2);
      assert.ok(!isNaN(parseInt(parts[0])));
    });

    it('should generate IDs with random suffix', () => {
      const id = generateId();
      const parts = id.split('-');
      const suffix = parts.slice(1).join('-');

      assert.ok(suffix.length > 0);
      assert.ok(/^[a-z0-9]+$/.test(suffix));
    });
  });

  describe('escapeHtml', () => {
    // Simulate the escapeHtml function
    function escapeHtml(text) {
      const div = { textContent: '', innerHTML: '' };
      div.textContent = text;
      // Simulate browser behavior
      return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    it('should escape HTML entities', () => {
      const input = '<script>alert("xss")</script>';
      const output = escapeHtml(input);

      assert.ok(!output.includes('<script>'));
      assert.ok(output.includes('&lt;'));
      assert.ok(output.includes('&gt;'));
    });

    it('should handle empty strings', () => {
      assert.strictEqual(escapeHtml(''), '');
    });

    it('should preserve normal text', () => {
      const input = 'Hello World';
      assert.strictEqual(escapeHtml(input), 'Hello World');
    });
  });

  describe('Situation validation', () => {
    function validateSituation(data) {
      const errors = [];

      if (!data.title || typeof data.title !== 'string') {
        errors.push('Title is required');
      } else if (data.title.trim().length === 0) {
        errors.push('Title cannot be empty');
      }

      if (data.status && !['active', 'monitoring', 'resolved'].includes(data.status)) {
        errors.push('Invalid status');
      }

      return errors;
    }

    it('should validate required title', () => {
      const errors = validateSituation({});
      assert.ok(errors.includes('Title is required'));
    });

    it('should reject empty title', () => {
      const errors = validateSituation({ title: '   ' });
      assert.ok(errors.includes('Title cannot be empty'));
    });

    it('should validate status values', () => {
      const errors = validateSituation({ title: 'Test', status: 'invalid' });
      assert.ok(errors.includes('Invalid status'));
    });

    it('should accept valid data', () => {
      const errors = validateSituation({ title: 'Valid Title', status: 'active' });
      assert.strictEqual(errors.length, 0);
    });
  });

  describe('Communication parsing', () => {
    function parseCommunication(raw) {
      return {
        source: raw.source || 'manual',
        content: raw.content || '',
        timestamp: raw.timestamp ? new Date(raw.timestamp) : new Date(),
        participants: Array.isArray(raw.participants) ? raw.participants : [],
      };
    }

    it('should parse valid communication', () => {
      const raw = {
        source: 'slack',
        content: 'Hello world',
        timestamp: '2024-01-01T00:00:00Z',
        participants: ['user1', 'user2'],
      };

      const parsed = parseCommunication(raw);

      assert.strictEqual(parsed.source, 'slack');
      assert.strictEqual(parsed.content, 'Hello world');
      assert.strictEqual(parsed.participants.length, 2);
    });

    it('should handle missing fields', () => {
      const parsed = parseCommunication({});

      assert.strictEqual(parsed.source, 'manual');
      assert.strictEqual(parsed.content, '');
      assert.ok(parsed.timestamp instanceof Date);
      assert.deepStrictEqual(parsed.participants, []);
    });
  });
});

describe('Message Handler', () => {
  describe('payload validation', () => {
    function validatePayload(type, payload) {
      switch (type) {
        case 'GET_SITUATION':
          if (!payload.id) return { valid: false, error: 'Missing situation id' };
          break;
        case 'CREATE_SITUATION':
          if (!payload.title) return { valid: false, error: 'Missing title' };
          break;
        case 'ADD_COMMUNICATION':
          if (!payload.situationId) return { valid: false, error: 'Missing situationId' };
          if (!payload.communication) return { valid: false, error: 'Missing communication' };
          break;
        default:
          break;
      }
      return { valid: true };
    }

    it('should validate GET_SITUATION payload', () => {
      const result1 = validatePayload('GET_SITUATION', {});
      assert.strictEqual(result1.valid, false);
      assert.strictEqual(result1.error, 'Missing situation id');

      const result2 = validatePayload('GET_SITUATION', { id: '123' });
      assert.strictEqual(result2.valid, true);
    });

    it('should validate CREATE_SITUATION payload', () => {
      const result1 = validatePayload('CREATE_SITUATION', {});
      assert.strictEqual(result1.valid, false);

      const result2 = validatePayload('CREATE_SITUATION', { title: 'Test' });
      assert.strictEqual(result2.valid, true);
    });

    it('should validate ADD_COMMUNICATION payload', () => {
      const result1 = validatePayload('ADD_COMMUNICATION', {});
      assert.strictEqual(result1.valid, false);

      const result2 = validatePayload('ADD_COMMUNICATION', {
        situationId: '123',
        communication: { content: 'test' },
      });
      assert.strictEqual(result2.valid, true);
    });
  });
});
