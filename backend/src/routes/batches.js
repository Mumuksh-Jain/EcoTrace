'use strict';

const router  = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const pool    = require('../db/pool');
const { computeEventHash }  = require('../utils/hash');
const { computeConfidence } = require('../utils/confidence');

// ─── POST /api/batches ─────────────────────────────────────────────────────
// Create a new batch. Returns the batch record + a QR-encodable ID.
router.post('/', async (req, res, next) => {
  try {
    const { material, weight_kg, owner_id, photo_hash, latitude, longitude } = req.body;

    if (!material || weight_kg == null || !owner_id) {
      return res.status(400).json({ error: 'material, weight_kg, and owner_id are required' });
    }

    const allowed = ['PET', 'HDPE', 'LDPE', 'Mixed'];
    if (!allowed.includes(material)) {
      return res.status(400).json({ error: `material must be one of: ${allowed.join(', ')}` });
    }

    const wKg = parseFloat(weight_kg);
    if (isNaN(wKg) || wKg <= 0) {
      return res.status(400).json({ error: 'weight_kg must be a positive number' });
    }

    // Verify owner exists
    const ownerRes = await pool.query(
      'SELECT id, trust_score FROM entities WHERE id = $1',
      [owner_id]
    );
    if (ownerRes.rows.length === 0) {
      return res.status(404).json({ error: `Entity "${owner_id}" not found` });
    }
    const owner = ownerRes.rows[0];

    const batchId   = uuidv4();
    const timestamp = new Date().toISOString();

    // Compute CREATE hash
    const hash = computeEventHash({
      eventType: 'CREATE',
      batchId,
      ownerId:   owner_id,
      weightKg:  wKg,
      material,
      timestamp,
    });

    // Compute initial confidence score
    const confidenceScore = computeConfidence({
      hasPhoto:         !!photo_hash,
      hasGps:           !!(latitude && longitude),
      entityTrustScore: owner.trust_score,
      weightKg:         wKg,
      state:            'raw',
    });

    const result = await pool.query(
      `INSERT INTO batches
         (id, material, weight_kg, state, current_owner_id, confidence_score, hash, created_at)
       VALUES ($1, $2, $3, 'raw', $4, $5, $6, $7)
       RETURNING *`,
      [batchId, material, wKg, owner_id, confidenceScore, hash, timestamp]
    );

    res.status(201).json({
      batch:      result.rows[0],
      qr_data:    batchId,          // encode this into the QR sticker
      hash_proof: hash,
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/batches ──────────────────────────────────────────────────────
// List batches. Optional query params: owner_id, state
router.get('/', async (req, res, next) => {
  try {
    const { owner_id, state } = req.query;
    const params     = [];
    const conditions = [];

    let query = `
      SELECT b.*, e.name AS owner_name, e.role AS owner_role
      FROM   batches b
      JOIN   entities e ON b.current_owner_id = e.id
    `;

    if (owner_id) {
      params.push(owner_id);
      conditions.push(`b.current_owner_id = $${params.length}`);
    }
    if (state) {
      params.push(state);
      conditions.push(`b.state = $${params.length}`);
    }
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY b.created_at DESC';

    const result = await pool.query(query, params);
    res.json({ batches: result.rows, count: result.rows.length });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/batches/:id ──────────────────────────────────────────────────
// Get a single batch with its current owner info.
router.get('/:id', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT b.*, e.name AS owner_name, e.role AS owner_role
       FROM   batches b
       JOIN   entities e ON b.current_owner_id = e.id
       WHERE  b.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Batch not found' });
    }
    res.json({ batch: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/batches/:id/transfer ───────────────────────────────────────
// Transfer custody of a batch from its current owner to a new entity.
// Hash chain: new hash includes previousEventHash for tamper-evidence.
router.post('/:id/transfer', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { id: batchId } = req.params;
    const { to_id, latitude, longitude, photo_hash } = req.body;

    if (!to_id) {
      return res.status(400).json({ error: 'to_id is required' });
    }

    // Fetch current batch state
    const batchRes = await client.query(
      'SELECT * FROM batches WHERE id = $1 FOR UPDATE',
      [batchId]
    );
    if (batchRes.rows.length === 0) {
      return res.status(404).json({ error: 'Batch not found' });
    }
    const batch = batchRes.rows[0];

    // Fetch receiver entity
    const toRes = await client.query(
      'SELECT id, trust_score FROM entities WHERE id = $1',
      [to_id]
    );
    if (toRes.rows.length === 0) {
      return res.status(404).json({ error: `Entity "${to_id}" not found` });
    }
    const toEntity = toRes.rows[0];

    const timestamp = new Date().toISOString();
    const wKg       = parseFloat(batch.weight_kg);

    // Compute transfer hash — chains from previous batch hash (hash continuity)
    const newHash = computeEventHash({
      eventType:    'TRANSFER',
      batchId,
      ownerId:      to_id,
      weightKg:     wKg,
      material:     batch.material,
      timestamp,
      previousHash: batch.hash,           // ← chain link
    });

    // Recompute confidence with new signals
    const newConfidence = computeConfidence({
      hasPhoto:         !!photo_hash,
      hasGps:           !!(latitude && longitude),
      entityTrustScore: toEntity.trust_score,
      weightKg:         wKg,
      state:            batch.state,
    });

    await client.query('BEGIN');

    // 1. Update batch — new owner, new hash, new confidence
    await client.query(
      `UPDATE batches
       SET current_owner_id = $1,
           hash             = $2,
           confidence_score = $3
       WHERE id = $4`,
      [to_id, newHash, newConfidence, batchId]
    );

    // 2. Record the transfer event
    const transferRes = await client.query(
      `INSERT INTO transfers
         (batch_id, from_id, to_id, latitude, longitude, photo_hash, event_hash, transferred_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        batchId,
        batch.current_owner_id,
        to_id,
        latitude  || null,
        longitude || null,
        photo_hash || null,
        newHash,
        timestamp,
      ]
    );

    await client.query('COMMIT');

    res.json({
      transfer:       transferRes.rows[0],
      batch_id:       batchId,
      new_owner:      to_id,
      previous_owner: batch.current_owner_id,
      confidence_score: newConfidence,
      hash_chain: {
        previous: batch.hash,
        current:  newHash,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
});

// ─── GET /api/batches/:id/transfers ───────────────────────────────────────
// Full transfer history for a batch — ordered from first to latest.
router.get('/:id/transfers', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT t.*,
              ef.name AS from_name, ef.role AS from_role,
              et.name AS to_name,   et.role AS to_role
       FROM   transfers t
       LEFT JOIN entities ef ON t.from_id = ef.id
       JOIN       entities et ON t.to_id   = et.id
       WHERE  t.batch_id = $1
       ORDER  BY t.transferred_at ASC`,
      [req.params.id]
    );
    res.json({ transfers: result.rows, count: result.rows.length });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
