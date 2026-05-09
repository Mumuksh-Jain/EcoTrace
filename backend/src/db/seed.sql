-- EcoTrace Seed Data
-- Seven pre-seeded users covering all four PS2 chain stages.

INSERT INTO entities (id, name, role, trust_score, latitude, longitude) VALUES
    ('house_01', 'Sharma Household',  'Household',   60,  30.9010, 75.8573),
    ('rag_01',   'Priya',             'Collector',   72,  30.9020, 75.8580),
    ('rag_02',   'Ajay',              'Collector',   68,  30.9100, 75.8600),
    ('rag_03',   'Meena',             'Collector',   75,  30.8990, 75.8560),
    ('kab_01',   'Ramesh',            'Aggregator',  85,  30.9050, 75.8590),
    ('rec_01',   'EcoPolymers Ltd',   'Recycler',    90,  30.9200, 75.8700)
ON CONFLICT (id) DO NOTHING;
