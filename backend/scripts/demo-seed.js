'use strict';

/**
 * DEMO SEED — Day 6
 *
 * Seeds the complete 5-scene demo flow into Supabase.
 * Safe to re-run — clears previous demo data first.
 *
 * Output: prints the BALE ID and SPLIT CHILD IDs for the presenter to paste
 *         into the Trace page during the demo.
 *
 * Scenes:
 *   Scene 0 — Sharma Household logs 1 batch (house_01)
 *   Scene 1 — 3 collectors log bags (rag_01: 12kg, rag_02: 8kg, rag_03: 16kg)
 *   Scene 2 — All bags transferred to Ramesh (kab_01)
 *   Scene 3 — Ramesh merges 3 bags → 1 bale (36kg PET)
 *   Scene 4 — Bale split: 20kg → EcoPolymers (rec_01), 14kg retained (kab_01)
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const pool = require('../src/db/pool');
const { computeEventHash }     = require('../src/utils/hash');
const { computeConfidence }    = require('../src/utils/confidence');
const { v4: uuidv4 }           = require('uuid');

// Tag all demo batches so we can wipe cleanly on re-run
const DEMO_TAG = 'ECOTRACE_DEMO_V1';

async function clearPreviousDemo() {
  // Find all batches tagged as demo via a naming convention in material field isn't possible,
  // so we track by a known batch_id prefix stored in a simple metadata approach:
  // We store demo batch IDs in a local file, OR we just delete by created_at range.
  // Simplest: select batches whose hash starts with a seeded prefix? No —
  // Best: tag via the photo_hash column (it's nullable, no schema change needed)

  const tagged = await pool.query(
    `SELECT DISTINCT b.id FROM batches b WHERE b.hash IN (
       SELECT event_hash FROM transfers WHERE photo_hash = $1
     )
     UNION
     SELECT b.id FROM batches b WHERE b.id IN (
       SELECT batch_id FROM transfers WHERE photo_hash = $1
     )`,
    [DEMO_TAG]
  ).catch(() => ({ rows: [] }));

  // Safer: just clean up all lineage/transfers that reference demo batches
  // We'll use a marker in the photo_hash of transfers
  const markedTransfers = await pool.query(
    `SELECT batch_id FROM transfers WHERE photo_hash = $1`,
    [DEMO_TAG]
  ).catch(() => ({ rows: [] }));

  const demoIds = [...new Set(markedTransfers.rows.map(r => r.batch_id))];

  if (demoIds.length > 0) {
    // Walk lineage to find all connected batches
    const lineageRes = await pool.query(`
      WITH RECURSIVE all_connected AS (
        SELECT id FROM batches WHERE id = ANY($1::text[])
        UNION
        SELECT b.id FROM batches b
        JOIN lineage_graph lg ON lg.parent_id = b.id OR lg.child_id = b.id
        JOIN all_connected ac ON lg.parent_id = ac.id OR lg.child_id = ac.id
      )
      SELECT id FROM all_connected
    `, [demoIds]).catch(() => ({ rows: [] }));

    const allIds = [...new Set([...demoIds, ...lineageRes.rows.map(r => r.id)])];

    // Delete in order: lineage → transfers → batches
    await pool.query(`DELETE FROM lineage_graph WHERE parent_id = ANY($1::text[]) OR child_id = ANY($1::text[])`, [allIds]).catch(() => {});
    await pool.query(`DELETE FROM transfers WHERE batch_id = ANY($1::text[])`, [allIds]).catch(() => {});
    await pool.query(`DELETE FROM batches WHERE id = ANY($1::text[])`, [allIds]).catch(() => {});
    console.log(`  Cleared ${allIds.length} previous demo batch(es).`);
  }
}

async function seedDemo() {
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║         ECOTRACE DEMO SEED — DAY 6           ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  await clearPreviousDemo();

  const ts = new Date().toISOString();

  // ── Scene 0 — Household batch ─────────────────────────────────────────────
  console.log('Scene 0 — Sharma Household logs waste batch\n');
  const houseId = uuidv4();
  const houseH  = computeEventHash({ eventType:'CREATE', batchId:houseId, ownerId:'house_01', weightKg:2, material:'PET', timestamp:ts });
  const houseConf = computeConfidence({ hasPhoto:true, hasGps:true, entityTrustScore:60, weightKg:2, state:'raw' });
  await pool.query(
    `INSERT INTO batches (id,material,weight_kg,state,current_owner_id,confidence_score,hash,created_at) VALUES ($1,'PET',2,'raw','house_01',$2,$3,$4)`,
    [houseId, houseConf, houseH, ts]
  );
  console.log(`  Household batch: ${houseId}`);
  console.log(`  Weight: 2 kg · Confidence: ${houseConf}%\n`);

  // ── Scene 1 — Collectors log 3 bags ───────────────────────────────────────
  console.log('Scene 1 — Collectors log bags\n');
  const collectors = [
    { id:'rag_01', name:'Priya',  wkg:12, trust:72, photo:true,  gps:true  },
    { id:'rag_02', name:'Ajay',   wkg:8,  trust:68, photo:false, gps:true  },
    { id:'rag_03', name:'Meena',  wkg:16, trust:75, photo:true,  gps:false },
  ];
  const bags = [];
  for (const c of collectors) {
    const id   = uuidv4();
    const hash = computeEventHash({ eventType:'CREATE', batchId:id, ownerId:c.id, weightKg:c.wkg, material:'PET', timestamp:ts });
    const conf = computeConfidence({ hasPhoto:c.photo, hasGps:c.gps, entityTrustScore:c.trust, weightKg:c.wkg, state:'raw' });
    await pool.query(
      `INSERT INTO batches (id,material,weight_kg,state,current_owner_id,confidence_score,hash,created_at) VALUES ($1,'PET',$2,'raw',$3,$4,$5,$6)`,
      [id, c.wkg, c.id, conf, hash, ts]
    );
    bags.push({ id, wkg:c.wkg, hash, conf, owner:c.id, name:c.name });
    console.log(`  ${c.name} (${c.id}): ${c.wkg} kg · conf:${conf}% · photo:${c.photo ? '✓' : '✗'} gps:${c.gps ? '✓' : '✗'}`);
  }

  // ── Scene 2 — Transfer all bags to kab_01 ─────────────────────────────────
  console.log('\nScene 2 — Transfer bags to Ramesh (kab_01)\n');
  const kabRes = await pool.query(`SELECT trust_score FROM entities WHERE id='kab_01'`);
  const kabTrust = kabRes.rows[0].trust_score;

  for (const bag of bags) {
    const ts2   = new Date().toISOString();
    const newH  = computeEventHash({ eventType:'TRANSFER', batchId:bag.id, ownerId:'kab_01', weightKg:bag.wkg, material:'PET', timestamp:ts2, previousHash:bag.hash });
    const newConf = computeConfidence({ hasPhoto:false, hasGps:true, entityTrustScore:kabTrust, weightKg:bag.wkg, state:'raw' });
    await pool.query(`UPDATE batches SET current_owner_id='kab_01', hash=$1, confidence_score=$2 WHERE id=$3`, [newH, newConf, bag.id]);
    await pool.query(
      `INSERT INTO transfers (batch_id,from_id,to_id,latitude,longitude,photo_hash,event_hash,transferred_at) VALUES ($1,$2,'kab_01',30.905,75.859,$3,$4,$5)`,
      [bag.id, bag.owner, DEMO_TAG, newH, ts2]   // ← DEMO_TAG in photo_hash for cleanup
    );
    bag.hash = newH;
    console.log(`  ${bag.name} → Ramesh · hash:${newH.slice(0,12)}…`);
  }

  // ── Scene 3 — MERGE 3 bags → 1 bale ──────────────────────────────────────
  console.log('\nScene 3 — MERGE (12+8+16 = 36 kg bale)\n');
  const baleId   = uuidv4();
  const baleWkg  = 36;
  const baleH    = computeEventHash({
    eventType:'MERGE', batchId:baleId, ownerId:'kab_01',
    weightKg:baleWkg, material:'PET', timestamp:ts,
    parentHashes: bags.map(b => b.hash),
  });
  const baleConf = Math.floor(bags.reduce((s,b) => s + b.conf, 0) / bags.length);
  await pool.query(
    `INSERT INTO batches (id,material,weight_kg,state,current_owner_id,confidence_score,hash,created_at) VALUES ($1,'PET',$2,'baled','kab_01',$3,$4,$5)`,
    [baleId, baleWkg, baleConf, baleH, ts]
  );
  for (const bag of bags) {
    await pool.query(`INSERT INTO lineage_graph (parent_id,child_id,transform,created_at) VALUES ($1,$2,'MERGE',$3)`, [bag.id, baleId, ts]);
  }
  console.log(`  Bale ID:     ${baleId}`);
  console.log(`  Weight:      ${baleWkg} kg`);
  console.log(`  Confidence:  ${baleConf}%`);
  console.log(`  Parents:     ${bags.map(b => b.id.slice(0,8)).join(', ')}…`);

  // Transfer bale to rec_01 for split
  const ts3  = new Date().toISOString();
  const baleH2 = computeEventHash({ eventType:'TRANSFER', batchId:baleId, ownerId:'rec_01', weightKg:baleWkg, material:'PET', timestamp:ts3, previousHash:baleH });
  await pool.query(`UPDATE batches SET current_owner_id='rec_01', hash=$1 WHERE id=$2`, [baleH2, baleId]);
  await pool.query(
    `INSERT INTO transfers (batch_id,from_id,to_id,event_hash,transferred_at) VALUES ($1,'kab_01','rec_01',$2,$3)`,
    [baleId, baleH2, ts3]
  );

  // ── Scene 4 — SPLIT bale → 20kg + 14kg ──────────────────────────────────
  console.log('\nScene 4 — SPLIT (20 kg → rec_01, 14 kg retained, 2 kg processing loss)\n');
  await pool.query(`UPDATE batches SET state='processed' WHERE id=$1`, [baleId]);

  const splitTs  = new Date().toISOString();
  const portions = [
    { wkg:20, to:'rec_01', label:'EcoPolymers' },
    { wkg:14, to:'kab_01', label:'Ramesh (retained)' },
  ];
  const splitChildren = [];
  for (const p of portions) {
    const cid   = uuidv4();
    const toRes = await pool.query(`SELECT trust_score FROM entities WHERE id=$1`, [p.to]);
    const trust = toRes.rows[0].trust_score;
    const ch    = computeEventHash({ eventType:'SPLIT', batchId:cid, ownerId:p.to, weightKg:p.wkg, material:'PET', timestamp:splitTs, parentHashes:[baleH2] });
    const cc    = computeConfidence({ hasPhoto:false, hasGps:false, entityTrustScore:trust, weightKg:p.wkg, state:'processed' });
    await pool.query(
      `INSERT INTO batches (id,material,weight_kg,state,current_owner_id,confidence_score,hash,created_at) VALUES ($1,'PET',$2,'processed',$3,$4,$5,$6)`,
      [cid, p.wkg, p.to, cc, ch, splitTs]
    );
    await pool.query(`INSERT INTO lineage_graph (parent_id,child_id,transform,created_at) VALUES ($1,$2,'SPLIT',$3)`, [baleId, cid, splitTs]);
    splitChildren.push({ id:cid, wkg:p.wkg, label:p.label, conf:cc });
    console.log(`  Portion ${p.wkg}kg → ${p.label}: ${cid}`);
    console.log(`    Confidence: ${cc}%`);
  }
  console.log(`  Processing loss: ${baleWkg - portions.reduce((s,p) => s + p.wkg, 0)} kg`);
  console.log(`  Recovery rate:   ${((portions.reduce((s,p) => s + p.wkg, 0) / baleWkg) * 100).toFixed(1)}%`);

  // ── Verify lineage_graph ──────────────────────────────────────────────────
  const lineage = await pool.query(`
    SELECT transform, COUNT(*) AS cnt
    FROM lineage_graph
    WHERE child_id = $1 OR parent_id = $1
    GROUP BY transform
  `, [baleId]);
  console.log('\nlineage_graph for bale:');
  lineage.rows.forEach(r => console.log(`  ${r.transform}: ${r.cnt} edge(s)`));

  // ── Print demo cheat-sheet ────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║          DEMO CHEAT-SHEET                    ║');
  console.log('╚══════════════════════════════════════════════╝\n');
  console.log('  Paste into Trace page → http://localhost:5173/trace\n');
  console.log(`  BALE (key demo ID):`);
  console.log(`    ${baleId}\n`);
  console.log(`  Bag IDs (source nodes):`);
  bags.forEach((b,i) => console.log(`    Bag ${i+1} (${collectors[i].name}): ${b.id}`));
  console.log(`\n  Split portions:`);
  splitChildren.forEach(c => console.log(`    ${c.wkg}kg → ${c.label}: ${c.id}`));
  console.log(`\n  Household batch: ${houseId}`);
  console.log();

  await pool.end();
  console.log('✓ Demo seed complete.\n');
}

seedDemo().catch(async err => {
  console.error('\n✗ Demo seed FAILED:', err.message);
  await pool.end();
  process.exit(1);
});
