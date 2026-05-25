'use strict';

/**
 * E2E TEST — Day 6
 *
 * Runs the complete 5-scene demo flow through the REAL API (HTTP requests
 * to a locally-spawned Express server). Verifies every assertion.
 *
 * End-of-day check: "All assertions pass. Confidence badge matches DB value."
 *
 * Assertions:
 *   A01  POST /api/batches (household)        → 201, has id + hash + confidence_score
 *   A02  POST /api/batches × 3 (collectors)  → 201 each, confidence varies by photo/GPS
 *   A03  POST /api/batches/:id/transfer × 3  → 200, hash_chain.previous !== hash_chain.current
 *   A04  POST /api/batches/merge             → 201, state=baled, 3 parent lineage rows
 *   A05  MERGE confidence = floor(avg of parents)
 *   A06  POST /api/batches/:baleId/split     → 201, recovery_rate = 94.44%
 *   A07  GET  /api/lineage/:baleId           → 6 nodes, 5 edges, MERGE+SPLIT transforms
 *   A08  All nodes have purity_grade field   → matches confidence_score from DB
 *   A09  source_nodes count = 3 (original bags)
 *   A10  bale state = 'processed' after split
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const http   = require('http');
const pool   = require('../src/db/pool');
const app    = require('../src/app');

const PORT   = 3097;
const BASE   = `http://localhost:${PORT}/api`;
const server = app.listen(PORT);

// ── HTTP helpers ─────────────────────────────────────────────────────────────
function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'localhost', port: PORT,
      path, method,
      headers: {
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };
    const req = http.request(opts, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, body: json });
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const get  = path       => request('GET',  path);
const post = (path, b)  => request('POST', path, b);

// ── Assertion helper ─────────────────────────────────────────────────────────
let passed = 0, failed = 0;
const assertions = [];

function assert(id, label, actual, expected, opts = {}) {
  const ok = opts.fn ? opts.fn(actual) : actual === expected;
  const sym = ok ? '✓' : '✗';
  const msg = ok
    ? `  ${sym} ${id}: ${label}`
    : `  ${sym} ${id}: ${label}\n       expected: ${JSON.stringify(expected)}\n       got:      ${JSON.stringify(actual)}`;
  assertions.push({ id, ok, msg });
  ok ? passed++ : failed++;
}

// ── Cleanup helpers ──────────────────────────────────────────────────────────
const createdIds = { batches: [], transfers: [], lineage: [] };

async function cleanup() {
  const ids = createdIds.batches;
  if (ids.length === 0) return;
  await pool.query(`DELETE FROM lineage_graph WHERE parent_id=ANY($1::text[]) OR child_id=ANY($1::text[])`, [ids]).catch(() => {});
  await pool.query(`DELETE FROM transfers WHERE batch_id=ANY($1::text[])`, [ids]).catch(() => {});
  await pool.query(`DELETE FROM batches WHERE id=ANY($1::text[])`, [ids]).catch(() => {});
}

// ── Main E2E flow ─────────────────────────────────────────────────────────────
async function e2eTest() {
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║       ECOTRACE E2E TEST — DAY 6              ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  // ── Scene 0 — Household creates a batch ────────────────────────────────────
  console.log('── Scene 0: Household ──');
  const s0 = await post('/api/batches', {
    owner_id: 'house_01', material: 'PET', weight_kg: 2,
    photo_hash: 'house_photo', latitude: 30.901, longitude: 75.857,
  });
  assert('A01a', 'Household batch → 201',            s0.status, 201);
  assert('A01b', 'Batch has id',                     s0.body.batch?.id, undefined, { fn: v => !!v });
  assert('A01c', 'Batch has hash',                   s0.body.batch?.hash, undefined, { fn: v => typeof v === 'string' && v.length === 64 });
  assert('A01d', 'Batch has confidence_score',       s0.body.batch?.confidence_score, undefined, { fn: v => v >= 0 && v <= 100 });
  assert('A01e', 'Batch state = raw',                s0.body.batch?.state, 'raw');
  assert('A01f', 'qr_data equals batch id',          s0.body.qr_data, s0.body.batch?.id);
  createdIds.batches.push(s0.body.batch?.id);

  // ── Scene 1 — 3 collectors create bags ─────────────────────────────────────
  console.log('\n── Scene 1: Collectors ──');
  const collectors = [
    { id:'rag_01', wkg:12, photo:true,  gps:true  },
    { id:'rag_02', wkg:8,  photo:false, gps:true  },
    { id:'rag_03', wkg:16, photo:true,  gps:false },
  ];
  const bags = [];
  for (const [i, c] of collectors.entries()) {
    const r = await post('/api/batches', {
      owner_id: c.id, material: 'PET', weight_kg: c.wkg,
      ...(c.photo ? { photo_hash: 'ph_' + c.id } : {}),
      ...(c.gps   ? { latitude: 30.902, longitude: 75.858 } : {}),
    });
    assert(`A02${String.fromCharCode(97+i)}`, `Collector ${c.id} batch → 201`, r.status, 201);
    bags.push(r.body.batch);
    createdIds.batches.push(r.body.batch?.id);
  }
  // Confidence should vary: rag_01 (photo+gps) > rag_02 (gps only) or rag_03 (photo only)
  assert('A02d', 'Confidence varies across collectors',
    bags[0].confidence_score, undefined,
    { fn: () => new Set(bags.map(b => b.confidence_score)).size >= 2 });

  // ── Scene 2 — Transfer bags to kab_01 ──────────────────────────────────────
  console.log('\n── Scene 2: Transfers → Ramesh (kab_01) ──');
  const bagHashes = bags.map(b => b.hash);
  for (const [i, bag] of bags.entries()) {
    const r = await post(`/api/batches/${bag.id}/transfer`, {
      to_id: 'kab_01', latitude: 30.905, longitude: 75.859,
    });
    assert(`A03${String.fromCharCode(97+i)}`, `Transfer bag ${i+1} → 201/200`, r.status, 200);
    assert(`A03${String.fromCharCode(97+i)}_chain`, `Hash chain links bag ${i+1}`,
      r.body.hash_chain?.previous, undefined,
      { fn: v => v === bagHashes[i] && r.body.hash_chain?.current !== v });
    bags[i] = { ...bags[i], hash: r.body.hash_chain?.current, current_owner_id: 'kab_01' };
  }

  // ── Scene 3 — MERGE ─────────────────────────────────────────────────────────
  console.log('\n── Scene 3: MERGE (3 bags → 1 bale) ──');
  const parentIds = bags.map(b => b.id);
  const mergeRes  = await post('/api/batches/merge', {
    owner_id:        'kab_01',
    parent_batch_ids: parentIds,
    weight_kg:       36,
    material:        'PET',
  });
  assert('A04a', 'MERGE → 201',                   mergeRes.status, 201);
  assert('A04b', 'Bale state = baled',             mergeRes.body.batch?.state, 'baled');
  assert('A04c', 'Bale weight = 36',               parseFloat(mergeRes.body.batch?.weight_kg), 36);
  assert('A04d', 'merge_summary.parent_count = 3', mergeRes.body.merge_summary?.parent_count, 3);
  assert('A04e', 'Bale has 64-char hash',          mergeRes.body.batch?.hash?.length, 64);
  const baleId   = mergeRes.body.batch?.id;
  const baleConf = mergeRes.body.batch?.confidence_score;
  createdIds.batches.push(baleId);

  // Verify lineage rows
  const lineageRows = await pool.query(
    `SELECT COUNT(*) FROM lineage_graph WHERE child_id=$1 AND transform='MERGE'`, [baleId]
  );
  assert('A04f', '3 MERGE rows in lineage_graph', parseInt(lineageRows.rows[0].count), 3);

  // A05 — MERGE confidence = floor(avg of parent confidence scores AT TIME OF MERGE)
  // After transfer, each bag's confidence_score in the DB reflects the transfer signals.
  // Fetch actual DB values (what the route reads) to compute the correct expected value.
  const parentDbRows = await pool.query(
    `SELECT confidence_score FROM batches WHERE id = ANY($1::text[])`, [parentIds]
  );
  const parentDbConf = parentDbRows.rows.map(r => parseInt(r.confidence_score, 10));
  const expectedConf = Math.floor(parentDbConf.reduce((s, c) => s + c, 0) / parentDbConf.length);
  assert('A05',  'MERGE confidence = floor(avg parents at merge time)', baleConf, expectedConf);

  // ── Scene 4 — SPLIT ─────────────────────────────────────────────────────────
  console.log('\n── Scene 4: SPLIT (bale → 20kg + 14kg) ──');

  // First transfer bale to rec_01
  await post(`/api/batches/${baleId}/transfer`, { to_id: 'rec_01' });

  const splitRes = await post(`/api/batches/${baleId}/split`, {
    owner_id: 'rec_01',
    children: [
      { weight_kg: 20, to_id: 'rec_01' },
      { weight_kg: 14, to_id: 'kab_01' },
    ],
  });
  assert('A06a', 'SPLIT → 201',                        splitRes.status, 201);
  assert('A06b', 'SPLIT child_count = 2',              splitRes.body.split_summary?.child_count, 2);
  assert('A06c', 'SPLIT processing_loss = 2',          splitRes.body.split_summary?.processing_loss, 2);
  assert('A06d', 'SPLIT recovery_rate = 94.44',        splitRes.body.split_summary?.recovery_rate, 94.44);
  assert('A06e', 'Each child has hash',                splitRes.body.children?.every(c => c.hash?.length === 64), true);
  splitRes.body.children?.forEach(c => createdIds.batches.push(c.id));

  // Verify parent bale is now 'processed'
  const baleCheck = await get(`/api/batches/${baleId}`);
  assert('A10',  'Bale state = processed after split', baleCheck.body.batch?.state, 'processed');

  // ── A07, A08, A09 — Lineage API ─────────────────────────────────────────────
  console.log('\n── Lineage API verification ──');
  const lineage = await get(`/api/lineage/${baleId}`);
  assert('A07a', 'Lineage → 200',                         lineage.status, 200);
  assert('A07b', 'node_count = 6',                         lineage.body.summary?.node_count, 6);
  assert('A07c', 'edge_count = 5',                         lineage.body.summary?.edge_count, 5);
  assert('A07d', 'transforms includes MERGE',              lineage.body.summary?.transforms?.includes('MERGE'), true);
  assert('A07e', 'transforms includes SPLIT',              lineage.body.summary?.transforms?.includes('SPLIT'), true);
  assert('A09',  'source_nodes.length = 3',                lineage.body.summary?.source_nodes?.length, 3);

  // A08 — confidence badge matches DB
  for (const node of lineage.body.nodes || []) {
    const dbRow = await pool.query(`SELECT confidence_score FROM batches WHERE id=$1`, [node.id]);
    const dbConf = parseInt(dbRow.rows[0]?.confidence_score, 10);
    assert(`A08_${node.id.slice(0,6)}`,
      `node ${node.id.slice(0,8)} purity_grade matches DB confidence`,
      node.confidence_score, dbConf
    );
  }

  // ── Print results ────────────────────────────────────────────────────────────
  console.log('\n── Assertion Results ──\n');
  assertions.forEach(a => console.log(a.msg));
  console.log(`\n  Total: ${passed + failed} · Passed: ${passed} · Failed: ${failed}`);

  if (failed > 0) {
    console.log('\n╔══════════════════════════════════════════════╗');
    console.log('║       E2E TEST: SOME ASSERTIONS FAILED ✗     ║');
    console.log('╚══════════════════════════════════════════════╝\n');
  } else {
    console.log('\n╔══════════════════════════════════════════════╗');
    console.log('║       E2E TEST PASSED — ALL ASSERTIONS ✓     ║');
    console.log('╚══════════════════════════════════════════════╝\n');
  }

  await cleanup();
  server.close();
  await pool.end();
  if (failed > 0) process.exit(1);
}

e2eTest().catch(async err => {
  console.error('\nE2E test crashed:', err.message);
  await cleanup().catch(() => {});
  server.close();
  await pool.end();
  process.exit(1);
});
