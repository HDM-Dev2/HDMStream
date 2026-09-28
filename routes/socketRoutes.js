const express = require('express');
const router = express.Router();

// Get socket status
router.get('/status', (req, res) => {
  res.json({
    success: true,
    message: 'Socket server is running',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;