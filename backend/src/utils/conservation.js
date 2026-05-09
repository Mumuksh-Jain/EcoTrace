'use strict';

/**
 * Validate material conservation for MERGE and SPLIT operations.
 *
 * MERGE rule (PRD Section 5.1):
 *   Sum of parent weights must equal the child weight within ±0.1 kg tolerance.
 *
 * SPLIT rule (PRD Section 5.1):
 *   Sum of child weights must NOT exceed parent weight (loss is allowed;
 *   creation of material is not).
 *
 * @param {'MERGE'|'SPLIT'} operation
 * @param {number[]} parentWeights  - Array of parent batch weights (kg)
 * @param {number[]} childWeights   - Array of child batch weights (kg)
 * @returns {{ valid: boolean, reason: string|null, parentTotal: number, childTotal: number, delta: number }}
 */
function validateConservation(operation, parentWeights, childWeights) {
  if (!['MERGE', 'SPLIT'].includes(operation)) {
    throw new Error(`validateConservation: unknown operation "${operation}"`);
  }
  if (!Array.isArray(parentWeights) || parentWeights.length === 0) {
    throw new Error('validateConservation: parentWeights must be a non-empty array');
  }
  if (!Array.isArray(childWeights) || childWeights.length === 0) {
    throw new Error('validateConservation: childWeights must be a non-empty array');
  }

  const TOLERANCE_KG = 0.1;

  const parentTotal = parentWeights.reduce((sum, w) => sum + w, 0);
  const childTotal  = childWeights.reduce((sum, w) => sum + w, 0);
  const delta       = Math.abs(parentTotal - childTotal);

  if (operation === 'MERGE') {
    // Children must equal parents within tolerance
    if (delta > TOLERANCE_KG) {
      return {
        valid: false,
        reason: `MERGE conservation violation: parent total ${parentTotal.toFixed(3)} kg, child total ${childTotal.toFixed(3)} kg, delta ${delta.toFixed(3)} kg exceeds tolerance ${TOLERANCE_KG} kg`,
        parentTotal,
        childTotal,
        delta,
      };
    }
    return { valid: true, reason: null, parentTotal, childTotal, delta };
  }

  // SPLIT: child total must not exceed parent total (loss allowed)
  if (childTotal > parentTotal + TOLERANCE_KG) {
    return {
      valid: false,
      reason: `SPLIT conservation violation: child total ${childTotal.toFixed(3)} kg exceeds parent total ${parentTotal.toFixed(3)} kg — material cannot be created`,
      parentTotal,
      childTotal,
      delta,
    };
  }
  return { valid: true, reason: null, parentTotal, childTotal, delta };
}

module.exports = { validateConservation };
