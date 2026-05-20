'use strict';

const router  = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const pool    = require('../db/pool');
const { computeEventHash }     = require('../utils/hash');
const { computeConfidence }    = require('../utils/confidence');
const { validateConservation } = require('../utils/conservation');
const { detectCycle }          = require('../utils/cycle');

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

    const hash = computeEventHash({
      eventType: 'CREATE',
      batchId,
      ownerId:   owner_id,
      weightKg:  wKg,
      material,
      timestamp,
    });

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
      qr_data:    batchId,
      hash_proof: hash,
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/batches ──────────────────────────────────────────────────────
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

// ─── POST /api/batches/merge ───────────────────────────────────────────────
// MERGE: N parent batches → 1 child bale.
// MUST be registered before /:id routes to prevent 'merge' matching as an id.
//
// PRD Section 5.1 — MERGE algorithm:
//   1. Validate all parents owned by requester
//   2. Cycle detection
//   3. Material conservation (±0.1 kg)
//   4. Create child batch
//   5. Hash from sorted parent hashes (deterministic)
//   6. Insert N lineage_graph rows (transform = MERGE)
//   7. Return child + proof
router.post('/merge', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { owner_id, parent_batch_ids, weight_kg, material } = req.body;

    // ── Input validation ────────────────────────────────────────────────────
    if (!owner_id || !Array.isArray(parent_batch_ids) || parent_batch_ids.length < 2) {
      return res.status(400).json({ error: 'owner_id and parent_batch_ids (minimum 2) are required' });
    }
    if (weight_kg == null || !material) {
      return res.status(400).json({ error: 'weight_kg and material are required' });
    }

    const wKg = parseFloat(weight_kg);
    if (isNaN(wKg) || wKg <= 0) {
      return res.status(400).json({ error: 'weight_kg must be a positive number' });
    }

    // ── Step 1: Fetch and validate parent batches ───────────────────────────
    const parentsRes = await client.query(
      'SELECT * FROM batches WHERE id = ANY($1::text[])',
      [parent_batch_ids]
    );

    if (parentsRes.rows.length !== parent_batch_ids.length) {
      const found   = parentsRes.rows.map(r => r.id);
      const missing = parent_batch_ids.filter(id => !found.includes(id));
      return res.status(404).json({ error: `Batches not found: ${missing.join(', ')}` });
    }

    // All parents must be owned by the requester
    const notOwned = parentsRes.rows.filter(b => b.current_owner_id !== owner_id);
    if (notOwned.length > 0) {
      return res.status(403).json({
        error: `Batches not owned by "${owner_id}": ${notOwned.map(b => b.id).join(', ')}`,
      });
    }

    // All parents must share the same material as the requested child
    const wrongMaterial = parentsRes.rows.filter(b => b.material !== material);
    if (wrongMaterial.length > 0) {
      return res.status(400).json({
        error: `Material mismatch. Parent batches contain "${wrongMaterial[0].material}", expected "${material}"`,
      });
    }

    // ── Step 2: Cycle detection ─────────────────────────────────────────────
    // Child is a new UUID — not yet in lineage_graph. This check ensures the
    // DAG property holds even in complex multi-merge scenarios.
    const childId = uuidv4();
    const { hasCycle, reason: cycleReason } = await detectCycle(client, parent_batch_ids, childId);
    if (hasCycle) {
      return res.status(409).json({ error: cycleReason });
    }

    // ── Step 3: Material conservation (±0.1 kg) ────────────────────────────
    const parentWeights = parentsRes.rows.map(b => parseFloat(b.weight_kg));
    const { valid, reason: conservationReason } = validateConservation(
      'MERGE', parentWeights, [wKg]
    );
    if (!valid) {
      return res.status(400).json({ error: conservationReason });
    }

    // ── Steps 4-6: Create child, compute hash, write lineage ───────────────
    const timestamp   = new Date().toISOString();
    const parentHashes = parentsRes.rows.map(b => b.hash);

    // Hash derived from sorted parent hashes — deterministic regardless of insertion order
    const childHash = computeEventHash({
      eventType:   'MERGE',
      batchId:     childId,
      ownerId:     owner_id,
      weightKg:    wKg,
      material,
      timestamp,
      parentHashes,
    });

    // Confidence: floor of parent average (conservative — unverified bale)
    const avgConfidence = Math.floor(
      parentsRes.rows.reduce((sum, b) => sum + b.confidence_score, 0) / parentsRes.rows.length
    );

    await client.query('BEGIN');

    // Create the child bale
    const childRes = await client.query(
      `INSERT INTO batches
         (id, material, weight_kg, state, current_owner_id, confidence_score, hash, created_at)
       VALUES ($1, $2, $3, 'baled', $4, $5, $6, $7)
       RETURNING *`,
      [childId, material, wKg, owner_id, avgConfidence, childHash, timestamp]
    );

    // Insert one lineage_graph row per parent — this IS the innovation
    for (const parentId of parent_batch_ids) {
      await client.query(
        `INSERT INTO lineage_graph (parent_id, child_id, transform, created_at)
         VALUES ($1, $2, 'MERGE', $3)`,
        [parentId, childId, timestamp]
      );
    }

    await client.query('COMMIT');

    // ── Step 7: Return child + proof ───────────────────────────────────────
    res.status(201).json({
      batch: childRes.rows[0],
      merge_summary: {
        child_id:      childId,
        parent_count:  parent_batch_ids.length,
        parent_ids:    parent_batch_ids,
        weight_kg:     wKg,
        parent_total:  parentWeights.reduce((a, b) => a + b, 0),
        hash_proof:    childHash,
        parent_hashes: parentHashes,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
});

// ─── GET /api/batches/:id ──────────────────────────────────────────────────
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
router.post('/:id/transfer', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { id: batchId } = req.params;
    const { to_id, latitude, longitude, photo_hash } = req.body;

    if (!to_id) {
      return res.status(400).json({ error: 'to_id is required' });
    }

    const batchRes = await client.query(
      'SELECT * FROM batches WHERE id = $1 FOR UPDATE',
      [batchId]
    );
    if (batchRes.rows.length === 0) {
      return res.status(404).json({ error: 'Batch not found' });
    }
    const batch = batchRes.rows[0];

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

    const newHash = computeEventHash({
      eventType:    'TRANSFER',
      batchId,
      ownerId:      to_id,
      weightKg:     wKg,
      material:     batch.material,
      timestamp,
      previousHash: batch.hash,
    });

    const newConfidence = computeConfidence({
      hasPhoto:         !!photo_hash,
      hasGps:           !!(latitude && longitude),
      entityTrustScore: toEntity.trust_score,
      weightKg:         wKg,
      state:            batch.state,
    });

    await client.query('BEGIN');

    await client.query(
      `UPDATE batches
       SET current_owner_id = $1, hash = $2, confidence_score = $3
       WHERE id = $4`,
      [to_id, newHash, newConfidence, batchId]
    );

    const transferRes = await client.query(
      `INSERT INTO transfers
         (batch_id, from_id, to_id, latitude, longitude, photo_hash, event_hash, transferred_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [batchId, batch.current_owner_id, to_id,
       latitude || null, longitude || null, photo_hash || null, newHash, timestamp]
    );

    await client.query('COMMIT');

    res.json({
      transfer:        transferRes.rows[0],
      batch_id:        batchId,
      new_owner:       to_id,
      previous_owner:  batch.current_owner_id,
      confidence_score: newConfidence,
      hash_chain: { previous: batch.hash, current: newHash },
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
});

// ─── POST /api/batches/:id/split ──────────────────────────────────────────
// SPLIT: 1 parent batch → N child batches.
//
// PRD Section 5.1 — SPLIT algorithm:
//   1. Validate parent is owned by requester
//   2. Validate children cannot exceed parent weight (loss allowed, creation not)
//   3. Calculate processing loss and recovery rate
//   4. Create N child batches with hashes derived from parent hash
//   5. Insert N lineage_graph rows (transform = SPLIT)
router.post('/:id/split', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { id: parentId } = req.params;
    const { owner_id, children } = req.body;
    // children: [{ weight_kg, to_id? }]
    //   to_id defaults to owner_id if omitted (batch retained by same entity)

    if (!owner_id || !Array.isArray(children) || children.length < 1) {
      return res.status(400).json({ error: 'owner_id and children (minimum 1) are required' });
    }

    // ── Step 1: Fetch and validate parent ──────────────────────────────────
    const parentRes = await client.query(
      'SELECT * FROM batches WHERE id = $1 FOR UPDATE',
      [parentId]
    );
    if (parentRes.rows.length === 0) {
      return res.status(404).json({ error: 'Parent batch not found' });
    }
    const parent = parentRes.rows[0];

    if (parent.current_owner_id !== owner_id) {
      return res.status(403).json({
        error: `Batch "${parentId}" is not owned by "${owner_id}"`,
      });
    }

    if (parent.state === 'processed') {
      return res.status(409).json({ error: 'Batch has already been processed/split' });
    }

    // ── Step 2: Conservation check ─────────────────────────────────────────
    const childWeights = children.map(c => parseFloat(c.weight_kg));
    const { valid, reason: conservationReason, childTotal } = validateConservation(
      'SPLIT', [parseFloat(parent.weight_kg)], childWeights
    );
    if (!valid) {
      return res.status(400).json({ error: conservationReason });
    }

    // ── Step 3: Processing loss + recovery rate ────────────────────────────
    const parentWKg    = parseFloat(parent.weight_kg);
    const processingLoss = parseFloat((parentWKg - childTotal).toFixed(3));
    const recoveryRate   = parseFloat(((childTotal / parentWKg) * 100).toFixed(2));

    const timestamp = new Date().toISOString();

    await client.query('BEGIN');

    // Mark parent as processed — it has been physically split
    await client.query(
      `UPDATE batches SET state = 'processed' WHERE id = $1`,
      [parentId]
    );

    // ── Steps 4-5: Create children + lineage rows ──────────────────────────
    const createdChildren = [];

    for (const child of children) {
      const childId  = uuidv4();
      const childWKg = parseFloat(child.weight_kg);
      const toId     = child.to_id || owner_id;

      // Fetch receiver trust score for confidence
      const toRes = await client.query(
        'SELECT trust_score FROM entities WHERE id = $1', [toId]
      );
      const trustScore = toRes.rows.length > 0 ? toRes.rows[0].trust_score : 50;

      // Hash derived from parent hash — chain continues through the split
      const childHash = computeEventHash({
        eventType:    'SPLIT',
        batchId:      childId,
        ownerId:      toId,
        weightKg:     childWKg,
        material:     parent.material,
        timestamp,
        parentHashes: [parent.hash],
      });

      const childConfidence = computeConfidence({
        hasPhoto:         false,
        hasGps:           false,
        entityTrustScore: trustScore,
        weightKg:         childWKg,
        state:            'processed',
      });

      await client.query(
        `INSERT INTO batches
           (id, material, weight_kg, state, current_owner_id, confidence_score, hash, created_at)
         VALUES ($1, $2, $3, 'processed', $4, $5, $6, $7)`,
        [childId, parent.material, childWKg, toId, childConfidence, childHash, timestamp]
      );

      await client.query(
        `INSERT INTO lineage_graph (parent_id, child_id, transform, created_at)
         VALUES ($1, $2, 'SPLIT', $3)`,
        [parentId, childId, timestamp]
      );

      createdChildren.push({
        id:               childId,
        weight_kg:        childWKg,
        to_id:            toId,
        confidence_score: childConfidence,
        hash:             childHash,
      });
    }

    await client.query('COMMIT');

    res.status(201).json({
      split_summary: {
        parent_id:       parentId,
        parent_weight:   parentWKg,
        parent_hash:     parent.hash,
        child_count:     children.length,
        child_total:     childTotal,
        processing_loss: processingLoss,
        recovery_rate:   recoveryRate,
      },
      children: createdChildren,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
});

// ─── GET /api/batches/:id/transfers ───────────────────────────────────────
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
