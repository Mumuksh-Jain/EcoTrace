'use strict';

/**
 * Compute a confidence score (0–100) for a batch.
 *
 * Rule-based heuristic per PRD Section 5.3.
 * MVP heuristic for demonstration only — not a scientifically validated model.
 *
 * Scoring signals:
 *   Base (unverified)         : 50  — all batches start here
 *   Photo submitted           : +15 — visual evidence of material state exists
 *   GPS coordinates recorded  : +10 — transfer location is verifiable
 *   Entity trust score > 80   : +15 — known reliable actor in the network
 *   Weight in plausible range  : +10 — basic anomaly check
 *
 * Plausible weight ranges (calibrated for PET plastic MVP):
 *   Collector bag : 1–50 kg
 *   Bale          : 1–500 kg
 *   Processed     : 1–1000 kg
 *
 * @param {Object} signals
 * @param {boolean} signals.hasPhoto         - Whether a photo hash is present
 * @param {boolean} signals.hasGps           - Whether GPS coordinates were recorded
 * @param {number}  signals.entityTrustScore - Owner entity trust score (0–100)
 * @param {number}  signals.weightKg         - Batch weight in kg
 * @param {string}  [signals.state]          - Batch state: 'raw' | 'baled' | 'processed'
 * @returns {number} Confidence score clamped to [0, 100]
 */
function computeConfidence(signals) {
  const { hasPhoto, hasGps, entityTrustScore, weightKg, state = 'raw' } = signals;

  if (entityTrustScore == null || weightKg == null) {
    throw new Error('computeConfidence: entityTrustScore and weightKg are required');
  }

  let score = 50; // base

  if (hasPhoto) score += 15;
  if (hasGps)   score += 10;
  if (entityTrustScore > 80) score += 15;

  // Weight plausibility check
  const ranges = {
    raw:       { min: 1,   max: 50   },
    baled:     { min: 1,   max: 500  },
    processed: { min: 1,   max: 1000 },
  };
  const range = ranges[state] || ranges.raw;
  if (weightKg >= range.min && weightKg <= range.max) {
    score += 10;
  }

  return Math.min(100, Math.max(0, score));
}

module.exports = { computeConfidence };
