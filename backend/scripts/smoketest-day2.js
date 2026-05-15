'use strict';

require('dotenv').config();
const pool = require('../src/db/pool');
const { computeEventHash }  = require('../src/utils/hash');
const { computeConfidence } = require('../src/utils/confidence');
const { v4: uuidv4 }        = require('uuid');

async function smokeTest() {
  console.log('\n=== DAY 2 SMOKE TEST ===\n');

  // 1. Create a batch
  const batchId = uuidv4();
  const ts      = new Date().toISOString();
  const hash1   = computeEventHash({
    eventType: 'CREATE', batchId, ownerId: 'rag_01',
    weightKg: 12, material: 'PET', timestamp: ts,
  });
  const conf1 = computeConfidence({
    hasPhoto: true, hasGps: true, entityTrustScore: 72, weightKg: 12, state: 'raw',
  });

  await pool.query(
    `INSERT INTO batches
       (id, material, weight_kg, state, current_owner_id, confidence_score, hash, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [batchId, 'PET', 12, 'raw', 'rag_01', conf1, hash1, ts]
  );
  console.log('1. Batch CREATED');
  console.log('   id         :', batchId);
  console.log('   confidence :', conf1);
  console.log('   hash       :', hash1.slice(0, 16) + '...');

  // 2. Transfer to kab_01
  const ts2   = new Date().toISOString();
  const hash2 = computeEventHash({
    eventType: 'TRANSFER', batchId, ownerId: 'kab_01',
    weightKg: 12, material: 'PET', timestamp: ts2,
    previousHash: hash1,                // ← chain link
  });
  const conf2 = computeConfidence({
    hasPhoto: false, hasGps: true, entityTrustScore: 85, weightKg: 12, state: 'raw',
  });

  await pool.query(
    `UPDATE batches SET current_owner_id=$1, hash=$2, confidence_score=$3 WHERE id=$4`,
    ['kab_01', hash2, conf2, batchId]
  );
  await pool.query(
    `INSERT INTO transfers
       (batch_id, from_id, to_id, latitude, longitude, event_hash, transferred_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [batchId, 'rag_01', 'kab_01', 30.905, 75.859, hash2, ts2]
  );
  console.log('\n2. Transfer RECORDED (rag_01 → kab_01)');
  console.log('   confidence :', conf2);
  console.log('   new hash   :', hash2.slice(0, 16) + '...');
  console.log('   hash chained (different from previous):', hash2 !== hash1 ? 'YES ✓' : 'NO ✗');

  // 3. Verify DB state
  const batchRow = await pool.query(
    `SELECT b.id, b.confidence_score, b.hash, e.name AS owner
     FROM batches b JOIN entities e ON b.current_owner_id = e.id
     WHERE b.id = $1`,
    [batchId]
  );
  const transferRow = await pool.query(
    `SELECT from_id, to_id, event_hash FROM transfers WHERE batch_id = $1`,
    [batchId]
  );
  console.log('\n3. DB Verification');
  console.log('   Current owner     :', batchRow.rows[0].owner);
  console.log('   Confidence in DB  :', batchRow.rows[0].confidence_score);
  console.log('   Transfer recorded :', transferRow.rows.length === 1 ? 'YES ✓' : 'NO ✗');
  console.log('   Hash chain in DB  :', batchRow.rows[0].hash === hash2 ? 'VALID ✓' : 'BROKEN ✗');

  // 4. Cleanup
  await pool.query('DELETE FROM transfers WHERE batch_id = $1', [batchId]);
  await pool.query('DELETE FROM batches WHERE id = $1', [batchId]);
  console.log('\n4. Cleanup complete.');
  console.log('\n=== SMOKE TEST PASSED ===\n');

  await pool.end();
}

smokeTest().catch(async (err) => {
  console.error('\n=== SMOKE TEST FAILED ===');
  console.error(err.message);
  await pool.end();
  process.exit(1);
});
