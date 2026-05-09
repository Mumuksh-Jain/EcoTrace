'use strict';

const { computeConfidence } = require('../../src/utils/confidence');

describe('computeConfidence', () => {

  // ─── BASE SCORE ────────────────────────────────────────────────────────────

  test('base score is 50 with no signals', () => {
    const score = computeConfidence({
      hasPhoto: false,
      hasGps: false,
      entityTrustScore: 50,
      weightKg: 12,
      state: 'raw',
    });
    // base 50 + weight in range +10 = 60
    expect(score).toBe(60);
  });

  test('unverified batch with out-of-range weight stays at 50', () => {
    const score = computeConfidence({
      hasPhoto: false,
      hasGps: false,
      entityTrustScore: 50,
      weightKg: 999, // out of range for 'raw'
      state: 'raw',
    });
    expect(score).toBe(50);
  });

  // ─── SIGNAL ACCUMULATION ───────────────────────────────────────────────────

  test('photo adds +15', () => {
    const score = computeConfidence({
      hasPhoto: true,
      hasGps: false,
      entityTrustScore: 50,
      weightKg: 999, // out of range so weight bonus = 0
      state: 'raw',
    });
    expect(score).toBe(65); // 50 + 15
  });

  test('GPS adds +10', () => {
    const score = computeConfidence({
      hasPhoto: false,
      hasGps: true,
      entityTrustScore: 50,
      weightKg: 999,
      state: 'raw',
    });
    expect(score).toBe(60); // 50 + 10
  });

  test('trust score > 80 adds +15', () => {
    const score = computeConfidence({
      hasPhoto: false,
      hasGps: false,
      entityTrustScore: 85,
      weightKg: 999,
      state: 'raw',
    });
    expect(score).toBe(65); // 50 + 15
  });

  test('trust score of exactly 80 does NOT add +15', () => {
    const score = computeConfidence({
      hasPhoto: false,
      hasGps: false,
      entityTrustScore: 80,
      weightKg: 999,
      state: 'raw',
    });
    expect(score).toBe(50); // no bonus
  });

  test('weight in plausible range adds +10', () => {
    const score = computeConfidence({
      hasPhoto: false,
      hasGps: false,
      entityTrustScore: 50,
      weightKg: 12, // in range for raw
      state: 'raw',
    });
    expect(score).toBe(60); // 50 + 10
  });

  // ─── DEMO SCENARIO: Priya bag (from PRD Scene 1 — 82% confidence) ──────────
  // PRD says: "Confidence score: 82%"
  // Priya trust_score=72 (≤80), has GPS from sync, has photo
  // 50 + 15(photo) + 10(gps) + 10(weight) = 85 — close to PRD example
  test('full signals produce high confidence score', () => {
    const score = computeConfidence({
      hasPhoto: true,
      hasGps: true,
      entityTrustScore: 85, // kab_01 trust
      weightKg: 36,         // bale weight
      state: 'baled',
    });
    expect(score).toBe(100); // 50+15+10+15+10 = 100
  });

  // ─── CLAMPING ──────────────────────────────────────────────────────────────

  test('score is clamped to 100 max', () => {
    const score = computeConfidence({
      hasPhoto: true,
      hasGps: true,
      entityTrustScore: 99,
      weightKg: 12,
      state: 'raw',
    });
    expect(score).toBeLessThanOrEqual(100);
  });

  test('score is never below 0', () => {
    const score = computeConfidence({
      hasPhoto: false,
      hasGps: false,
      entityTrustScore: 0,
      weightKg: 0.001, // out of range
      state: 'raw',
    });
    expect(score).toBeGreaterThanOrEqual(0);
  });

  // ─── STATE RANGES ──────────────────────────────────────────────────────────

  test('bale state accepts up to 500 kg', () => {
    const score = computeConfidence({
      hasPhoto: false,
      hasGps: false,
      entityTrustScore: 50,
      weightKg: 400,
      state: 'baled',
    });
    expect(score).toBe(60); // 50 + 10 weight bonus
  });

  test('bale state rejects weight > 500 kg', () => {
    const score = computeConfidence({
      hasPhoto: false,
      hasGps: false,
      entityTrustScore: 50,
      weightKg: 501,
      state: 'baled',
    });
    expect(score).toBe(50); // no weight bonus
  });

  // ─── VALIDATION ────────────────────────────────────────────────────────────

  test('throws if entityTrustScore is missing', () => {
    expect(() => computeConfidence({ hasPhoto: true, hasGps: true, weightKg: 12 })).toThrow();
  });

  test('throws if weightKg is missing', () => {
    expect(() => computeConfidence({ hasPhoto: true, hasGps: true, entityTrustScore: 70 })).toThrow();
  });
});
