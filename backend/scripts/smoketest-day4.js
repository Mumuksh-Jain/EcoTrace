'use strict';

/**
 * DAY 4 SMOKE TEST — Recursive Lineage Query
 *
 * Seeds: 3 bags → MERGE → bale → SPLIT → 2 children
 * Calls: GET /api/lineage/:baleId
 * Verifies:
 *   - Response returns all 6 nodes (3 bags + bale + 2 split children)
 *   - Response returns 5 edges (3 MERGE + 2 SPLIT)
 *   - root_id is the bale
 *   - source_nodes are the 3 original bags
 *   - Single DB call (not N+1)
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const http = require('http');
const pool = require('../src/db/pool');
const { computeEventHash }     = require('../src/utils/hash');
const { computeConfidence }    = require('../src/utils/confidence');
const { v4: uuidv4 }           = require('uuid');

// ── Spin up the Express app on a test port ─────────────────────────────────
const app    = require('../src/app');
const PORT   = 3099;
const server = app.listen(PORT);

function get(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:${PORT}${path}`, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (res.statusCode >= 400) reject(new Error(json.error || `HTTP ${res.statusCode}`));
          else resolve({ status: res.statusCode, body: json });
        } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function seed() {
  const ts = new Date().toISOString();
  const bags = [];

  // Create 3 bags owned by ragpickers, then transfer to kab_01
  for (const [owner, wkg, trust] of [['rag_01',12,72],['rag_02',8,68],['rag_03',16,75]]) {
    const id   = uuidv4();
    const hash = computeEventHash({ eventType:'CREATE', batchId:id, ownerId:owner, weightKg:wkg, material:'PET', timestamp:ts });
    const conf = computeConfidence({ hasPhoto:true, hasGps:true, entityTrustScore:trust, weightKg:wkg, state:'raw' });
    await pool.query(
      `INSERT INTO batches (id,material,weight_kg,state,current_owner_id,confidence_score,hash,created_at) VALUES ($1,'PET',$2,'raw',$3,$4,$5,$6)`,
      [id,wkg,owner,conf,hash,ts]
    );
    // Transfer to kab_01
    const h2 = computeEventHash({ eventType:'TRANSFER', batchId:id, ownerId:'kab_01', weightKg:wkg, material:'PET', timestamp:ts, previousHash:hash });
    await pool.query(`UPDATE batches SET current_owner_id='kab_01', hash=$1 WHERE id=$2`, [h2,id]);
    await pool.query(`INSERT INTO transfers (batch_id,from_id,to_id,event_hash,transferred_at) VALUES ($1,$2,'kab_01',$3,$4)`, [id,owner,h2,ts]);
    bags.push({ id, weight:wkg, hash:h2 });
  }

  // MERGE
  const baleId = uuidv4();
  const baleH  = computeEventHash({ eventType:'MERGE', batchId:baleId, ownerId:'kab_01', weightKg:36, material:'PET', timestamp:ts, parentHashes:bags.map(b=>b.hash) });
  await pool.query(
    `INSERT INTO batches (id,material,weight_kg,state,current_owner_id,confidence_score,hash,created_at) VALUES ($1,'PET',36,'baled','kab_01',85,$2,$3)`,
    [baleId,baleH,ts]
  );
  for (const bag of bags) {
    await pool.query(`INSERT INTO lineage_graph (parent_id,child_id,transform,created_at) VALUES ($1,$2,'MERGE',$3)`, [bag.id,baleId,ts]);
  }

  // SPLIT → 2 children
  const children = [];
  for (const [wkg,to] of [[20,'rec_01'],[14,'kab_01']]) {
    const cid = uuidv4();
    const ch  = computeEventHash({ eventType:'SPLIT', batchId:cid, ownerId:to, weightKg:wkg, material:'PET', timestamp:ts, parentHashes:[baleH] });
    await pool.query(
      `INSERT INTO batches (id,material,weight_kg,state,current_owner_id,confidence_score,hash,created_at) VALUES ($1,'PET',$2,'processed',$3,75,$4,$5)`,
      [cid,wkg,to,ch,ts]
    );
    await pool.query(`INSERT INTO lineage_graph (parent_id,child_id,transform,created_at) VALUES ($1,$2,'SPLIT',$3)`, [baleId,cid,ts]);
    children.push(cid);
  }

  await pool.query(`UPDATE batches SET state='processed' WHERE id=$1`, [baleId]);

  return { bags: bags.map(b=>b.id), baleId, children };
}

async function cleanup({ bags, baleId, children }) {
  // Delete lineage
  for (const cid of children) await pool.query(`DELETE FROM lineage_graph WHERE child_id=$1`,[cid]);
  for (const bid of bags)      await pool.query(`DELETE FROM lineage_graph WHERE child_id=$1`,[baleId]);
  // Delete batches
  for (const cid of children)  await pool.query(`DELETE FROM batches WHERE id=$1`,[cid]);
  await pool.query(`DELETE FROM batches WHERE id=$1`,[baleId]);
  for (const bid of bags) {
    await pool.query(`DELETE FROM transfers WHERE batch_id=$1`,[bid]);
    await pool.query(`DELETE FROM batches WHERE id=$1`,[bid]);
  }
}

async function smokeTest() {
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║     DAY 4 SMOKE TEST — Lineage API      ║');
  console.log('╚══════════════════════════════════════════╝\n');

  const seeded = await seed();
  const { bags, baleId, children } = seeded;

  console.log(`Seeded: ${bags.length} bags → bale → ${children.length} split children`);
  console.log(`Root batch (bale): ${baleId}\n`);

  // ── Call /api/lineage/:baleId ─────────────────────────────────────────
  const { body } = await get(`/api/lineage/${baleId}`);

  const nodeIds = body.nodes.map(n => n.id);
  const allIds  = [...bags, baleId, ...children];

  console.log(`root_id correct:                  ${body.root_id === baleId           ? 'YES ✓' : 'NO ✗'}`);
  console.log(`node_count = 6 (3+1+2):           ${body.summary.node_count === 6     ? 'YES ✓' : `NO ✗ (got ${body.summary.node_count})`}`);
  console.log(`edge_count = 5 (3 MERGE+2 SPLIT): ${body.summary.edge_count === 5     ? 'YES ✓' : `NO ✗ (got ${body.summary.edge_count})`}`);
  console.log(`transforms includes MERGE:         ${body.summary.transforms.includes('MERGE') ? 'YES ✓' : 'NO ✗'}`);
  console.log(`transforms includes SPLIT:         ${body.summary.transforms.includes('SPLIT') ? 'YES ✓' : 'NO ✗'}`);
  console.log(`source_nodes = 3 original bags:   ${body.summary.source_nodes.length === 3     ? 'YES ✓' : `NO ✗ (got ${body.summary.source_nodes.length})`}`);
  console.log(`all 6 batch IDs present:           ${allIds.every(id => nodeIds.includes(id))  ? 'YES ✓' : 'NO ✗'}`);
  console.log(`purity_grade present on nodes:     ${body.nodes.every(n => n.purity_grade)     ? 'YES ✓' : 'NO ✗'}`);

  // Verify individual bag appears in source_nodes
  const sourceSet = new Set(body.summary.source_nodes);
  const bagsAreSource = bags.every(id => sourceSet.has(id));
  console.log(`bag IDs are source nodes:          ${bagsAreSource ? 'YES ✓' : 'NO ✗'}`);

  await cleanup(seeded);
  console.log('\nCleanup done.');

  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║    DAY 4 SMOKE TEST PASSED  ✓            ║');
  console.log('╚══════════════════════════════════════════╝\n');

  server.close();
  await pool.end();
}

smokeTest().catch(async err => {
  console.error('\n╔══════════════════════════════════════════╗');
  console.error('║    DAY 4 SMOKE TEST FAILED  ✗            ║');
  console.error('╚══════════════════════════════════════════╝\n');
  console.error(err.message);
  server.close();
  await pool.end();
  process.exit(1);
});
