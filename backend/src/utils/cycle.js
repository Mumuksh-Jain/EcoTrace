'use strict';

const pool = require('../db/pool');

/**
 * Cycle detection for lineage_graph.
 *
 * Before any MERGE, checks whether the proposed child batch ID already
 * appears as an ancestor of any proposed parent batch.
 *
 * Uses a recursive CTE to walk the lineage_graph upward from each parent,
 * collecting all ancestor batch IDs, then checks if proposedChildId is among them.
 *
 * This prevents a batch from being made the child of a batch that itself
 * descends from it — maintaining the DAG property.
 *
 * @param {import('pg').Pool} dbPool
 * @param {string[]} parentBatchIds  - IDs of the proposed parent batches
 * @param {string}   proposedChildId - ID that would become the child batch
 * @returns {Promise<{ hasCycle: boolean, reason: string|null }>}
 */
async function detectCycle(dbPool, parentBatchIds, proposedChildId) {
  if (!parentBatchIds || parentBatchIds.length === 0) {
    return { hasCycle: false, reason: null };
  }

  // Recursive CTE: walk upward from each parent, gathering all ancestors.
  // If proposedChildId appears anywhere in that ancestor set, we have a cycle.
  const query = `
    WITH RECURSIVE ancestors AS (
      -- Base case: direct parents of the proposed parent batches
      SELECT parent_id AS batch_id
      FROM   lineage_graph
      WHERE  child_id = ANY($1::text[])

      UNION

      -- Recursive case: keep walking toward the roots
      SELECT lg.parent_id
      FROM   lineage_graph lg
      INNER JOIN ancestors a ON lg.child_id = a.batch_id
    )
    SELECT batch_id
    FROM   ancestors
    WHERE  batch_id = $2
    LIMIT  1
  `;

  const result = await dbPool.query(query, [parentBatchIds, proposedChildId]);

  if (result.rows.length > 0) {
    return {
      hasCycle: true,
      reason: `Cycle detected: batch "${proposedChildId}" already appears as an ancestor of one or more proposed parent batches`,
    };
  }

  return { hasCycle: false, reason: null };
}

module.exports = { detectCycle };
