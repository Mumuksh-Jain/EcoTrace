'use strict';

const router = require('express').Router();
const pool   = require('../db/pool');

// GET /api/entities — list all entities, optionally filter by role
router.get('/', async (req, res, next) => {
  try {
    const { role } = req.query;
    const params     = [];
    const conditions = [];

    let query = 'SELECT * FROM entities';
    if (role) {
      params.push(role);
      conditions.push(`role = $${params.length}`);
    }
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY role, name';

    const result = await pool.query(query, params);
    res.json({ entities: result.rows, count: result.rows.length });
  } catch (err) {
    next(err);
  }
});

// GET /api/entities/:id — get single entity
router.get('/:id', async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT * FROM entities WHERE id = $1',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Entity not found' });
    }
    res.json({ entity: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
