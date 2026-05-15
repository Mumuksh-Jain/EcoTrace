'use strict';

const router = require('express').Router();
const pool   = require('../db/pool');

// ─── GET /api/transfers ────────────────────────────────────────────────────
// List transfer events. Optional query param: batch_id
router.get('/', async (req, res, next) => {
  try {
    const { batch_id } = req.query;
    const params     = [];
    const conditions = [];

    let query = `
      SELECT t.*,
             ef.name AS from_name, ef.role AS from_role,
             et.name AS to_name,   et.role AS to_role
      FROM   transfers t
      LEFT JOIN entities ef ON t.from_id = ef.id
      JOIN       entities et ON t.to_id   = et.id
    `;

    if (batch_id) {
      params.push(batch_id);
      conditions.push(`t.batch_id = $${params.length}`);
    }
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY t.transferred_at DESC';

    const result = await pool.query(query, params);
    res.json({ transfers: result.rows, count: result.rows.length });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
