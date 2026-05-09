'use strict';

const router = require('express').Router();

// Stub — implemented Day 4
router.get('/', (_req, res) => {
  res.json({ message: 'Lineage route — Day 4' });
});

module.exports = router;
