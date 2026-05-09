# EcoTrace

> Material Provenance Infrastructure for Circular Economies

*"Every other system tracks items. EcoTrace tracks flows."*

## Overview

EcoTrace preserves the chain-of-custody of recyclable waste through physical aggregation and splitting — the transformation the entire informal recycling economy depends on, and that existing systems do not handle correctly.

EcoTrace models waste as a **material flow graph**, not a sequence of ownership transactions. Every MERGE and SPLIT is recorded. Full provenance from household to recycler is always queryable.

## Architecture

```
┌──────────────┐  ┌──────────────┐  ┌────────────────────┐  ┌───────────────────┐
│ Household PWA│→ │Collector PWA │→ │ Aggregator Dashboard│→ │ Recycler Dashboard│
└──────────────┘  └──────────────┘  └────────────────────┘  └───────────────────┘
                         ╔══════════════════════════════════════════╗
                         ║   Lineage Engine (PostgreSQL + Hash Chain) ║
                         ╚══════════════════════════════════════════╝
```

> Architecture diagram (draw.io/Excalidraw) → `docs/architecture.png` — committed by Day 6.

## Repository Structure

```
greenhack/
├── docs/                 # Architecture diagram (Day 6)
├── backend/              # Express + PostgreSQL API
│   ├── src/
│   │   ├── app.js
│   │   ├── db/
│   │   │   ├── pool.js
│   │   │   ├── schema.sql    # 5 tables: entities, batches, lineage_graph, transfers, demands
│   │   │   └── seed.sql      # 6 pre-seeded demo entities
│   │   ├── routes/
│   │   │   ├── batches.js
│   │   │   ├── transfers.js
│   │   │   └── lineage.js
│   │   └── utils/
│   │       ├── hash.js           # computeEventHash() — SHA256 tamper-evident chain
│   │       ├── conservation.js   # validateConservation() — MERGE/SPLIT weight rules
│   │       └── confidence.js     # computeConfidence() — data quality signal
│   └── tests/
│       └── utils/
│           ├── hash.test.js
│           ├── conservation.test.js
│           └── confidence.test.js
└── frontend/             # React PWA — Day 5
    │                     # Visualization: React Flow + dagre layout engine
```

## Local Setup

```bash
# 1. Create the database
createdb ecotrace

# 2. Apply schema and seed
psql -d ecotrace -f backend/src/db/schema.sql
psql -d ecotrace -f backend/src/db/seed.sql

# 3. Install dependencies
cd backend
npm install

# 4. Configure environment
cp .env.example .env   # edit DB credentials if needed

# 5. Start server
npm run dev            # http://localhost:3000/health

# 6. Run tests
npm test
```

## Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| API | Express + Node.js | Minimal overhead, fast to iterate |
| Database | PostgreSQL | Recursive CTEs for lineage traversal |
| Trust layer | SHA256 event hash chain | Tamper-evident, blockchain-compatible |
| Offline | localStorage request queue | Conflict-free, no sync engine |
| DAG visualization | React Flow + dagre | Deterministic layout, demo-safe |
| Blockchain | Not deployed in MVP | Hash chain gives identical guarantees |

## Demo Entities (Pre-Seeded)

| ID | Name | Role |
|---|---|---|
| house_01 | Sharma Household | Household |
| rag_01 | Priya | Collector |
| rag_02 | Ajay | Collector |
| rag_03 | Meena | Collector |
| kab_01 | Ramesh | Aggregator |
| rec_01 | EcoPolymers Ltd | Recycler |

## Build Plan

| Day | Focus | End-of-Day Check |
|---|---|---|
| 1 | Schema, seed, hash, conservation, confidence, tests | Backend boots. 40 tests pass. |
| 2 | Batch creation API, transfer API, cycle detection | Batches created. Hashes chain. |
| 3 | MERGE engine, SPLIT engine, lineage_graph | 3 bags → 1 bale. lineage_graph rows correct. |
| 4 | Recursive lineage query, React Flow DAG visualization | `/trace/bale_001` renders correct graph. |
| 5 | Role views (all 4 actors), offline queue, PWA | Full 5-scene demo flow works. |
| 6 | Polish, confidence scores, processing loss, architecture diagram | `docs/architecture.png` committed. |
| 7 | Production deployment, README, demo video | Live URL. Demo video uploaded. |
