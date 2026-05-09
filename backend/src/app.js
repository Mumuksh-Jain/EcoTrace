'use strict';

require('dotenv').config();
const express = require('express');
const cors    = require('cors');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'ecotrace-backend', timestamp: new Date().toISOString() });
});

// Route placeholders (populated Day 2+)
app.use('/api/batches',   require('./routes/batches'));
app.use('/api/transfers', require('./routes/transfers'));
app.use('/api/lineage',   require('./routes/lineage'));

// 404 fallthrough
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Central error handler
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`EcoTrace backend listening on port ${PORT}`);
  });
}

module.exports = app;
