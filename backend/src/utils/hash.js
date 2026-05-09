'use strict';

const crypto = require('crypto');

/**
 * Compute a deterministic SHA256 event hash for a batch event.
 *
 * Hash construction per PRD Section 5.2:
 *   CREATE:   batch ID + owner + weight + material + timestamp
 *   TRANSFER: above fields + previousEventHash
 *   MERGE:    above fields + sorted array of parent hashes
 *   SPLIT:    above fields + sorted array of parent hashes
 *
 * Parent hashes are sorted before hashing — guaranteeing identical output
 * regardless of the order parents are processed.
 *
 * @param {Object} payload
 * @param {string} payload.eventType        - 'CREATE' | 'TRANSFER' | 'MERGE' | 'SPLIT'
 * @param {string} payload.batchId          - Unique batch identifier
 * @param {string} payload.ownerId          - Current owner entity ID
 * @param {number} payload.weightKg         - Batch weight in kg
 * @param {string} payload.material         - Material type
 * @param {string} payload.timestamp        - ISO 8601 timestamp string
 * @param {string} [payload.previousHash]   - Previous event hash (TRANSFER)
 * @param {string[]} [payload.parentHashes] - Sorted parent hashes (MERGE / SPLIT)
 * @returns {string} Hex-encoded SHA256 hash
 */
function computeEventHash(payload) {
  const { eventType, batchId, ownerId, weightKg, material, timestamp } = payload;

  if (!eventType || !batchId || !ownerId || weightKg == null || !material || !timestamp) {
    throw new Error('computeEventHash: missing required payload fields');
  }

  const canonical = {
    eventType,
    batchId,
    ownerId,
    weightKg,
    material,
    timestamp,
  };

  if (eventType === 'TRANSFER') {
    if (!payload.previousHash) {
      throw new Error('computeEventHash: TRANSFER requires previousHash');
    }
    canonical.previousHash = payload.previousHash;
  }

  if (eventType === 'MERGE' || eventType === 'SPLIT') {
    if (!Array.isArray(payload.parentHashes) || payload.parentHashes.length === 0) {
      throw new Error(`computeEventHash: ${eventType} requires a non-empty parentHashes array`);
    }
    // Sort parent hashes deterministically — identical output regardless of insertion order
    canonical.parentHashes = [...payload.parentHashes].sort();
  }

  const json = JSON.stringify(canonical);
  return crypto.createHash('sha256').update(json).digest('hex');
}

module.exports = { computeEventHash };
