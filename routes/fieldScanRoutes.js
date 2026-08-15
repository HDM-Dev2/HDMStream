const express = require('express');
const router = express.Router();
const fieldScanController = require('../controllers/fieldScanController');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);
router.get('/settings', fieldScanController.getSettings);

module.exports = router;