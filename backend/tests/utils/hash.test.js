'use strict';

const { computeEventHash } = require('../../src/utils/hash');

describe('computeEventHash', () => {
  const base = {
    batchId:   'batch_001',
    ownerId:   'rag_01',
    weightKg:  12,
    material:  'PET',
    timestamp: '2024-01-15T10:00:00.000Z',
  };

  // ─── CREATE ────────────────────────────────────────────────────────────────

  test('CREATE: returns a 64-char hex string', () => {
    const hash = computeEventHash({ ...base, eventType: 'CREATE' });
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  test('CREATE: is deterministic — same input produces same hash', () => {
    const h1 = computeEventHash({ ...base, eventType: 'CREATE' });
    const h2 = computeEventHash({ ...base, eventType: 'CREATE' });
    expect(h1).toBe(h2);
  });

  test('CREATE: different payloads produce different hashes', () => {
    const h1 = computeEventHash({ ...base, eventType: 'CREATE' });
    const h2 = computeEventHash({ ...base, eventType: 'CREATE', weightKg: 13 });
    expect(h1).not.toBe(h2);
  });

  // ─── TRANSFER ──────────────────────────────────────────────────────────────

  test('TRANSFER: chains correctly with previousHash', () => {
    const prevHash = computeEventHash({ ...base, eventType: 'CREATE' });
    const hash = computeEventHash({
      ...base,
      eventType: 'TRANSFER',
      previousHash: prevHash,
    });
    expect(hash).toHaveLength(64);
    expect(hash).not.toBe(prevHash);
  });

  test('TRANSFER: different previousHash produces different result', () => {
    const h1 = computeEventHash({ ...base, eventType: 'TRANSFER', previousHash: 'aaa' });
    const h2 = computeEventHash({ ...base, eventType: 'TRANSFER', previousHash: 'bbb' });
    expect(h1).not.toBe(h2);
  });

  test('TRANSFER: throws if previousHash is missing', () => {
    expect(() => computeEventHash({ ...base, eventType: 'TRANSFER' })).toThrow();
  });

  // ─── MERGE ─────────────────────────────────────────────────────────────────

  test('MERGE: produces hash from parent hashes', () => {
    const hash = computeEventHash({
      ...base,
      eventType: 'MERGE',
      parentHashes: ['hash_a', 'hash_b', 'hash_c'],
    });
    expect(hash).toHaveLength(64);
  });

  test('MERGE: is order-independent (sorted parent hashes)', () => {
    const h1 = computeEventHash({
      ...base, eventType: 'MERGE',
      parentHashes: ['hash_a', 'hash_b', 'hash_c'],
    });
    const h2 = computeEventHash({
      ...base, eventType: 'MERGE',
      parentHashes: ['hash_c', 'hash_a', 'hash_b'],
    });
    expect(h1).toBe(h2);
  });

  test('MERGE: throws if parentHashes is empty', () => {
    expect(() => computeEventHash({ ...base, eventType: 'MERGE', parentHashes: [] })).toThrow();
  });

  // ─── SPLIT ─────────────────────────────────────────────────────────────────

  test('SPLIT: produces hash from parent hashes', () => {
    const hash = computeEventHash({
      ...base,
      eventType: 'SPLIT',
      parentHashes: ['parent_hash_1'],
    });
    expect(hash).toHaveLength(64);
  });

  test('SPLIT: is order-independent', () => {
    const h1 = computeEventHash({ ...base, eventType: 'SPLIT', parentHashes: ['x', 'y'] });
    const h2 = computeEventHash({ ...base, eventType: 'SPLIT', parentHashes: ['y', 'x'] });
    expect(h1).toBe(h2);
  });

  // ─── VALIDATION ────────────────────────────────────────────────────────────

  test('throws if required fields are missing', () => {
    expect(() => computeEventHash({ eventType: 'CREATE' })).toThrow();
  });
});
