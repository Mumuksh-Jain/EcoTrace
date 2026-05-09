# EcoTrace

> Material Provenance Infrastructure for Circular Economies

*"Every other system tracks items. EcoTrace tracks flows."*

## Overview

EcoTrace preserves the chain-of-custody of recyclable waste through physical aggregation and splitting — the transformation the entire informal recycling economy depends on, and that no existing system handles correctly.

## Repository Structure

```
greenhack/
├── backend/          # Express + PostgreSQL API
│   ├── src/
│   │   ├── app.js
│   │   ├── db/
│   │   │   ├── pool.js
│   │   │   ├── schema.sql
│   │   │   └── seed.sql
│   │   ├── routes/
│   │   │   ├── batches.js
│   │   │   ├── transfers.js
│   │   │   └── lineage.js
│   │   └── utils/
│   │       ├── hash.js
│   │       ├── conservation.js
│   │       └── confidence.js
│   └── tests/
│       └── utils/
│           ├── hash.test.js
│           ├── conservation.test.js
│           └── confidence.test.js
└── frontend/         # PWA (Day 5)
```

## Local Setup

```bash
# 1. Create the database
createdb ecotrace

# 2. Apply schema and seed
psql -d ecotrace -f backend/src/db/schema.sql
psql -d ecotrace -f backend/src/db/seed.sql

# 3. Install dependencies
cd backend && npm install

# 4. Configure environment
cp .env.example .env   # edit if needed

# 5. Start server
npm run dev

# 6. Run tests
npm test
```

## Build Plan

| Day | Focus |
|-----|-------|
| 1 | Schema, seed, hash utility, conservation, confidence, tests |
| 2 | Batch creation API, transfer API, cycle detection |
| 3 | MERGE engine, SPLIT engine, lineage_graph population |
| 4 | Recursive lineage query, DAG visualization |
| 5 | Role views, offline queue, PWA |
| 6 | Polish, confidence scores, processing loss |
| 7 | Deployment, README, demo video |
