'use strict';

const { validateConservation } = require('../../src/utils/conservation');

describe('validateConservation', () => {

  // ─── MERGE ─────────────────────────────────────────────────────────────────

  describe('MERGE', () => {
    test('passes when child exactly equals parent sum', () => {
      const result = validateConservation('MERGE', [12, 8, 16], [36]);
      expect(result.valid).toBe(true);
      expect(result.parentTotal).toBe(36);
      expect(result.childTotal).toBe(36);
    });

    test('passes within 0.1 kg tolerance (child slightly less)', () => {
      const result = validateConservation('MERGE', [12, 8, 16], [35.95]);
      expect(result.valid).toBe(true);
    });

    test('passes within 0.1 kg tolerance (child slightly more)', () => {
      const result = validateConservation('MERGE', [12, 8, 16], [36.09]);
      expect(result.valid).toBe(true);
    });

    test('fails when delta exceeds 0.1 kg tolerance', () => {
      const result = validateConservation('MERGE', [12, 8, 16], [35]);
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/conservation violation/);
    });

    test('fails when child is heavier than parents beyond tolerance', () => {
      const result = validateConservation('MERGE', [10], [10.5]);
      expect(result.valid).toBe(false);
    });

    test('returns correct delta value', () => {
      const result = validateConservation('MERGE', [10, 10], [19]);
      expect(result.delta).toBeCloseTo(1, 5);
    });
  });

  // ─── SPLIT ─────────────────────────────────────────────────────────────────

  describe('SPLIT', () => {
    test('passes when child total is less than parent (loss allowed)', () => {
      const result = validateConservation('SPLIT', [36], [20, 14]);
      expect(result.valid).toBe(true);
      expect(result.parentTotal).toBe(36);
      expect(result.childTotal).toBe(34);
    });

    test('passes when child total equals parent exactly', () => {
      const result = validateConservation('SPLIT', [36], [20, 16]);
      expect(result.valid).toBe(true);
    });

    test('passes when child total equals parent within tolerance', () => {
      // 36.05 > 36 but within +0.1 tolerance
      const result = validateConservation('SPLIT', [36], [20, 16.05]);
      expect(result.valid).toBe(true);
    });

    test('fails when children exceed parent weight beyond tolerance', () => {
      const result = validateConservation('SPLIT', [36], [20, 17]);
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/material cannot be created/);
    });

    test('records processing loss (delta)', () => {
      const result = validateConservation('SPLIT', [36], [20, 14]);
      expect(result.delta).toBeCloseTo(2, 5);
    });
  });

  // ─── VALIDATION ────────────────────────────────────────────────────────────

  describe('input validation', () => {
    test('throws on unknown operation', () => {
      expect(() => validateConservation('PROCESS', [10], [10])).toThrow();
    });

    test('throws on empty parentWeights', () => {
      expect(() => validateConservation('MERGE', [], [10])).toThrow();
    });

    test('throws on empty childWeights', () => {
      expect(() => validateConservation('MERGE', [10], [])).toThrow();
    });
  });
});
