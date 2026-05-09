'use strict';

const router = require('express').Router();

// Stub — implemented Day 2
router.get('/', (_req, res) => {
  res.json({ message: 'Batches route — Day 2' });
});

module.exports = router;
