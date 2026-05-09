-- EcoTrace Schema
-- Five tables. Each serves a specific function. No redundancy.

-- All stakeholders
CREATE TABLE IF NOT EXISTS entities (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    role        TEXT NOT NULL CHECK (role IN ('Household', 'Collector', 'Aggregator', 'Recycler')),
    trust_score INTEGER NOT NULL DEFAULT 50,
    latitude    DECIMAL(9,6),
    longitude   DECIMAL(9,6)
);

-- Physical waste units
CREATE TABLE IF NOT EXISTS batches (
    id               TEXT PRIMARY KEY,
    material         TEXT NOT NULL CHECK (material IN ('PET', 'HDPE', 'LDPE', 'Mixed')),
    weight_kg        DECIMAL NOT NULL CHECK (weight_kg > 0),
    state            TEXT NOT NULL DEFAULT 'raw' CHECK (state IN ('raw', 'baled', 'processed')),
    current_owner_id TEXT NOT NULL REFERENCES entities(id),
    confidence_score INTEGER NOT NULL DEFAULT 50,
    hash             TEXT NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- THE core table: parent-child batch relationships for every transformation
CREATE TABLE IF NOT EXISTS lineage_graph (
    parent_id  TEXT NOT NULL REFERENCES batches(id),
    child_id   TEXT NOT NULL REFERENCES batches(id),
    transform  TEXT NOT NULL CHECK (transform IN ('MERGE', 'SPLIT', 'PROCESS')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (parent_id, child_id)
);

-- Custody events: every ownership change
CREATE TABLE IF NOT EXISTS transfers (
    id              SERIAL PRIMARY KEY,
    batch_id        TEXT NOT NULL REFERENCES batches(id),
    from_id         TEXT REFERENCES entities(id),
    to_id           TEXT NOT NULL REFERENCES entities(id),
    latitude        DECIMAL(9,6),
    longitude       DECIMAL(9,6),
    photo_hash      TEXT,
    event_hash      TEXT NOT NULL,
    transferred_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Downstream demand: recycler posts material requirements
CREATE TABLE IF NOT EXISTS demands (
    id              SERIAL PRIMARY KEY,
    recycler_id     TEXT NOT NULL REFERENCES entities(id),
    material        TEXT NOT NULL CHECK (material IN ('PET', 'HDPE', 'LDPE', 'Mixed')),
    quantity_kg     DECIMAL NOT NULL CHECK (quantity_kg > 0),
    min_confidence  INTEGER NOT NULL DEFAULT 60,
    radius_km       DECIMAL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
