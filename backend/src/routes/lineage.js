'use strict';

const router = require('express').Router();
const pool   = require('../db/pool');

// ─── GET /api/lineage/:id ──────────────────────────────────────────────────
// Recursive ancestry traversal — returns the complete provenance tree in a
// single database query. Returns every node and edge needed to render the
// full lineage DAG, from the requested batch ID back to all original sources.
//
// PRD Section 5.1 — TRACE:
//   A single recursive SQL query walks the lineage_graph from any batch ID
//   up through all ancestor generations. Returns every node and edge needed
//   to render the full provenance tree. One database call. No loops.
//
// Query structure:
//   Base case:  the requested batch itself
//   Recursion:  walk upward via lineage_graph (child → parent direction)
//   Result:     all nodes in the ancestry, plus edges between them
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    // Verify the requested batch exists first
    const exists = await pool.query('SELECT id FROM batches WHERE id = $1', [id]);
    if (exists.rows.length === 0) {
      return res.status(404).json({ error: `Batch "${id}" not found` });
    }

    // ── Single recursive CTE — walks toward parents (ancestors) ────────────
    // Also collects descendant nodes (children) so the full DAG is returned.
    const result = await pool.query(`
      WITH RECURSIVE

      -- Walk UPWARD: from the requested batch toward all ancestors
      ancestors AS (
        SELECT b.id, b.material, b.weight_kg, b.state,
               b.current_owner_id, b.confidence_score, b.hash,
               b.created_at,
               e.name   AS owner_name,
               e.role   AS owner_role,
               0        AS depth
        FROM   batches b
        JOIN   entities e ON b.current_owner_id = e.id
        WHERE  b.id = $1

        UNION ALL

        SELECT b.id, b.material, b.weight_kg, b.state,
               b.current_owner_id, b.confidence_score, b.hash,
               b.created_at,
               e.name   AS owner_name,
               e.role   AS owner_role,
               a.depth + 1
        FROM   lineage_graph lg
        JOIN   batches  b ON b.id = lg.parent_id
        JOIN   entities e ON e.id = b.current_owner_id
        JOIN   ancestors a ON a.id = lg.child_id
      ),

      -- Walk DOWNWARD: from the requested batch toward all descendants
      descendants AS (
        SELECT b.id, b.material, b.weight_kg, b.state,
               b.current_owner_id, b.confidence_score, b.hash,
               b.created_at,
               e.name   AS owner_name,
               e.role   AS owner_role,
               0        AS depth
        FROM   batches b
        JOIN   entities e ON b.current_owner_id = e.id
        WHERE  b.id = $1

        UNION ALL

        SELECT b.id, b.material, b.weight_kg, b.state,
               b.current_owner_id, b.confidence_score, b.hash,
               b.created_at,
               e.name   AS owner_name,
               e.role   AS owner_role,
               d.depth - 1
        FROM   lineage_graph lg
        JOIN   batches     b ON b.id = lg.child_id
        JOIN   entities    e ON e.id = b.current_owner_id
        JOIN   descendants d ON d.id = lg.parent_id
      ),

      -- Union of all nodes in the DAG (deduplicated by id)
      all_nodes AS (
        SELECT * FROM ancestors
        UNION
        SELECT * FROM descendants
      )

      SELECT DISTINCT ON (id)
             id, material, weight_kg, state,
             current_owner_id, confidence_score, hash,
             created_at, owner_name, owner_role, depth
      FROM   all_nodes
      ORDER  BY id, depth
    `, [id]);

    // ── Fetch all edges that connect nodes in this DAG ─────────────────────
    const nodeIds = result.rows.map(r => r.id);
    const edges   = await pool.query(`
      SELECT lg.parent_id, lg.child_id, lg.transform, lg.created_at
      FROM   lineage_graph lg
      WHERE  lg.parent_id = ANY($1::text[])
        AND  lg.child_id  = ANY($1::text[])
      ORDER  BY lg.created_at ASC
    `, [nodeIds]);

    // ── Build purity grade ─────────────────────────────────────────────────
    const withGrade = result.rows.map(node => ({
      ...node,
      weight_kg:        parseFloat(node.weight_kg),
      confidence_score: parseInt(node.confidence_score, 10),
      purity_grade:     confidenceToGrade(parseInt(node.confidence_score, 10)),
    }));

    res.json({
      root_id: id,
      nodes:   withGrade,
      edges:   edges.rows,
      summary: {
        node_count:   withGrade.length,
        edge_count:   edges.rows.length,
        transforms:   [...new Set(edges.rows.map(e => e.transform))],
        source_nodes: withGrade.filter(n => !edges.rows.some(e => e.child_id === n.id)).map(n => n.id),
      },
    });
  } catch (err) {
    next(err);
  }
});

// A/B/C purity grade from confidence score (PRD §6.2 — always include)
function confidenceToGrade(score) {
  if (score >= 80) return 'A';
  if (score >= 60) return 'B';
  return 'C';
}

module.exports = router;
