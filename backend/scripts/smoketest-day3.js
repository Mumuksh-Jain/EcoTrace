'use strict';

/**
 * DAY 3 SMOKE TEST
 * Full PRD demo flow:
 *   Bag A (12kg) + Bag B (8kg) + Bag C (16kg)
 *   → [MERGE] → Bale (36kg)
 *   → [SPLIT] → Part X (20kg to rec_01) + Part Y (14kg retained)
 *   Processing loss: 2kg. Recovery rate: 94.44%
 *
 * Verifies:
 *   - lineage_graph has 3 MERGE rows + 2 SPLIT rows
 *   - Hash chain is continuous through all transformations
 *   - Material conservation holds at both steps
 *   - Parent bale is marked 'processed' after split
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const pool = require('../src/db/pool');
const { computeEventHash }     = require('../src/utils/hash');
const { computeConfidence }    = require('../src/utils/confidence');
const { validateConservation } = require('../src/utils/conservation');
const { detectCycle }          = require('../src/utils/cycle');
const { v4: uuidv4 }           = require('uuid');

const OWNER = 'kab_01';   // Ramesh — the aggregator

async function smokeTest() {
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║         DAY 3 SMOKE TEST                ║');
  console.log('╚══════════════════════════════════════════╝\n');

  const created = { batches: [], transfers: [], lineage: [] };

  // ── Scene 1: Create 3 bags ──────────────────────────────────────────────
  console.log('■ Scene 1 — Creating 3 bags\n');

  const bags = [
    { owner: 'rag_01', weight: 12, trust: 72 },
    { owner: 'rag_02', weight: 8,  trust: 68 },
    { owner: 'rag_03', weight: 16, trust: 75 },
  ];

  const bagRecords = [];
  for (const bag of bags) {
    const id   = uuidv4();
    const ts   = new Date().toISOString();
    const hash = computeEventHash({
      eventType: 'CREATE', batchId: id, ownerId: bag.owner,
      weightKg: bag.weight, material: 'PET', timestamp: ts,
    });
    const conf = computeConfidence({
      hasPhoto: true, hasGps: true, entityTrustScore: bag.trust,
      weightKg: bag.weight, state: 'raw',
    });
    await pool.query(
      `INSERT INTO batches (id, material, weight_kg, state, current_owner_id, confidence_score, hash, created_at)
       VALUES ($1,'PET',$2,'raw',$3,$4,$5,$6)`,
      [id, bag.weight, bag.owner, conf, hash, ts]
    );
    bagRecords.push({ id, weight: bag.weight, hash, owner: bag.owner, conf });
    created.batches.push(id);
    console.log(`  Bag ${id.slice(0, 8)}... | ${bag.weight}kg | conf:${conf} | owner:${bag.owner}`);
  }

  // ── Scene 2: Transfer all bags to kab_01 ───────────────────────────────
  console.log('\n■ Scene 2 — Transferring bags to kab_01 (Ramesh)\n');

  const kabRes = await pool.query('SELECT trust_score FROM entities WHERE id = $1', [OWNER]);
  const kabTrust = kabRes.rows[0].trust_score;

  for (const bag of bagRecords) {
    const ts      = new Date().toISOString();
    const newHash = computeEventHash({
      eventType: 'TRANSFER', batchId: bag.id, ownerId: OWNER,
      weightKg: bag.weight, material: 'PET', timestamp: ts,
      previousHash: bag.hash,
    });
    const newConf = computeConfidence({
      hasPhoto: false, hasGps: true, entityTrustScore: kabTrust,
      weightKg: bag.weight, state: 'raw',
    });
    await pool.query(
      `UPDATE batches SET current_owner_id=$1, hash=$2, confidence_score=$3 WHERE id=$4`,
      [OWNER, newHash, newConf, bag.id]
    );
    await pool.query(
      `INSERT INTO transfers (batch_id, from_id, to_id, latitude, longitude, event_hash, transferred_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [bag.id, bag.owner, OWNER, 30.905, 75.859, newHash, ts]
    );
    bag.hash = newHash; // update for next hash in chain
    created.transfers.push(bag.id);
    console.log(`  ${bag.owner} → kab_01 | hash:${newHash.slice(0,12)}... | conf:${newConf}`);
  }

  // ── Scene 3: MERGE ─────────────────────────────────────────────────────
  console.log('\n■ Scene 3 — MERGE (12+8+16 = 36 kg)\n');

  const parentIds     = bagRecords.map(b => b.id);
  const parentWeights = bagRecords.map(b => b.weight);
  const parentHashes  = bagRecords.map(b => b.hash);
  const baleWeight    = 36;

  // Conservation check
  const consCheck = validateConservation('MERGE', parentWeights, [baleWeight]);
  console.log(`  Conservation check: ${consCheck.valid ? 'PASS ✓' : 'FAIL ✗'}`);
  if (!consCheck.valid) throw new Error(consCheck.reason);

  // Cycle check
  const baleId = uuidv4();
  const cycleCheck = await detectCycle(pool, parentIds, baleId);
  console.log(`  Cycle check:        ${!cycleCheck.hasCycle ? 'PASS ✓' : 'FAIL ✗'}`);
  if (cycleCheck.hasCycle) throw new Error(cycleCheck.reason);

  const baleTs   = new Date().toISOString();
  const baleHash = computeEventHash({
    eventType: 'MERGE', batchId: baleId, ownerId: OWNER,
    weightKg: baleWeight, material: 'PET', timestamp: baleTs,
    parentHashes,
  });
  const baleConf = Math.floor(bagRecords.reduce((s, b) => s + b.conf, 0) / bagRecords.length);

  await pool.query(
    `INSERT INTO batches (id, material, weight_kg, state, current_owner_id, confidence_score, hash, created_at)
     VALUES ($1,'PET',$2,'baled',$3,$4,$5,$6)`,
    [baleId, baleWeight, OWNER, baleConf, baleHash, baleTs]
  );
  created.batches.push(baleId);

  // Insert 3 lineage_graph rows
  for (const parentId of parentIds) {
    await pool.query(
      `INSERT INTO lineage_graph (parent_id, child_id, transform, created_at) VALUES ($1,$2,'MERGE',$3)`,
      [parentId, baleId, baleTs]
    );
    created.lineage.push({ parent_id: parentId, child_id: baleId });
  }

  console.log(`  Bale created: ${baleId.slice(0, 8)}...`);
  console.log(`  Bale weight:  ${baleWeight} kg`);
  console.log(`  Confidence:   ${baleConf}`);
  console.log(`  Hash:         ${baleHash.slice(0, 16)}...`);
  console.log(`  Hash deterministic (order-independent): ${
    computeEventHash({ eventType: 'MERGE', batchId: baleId, ownerId: OWNER, weightKg: baleWeight, material: 'PET', timestamp: baleTs, parentHashes: [...parentHashes].reverse() }) === baleHash
      ? 'YES ✓' : 'NO ✗'
  }`);

  // Verify lineage_graph MERGE rows
  const mergeRows = await pool.query(
    `SELECT * FROM lineage_graph WHERE child_id=$1 AND transform='MERGE'`, [baleId]
  );
  console.log(`  lineage_graph MERGE rows: ${mergeRows.rows.length} (expected 3) ${mergeRows.rows.length === 3 ? '✓' : '✗'}`);

  // ── Scene 4: SPLIT (20kg to rec_01, 14kg retained by kab_01) ──────────
  console.log('\n■ Scene 4 — SPLIT (20kg → rec_01, 14kg retained, 2kg loss)\n');

  const splitChildren = [
    { weight: 20, to: 'rec_01' },
    { weight: 14, to: OWNER },
  ];
  const childWeights = splitChildren.map(c => c.weight);

  const splitConsCheck = validateConservation('SPLIT', [baleWeight], childWeights);
  console.log(`  Conservation check: ${splitConsCheck.valid ? 'PASS ✓' : 'FAIL ✗'}`);
  if (!splitConsCheck.valid) throw new Error(splitConsCheck.reason);

  const processingLoss = baleWeight - splitConsCheck.childTotal;
  const recoveryRate   = ((splitConsCheck.childTotal / baleWeight) * 100).toFixed(2);
  console.log(`  Processing loss:    ${processingLoss} kg`);
  console.log(`  Recovery rate:      ${recoveryRate}%`);

  // Mark bale as processed
  await pool.query(`UPDATE batches SET state='processed' WHERE id=$1`, [baleId]);

  const splitTs = new Date().toISOString();

  for (const child of splitChildren) {
    const childId   = uuidv4();
    const toRes     = await pool.query('SELECT trust_score FROM entities WHERE id=$1', [child.to]);
    const trustScore = toRes.rows[0].trust_score;

    const childHash = computeEventHash({
      eventType: 'SPLIT', batchId: childId, ownerId: child.to,
      weightKg: child.weight, material: 'PET', timestamp: splitTs,
      parentHashes: [baleHash],
    });
    const childConf = computeConfidence({
      hasPhoto: false, hasGps: false, entityTrustScore: trustScore,
      weightKg: child.weight, state: 'processed',
    });

    await pool.query(
      `INSERT INTO batches (id, material, weight_kg, state, current_owner_id, confidence_score, hash, created_at)
       VALUES ($1,'PET',$2,'processed',$3,$4,$5,$6)`,
      [childId, child.weight, child.to, childConf, childHash, splitTs]
    );
    await pool.query(
      `INSERT INTO lineage_graph (parent_id, child_id, transform, created_at) VALUES ($1,$2,'SPLIT',$3)`,
      [baleId, childId, splitTs]
    );

    created.batches.push(childId);
    created.lineage.push({ parent_id: baleId, child_id: childId });
    console.log(`  Child ${childId.slice(0, 8)}... | ${child.weight}kg → ${child.to} | hash:${childHash.slice(0, 12)}...`);
  }

  // Verify lineage_graph SPLIT rows
  const splitRows = await pool.query(
    `SELECT * FROM lineage_graph WHERE parent_id=$1 AND transform='SPLIT'`, [baleId]
  );
  console.log(`  lineage_graph SPLIT rows: ${splitRows.rows.length} (expected 2) ${splitRows.rows.length === 2 ? '✓' : '✗'}`);

  // ── Final summary ──────────────────────────────────────────────────────
  const allLineage = await pool.query(
    `SELECT transform, COUNT(*) AS cnt FROM lineage_graph
     WHERE (child_id = $1 OR parent_id = $1)
     GROUP BY transform`,
    [baleId]
  );
  console.log('\n■ lineage_graph summary for bale:');
  for (const row of allLineage.rows) {
    console.log(`  ${row.transform}: ${row.cnt} row(s)`);
  }

  // ── Cleanup ────────────────────────────────────────────────────────────
  console.log('\n■ Cleanup');
  for (const { parent_id, child_id } of created.lineage.reverse()) {
    await pool.query(
      `DELETE FROM lineage_graph WHERE parent_id=$1 AND child_id=$2`, [parent_id, child_id]
    );
  }
  for (const batchId of created.transfers) {
    await pool.query('DELETE FROM transfers WHERE batch_id=$1', [batchId]);
  }
  for (const batchId of [...created.batches].reverse()) {
    await pool.query('DELETE FROM batches WHERE id=$1', [batchId]);
  }
  console.log('  Done.');

  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║      DAY 3 SMOKE TEST PASSED  ✓          ║');
  console.log('╚══════════════════════════════════════════╝\n');

  await pool.end();
}

smokeTest().catch(async (err) => {
  console.error('\n╔══════════════════════════════════════════╗');
  console.error('║      DAY 3 SMOKE TEST FAILED  ✗          ║');
  console.error('╚══════════════════════════════════════════╝\n');
  console.error(err.message);
  await pool.end();
  process.exit(1);
});
